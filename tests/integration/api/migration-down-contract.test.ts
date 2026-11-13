/**
 * 迁移 down 契约（G-F1 / 后端评审 F1，Codex P2#6）：
 * 视图重建族迁移的 down() 必须可执行——076 down 的 SQL 损坏（别名/括号/
 * 谓词）在真实回滚时才炸，且事务外执行会连带把视图删没。测试在**独立
 * 内存库**上重建全链迁移后，对每个视图族迁移按升序逐个 down→up：
 * - down/up 全程零抛错；
 * - 结束后 sqlite_master 视图数与全链 up 后一致（回到当前形态）。
 *
 * 升序处理保证最后一个被 cycle 的是最新视图迁移，收尾形态=当前形态。
 * 变异自证：向任一视图迁移 down 注入语法错误（如 076 原始损坏形态）→ 红。
 */
import { describe, test, expect } from '@jest/globals';
import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import knex from 'knex';

const MIGRATIONS_DIR = path.resolve('src/server/database/migrations');

function loadMigrations(): Array<{ name: string; up: (db: any) => Promise<void>; down: (db: any) => Promise<void>; isView: boolean }> {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.ts')).sort();
  return files.map((file) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(path.join(MIGRATIONS_DIR, file));
    const source = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    // 纯视图重建迁移：只 DROP/CREATE VIEW，不含任何表级 DDL 或数据写——
    // 混合迁移（如 001/035/055）的 down 会删表/回滚列，不能独立 cycle。
    const touchesViews = /CREATE VIEW|DROP VIEW/i.test(source);
    const touchesTablesOrData =
      /createTable|dropTable|alterTable|renameTable|\.schema\.table\(|ALTER TABLE|CREATE TABLE|DROP TABLE|CREATE (UNIQUE )?INDEX|DROP INDEX|\.insert\(|\.update\(|\.del\(|INSERT INTO|UPDATE \w+ SET|DELETE FROM/i.test(
        source
      );
    return {
      name: file,
      up: mod.up,
      down: mod.down,
      isView: touchesViews && !touchesTablesOrData,
    };
  });
}

describe('G-F1 迁移 down 契约：视图族迁移 down+up 可执行', () => {
  test('全链 up 后逐个 down→up 零抛错，视图数收尾一致', async () => {
    const db = knex({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    });
    try {
      const migrations = loadMigrations();
      expect(migrations.length).toBeGreaterThan(0);

      for (const migration of migrations) {
        await migration.up(db);
      }
      const viewCount = async () =>
        Number(
          (await db.raw(`SELECT COUNT(*) as c FROM sqlite_master WHERE type='view'`))[0]?.c ?? 0
        );
      const countAfterUp = await viewCount();
      expect(countAfterUp).toBeGreaterThan(0);

      const viewMigrations = migrations.filter((m) => m.isView && typeof m.down === 'function');
      expect(viewMigrations.length).toBeGreaterThan(0);

      for (const migration of viewMigrations) {
        await migration.down(db);
        await migration.up(db);
      }

      expect(await viewCount()).toBe(countAfterUp);
    } finally {
      await db.destroy();
    }
  }, 120_000);
});
