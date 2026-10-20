// 真实 exceljs 经 jest 互操作桥:动态 import 的 .default 形状必须存在
jest.mock('exceljs', () => {
  const actual = jest.requireActual('exceljs');
  return { __esModule: true, ...actual, default: actual };
});

// eslint-disable-next-line import/first
import { ExcelImporter } from '../../../../../src/server/services/import/ExcelImporter.js';
// eslint-disable-next-line import/first
import { ExcelImporterV2 } from '../../../../../src/server/services/import/ExcelImporterV2.js';
// eslint-disable-next-line import/first
import knexFactory from 'knex';
// eslint-disable-next-line import/first
import fs from 'fs';
// eslint-disable-next-line import/first
import path from 'path';
// eslint-disable-next-line import/first
import os from 'os';

/**
 * 导入器清库清单 × 真实迁移 schema（IP-05b，2026-10-17）：
 * 两起掩盖事故的对照守卫——
 * 1. 单测手写 DDL 漂移（scenarios.status CHECK 缺失掩盖 500）；
 * 2. V2.analyze 夹具手建 supervisor_delegations 表，把"清单含不存在表"
 *    的雷盖住（真库 clearExisting 必炸 no such table）。
 * 本测试跑**真迁移**建库（personUtilizationView 模式），不手建任何表：
 * schema=迁移真身，清单里任何不存在的表名当场暴露。
 */
const MIGRATIONS = path.join(process.cwd(), 'src/server/database/migrations');
const BASELINE = 'baseline-0000-0000-0000-000000000000';

