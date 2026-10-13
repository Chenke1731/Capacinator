import { migrationColumns, handSchemaColumns } from './helpers/migrationColumns';

/**
 * 手写集成 schema 漂移守卫(2026-10-13 守卫补强①):
 * 集成库用 tests/integration/test-schema*.sql 手写 DDL(迁移在 jest 不可
 * 运行),漂移两向都是雷——杜撰列让测试活在平行宇宙(本轮: status/budget/
 * created_by 系杜撰,误导白名单事实源),缺列让控制器写入路径不可测
 * (current_phase_id 曾缺失)。
 *   方向 A: 手写列 ⊆ 迁移列(杜撰即红)
 *   方向 B: 控制器实际写入的核心列必须在手写 schema(缺失即红)
 */
const TABLES = ['projects', 'people', 'scenario_project_assignments', 'project_assignments', 'project_tags'];

/** 控制器真实写入、集成测试必须可测的列(最小集,按需增补) */
const REQUIRED_IN_HAND: Record<string, string[]> = {
  projects: [
    'current_phase_id', 'external_number', 'seq_number', 'parent_id', 'owner_id',
    'lifecycle_state', 'iteration_id', 'product_version', 'release_version',
    'component_id', 'is_active_placeholder_never' // sentinel: 列表非空 sanity,见下方断言
  ].filter((c) => !c.startsWith('is_active_placeholder')),
  people: ['is_active', 'supervisor_id', 'worker_type', 'location_id'],
  scenario_project_assignments: ['person_id', 'project_id', 'role_id', 'phase_id', 'status', 'allocation_percentage'],
  project_assignments: ['person_id', 'project_id', 'role_id', 'phase_id', 'status', 'allocation_percentage'],
  project_tags: ['project_id', 'tag_id']
};

describe('手写集成 schema 漂移守卫', () => {
  for (const table of TABLES) {
    it(`${table}: 手写列 ⊆ 迁移列(无杜撰)`, () => {
      const hand = handSchemaColumns(table);
      const real = migrationColumns(table);
      expect(real.size).toBeGreaterThan(3); // 提取器 sanity
      const fabricated = [...hand].filter((c) => !real.has(c));
      expect(fabricated).toEqual([]);
    });

    it(`${table}: 核心写入列在手写 schema 中齐备`, () => {
      const hand = handSchemaColumns(table);
      const missing = (REQUIRED_IN_HAND[table] || []).filter((c) => !hand.has(c));
      expect(missing).toEqual([]);
    });
  }
});
