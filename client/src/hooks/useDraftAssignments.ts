/**
 * useDraftAssignments（工作台 v2 §11/§12/§14）——draftStore 的 React 绑定。
 *
 * - 草稿绑定加入泳道时的 scenarioId；场景切换由页面比对禁用提交；
 * - 提交逐条进行（§10.2），409 按 code 分流成 CONFLICT 草稿；
 * - UNKNOWN 只在"无 HTTP 响应"时产生，回读永远用草稿绑定的原场景（§10.4）；
 * - 成功行在读侧刷新后退出草稿集合（每行只计一次，§9.2.4）。
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import {
  commitDrafts,
  draftAssignmentsReducer,
  reconcileUnknownDrafts,
  type AssignmentDraft,
  type DraftAction,
  type DraftErrorCode,
} from '../lib/assignmentDrafts';
import { fetchAllPersonAssignments } from '../lib/personAssignments';
import type { WorkloadAssignment } from '../lib/personWorkload';

const CONFLICT_CODES_BY_SERVER_CODE: Record<string, DraftErrorCode[]> = {
  ASSIGNMENT_DUPLICATE: ['duplicate_key'],
  ASSIGNMENT_SLOT_OCCUPIED: ['slot_unconfirmed'],
  ASSIGNMENT_VERSION_CONFLICT: ['version_conflict'],
};

export interface UseDraftAssignmentsOptions {
  personId: string;
  /** 草稿加入时的场景 id（草稿自身携带；此处仅作集合上下文） */
  assignments: WorkloadAssignment[];
  assignmentsQuery: UseQueryResult<unknown, unknown>;
  onAfterCommit?: () => void;
}

export interface DraftSubmitSummary {
  succeeded: number;
  failed: number;
  unknown: number;
}

export function useDraftAssignments(options: UseDraftAssignmentsOptions) {
  const { personId, assignments, assignmentsQuery, onAfterCommit } = options;
  const [drafts, setDrafts] = useState<AssignmentDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [lastSummary, setLastSummary] = useState<DraftSubmitSummary | null>(null);

  // 校验上下文用最新值，但 dispatch 身份稳定（避免渲染期回调抖动）
  const contextRef = useRef({ assignments, personId });
  contextRef.current = { assignments, personId };

  const dispatch = useCallback((action: DraftAction) => {
    setDrafts((prev) => draftAssignmentsReducer(prev, action, contextRef.current));
  }, []);

  const addDrafts = useCallback(
    (incoming: AssignmentDraft[]) => dispatch({ type: 'add', drafts: incoming }),
    [dispatch]
  );
  const updateDraft = useCallback(
    (draftId: string, patch: Partial<AssignmentDraft>) => dispatch({ type: 'update', draftId, patch }),
    [dispatch]
  );
  const removeDraft = useCallback(
    (draftId: string) => dispatch({ type: 'remove', draftId }),
    [dispatch]
  );
  const clearDrafts = useCallback(() => dispatch({ type: 'clear' }), [dispatch]);

  const submit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    setLastSummary(null);
    try {
      const outcomes = await commitDrafts(
        drafts,
        personId,
        {
          create: (payload, scenarioId) =>
            api.assignments.create(payload as never, { scenarioId }).then((response) => response.data),
          update: (id, payload, scenarioId) =>
            api.assignments.update(id, payload as never, { scenarioId }).then((response) => response.data),
        },
        {
          onStateChange: (draftId, outcome) => {
            dispatch({
              type: 'setSubmitState',
              draftId,
              submitState: outcome.submitState,
              submitError: outcome.message ?? null,
              conflictCodes: outcome.code
                ? CONFLICT_CODES_BY_SERVER_CODE[outcome.code]
                : undefined,
            });
          },
        }
      );

      // UNKNOWN 回读核对：永远用草稿绑定的原场景（§10.4/盯点 3）
      const unknownIds = new Set(
        outcomes.filter((outcome) => outcome.submitState === 'UNKNOWN').map((outcome) => outcome.draftId)
      );
      if (unknownIds.size > 0) {
        const scenarioId = drafts.find((draft) => unknownIds.has(draft.draftId))?.scenarioId;
        if (scenarioId) {
          try {
            const readBack = await fetchAllPersonAssignments(personId, scenarioId);
            const reconciled = reconcileUnknownDrafts(
              drafts.filter((draft) => unknownIds.has(draft.draftId)),
              personId,
              readBack.rows as never
            );
            for (const result of reconciled) {
              dispatch({
                type: 'setSubmitState',
                draftId: result.draftId,
                submitState: result.submitState,
                submitError: result.submitState === 'FAILED' ? 'reconcile_missing' : null,
              });
            }
          } catch {
            // 回读失败：保持 UNKNOWN，等用户手动重试（不盲改成失败）
          }
        }
      }

      const summary: DraftSubmitSummary = {
        succeeded: 0,
        failed: 0,
        unknown: 0,
      };
      for (const outcome of outcomes) {
        if (outcome.submitState === 'SUCCEEDED') summary.succeeded += 1;
        else if (outcome.submitState === 'FAILED') summary.failed += 1;
        else if (outcome.submitState === 'UNKNOWN') summary.unknown += 1;
      }
      setLastSummary(summary);

      if (summary.succeeded > 0) {
        await onAfterCommit?.();
        // 读侧刷新后再移除成功行，避免泳道出现空窗（§10.4）
        setDrafts((prev) => prev.filter((draft) => draft.submitState !== 'SUCCEEDED'));
      }
    } finally {
      setSubmitting(false);
    }
  }, [drafts, personId, submitting, dispatch, onAfterCommit]);

  const counts = useMemo(() => {
    const submittable = drafts.filter(
      (draft) => draft.status === 'NORMAL' && (draft.submitState === 'IDLE' || draft.submitState === 'FAILED')
    );
    return {
      total: drafts.length,
      submittable: submittable.length,
      invalid: drafts.filter((draft) => draft.status === 'INVALID').length,
      conflict: drafts.filter((draft) => draft.status === 'CONFLICT').length,
      unknown: drafts.filter((draft) => draft.submitState === 'UNKNOWN').length,
      submitting: drafts.filter((draft) => draft.submitState === 'SUBMITTING').length,
    };
  }, [drafts]);

  return {
    drafts,
    counts,
    submitting,
    lastSummary,
    addDrafts,
    updateDraft,
    removeDraft,
    clearDrafts,
    submit,
    dispatch,
  };
}
