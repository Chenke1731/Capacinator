/**
 * IntakeService —— 需求收件箱捕获/查询/维护（I01，2026-11-10 设计稿 §4.1/§4.4）。
 *
 * 捕获语义（设计定死，不再另行解释）：
 * - 只需标题 + 来源；类型/子类型/优先级/负责人全部后置到分流。
 * - source_ref 整串匹配 ^(SR|AR)[-_ ]?\d+$ 时归一大写；URL 等其他值原样。
 * - 日期仅接受显式 ISO（YYYY-MM-DD）；不推断、不造日期。
 * - 同 (source_channel, source_ref) 且 status≠rejected 唯一（DB 部分唯一
 *   索引兜底，本服务前置查询给友好 409）；同标题只警告不阻塞。
 * - 批量：先整体硬校验（任一硬错误整批 400 零插入），重复项进 skipped。
 *
 * 时间戳一律 ISO 字符串（dateText 教训：Date 对象落成毫秒文本，字符串
 * 比较失配）。db 由构造器注入（集成测试直传测试库）。
 */
import {
  INTAKE_SOURCE_CHANNELS,
  type IntakeSourceChannel,
  type DemandIntake,
  type IntakeCaptureInput,
} from '../../../../shared/types/intake.js';

/** 业务错误（statusCode 直映射 HTTP；code 供客户端精确分支） */
export class IntakeError extends Error {
  constructor(
    message: string,
    readonly statusCode: number = 400,
    readonly code: string = 'validation_error',
    readonly existingId?: string
  ) {
    super(message);
    this.name = 'IntakeError';
  }
}

const MAX_TITLE = 255;
const MAX_SOURCE_REF = 500;
const MAX_REQUESTER = 255;
const MAX_REASON = 500;
const BATCH_MAX = 200;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const SOURCE_CHANNEL_SET = new Set<string>(INTAKE_SOURCE_CHANNELS);
const STATUS_SET = new Set(['new', 'converted', 'rejected']);

const nowIso = (): string => new Date().toISOString();

/** 整串 SR/AR → 归一大写；其余 trim 原样（URL 不吃掉编号语义） */
export function normalizeSourceRef(raw: unknown): string | null {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) return null;
  const m = /^(SR|AR)[-_ ]?(\d+)$/i.exec(s);
  if (m) return `${m[1].toUpperCase()}${m[2]}`;
  return s.slice(0, MAX_SOURCE_REF);
}

/** 从任意位置提取 SR/AR 编号（转换时填 projects.external_number 用） */
export function extractExternalNumber(raw: unknown): string | null {
  const s = typeof raw === 'string' ? raw : '';
  const m = /(SR|AR)[-_ ]?(\d+)/i.exec(s);
  if (!m) return null;
  return `${m[1].toUpperCase()}${m[2]}`;
}

export interface IntakeListFilters {
  status?: string;
  source_channel?: string;
  q?: string;
  page?: number;
  limit?: number;
  sort?: 'oldest' | 'newest';
}

export interface IntakeCounts {
  new: number;
  converted: number;
  rejected: number;
  by_source: Record<string, number>;
}

export interface CaptureRow {
  title: string;
  raw_text: string | null;
  source_channel: IntakeSourceChannel;
  source_ref: string | null;
  requester: string | null;
  priority_hint: number | null;
  expected_start: string | null;
  expected_finish: string | null;
  note: string | null;
}

export class IntakeService {
  constructor(private db: any) {}

  // ── 捕获 ─────────────────────────────────────────────────────────

  /** 单条捕获；标题重复不阻塞，作为 warnings 返回 */
  async capture(
    input: IntakeCaptureInput,
    actorId?: string | null
  ): Promise<{ intake: DemandIntake; warnings: { type: string; existing_id: string }[] }> {
    const row = this.toRow(input);
    const duplicate = await this.findDuplicate(row.source_channel, row.source_ref);
    if (duplicate) {
      throw new IntakeError(
        `Source ref "${row.source_ref}" already captured (${duplicate.status})`,
        409,
        'duplicate_source_ref',
        duplicate.id
      );
    }
    const intake = await this.insertRow(row, actorId);
    const warnings = await this.titleWarning(row.title, intake.id);
    return { intake, warnings };
  }