describe('导入器清库清单 × 真实迁移 schema (IP-05b)', () => {
  let db: any;
  let v1Path: string;
  let v2Path: string;

  beforeAll(async () => {
    // pool 形态必须复刻生产 knexfile(max:1)——导入器混用 trx 与 this.db,
    // 多连接时 FK 跨连接不可见会炸出生产不存在的分裂;生产单连接无此问题
    db = knexFactory({
      client: 'better-sqlite3',
      connection: ':memory:',
      useNullAsDefault: true,
      pool: { min: 0, max: 1 }
    });
    // 手动按文件名序执行迁移源码(knex migrate runner 的 ESM 动态 import
    // 在 jest CJS 环境不可用)——测试库 schema=迁移真身,非手写 DDL
    const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.ts')).sort();
    for (const f of files) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require(path.join(MIGRATIONS, f)) as { up?: (k: unknown) => Promise<void> };
      if (mod.up) await mod.up(db);
    }
    const hasBaseline = await db('scenarios').where({ id: BASELINE }).first();
    if (!hasBaseline) {
      // 真迁移库有 FK(scenarios.created_by → people)——先造人再插场景
      await db('people').insert({
        id: 'test-creator', name: '夹具创建者', is_active: 1,
        default_availability_percentage: 100, default_hours_per_day: 8
      });
      await db('scenarios').insert({
        id: BASELINE, name: '基线', status: 'active', scenario_type: 'baseline', created_by: 'test-creator'
      });
    }

    const ExcelJS = (await import('exceljs')).default as any;

    // V1 最小工作簿:People + Projects + Standard Allocations(执行段列头)
    const wb1 = new ExcelJS.Workbook();
    const people = wb1.addWorksheet('People');
    people.addRow(['Name', 'Primary Role']);
    people.addRow(['张开发', '开发']);
    const projects = wb1.addWorksheet('Projects');
    projects.addRow(['Project Name', 'Project Type', 'Location', 'Priority']);
    projects.addRow(['事项甲', '交付', '北京', '1']);
    const alloc = wb1.addWorksheet('Standard Allocations');
    alloc.addRow(['Project Type', 'Phase', 'Role', 'Allocation %']);
    alloc.addRow(['交付', '设计', '开发', 50]);
    v1Path = path.join(os.tmpdir(), `v1-clear-${Date.now()}.xlsx`);
    await wb1.xlsx.writeFile(v1Path);

    // V2 最小工作簿(照 V2.analyze.test 格式)
    const wb2 = new ExcelJS.Workbook();
    const types = wb2.addWorksheet('Project Types');
    types.addRow(['Name']);
    types.addRow(['Feature']);
    const roles = wb2.addWorksheet('Roles');
    roles.addRow(['Role', 'Plan Owner', 'CW Option', 'Data Access']);
    roles.addRow(['开发', '', '', '']);
    const roster = wb2.addWorksheet('Roster');
    roster.addRow(['Name', 'Role']);
    roster.addRow(['张开发', '开发']);
    const v2Projects = wb2.addWorksheet('Projects');
    v2Projects.addRow(['Project/Site', 'Project Type', 'Inc. in Demand', 'Priority']);
    v2Projects.addRow(['Feature @ TestSite', 'Feature', 'Y', '1']);
    const assignments = wb2.addWorksheet('Project Assignments');
    assignments.addRow(['Project/Site', 'Person', 'Role', '26FW45', '26FW46']);
    assignments.addRow(['Feature @ TestSite', '张开发', '开发', 0.5, 0.5]);
    v2Path = path.join(os.tmpdir(), `v2-clear-${Date.now()}.xlsx`);
    await wb2.xlsx.writeFile(v2Path);
  });

  afterAll(async () => {
    for (const p of [v1Path, v2Path]) {
      try { fs.unlinkSync(p); } catch { /* temp 清理尽力而为 */ }
    }
    await db.destroy();
  });

  beforeEach(async () => {
    // 用例隔离 + 造"存量旧数据"供 clearExisting 证明清空
    await db('resource_templates').del();
    await db('projects').del();
    await db('people').del();
    await db('person_roles').del();
    await db('project_phases').del();
    await db('roles').del();
    await db('project_types').del();
    await db('locations').del();
    await db('project_sub_types').del();
    await db('scenario_project_assignments').where({ scenario_id: BASELINE }).del();
    await db('scenario_project_phases').where({ scenario_id: BASELINE }).del();
    await db('resource_templates').insert({
      id: 'rt-old', project_type_id: null, phase_id: null, role_id: null,
      allocation_percentage: 99, created_at: new Date(), updated_at: new Date()
    });
    await db('project_types').insert({ id: 'pt-old', name: '旧类型', created_at: new Date() });
    // projects 旧数据(真库 NOT NULL 链:type→sub_type→project)
    await db('project_types').insert({ id: 'pt-st', name: '存量类型', created_at: new Date() }).onConflict().ignore();
    await db('project_sub_types').insert({ id: 'pst-old', project_type_id: 'pt-st', name: '存量子类' }).onConflict().ignore();
    await db('projects').insert({ id: 'prj-old', name: '存量事项', project_sub_type_id: 'pst-old', created_at: new Date() });
  });

  test('V2 清库事务在真实 schema 上不再撞不存在表(旧雷:supervisor_delegations)', async () => {
    // 直调清库事务(本批修复的单元):旧清单对 supervisor_delegations
    // del() 抛 no such table——真迁移库上当场暴露(V2.analyze 夹具
    // 手建此表曾把雷盖住)
    const importer = new ExcelImporterV2(db);
    const clear = (importer as unknown as {
      clearExistingDataInTransaction: (trx: unknown, scenarioId: string) => Promise<void>;
    });
    await db.transaction(async (trx: unknown) => {
      await clear.clearExistingDataInTransaction(trx, BASELINE);
    });
    expect(await db('resource_templates').where({ id: 'rt-old' }).first()).toBeUndefined();
    expect(await db('projects').where({ id: 'prj-old' }).first()).toBeUndefined();
    // 场景切片同清
    expect(await db('scenario_project_assignments').where({ scenario_id: BASELINE }).count('* as c').first()).toMatchObject({ c: 0 });
  });

  // 2026-10-17 已结案:根因=scenarios.created_by ON DELETE CASCADE——清库
  // 删 people 把 baseline 场景级联删光,分配 scenario_id FK 失败整体回滚。
  // 迁移 071(created_by 可空+SET NULL)修复,用例从 test.failing 转正。
  test('V2 全流程导入在真实迁移库(FK 开启)上成功', async () => {
    const result = await new ExcelImporterV2(db).importFromFile(v2Path, {
      clearExisting: true,
      scenarioId: BASELINE
    });
    expect(result.success).toBe(true);
    expect(result.errors ?? []).toEqual([]);
    // 分配真实落库到选定场景切片
    const rows = await db('scenario_project_assignments').where({ scenario_id: BASELINE });
    expect(rows.length).toBeGreaterThan(0);
    // baseline 场景行在清库+导入后仍然存活(删人不再级联删场景)
    expect(await db('scenarios').where({ id: BASELINE }).first()).toBeDefined();
  });

  test('V1 clearExisting 执行成功:旧 resource_templates 行被清、新数据真实落库', async () => {
    const result = await new ExcelImporter(db).importFromFile(v1Path, { clearExisting: true });
    expect(result.success).toBe(true);
    expect(result.errors ?? []).toEqual([]);
    // 旧行(99%)被清单清空,新行(50%)由导入写入
    const rows = await db('resource_templates').select('*');
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].allocation_percentage)).toBe(50);
    // projects/people 真实导入
    expect(await db('projects').where({ name: '事项甲' }).first()).toBeDefined();
    expect(await db('people').where({ name: '张开发' }).first()).toBeDefined();
  });

  test('scenarios.created_by FK = SET NULL 且列可空(迁移 071 契约)', async () => {
    // 旧库:CASCADE + NOT NULL——清库删人会把 baseline 场景级联删光,
    // 系统读侧(切片/视图)全瞎,且导入分配 scenario_id FK 失败整体回滚
    const fks = await db.raw('PRAGMA foreign_key_list(scenarios)');
    const createdByFk = (fks as Array<{ table: string; from: string; to: string; on_delete: string }>)
      .find((f) => f.table === 'people' && f.from === 'created_by');
    expect(createdByFk?.on_delete).toBe('SET NULL');
    // 列可空:删人后场景保留,创建者置空
    const cols = await db.raw('PRAGMA table_info(scenarios)');
    const col = (cols as Array<{ name: string; notnull: number }>).find((c) => c.name === 'created_by');
    expect(col?.notnull).toBe(0);
  });

  test('删人保场景:清空 people 后 baseline 场景行存活、created_by 置空', async () => {
    await db('people').del();
    const baseline = await db('scenarios').where({ id: BASELINE }).first();
    expect(baseline).toBeDefined();
    expect(baseline.created_by).toBeNull();
  });

  test('V1 analyzeImport 预览:旧表名查询不炸,删除面覆盖真实清单(不再只报 1 类)', async () => {
    const analysis = await new ExcelImporter(db).analyzeImport(v1Path, { clearExisting: true });
    // 旧实现:this.db('standard_allocations').count() 对改名后的库直接抛
    // → 外层 catch → errors 含 "Analysis failed"
    expect(analysis.errors.join(' ')).not.toMatch(/Analysis failed/);
    // 删除面诚实化:clearExisting 实际清整张清单,预览必须逐表报数。
    // 旧平行实现有双报缺陷:analyzeProjectsWorksheet 与主流程各报一次
    // projects(同一表两条凑数);delegation 后每表至多一条(2026-10-20)
    const deleted = analysis.preview.deletedEntities;
    const coveredTypes = new Set(deleted.map((d: { type: string }) => d.type));
    expect(coveredTypes.has('resource_templates')).toBe(true);
    expect(coveredTypes.has('projects')).toBe(true);
    expect(coveredTypes.has('project_types')).toBe(true);
    expect(deleted.length).toBe(coveredTypes.size);
    // 报数与真实行数一致
    const byType = new Map(deleted.map((d: { type: string; count: number }) => [d.type, d.count]));
    expect(byType.get('projects')).toBe(1);
    expect(byType.get('project_types')).toBe(2);
  });
});
