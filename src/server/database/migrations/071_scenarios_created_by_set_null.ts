import { Knex } from 'knex';

/**
 * scenarios.created_by FK: CASCADE → 可空 + SET NULL（2026-10-17，IP-05b FK 雷根因修复）。
 *
 * 事故链（真迁移守卫测试 importClearTables 实锤）:导入清库清单删 people →
 * scenarios.created_by ON DELETE CASCADE 把 baseline 场景行级联删光 →
 * (a) V2 导入分配 scenario_id FK 失败,整个导入回滚;
 * (b) 即便不回滚,baseline 消失后运行时读侧(切片/视图/effectiveAssignments)全瞎。
 *
 * 语义修正:场景是共享资产,不是创建者的附属——删人应保留场景并把创建者
 * 置空(展示侧 created_by_name 已全部容空)。SQLite 改 FK 需表重建
 * (024 先例):存依赖视图 → 建新表(唯一差异=created_by 可空+SET NULL) →
 * 拷数 → 换名 → 重建视图。
 */
export async function up(knex: Knex): Promise<void> {
  // 视图按依赖闭包处理:rename 会重编译引用表名的视图,遇到已 drop 的
  // 被依赖视图(utilization_report_view→assignments_view 二层链)即炸——
  // 存+drop **全部**视图再全部重建,不受闭包遗漏影响(视图总量 ~11,代价小)
  const allViews = await knex.raw(
    `SELECT name, sql FROM sqlite_master WHERE type='view'`
  );
  const viewDefinitions = (allViews as Array<{ name: string; sql: string }>).filter((v) => v.sql);
  for (const v of viewDefinitions) {
    await knex.raw(`DROP VIEW IF EXISTS ${v.name}`);
  }

  // ── 执行安全(2026-10-17 Codex 复审修复)──────────────────────────
  // SQLite 事务内 PRAGMA foreign_keys 是 no-op。knex migrate 对每个迁移
  // **默认包事务**(Migrator._useTransaction)——外层事务下原先的
  // "PRAGMA OFF→自建事务内 DROP"结构会让 OFF 不生效,DROP 旧表触发
  // spa.scenario_id ON DELETE CASCADE **静默删光全部场景分配**并断分支
  // 父子链,迁移仍返回成功(dev 幸免只因 migrate.ts 连接 FK 默认 OFF)。
  // 修复:①config.transaction=false 让执行器裸跑本迁移;②PRAGMA 后读回
  // 自检,仍身处事务(FK 关不掉)则抛错拒绝——宁可迁移失败,绝不静默丢数据。
  await knex.raw('PRAGMA foreign_keys = OFF');
  const fkProbe = (await knex.raw('PRAGMA foreign_keys')) as unknown as Array<{ foreign_keys: number }>;
  const fkOff = Array.isArray(fkProbe) ? Number(fkProbe[0]?.foreign_keys) : Number((fkProbe as any)?.[0]?.foreign_keys);
  if (fkOff !== 0) {
    throw new Error(
      '071 refuses to run: PRAGMA foreign_keys=OFF did not take effect ' +
      '(likely wrapped in an outer transaction) — dropping the old scenarios table now would CASCADE-delete every scenario assignment. ' +
      'Run this migration without a wrapping transaction (config.transaction=false).'
    );
  }
  try {
    await knex.schema.createTable('scenarios_new', (table) => {
      // id 默认与 011 同款 uuid 表达式
      table.string('id', 36).primary().defaultTo(
        knex.raw(`(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))))`)
      );
      table.string('name', 255).notNullable();
      table.text('description');
      table.string('parent_scenario_id', 36).references('id').inTable('scenarios').onDelete('SET NULL');
      // 唯一差异:可空 + 删人置空(旧:NOT NULL + CASCADE)
      table.string('created_by', 36).nullable().references('id').inTable('people').onDelete('SET NULL');
      table.string('status').checkIn(['active', 'archived', 'merged']).defaultTo('active');
      table.string('scenario_type').checkIn(['baseline', 'branch', 'sandbox']).defaultTo('branch');
      table.timestamp('branch_point').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
    // 列序对齐 011(拷贝按名也安全,这里显式列出)
    await knex.raw(`
      INSERT INTO scenarios_new (id, name, description, parent_scenario_id, created_by, status, scenario_type, branch_point, created_at, updated_at)
      SELECT id, name, description, parent_scenario_id, created_by, status, scenario_type, branch_point, created_at, updated_at FROM scenarios
    `);
    await knex.schema.dropTable('scenarios');
    await knex.schema.renameTable('scenarios_new', 'scenarios');
  } finally {
    await knex.raw('PRAGMA foreign_keys = ON');
  }

  for (const v of viewDefinitions) {
    await knex.raw(v.sql);
  }
}

/** knex migrate 默认给每个迁移包事务——本迁移必须裸跑(PRAGMA 是连接级
 * 且事务内无效,见 up 内自检)。此开关是执行安全的一部分,不可移除。 */
export const config = { transaction: false };

export async function down(knex: Knex): Promise<void> {
  // 不可逆降级:回 CASCADE 需先回填 created_by(people 不存在的行无处指)
  void knex;
  throw new Error('071 is not reversible: created_by rows referencing deleted people cannot be restored');
}
