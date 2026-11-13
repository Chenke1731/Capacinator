import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ChevronDown, Plus, Search } from 'lucide-react';
import { api } from '../../lib/api-client';
import { invalidateSchedulingReads } from '../../lib/invalidateSchedulingReads';
import { queryKeys } from '../../lib/queryKeys';
import { useScenario } from '../../contexts/ScenarioContext';

interface PersonRoleOption {
  role_id?: string;
  role_name?: string;
  is_primary?: number;
}

interface PersonTaskPickerProps {
  personId: string;
  roles: PersonRoleOption[];
}

interface TaskRow {
  id: string;
  name: string;
  parent_id?: string | null;
  child_count?: number | string | null;
  project_sub_type_name?: string | null;
  lifecycle_state?: string | null;
  include_in_demand?: number | boolean | null;
  start_date?: string | null;
  end_date?: string | null;
  aspiration_start?: string | null;
  aspiration_finish?: string | null;
  is_ancestor?: boolean;
}

interface TaskPage {
  data: TaskRow[];
  pagination: { total: number; has_more?: boolean };
}

interface PhaseOption {
  id: string;
  name: string;
  start_date?: string | null;
  end_date?: string | null;
}

const TERMINAL_STATES = new Set(['delivered', 'cancelled']);

function isTaskDisabled(row: TaskRow) {
  return (
    TERMINAL_STATES.has(String(row.lifecycle_state ?? '')) ||
    (row.project_sub_type_name === 'SR' && Number(row.child_count ?? 0) > 0)
  );
}

function buildTaskOrder(rows: TaskRow[]): Array<{ row: TaskRow; depth: number }> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const children = new Map<string | null, TaskRow[]>();
  for (const row of rows) {
    const parent = row.parent_id && byId.has(row.parent_id) ? row.parent_id : null;
    const list = children.get(parent) ?? [];
    list.push(row);
    children.set(parent, list);
  }
  for (const list of children.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  const ordered: Array<{ row: TaskRow; depth: number }> = [];
  const visited = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const row of children.get(parent) ?? []) {
      if (visited.has(row.id)) continue;
      visited.add(row.id);
      ordered.push({ row, depth });
      walk(row.id, depth + 1);
    }
  };
  walk(null, 0);
  for (const row of rows) {
    if (!visited.has(row.id)) ordered.push({ row, depth: 0 });
  }
  return ordered;
}

