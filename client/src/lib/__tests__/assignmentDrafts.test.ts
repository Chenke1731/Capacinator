/**
 * 工作台 v2 草稿模型测试（§6.4/§7/§10）：
 * 分类谓词与服务端逐字段对齐（任意状态同键、phase NULL 显式判等、SE/MDE 槽
 * project+role+active）；默认值（§7.3）；§10.3 阻断条件；409 code 分流；
 * UNKNOWN 只认无 HTTP 响应；回读参数一致才判成功。
 */
import {
  classifySelection,
  createDraftFromTask,
  draftAssignmentsReducer,
  commitDrafts,
  reconcileUnknownDrafts,
  matchesReconciledRow,
  validateDraft,
  phaseKeyEqual,
  type AssignmentDraft,
  type SelectionTask,
} from '../assignmentDrafts';
import type { WorkloadAssignment } from '../personWorkload';

type Fixture = Record<string, unknown> & WorkloadAssignment;

function task(overrides: Record<string, unknown> = {}): SelectionTask {
  return {
    id: 'task-1',
    name: 'Task One',
    parent_id: null,
    child_count: 0,
    has_children: false,
    lifecycle_state: 'developing',
    project_sub_type_name: 'AR',
    is_ancestor: false,
    timeline_start: null,
    timeline_end: null,
    aspiration_start: null,
    aspiration_finish: null,
    has_phase_timeline: false,
    role_demands: [],
    assigned_summary: [],
    single_person_slots: [],
    ...overrides,
  } as SelectionTask;
}

function assignment(overrides: Record<string, unknown> = {}): Fixture {
  return {
    id: 'a1',
    project_id: 'task-1',
    person_id: 'person-1',
    role_id: 'role-se',
    phase_id: null,
    status: 'active',
    allocation_percentage: 20,
    ...overrides,
  } as Fixture;
}

describe('phaseKeyEqual', () => {
  test('NULL 与 undefined 显式判等，不与空串/具体值混淆', () => {
    expect(phaseKeyEqual(null, null)).toBe(true);
    expect(phaseKeyEqual(undefined, null)).toBe(true);
    expect(phaseKeyEqual(null, 'phase-1')).toBe(false);
    expect(phaseKeyEqual('phase-1', 'phase-1')).toBe(true);
    expect(phaseKeyEqual('', null)).toBe(false);
  });
});

describe('classifySelection（§6.4 完整业务键）', () => {
  const base = { personId: 'person-1', roleId: 'role-se', roleName: 'SE', phaseId: null };

  test('无同键行 → CREATE', () => {
    expect(classifySelection(task(), { ...base, assignments: [] })).toEqual({ kind: 'CREATE' });
  });

  test('同键行存在（任意状态，含 paused）→ EDIT', () => {
    const rows = [assignment({ status: 'paused' })];
    expect(classifySelection(task(), { ...base, assignments: rows })).toEqual({
      kind: 'EDIT',
      existingId: 'a1',
    });
  });

  test('同项目不同角色仍是 CREATE；phase 不同键也仍是 CREATE', () => {
    expect(
      classifySelection(task(), { ...base, roleId: 'role-mde', roleName: 'MDE', assignments: [assignment()] })
    ).toEqual({ kind: 'CREATE' });
    expect(
      classifySelection(task(), { ...base, phaseId: 'phase-x', assignments: [assignment({ phase_id: null })] })
    ).toEqual({ kind: 'CREATE' });
  });

  test('SE 槽被他人占 → REPLACE（不按 phase/person 过滤）', () => {
    const slot = {
      role_id: 'role-se',
      role_name: 'SE',
      incumbent_assignment_id: 'spa-old',
      incumbent_person_id: 'person-old',
      incumbent_person_name: 'Old',
      incumbent_version: 2,
      incumbent_start_date: '2026-01-01',
      incumbent_end_date: '2026-06-30',
    };
    const result = classifySelection(task({ single_person_slots: [slot] }), { ...base, assignments: [] });
    expect(result).toEqual({ kind: 'REPLACE', slot });
  });

  test('槽被本人占 → 指向该行走 EDIT', () => {
    const slot = {
      role_id: 'role-se',
      role_name: 'SE',
      incumbent_assignment_id: 'spa-self',
      incumbent_person_id: 'person-1',
      incumbent_person_name: 'Me',
      incumbent_version: 1,
      incumbent_start_date: null,
      incumbent_end_date: null,
    };
    expect(classifySelection(task({ single_person_slots: [slot] }), { ...base, assignments: [] })).toEqual({
      kind: 'EDIT',
      existingId: 'spa-self',
    });
  });
});

