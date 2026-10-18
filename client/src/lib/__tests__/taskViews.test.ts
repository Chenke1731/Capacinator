import { taskViewPredicate, countByTaskView, TASK_VIEW_IDS } from '../taskViews';

/**
 * U15 任务视图谓词（IP-06d，2026-10-17）。
 *
 * 六视图全部锚定服务端事实（board-feed 行字段）：生命周期态/告警码/
 * 分配与估算挂载/冲突标志。本模块是 chips 计数与树过滤的单一真相——
 * 两处消费禁止各写一份谓词。
 */
const baseRow = {
  id: 'x',
  lifecycle_state: null,
  lifecycle_warnings: [] as string[],
  design_estimates: null as any,
  se_assignment: null as any,
  mde_assignment: null as any,
  primary_dev: null as any,
  has_conflict: false
};

describe('taskViewPredicate (U15)', () => {
  test('待裁决: pending_rat 态(域词表"待RAT"),其余态/null 不命中', () => {
    expect(taskViewPredicate('pendingDecision', { ...baseRow, lifecycle_state: 'pending_rat' })).toBe(true);
    expect(taskViewPredicate('pendingDecision', { ...baseRow, lifecycle_state: 'backlog' })).toBe(false);
    expect(taskViewPredicate('pendingDecision', baseRow)).toBe(false);
  });

  test('待估算: NO_LOC_ESTIMATE / NO_DESIGN_ESTIMATE 告警命中,其他告警不命中', () => {
    expect(taskViewPredicate('pendingEstimate', { ...baseRow, lifecycle_warnings: ['NO_LOC_ESTIMATE'] })).toBe(true);
    expect(taskViewPredicate('pendingEstimate', { ...baseRow, lifecycle_warnings: ['NO_DESIGN_ESTIMATE'] })).toBe(true);
    expect(taskViewPredicate('pendingEstimate', { ...baseRow, lifecycle_warnings: ['SE_WONT_MAKE_IT'] })).toBe(false);
  });

  test('待配人: SE/MDE 有估算无分配、开发侧无主投入、缺池告警三源命中', () => {
    // SE 有估算无分配
    expect(taskViewPredicate('pendingStaffing', {
      ...baseRow, design_estimates: { se: 0.5, mde: null }
    })).toBe(true);
    // MDE 有估算无分配
    expect(taskViewPredicate('pendingStaffing', {
      ...baseRow, lifecycle_state: 'designing', design_estimates: { se: null, mde: 1 }, mde_assignment: null
    })).toBe(true);
    // 开发侧无主投入
    expect(taskViewPredicate('pendingStaffing', { ...baseRow, lifecycle_state: 'scheduled' })).toBe(true);
    // 缺池告警
    expect(taskViewPredicate('pendingStaffing', {
      ...baseRow, lifecycle_state: 'in_iteration', primary_dev: { name: '张三' }, lifecycle_warnings: ['NO_DEV_DEMAND']
    })).toBe(true);
    // 反例: SE 已分配、开发侧有主投入、无告警
    expect(taskViewPredicate('pendingStaffing', {
      ...baseRow, lifecycle_state: 'in_iteration',
      design_estimates: { se: 0.5, mde: 1 },
      se_assignment: { person_name: '陈' }, mde_assignment: { person_name: '李' },
      primary_dev: { person_name: '王' }
    })).toBe(false);
    // 反例: 无估算且非开发侧的空行不命中(无工作事实=无配人义务)
    expect(taskViewPredicate('pendingStaffing', baseRow)).toBe(false);
    // 反例: backlog 无主投入不命中——排队期无配人义务(与 NO_DEV_DEMAND 告警门同集)
    expect(taskViewPredicate('pendingStaffing', { ...baseRow, lifecycle_state: 'backlog' })).toBe(false);
  });

  test('有冲突: 只认服务端 has_conflict 标志,前端不推断', () => {
    expect(taskViewPredicate('hasConflict', { ...baseRow, has_conflict: true })).toBe(true);
    expect(taskViewPredicate('hasConflict', { ...baseRow, has_conflict: false })).toBe(false);
    expect(taskViewPredicate('hasConflict', baseRow)).toBe(false);
  });

  test('待排期: backlog 态(域词表"待排序")', () => {
    expect(taskViewPredicate('pendingSchedule', { ...baseRow, lifecycle_state: 'backlog' })).toBe(true);
    expect(taskViewPredicate('pendingSchedule', { ...baseRow, lifecycle_state: 'scheduled' })).toBe(false);
  });

  test('交付待回填: DESIGN_NOT_BACKFILLED / DELIVERED_NOT_BACKFILLED 命中', () => {
    expect(taskViewPredicate('pendingBackfill', { ...baseRow, lifecycle_warnings: ['DESIGN_NOT_BACKFILLED'] })).toBe(true);
    expect(taskViewPredicate('pendingBackfill', { ...baseRow, lifecycle_warnings: ['DELIVERED_NOT_BACKFILLED'] })).toBe(true);
    expect(taskViewPredicate('pendingBackfill', { ...baseRow, lifecycle_warnings: ['NO_ITERATION_NUMBER'] })).toBe(false);
  });
});

describe('countByTaskView (U15)', () => {
  test('六视图计数=行级独立命中数(非树口径)', () => {
    const rows = [
      { ...baseRow, id: '1', lifecycle_state: 'pending_rat' },
      { ...baseRow, id: '2', lifecycle_state: 'pending_rat' },
      { ...baseRow, id: '3', lifecycle_state: 'backlog' },
      { ...baseRow, id: '4', has_conflict: true }
    ];
    const counts = countByTaskView(rows);
    expect(counts.pendingDecision).toBe(2);
    expect(counts.pendingSchedule).toBe(1);
    expect(counts.hasConflict).toBe(1);
    expect(counts.pendingEstimate).toBe(0);
  });

  test('字段缺失不抛错(防御: 老缓存行无 has_conflict)', () => {
    expect(() => countByTaskView([{}, undefined, null])).not.toThrow();
    expect(countByTaskView([{}]).pendingDecision).toBe(0);
  });

  test('TASK_VIEW_IDS 六项齐全且有序', () => {
    expect(TASK_VIEW_IDS).toEqual([
      'pendingDecision', 'pendingEstimate', 'pendingStaffing', 'hasConflict', 'pendingSchedule', 'pendingBackfill'
    ]);
  });
});
