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

const TERMINAL_STATES = new Set(['delivered', 'cancelled']);

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
  const { currentScenario } = useScenario();
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [limit, setLimit] = useState(50);
  const [selected, setSelected] = useState<TaskRow | null>(null);
  const [roleId, setRoleId] = useState('');
  const [allocation, setAllocation] = useState('20');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [message, setMessage] = useState<{ tone: 'error' | 'warning' | 'success'; text: string } | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchTerm(searchInput.trim());
      setLimit(50);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const tasksQuery = useQuery<TaskPage>({
    queryKey: queryKeys.projects.list(
      { search: searchTerm, limit, slim: '1', include_ancestors: '1', include_in_demand: searchTerm ? undefined : '1' },
      currentScenario?.id
    ),
    queryFn: async () => {
      const params: Record<string, unknown> = {
        limit,
        slim: '1',
        include_ancestors: '1',
      };
      if (searchTerm) params.search = searchTerm;
      else params.include_in_demand = '1';
      const response = await api.projects.list(params as never);
      return response.data as unknown as TaskPage;
    },
    staleTime: 30_000,
  });

  const rows = tasksQuery.data?.data ?? [];
  const ordered = useMemo(() => buildTaskOrder(rows), [rows]);
  const selectedRole = roles.find((role) => role.role_id === roleId);

  const resetForm = (row: TaskRow) => {
    const primary = roles.find((role) => role.is_primary) ?? roles[0];
    setRoleId(primary?.role_id ?? '');
    setAllocation('20');
    setStartDate((row.start_date ?? row.aspiration_start ?? '').slice(0, 10));
    setEndDate((row.end_date ?? row.aspiration_finish ?? '').slice(0, 10));
    setMessage(null);
  };

  const selectTask = (row: TaskRow) => {
    setSelected(row);
    resetForm(row);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error(t('assignments:workload.picker.selectTask'));
      if (!roleId) throw new Error(t('assignments:workload.picker.selectRole'));
      const allocationNumber = Number(allocation);
      if (!Number.isFinite(allocationNumber) || allocationNumber <= 0 || allocationNumber > 200) {
        throw new Error(t('assignments:workload.edit.invalidAllocation'));
      }
      if (!startDate || !endDate) throw new Error(t('assignments:workload.edit.invalidDates'));
      if (startDate > endDate) throw new Error(t('assignments:workload.edit.invalidDateOrder'));

      const response = await api.assignments.create({
        project_id: selected.id,
        person_id: personId,
        role_id: roleId,
        allocation_percentage: allocationNumber,
        assignment_date_mode: 'fixed',
        start_date: startDate,
        end_date: endDate,
      } as never);
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

  const isDisabled = (row: TaskRow) => {
    if (TERMINAL_STATES.has(String(row.lifecycle_state ?? ''))) return true;
    return row.project_sub_type_name === 'SR' && Number(row.child_count ?? 0) > 0;
  };
  const disabledReason = (row: TaskRow) => {
    if (TERMINAL_STATES.has(String(row.lifecycle_state ?? ''))) {
      return t('assignments:workload.picker.terminal');
    }
    if (row.project_sub_type_name === 'SR' && Number(row.child_count ?? 0) > 0) {
      return t('assignments:workload.picker.srParent');
    }
    return '';
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
                title={reason || row.name}
                className={[
                  'pw-task',
                  row.is_ancestor ? 'pw-task--ancestor' : '',
                  disabled ? 'pw-task--disabled' : '',
                  isSelected ? 'pw-task--selected' : '',
                ].filter(Boolean).join(' ')}
                style={{ paddingLeft: `${0.55 + depth * 0.9}rem` }}
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
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(null)} aria-label={t('assignments:workload.actions.cancel')}>
              ×
            </button>
          </div>
          <p className="pw-add-note">{t('assignments:workload.picker.fixedOnly')}</p>

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

          <button type="submit" className="btn btn-primary btn-sm" disabled={createMutation.isPending || roles.length === 0}>
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