  /** 批量捕获：硬校验全过才插入；重复（批内/库内）进 skipped */
  async captureBatch(
    items: IntakeCaptureInput[],
    actorId?: string | null
  ): Promise<{ created: DemandIntake[]; skipped: { index: number; reason: string; existing_id?: string }[] }> {
    if (!Array.isArray(items) || items.length === 0) {
      throw new IntakeError('items must be a non-empty array', 400, 'validation_error');
    }
    if (items.length > BATCH_MAX) {
      throw new IntakeError(`Batch limited to ${BATCH_MAX} items`, 400, 'batch_too_large');
    }
    // 硬校验先行（任一失败整批 400，零插入）
    const rows = items.map((item) => this.toRow(item));

    const skipped: { index: number; reason: string; existing_id?: string }[] = [];
    const pending: { row: CaptureRow; index: number }[] = [];
    const seenInBatch = new Set<string>();
    rows.forEach((row, index) => {
      const key = row.source_ref ? `${row.source_channel}|${row.source_ref}` : '';
      if (key && seenInBatch.has(key)) {
        skipped.push({ index, reason: 'duplicate_source_ref' });
        return;
      }
      if (key) seenInBatch.add(key);
      pending.push({ row, index });
    });

    // 库内重复同样跳过（不阻塞其余）
    const toInsert: { row: CaptureRow; index: number }[] = [];
    for (const { row, index } of pending) {
      const duplicate = await this.findDuplicate(row.source_channel, row.source_ref);
      if (duplicate) {
        skipped.push({ index, reason: 'duplicate_source_ref', existing_id: duplicate.id });
        continue;
      }
      toInsert.push({ row, index });
    }

    const created: DemandIntake[] = [];
    if (toInsert.length > 0) {
      await this.db.transaction(async (trx: any) => {
        for (const { row, index } of toInsert) {
          try {
            created.push(await this.insertRow(row, actorId, trx));
          } catch (error) {
            // 复评：预检后、插入前的并发重复——按"跳过该条"语义处理（与预检
            // 一致，不整批回滚）；错误路径已用 trx 连接，不会占线死锁
            if (error instanceof IntakeError && error.code === 'duplicate_source_ref') {
              skipped.push({ index, reason: 'duplicate_source_ref', existing_id: error.existingId });
              continue;
            }
            throw error;
          }
        }
      });
    }
    // 预检跳过与并发跳过统一按原始行号排序（响应稳定）
    skipped.sort((a, b) => a.index - b.index);
    return { created, skipped };
  }

  // ── 查询 ─────────────────────────────────────────────────────────

  async list(
    filters: IntakeListFilters
  ): Promise<{ rows: DemandIntake[]; total: number; page: number; limit: number }> {
    if (filters.status !== undefined && !STATUS_SET.has(filters.status)) {
      throw new IntakeError(`Invalid status "${filters.status}"`, 400, 'validation_error');
    }
    const status = filters.status ?? 'new';
    const page = Math.max(Number(filters.page) || 1, 1);
    const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);

    let query = this.db('demand_intake').where('status', status);
    if (filters.source_channel !== undefined && filters.source_channel !== '') {
      if (!SOURCE_CHANNEL_SET.has(filters.source_channel)) {
        throw new IntakeError(`Invalid source_channel "${filters.source_channel}"`, 400, 'validation_error');
      }
      query = query.where('source_channel', filters.source_channel);
    }
    if (filters.q && filters.q.trim()) {
      const like = `%${filters.q.trim()}%`;
      query = query.where((b: any) =>
        b.where('title', 'like', like)
          .orWhere('source_ref', 'like', like)
          .orWhere('requester', 'like', like)
      );
    }

