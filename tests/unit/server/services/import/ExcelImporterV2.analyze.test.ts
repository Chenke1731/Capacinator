import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import knexFactory from 'knex';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * ExcelImporterV2.analyzeImport — IP-05b/F04 预览与执行一致性。
 *
 * 真 better-sqlite3 内存库 + 真 exceljs:V2 预览跑的是真实导入管线
 * (事务回滚),预览数量即执行写入承诺;预览零落库;clearExisting 预览
 * 也不动现有数据。
 *
 * 简化 schema 只覆盖最小工作簿触及的表(project_types/roles/locations/
 * person_availability_overrides);完整迁移库一致性验收属 e2e 层(台账注明)。
 */

// 真实 exceljs 经 jest 互操作桥:动态 import 的 .default 形状必须存在
jest.mock('exceljs', () => {
  const actual = jest.requireActual('exceljs');
  return { __esModule: true, ...actual, default: actual };
});

// eslint-disable-next-line import/first
import { ExcelImporterV2 } from '../../../../../src/server/services/import/ExcelImporterV2';

const DDL = [
  `CREATE TABLE project_types (
    id TEXT PRIMARY KEY, name TEXT, description TEXT,
    created_at DATETIME, updated_at DATETIME
  )`,
  `CREATE TABLE roles (
    id TEXT PRIMARY KEY, name TEXT, description TEXT, external_id TEXT,
    created_at DATETIME, updated_at DATETIME
  )`,
  `CREATE TABLE project_phases (
    id TEXT PRIMARY KEY, name TEXT, description TEXT, order_index INTEGER,
    created_at DATETIME, updated_at DATETIME
  )`,
  `CREATE TABLE locations (
    id TEXT PRIMARY KEY, name TEXT, description TEXT,
    created_at DATETIME, updated_at DATETIME
  )`,
  `CREATE TABLE person_availability_overrides (
    id TEXT PRIMARY KEY, person_id TEXT, created_at DATETIME
  )`,
  // clearExistingDataInTransaction 逐表清空(88-107 行),空桩即可承接 del()
  `CREATE TABLE project_assignments (id TEXT PRIMARY KEY)`,
  `CREATE TABLE demand_overrides (id TEXT PRIMARY KEY)`,
  `CREATE TABLE supervisor_delegations (id TEXT PRIMARY KEY)`,
  // 迁移 046 后真实库无 standard_allocations(改名 resource_templates)
  `CREATE TABLE resource_templates (id TEXT PRIMARY KEY)`,
  `CREATE TABLE people (
    id TEXT PRIMARY KEY, name TEXT, is_active INTEGER DEFAULT 1,
    worker_type TEXT, primary_person_role_id TEXT, default_availability_percentage REAL DEFAULT 100,
    default_hours_per_day REAL DEFAULT 8,
    created_at DATETIME, updated_at DATETIME
  )`,
  `CREATE TABLE scenario_project_assignments (
    id TEXT PRIMARY KEY, scenario_id TEXT NOT NULL,
    project_id TEXT, person_id TEXT, role_id TEXT, phase_id TEXT,
    allocation_percentage REAL, status TEXT DEFAULT 'active',
    is_primary INTEGER DEFAULT 0,
    assignment_date_mode TEXT, start_date TEXT, end_date TEXT,
    computed_start_date TEXT, computed_end_date TEXT, notes TEXT,
    change_type TEXT, base_assignment_id TEXT,
    created_at DATETIME, updated_at DATETIME
  )`,
  `CREATE TABLE project_phases_timeline (id TEXT PRIMARY KEY)`,
  `CREATE TABLE role_planners (id TEXT PRIMARY KEY)`,
  `CREATE TABLE project_planners (id TEXT PRIMARY KEY)`,
  `CREATE TABLE person_roles (
    id TEXT PRIMARY KEY, person_id TEXT, role_id TEXT,
    proficiency_level INTEGER DEFAULT 3, is_primary INTEGER DEFAULT 0
  )`,
  `CREATE TABLE projects (
    id TEXT PRIMARY KEY, name TEXT, project_type_id TEXT, project_sub_type_id TEXT,
    location_id TEXT, priority INTEGER, include_in_demand INTEGER,
    created_at DATETIME, updated_at DATETIME
  )`,
  `CREATE TABLE project_sub_types (
    id TEXT PRIMARY KEY, project_type_id TEXT, name TEXT, description TEXT,
    is_default INTEGER, sort_order INTEGER, created_at DATETIME, updated_at DATETIME
  )`,
  `CREATE TABLE scenario_project_phases (id TEXT PRIMARY KEY, scenario_id TEXT)`
];

