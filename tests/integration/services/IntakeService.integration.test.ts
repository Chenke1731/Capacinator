/**
 * I01 需求收件箱 —— 服务层集成测试（真迁移库）。
 *
 * 覆盖设计稿 §8.1 的服务侧断言：
 * - 捕获/批量/去重（rejected 释放唯一键）/标题重复警告
 * - 校验（ISO 日期、priority_hint、必填）
 * - 转换事务：基线锚定期望开始日、无开始日不建阶段、无模板、
 *   双击 409、非生命周期类型、external_number 回填、事件留档
 */
import { describe, test, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
import { db } from '../setup';
import {
  IntakeService,
  IntakeError,
  normalizeSourceRef,
  extractExternalNumber,
} from '../../../src/server/services/intake/IntakeService';
import { IntakeConversionService } from '../../../src/server/services/intake/IntakeConversionService';

const S = new IntakeService(db);
const C = new IntakeConversionService(db);

const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// 夹具：类型名必须与生命周期门（ProjectsController/055 的硬编码全等裁决）
// 完全一致——'需求交付'/'零星事项' 进生命周期，'问题单支持' 常驻不进。
// 每个套件独立内存库，name UNIQUE 无冲突。
const DEMAND_TYPE_ID = `i01-demand-type-${SUFFIX}`;
const DEMAND_SUB_ID = `i01-demand-sub-${SUFFIX}`;
const NOTPL_TYPE_ID = `i01-notpl-type-${SUFFIX}`;
const NOTPL_SUB_ID = `i01-notpl-sub-${SUFFIX}`;
const STANDING_TYPE_ID = `i01-standing-type-${SUFFIX}`;
const STANDING_SUB_ID = `i01-standing-sub-${SUFFIX}`;
const PHASE_1_ID = `i01-phase-1-${SUFFIX}`;
const PHASE_2_ID = `i01-phase-2-${SUFFIX}`;

let createdProjectIds: string[] = [];

async function expectIntakeError(fn: () => Promise<unknown>, statusCode: number, code: string) {
  let caught: unknown;
  try {
    await fn();
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(IntakeError);
  const err = caught as IntakeError;
  expect(err.statusCode).toBe(statusCode);
  expect(err.code).toBe(code);
}

beforeAll(async () => {
  await db('project_types').insert([
    { id: DEMAND_TYPE_ID, name: '需求交付' },
    { id: NOTPL_TYPE_ID, name: '零星事项' },
    { id: STANDING_TYPE_ID, name: '问题单支持' },
  ]);
  await db('project_sub_types').insert([
    { id: DEMAND_SUB_ID, name: `SR-I01-${SUFFIX}`, project_type_id: DEMAND_TYPE_ID, is_active: 1 },
    { id: NOTPL_SUB_ID, name: `SR-NT-I01-${SUFFIX}`, project_type_id: NOTPL_TYPE_ID, is_active: 1 },
    { id: STANDING_SUB_ID, name: `工单-I01-${SUFFIX}`, project_type_id: STANDING_TYPE_ID, is_active: 1 },
  ]);
  await db('project_phases').insert([
    { id: PHASE_1_ID, name: `I01-需求分析-${SUFFIX}`, description: 'fixture', order_index: 1 },
    { id: PHASE_2_ID, name: `I01-开发-${SUFFIX}`, description: 'fixture', order_index: 2 },
  ]);
  await db('project_type_phases').insert([
    {
      id: `i01-ptp-1-${SUFFIX}`,
      project_type_id: DEMAND_TYPE_ID,
      phase_id: PHASE_1_ID,
      order_index: 1,
      default_duration_days: 30,
      is_mandatory: 0,
      is_locked_order: 0,
    },
    {
      id: `i01-ptp-2-${SUFFIX}`,
      project_type_id: DEMAND_TYPE_ID,
      phase_id: PHASE_2_ID,
      order_index: 2,
      default_duration_days: 45,
      is_mandatory: 0,
      is_locked_order: 0,
    },
  ]);
});

// 无 afterAll 清理：每个套件独享内存库，setup 的 destroy 即清零
// （且 jest hook 顺序下 setup 的 afterAll 先行销毁，晚注册的清理钩子必炸）。

beforeEach(async () => {
  await db('demand_intake').del();
  createdProjectIds = [];
});

afterEach(async () => {
  for (const pid of createdProjectIds) {
    await db('project_phases_timeline').where('project_id', pid).del();
    await db('project_lifecycle_events').where('project_id', pid).del();
    await db('projects').where('id', pid).del();
  }
  await db('demand_intake').del();
});

describe('I01 纯函数（source_ref 规范化）', () => {
  test('整串 SR/AR 归一为大写，其余原样、空为 null', () => {
    expect(normalizeSourceRef(' sr-123456 ')).toBe('SR123456');
    expect(normalizeSourceRef('AR 98765')).toBe('AR98765');
    expect(normalizeSourceRef('https://jdc.example/SR123456')).toBe('https://jdc.example/SR123456');
    expect(normalizeSourceRef('')).toBeNull();
    expect(normalizeSourceRef(null)).toBeNull();
  });

  test('extractExternalNumber 从任意位置提取（URL 中的编号）', () => {
    expect(extractExternalNumber('https://jdc.example/ticket/SR-98765')).toBe('SR98765');
    expect(extractExternalNumber('AR_000123 已上线')).toBe('AR000123');
    expect(extractExternalNumber('无编号')).toBeNull();
  });
});

describe('I01 捕获（单条/校验/去重）', () => {
  test('最小载荷入库：状态 new、ISO 时间戳、ref 归一', async () => {
    const { intake, warnings } = await S.capture({
      title: '用户登录改造',
      source_channel: 'jdc_sr',
      source_ref: 'sr-123456',
      raw_text: 'SR123456 用户登录改造 11月上线',
    });
    expect(intake.status).toBe('new');
    expect(intake.source_ref).toBe('SR123456');
    expect(intake.title).toBe('用户登录改造');
    expect(String(intake.created_at)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(warnings).toEqual([]);
  });

  test('同来源同编号 → 409 duplicate_source_ref（带 existing_id）', async () => {
    const { intake } = await S.capture({ title: 'A', source_channel: 'jdc_sr', source_ref: 'SR000001' });
    try {
      await S.capture({ title: 'B', source_channel: 'jdc_sr', source_ref: 'SR-000001' });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(IntakeError);
      const err = e as IntakeError;
      expect(err.statusCode).toBe(409);
      expect(err.code).toBe('duplicate_source_ref');
      expect(err.existingId).toBe(intake.id);
    }
  });

  test('同标题只警告不阻塞', async () => {
    await S.capture({ title: '同名需求', source_channel: 'internal' });
    const { warnings } = await S.capture({ title: '同名需求', source_channel: 'internal' });
    expect(warnings).toEqual([{ type: 'duplicate_title', existing_id: expect.any(String) }]);
  });

  test('硬校验：空标题/非 ISO 日期/日期倒置/越界优先级', async () => {
    await expectIntakeError(() => S.capture({ title: '  ', source_channel: 'internal' }), 400, 'validation_error');
    await expectIntakeError(
      () => S.capture({ title: 'X', source_channel: 'internal', expected_finish: '2026/11/30' }),
      400,
      'validation_error'
    );
    await expectIntakeError(
      () => S.capture({ title: 'X', source_channel: 'internal', expected_start: '2026-12-01', expected_finish: '2026-11-01' }),
      400,
      'validation_error'
    );
    await expectIntakeError(
      () => S.capture({ title: 'X', source_channel: 'internal', priority_hint: 9 }),
      400,
      'validation_error'
    );
  });

  test('拒绝释放唯一键：rejected 后同编号可重新捕获', async () => {
    const { intake } = await S.capture({ title: '重复误录', source_channel: 'ticket', source_ref: 'T-100' });
    await S.reject(intake.id, '误录');
    const again = await S.capture({ title: '重新提交', source_channel: 'ticket', source_ref: 'T-100' });
    expect(again.intake.status).toBe('new');
    // 拒绝记录必须留档不可删
    await expectIntakeError(() => S.remove(intake.id), 409, 'invalid_status');
  });

  test('F2 原子删除：检查与删除间并发转态（TOCTOU 等价）也不删留档', async () => {
    const { intake } = await S.capture({ title: '并发转档', source_channel: 'internal' });
    // 模拟 remove 判定通过后、原子 del 前并发 convert 已提交：直接 DB 转态
    await db('demand_intake').where('id', intake.id).update({ status: 'converted' });
    await expectIntakeError(() => S.remove(intake.id), 409, 'invalid_status');
    const row = await db('demand_intake').where('id', intake.id).first();
    expect(row).toBeTruthy();
    expect(row.status).toBe('converted');
  });

  test('F2 删除不存在 → 404 not_found', async () => {
    await expectIntakeError(() => S.remove('intake-no-such'), 404, 'not_found');
  });

  test('F2 红证形态：stale 快照（TOCTOU 窗口）下原子删除仍拒删 converted', async () => {
    const { intake } = await S.capture({ title: 'stale 窗口', source_channel: 'internal' });
    const stale = await S.get(intake.id); // 旧实现会读到这份 'new' 快照并放行 del
    expect(stale.status).toBe('new');
    await db('demand_intake').where('id', intake.id).update({ status: 'converted' });

    const originalGet = (S as any).get;
    (S as any).get = async () => stale; // 模拟"检查后、删除前"并发转态已完成
    try {
      // 新实现走原子条件 del（不读 get）→ 0 行 → 409；旧实现读 stale → 误删 converted
      await expectIntakeError(() => S.remove(intake.id), 409, 'invalid_status');
    } finally {
      (S as any).get = originalGet;
    }
    const row = await db('demand_intake').where('id', intake.id).first();
    expect(row).toBeTruthy();
    expect(row.status).toBe('converted');
  });
});

describe('I01 批量捕获', () => {
  test('批内/库内重复进 skipped，其余入库', async () => {
    await S.capture({ title: '存量', source_channel: 'jdc_sr', source_ref: 'SR000100' });
    const { created, skipped } = await S.captureBatch([
      { title: '一号', source_channel: 'jdc_sr', source_ref: 'SR000101' },
      { title: '二号', source_channel: 'jdc_sr', source_ref: 'SR000101' }, // 批内重复
      { title: '存量同名', source_channel: 'jdc_sr', source_ref: 'SR000100' }, // 库内重复
      { title: '三号', source_channel: 'internal' },
    ]);
    expect(created.map((r) => r.title)).toEqual(['一号', '三号']);
    expect(skipped).toEqual([
      { index: 1, reason: 'duplicate_source_ref' },
      { index: 2, reason: 'duplicate_source_ref', existing_id: expect.any(String) },
    ]);
  });

  test('任一硬校验错误整批 400 零插入', async () => {
    await expectIntakeError(
      () =>
        S.captureBatch([
          { title: '好数据', source_channel: 'internal' },
          { title: '坏日期', source_channel: 'internal', expected_finish: '11月底' },
        ]),
      400,
      'validation_error'
    );
    expect(await db('demand_intake').count('* as c').first()).toMatchObject({ c: 0 });
  });
});

describe('I01 列表/计数/编辑', () => {
  test('默认 new+oldest；q/来源过滤；counts 含 by_source(仅 new)', async () => {
    await S.capture({ title: '甲需求', source_channel: 'jdc_sr', source_ref: 'SR000201' });
    await S.capture({ title: '乙需求', source_channel: 'internal' });
    const { rows, total } = await S.list({});
    expect(total).toBe(2);
    expect(rows.map((r) => r.title)).toEqual(['甲需求', '乙需求']); // created_at 升序

    const filtered = await S.list({ source_channel: 'jdc_sr', q: 'SR000201' });
    expect(filtered.total).toBe(1);
    expect(filtered.rows[0].title).toBe('甲需求');

    const counts = await S.counts();
    expect(counts.new).toBe(2);
    expect(counts.converted).toBe(0);
    expect(counts.by_source).toEqual({ jdc_sr: 1, internal: 1 });
  });

  test('编辑仅限 new；ref 变更重查唯一', async () => {
    const a = await S.capture({ title: 'A', source_channel: 'internal', source_ref: 'SR000301' });
    await S.capture({ title: 'B', source_channel: 'internal', source_ref: 'SR000302' });
    const updated = await S.update(a.intake.id, { title: 'A2', requester: '张三' });
    expect(updated.title).toBe('A2');
    expect(updated.requester).toBe('张三');
    // 改成 B 的编号 → 409
    await expectIntakeError(
      () => S.update(a.intake.id, { source_ref: 'SR-000302' }),
      409,
      'duplicate_source_ref'
    );
    // 拒绝后不可编辑
    await S.reject(a.intake.id, '不需要');
    await expectIntakeError(() => S.update(a.intake.id, { title: 'X' }), 409, 'invalid_status');
  });

  test('拒绝必须给理由', async () => {
    const { intake } = await S.capture({ title: 'X', source_channel: 'internal' });
    await expectIntakeError(() => S.reject(intake.id, '   '), 400, 'validation_error');
  });
});

describe('I01 转换事务（IntakeConversionService）', () => {
  test('快乐路径：基线锚定开始日 + pending_rat + 事件 + external_number + 越界警告', async () => {
    const { intake } = await S.capture({
      title: '门户登录改造',
      source_channel: 'jdc_sr',
      source_ref: 'SR777777',
      raw_text: 'SR777777 门户登录改造',
      note: '评审备注',
      priority_hint: 2,
    });
    const result = await C.convert(intake.id, {
      project_type_id: DEMAND_TYPE_ID,
      project_sub_type_id: DEMAND_SUB_ID,
      expected_start: '2027-03-01',
      expected_finish: '2027-03-31',
    });
    createdProjectIds.push(String(result.project.id));

    expect(result.baseline).toBe('set');
    expect(result.phase_count).toBe(2);
    expect(result.external_number_linked).toBe('SR777777');
    // 30+45 天模板 vs 31 天窗口 → 越界警告（非阻塞）
    expect(result.baseline_warnings).toContain('phase_extends_beyond_expected_finish');

    expect(result.project.lifecycle_state).toBe('pending_rat');
    expect(result.project.aspiration_start).toBe('2027-03-01');
    expect(result.project.aspiration_finish).toBe('2027-03-31');
    expect(result.project.priority).toBe(2); // priority_hint 预填
    expect(result.project.external_number).toBe('SR777777');
    expect(result.project.include_in_demand).toBe(1);
    expect(result.project.description).toContain('SR777777 门户登录改造');
    expect(result.project.description).toContain('评审备注');

    // 阶段锚定：首阶段从 2027-03-01 起，次阶段首日=首阶段末日
    const timeline = await db('project_phases_timeline')
      .where('project_id', result.project.id)
      .orderBy('start_date');
    expect(timeline).toHaveLength(2);
    expect(String(timeline[0].start_date).slice(0, 10)).toBe('2027-03-01');
    expect(String(timeline[0].end_date).slice(0, 10)).toBe('2027-03-31');
    expect(String(timeline[1].start_date).slice(0, 10)).toBe('2027-03-31');

    // 生命周期事件留档
    const [event] = await db('project_lifecycle_events').where('project_id', result.project.id);
    expect(event.from_state).toBeNull();
    expect(event.to_state).toBe('pending_rat');
    expect(String(event.note)).toBe(`from intake ${intake.id}`);

    // 收件箱回链
    expect(result.intake.status).toBe('converted');
    expect(result.intake.converted_project_id).toBe(result.project.id);
  });

  test('无期望开始日 → 不生成阶段（aspiration NULL、phase_count 0）', async () => {
    const { intake } = await S.capture({ title: '无日期需求', source_channel: 'internal' });
    const result = await C.convert(intake.id, {
      project_type_id: DEMAND_TYPE_ID,
      project_sub_type_id: DEMAND_SUB_ID,
    });
    createdProjectIds.push(String(result.project.id));
    expect(result.baseline).toBe('unset');
    expect(result.baseline_reason).toBe('no_expected_start');
    expect(result.phase_count).toBe(0);
    expect(result.project.aspiration_start).toBeNull();
    const timeline = await db('project_phases_timeline').where('project_id', result.project.id);
    expect(timeline).toHaveLength(0);
  });

  test('有开始日但类型无模板 → no_template', async () => {
    const { intake } = await S.capture({ title: '无模板需求', source_channel: 'internal' });
    const result = await C.convert(intake.id, {
      project_type_id: NOTPL_TYPE_ID,
      project_sub_type_id: NOTPL_SUB_ID,
      expected_start: '2027-06-01',
    });
    createdProjectIds.push(String(result.project.id));
    expect(result.baseline).toBe('unset');
    expect(result.baseline_reason).toBe('no_template');
    expect(result.phase_count).toBe(0);
    expect(result.project.aspiration_start).toBe('2027-06-01');
  });

  test('非生命周期类型：lifecycle NULL、无事件、无阶段', async () => {
    const { intake } = await S.capture({ title: '运维工单', source_channel: 'ticket' });
    const result = await C.convert(intake.id, {
      project_type_id: STANDING_TYPE_ID,
      project_sub_type_id: STANDING_SUB_ID,
    });
    createdProjectIds.push(String(result.project.id));
    expect(result.project.lifecycle_state).toBeNull();
    const events = await db('project_lifecycle_events').where('project_id', result.project.id);
    expect(events).toHaveLength(0);
  });

  test('双击（顺序重复调用）→ 第二次 409，只产生一个项目', async () => {
    const { intake } = await S.capture({ title: '双击需求', source_channel: 'internal', source_ref: 'SR000401' });
    const first = await C.convert(intake.id, {
      project_type_id: DEMAND_TYPE_ID,
      project_sub_type_id: DEMAND_SUB_ID,
    });
    createdProjectIds.push(String(first.project.id));
    await expectIntakeError(
      () =>
        C.convert(intake.id, {
          project_type_id: DEMAND_TYPE_ID,
          project_sub_type_id: DEMAND_SUB_ID,
        }),
      409,
      'invalid_status'
    );
    // rejected 不可转换
    const other = await S.capture({ title: '被拒需求', source_channel: 'internal' });
    await S.reject(other.intake.id, '不接');
    await expectIntakeError(
      () => C.convert(other.intake.id, { project_type_id: DEMAND_TYPE_ID, project_sub_type_id: DEMAND_SUB_ID }),
      409,
      'invalid_status'
    );
    expect(await db('projects').count('* as c').first()).toMatchObject({ c: 1 });
  });

  test('类型/子类型配对失败 → 400 invalid_type，零副作用', async () => {
    const { intake } = await S.capture({ title: '配对错误', source_channel: 'internal' });
    await expectIntakeError(
      () =>
        C.convert(intake.id, {
          project_type_id: STANDING_TYPE_ID, // 子类型属于需求类型
          project_sub_type_id: DEMAND_SUB_ID,
        }),
      400,
      'invalid_type'
    );
    const after = await db('demand_intake').where('id', intake.id).first();
    expect(after.status).toBe('new');
    expect(after.converted_project_id).toBeNull();
  });

  test('title 覆盖：项目名与收件箱标题同步；显式 priority 优先', async () => {
    const { intake } = await S.capture({
      title: '旧标题',
      source_channel: 'internal',
      priority_hint: 4,
    });
    const result = await C.convert(intake.id, {
      title: '新标题',
      project_type_id: DEMAND_TYPE_ID,
      project_sub_type_id: DEMAND_SUB_ID,
      priority: 1,
    });
    createdProjectIds.push(String(result.project.id));
    expect(result.project.name).toBe('新标题');
    expect(result.project.priority).toBe(1);
    expect(result.intake.title).toBe('新标题');
  });
});