describe('createDraftFromTask（§7.3 默认值）', () => {
  const params = {
    personId: 'person-1',
    personPrimaryRoleId: 'role-primary',
    personPrimaryRoleName: 'Dev',
    scenarioId: 'scenario-a',
    assignments: [] as Fixture[],
  };

  test('需求角色优先；阶段时间线 → phase 模式带需求 phase；默认 20%', () => {
    const draft = createDraftFromTask(
      task({
        has_phase_timeline: true,
        role_demands: [{ role_id: 'role-se', role_name: 'SE', phase_id: 'phase-d', required_headcount: 1, source: 'template' }],
      }),
      params
    )!;
    expect(draft.kind).toBe('CREATE');
    expect(draft.roleId).toBe('role-se');
    expect(draft.assignmentDateMode).toBe('phase');
    expect(draft.phaseId).toBe('phase-d');
    expect(draft.allocationPercentage).toBe(20);
  });

  test('无时间线但有 aspiration → project 模式窗口只读', () => {
    const draft = createDraftFromTask(
      task({ aspiration_start: '2026-05-01', aspiration_finish: '2026-05-31' }),
      params
    )!;
    expect(draft.assignmentDateMode).toBe('project');
    expect(draft.startDate).toBe('2026-05-01');
    expect(draft.endDate).toBe('2026-05-31');
  });

  test('都没有 → fixed 空日期（需用户补）；无需求角色回落主角色', () => {
    const draft = createDraftFromTask(task(), params)!;
    expect(draft.assignmentDateMode).toBe('fixed');
    expect(draft.startDate).toBeNull();
    expect(draft.roleId).toBe('role-primary');
  });

  test('槽被他人占 → REPLACE 草稿带 incumbent + 未确认', () => {
    const draft = createDraftFromTask(
      task({
        role_demands: [{ role_id: 'role-se', role_name: 'SE', phase_id: null, required_headcount: 1, source: 'template' }],
        single_person_slots: [
          {
            role_id: 'role-se',
            role_name: 'SE',
            incumbent_assignment_id: 'spa-old',
            incumbent_person_id: 'person-old',
            incumbent_person_name: 'Old',
            incumbent_version: 4,
            incumbent_start_date: '2026-01-01',
            incumbent_end_date: '2026-12-31',
          },
        ],
      }),
      params
    )!;
    expect(draft.kind).toBe('REPLACE');
    expect(draft.incumbent?.version).toBe(4);
    expect(draft.replaceConfirmed).toBe(false);
    expect(draft.targetAssignmentId).toBe('spa-old');
  });
});