describe('ExcelImporterV2.analyzeImport (real sqlite + real exceljs)', () => {
  let db: any;
  let workbookPath: string;

  beforeAll(async () => {
    db = knexFactory({ client: 'better-sqlite3', connection: ':memory:' });
    for (const stmt of DDL) await db.raw(stmt);
    // 分配行的人名查找走 people 表(按 name)

    // 最小 V2 工作簿:四个必需 sheet;Project Types 1 行 + Projects 1 行(新建 TestSite 地点)
    const ExcelJS = (await import('exceljs')).default as any;
    const wb = new ExcelJS.Workbook();
    const types = wb.addWorksheet('Project Types');
    types.addRow(['Name']);
    types.addRow(['Feature']);
    const roles = wb.addWorksheet('Roles');
    roles.addRow(['Role', 'Plan Owner', 'CW Option', 'Data Access']);
    roles.addRow(['开发', '', '', '']);
    const roster = wb.addWorksheet('Roster');
    roster.addRow(['Name', 'Role']);
    roster.addRow(['张开发', '开发']);
    const projects = wb.addWorksheet('Projects');
    projects.addRow(['Project/Site', 'Project Type', 'Inc. in Demand', 'Priority']);
    projects.addRow(['Feature @ TestSite', 'Feature', 'Y', '1']);
    // 分配 sheet: fiscal week 列承载占用(extractFiscalWeekColumns 真实解析)
    const assignments = wb.addWorksheet('Project Assignments');
    assignments.addRow(['Project/Site', 'Person', 'Role', '26FW45', '26FW46']);
    assignments.addRow(['Feature @ TestSite', '张开发', '开发', 0.5, 0.5]);
    workbookPath = path.join(os.tmpdir(), `v2-analyze-${Date.now()}.xlsx`);
    await wb.xlsx.writeFile(workbookPath);
  });

  afterAll(async () => {
    try { fs.unlinkSync(workbookPath); } catch { /* temp 清理尽力而为 */ }
    await db.destroy();
  });

  beforeEach(async () => {
    // 用例隔离:执行用例会真实提交,下一用例必须从干净状态出发
    for (const table of [
      'project_types', 'roles', 'project_phases', 'locations',
      'person_availability_overrides', 'project_assignments', 'demand_overrides',
      'supervisor_delegations', 'resource_templates', 'project_phases_timeline',
      'role_planners', 'project_planners', 'person_roles', 'projects', 'people'
    ]) {
      await db(table).del();
    }
  });

  beforeEach(async () => {
    for (const table of [
      'scenario_project_assignments', 'scenario_project_phases', 'project_assignments',
      'person_availability_overrides', 'person_roles', 'people', 'roles',
      'project_phases', 'project_types', 'locations', 'projects', 'project_sub_types',
      'project_phases_timeline', 'role_planners', 'project_planners',
      'resource_templates', 'demand_overrides', 'supervisor_delegations'
    ]) {
      await db(table).del();
    }
  });

  const countProjectTypes = async () => {
    const r = await db('project_types').count('* as c').first();
    return Number(r.c);
  };

  test('preview runs the real pipeline inside a rolled-back transaction (zero writes)', async () => {

    const importer = new ExcelImporterV2(db);
    const analysis = await importer.analyzeImport(workbookPath, {});
    expect(analysis.wouldSucceed).toBe(true);
    expect(analysis.dryRun).toBe(true);
    expect(analysis.summary.wouldCreate.projectTypes).toBe(1);
    expect(analysis.errors).toEqual([]);

    // 预览零落库:回滚必须真实生效
    expect(await countProjectTypes()).toBe(0);
  });

  test('execution writes exactly what the preview promised (same interpreter, same counts)', async () => {
    const previewImporter = new ExcelImporterV2(db);
    const analysis = await previewImporter.analyzeImport(workbookPath, {});

    const execImporter = new ExcelImporterV2(db);
    const result = await execImporter.importFromFile(workbookPath, {});

    expect(result.success).toBe(true);
    expect(result.imported.projectTypes).toBe(analysis.summary.wouldCreate.projectTypes);
    expect(await countProjectTypes()).toBe(analysis.summary.wouldCreate.projectTypes);
  });

  test('preview with clearExisting=true leaves existing data untouched and flags high risk', async () => {
    await db('project_types').insert({
      id: 'existing-1', name: 'Existing Type', description: null,
      created_at: new Date(), updated_at: new Date()
    });

    const importer = new ExcelImporterV2(db);
    const analysis = await importer.analyzeImport(workbookPath, { clearExisting: true });

    expect(analysis.wouldSucceed).toBe(true);
    expect(analysis.riskAssessment.level).toBe('high');
    expect(analysis.riskAssessment.factors.length).toBeGreaterThan(0);

    // 预览里的 clearExisting 只发生在被回滚的事务内:现有数据必须原样
    const rows = await db('project_types').where({ id: 'existing-1' }).first();
    expect(rows).toBeTruthy();
    expect(await countProjectTypes()).toBe(1);
  });

  test('locations/availability counts report only NEW records, never pre-existing stock', async () => {
    // 存量:3 个地点、2 条可用率覆盖——它们不是本次导入的新增承诺
    for (let i = 1; i <= 3; i++) {
      await db('locations').insert({ id: `loc-${i}`, name: `Stock Site ${i}`, created_at: new Date(), updated_at: new Date() });
    }
    for (let i = 1; i <= 2; i++) {
      await db('person_availability_overrides').insert({ id: `ovo-${i}`, person_id: 'p', created_at: new Date() });
    }

    const previewImporter = new ExcelImporterV2(db);
    const analysis = await previewImporter.analyzeImport(workbookPath, {});
    expect(analysis.summary.wouldCreate.locations).toBe(1); // 仅 TestSite
    expect(analysis.summary.wouldCreate.availabilityOverrides).toBe(0); // 工作簿无覆盖行
    expect(await db('locations').count('* as c').first().then((r: any) => Number(r.c))).toBe(3); // 预览零落库

    const execImporter = new ExcelImporterV2(db);
    const result = await execImporter.importFromFile(workbookPath, {});
    expect(result.success).toBe(true);
    expect(result.imported.locations).toBe(1);
    expect(result.imported.availabilityOverrides).toBe(0);
    expect(await db('locations').count('* as c').first().then((r: any) => Number(r.c))).toBe(4); // 3 存量 + 1 新
  });

  test('贯通: 分配写入选定场景切片(旧表 project_assignments 不再收行)', async () => {
    const importer = new ExcelImporterV2(db);
    const result = await importer.importFromFile(workbookPath, { scenarioId: 'sc9' });
    expect(result.success).toBe(true);
    expect(result.imported.assignments).toBe(1);

    const sliceRows = await db('scenario_project_assignments').where({ scenario_id: 'sc9' });
    expect(sliceRows.length).toBe(1);
    expect(sliceRows[0].status).toBe('active');
    expect(sliceRows[0].change_type).toBe('added');
    expect(sliceRows[0].allocation_percentage).toBe(50);
    expect(sliceRows[0].project_id).toBeTruthy();
    // 人员来自 Roster sheet 建档——按名回查验证指向正确
    const person = await db('people').where({ name: '张开发' }).first();
    expect(sliceRows[0].person_id).toBe(person.id);
    // 日期以 ISO 文本落库:Date 对象会被驱动存成毫秒文本("1793548800000.0"),
    // 运行时按 'YYYY-MM-DD' 字符串过滤必然失配——导入分配将不可见
    expect(sliceRows[0].start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(sliceRows[0].computed_end_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // 端到端可见性:按运行时同款字符串过滤必须能命中导入行
    const visible = await db('scenario_project_assignments')
      .where({ scenario_id: 'sc9' })
      .where('end_date', '>=', '2026-01-01')
      .where('start_date', '<=', '2026-12-31')
      .count('* as c').first();
    expect(Number(visible.c)).toBe(1);
    // 旧表不再接收导入行(运行时读侧全是切片)
    const legacy = await db('project_assignments').count('* as c').first();
    expect(Number(legacy.c)).toBe(0);
  });

  test('贯通: 未指定场景时分配落 baseline 切片', async () => {
    const importer = new ExcelImporterV2(db);
    const result = await importer.importFromFile(workbookPath, {});
    expect(result.success).toBe(true);
    const sliceRows = await db('scenario_project_assignments').where({
      scenario_id: 'baseline-0000-0000-0000-000000000000'
    });
    expect(sliceRows.length).toBe(1);
  });

  test('贯通: clearExisting 也清目标场景切片旧分配(重导同场景=替换)', async () => {
    await db('scenario_project_assignments').insert({
      id: 'stale-1', scenario_id: 'sc9', project_id: 'px', person_id: 'p-zk', role_id: 'r1',
      allocation_percentage: 30, status: 'active', assignment_date_mode: 'fixed',
      start_date: '2026-01-01', end_date: '2026-01-31',
      created_at: new Date(), updated_at: new Date()
    });

    const importer = new ExcelImporterV2(db);
    const result = await importer.importFromFile(workbookPath, { scenarioId: 'sc9', clearExisting: true });
    expect(result.success).toBe(true);
    const sliceRows = await db('scenario_project_assignments').where({ scenario_id: 'sc9' });
    expect(sliceRows.length).toBe(1); // 只剩新导入的行
    expect(sliceRows[0].id).not.toBe('stale-1');
  });
});
