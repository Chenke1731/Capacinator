/**
 * 工作台 v2 草稿模型（设计 §6.4/§7/§10）——ghost 草稿的分类、校验、归约
 * 与逐条提交的唯一口径。组件不得自带副本。
 *
 * 与服务端谓词逐字段对齐（Claude 复评盯点 1）：
 * - 重复键 = scenario + project + person + role + phase（任意状态；phase NULL
 *   显式判等，不能 != 也不能 ==）——同构 findDuplicateAssignment；
 * - SE/MDE 槽 = scenario + project + role + status='active'，不按 phase/person
 *   过滤——同构 AssignmentsController.create 的槽位谓词；
 * - 409 按 code 分流（盯点 3）：ASSIGNMENT_DUPLICATE / ASSIGNMENT_SLOT_OCCUPIED /
 *   ASSIGNMENT_VERSION_CONFLICT 对应三条处置路径；UNKNOWN 只认"无 HTTP 响应"。
 */
import { workloadDateOnly, type WorkloadAssignment } from './personWorkload';

export type DraftKind = 'CREATE' | 'EDIT' | 'REPLACE';
export type DraftStatus = 'NORMAL' | 'INVALID' | 'CONFLICT';
export type DraftSubmitState = 'IDLE' | 'SUBMITTING' | 'UNKNOWN' | 'SUCCEEDED' | 'FAILED';

export type DraftErrorCode =
  | 'missing_role'
  | 'missing_phase'
  | 'phase_no_timeline'
  | 'project_no_aspiration'
  | 'missing_dates'
  | 'invalid_date_order'
  | 'invalid_allocation'
  | 'terminal_task'
  | 'duplicate_key'
  | 'duplicate_in_drafts'
  | 'slot_unconfirmed'
  | 'version_conflict'
  | 'scenario_mismatch';

export interface SelectionTaskRoleDemand {
  role_id: string;
  role_name: string;
  phase_id: string | null;
  required_headcount: number | null;
  source: string;
}

export interface SelectionTaskAssignedSummary {
  id: string;
  role_id: string;
  phase_id: string | null;
  person_id: string;
  person_name: string;
  allocation_percentage: number;
  status: string;
}

export interface SelectionTaskSlot {
  role_id: string;
  role_name: string;
  incumbent_assignment_id: string;
  incumbent_person_id: string;
  incumbent_person_name: string;
  incumbent_version: number;
  incumbent_start_date: string | null;
  incumbent_end_date: string | null;
}

/** selection=1 行形状（§13.1）；页面上禁止再从 board-feed 拼装 */
export interface SelectionTask {
  id: string;
  name: string;
  parent_id: string | null;
  child_count: number;
  has_children: boolean;
  lifecycle_state: string | null;
  project_sub_type_name: string | null;
  is_ancestor?: boolean;
  timeline_start: string | null;
  timeline_end: string | null;
  aspiration_start: string | null;
  aspiration_finish: string | null;
  has_phase_timeline: boolean;
  role_demands: SelectionTaskRoleDemand[];
  assigned_summary: SelectionTaskAssignedSummary[];
  single_person_slots: SelectionTaskSlot[];
}

export interface IncumbentSummary {
  assignmentId: string;
  personId: string;
  personName: string;
  roleName: string;
  allocationPercentage: number;
  version: number;
  startDate: string | null;
  endDate: string | null;
}

export interface AssignmentDraft {
  draftId: string;
  sourceTaskId: string;
  projectId: string;
  projectName: string;
  roleId: string | null;
  roleName: string | null;
  /** inspector 的角色候选（任务角色需求去重；无需求时给人员主角色兜底） */
  roleOptions: Array<{ role_id: string; role_name: string; required_headcount: number | null }>;
  phaseId: string | null;
  assignmentDateMode: 'fixed' | 'phase' | 'project';
  /** fixed=用户输入；phase/project=派生只读（泳道展示用） */
  startDate: string | null;
  endDate: string | null;
  allocationPercentage: number;
  kind: DraftKind;
  status: DraftStatus;
  targetAssignmentId: string | null;
  expectedVersion: number | null;
  incumbent: IncumbentSummary | null;
  scenarioId: string;
  /** 分类/校验事实（任务行快照，避免渲染期回查任务表） */
  taskContext: {
    hasPhaseTimeline: boolean;
    aspirationStart: string | null;
    aspirationFinish: string | null;
    terminal: boolean;
  };
  errors: DraftErrorCode[];
  submitState: DraftSubmitState;
  /** 服务端/校验给的展示文案（已本地化），无则为 null */
  submitError: string | null;
  /** REPLACE 必须显式确认（§7.1/§8） */
  replaceConfirmed: boolean;
}

