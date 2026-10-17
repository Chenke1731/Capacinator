/**
 * 在线一致性备份（改进计划 IP-08a / S02）。
 *
 * 旧实现两个缺口:调度器只有一行日志;桌面端直接 copyFile 数据库文件——
 * WAL 模式下未 checkpoint 的已提交事务留在 -wal 文件里,拷贝 .db 会丢数据。
 *
 * 本模块用 SQLite 原生在线备份(API/VACUUM INTO):读侧一致快照,写侧不阻塞;
 * 恢复校验在临时只读连接上做 integrity_check + 关键表存在性,不碰原库。
 */
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { getConfig } from '../../database/knexfile.js';

export interface BackupResult {
  file: string;
  sizeBytes: number;
  createdAt: string;
}

/** 在线一致性备份:VACUUM INTO 生成紧凑快照(含 WAL 中已提交数据) */
export function createConsistentBackup(dbFilePath: string, backupFilePath: string): BackupResult {
  fs.mkdirSync(path.dirname(backupFilePath), { recursive: true });
  if (fs.existsSync(backupFilePath)) {
    throw new Error(`backup target already exists: ${backupFilePath}`);
  }
  // 源打开失败时带上路径(2026-10-16 dev 实况:env 时序分歧打到不存在的
  // 文件,裸"unable to open database file"无法定位是源还是目标)
  let src: InstanceType<typeof Database>;
  try {
    src = new Database(dbFilePath, { readonly: true });
  } catch (e) {
    throw new Error(`cannot open source database '${dbFilePath}' (readonly): ${(e as Error).message}`);
  }
  try {
    src.exec(`VACUUM INTO '${backupFilePath.replace(/'/g, "''")}'`);
  } finally {
    src.close();
  }
  const stat = fs.statSync(backupFilePath);
  return {
    file: backupFilePath,
    sizeBytes: stat.size,
    createdAt: new Date().toISOString()
  };
}

export interface VerifyResult {
  readable: boolean;
  integrityOk: boolean;
  schemaVersion: number;
  keyTablesPresent: boolean;
  /** 备份迁移集 ⊆ 应用已知迁移(未来版本库恢复后降级运行必炸,2026-10-17 返工 C) */
  migrationsCompatible: boolean;
  /** 核心表关键业务列抽查(表名存在不等于本应用可运行) */
  keyColumnsOk: boolean;
  problems: string[];
}

/** 关键列抽查清单:恢复后本应用立即要读写的业务字段 */
const KEY_COLUMNS: Array<[string, string]> = [
  ['scenario_project_assignments', 'status'],
  ['scenario_project_assignments', 'is_primary'],
  ['scenario_project_assignments', 'computed_start_date'],
  ['projects', 'lifecycle_state'],
  ['people', 'default_availability_percentage']
];

/** 应用已知迁移名集合(从迁移目录推导;dev=cwd/src/..., prod=knexfile 同源 thisDir/migrations)。
 *  knex_migrations.name 存的是迁移文件全名(含 .ts 扩展,dev 实测)——
 *  集合必须保留原样文件名,剥后缀会把全部迁移误判为 unknown */
function defaultAppMigrations(): Set<string> | null {
  try {
    const raw = getConfig().migrations?.directory;
    const dir = Array.isArray(raw) ? raw[0] : (raw ?? '');
    return new Set(fs.readdirSync(dir));
  } catch {
    return null; // 目录不可读:跳过兼容检查(fail-open,记 warning 不误杀好备份)
  }
}

