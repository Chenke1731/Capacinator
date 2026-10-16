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
  const src = new Database(dbFilePath, { readonly: true });
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
  problems: string[];
}

/** 恢复前校验:只读打开备份,pristine 检查 + 关键表存在 */
export function verifyBackup(backupFilePath: string): VerifyResult {
  const problems: string[] = [];
  if (!fs.existsSync(backupFilePath)) {
    return { readable: false, integrityOk: false, schemaVersion: 0, keyTablesPresent: false, problems: [`backup file not found: ${backupFilePath}`] };
  }
  let db: Database.Database | null = null;
  try {
    db = new Database(backupFilePath, { readonly: true });
  } catch (e) {
    return { readable: false, integrityOk: false, schemaVersion: 0, keyTablesPresent: false, problems: [`cannot open backup: ${(e as Error).message}`] };
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
      return { readable: false, integrityOk: false, schemaVersion: 0, keyTablesPresent: false, problems: [`integrity_check failed: ${(e as Error).message}`] };
    }

    const required = ['projects', 'people', 'scenario_project_assignments', 'project_estimations', 'audit_logs'];
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
    return { readable: true, integrityOk, schemaVersion, keyTablesPresent, problems };
  } finally {
    db.close();
  }
}

/** 保留策略:按 mtime 淘汰超出保留数的旧备份,返回被删除文件 */
export function applyRetention(backupDir: string, retention: number): string[] {
  const entries = fs.readdirSync(backupDir)
    .filter((f) => f.endsWith('.db'))
    .map((f) => ({ file: path.join(backupDir, f), mtime: fs.statSync(path.join(backupDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  const removed: string[] = [];
  for (const entry of entries.slice(Math.max(0, retention))) {
    fs.unlinkSync(entry.file);
    removed.push(entry.file);
  }
  return removed;
}

/** 一次完整备份:创建 → 校验 → 保留策略(失败时删除半成品并抛出) */
export function runBackupOnce(opts: {
  dbFilePath: string;
  backupDir: string;
  retention?: number;
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
  if (!verify.readable || !verify.integrityOk || !verify.keyTablesPresent) {
    fs.unlinkSync(target);
    throw new Error(`backup verification failed: ${verify.problems.join('; ')}`);
  }
  const removed = opts.retention != null ? applyRetention(opts.backupDir, opts.retention) : [];
  return { result, verify, removed };
}