/** phase NULL 显式判等——与 SQLite 唯一索引对 NULL 不去重的服务端口径一致 */
export function phaseKeyEqual(a: unknown, b: unknown): boolean {
  const left = (a ?? null) as string | null;
  const right = (b ?? null) as string | null;
  return left === right;
}

/** SE/MDE 单人角色判定（名字口径与服务端 roleNameFor 一致） */
export function isSinglePersonRole(roleName: string | null | undefined): boolean {
  return roleName === 'SE' || roleName === 'MDE';
}

/** 同业务键查重：任意状态 + phase NULL 显式判等（盯点 1） */
export function findSameKeyAssignment<T extends WorkloadAssignment>(
  assignments: T[],
  key: { projectId: string; personId: string; roleId: string | null; phaseId: string | null }
): T | undefined {
  return assignments.find(
    (row) =>
      String(row.project_id) === String(key.projectId) &&
      String(row.person_id) === String(key.personId) &&
      String(row.role_id) === String(key.roleId) &&
      phaseKeyEqual(row.phase_id ?? null, key.phaseId)
  );
}

export type SelectionClassification =
  | { kind: 'CREATE' }
  | { kind: 'EDIT'; existingId: string }
  | { kind: 'REPLACE'; slot: SelectionTaskSlot };

export interface ClassifySelectionParams {
  personId: string;
  /** 当前统一角色（composer 覆盖）或任务默认角色 */
  roleId: string | null;
  roleName: string | null;
  /** 当前统一阶段覆盖或任务默认阶段（null 显式） */
  phaseId: string | null;
  /** 当前场景的人员全量分配（任意状态） */
  assignments: WorkloadAssignment[];
}

/**
 * 完整业务键分类（§6.4）：
 * - 无同键行 → CREATE 勾选；
 * - 有同键行 → EDIT（Phase 1 走明细行编辑，不发 ghost）；
 * - SE/MDE 槽被他人占 → REPLACE（显式确认后发 ghost）；
 * - 槽被本人占 → 指向该行走 EDIT（本人占用属"编辑"而非"替换"）。
 */
export function classifySelection(
  task: SelectionTask,
  params: ClassifySelectionParams
): SelectionClassification {
  const roleId = params.roleId;
  if (!roleId) return { kind: 'CREATE' };

  const sameKey = findSameKeyAssignment(params.assignments, {
    projectId: task.id,
    personId: params.personId,
    roleId,
    phaseId: params.phaseId,
  });
  if (sameKey) {
    return { kind: 'EDIT', existingId: String(sameKey.id) };
  }

  if (isSinglePersonRole(params.roleName)) {
    const slot = task.single_person_slots.find((entry) => entry.role_id === roleId);
    if (slot) {
      if (slot.incumbent_person_id === params.personId) {
        return { kind: 'EDIT', existingId: slot.incumbent_assignment_id };
      }
      return { kind: 'REPLACE', slot };
    }
  }
  return { kind: 'CREATE' };
}

export interface CreateDraftParams {
  personId: string;
  personPrimaryRoleId?: string | null;
  personPrimaryRoleName?: string | null;
  scenarioId: string;
  assignments: WorkloadAssignment[];
  /** composer 统一覆盖（§6.5）；未覆盖项用任务/人员默认 */
  overrides?: {
    roleId?: string | null;
    allocationPercentage?: number;
    assignmentDateMode?: 'fixed' | 'phase' | 'project';
    startDate?: string | null;
    endDate?: string | null;
  };
  makeDraftId?: () => string;
}

