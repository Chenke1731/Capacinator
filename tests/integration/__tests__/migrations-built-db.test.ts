/**
 * IP-01 / 真实 schema 入口: 集成库必须由 migrations 建出（同一份源码）。
 *
 * 旧 setup 用笔写 test-schema*.sql（1294 行 DDL）,漂移两向都是雷——已知实锤:
 * scenarios.status CHECK 只允许 active/archived/merged,手写 DDL 缺 CHECK 曾
 * 掩盖"写 'conflict' 真库必 500"（台账 2026-10-17 合并契约返工行）。本守卫
 * 断言共享测试库的三个 migrations 指纹,setup 回退手写 DDL 即红。
 */
import { db } from '../setup';

describe('集成库由 migrations 建出 (IP-01)', () => {
  test('knex_migrations 账本存在且 63 条迁移全记录', async () => {
    const tables = await db('sqlite_master').where({ type: 'table' }).select('name');
    const names = tables.map((t: { name: string }) => t.name);
    expect(names).toContain('knex_migrations');
    const [{ count }] = await db('knex_migrations').count('* as count');
    expect(Number(count)).toBeGreaterThanOrEqual(63);
  });

  test('assignments_view 视图存在（migrations 032/035 建,手写 DDL 无）', async () => {
    const views = await db('sqlite_master').where({ type: 'view' }).select('name');
    const names = views.map((v: { name: string }) => v.name);
    expect(names).toContain('assignments_view');
  });

  test('scenarios.status CHECK 约束在库（手写 DDL 曾缺失,掩盖 conflict 500）', async () => {
    const [row] = await db('sqlite_master').where({ type: 'table', name: 'scenarios' }).select('sql');
    // knex 落库形态: check (`status` in ('active','archived','merged')) —— 反引号列名
    expect(row?.sql).toMatch(/check\s*\(\s*`?status`?\s+in/i);
  });

  test('project_health_view 为场景切片定义（I01z / 075；回退读旧表即红）', async () => {
    // 006 版只读旧表 project_assignments（运行时 0 行）→ spa 轨数据下分配健康
    // 恒 UNASSIGNED。075 改读 effective_project_assignments 的 baseline 切片；
    // 手写 DDL/迁移回退都会丢 epa 与 baseline 条件——指纹钉住。
    const [row] = await db('sqlite_master').where({ type: 'view', name: 'project_health_view' }).select('sql');
    expect(row?.sql).toMatch(/effective_project_assignments/i);
    expect(row?.sql).toMatch(/baseline-0000-0000-0000-000000000000/);
    expect(row?.sql).not.toMatch(/FROM\s+project_assignments\b/i);
  });

  test('demand_intake 表 + rejected 豁免唯一索引在库（I01 / 074）', async () => {
    const tables = await db('sqlite_master').where({ type: 'table' }).select('name');
    expect(tables.map((t: { name: string }) => t.name)).toContain('demand_intake');

    // 074 的关键语义：部分唯一索引排除 rejected（被拒编号可重新捕获）。
    // 手写 DDL/旧迁移回退都会丢 WHERE 子句——指纹必须钉住。
    const indexes = await db('sqlite_master').where({ type: 'index' }).select('name', 'sql');
    const unique = indexes.find((i: { name: string }) => i.name === 'idx_demand_intake_source_ref_unique');
    expect(unique?.sql).toMatch(/source_channel/i);
    expect(unique?.sql).toMatch(/status\s*<>\s*'rejected'/i);

    // status/source_channel 的 CHECK 同样来自 074（table.enum 落库形态）
    const [row] = await db('sqlite_master').where({ type: 'table', name: 'demand_intake' }).select('sql');
    expect(row?.sql).toMatch(/check\s*\(\s*`?status`?\s+in/i);
    expect(row?.sql).toMatch(/check\s*\(\s*`?source_channel`?\s+in/i);
  });
});
