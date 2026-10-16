import { describe, test, expect, afterAll } from '@jest/globals';
import fs from 'fs';

/**
 * getDb() 惰性取配置（2026-10-16 C′ 方案，env 声明生效性修复）：
 * knexfile 的 `export default getConfig()` 在 import 时固化 filename——
 * ESM 静态 import 先于 index.ts 的 dotenv 执行，主连接拿默认名
 * capacitor.db，.env.development 声明的名字从未生效（历史上是
 * capacinator-dev.db，现为对齐现实的 capacitor.db）。备份调度器与
 * 一切晚于 env 装载的消费方读到的却是声明名——两个真相源分歧。
 *
 * 本测试复刻该时序：先加载 knexfile（env 未设），再设置 DB_FILENAME，
 * 然后 getDb()——连接必须吃 env 声明，而不是 import 期的固化值。
 */
const TMP_DB = '/tmp/getdb-lazy-config-test.db';

describe('getDb() 惰性取配置(env 晚于模块加载仍生效)', () => {
  const prevFilename = process.env.DB_FILENAME;
  let db: { destroy: () => Promise<void>; client: { connectionSettings: { filename?: string } } } | null = null;

  afterAll(async () => {
    if (db) await db.destroy();
    if (fs.existsSync(TMP_DB)) fs.unlinkSync(TMP_DB);
    if (prevFilename === undefined) delete process.env.DB_FILENAME;
    else process.env.DB_FILENAME = prevFilename;
    jest.resetModules();
  });

  test('knexfile 加载后才设置 DB_FILENAME,连接仍用 env 声明', () => {
    delete process.env.DB_FILENAME;
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../knexfile.js'); // import 期固化(旧病灶)——env 此刻未设
    process.env.DB_FILENAME = TMP_DB; // 模拟 dotenv 晚于 ESM import 装载
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getDb } = require('../index.js') as {
      getDb: () => { destroy: () => Promise<void>; client: { connectionSettings: { filename?: string } } };
    };

    db = getDb();
    expect(db.client.connectionSettings.filename).toBe(TMP_DB);
  });
});