export function PersonTaskPicker({ personId, roles }: PersonTaskPickerProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { currentScenario, scenarios, setCurrentScenario } = useScenario();
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [scope, setScope] = useState<'demand' | 'all'>('demand');
  const [limit, setLimit] = useState(50);
  const [selected, setSelected] = useState<TaskRow | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [draftScenarioId, setDraftScenarioId] = useState<string | null>(null);
  const [roleId, setRoleId] = useState('');
  const [allocation, setAllocation] = useState('20');
  const [dateMode, setDateMode] = useState<'fixed' | 'phase' | 'project'>('fixed');
  const [phaseId, setPhaseId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [message, setMessage] = useState<{ tone: 'error' | 'warning' | 'success'; text: string } | null>(null);
  const activeScenarioId = currentScenario?.id ?? '';
  const scenarioMismatch = Boolean(selected && draftScenarioId && draftScenarioId !== activeScenarioId);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchTerm(searchInput.trim());
      setLimit(50);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const tasksQuery = useQuery<TaskPage>({
    queryKey: queryKeys.projects.list(
      { search: searchTerm, limit, scope, slim: '1', include_ancestors: '1', include_in_demand: searchTerm || scope === 'all' ? undefined : '1' },
      currentScenario?.id
    ),
    queryFn: async () => {
      const params: Record<string, unknown> = {
        limit,
        slim: '1',
        include_ancestors: '1',
      };
      if (searchTerm) params.search = searchTerm;
      else if (scope === 'demand') params.include_in_demand = '1';
      const response = await api.projects.list(params as never);
      return response.data as unknown as TaskPage;
    },
    staleTime: 30_000,
  });

  const rows = tasksQuery.data?.data ?? [];
  const ordered = useMemo(() => buildTaskOrder(rows), [rows]);

  useEffect(() => {
    const enabled = ordered.filter(({ row }) => !isTaskDisabled(row));
    if (activeTaskId && enabled.some(({ row }) => row.id === activeTaskId)) return;
    setActiveTaskId(enabled[0]?.row.id ?? null);
  }, [ordered, activeTaskId]);

  const selectedRole = roles.find((role) => role.role_id === roleId);

  const phasesQuery = useQuery<PhaseOption[]>({
    queryKey: queryKeys.projects.phases(selected?.id ?? ''),
    queryFn: async () => {
      const response = await api.projectPhases.list({ project_id: selected!.id, limit: 200 });
      const payload = response.data as unknown as { data?: Array<Record<string, any>> };
      return (payload.data ?? []).map((row) => ({
        id: String(row.phase_id ?? row.id),
        name: String(row.phase_name ?? row.name ?? row.phase_id ?? ''),
        start_date: row.start_date ?? null,
        end_date: row.end_date ?? null,
      }));
    },
    enabled: Boolean(selected && dateMode === 'phase'),
  });
  const phaseOptions = phasesQuery.data ?? [];
  const effectivePhaseId = phaseId || phaseOptions[0]?.id || '';
  const selectedPhase = phaseOptions.find((phase) => phase.id === effectivePhaseId);
  const derivedStart =
    dateMode === 'phase'
      ? selectedPhase?.start_date
      : dateMode === 'project'
        ? selected?.start_date ?? selected?.aspiration_start
        : null;
  const derivedEnd =
    dateMode === 'phase'
      ? selectedPhase?.end_date
      : dateMode === 'project'
        ? selected?.end_date ?? selected?.aspiration_finish
        : null;

  const resetForm = (row: TaskRow) => {
    const primary = roles.find((role) => role.is_primary) ?? roles[0];
    setRoleId(primary?.role_id ?? '');
    setAllocation('20');
    setDateMode('fixed');
    setPhaseId('');
    setStartDate((row.start_date ?? row.aspiration_start ?? '').slice(0, 10));
    setEndDate((row.end_date ?? row.aspiration_finish ?? '').slice(0, 10));
    setMessage(null);
  };

  const selectTask = (row: TaskRow) => {
    setSelected(row);
    setDraftScenarioId(activeScenarioId || null);
    resetForm(row);
  };

  const discardDraft = () => {
    setSelected(null);
    setDraftScenarioId(null);
    setMessage(null);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error(t('assignments:workload.picker.selectTask'));
      if (!roleId) throw new Error(t('assignments:workload.picker.selectRole'));
      const allocationNumber = Number(allocation);
      if (!Number.isFinite(allocationNumber) || allocationNumber <= 0 || allocationNumber > 200) {
        throw new Error(t('assignments:workload.edit.invalidAllocation'));
      }

      const payload: Record<string, unknown> = {
        project_id: selected.id,
        person_id: personId,
        role_id: roleId,
        allocation_percentage: allocationNumber,
        assignment_date_mode: dateMode,
      };
      if (dateMode === 'fixed') {
        if (!startDate || !endDate) throw new Error(t('assignments:workload.edit.invalidDates'));
        if (startDate > endDate) throw new Error(t('assignments:workload.edit.invalidDateOrder'));
        payload.start_date = startDate;
        payload.end_date = endDate;
      } else if (dateMode === 'phase') {
        if (!effectivePhaseId) throw new Error(t('assignments:workload.picker.noPhases'));
        payload.phase_id = effectivePhaseId;
      }

      const response = await api.assignments.create(payload as never, {
        scenarioId: draftScenarioId ?? activeScenarioId,
      });
      return response.data as unknown as { warning?: string };
    },
    onSuccess: (created) => {
      setMessage({
        tone: created?.warning ? 'warning' : 'success',
        text: created?.warning
          ? `${t('assignments:workload.picker.created')} ${created.warning}`
          : t('assignments:workload.picker.created'),
      });
      setSelected(null);
      setDraftScenarioId(null);
      void invalidateSchedulingReads(queryClient);
    },
    onError: (error: any) => {
      const status = error?.response?.status;
      const code = error?.response?.data?.code;
      if (status === 409 && code === 'ASSIGNMENT_DUPLICATE') {
        setMessage({ tone: 'error', text: t('assignments:workload.picker.duplicate') });
        return;
      }
      setMessage({
        tone: 'error',
        text: String(
          error?.response?.data?.message ??
            error?.response?.data?.error ??
            error?.message ??
            t('assignments:workload.picker.createFailed')
        ),
      });
    },
  });

  const isDisabled = isTaskDisabled;
  const disabledReason = (row: TaskRow) => {
    if (TERMINAL_STATES.has(String(row.lifecycle_state ?? ''))) {
      return t('assignments:workload.picker.terminal');
    }
    if (row.project_sub_type_name === 'SR' && Number(row.child_count ?? 0) > 0) {
      return t('assignments:workload.picker.srParent');
    }
    return '';
  };

  const handleTaskKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, row: TaskRow) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!isDisabled(row)) selectTask(row);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tree = event.currentTarget.closest('[role="tree"]');
    const items = Array.from(
      tree?.querySelectorAll<HTMLElement>('[role="treeitem"]:not([aria-disabled="true"])') ?? []
    );
    const index = items.indexOf(event.currentTarget);
    if (index < 0) return;
    const nextIndex =
      event.key === 'ArrowDown'
        ? Math.min(items.length - 1, index + 1)
        : event.key === 'ArrowUp'
          ? Math.max(0, index - 1)
          : event.key === 'Home'
            ? 0
            : items.length - 1;
    items[nextIndex]?.focus();
  };

  const total = tasksQuery.data?.pagination.total ?? rows.length;
  const matchedShown = rows.filter((row) => !row.is_ancestor).length;
  const hasMore = Boolean(tasksQuery.data?.pagination.has_more);

  return (
    <aside className="pw-picker" aria-label={t('assignments:workload.picker.title')}>
      <div className="pw-picker-head">
        <div>
          <h2>{t('assignments:workload.picker.title')}</h2>
          <p>{t('assignments:workload.picker.subtitle')}</p>
        </div>
        <span className="pw-picker-count">{t('assignments:workload.picker.count', { shown: matchedShown, total })}</span>
      </div>

      <label className="pw-search">
        <Search size={15} aria-hidden="true" />
        <input
          type="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder={t('assignments:workload.picker.searchPlaceholder')}
          aria-label={t('assignments:workload.picker.searchPlaceholder')}
        />
      </label>

      <label className="pw-scope">
        {t('assignments:workload.picker.scopeLabel')}
        <select
          aria-label={t('assignments:workload.picker.scopeLabel')}
          value={scope}
          onChange={(event) => {
            setScope(event.target.value as 'demand' | 'all');
            setLimit(50);
          }}
        >
          <option value="demand">{t('assignments:workload.picker.scopeDemand')}</option>
          <option value="all">{t('assignments:workload.picker.scopeAll')}</option>
        </select>
      </label>

      {tasksQuery.isLoading ? (
        <div className="pw-picker-state" role="status">{t('assignments:workload.picker.loading')}</div>
      ) : tasksQuery.isError ? (
        <div className="pw-picker-state pw-picker-state--error" role="alert">
          {t('assignments:workload.picker.loadFailed')}
        </div>
      ) : ordered.length === 0 ? (
        <div className="pw-picker-state">{searchTerm ? t('assignments:workload.picker.noMatches') : t('assignments:workload.picker.noTasks')}</div>
      ) : (
        <div className="pw-task-list" role="tree" aria-label={t('assignments:workload.picker.title')}>
          {ordered.map(({ row, depth }) => {
            const disabled = isDisabled(row);
            const reason = disabledReason(row);
            const isSelected = selected?.id === row.id;
            return (
              <button
                key={row.id}
                type="button"
                role="treeitem"
                aria-level={depth + 1}
                aria-selected={isSelected}
                aria-disabled={disabled}
                aria-expanded={Number(row.child_count ?? 0) > 0 ? true : undefined}
                tabIndex={activeTaskId === row.id ? 0 : -1}
                title={reason || row.name}
                className={[
                  'pw-task',
                  row.is_ancestor ? 'pw-task--ancestor' : '',
                  disabled ? 'pw-task--disabled' : '',
                  isSelected ? 'pw-task--selected' : '',
                ].filter(Boolean).join(' ')}
                style={{ paddingLeft: `${0.55 + depth * 0.9}rem` }}
                onFocus={() => setActiveTaskId(row.id)}
                onKeyDown={(event) => handleTaskKeyDown(event, row)}
                onClick={() => {
                  if (!disabled) selectTask(row);
                }}
              >
                <span className="pw-task-name">{row.name}</span>
                <span className="pw-task-meta">
                  {row.project_sub_type_name ?? '—'}
                  {reason ? ` · ${reason}` : ''}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {hasMore ? (
        <button type="button" className="btn btn-outline btn-sm pw-load-more" onClick={() => setLimit((value) => value + 50)}>
          <ChevronDown size={14} /> {t('assignments:workload.picker.loadMore')}
        </button>
      ) : null}

      {selected ? (
        <form
          className="pw-add-form"
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate();
          }}
        >
          <div className="pw-add-title">
            <strong>{selected.name}</strong>
            <button type="button" className="btn btn-ghost btn-sm" onClick={discardDraft} aria-label={t('assignments:workload.actions.cancel')}>
              ×
            </button>
          </div>
          <p className="pw-add-note">{t('assignments:workload.picker.dateModeHint')}</p>
          {scenarioMismatch ? (
            <div className="pw-scenario-banner" role="alert">
              <div>
                <strong>{t('assignments:workload.scenarioMismatch.title')}</strong>
                <p>{t('assignments:workload.scenarioMismatch.body')}</p>
              </div>
              <div className="pw-scenario-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={discardDraft}>
                  {t('assignments:workload.scenarioMismatch.discard')}
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    const original = scenarios.find((scenario) => scenario.id === draftScenarioId);
                    if (original) setCurrentScenario(original);
                  }}
                >
                  {t('assignments:workload.scenarioMismatch.back')}
                </button>
              </div>
            </div>
          ) : null}

          <label>
            {t('assignments:workload.picker.role')}
            <select value={roleId} onChange={(event) => setRoleId(event.target.value)} required>
              <option value="">{t('assignments:workload.picker.selectRole')}</option>
              {roles.map((role) => (
                <option key={role.role_id} value={role.role_id}>
                  {role.role_name}
                </option>
              ))}
            </select>
          </label>
          {selectedRole ? null : <p className="pw-add-error">{t('assignments:workload.picker.noRoles')}</p>}

          <label>
            {t('assignments:workload.edit.allocation')}
            <input
              type="number"
              min={1}
              max={200}
              value={allocation}
              onChange={(event) => setAllocation(event.target.value)}
              required
            />
          </label>
          <label>
            {t('assignments:workload.picker.dateMode')}
            <select
              value={dateMode}
              onChange={(event) => {
                setDateMode(event.target.value as 'fixed' | 'phase' | 'project');
                setMessage(null);
              }}
            >
              <option value="fixed">{t('assignments:dateModeOptions.fixed')}</option>
              <option value="phase">{t('assignments:dateModeOptions.phase')}</option>
              <option value="project">{t('assignments:dateModeOptions.project')}</option>
            </select>
          </label>

          {dateMode === 'fixed' ? (
            <div className="pw-add-dates">
              <label>
                {t('assignments:workload.edit.startDate')}
                <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required />
              </label>
              <label>
                {t('assignments:workload.edit.endDate')}
                <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} required />
              </label>
            </div>
          ) : dateMode === 'phase' ? (
            <>
              <label>
                {t('assignments:workload.columns.phase')}
                <select
                  value={effectivePhaseId}
                  onChange={(event) => setPhaseId(event.target.value)}
                  disabled={phasesQuery.isLoading || phaseOptions.length === 0}
                >
                  <option value="">{t('assignments:workload.picker.selectPhase')}</option>
                  {phaseOptions.map((phase) => (
                    <option key={phase.id} value={phase.id}>
                      {phase.name}
                    </option>
                  ))}
                </select>
              </label>
              {phasesQuery.isLoading ? (
                <p className="pw-add-note">{t('assignments:workload.picker.loadingPhases')}</p>
              ) : phasesQuery.isError || phaseOptions.length === 0 ? (
                <p className="pw-add-error">{t('assignments:workload.picker.noPhases')}</p>
              ) : (
                <div className="pw-derived-dates" data-testid="pw-derived-dates">
                  <span>{t('assignments:workload.picker.derivedDates')}</span>
                  <strong>{String(derivedStart ?? '—').slice(0, 10)} → {String(derivedEnd ?? '—').slice(0, 10)}</strong>
                </div>
              )}
            </>
          ) : (
            <div className="pw-derived-dates" data-testid="pw-derived-dates">
              <span>{t('assignments:workload.picker.derivedDates')}</span>
              <strong>{String(derivedStart ?? '—').slice(0, 10)} → {String(derivedEnd ?? '—').slice(0, 10)}</strong>
              {!derivedStart || !derivedEnd ? (
                <p className="pw-add-error">{t('assignments:workload.picker.projectNoDates')}</p>
              ) : null}
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-sm" disabled={createMutation.isPending || roles.length === 0 || scenarioMismatch}>
            <Plus size={14} /> {createMutation.isPending ? t('assignments:workload.picker.adding') : t('assignments:workload.picker.add')}
          </button>
          {message ? (
            <p className={`pw-add-message pw-add-message--${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>
              {message.tone === 'error' ? <AlertTriangle size={14} aria-hidden="true" /> : null}
              {message.text}
            </p>
          ) : null}
        </form>
      ) : null}
    </aside>
  );
}