    const [{ count }] = await query.clone().count('* as count');
    const rows = await query
      .clone()
      .orderBy('created_at', filters.sort === 'newest' ? 'desc' : 'asc')
      .offset((page - 1) * limit)
      .limit(limit);
    return { rows, total: Number(count), page, limit };
  }

  async counts(): Promise<IntakeCounts> {
    const rows = await this.db('demand_intake').select('status', 'source_channel');
    const result: IntakeCounts = { new: 0, converted: 0, rejected: 0, by_source: {} };
    for (const r of rows) {
      const st = String(r.status) as 'new' | 'converted' | 'rejected';
      if (st === 'new' || st === 'converted' || st === 'rejected') {
        result[st] += 1;
      }
      if (st === 'new') {
        const ch = String(r.source_channel);
        result.by_source[ch] = (result.by_source[ch] ?? 0) + 1;
      }
    }
    return result;
  }

  async get(id: string): Promise<DemandIntake> {
    const row = await this.db('demand_intake').where('id', id).first();
    if (!row) throw new IntakeError('Intake not found', 404, 'not_found');
    return row;
  }

  // ── 维护 ─────────────────────────────────────────────────────────

  /** 仅 new 可编辑；status/converted_project_id/created_by/created_at 不可改 */
  async update(id: string, patch: Record<string, unknown>): Promise<DemandIntake> {
    const current = await this.get(id);
    if (current.status !== 'new') {
      throw new IntakeError(`Intake is ${current.status} and no longer editable`, 409, 'invalid_status');
    }
    const next: Record<string, unknown> = {};
    if ('title' in patch) next.title = this.normalizeTitle(patch.title);
    if ('raw_text' in patch) next.raw_text = this.textOrNull(patch.raw_text);
    if ('source_channel' in patch) next.source_channel = this.normalizeChannel(patch.source_channel);
    if ('source_ref' in patch) next.source_ref = normalizeSourceRef(patch.source_ref);
    if ('requester' in patch) next.requester = this.textOrNull(patch.requester, MAX_REQUESTER);
    if ('priority_hint' in patch) next.priority_hint = this.normalizePriorityHint(patch.priority_hint);
    if ('expected_start' in patch) next.expected_start = this.isoOrNull(patch.expected_start);
    if ('expected_finish' in patch) next.expected_finish = this.isoOrNull(patch.expected_finish);
    if ('note' in patch) next.note = this.textOrNull(patch.note);

    if (Object.keys(next).length === 0) return current;

    // 叠加校验：日期组合以更新后的全集判断
    const start = (next.expected_start !== undefined ? next.expected_start : current.expected_start) as string | null;
    const finish = (next.expected_finish !== undefined ? next.expected_finish : current.expected_finish) as string | null;
    this.validateDatePair(start, finish);

    // source_ref 变更需重查唯一
    const channel = (next.source_channel !== undefined ? next.source_channel : current.source_channel) as string;
    const ref = (next.source_ref !== undefined ? next.source_ref : current.source_ref) as string | null;
    if (ref && (ref !== current.source_ref || channel !== current.source_channel)) {
      const duplicate = await this.findDuplicate(channel, ref);
      if (duplicate && duplicate.id !== id) {
        throw new IntakeError(`Source ref "${ref}" already captured`, 409, 'duplicate_source_ref', duplicate.id);
      }
    }

    next.updated_at = nowIso();
    // I01y/#3：条件写入防 TOCTOU（与 reject/remove 同型）——检查与写入之间
    // 并发 convert 即会改写 converted 留档，来源记录与生成项目脱节
    let changed: number;
    try {
      changed = await this.db('demand_intake').where({ id, status: 'new' }).update(next);
    } catch (error) {
      if (this.isDuplicateSourceRefError(error)) {
        const dupChannel = String(next.source_channel ?? current.source_channel);
        const dupRef = (next.source_ref !== undefined ? next.source_ref : current.source_ref) as string | null;
        const existing = dupRef ? await this.findDuplicate(dupChannel, dupRef) : null;
        throw new IntakeError('Source ref already captured', 409, 'duplicate_source_ref', existing?.id ?? undefined);
      }
      throw error;
    }
    if (changed === 0) {
      const row = await this.db('demand_intake').where('id', id).first();
      if (!row) throw new IntakeError('Intake not found', 404, 'not_found');
      throw new IntakeError(`Intake is ${row.status} and no longer editable`, 409, 'invalid_status');
    }
    return this.get(id);
  }

  /** 拒绝：必须理由；条件更新防并发 */
  async reject(id: string, reason: unknown): Promise<DemandIntake> {
    const trimmed = typeof reason === 'string' ? reason.trim() : '';
    if (!trimmed) throw new IntakeError('Reject reason is required', 400, 'validation_error');
    if (trimmed.length > MAX_REASON) {
      throw new IntakeError(`Reject reason limited to ${MAX_REASON} characters`, 400, 'validation_error');
    }
    const changed = await this.db('demand_intake')
      .where({ id, status: 'new' })
      .update({ status: 'rejected', reject_reason: trimmed, updated_at: nowIso() });
    if (changed === 0) {
      const row = await this.db('demand_intake').where('id', id).first();
      if (!row) throw new IntakeError('Intake not found', 404, 'not_found');
      throw new IntakeError(`Intake is ${row.status} and cannot be rejected`, 409, 'invalid_status');
    }
    return this.get(id);
  }

  /** 硬删除：仅 new（converted/rejected 留档走 409）。
   *  I01v/F2：条件删除防 TOCTOU——旧实现 get→check→del，检查与删除之间
   *  并发 convert 即可删掉 converted 留档；改原子条件 del（reject:273-282 同型）。 */
  async remove(id: string): Promise<void> {
    const changed = await this.db('demand_intake').where({ id, status: 'new' }).del();
    if (changed === 0) {
      const row = await this.db('demand_intake').where('id', id).first();
      if (!row) throw new IntakeError('Intake not found', 404, 'not_found');
      throw new IntakeError(`Intake is ${row.status} and cannot be deleted`, 409, 'invalid_status');
    }
  }

  // ── 内部 ─────────────────────────────────────────────────────────

  private toRow(input: IntakeCaptureInput): CaptureRow {
    const title = this.normalizeTitle(input.title);
    const channel = this.normalizeChannel(input.source_channel);
    const source_ref = normalizeSourceRef(input.source_ref);
    const priority_hint = this.normalizePriorityHint(input.priority_hint ?? null);
    const expected_start = this.isoOrNull(input.expected_start ?? null);
    const expected_finish = this.isoOrNull(input.expected_finish ?? null);
    this.validateDatePair(expected_start, expected_finish);
    return {
      title,
      raw_text: this.textOrNull(input.raw_text),
      source_channel: channel,
      source_ref,
      requester: this.textOrNull(input.requester, MAX_REQUESTER),
      priority_hint,
      expected_start,
      expected_finish,
      note: this.textOrNull(input.note),
    };
  }

  private normalizeTitle(raw: unknown): string {
    const s = typeof raw === 'string' ? raw.trim() : '';
    if (!s) throw new IntakeError('Title is required', 400, 'validation_error');
    return s.length > MAX_TITLE ? s.slice(0, MAX_TITLE) : s;
  }

  private normalizeChannel(raw: unknown): IntakeSourceChannel {
    const s = typeof raw === 'string' && raw.trim() ? raw.trim() : 'internal';
    if (!SOURCE_CHANNEL_SET.has(s)) {
      throw new IntakeError(`Invalid source_channel "${s}"`, 400, 'validation_error');
    }
    return s as IntakeSourceChannel;
  }

  private normalizePriorityHint(raw: unknown): number | null {
    if (raw === null || raw === undefined || raw === '') return null;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      throw new IntakeError('priority_hint must be an integer 1-5', 400, 'validation_error');
    }
    return n;
  }

  private isoOrNull(raw: unknown): string | null {
    if (raw === null || raw === undefined || raw === '') return null;
    const s = String(raw).trim();
    if (!ISO_DATE.test(s)) {
      throw new IntakeError(`Date must be YYYY-MM-DD (got "${s}")`, 400, 'validation_error');
    }
    return s;
  }

  private validateDatePair(start: string | null, finish: string | null): void {
    if (start && finish && start > finish) {
      throw new IntakeError('expected_start must be <= expected_finish', 400, 'validation_error');
    }
  }

  private textOrNull(raw: unknown, max = Infinity): string | null {
    if (raw === null || raw === undefined) return null;
    const s = String(raw).trim();
    if (!s) return null;
    return s.length > max ? s.slice(0, max) : s;
  }

  /** 查重；conn 可传当前事务句柄——单连接池（max:1）下事务内不得再用
   *  this.db 取连接（I01y 复评：批量错误路径曾因此等满 30s 死锁） */
  private async findDuplicate(
    channel: string,
    ref: string | null,
    conn: any = this.db
  ): Promise<{ id: string; status: string } | undefined> {
    if (!ref) return undefined;
    return await conn('demand_intake')
      .where({ source_channel: channel, source_ref: ref })
      .whereNot('status', 'rejected')
      .first(['id', 'status']);
  }

  private async titleWarning(
    title: string,
    excludeId: string
  ): Promise<{ type: string; existing_id: string }[]> {
    const other = await this.db('demand_intake')
      .where({ status: 'new', title })
      .whereNot('id', excludeId)
      .first('id');
    if (!other) return [];
    return [{ type: 'duplicate_title', existing_id: other.id }];
  }

  private async insertRow(
    row: CaptureRow,
    actorId?: string | null,
    trx?: any
  ): Promise<DemandIntake> {
    const db = trx ?? this.db;
    const id = `intake-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const payload = {
      id,
      ...row,
      status: 'new',
      created_by: actorId ?? null,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    try {
      await db('demand_intake').insert(payload);
    } catch (error) {
      // 部分唯一索引兜底（并发窗口）：I01y/#4——SQLite 约束错误消息只列
      // 列名不含索引名（"UNIQUE constraint failed: demand_intake.source_channel,
      // demand_intake.source_ref"），按 code + 目标列识别
      if (this.isDuplicateSourceRefError(error)) {
        // 事务内必须复用当前连接（trx）查冲突行（I01y 复评：单连接池下
        // this.db 会等满 acquireConnectionTimeout）
        const existing = await this.findDuplicate(payload.source_channel, payload.source_ref ?? null, db);
        throw new IntakeError('Source ref already captured', 409, 'duplicate_source_ref', existing?.id ?? undefined);
      }
      throw error;
    }
    return db('demand_intake').where('id', id).first();
  }

  /** 唯一约束命中 demand_intake(source_channel, source_ref) 部分索引的识别
   *  （I01y/#4：不认索引名；同时排除主键 id 冲突与其他表约束） */
  private isDuplicateSourceRefError(error: unknown): boolean {
    const err = error as { code?: string; message?: string };
    const msg = String(err?.message ?? '');
    const unique = err?.code === 'SQLITE_CONSTRAINT_UNIQUE' || msg.includes('UNIQUE constraint failed');
    return unique && msg.includes('demand_intake.source_ref') && !msg.includes('demand_intake.id');
  }
}
