import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRightLeft,
  BriefcaseBusiness,
  Pencil,
  Pause,
  Play,
  RefreshCw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../lib/api-client';
import { queryKeys } from '../lib/queryKeys';
import { useScenario } from '../contexts/ScenarioContext';
import { invalidateSchedulingReads } from '../lib/invalidateSchedulingReads';
import { fetchPersonUtilization, personUtilizationRowsFrom } from '../lib/personUtilizationData';
import {
  summarizePersonWorkload,
  workloadDateOnly,
  type ExcludedWorkloadAssignment,
  type WorkloadAssignment,
} from '../lib/personWorkload';
import { toISODateString } from '../utils/dateUtils';
import { Badge } from '../components/ui/badge';
import { AssignmentImpactPreview } from '../components/workload/AssignmentImpactPreview';
import { PersonTaskPicker } from '../components/workload/PersonTaskPicker';
import './PersonWorkload.css';

interface PersonRow {
  id: string;
  name: string;
  primary_role_name?: string | null;
  default_availability_percentage?: number | null;
  roles?: Array<{ role_id?: string; role_name?: string; is_primary?: number }>;
}

interface AssignmentRow extends WorkloadAssignment {
  project_id: string;
  project_name?: string | null;
  role_name?: string | null;
  phase_name?: string | null;
  assignment_type?: 'scenario' | 'direct' | string | null;
  assignment_date_mode?: 'fixed' | 'phase' | 'project' | string | null;
  date_resolution_error?: string | null;
  version?: number;
}

interface RowDraft {
  allocation: string;
  startDate: string;
  endDate: string;
}

interface PersonOption {
  id: string;
  name: string;
}

interface HandoverDraft {
  successorId: string;
  effectiveDate: string;
  allocation: string;
}

type Row = AssignmentRow | ExcludedWorkloadAssignment<AssignmentRow>;

function isExcludedRow(row: Row): row is ExcludedWorkloadAssignment<AssignmentRow> {
  return 'assignment' in row && 'reason' in row;
}

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
  unknown: 'outline',
  unavailable: 'secondary',
  over: 'destructive',
  full: 'warning',
  partial: 'outline',
  available: 'success',
};

