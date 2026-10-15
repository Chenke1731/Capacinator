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
  `CREATE TABLE standard_allocations (id TEXT PRIMARY KEY)`,
  `CREATE TABLE project_phases_timeline (id TEXT PRIMARY KEY)`,
  `CREATE TABLE role_planners (id TEXT PRIMARY KEY)`,
  `CREATE TABLE project_planners (id TEXT PRIMARY KEY)`,
  `CREATE TABLE person_roles (id TEXT PRIMARY KEY)`,
  `CREATE TABLE projects (
    id TEXT PRIMARY KEY, name TEXT, project_type_id TEXT, project_sub_type_id TEXT,
    location_id TEXT, priority INTEGER, include_in_demand INTEGER,
    created_at DATETIME, updated_at DATETIME
  )`,
  `CREATE TABLE project_sub_types (
    id TEXT PRIMARY KEY, project_type_id TEXT, name TEXT, description TEXT,
    is_default INTEGER, sort_order INTEGER, created_at DATETIME, updated_at DATETIME
  )`,
  `CREATE TABLE people (id TEXT PRIMARY KEY)`
];

describe('ExcelImporterV2.analyzeImport (real sqlite + real exceljs)', () => {
  let db: any;
  let workbookPath: string;

  beforeAll(async () => {
    db = knexFactory({ client: 'better-sqlite3', connection: ':memory:' });
    for (const stmt of DDL) await db.raw(stmt);

    // 最小 V2 工作簿:四个必需 sheet;Project Types 1 行 + Projects 1 行(新建 TestSite 地点)
    const ExcelJS = (await import('exceljs')).default as any;
    const wb = new ExcelJS.Workbook();
    const types = wb.addWorksheet('Project Types');
    types.addRow(['Name']);
    types.addRow(['Feature']);
    wb.addWorksheet('Roles').addRow(['Role', 'Plan Owner', 'CW Option', 'Data Access']);
    wb.addWorksheet('Roster').addRow(['Name']);
    const projects = wb.addWorksheet('Projects');
    projects.addRow(['Project/Site', 'Project Type', 'Inc. in Demand', 'Priority']);
    projects.addRow(['Feature @ TestSite', 'Feature', 'Y', '1']);
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
      'supervisor_delegations', 'standard_allocations', 'project_phases_timeline',
      'role_planners', 'project_planners', 'person_roles', 'projects', 'people'
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
});
