/**
 * S3 批量平移纯函数矩阵（Phase B §6.2）：
 * - 日/周/月单位与方向；
 * - month 月底钳制（含闰年）；
 * - 跳过分项（paused/phase/project/undated）；
 * - 边界与 §4.2 同谓词：未来行可提前到 asOf；已开始行不能早于原 start，
 *   但向后平移时 newStart 仍 < asOf 不得判失败；
 * - 版本/冻结字段随计划带出。
 */
import {
  batchShiftSkipTotal,
  planBatchShift,
  shiftIsoDate,
  shiftIsoMonths,
  type BatchShiftRowInput,
} from '../batchShift';

const AS_OF = '2026-06-15';

function row(overrides: Partial<BatchShiftRowInput> = {}): BatchShiftRowInput {
  return {
    id: 'a1',
    version: 3,
    status: 'active',
    assignment_date_mode: 'fixed',
    start_date: '2026-07-01',
    end_date: '2026-07-31',
    project_name: 'Alpha',
    ...overrides,
  };
}

describe('shiftIsoDate / shiftIsoMonths', () => {
  test('day / week 方向', () => {
    expect(shiftIsoDate('2026-07-01', 3, 'day', 'later')).toBe('2026-07-04');
    expect(shiftIsoDate('2026-07-01', 2, 'week', 'earlier')).toBe('2026-06-17');
  });

  test('month 按目标月月底钳制（平年/闰年）', () => {
    expect(shiftIsoMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(shiftIsoMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(shiftIsoMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(shiftIsoMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(shiftIsoMonths('2026-01-15', -1)).toBe('2025-12-15');
  });
});

describe('planBatchShift', () => {
  test('日平移：冻结目标清单、版本与新旧窗口', () => {
    const plan = planBatchShift([row()], { direction: 'later', amount: 5, unit: 'day', asOf: AS_OF });
    expect(plan.rows).toEqual([
      {
        id: 'a1',
        version: 3,
        label: 'Alpha',
        originalStart: '2026-07-01',
        originalEnd: '2026-07-31',
        newStart: '2026-07-06',
        newEnd: '2026-08-05',
      },
    ]);
    expect(plan.blocked).toEqual([]);
    expect(batchShiftSkipTotal(plan.skipped)).toBe(0);
  });

  test('跳过分项：paused / phase / project / undated', () => {
    const plan = planBatchShift(
      [
        row({ id: 'paused', status: 'paused' }),
        row({ id: 'phase', assignment_date_mode: 'phase' }),
        row({ id: 'project', assignment_date_mode: 'project' }),
        row({ id: 'undated', start_date: null, end_date: null }),
      ],
      { direction: 'later', amount: 1, unit: 'day', asOf: AS_OF }
    );
    expect(plan.rows).toEqual([]);
    expect(plan.skipped).toEqual({ paused: 1, phase: 1, project: 1, undated: 1 });
    expect(batchShiftSkipTotal(plan.skipped)).toBe(4);
  });

  test('未来行提前：可到 asOf，但不能进入过去', () => {
    const atBoundary = planBatchShift([row({ start_date: '2026-06-18', end_date: '2026-07-18' })], {
      direction: 'earlier',
      amount: 3,
      unit: 'day',
      asOf: AS_OF,
    });
    expect(atBoundary.rows[0]?.newStart).toBe('2026-06-15');
    expect(atBoundary.blocked).toEqual([]);

    const intoPast = planBatchShift([row({ start_date: '2026-06-17', end_date: '2026-07-17' })], {
      direction: 'earlier',
      amount: 3,
      unit: 'day',
      asOf: AS_OF,
    });
    expect(intoPast.rows).toEqual([]);
    expect(intoPast.blocked).toEqual([
      { id: 'a1', label: 'Alpha', originalStart: '2026-06-17', newStart: '2026-06-14' },
    ]);
  });

  test('已开始行：向后再早也允许（newStart 仍 < asOf），向前平移不扩历史 → 失败', () => {
    const started = row({ start_date: '2026-05-01', end_date: '2026-06-30' });
    const later = planBatchShift([started], {
      direction: 'later',
      amount: 10,
      unit: 'day',
      asOf: AS_OF,
    });
    // newStart 2026-05-11 仍 < asOf，但不是失败（评审 Claude N1）
    expect(later.rows[0]?.newStart).toBe('2026-05-11');
    expect(later.blocked).toEqual([]);

    const earlier = planBatchShift([started], {
      direction: 'earlier',
      amount: 10,
      unit: 'day',
      asOf: AS_OF,
    });
    expect(earlier.rows).toEqual([]);
    expect(earlier.blocked[0]?.newStart).toBe('2026-04-21');
  });

  test('month 平移保留月底钳制结果（耗时不保证不变）', () => {
    const plan = planBatchShift([row({ start_date: '2026-01-31', end_date: '2026-02-28' })], {
      direction: 'later',
      amount: 1,
      unit: 'month',
      asOf: AS_OF,
    });
    expect(plan.rows[0]?.newStart).toBe('2026-02-28');
    expect(plan.rows[0]?.newEnd).toBe('2026-03-28');
  });

  test('使用 computed 日期兜底（fixed 行 start_date 缺失）', () => {
    const plan = planBatchShift(
      [
        row({
          start_date: null,
          end_date: null,
          computed_start_date: '2026-07-01',
          computed_end_date: '2026-07-31',
        }),
      ],
      { direction: 'later', amount: 1, unit: 'day', asOf: AS_OF }
    );
    expect(plan.rows[0]?.newStart).toBe('2026-07-02');
  });
});
