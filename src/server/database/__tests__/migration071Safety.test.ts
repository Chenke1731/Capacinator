import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import knexFactory from 'knex';
import path from 'path';
import fs from 'fs';

/**
 * 迁移 071 执行安全守卫（Codex 2026-10-17 复审，静默数据丢失已复现）：
 *
 * 071（scenarios 表重建）内部结构 = 连接级 `PRAGMA foreign_keys=OFF` +
 * 自建事务内 DROP 旧表。SQLite 事务内 PRAGMA 是 no-op——当执行器把 up()
 * 再包一层事务时（knex migrate 对每个迁移**默认包事务**，生产
 * initializeDatabase→migrate.latest 正是此路径），OFF 不生效，DROP 旧表
 * 触发 spa.scenario_id ON DELETE CASCADE **静默删光全部场景分配**并断
 * 分支父子链（SET NULL），迁移仍返回成功。dev 库当时幸免只因 migrate.ts
 * 脚本连接 FK 默认 OFF。
 *
 * 契约：
 *   (a) 裸跑（无外层事务，FK ON 连接）：数据必须完好（基线+分配+父子链）
 *   (b) 被事务包裹（错误配置/旧执行器）：必须**抛错拒绝**，绝不静默删数据
 * 测试逐文件 up 到 070 建库（071 之前的真迁移），再以两种方式重放 071。
 */
const MIG = path.join(process.cwd(), 'src/server/database/migrations');
const BASELINE = 'baseline-0000-0000-0000-000000000000';

async function buildDbWithStockData() {
  const db: any = knexFactory({ client: 'better-sqlite3', connection: ':memory:', useNullAsDefault: true, pool: { min: 1, max: 1 } });
  const files = fs.readdirSync(MIG).filter((f) => f.endsWith('.ts') && !f.startsWith('071')).sort();
  for (const f of files) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(path.join(MIG, f)) as { up?: (k: unknown) => Promise<void> };
    if (mod.up) await mod.up(db);
  }
  await db('project_types').insert({ id: 'pt1', name: '软件' });
  await db('project_sub_types').insert({ id: 'pst1', project_type_id: 'pt1', name: '交付' });
  await db('roles').insert({ id: 'r1', name: '开发' });
  await db('projects').insert({ id: 'prj1', name: '事项甲', project_sub_type_id: 'pst1' });
  await db('people').insert({ id: 'p1', name: '张三', default_availability_percentage: 100, default_hours_per_day: 8, is_active: 1 });
  await db('scenarios').insert([
    { id: BASELINE, name: '基线', status: 'active', scenario_type: 'baseline', created_by: 'p1' },
    { id: 'br-1', name: '分支', status: 'active', scenario_type: 'branch', parent_scenario_id: BASELINE, created_by: 'p1' }
  ]);
  await db('scenario_project_assignments').insert([
    { id: 'a-1', scenario_id: BASELINE, project_id: 'prj1', person_id: 'p1', role_id: 'r1', allocation_percentage: 40, status: 'active', change_type: 'added' },
    { id: 'a-2', scenario_id: 'br-1', project_id: 'prj1', person_id: 'p1', role_id: 'r1', allocation_percentage: 80, status: 'active', change_type: 'added' }
  ]);
  return db;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const m71 = require(path.join(MIG, '071_scenarios_created_by_set_null.ts')) as {
  up: (k: unknown) => Promise<void>;
};

const dataIntact = async (db: any): Promise<string[]> => {
  const problems: string[] = [];
  const c = await db('scenario_project_assignments').count('* as c').first();
  if (Number(c.c) !== 2) problems.push(`spa 行数 ${c.c} ≠ 2（应为 2）`);
  const br = await db('scenarios').where({ id: 'br-1' }).first();
  if (br?.parent_scenario_id !== BASELINE) problems.push(`分支父子链断裂: parent=${br?.parent_scenario_id}`);
  return problems;
};

describe('迁移 071 执行安全（真迁移库+存量数据）', () => {
  test('(a) 裸跑(FK ON 连接,无外层事务): 数据完好', async () => {
    const db = await buildDbWithStockData();
    try {
      await db.raw('PRAGMA foreign_keys = ON');
      await m71.up(db);
      expect(await dataIntact(db)).toEqual([]);
    } finally {
      await db.destroy();
    }
  });

  test('(b) 被外层事务包裹(knex migrate 默认行为): 必须抛错拒绝,绝不静默删数据', async () => {
    const db = await buildDbWithStockData();
    try {
      await db.raw('PRAGMA foreign_keys = ON');
      let threw = false;
      try {
        await db.transaction(async (trx: unknown) => { await m71.up(trx); });
      } catch {
        threw = true; // 拒绝执行 = 可接受结局(数据不丢)
      }
      const problems = await dataIntact(db);
      // 要么抛错拒绝,要么数据完好——静默删数据不可接受
      expect(threw || problems.length === 0).toBe(true);
      if (!threw) return;
      // 抛错场景下数据必须原样
      expect(problems).toEqual([]);
    } finally {
      await db.destroy();
    }
  }, 20000);
});