/** 恢复前校验:只读打开备份——完整性 + 关键表 + 迁移集兼容 + 关键列(2026-10-17 C 收紧) */
export function verifyBackup(
  backupFilePath: string,
  opts?: { appMigrations?: string[] }
): VerifyResult {
  const problems: string[] = [];
  if (!fs.existsSync(backupFilePath)) {
    return { readable: false, integrityOk: false, schemaVersion: 0, keyTablesPresent: false, migrationsCompatible: false, keyColumnsOk: false, problems: [`backup file not found: ${backupFilePath}`] };
  }
  let db: Database.Database | null = null;
  try {
    db = new Database(backupFilePath, { readonly: true });
  } catch (e) {
    return { readable: false, integrityOk: false, schemaVersion: 0, keyTablesPresent: false, migrationsCompatible: false, keyColumnsOk: false, problems: [`cannot open backup: ${(e as Error).message}`] };
  }
  try {
    let integrityOk = false;
    let schemaVersion = 0;
    try {
      const integrity = db.pragma('integrity_check', { simple: true }) as string;
      integrityOk = String(integrity).toLowerCase() === 'ok';
      if (!integrityOk) problems.push(`integrity_check: ${integrity}`);
      schemaVersion = Number(db.pragma('user_version', { simple: true }) ?? 0);
    } catch (e) {
      // 打得开但过不了完整性检查(垃圾字节/截断)——对恢复而言不可读
      db.close();
      return { readable: false, integrityOk: false, schemaVersion: 0, keyTablesPresent: false, migrationsCompatible: false, keyColumnsOk: false, problems: [`integrity_check failed: ${(e as Error).message}`] };
    }

    const required = ['projects', 'people', 'scenario_project_assignments', 'project_estimations', 'audit_log'];
    const present = required.filter((t) => {
      try {
        return !!db!.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(t);
      } catch {
        return false;
      }
    });
    const keyTablesPresent = present.length === required.length;
    if (!keyTablesPresent) {
      problems.push(`missing tables: ${required.filter((t) => !present.includes(t as never)).join(', ')}`);
    }

    // 迁移集兼容:备份不得含应用未知的迁移(备份来自更新版本的应用,
    // 恢复后本应用降级运行会踩不认识的 schema)。备份 ⊆ 应用集合 = 放行
    // (旧备份向前迁移合法);knex_migrations 缺失说明不是本应用产物 → 拒
    let migrationsCompatible = true;
    let appSet: Set<string> | null;
    if (opts?.appMigrations) {
      appSet = new Set(opts.appMigrations);
    } else {
      appSet = defaultAppMigrations();
      if (!appSet) problems.push('app migrations directory unreadable; migration compatibility check skipped');
    }
    if (appSet) {
      try {
        const rows = db.prepare('SELECT name FROM knex_migrations').all() as Array<{ name: string }>;
        const unknown = rows.map((r) => String(r.name)).filter((n) => !appSet!.has(n));
        if (unknown.length > 0) {
          migrationsCompatible = false;
          problems.push(`unknown migrations (backup from a newer app?): ${unknown.join(', ')}`);
        }
      } catch {
        migrationsCompatible = false;
        problems.push('knex_migrations table missing or unreadable');
      }
    }

    // 关键列抽查:表名存在 ≠ 本应用可运行(v999/缺业务字段的库曾通过校验)
    let keyColumnsOk = true;
    for (const [table, column] of KEY_COLUMNS) {
      try {
        const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name);
        if (!cols.includes(column)) {
          keyColumnsOk = false;
          problems.push(`missing columns: ${table}.${column}`);
        }
      } catch {
        keyColumnsOk = false;
        problems.push(`missing columns: ${table}.${column}`);
      }
    }

    return { readable: true, integrityOk, schemaVersion, keyTablesPresent, migrationsCompatible, keyColumnsOk, problems };
  } finally {
    db.close();
  }
}

/**
 * 保留策略:按 mtime 年龄淘汰超过保留天数的旧备份(2026-10-17 返工 D)。
 * 旧实现"保留最新 N 份"——retentionDays=30 在 hourly 备份下只保住 30
 * 小时,启动即备份还会加速淘汰,与参数名/DB_BACKUP_RETENTION_DAYS 承诺
 * 的天数语义不符。现按真实时间窗口淘汰;无论多旧恒留最新一份兜底
 * (极端情况下删光全部备份比留一份更糟)。
 */
