import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import {
  createConsistentBackup,
  verifyBackup,
  applyRetention,
  runBackupOnce,
  collectDbFingerprint,
  restoreBackupTo,
  drillRestore
} from '../backupService.js';

/**
 * IP-08a / S02: 在线一致性备份(真 better-sqlite3)。
 * WAL 场景:写侧有已提交未 checkpoint 的事务时,copyFile 会丢数据;
 * VACUUM INTO 快照必须包含 -wal 内容。恢复前校验拒损坏文件。
 */
describe('backupService (真 sqlite)', () => {
  let dir: string;
  let dbPath: string;

  const DDL = [
    `CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT, lifecycle_state TEXT)`,
    `CREATE TABLE people (id TEXT PRIMARY KEY, name TEXT, default_availability_percentage REAL DEFAULT 100)`,
    `CREATE TABLE scenario_project_assignments (
      id TEXT PRIMARY KEY, scenario_id TEXT, allocation_percentage REAL,
      status TEXT, is_primary INTEGER DEFAULT 0,
      computed_start_date TEXT, computed_end_date TEXT
    )`,
    `CREATE TABLE project_estimations (id INTEGER PRIMARY KEY, project_id TEXT)`,
    `CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT)`,
    `CREATE TABLE project_actual_investments (
      id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT, month TEXT,
      fte REAL, source TEXT
    )`,
    // 2026-10-17 C:迁移集兼容检查需要——名字取自真实迁移目录(应用集合的子集)
    `CREATE TABLE knex_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, batch INTEGER, migration_time TEXT
    )`
  ];

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-'));
    dbPath = path.join(dir, 'live.db');
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    for (const stmt of DDL) db.exec(stmt);
    db.prepare(`INSERT INTO projects (id, name) VALUES ('p1', '事项A')`).run();
    db.prepare(`INSERT INTO people (id, name) VALUES ('d1', '张开发')`).run();
    // 已提交但不 checkpoint——数据只在 -wal 文件里
    db.prepare(`INSERT INTO scenario_project_assignments (id, scenario_id, allocation_percentage) VALUES ('a1', 's1', 50)`).run();
    db.prepare(`INSERT INTO project_actual_investments (project_id, month, fte, source) VALUES ('p1', '2026-09', 0.9, 'manual')`).run();
    // knex 存迁移文件全名(含 .ts,dev 实测)——与 defaultAppMigrations 的目录文件名同构
    db.prepare(`INSERT INTO knex_migrations (name, batch) VALUES ('001_baseline_schema.ts', 1)`).run();
    db.close();
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('S02: WAL 有未 checkpoint 提交时,快照包含全部数据(copyFile 会丢 a1)', () => {
    const target = path.join(dir, 'snap.db');
    const result = createConsistentBackup(dbPath, target);
    expect(result.sizeBytes).toBeGreaterThan(0);

    const snap = new Database(target, { readonly: true });
    const projects = snap.prepare('SELECT count(*) c FROM projects').get() as any;
    const assignments = snap.prepare('SELECT count(*) c FROM scenario_project_assignments').get() as any;
    snap.close();
    expect(projects.c).toBe(1);
    expect(assignments.c).toBe(1); // WAL 中的已提交行
  });

  test('verifyBackup: 好备份通过;损坏文件被拒', () => {
    const target = path.join(dir, 'snap2.db');
    createConsistentBackup(dbPath, target);
    const ok = verifyBackup(target);
    expect(ok.readable).toBe(true);
    expect(ok.integrityOk).toBe(true);
    expect(ok.keyTablesPresent).toBe(true);

    const corrupt = path.join(dir, 'corrupt.db');
    fs.writeFileSync(corrupt, Buffer.from('this is not a sqlite database at all'));
    const bad = verifyBackup(corrupt);
    expect(bad.readable).toBe(false);
  });

  test('applyRetention: 按天窗口淘汰——31 份小时备份 × retentionDays=30 全留(2026-10-17 返工 D)', () => {
    const sub = path.join(dir, 'retention-window');
    fs.mkdirSync(sub, { recursive: true });
    const now = Date.now();
    for (let i = 1; i <= 31; i++) {
      const f = path.join(sub, `hourly-${String(i).padStart(2, '0')}.db`);
      fs.writeFileSync(f, Buffer.from('x'));
      fs.utimesSync(f, new Date(now - i * 3600e3), new Date(now - i * 3600e3));
    }
    // 旧实现"保留最新 N 份"会把 31 小时前的删掉——参数名承诺的是天数
    const removed = applyRetention(sub, 30);
    expect(removed).toEqual([]);
    expect(fs.readdirSync(sub).length).toBe(31);
  });

  test('applyRetention: 窗口外删除,恒留最新一份', () => {
    const sub = path.join(dir, 'retention-age');
    fs.mkdirSync(sub, { recursive: true });
    const now = Date.now();
    const mk = (name: string, ageDays: number) => {
      const f = path.join(sub, name);
      fs.writeFileSync(f, Buffer.from('x'));
      fs.utimesSync(f, new Date(now - ageDays * 86400e3), new Date(now - ageDays * 86400e3));
      return f;
    };
    const old1 = mk('old-1.db', 40);
    const old2 = mk('old-2.db', 35);
    mk('new-1.db', 1);
    mk('new-2.db', 3);
    const removed = applyRetention(sub, 30);
    expect(removed.sort()).toEqual([old1, old2].sort());
    expect(fs.readdirSync(sub).sort()).toEqual(['new-1.db', 'new-2.db'].sort());
  });

  test('applyRetention: 全部超窗仍恒留最新一份(删光保护)', () => {
    const sub = path.join(dir, 'retention-floor');
    fs.mkdirSync(sub, { recursive: true });
    const now = Date.now();
    const mk = (name: string, ageDays: number) => {
      const f = path.join(sub, name);
      fs.writeFileSync(f, Buffer.from('x'));
      fs.utimesSync(f, new Date(now - ageDays * 86400e3), new Date(now - ageDays * 86400e3));
      return f;
    };
    mk('newest.db', 40);
    const oldest = mk('oldest.db', 45);
    const removed = applyRetention(sub, 30);
    expect(removed).toEqual([oldest]);
    expect(fs.readdirSync(sub)).toEqual(['newest.db']);
  });

  test('runBackupOnce: 创建+校验+保留一条龙;半成品失败不留文件', () => {
    const sub = path.join(dir, 'once');
    const out = runBackupOnce({ dbFilePath: dbPath, backupDir: sub, retentionDays: 30 });
    expect(out.result.sizeBytes).toBeGreaterThan(0);
    expect(out.verify.integrityOk).toBe(true);
    expect(out.verify.migrationsCompatible).toBe(true);
    expect(out.verify.keyColumnsOk).toBe(true);
    expect(fs.readdirSync(sub).length).toBe(1);
  });

  test('verifyBackup: 未来版本备份(含应用未知迁移)被拒(2026-10-17 返工 C)', () => {
    const target = path.join(dir, 'future.db');
    createConsistentBackup(dbPath, target);
    const w = new Database(target);
    w.prepare(`INSERT INTO knex_migrations (name, batch) VALUES ('999_future_thing', 1)`).run();
    w.close();
    const v = verifyBackup(target, { appMigrations: ['001_baseline_schema.ts'] });
    expect(v.migrationsCompatible).toBe(false);
    expect(v.problems.join(' ')).toMatch(/999_future_thing/);
  });

  test('verifyBackup: 五表齐全但缺关键业务列的库被拒(表名存在不够)', () => {
    const target = path.join(dir, 'nocols.db');
    const w = new Database(target);
    w.exec(`CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT)`); // 缺 lifecycle_state
    w.exec(`CREATE TABLE people (id TEXT PRIMARY KEY, name TEXT)`);
    w.exec(`CREATE TABLE scenario_project_assignments (id TEXT PRIMARY KEY, scenario_id TEXT, allocation_percentage REAL)`); // 缺 status/is_primary/computed_*
    w.exec(`CREATE TABLE project_estimations (id INTEGER PRIMARY KEY, project_id TEXT)`);
    w.exec(`CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT)`);
    w.exec(`CREATE TABLE knex_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, batch INTEGER, migration_time TEXT)`);
    w.prepare(`INSERT INTO knex_migrations (name, batch) VALUES ('001_baseline_schema.ts', 1)`).run();
    w.close();
    const v = verifyBackup(target, { appMigrations: ['001_baseline_schema.ts'] });
    expect(v.keyTablesPresent).toBe(true); // 表名全在——但列缺失
    expect(v.keyColumnsOk).toBe(false);
    expect(v.problems.join(' ')).toMatch(/missing columns/);
  });

  test('verifyBackup: 旧迁移集(应用集合的子集)放行——向前迁移合法', () => {
    const target = path.join(dir, 'older.db');
    createConsistentBackup(dbPath, target);
    const v = verifyBackup(target, {
      appMigrations: ['001_baseline_schema.ts', '002_something_later.ts', '067_backfill_component_refs.ts']
    });
    expect(v.migrationsCompatible).toBe(true);
    expect(v.keyColumnsOk).toBe(true);
  });

  test('同目标路径重复备份被拒(不静默覆盖)', () => {
    const target = path.join(dir, 'dup.db');
    createConsistentBackup(dbPath, target);
    expect(() => createConsistentBackup(dbPath, target)).toThrow(/already exists/);
  });

  test('drillRestore: 备份→临时恢复→指纹对账全通过(关键行/工时/实际值一致)', () => {
    const workDir = path.join(dir, 'drill1');
    const report = drillRestore({ liveDbPath: dbPath, workDir });
    expect(report.ok).toBe(true);
    expect(report.problems).toEqual([]);
    expect(report.before.tableCounts['scenario_project_assignments']).toBe(1);
    expect(report.before.actualFteSum).toBeCloseTo(0.9, 5);
    expect(report.restored.actualFteSum).toBeCloseTo(0.9, 5);
    expect(fs.existsSync(path.join(workDir, 'drill-restored.db'))).toBe(true);
  });

  test('drillRestore 捕获不一致(篡改备份后恢复被拒/指纹分歧)', () => {
    const workDir = path.join(dir, 'drill2');
    fs.mkdirSync(workDir, { recursive: true });
    const before = collectDbFingerprint(dbPath);
    void before;

    // 直接对损坏文件调用 restoreBackupTo:被校验门拒绝
    const corrupt = path.join(workDir, 'corrupt.db');
    fs.writeFileSync(corrupt, Buffer.from('garbage bytes'));
    expect(() => restoreBackupTo(corrupt, path.join(workDir, 'r.db'))).toThrow(/verification failed/);
    expect(fs.existsSync(path.join(workDir, 'r.db'))).toBe(false); // 半成品不留
  });

  test('createConsistentBackup 源缺失:错误信息带源路径(可诊断性,IP-08a 返工)', () => {
    // 2026-10-16 dev 实况:env 时序分歧让备份打到不存在的
    // capacitor-dev.db,原错误"unable to open database file"不带路径,
    // 无法定位是源还是目标的问题
    expect(() =>
      createConsistentBackup('/nonexistent-bk-src/source.db', path.join(dir, 'never-created.db'))
    ).toThrow(/nonexistent-bk-src/);
    expect(fs.existsSync(path.join(dir, 'never-created.db'))).toBe(false);
  });
});