describe('validateDraft（§10.3 阻断条件）', () => {
  function baseDraft(overrides: Partial<AssignmentDraft> = {}): AssignmentDraft {
    return {
      draftId: 'd1',
      sourceTaskId: 'task-1',
      projectId: 'task-1',
      projectName: 'Task One',
      roleId: 'role-se',
      roleName: 'SE',
      roleOptions: [],
      phaseId: null,
      assignmentDateMode: 'fixed',
      startDate: '2026-04-01',
      endDate: '2026-04-30',
      allocationPercentage: 20,
      kind: 'CREATE',
      status: 'NORMAL',
      targetAssignmentId: null,
      expectedVersion: null,
      incumbent: null,
      scenarioId: 'scenario-a',
      taskContext: { hasPhaseTimeline: false, aspirationStart: null, aspirationFinish: null, terminal: false },
      errors: [],
      submitState: 'IDLE',
      submitError: null,
      replaceConfirmed: false,
      ...overrides,
    };
  }

  test('fixed 缺日期 → INVALID；日期倒置 → INVALID', () => {
    const ctx = { drafts: [] as AssignmentDraft[], assignments: [] as Fixture[], personId: 'person-1' };
    expect(validateDraft(baseDraft({ startDate: null }), ctx)).toContain('missing_dates');
    expect(validateDraft(baseDraft({ startDate: '2026-05-01', endDate: '2026-04-01' }), ctx)).toContain('invalid_date_order');
  });

  test('同键 committed 行 → duplicate_key（CONFLICT）；REPLACE 目标行除外', () => {
    const assignments = [assignment()];
    const ctx = { drafts: [], assignments, personId: 'person-1' };
    expect(validateDraft(baseDraft(), ctx)).toContain('duplicate_key');
    const replace = baseDraft({ kind: 'REPLACE', targetAssignmentId: 'a1' });
    expect(validateDraft(replace, ctx)).not.toContain('duplicate_key');
  });

  test('草稿间同键 → duplicate_in_drafts；REPLACE 未确认 → slot_unconfirmed', () => {
    const other = baseDraft({ draftId: 'd2' });
    const ctx = { drafts: [other], assignments: [], personId: 'person-1' };
    expect(validateDraft(baseDraft(), ctx)).toContain('duplicate_in_drafts');
    const replace = baseDraft({ kind: 'REPLACE', targetAssignmentId: 'spa-x', incumbent: { assignmentId: 'spa-x', personId: 'p', personName: 'P', roleName: 'SE', allocationPercentage: 100, version: 1, startDate: null, endDate: null } });
    expect(validateDraft(replace, { drafts: [], assignments: [], personId: 'person-1' })).toContain('slot_unconfirmed');
  });

  test('phase 无时间线/缺阶段；project 无 aspiration → INVALID', () => {
    const ctx = { drafts: [], assignments: [], personId: 'person-1' };
    expect(
      validateDraft(baseDraft({ assignmentDateMode: 'phase', phaseId: 'p1', taskContext: { hasPhaseTimeline: false, aspirationStart: null, aspirationFinish: null, terminal: false } }), ctx)
    ).toContain('phase_no_timeline');
    expect(validateDraft(baseDraft({ assignmentDateMode: 'phase' }), ctx)).toContain('missing_phase');
    expect(validateDraft(baseDraft({ assignmentDateMode: 'project' }), ctx)).toContain('project_no_aspiration');
  });
});

describe('draftAssignmentsReducer', () => {
  test('update 后统一重校验（页面不得手改 status）', () => {
    const draft = createDraftFromTask(task(), {
      personId: 'person-1',
      personPrimaryRoleId: 'role-se',
      personPrimaryRoleName: 'SE',
      scenarioId: 's1',
      assignments: [],
      makeDraftId: () => 'd1',
    })!;
    const ctx = { assignments: [], personId: 'person-1' };
    let state = draftAssignmentsReducer([], { type: 'add', drafts: [draft] }, ctx);
    expect(state[0].status).toBe('INVALID'); // fixed 无日期
    state = draftAssignmentsReducer(state, { type: 'update', draftId: 'd1', patch: { startDate: '2026-04-01', endDate: '2026-04-30' } }, ctx);
    expect(state[0].status).toBe('NORMAL');
    expect(state[0].errors).toEqual([]);
  });
});