export default function PersonWorkload() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { currentScenario, scenarios, setCurrentScenario } = useScenario();

  const personQuery = useQuery<PersonRow>({
    queryKey: queryKeys.people.detail(id ?? ''),
    queryFn: async () => (await api.people.get(id!)).data as unknown as PersonRow,
    enabled: !!id,
  });

  const assignmentsQuery = useQuery<AssignmentRow[]>({
    queryKey: queryKeys.assignments.list({ person_id: id, limit: 2000 }, currentScenario?.id),
    queryFn: async () => {
      const response = await api.assignments.list({ person_id: id!, limit: 2000 } as never);
      return response.data.data as unknown as AssignmentRow[];
    },
    enabled: !!id,
  });

  const utilizationQuery = useQuery({
    queryKey: queryKeys.people.utilization(currentScenario?.id),
    queryFn: fetchPersonUtilization,
  });
  const peopleQuery = useQuery<PersonOption[]>({
    queryKey: queryKeys.people.list({ is_active: 'true' }, currentScenario?.id),
    queryFn: async () => {
      const response = await api.people.list({ limit: 500, is_active: 'true' });
      return response.data.data as unknown as PersonOption[];
    },
    staleTime: 60_000,
  });

  const utilizationRow = personUtilizationRowsFrom(utilizationQuery.data).find(
    (row) => String(row.person_id) === id
  );
  // 参考日优先用服务端 utilization 端点返回的 as_of；旧数据没有该字段时
  // 只用于展示，不参与容量口径（selector 明确要求传入合法 asOf）。
  const asOf =
    typeof utilizationRow?.as_of === 'string' && utilizationRow.as_of
      ? utilizationRow.as_of
      : toISODateString(new Date());
  const availability = utilizationQuery.isError
    ? null
    : utilizationRow?.current_availability_percentage;

  const summary = useMemo(
    () =>
      summarizePersonWorkload<AssignmentRow>(assignmentsQuery.data ?? [], {
        asOf,
        availability,
      }),
    [assignmentsQuery.data, asOf, availability]
  );

  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editScenarioId, setEditScenarioId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RowDraft>({ allocation: '', startDate: '', endDate: '' });
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [handoverRowId, setHandoverRowId] = useState<string | null>(null);
  const [handoverDraft, setHandoverDraft] = useState<HandoverDraft>({
    successorId: '',
    effectiveDate: '',
    allocation: '',
  });
  const [handoverMessage, setHandoverMessage] = useState<{ tone: 'error' | 'warning' | 'success'; text: string } | null>(null);
  const [batchMode, setBatchMode] = useState(false);
  const [batchDrafts, setBatchDrafts] = useState<Record<string, string>>({});
  const [batchMessage, setBatchMessage] = useState<{ tone: 'error' | 'warning' | 'success'; text: string } | null>(null);
  const activeScenarioId = currentScenario?.id ?? '';
  const scenarioMismatch = Boolean(editingId && editScenarioId && editScenarioId !== activeScenarioId);

  const beginEdit = (row: AssignmentRow) => {
    setEditingId(row.id);
    setEditScenarioId(activeScenarioId || null);
    setRowError(null);
    setDraft({
      allocation: String(Number(row.allocation_percentage ?? 0)),
      startDate: workloadDateOnly(row.start_date) ?? '',
      endDate: workloadDateOnly(row.end_date) ?? '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditScenarioId(null);
    setRowError(null);
  };

  const saveMutation = useMutation({
    mutationFn: async ({ row, draft: next, scenarioId }: { row: AssignmentRow; draft: RowDraft; scenarioId: string }) => {
      const payload: Record<string, unknown> = {};
      const allocation = Number(next.allocation);
      if (!Number.isFinite(allocation) || allocation <= 0 || allocation > 200) {
        throw new Error(t('assignments:workload.edit.invalidAllocation'));
      }
      if (allocation !== Number(row.allocation_percentage ?? 0)) {
        payload.allocation_percentage = allocation;
      }

      const mode = row.assignment_date_mode ?? 'fixed';
      if (mode === 'fixed') {
        if (!next.startDate || !next.endDate) {
          throw new Error(t('assignments:workload.edit.invalidDates'));
        }
        if (next.startDate > next.endDate) {
          throw new Error(t('assignments:workload.edit.invalidDateOrder'));
        }
        if (next.startDate !== (workloadDateOnly(row.start_date) ?? '')) {
          payload.start_date = next.startDate;
        }
        if (next.endDate !== (workloadDateOnly(row.end_date) ?? '')) {
          payload.end_date = next.endDate;
        }
      }

      if (Object.keys(payload).length === 0) {
        return { noop: true, row };
      }
      if (row.version !== undefined) payload.expected_version = row.version;
      const response = await api.assignments.update(row.id, payload as never, { scenarioId });
      return response.data;
    },
    onMutate: ({ row }) => {
      setSavingId(row.id);
      setRowError(null);
    },
    onSuccess: (_data, { row }) => {
      setSavingId(null);
      setEditingId(null);
      setEditScenarioId(null);
      setRowError(null);
      void invalidateSchedulingReads(queryClient, String(row.project_id ?? ''));
    },
    onError: (error: any, { row }) => {
      setSavingId(null);
      const status = error?.response?.status;
      const message =
        status === 409
          ? t('assignments:workload.edit.versionConflict')
          : String(
              error?.response?.data?.error ??
                error?.response?.data?.message ??
                error?.message ??
                t('assignments:workload.edit.saveFailed')
            );
      setRowError({ id: row.id, message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ row, scenarioId }: { row: AssignmentRow; scenarioId: string; focusIndex?: number }) =>
      api.assignments.delete(
        row.id,
        row.version !== undefined ? { expected_version: row.version } : undefined,
        { scenarioId }
      ),
    onMutate: ({ row }) => {
      setSavingId(row.id);
      setRowError(null);
    },
    onSuccess: async (_data, { row, focusIndex }) => {
      setSavingId(null);
      setRowError(null);
      await invalidateSchedulingReads(queryClient, String(row.project_id ?? ''));
      window.requestAnimationFrame(() => {
        const buttons = document.querySelectorAll<HTMLElement>(
          '.person-workload-page [data-testid="pw-edit-row"]'
        );
        if (buttons.length === 0) return;
        const index = focusIndex === undefined ? 0 : Math.min(Math.max(focusIndex, 0), buttons.length - 1);
        buttons[index]?.focus();
      });
    },
    onError: (error: any, { row }) => {
      setSavingId(null);
      setRowError({
        id: row.id,
        message: String(
          error?.response?.data?.error ??
            error?.response?.data?.message ??
            error?.message ??
            t('assignments:workload.edit.deleteFailed')
        ),
      });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ row, status, scenarioId }: { row: AssignmentRow; status: 'active' | 'paused'; scenarioId: string }) =>
      api.assignments.update(
        row.id,
        {
          status,
          ...(row.version !== undefined ? { expected_version: row.version } : {}),
        } as never,
        { scenarioId }
      ),
    onMutate: ({ row }) => {
      setSavingId(row.id);
      setRowError(null);
    },
    onSuccess: (_data, { row }) => {
      setSavingId(null);
      setRowError(null);
      void invalidateSchedulingReads(queryClient, String(row.project_id ?? ''));
    },
    onError: (error: any, { row }) => {
      setSavingId(null);
      setRowError({
        id: row.id,
        message: String(
          error?.response?.data?.error ??
            error?.response?.data?.message ??
            error?.message ??
            t('assignments:workload.edit.saveFailed')
        ),
      });
    },
  });

  const toggleStatus = (row: AssignmentRow) => {
    const nextStatus = row.status === 'paused' ? 'active' : 'paused';
    if (row.assignment_type === 'direct') {
      const message = t(
        nextStatus === 'paused'
          ? 'assignments:workload.edit.pauseDirectConfirm'
          : 'assignments:workload.edit.resumeDirectConfirm'
      );
      if (!window.confirm(message)) return;
    }
    statusMutation.mutate({ row, status: nextStatus, scenarioId: activeScenarioId });
  };

  const canHandover = (row: AssignmentRow) =>
    row.assignment_type !== 'direct' &&
    row.status === 'active' &&
    (row.assignment_date_mode ?? 'fixed') === 'fixed' &&
    Boolean(workloadDateOnly(row.start_date) && workloadDateOnly(row.end_date));

  const beginHandover = (row: AssignmentRow) => {
    const start = workloadDateOnly(row.start_date);
    const end = workloadDateOnly(row.end_date);
    let effectiveDate = asOf;
    if (!start || effectiveDate <= start) {
      const date = new Date(`${start ?? asOf}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + 1);
      effectiveDate = date.toISOString().slice(0, 10);
    }
    if (end && effectiveDate > end) effectiveDate = end;
    setHandoverRowId(row.id);
    setHandoverMessage(null);
    setHandoverDraft({
      successorId: peopleQuery.data?.find((candidate) => candidate.id !== id)?.id ?? '',
      effectiveDate,
      allocation: String(Number(row.allocation_percentage ?? 0)),
    });
  };

  const handoverMutation = useMutation({
    mutationFn: async ({
      row,
      draft: next,
      scenarioId,
    }: {
      row: AssignmentRow;
      draft: HandoverDraft;
      scenarioId: string;
    }) => {
      if (!next.successorId) throw new Error(t('assignments:workload.handover.selectSuccessor'));
      if (!next.effectiveDate) throw new Error(t('assignments:workload.handover.invalidDate'));
      const allocation = Number(next.allocation);
      if (!Number.isFinite(allocation) || allocation <= 0 || allocation > 200) {
        throw new Error(t('assignments:workload.edit.invalidAllocation'));
      }
      const response = await api.assignments.handover(
        row.id,
        {
          successor_person_id: next.successorId,
          effective_date: next.effectiveDate,
          allocation_percentage: allocation,
          expected_version: row.version ?? 1,
        },
        { scenarioId }
      );
      return response.data.data;
    },
    onMutate: ({ row }) => setSavingId(row.id),
    onSuccess: (data, { row }) => {
      setSavingId(null);
      setHandoverRowId(null);
      setHandoverMessage({
        tone: data.warning ? 'warning' : 'success',
        text: data.warning
          ? `${t('assignments:workload.handover.success')} ${data.warning}`
          : t('assignments:workload.handover.success'),
      });
      void invalidateSchedulingReads(queryClient, String(row.project_id ?? ''));
    },
    onError: (error: any, { row }) => {
      setSavingId(null);
      setHandoverMessage({
        tone: 'error',
        text: String(
          error?.response?.data?.message ??
            error?.response?.data?.error ??
            error?.message ??
            t('assignments:workload.handover.failed')
        ),
      });
      setRowError({ id: row.id, message: String(error?.message ?? t('assignments:workload.handover.failed')) });
    },
  });

  const allWorkloadRows = (): AssignmentRow[] => [
    ...summary.current,
    ...summary.excluded.map((excludedRow) => excludedRow.assignment),
  ];

  const openExistingAssignment = (projectId: string) => {
    const existing = allWorkloadRows().find((row) => String(row.project_id) === String(projectId));
    if (!existing) return;
    beginEdit(existing);
    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`[data-assignment-id="${existing.id}"]`)
        ?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    });
  };

  const startBatch = () => {
    const drafts: Record<string, string> = {};
    for (const row of allWorkloadRows()) {
      drafts[row.id] = String(Number(row.allocation_percentage ?? 0));
    }
    setBatchDrafts(drafts);
    setBatchMessage(null);
    setBatchMode(true);
    setEditingId(null);
    setEditScenarioId(null);
    setHandoverRowId(null);
    setHandoverMessage(null);
  };

  const batchSaveMutation = useMutation({
    mutationFn: async () => {
      const updates = allWorkloadRows()
        .map((row) => ({ row, value: batchDrafts[row.id] }))
        .filter(({ row, value }) => value !== undefined && value !== String(Number(row.allocation_percentage ?? 0)));
      if (updates.length === 0) return { saved: 0, failed: 0, noChanges: true };

      let saved = 0;
      let failed = 0;
      for (const { row, value } of updates) {
        const allocation = Number(value);
        if (!Number.isFinite(allocation) || allocation <= 0 || allocation > 200) {
          failed += 1;
          continue;
        }
        try {
          await api.assignments.update(
            row.id,
            {
              allocation_percentage: allocation,
              ...(row.version !== undefined ? { expected_version: row.version } : {}),
            } as never,
            { scenarioId: activeScenarioId }
          );
          saved += 1;
        } catch {
          failed += 1;
        }
      }
      return { saved, failed, noChanges: false };
    },
    onSuccess: ({ saved, failed, noChanges }) => {
      setBatchMode(false);
      setBatchDrafts({});
      if (noChanges) {
        setBatchMessage({ tone: 'warning', text: t('assignments:workload.batch.noChanges') });
        return;
      }
      setBatchMessage({
        tone: failed > 0 ? 'warning' : 'success',
        text: failed > 0
          ? t('assignments:workload.batch.partial', { saved, failed })
          : t('assignments:workload.batch.saved', { count: saved }),
      });
      void invalidateSchedulingReads(queryClient);
    },
    onError: (error: any) => {
      setBatchMessage({
        tone: 'error',
        text: String(error?.message ?? t('assignments:workload.batch.failed')),
      });
    },
  });

  const confirmDelete = (row: AssignmentRow) => {
    const message =
      row.assignment_type === 'direct'
        ? t('assignments:workload.edit.deleteDirectConfirm')
        : t('assignments:workload.edit.deleteConfirm');
    if (window.confirm(message)) {
      const allRows = [
        ...summary.current,
        ...summary.excluded.map((excludedRow) => excludedRow.assignment),
      ];
      const focusIndex = allRows.findIndex((candidate) => candidate.id === row.id);
      deleteMutation.mutate({
        row,
        scenarioId: activeScenarioId,
        focusIndex: focusIndex >= 0 ? focusIndex : 0,
      });
    }
  };

  if (!id) return null;

  if (personQuery.isLoading) {
    return (
      <div className="page-container person-workload-page">
        <div className="pw-state" role="status">{t('assignments:workload.states.loading')}</div>
      </div>
    );
  }

  if (personQuery.isError || !personQuery.data) {
    return (
      <div className="page-container person-workload-page">
        <button className="btn btn-ghost pw-back" onClick={() => navigate('/people')}>
          <ArrowLeft size={16} /> {t('assignments:workload.back')}
        </button>
        <div className="pw-empty" role="alert">
          <AlertTriangle size={32} />
          <h1>{t('assignments:workload.states.personNotFound')}</h1>
          <button className="btn btn-primary" onClick={() => navigate('/people')}>
            {t('assignments:workload.back')}
          </button>
        </div>
      </div>
    );
  }

  const person = personQuery.data;
  const scenarioName =
    currentScenario?.name ?? t('assignments:workload.source.scenario');
  const relativeLabel =
    utilizationQuery.isLoading || summary.availability === null || summary.availability === 0
      ? '—'
      : `${summary.relativeUtilization?.toFixed(0)}%`;
  const availabilityLabel =
    utilizationQuery.isLoading || summary.availability === null
      ? '—'
      : `${summary.availability}%`;
  const remainingLabel =
    summary.remainingCapacity === null ? '—' : `${summary.remainingCapacity}%`;

  const renderTable = (rows: Row[], excluded: boolean) => (
    <div className="pw-table-wrap">
      <table className="pw-table">
        <caption className="sr-only">
          {excluded
            ? t('assignments:workload.sections.excludedTitle')
            : t('assignments:workload.sections.currentTitle')}
        </caption>
        <thead>
          <tr>
            <th className="pw-col-project">{t('assignments:workload.columns.project')}</th>
            <th className="pw-col-role">{t('assignments:workload.columns.role')}</th>
            <th className="pw-col-phase">{t('assignments:workload.columns.phase')}</th>
            <th className="pw-col-source">{t('assignments:workload.columns.source')}</th>
            <th className="pw-col-dates">{t('assignments:workload.columns.dates')}</th>
            <th className="pw-num pw-col-allocation">{t('assignments:workload.columns.allocation')}</th>
            <th className="pw-col-status">{t('assignments:workload.columns.status')}</th>
            <th className="pw-actions-col">{t('assignments:workload.columns.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const item = isExcludedRow(row) ? row.assignment : row;
            const reason = isExcludedRow(row) ? row.reason : null;
            const mode = item.assignment_date_mode ?? 'fixed';
            const start = workloadDateOnly(item.computed_start_date ?? item.start_date);
            const end = workloadDateOnly(item.computed_end_date ?? item.end_date);
            const derived = mode === 'phase' || mode === 'project';
            const direct = item.assignment_type === 'direct';
            const unresolved = Boolean(item.date_resolution_error) || !start || !end;
            const allocation = Number(item.allocation_percentage ?? 0);
            const endDisplay =
              start && end && start.slice(0, 4) === end.slice(0, 4) ? end.slice(5) : end;
            const editing = editingId === item.id;
            const saving = savingId === item.id;
            const error = rowError?.id === item.id ? rowError.message : null;

            return (
              <React.Fragment key={item.id}>
                <tr
                  className={excluded ? 'pw-row--excluded' : undefined}
                  data-assignment-id={item.id}
                >
                  <td className="pw-col-project">
                    <div className="pw-project">
                      <BriefcaseBusiness size={15} aria-hidden="true" />
                      <span>{item.project_name || t('common:na')}</span>
                    </div>
                    <span className="pw-project-meta">
                      {item.role_name || t('common:na')} · {item.phase_name || t('common:na')}
                    </span>
                  </td>
                  <td className="pw-col-role">{item.role_name || t('common:na')}</td>
                  <td className="pw-col-phase">{item.phase_name || t('common:na')}</td>
                  <td className="pw-col-source">
                    <Badge variant={direct ? 'secondary' : 'outline'}>
                      {direct
                        ? t('assignments:workload.source.direct')
                        : t('assignments:workload.source.scenario')}
                    </Badge>
                  </td>
                  <td className="pw-col-dates">
                    {editing && mode === 'fixed' ? (
                      <div className="pw-date-inputs">
                        <input
                          type="date"
                          aria-label={t('assignments:workload.edit.startDate')}
                          value={draft.startDate}
                          onChange={(event) => setDraft((prev) => ({ ...prev, startDate: event.target.value }))}
                        />
                        <span aria-hidden="true">→</span>
                        <input
                          type="date"
                          aria-label={t('assignments:workload.edit.endDate')}
                          value={draft.endDate}
                          onChange={(event) => setDraft((prev) => ({ ...prev, endDate: event.target.value }))}
                        />
                      </div>
                    ) : (
                      <>
                        <div className="pw-dates">
                          <span>{start || '—'}</span>
                          <span className="pw-date-separator" aria-hidden="true">→</span>
                          <span>{endDisplay || '—'}</span>
                        </div>
                        {derived ? (
                          <span className="pw-date-mode">
                            {t(`assignments:workload.dateMode.${mode}`)}
                          </span>
                        ) : null}
                        {unresolved ? (
                          <span className="pw-date-warning">
                            <AlertTriangle size={13} aria-hidden="true" />
                            {t('assignments:workload.states.missingDates')}
                          </span>
                        ) : null}
                        {editing && derived ? (
                          <span className="pw-date-mode">
                            {t('assignments:workload.edit.derivedDatesReadonly')}
                          </span>
                        ) : null}
                      </>
                    )}
                  </td>
                  <td className="pw-num pw-col-allocation">
                    {batchMode ? (
                      <input
                        type="number"
                        min={1}
                        max={200}
                        className="pw-allocation-input"
                        aria-label={t('assignments:workload.edit.allocation')}
                        value={batchDrafts[item.id] ?? String(allocation)}
                        onChange={(event) =>
                          setBatchDrafts((prev) => ({ ...prev, [item.id]: event.target.value }))
                        }
                      />
                    ) : editing ? (
                      <input
                        type="number"
                        min={1}
                        max={200}
                        className="pw-allocation-input"
                        aria-label={t('assignments:workload.edit.allocation')}
                        value={draft.allocation}
                        onChange={(event) => setDraft((prev) => ({ ...prev, allocation: event.target.value }))}
                      />
                    ) : (
                      `${allocation}%`
                    )}
                  </td>
                  <td className="pw-col-status">
                    {reason ? (
                      <Badge variant="warning">{t(`assignments:workload.exclusion.${reason}`)}</Badge>
                    ) : (
                      <Badge variant="success">{t('assignments:workload.included')}</Badge>
                    )}
                  </td>
                  <td className="pw-actions-col">
                    {batchMode ? null : editing ? (
                      <div className="pw-row-actions">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          aria-label={t('assignments:workload.actions.save')}
                          disabled={saving || scenarioMismatch}
                          onClick={() => saveMutation.mutate({
                            row: item,
                            draft,
                            scenarioId: editScenarioId ?? activeScenarioId
                          })}
                        >
                          <Save size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          aria-label={t('assignments:workload.actions.cancel')}
                          disabled={saving}
                          onClick={cancelEdit}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="pw-row-actions">
                        {canHandover(item) ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            aria-label={t('assignments:workload.actions.handover')}
                            disabled={saving}
                            onClick={() => beginHandover(item)}
                          >
                            <ArrowRightLeft size={14} />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          aria-label={
                            item.status === 'paused'
                              ? t('assignments:workload.actions.resume')
                              : t('assignments:workload.actions.pause')
                          }
                          disabled={saving}
                          onClick={() => toggleStatus(item)}
                        >
                          {item.status === 'paused' ? <Play size={14} /> : <Pause size={14} />}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          data-testid="pw-edit-row"
                          aria-label={t('assignments:workload.actions.edit')}
                          onClick={() => beginEdit(item)}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm pw-delete-btn"
                          aria-label={t('assignments:workload.actions.delete')}
                          disabled={saving}
                          onClick={() => confirmDelete(item)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
                {editing ? (
                  <tr className="pw-impact-row">
                    <td colSpan={8}>
                      <AssignmentImpactPreview
                        projectId={String(item.project_id)}
                        projectName={item.project_name}
                        windowStart={mode === 'fixed' ? draft.startDate : start}
                        windowEnd={mode === 'fixed' ? draft.endDate : end}
                        asOf={summary.asOf}
                        personAssignments={assignmentsQuery.data ?? []}
                        originalAllocation={allocation}
                        proposedAllocation={Number(draft.allocation) || 0}
                        editingRowId={item.id}
                        availability={summary.availability}
                      />
                    </td>
                  </tr>
                ) : null}
                {error ? (
                  <tr className="pw-row-error">
                    <td colSpan={8} role="alert">{error}</td>
                  </tr>
                ) : null}
                {handoverRowId === item.id ? (
                  <tr className="pw-handover-row">
                    <td colSpan={8}>
                      <form
                        className="pw-handover-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          handoverMutation.mutate({
                            row: item,
                            draft: handoverDraft,
                            scenarioId: activeScenarioId,
                          });
                        }}
                      >
                        <strong>{t('assignments:workload.handover.title')}</strong>
                        <label>
                          {t('assignments:workload.handover.successor')}
                          <select
                            aria-label={t('assignments:workload.handover.successor')}
                            value={handoverDraft.successorId}
                            onChange={(event) =>
                              setHandoverDraft((prev) => ({ ...prev, successorId: event.target.value }))
                            }
                          >
                            <option value="">{t('assignments:workload.handover.selectSuccessor')}</option>
                            {(peopleQuery.data ?? [])
                              .filter((candidate) => candidate.id !== id)
                              .map((candidate) => (
                                <option key={candidate.id} value={candidate.id}>
                                  {candidate.name}
                                </option>
                              ))}
                          </select>
                        </label>
                        <label>
                          {t('assignments:workload.handover.effectiveDate')}
                          <input
                            type="date"
                            aria-label={t('assignments:workload.handover.effectiveDate')}
                            value={handoverDraft.effectiveDate}
                            onChange={(event) =>
                              setHandoverDraft((prev) => ({ ...prev, effectiveDate: event.target.value }))
                            }
                            required
                          />
                        </label>
                        <label>
                          {t('assignments:workload.edit.allocation')}
                          <input
                            type="number"
                            min={1}
                            max={200}
                            aria-label={t('assignments:workload.edit.allocation')}
                            value={handoverDraft.allocation}
                            onChange={(event) =>
                              setHandoverDraft((prev) => ({ ...prev, allocation: event.target.value }))
                            }
                            required
                          />
                        </label>
                        <div className="pw-handover-actions">
                          <button
                            type="submit"
                            className="btn btn-primary btn-sm"
                            disabled={saving}
                          >
                            {t('assignments:workload.handover.confirm')}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setHandoverRowId(null);
                              setHandoverMessage(null);
                            }}
                          >
                            {t('assignments:workload.actions.cancel')}
                          </button>
                        </div>
                      </form>
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="page-container person-workload-page">
      <button className="btn btn-ghost pw-back" onClick={() => navigate(`/people/${person.id}`)}>
        <ArrowLeft size={16} /> {t('assignments:workload.back')}
      </button>

      <header className="pw-header">
        <div>
          <h1>{t('assignments:workload.title')}</h1>
          <p className="pw-subtitle">
            {t('assignments:workload.subtitle', {
              name: person.name,
              scenario: scenarioName,
            })}
          </p>
        </div>
        <div className="pw-asof">{t('assignments:workload.asOf', { date: summary.asOf })}</div>
      </header>

      {utilizationQuery.isError ? (
        <div className="pw-alert" role="alert">
          <span>{t('assignments:workload.states.utilizationError')}</span>
          <button className="btn btn-secondary" onClick={() => utilizationQuery.refetch()}>
            <RefreshCw size={14} /> {t('assignments:workload.states.retry')}
          </button>
        </div>
      ) : null}

      <section className="pw-capacity" aria-label={t('assignments:workload.metrics.current')}>
        <div className="pw-capacity-head">
          <Badge variant={statusVariant[summary.status]}>
            {t(`assignments:workload.status.${summary.status}`)}
          </Badge>
          <span className="pw-scenario">{t('assignments:workload.scenarioLabel', { name: scenarioName })}</span>
        </div>
        <div className="pw-metrics">
          <div className="pw-metric">
            <span>{t('assignments:workload.metrics.current')}</span>
            <strong data-testid="pw-total">{summary.totalAllocation}%</strong>
          </div>
          <div className="pw-metric">
            <span>{t('assignments:workload.metrics.availability')}</span>
            <strong data-testid="pw-availability">{availabilityLabel}</strong>
          </div>
          <div className="pw-metric">
            <span>{t('assignments:workload.metrics.relative')}</span>
            <strong data-testid="pw-relative">{relativeLabel}</strong>
          </div>
          <div className="pw-metric">
            <span>{t('assignments:workload.metrics.remaining')}</span>
            <strong
              data-testid="pw-remaining"
              className={summary.remainingCapacity !== null && summary.remainingCapacity < 0 ? 'pw-negative' : undefined}
            >
              {remainingLabel}
            </strong>
          </div>
          <div className="pw-metric pw-metric--muted">
            <span>{t('assignments:workload.metrics.excluded')}</span>
            <strong data-testid="pw-excluded">{summary.excluded.length} · {summary.excludedAllocation}%</strong>
          </div>
        </div>
        <p className="pw-help">{t('assignments:workload.metricHelp.current')}</p>
        {utilizationQuery.isLoading ? (
          <p className="pw-help" role="status">
            {t('assignments:workload.states.utilizationLoading')}
          </p>
        ) : null}
        {summary.excluded.length > 0 ? (
          <p className="pw-help">
            {t('assignments:workload.metricHelp.excluded', {
              count: summary.excluded.length,
              allocation: summary.excludedAllocation,
            })}
          </p>
        ) : null}
        {summary.status === 'over' ? (
          <p className="pw-warning" role="status">
            <AlertTriangle size={16} aria-hidden="true" /> {t('assignments:workload.warning.over')}
          </p>
        ) : null}
        {summary.status === 'unavailable' ? (
          <p className="pw-warning" role="status">
            <AlertTriangle size={16} aria-hidden="true" /> {t('assignments:workload.warning.unavailable')}
          </p>
        ) : null}
        {!utilizationQuery.isLoading && !utilizationQuery.isError && !utilizationRow ? (
          <p className="pw-help">{t('assignments:workload.states.noUtilization')}</p>
        ) : null}
      </section>

      <div className="pw-layout">
        <PersonTaskPicker
          personId={person.id}
          roles={person.roles ?? []}
          asOf={summary.asOf}
          availability={summary.availability}
          assignments={assignmentsQuery.data ?? []}
          onOpenExisting={openExistingAssignment}
        />
        <main className="pw-main">
      {scenarioMismatch ? (
        <div className="pw-scenario-banner" role="alert">
          <div>
            <strong>{t('assignments:workload.scenarioMismatch.title')}</strong>
            <p>{t('assignments:workload.scenarioMismatch.body')}</p>
          </div>
          <div className="pw-scenario-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={cancelEdit}>
              {t('assignments:workload.scenarioMismatch.discard')}
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                const original = scenarios.find((scenario) => scenario.id === editScenarioId);
                if (original) setCurrentScenario(original);
              }}
            >
              {t('assignments:workload.scenarioMismatch.back')}
            </button>
          </div>
        </div>
      ) : null}
      {handoverMessage ? (
        <div
          className={`pw-handover-flash pw-handover-flash--${handoverMessage.tone}`}
          role={handoverMessage.tone === 'error' ? 'alert' : 'status'}
        >
          {handoverMessage.text}
        </div>
      ) : null}
      <div className="pw-batch-bar">
        {batchMode ? (
          <>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={batchSaveMutation.isPending}
              onClick={() => batchSaveMutation.mutate()}
            >
              {t('assignments:workload.batch.save')}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={batchSaveMutation.isPending}
              onClick={() => {
                setBatchMode(false);
                setBatchDrafts({});
                setBatchMessage(null);
              }}
            >
              {t('assignments:workload.batch.cancel')}
            </button>
            <span className="pw-batch-hint">{t('assignments:workload.batch.hint')}</span>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={Boolean(editingId || handoverRowId)}
            onClick={startBatch}
          >
            {t('assignments:workload.batch.edit')}
          </button>
        )}
        {batchMessage ? (
          <span className={`pw-batch-message pw-batch-message--${batchMessage.tone}`} role="status">
            {batchMessage.text}
          </span>
        ) : null}
      </div>
      {assignmentsQuery.isError ? (
        <div className="pw-alert" role="alert">
          <span>{t('assignments:workload.states.assignmentsError')}</span>
          <button className="btn btn-secondary" onClick={() => assignmentsQuery.refetch()}>
            <RefreshCw size={14} /> {t('assignments:workload.states.retry')}
          </button>
        </div>
      ) : null}

      <section className="pw-section" aria-labelledby="pw-current-title">
        <div className="pw-section-head">
          <div>
            <h2 id="pw-current-title">{t('assignments:workload.sections.currentTitle')}</h2>
            <p>{t('assignments:workload.sections.currentDescription')}</p>
          </div>
          <span className="pw-section-total">{summary.totalAllocation}%</span>
        </div>
        {summary.current.length === 0 ? (
          <div className="pw-empty-row">{t('assignments:workload.states.emptyCurrent')}</div>
        ) : (
          renderTable(summary.current, false)
        )}
      </section>

      <section className="pw-section" aria-labelledby="pw-excluded-title">
        <div className="pw-section-head">
          <div>
            <h2 id="pw-excluded-title">{t('assignments:workload.sections.excludedTitle')}</h2>
            <p>{t('assignments:workload.sections.excludedDescription')}</p>
          </div>
          <span className="pw-section-total pw-section-total--muted">
            {summary.excluded.length} · {summary.excludedAllocation}%
          </span>
        </div>
        {summary.excluded.length === 0 ? (
          <div className="pw-empty-row">{t('assignments:workload.states.emptyExcluded')}</div>
        ) : (
          renderTable(summary.excluded, true)
        )}
      </section>

      <p className="pw-note">{t('assignments:workload.note')}</p>
        </main>
      </div>
    </div>
  );
}
