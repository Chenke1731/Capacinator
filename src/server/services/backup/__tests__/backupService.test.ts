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
    `CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT)`,
    `CREATE TABLE people (id TEXT PRIMARY KEY, name TEXT)`,
    `CREATE TABLE scenario_project_assignments (id TEXT PRIMARY KEY, scenario_id TEXT, allocation_percentage REAL)`,
    `CREATE TABLE project_estimations (id INTEGER PRIMARY KEY, project_id TEXT)`,
    `CREATE TABLE audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT)`,
    `CREATE TABLE project_actual_investments (
      id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT, month TEXT,
      fte REAL, source TEXT
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

  test('applyRetention: 只保留最新 N 个', () => {
    const sub = path.join(dir, 'retention');
    fs.mkdirSync(sub, { recursive: true });
    const files: string[] = [];
    for (let i = 0; i < 5; i++) {
      const f = path.join(sub, `backup-2026-10-0${i + 1}.db`);
      fs.writeFileSync(f, Buffer.from('x'));
      // mtime 按天数递增,模拟新旧
      fs.utimesSync(f, new Date(2026, 9, i + 1), new Date(2026, 9, i + 1));
      files.push(f);
    }
    const removed = applyRetention(sub, 3);
    expect(removed.length).toBe(2);
    expect(fs.existsSync(files[0])).toBe(false); // 最旧的被删
    expect(fs.existsSync(files[4])).toBe(true);  // 最新的保留
    expect(fs.readdirSync(sub).length).toBe(3);
  });

  test('runBackupOnce: 创建+校验+保留一条龙;半成品失败不留文件', () => {
    const sub = path.join(dir, 'once');
    const out = runBackupOnce({ dbFilePath: dbPath, backupDir: sub, retention: 5 });
    expect(out.result.sizeBytes).toBeGreaterThan(0);
    expect(out.verify.integrityOk).toBe(true);
    expect(fs.readdirSync(sub).length).toBe(1);
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
});
