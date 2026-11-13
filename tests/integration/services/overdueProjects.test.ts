/**
 * I02g 排期逾期原语 + Dashboard 接线。
 *
 * 口径：include_in_demand=1、六非终态、项目全部阶段 MAX(end_date) 严格早于
 * min(参考日,今天)；NULL/delivered/cancelled/无阶段/iid=0 不命中。
 */
import { describe, test, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import { db } from '../setup';
import { TEST_PROJECT_SUB_TYPE_ID } from '../setup';
import {
  OVERDUE_LIFECYCLE_STATES,
  overdueProjects,
  resolveOverdueReferenceDate,
} from '../../../src/server/services/projects/overdueProjects';
import { ReportDataService } from '../../../src/server/services/reports/ReportDataService';

const PREFIX = 'i02g-';
const PHASE_IDS = ['i02g-phase-0', 'i02g-phase-1', 'i02g-phase-2', 'i02g-phase-3', 'i02g-phase-4'];
let seq = 0;

function shiftDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function insertProject(options: {
  lifecycle_state?: string | null;
  include_in_demand?: boolean;
  ends?: string[];
}): Promise<string> {
  seq += 1;
  const id = `${PREFIX}project-${seq}`;
  await db('projects').insert({
    id,
    name: `${PREFIX}project-${seq}`,
    project_sub_type_id: TEST_PROJECT_SUB_TYPE_ID,
    lifecycle_state: options.lifecycle_state === undefined ? 'backlog' : options.lifecycle_state,
    include_in_demand: options.include_in_demand ?? true,
    created_at: new Date(),
    updated_at: new Date(),
  });
  for (const [i, end] of (options.ends ?? []).entries()) {
    await db('project_phases_timeline').insert({
      id: `${PREFIX}timeline-${seq}-${i}`,
      project_id: id,
      phase_id: PHASE_IDS[i],
      start_date: shiftDate(end, -10),
      end_date: end,
      phase_source: 'template',
      created_at: new Date(),
      updated_at: new Date(),
    });
  }
  return id;
}

beforeAll(async () => {
  for (const [i, id] of PHASE_IDS.entries()) {
    await db('project_phases').insert({ id, name: `I02G Phase ${i} ${Date.now()}`, order_index: i + 1 });
  }
});

beforeEach(async () => {
  await db('project_phases_timeline').where('project_id', 'like', `${PREFIX}%`).del();
  await db('projects').where('id', 'like', `${PREFIX}%`).del();
});

afterAll(async () => {
  // 内存测试库随 setup.afterAll 销毁；此处不做 DB 清理（避免 destroy 顺序竞态）
});

describe('resolveOverdueReferenceDate', () => {
  test('缺省/非法→今天；历史保留；未来钳制到今天', () => {
    const now = today();
    expect(resolveOverdueReferenceDate(undefined, now)).toBe(now);
    expect(resolveOverdueReferenceDate('not-a-date', now)).toBe(now);
    expect(resolveOverdueReferenceDate('2026-13-01', now)).toBe(now);
    expect(resolveOverdueReferenceDate('2026-02-30', now)).toBe(now);
    expect(resolveOverdueReferenceDate('2026-01-02', now)).toBe('2026-01-02');
    expect(resolveOverdueReferenceDate('2999-12-31', now)).toBe(now);
  });
});

describe('overdueProjects 口径矩阵', () => {
  test('六个非终态均命中；delivered/cancelled/NULL/未知态不命中', async () => {
    const ref = '2026-06-15';
    const included: string[] = [];
    for (const state of OVERDUE_LIFECYCLE_STATES) {
      included.push(await insertProject({ lifecycle_state: state, ends: [shiftDate(ref, -1)] }));
    }
    const excluded = [
      await insertProject({ lifecycle_state: 'delivered', ends: [shiftDate(ref, -1)] }),
      await insertProject({ lifecycle_state: 'cancelled', ends: [shiftDate(ref, -1)] }),
      await insertProject({ lifecycle_state: null, ends: [shiftDate(ref, -1)] }),
      await insertProject({ lifecycle_state: 'legacy_unknown', ends: [shiftDate(ref, -1)] }),
    ];

    const ids = new Set((await overdueProjects(db, ref)).map((row) => row.project_id));
    for (const id of included) expect(ids.has(id)).toBe(true);
    for (const id of excluded) expect(ids.has(id)).toBe(false);
  });

  test('严格小于：完成日=参考日不命中；前一天命中', async () => {
    const ref = '2026-06-15';
    const boundary = await insertProject({ ends: [ref] });
    const dayBefore = await insertProject({ ends: [shiftDate(ref, -1)] });

    const ids = new Set((await overdueProjects(db, ref)).map((row) => row.project_id));
    expect(ids.has(boundary)).toBe(false);
    expect(ids.has(dayBefore)).toBe(true);
  });

  test('多阶段取 MAX：尾阶段未结束不命中；全部阶段早于参考日才命中', async () => {
    const ref = '2026-06-15';
    const ongoing = await insertProject({ ends: [shiftDate(ref, -30), shiftDate(ref, 1)] });
    const allPast = await insertProject({ ends: [shiftDate(ref, -30), shiftDate(ref, -2)] });

    const ids = new Set((await overdueProjects(db, ref)).map((row) => row.project_id));
    expect(ids.has(ongoing)).toBe(false);
    expect(ids.has(allPast)).toBe(true);
  });

  test('无阶段、include_in_demand=0 不命中', async () => {
    const ref = '2026-06-15';
    const noPhases = await insertProject({ ends: [] });
    const notInDemand = await insertProject({ include_in_demand: false, ends: [shiftDate(ref, -1)] });

    const ids = new Set((await overdueProjects(db, ref)).map((row) => row.project_id));
    expect(ids.has(noPhases)).toBe(false);
    expect(ids.has(notInDemand)).toBe(false);
  });

  test('未来参考日钳制到今天：计划日在今天之后不命中', async () => {
    const now = today();
    const tomorrow = await insertProject({ ends: [shiftDate(now, 1)] });
    const yesterday = await insertProject({ ends: [shiftDate(now, -1)] });

    const ids = new Set((await overdueProjects(db, '2999-12-31')).map((row) => row.project_id));
    expect(ids.has(tomorrow)).toBe(false);
    expect(ids.has(yesterday)).toBe(true);
  });
});

describe('Dashboard 同源计数', () => {
  test('projectHealth.OVERDUE 用项目级原语，且返回参考日', async () => {
    const ref = '2026-06-15';
    const overdueId = await insertProject({ lifecycle_state: 'backlog', ends: [shiftDate(ref, -10)] });
    const activeId = await insertProject({ lifecycle_state: 'scheduled', ends: [shiftDate(ref, 10)] });

    const stats = await new ReportDataService(db).getDashboardStats({ endDate: ref });
    expect(stats.overdue_reference_date).toBe(ref);
    expect(stats.projectHealth.OVERDUE).toBe(1);
    // 窗口内仍有活跃项目；逾期项目阶段已结束，不混入 ACTIVE/PLANNING
    expect(stats.summary.projects).toBe(1);
    expect(stats.projectHealth.ACTIVE ?? 0).toBeGreaterThanOrEqual(1);

    const ids = new Set((await overdueProjects(db, ref)).map((row) => row.project_id));
    expect(ids.has(overdueId)).toBe(true);
    expect(ids.has(activeId)).toBe(false);
  });
});