export function applyRetention(backupDir: string, retentionDays: number): string[] {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const entries = fs.readdirSync(backupDir)
    .filter((f) => f.endsWith('.db'))
    .map((f) => ({ file: path.join(backupDir, f), mtime: fs.statSync(path.join(backupDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  const removed: string[] = [];
  for (const entry of entries) {
    if (entry === entries[0]) continue; // 恒留最新一份
    if (entry.mtime >= cutoff) continue; // 窗口内保留
    fs.unlinkSync(entry.file);
    removed.push(entry.file);
  }
  return removed;
}

/** 一次完整备份:创建 → 校验 → 保留策略(失败时删除半成品并抛出) */
export function runBackupOnce(opts: {
  dbFilePath: string;
  backupDir: string;
  retentionDays?: number;
  now?: () => number;
}): { result: BackupResult; verify: VerifyResult; removed: string[] } {
  const stamp = new Date((opts.now ?? Date.now)()).toISOString().replace(/[:.]/g, '-');
  const target = path.join(opts.backupDir, `backup-${stamp}.db`);
  let result: BackupResult;
  try {
    result = createConsistentBackup(opts.dbFilePath, target);
  } catch (e) {
    if (fs.existsSync(target)) fs.unlinkSync(target);
    throw e;
  }
  const verify = verifyBackup(target);
  if (!verify.readable || !verify.integrityOk || !verify.keyTablesPresent
    || !verify.migrationsCompatible || !verify.keyColumnsOk) {
    fs.unlinkSync(target);
    throw new Error(`backup verification failed: ${verify.problems.join('; ')}`);
  }
  const removed = opts.retentionDays != null ? applyRetention(opts.backupDir, opts.retentionDays) : [];
  return { result, verify, removed };
}

// ─── 恢复演练(IP-08a 后半)──────────────────────────────────────────────

export interface DbFingerprint {
  tableCounts: Record<string, number>;
  allocationSum: number;
  actualFteSum: number;
}

const FINGERPRINT_TABLES = [
  'projects', 'people', 'scenario_project_assignments',
  'project_estimations', 'project_actual_investments', 'audit_log'
];

/** 关键行/工时/实际值指纹——恢复演练的对账基准 */
export function collectDbFingerprint(dbFilePath: string): DbFingerprint {
  const db = new Database(dbFilePath, { readonly: true });
  try {
    const tableCounts: Record<string, number> = {};
    for (const t of FINGERPRINT_TABLES) {
      try {
        tableCounts[t] = Number((db.prepare(`SELECT count(*) c FROM ${t}`).get() as any)?.c ?? 0);
      } catch {
        tableCounts[t] = -1; // 表缺失(备份版本差异)
      }
    }
    const allocationSum = tableCounts['scenario_project_assignments'] >= 0
      ? Number((db.prepare('SELECT COALESCE(SUM(allocation_percentage),0) s FROM scenario_project_assignments').get() as any)?.s ?? 0)
      : 0;
    const actualFteSum = tableCounts['project_actual_investments'] >= 0
      ? Number((db.prepare('SELECT COALESCE(SUM(fte),0) s FROM project_actual_investments').get() as any)?.s ?? 0)
      : 0;
    return { tableCounts, allocationSum: Math.round(allocationSum * 1000) / 1000, actualFteSum: Math.round(actualFteSum * 1000) / 1000 };
  } finally {
    db.close();
  }
}

export interface RestoreResult {
  restoredTo: string;
  verify: VerifyResult;
  fingerprint: DbFingerprint;
}

/**
 * 恢复到目标位置(演练用):校验 → 拷贝 → 目标再校验 → 指纹。
 * 绝不覆盖在线库——真实恢复由操作者按演练结论执行文件替换。
 */
export function restoreBackupTo(backupFilePath: string, targetPath: string): RestoreResult {
  const pre = verifyBackup(backupFilePath);
  if (!pre.readable || !pre.integrityOk || !pre.keyTablesPresent
    || !pre.migrationsCompatible || !pre.keyColumnsOk) {
    throw new Error(`restore refused, backup verification failed: ${pre.problems.join('; ')}`);
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  if (fs.existsSync(targetPath)) {
    throw new Error(`restore target already exists: ${targetPath}`);
  }
  fs.copyFileSync(backupFilePath, targetPath);
  const post = verifyBackup(targetPath);
  if (!post.readable || !post.integrityOk || !post.keyTablesPresent
    || !post.migrationsCompatible || !post.keyColumnsOk) {
    fs.unlinkSync(targetPath);
    throw new Error(`restored copy failed verification: ${post.problems.join('; ')}`);
  }
  return { restoredTo: targetPath, verify: post, fingerprint: collectDbFingerprint(targetPath) };
}

/** 完整演练:取指纹 → 备份 → 恢复到临时位置 → 对账(等于备份时指纹) */
export function drillRestore(opts: {
  liveDbPath: string;
  workDir: string;
}): {
  ok: boolean;
  backup: BackupResult;
  before: DbFingerprint;
  restored: DbFingerprint;
  problems: string[];
} {
  const before = collectDbFingerprint(opts.liveDbPath);
  const backupDir = path.join(opts.workDir, 'drill-backups');
  const { result: backup } = runBackupOnce({ dbFilePath: opts.liveDbPath, backupDir, retentionDays: 5 });
  const restored = restoreBackupTo(backup.file, path.join(opts.workDir, 'drill-restored.db'));

  const problems: string[] = [];
  for (const t of FINGERPRINT_TABLES) {
    if (before.tableCounts[t] !== restored.fingerprint.tableCounts[t]) {
      problems.push(`${t}: live=${before.tableCounts[t]} restored=${restored.fingerprint.tableCounts[t]}`);
    }
  }
  if (before.allocationSum !== restored.fingerprint.allocationSum) {
    problems.push(`allocationSum: live=${before.allocationSum} restored=${restored.fingerprint.allocationSum}`);
  }
  if (before.actualFteSum !== restored.fingerprint.actualFteSum) {
    problems.push(`actualFteSum: live=${before.actualFteSum} restored=${restored.fingerprint.actualFteSum}`);
  }
  return { ok: problems.length === 0, backup, before, restored: restored.fingerprint, problems };
}