describe('commitDrafts（§10.2/§10.4）', () => {
  function draft(kind: 'CREATE' | 'REPLACE', overrides: Partial<AssignmentDraft> = {}): AssignmentDraft {
    return {
      draftId: kind === 'CREATE' ? 'dc' : 'dr',
      sourceTaskId: 'task-1',
      projectId: 'task-1',
      projectName: 'Task One',
      roleId: 'role-se',
      roleName: 'SE',
      roleOptions: [],
      phaseId: null,
      assignmentDateMode: 'fixed',
      startDate: '2026-04-01',
      endDate: '2026-04-30',
      allocationPercentage: 20,
      kind,
      status: 'NORMAL',
      targetAssignmentId: kind === 'REPLACE' ? 'spa-old' : null,
      expectedVersion: null,
      incumbent:
        kind === 'REPLACE'
          ? { assignmentId: 'spa-old', personId: 'p-old', personName: 'Old', roleName: 'SE', allocationPercentage: 100, version: 7, startDate: null, endDate: null }
          : null,
      scenarioId: 'scenario-a',
      taskContext: { hasPhaseTimeline: false, aspirationStart: null, aspirationFinish: null, terminal: false },
      errors: [],
      submitState: 'IDLE',
      submitError: null,
      replaceConfirmed: kind !== 'REPLACE',
      ...overrides,
    };
  }
  const deps = {
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
  };

  beforeEach(() => {
    deps.create.mockClear();
    deps.update.mockClear();
    deps.create.mockResolvedValue({});
    deps.update.mockResolvedValue({});
  });

  test('CREATE 成功 → SUCCEEDED，payload 用草稿场景', async () => {
    const outcomes = await commitDrafts([draft('CREATE')], 'person-1', deps);
    expect(outcomes).toEqual([{ draftId: 'dc', submitState: 'SUCCEEDED' }]);
    expect(deps.create).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: 'task-1', assignment_date_mode: 'fixed', start_date: '2026-04-01' }),
      'scenario-a'
    );
  });

  test('REPLACE 剥 spa- 前缀并带版本对', async () => {
    await commitDrafts([draft('REPLACE')], 'person-1', deps);
    expect(deps.create).toHaveBeenCalledWith(
      expect.objectContaining({ replace_assignment_id: 'old', replace_expected_version: 7 }),
      'scenario-a'
    );
  });

  test('INVALID 草稿不参与提交', async () => {
    const invalid = draft('CREATE', { status: 'INVALID' });
    const outcomes = await commitDrafts([invalid], 'person-1', deps);
    expect(outcomes).toEqual([]);
    expect(deps.create).not.toHaveBeenCalled();
  });

  test('409 按 code 分流为 FAILED；无 HTTP 响应 → UNKNOWN', async () => {
    deps.create.mockRejectedValueOnce({ response: { status: 409, data: { code: 'ASSIGNMENT_DUPLICATE' } } });
    deps.create.mockRejectedValueOnce(new Error('Network Error'));
    const [failed, unknown] = await commitDrafts(
      [draft('CREATE'), draft('CREATE', { draftId: 'dc2' })],
      'person-1',
      deps
    );
    expect(failed).toMatchObject({ submitState: 'FAILED', code: 'ASSIGNMENT_DUPLICATE' });
    expect(unknown).toMatchObject({ submitState: 'UNKNOWN' });
    expect(unknown.code).toBeUndefined();
  });
});

describe('UNKNOWN 回读核对（§10.4）', () => {
  const base = {
    draftId: 'd1',
    sourceTaskId: 'task-1',
    projectId: 'task-1',
    projectName: 'Task One',
    roleId: 'role-se',
    roleName: 'SE',
    roleOptions: [],
    phaseId: null,
    assignmentDateMode: 'fixed' as const,
    startDate: '2026-04-01',
    endDate: '2026-04-30',
    allocationPercentage: 20,
    kind: 'CREATE' as const,
    status: 'NORMAL' as const,
    targetAssignmentId: null,
    expectedVersion: null,
    incumbent: null,
    scenarioId: 'scenario-a',
    taskContext: { hasPhaseTimeline: false, aspirationStart: null, aspirationFinish: null, terminal: false },
    errors: [],
    submitState: 'UNKNOWN' as const,
    submitError: null,
    replaceConfirmed: false,
  };

  test('同键参数一致 → SUCCEEDED；缺失/参数漂移 → FAILED', () => {
    const exact = {
      id: 'x1', project_id: 'task-1', person_id: 'person-1', role_id: 'role-se', phase_id: null,
      assignment_date_mode: 'fixed', allocation_percentage: 20,
      start_date: '2026-04-01', end_date: '2026-04-30',
    };
    const drifted = { ...exact, allocation_percentage: 50 };
    expect(matchesReconciledRow(base, 'person-1', exact)).toBe(true);
    expect(matchesReconciledRow(base, 'person-1', drifted)).toBe(false);

    const results = reconcileUnknownDrafts([base], 'person-1', [exact]);
    expect(results).toEqual([{ draftId: 'd1', submitState: 'SUCCEEDED' }]);
    const missing = reconcileUnknownDrafts([base], 'person-1', []);
    expect(missing).toEqual([{ draftId: 'd1', submitState: 'FAILED' }]);
  });

  test('phase 模式回读比对 phase_id 与模式，不比日期', () => {
    const phaseDraft = { ...base, assignmentDateMode: 'phase' as const, phaseId: 'phase-d', startDate: null, endDate: null };
    const row = {
      id: 'x2', project_id: 'task-1', person_id: 'person-1', role_id: 'role-se', phase_id: 'phase-d',
      assignment_date_mode: 'phase', allocation_percentage: 20,
      start_date: null, end_date: null,
    };
    expect(matchesReconciledRow(phaseDraft, 'person-1', row)).toBe(true);
  });
});