let draftSeq = 0;
function nextDraftId(): string {
  draftSeq += 1;
  return `draft-${Date.now().toString(36)}-${draftSeq}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 勾选任务 → ghost 草稿（§7.3 默认值）。EDIT 分类不产生草稿（行内编辑），
 * REPLACE 产生待确认草稿（显式确认前不参与提交）。
 */
export function createDraftFromTask(
  task: SelectionTask,
  params: CreateDraftParams
): AssignmentDraft | null {
  if (task.is_ancestor) return null;

  // 默认角色：任务角色需求优先，无明确需求取人员主角色。
  // composer 的 roleId=null 表示"按任务默认"，不覆盖（nullish 合并）。
  const demand = task.role_demands[0] ?? null;
  const defaultRoleId = demand?.role_id ?? params.personPrimaryRoleId ?? null;
  const defaultRoleName = demand?.role_name ?? params.personPrimaryRoleName ?? null;
  const roleId = params.overrides?.roleId ?? defaultRoleId;
  const roleName = roleId === defaultRoleId ? defaultRoleName : findRoleName(task, roleId) ?? params.personPrimaryRoleName ?? null;

  // 默认阶段：默认角色对应的需求阶段（无则 null）
  const defaultPhaseId = demand?.phase_id ?? null;
  const phaseId = defaultPhaseId;

  // 默认日期模式（§7.3）：阶段时间线 → phase；否则 aspiration → project；否则 fixed 空日期
  let mode: 'fixed' | 'phase' | 'project';
  if (task.has_phase_timeline) mode = 'phase';
  else if (task.aspiration_start || task.aspiration_finish) mode = 'project';
  else mode = 'fixed';
  if (params.overrides?.assignmentDateMode) mode = params.overrides.assignmentDateMode;

  let startDate: string | null = null;
  let endDate: string | null = null;
  if (mode === 'project') {
    startDate = task.aspiration_start ?? null;
    endDate = task.aspiration_finish ?? null;
  } else if (mode === 'fixed') {
    startDate = params.overrides?.startDate ?? null;
    endDate = params.overrides?.endDate ?? null;
  }

  const terminal = task.lifecycle_state === 'delivered' || task.lifecycle_state === 'cancelled';
  const taskContext = {
    hasPhaseTimeline: task.has_phase_timeline,
    aspirationStart: task.aspiration_start ?? null,
    aspirationFinish: task.aspiration_finish ?? null,
    terminal,
  };

  const classification = classifySelection(task, {
    personId: params.personId,
    roleId,
    roleName,
    phaseId,
    assignments: params.assignments,
  });

  const draft: AssignmentDraft = {
    draftId: params.makeDraftId ? params.makeDraftId() : nextDraftId(),
    sourceTaskId: task.id,
    projectId: task.id,
    projectName: task.name,
    roleId,
    roleName,
    roleOptions: roleOptionsForTask(task, params.personPrimaryRoleId, params.personPrimaryRoleName),
    phaseId,
    assignmentDateMode: mode,
    startDate,
    endDate,
    allocationPercentage:
      params.overrides?.allocationPercentage !== undefined ? params.overrides.allocationPercentage : 20,
    kind: 'CREATE',
    status: 'NORMAL',
    targetAssignmentId: null,
    expectedVersion: null,
    incumbent: null,
    scenarioId: params.scenarioId,
    taskContext,
    errors: [],
    submitState: 'IDLE',
    submitError: null,
    replaceConfirmed: false,
  };

  if (classification.kind === 'REPLACE') {
    const slot = classification.slot;
    return {
      ...draft,
      kind: 'REPLACE',
      targetAssignmentId: slot.incumbent_assignment_id,
      expectedVersion: slot.incumbent_version,
      incumbent: {
        assignmentId: slot.incumbent_assignment_id,
        personId: slot.incumbent_person_id,
        personName: slot.incumbent_person_name,
        roleName: slot.role_name,
        allocationPercentage: 0,
        version: slot.incumbent_version,
        startDate: slot.incumbent_start_date,
        endDate: slot.incumbent_end_date,
      },
    };
  }
  // EDIT/CREATE 分类都产生 CREATE 型草稿；EDIT 由行内入口处理，这里只落 CREATE
  return draft;
}

function findRoleName(task: SelectionTask, roleId: string | null): string | null {
  if (!roleId) return null;
  const demand = task.role_demands.find((entry) => entry.role_id === roleId);
  return demand?.role_name ?? null;
}

function roleOptionsForTask(
  task: SelectionTask,
  primaryRoleId: string | null | undefined,
  primaryRoleName: string | null | undefined
): Array<{ role_id: string; role_name: string; required_headcount: number | null }> {
  const seen = new Set<string>();
  const options: Array<{ role_id: string; role_name: string; required_headcount: number | null }> = [];
  for (const demand of task.role_demands) {
    if (seen.has(demand.role_id)) continue;
    seen.add(demand.role_id);
    options.push({
      role_id: demand.role_id,
      role_name: demand.role_name,
      required_headcount: demand.required_headcount,
    });
  }
  if (primaryRoleId && !seen.has(primaryRoleId)) {
    options.push({ role_id: primaryRoleId, role_name: primaryRoleName ?? '', required_headcount: null });
  }
  return options;
}

export interface ValidateDraftContext {
  /** 全部草稿（做草稿间同键查重） */
  drafts: AssignmentDraft[];
  /** 当前场景人员全量分配（任意状态） */
  assignments: WorkloadAssignment[];
  personId: string;
}

/** §10.3 阻断条件 → INVALID/CONFLICT；容量超载不在其列（只提醒不阻断）。 */
export function validateDraft(draft: AssignmentDraft, context: ValidateDraftContext): DraftErrorCode[] {
  const errors: DraftErrorCode[] = [];
  if (draft.taskContext.terminal) errors.push('terminal_task');
  if (!draft.roleId) errors.push('missing_role');
  if (!Number.isFinite(draft.allocationPercentage) || draft.allocationPercentage <= 0 || draft.allocationPercentage > 200) {
    errors.push('invalid_allocation');
  }
  if (draft.assignmentDateMode === 'phase') {
    if (!draft.taskContext.hasPhaseTimeline) errors.push('phase_no_timeline');
    if (!draft.phaseId) errors.push('missing_phase');
  }
  if (draft.assignmentDateMode === 'project' && !draft.taskContext.aspirationStart && !draft.taskContext.aspirationFinish) {
    errors.push('project_no_aspiration');
  }
  if (draft.assignmentDateMode === 'fixed') {
    if (!draft.startDate || !draft.endDate) errors.push('missing_dates');
    else if (draft.startDate > draft.endDate) errors.push('invalid_date_order');
  }
  if (draft.roleId) {
    const duplicate = findSameKeyAssignment(context.assignments, {
      projectId: draft.projectId,
      personId: context.personId,
      roleId: draft.roleId,
      phaseId: draft.phaseId,
    });
    // EDIT/REPLACE 覆盖原行：target 行自身不算重复
    if (duplicate && String(duplicate.id) !== String(draft.targetAssignmentId)) {
      errors.push('duplicate_key');
    }
    const sibling = context.drafts.find(
      (other) =>
        other.draftId !== draft.draftId &&
        other.scenarioId === draft.scenarioId &&
        String(other.projectId) === String(draft.projectId) &&
        String(other.roleId ?? '') === String(draft.roleId) &&
        phaseKeyEqual(other.phaseId, draft.phaseId)
    );
    if (sibling) errors.push('duplicate_in_drafts');
    if (draft.kind === 'REPLACE' && !draft.replaceConfirmed) errors.push('slot_unconfirmed');
  }
  return [...new Set(errors)];
}

export function statusForErrors(errors: DraftErrorCode[]): DraftStatus {
  const conflictCodes: DraftErrorCode[] = ['duplicate_key', 'duplicate_in_drafts', 'slot_unconfirmed', 'version_conflict'];
  if (errors.some((code) => conflictCodes.includes(code))) return 'CONFLICT';
  if (errors.length > 0) return 'INVALID';
  return 'NORMAL';
}

export type DraftAction =
  | { type: 'add'; drafts: AssignmentDraft[] }
  | { type: 'update'; draftId: string; patch: Partial<AssignmentDraft> }
  | { type: 'remove'; draftId: string }
  | { type: 'clear' }
  | { type: 'setSubmitState'; draftId: string; submitState: DraftSubmitState; submitError?: string | null; conflictCodes?: DraftErrorCode[] }
  | { type: 'revalidate'; assignments: WorkloadAssignment[]; personId: string };

function withValidation(drafts: AssignmentDraft[], context: { assignments: WorkloadAssignment[]; personId: string }): AssignmentDraft[] {
  return drafts.map((draft) => {
    const errors = validateDraft(draft, { drafts, assignments: context.assignments, personId: context.personId });
    return { ...draft, errors, status: statusForErrors(errors) };
  });
}

/** 草稿归约（§11 draftStore）：所有变更后统一重校验，禁止页面手改 status。 */
export function draftAssignmentsReducer(
  state: AssignmentDraft[],
  action: DraftAction,
  context?: { assignments: WorkloadAssignment[]; personId: string }
): AssignmentDraft[] {
  const applyValidation = (drafts: AssignmentDraft[]): AssignmentDraft[] => {
    if (!context) return drafts;
    return withValidation(drafts, context);
  };

  switch (action.type) {
    case 'add':
      return applyValidation([...state, ...action.drafts]);
    case 'update':
      return applyValidation(
        state.map((draft) => (draft.draftId === action.draftId ? { ...draft, ...action.patch } : draft))
      );
    case 'remove':
      return applyValidation(state.filter((draft) => draft.draftId !== action.draftId));
    case 'clear':
      return [];
    case 'setSubmitState':
      return state.map((draft) => {
        if (draft.draftId !== action.draftId) return draft;
        const next: AssignmentDraft = { ...draft, submitState: action.submitState, submitError: action.submitError ?? null };
        if (action.conflictCodes?.length) {
          next.errors = [...new Set([...draft.errors, ...action.conflictCodes])];
          next.status = statusForErrors(next.errors);
        }
        return next;
      });
    case 'revalidate':
      return withValidation(state, { assignments: action.assignments, personId: action.personId });
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// 提交管线（§10）
// ---------------------------------------------------------------------------

export interface DraftCommitDeps {
  create(payload: Record<string, unknown>, scenarioId: string): Promise<unknown>;
  update(id: string, payload: Record<string, unknown>, scenarioId: string): Promise<unknown>;
}

export interface DraftCommitOutcome {
  draftId: string;
  submitState: DraftSubmitState;
  /** 409 code 或错误文案键 */
  code?: string;
  message?: string;
}

function rawAssignmentId(id: string): string {
  return id.startsWith('spa-') ? id.slice(4) : id;
}

function buildPayload(draft: AssignmentDraft, personId: string): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    project_id: draft.projectId,
    person_id: personId,
    role_id: draft.roleId,
    allocation_percentage: draft.allocationPercentage,
    assignment_date_mode: draft.assignmentDateMode,
  };
  if (draft.assignmentDateMode === 'fixed') {
    payload.start_date = draft.startDate;
    payload.end_date = draft.endDate;
  } else if (draft.assignmentDateMode === 'phase') {
    payload.phase_id = draft.phaseId;
  }
  if (draft.kind === 'REPLACE' && draft.incumbent) {
    payload.replace_assignment_id = rawAssignmentId(draft.incumbent.assignmentId);
    payload.replace_expected_version = draft.incumbent.version;
  }
  return payload;
}

function classifyCommitError(error: unknown): { submitState: DraftSubmitState; code?: string; message?: string } {
  const maybe = error as { response?: { status?: number; data?: { code?: string; message?: string; error?: string } }; message?: string } | null;
  const response = maybe?.response;
  if (!response) {
    // 无 HTTP 响应（网络断开/超时）→ 结果未知；回读核对前不得重发
    return { submitState: 'UNKNOWN' };
  }
  const data = response.data ?? {};
  return {
    submitState: 'FAILED',
    code: data.code,
    message: String(data.message ?? data.error ?? maybe?.message ?? `HTTP ${response.status}`),
  };
}

/**
 * 逐条提交（§10.2）：只发 status=NORMAL 且未被上一轮锁定的草稿；顺序执行；
 * 每条独立分流 409 code；部分失败不清空草稿。
 */
export async function commitDrafts(
  drafts: AssignmentDraft[],
  personId: string,
  deps: DraftCommitDeps,
  callbacks?: {
    onStateChange?: (draftId: string, outcome: DraftCommitOutcome) => void;
  }
): Promise<DraftCommitOutcome[]> {
  const outcomes: DraftCommitOutcome[] = [];
  const eligible = drafts.filter(
    (draft) =>
      draft.status === 'NORMAL' &&
      (draft.submitState === 'IDLE' || draft.submitState === 'FAILED')
  );
  for (const draft of eligible) {
    callbacks?.onStateChange?.(draft.draftId, { draftId: draft.draftId, submitState: 'SUBMITTING' });
    let outcome: DraftCommitOutcome;
    try {
      if (draft.kind === 'EDIT' && draft.targetAssignmentId) {
        const payload = buildPayload(draft, personId);
        delete payload.project_id;
        delete payload.person_id;
        delete payload.replace_assignment_id;
        delete payload.replace_expected_version;
        if (draft.expectedVersion !== null) payload.expected_version = draft.expectedVersion;
        await deps.update(draft.targetAssignmentId, payload, draft.scenarioId);
      } else {
        await deps.create(buildPayload(draft, personId), draft.scenarioId);
      }
      outcome = { draftId: draft.draftId, submitState: 'SUCCEEDED' };
    } catch (error) {
      const classified = classifyCommitError(error);
      outcome = { draftId: draft.draftId, ...classified };
    }
    outcomes.push(outcome);
    callbacks?.onStateChange?.(draft.draftId, outcome);
  }
  return outcomes;
}

export interface UnknownReconcileRow {
  id: string;
  project_id: string;
  person_id: string;
  role_id: string;
  phase_id: string | null;
  assignment_date_mode: string | null;
  allocation_percentage: number | string | null;
  start_date: string | number | null;
  end_date: string | number | null;
}

/** UNKNOWN 回读核对（§10.4）：同键 + 参数一致 → 成功；否则失败可重试。 */
export function matchesReconciledRow(draft: AssignmentDraft, personId: string, row: UnknownReconcileRow): boolean {
  if (String(row.project_id) !== String(draft.projectId)) return false;
  if (String(row.person_id) !== String(personId)) return false;
  if (String(row.role_id) !== String(draft.roleId)) return false;
  if (!phaseKeyEqual(row.phase_id ?? null, draft.phaseId)) return false;
  if (Number(row.allocation_percentage ?? 0) !== Number(draft.allocationPercentage)) return false;
  if ((row.assignment_date_mode ?? 'fixed') !== draft.assignmentDateMode) return false;
  if (draft.assignmentDateMode === 'fixed') {
    if (workloadDateOnly(row.start_date) !== draft.startDate) return false;
    if (workloadDateOnly(row.end_date) !== draft.endDate) return false;
  }
  return true;
}

export function reconcileUnknownDrafts(
  drafts: AssignmentDraft[],
  personId: string,
  rows: UnknownReconcileRow[]
): Array<{ draftId: string; submitState: DraftSubmitState }> {
  const results: Array<{ draftId: string; submitState: DraftSubmitState }> = [];
  for (const draft of drafts) {
    if (draft.submitState !== 'UNKNOWN') continue;
    const matched = rows.some((row) => matchesReconciledRow(draft, personId, row));
    results.push({ draftId: draft.draftId, submitState: matched ? 'SUCCEEDED' : 'FAILED' });
  }
  return results;
}

// ---------------------------------------------------------------------------
// 容量投影（影响预览共用）
// ---------------------------------------------------------------------------

export function draftToTimelineRow(draft: AssignmentDraft) {
  return {
    id: draft.draftId,
    draftId: draft.draftId,
    kind: draft.kind,
    targetAssignmentId: draft.targetAssignmentId,
    allocationPercentage: draft.allocationPercentage,
    startDate: draft.startDate,
    endDate: draft.endDate,
    status: null as string | null,
    submitState: draft.submitState,
  };
}
