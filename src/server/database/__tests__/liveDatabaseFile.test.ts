import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import knexFactory from 'knex';
import { getLiveDatabaseFile } from '../index.js';

/**
 * 活连接文件名原语（2026-10-16 IP-08a 返工）：
 * knexfile 的 `export default getConfig()` 在 import 时就固化了 filename——
 * ESM 静态 import 先于 index.ts 的 dotenv 执行，主连接拿默认名
 * data/capacitor.db；调度器晚于 env 装载再解析 env 拿到不存在的
 * capacitor-dev.db，readonly 打开必败("unable to open database file")。
 * 备份源必须以活连接的 connectionSettings.filename 为唯一真相，
 * 不得二次解析 env——本函数即该唯一入口。
 */
describe('getLiveDatabaseFile (活连接文件名)', () => {
  let db: ReturnType<typeof knexFactory>;

  beforeAll(() => {
    db = knexFactory({
      client: 'better-sqlite3',
      connection: { filename: '/tmp/live-connection-A.db' },
      useNullAsDefault: true
    });
  });

  afterAll(async () => {
    await db.destroy();
  });

  test('返回传入连接的实际 filename,无视 env 再解析', () => {
    const prev = process.env.DB_FILENAME;
    process.env.DB_FILENAME = '/tmp/env-says-B.db';
    try {
      expect(getLiveDatabaseFile(db)).toBe('/tmp/live-connection-A.db');
    } finally {
      if (prev === undefined) delete process.env.DB_FILENAME;
      else process.env.DB_FILENAME = prev;
    }
  });

  test('连接设置缺失时回落到 resolveDatabaseFile 而非抛错', () => {
    const fakeClient = { connectionSettings: {} };
    expect(typeof getLiveDatabaseFile({ client: fakeClient } as never)).toBe('string');
  });
});
