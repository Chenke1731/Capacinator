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
 * IP-05 续批(2026-10-20):同名漂移 + 逐实体清单。
 *
 * 规则(§4-260,两版本同一语义):同名人员/项目撞库=明确冲突,全批拒绝
 * 回滚——不把单纯同名当可靠身份,不做静默复制,也不在预览里承诺
 * "将更新"。clearExisting=true 是唯一逃生门(清库在前,无冲突可言)。
 *
 * 基座照 importClearTables:真迁移建库(无手写 DDL)、pool max:1 复刻
 * 生产 knexfile、真 exceljs——手写 DDL 掩雷(supervisor_delegations)是
 * 已入台账的掩盖事故,不再引入。
 */
const MIGRATIONS = path.join(process.cwd(), 'src/server/database/migrations');
const BASELINE = 'baseline-0000-0000-0000-000000000000';

describe('导入器同名拒绝 × 预览=执行 × 逐实体清单 (IP-05 续批)', () => {
  let db: any;
  let v1ConflictPath: string;
  let v1FreshPath: string;
  let v1CasePath: string;
  let v2ConflictPath: string;
  let v2FreshPath: string;
  const paths: string[] = [];

  const countOf = async (table: string, col = '*', where?: Record<string, unknown>) => {
    const q = db(table);
    const rows = where ? await q.where(where) : await q;
    return rows.length;
  };

  const seedPerson = async (name: string) => {
    await db('people').insert({
      id: `p-${Math.random().toString(36).slice(2, 8)}`,
      name, is_active: 1,
      default_availability_percentage: 100, default_hours_per_day: 8
    });
  };

  const seedProject = async (name: string) => {
    const r = Math.random().toString(36).slice(2, 8);
    await db('project_types').insert({ id: `pt-${r}`, name: `类型${r}`, created_at: new Date() });
    await db('project_sub_types').insert({ id: `pst-${r}`, project_type_id: `pt-${r}`, name: `子类${r}` });
    await db('projects').insert({ id: `prj-${r}`, name, project_sub_type_id: `pst-${r}`, created_at: new Date() });
  };

  const seedLocation = async (name: string) => {
    await db('locations').insert({ id: `loc-${Math.random().toString(36).slice(2, 8)}`, name });
  };

  beforeAll(async () => {
    db = knexFactory({
      client: 'better-sqlite3',
      connection: ':memory:',
      useNullAsDefault: true,
      pool: { min: 0, max: 1 }
    });
    const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.ts')).sort();
    for (const f of files) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require(path.join(MIGRATIONS, f)) as { up?: (k: unknown) => Promise<void> };
      if (mod.up) await mod.up(db);
    }
    const hasBaseline = await db('scenarios').where({ id: BASELINE }).first();
    if (!hasBaseline) {
      await db('people').insert({
        id: 'test-creator', name: '夹具创建者', is_active: 1,
        default_availability_percentage: 100, default_hours_per_day: 8
      });
      await db('scenarios').insert({
        id: BASELINE, name: '基线', status: 'active', scenario_type: 'baseline', created_by: 'test-creator'
      });
    }

    const ExcelJS = (await import('exceljs')).default as any;
    const write = async (name: string, build: (wb: any) => void) => {
      const wb = new ExcelJS.Workbook();
      build(wb);
      const p = path.join(os.tmpdir(), `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.xlsx`);
      await wb.xlsx.writeFile(p);
      paths.push(p);
      return p;
    };

    // V1 冲突工作簿:人员/项目均与库存同名
    v1ConflictPath = await write('v1-conflict', (wb) => {
      const people = wb.addWorksheet('People');
      people.addRow(['Name', 'Primary Role']);
      people.addRow(['张开发', '开发']);
      const projects = wb.addWorksheet('Projects');
      projects.addRow(['Project Name', 'Project Type', 'Location', 'Priority']);
      projects.addRow(['事项甲', '交付', '北京', '1']);
      const alloc = wb.addWorksheet('Standard Allocations');
      alloc.addRow(['Project Type', 'Phase', 'Role', 'Allocation %']);
      alloc.addRow(['交付', '设计', '开发', 50]);
    });

    // V1 全新工作簿:无任何同名;地点"上海"为新建(库存另有"北京")
    v1FreshPath = await write('v1-fresh', (wb) => {
      const people = wb.addWorksheet('People');
      people.addRow(['Name', 'Primary Role']);
      people.addRow(['李新', '开发']);
      const projects = wb.addWorksheet('Projects');
      projects.addRow(['Project Name', 'Project Type', 'Location', 'Priority']);
      projects.addRow(['新事项', '交付', '上海', '1']);
      const alloc = wb.addWorksheet('Standard Allocations');
      alloc.addRow(['Project Type', 'Phase', 'Role', 'Allocation %']);
      alloc.addRow(['交付', '设计', '开发', 50]);
    });

    // V1 大小写不敏感工作簿:库存 alice,文件 Alice
    v1CasePath = await write('v1-case', (wb) => {
      const people = wb.addWorksheet('People');
      people.addRow(['Name', 'Primary Role']);
      people.addRow(['Alice', '开发']);
      const projects = wb.addWorksheet('Projects');
      projects.addRow(['Project Name', 'Project Type', 'Location', 'Priority']);
      projects.addRow(['Case事项', '交付', '北京', '1']);
      const alloc = wb.addWorksheet('Standard Allocations');
      alloc.addRow(['Project Type', 'Phase', 'Role', 'Allocation %']);
      alloc.addRow(['交付', '设计', '开发', 50]);
    });

    // V2 冲突工作簿:Roster 张开发(同名人员)、事项甲 @ TestSite(同名项目)
    v2ConflictPath = await write('v2-conflict', (wb) => {
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
      projects.addRow(['事项甲 @ TestSite', 'Feature', 'Y', '1']);
    });

    // V2 全新工作簿
    v2FreshPath = await write('v2-fresh', (wb) => {
      const types = wb.addWorksheet('Project Types');
      types.addRow(['Name']);
      types.addRow(['Feature']);
      const roles = wb.addWorksheet('Roles');
      roles.addRow(['Role', 'Plan Owner', 'CW Option', 'Data Access']);
      roles.addRow(['开发', '', '', '']);
      const roster = wb.addWorksheet('Roster');
      roster.addRow(['Name', 'Role']);
      roster.addRow(['李新', '开发']);
      const projects = wb.addWorksheet('Projects');
      projects.addRow(['Project/Site', 'Project Type', 'Inc. in Demand', 'Priority']);
      projects.addRow(['NewFeature @ TestSite', 'Feature', 'Y', '1']);
    });
  });

  afterAll(async () => {
    for (const p of paths) {
      try { fs.unlinkSync(p); } catch { /* temp 清理尽力而为 */ }
    }
    await db.destroy();
  });

  beforeEach(async () => {
    for (const t of ['resource_templates', 'projects', 'people', 'person_roles', 'project_phases',
      'roles', 'project_types', 'locations', 'project_sub_types',
      'scenario_project_assignments', 'scenario_project_phases']) {
      await db(t).del();
    }
  });

  test('V1 执行:同名人员+项目 → 全批拒绝,库存行数不变,错误点名', async () => {
    await seedPerson('张开发');
    await seedProject('事项甲');
    const result = await new ExcelImporter(db).importFromFile(v1ConflictPath, {});
    expect(result.success).toBe(false);
    expect(await countOf('people')).toBe(1);
    expect(await countOf('projects')).toBe(1);
    const all = (result.errors ?? []).join(' ');
    expect(all).toContain('张开发');
    expect(all).toContain('事项甲');
  });

  test('V1 执行:同名比较大小写不敏感(库存 alice,文件 Alice)', async () => {
    await seedPerson('alice');
    const result = await new ExcelImporter(db).importFromFile(v1CasePath, {});
    expect(result.success).toBe(false);
    expect(await countOf('people')).toBe(1);
    expect((result.errors ?? []).join(' ')).toContain('Alice');
  });

  test('V1 执行:clearExisting=true 是逃生门——同名不误拒,新数据落库', async () => {
    await seedPerson('张开发');
    await seedProject('事项甲');
    const result = await new ExcelImporter(db).importFromFile(v1ConflictPath, { clearExisting: true });
    expect(result.success).toBe(true);
    // 清库后导入:文件里的同名行成为唯一行
    expect(await countOf('people')).toBe(1);
    expect(await countOf('projects')).toBe(1);
  });

  test('V1 预览:同名 → 报冲突、不再承诺 will update、零落库、wouldSucceed=false', async () => {
    await seedPerson('张开发');
    await seedProject('事项甲');
    const analysis = await new ExcelImporter(db).analyzeImport(v1ConflictPath, {});
    expect(analysis.wouldSucceed).toBe(false);
    const conflictText = (analysis.conflicts ?? []).join(' ');
    expect(conflictText).toContain('张开发');
    expect(conflictText).toContain('事项甲');
    // 同名不再被承诺为"将更新"
    expect(analysis.summary.wouldUpdate.people).toBe(0);
    expect(analysis.summary.wouldUpdate.projects).toBe(0);
    const modified = (analysis.preview.modifiedEntities ?? []).map((e: { name: string }) => e.name);
    expect(modified).not.toContain('张开发');
    expect(modified).not.toContain('事项甲');
    // 预览零落库
    expect(await countOf('people')).toBe(1);
    expect(await countOf('projects')).toBe(1);
  });

  test('V1 预览=执行(构造性一致):wouldCreate === 实际 imported,含新建地点的诚实计数', async () => {
    await seedLocation('北京'); // 存量 1 地点;文件只带新地点"上海"
    const analysis = await new ExcelImporter(db).analyzeImport(v1FreshPath, {});
    expect(analysis.wouldSucceed).toBe(true);
    expect(analysis.summary.wouldCreate.people).toBe(1);
    expect(analysis.summary.wouldCreate.projects).toBe(1);
    // 诚实计数:只数本次新建的 1 个地点,不把存量"北京"计成导入承诺
    expect(analysis.summary.wouldCreate.locations).toBe(1);
    // 预览零落库
    expect(await countOf('people')).toBe(0);
    expect(await countOf('projects')).toBe(0);
    expect(await countOf('locations')).toBe(1);

    const result = await new ExcelImporter(db).importFromFile(v1FreshPath, {});
    expect(result.success).toBe(true);
    expect(result.imported.people).toBe(1);
    expect(result.imported.projects).toBe(1);
    expect(result.imported.locations).toBe(1);
  });

  test('V1 预览:逐实体清单列出实际将创建的人员/项目名', async () => {
    const analysis = await new ExcelImporter(db).analyzeImport(v1FreshPath, {});
    const names = (analysis.preview.newEntities ?? []).map((e: { type: string; name: string }) => `${e.type}:${e.name}`);
    expect(names).toContain('person:李新');
    expect(names).toContain('project:新事项');
  });

  test('V2 执行:同名人员+项目 → 全批拒绝,库存行数不变', async () => {
    await seedPerson('张开发');
    await seedProject('事项甲');
    const result = await new ExcelImporterV2(db).importFromFile(v2ConflictPath, { scenarioId: BASELINE });
    expect(result.success).toBe(false);
    expect(await countOf('people')).toBe(1);
    expect(await countOf('projects')).toBe(1);
    const all = (result.errors ?? []).join(' ');
    expect(all).toContain('张开发');
    expect(all).toContain('事项甲');
  });

  test('V2 预览:逐实体清单列出实际将创建的人员/项目名(旧:newEntities 恒空)', async () => {
    const analysis = await new ExcelImporterV2(db).analyzeImport(v2FreshPath, { scenarioId: BASELINE });
    expect(analysis.wouldSucceed).toBe(true);
    const names = (analysis.preview.newEntities ?? []).map((e: { type: string; name: string }) => `${e.type}:${e.name}`);
    expect(names).toContain('person:李新');
    expect(names).toContain('project:NewFeature');
    // 预览零落库
    expect(await countOf('people')).toBe(0);
    expect(await countOf('projects')).toBe(0);
  });

  test('V2 预览:同名 → wouldSucceed=false 且冲突点名', async () => {
    await seedPerson('张开发');
    await seedProject('事项甲');
    const analysis = await new ExcelImporterV2(db).analyzeImport(v2ConflictPath, { scenarioId: BASELINE });
    expect(analysis.wouldSucceed).toBe(false);
    const text = [...(analysis.conflicts ?? []), ...(analysis.errors ?? [])].join(' ');
    expect(text).toContain('张开发');
    expect(text).toContain('事项甲');
  });
});
