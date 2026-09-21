import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Plus, Diamond, AlertTriangle, Pause } from 'lucide-react';
import { api, apiClient } from '../../lib/api-client';
import { queryKeys } from '../../lib/queryKeys';

// Minimal axios accessors (avoid widening api-client typings for these two calls)
async function apiClientGet(url: string): Promise<unknown> {
  const response = await apiClient.get(url);
  return (response.data as any)?.data ?? response.data;
}
async function apiClientPost(url: string, body: unknown): Promise<unknown> {
  const response = await apiClient.post(url, body);
  return response.data;
}

/**
 * StaffingSection — 团队分配区: 单表混合 + 两侧汇总 (2026-09-21 契约).
 *
 * 实名行与 ◇ 池行同表同权 (池占位与实名同样参与产能计算, 服务端已保证);
 * 条上给出两侧合计 "设计侧 实名x+池y │ 开发侧 实名x+池y"。
 * 交互零弹窗: 实名化 = 池行下方就地展开候选人勾选列表 (带当前负载%),
 * 新增池占位 / 新增实名 也是就地展开表单。
 */

const DESIGN_ROLE = 'SE';

interface StaffingAssignment {
  id: string;
  person_id: string;
  person_name: string;
  role_id: string;
  role_name: string;
  allocation_percentage: number;
  computed_start_date?: string | null;
  computed_end_date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
}

interface StaffingPool {
  id: string;
  role_id: string;
  role_name: string;
  headcount: number;
  start_date: string | null;
  end_date: string | null;
  status: string;
  notes?: string | null;
}

function sideOfRole(roleName: string | null | undefined): 'design' | 'dev' {
  return roleName === DESIGN_ROLE ? 'design' : 'dev';
}

function fmtDate(d: string | null | undefined): string {
  return d ? d.slice(0, 10) : '—';
}

/** Inline candidate picker with current load — the naming (实名化) flow. */
function NamingPanel({
  project,
  initialRoleId,
  initialDates,
  requiredCount,
  onFinished,
  onCancel
}: {
  project: any;
  initialRoleId?: string;
  initialDates?: { start: string; end: string };
  requiredCount?: number;
  onFinished: (createdCount: number) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [roleId, setRoleId] = useState(initialRoleId ?? '');
  const [start, setStart] = useState(initialDates?.start ?? (project.aspiration_start || '').slice(0, 10));
  const [end, setEnd] = useState(initialDates?.end ?? (project.aspiration_finish || '').slice(0, 10));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const { data: roles } = useQuery({
    queryKey: queryKeys.roles.list(),
    queryFn: async () => {
      const response = await api.roles.list();
      const payload = response.data as any;
      return Array.isArray(payload) ? payload : payload?.data || [];
    }
  });

  // Dedicated key — never share the raw ['people'] key (cache shape poisoning)
  const { data: utilizationRows } = useQuery({
    queryKey: ['people-utilization'],
    queryFn: async () => {
      const response = await apiClientGet('/people/utilization');
      return response as any[];
    }
  });

  const candidates = useMemo(() => {
    const rows = (utilizationRows ?? []) as any[];
    const sorted = [...rows].sort((a, b) => {
      // Matching role first, then by load ascending
      const aMatch = roleId && a.primary_role_id === roleId ? 0 : 1;
      const bMatch = roleId && b.primary_role_id === roleId ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return (a.total_allocation_percentage ?? 0) - (b.total_allocation_percentage ?? 0);
    });
    return sorted.filter((r) => r.person_name);
  }, [utilizationRows, roleId]);

  const createMutation = useMutation({
    mutationFn: async (personIds: string[]) => {
      for (const personId of personIds) {
        await apiClientPost('/assignments', {
          project_id: project.id,
          person_id: personId,
          role_id: roleId,
          allocation_percentage: 100,
          assignment_date_mode: 'fixed',
          start_date: start || null,
          end_date: end || null
        });
      }
    },
    onSuccess: (_data: unknown, personIds: string[]) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(project.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.people.all });
      queryClient.invalidateQueries({ queryKey: ['people-utilization'] });
      onFinished(personIds.length);
    },
    onError: (err: any) =>
      setError(err?.response?.data?.error || err?.message || t('projects:staffing.nameFailed'))
  });

  const target = requiredCount ?? picked.size;
  const ready = roleId && picked.size > 0 && (!requiredCount || picked.size === requiredCount) && start && end;

  return (
    <div className="staffing-naming">
      <div className="staffing-naming-title">
        {requiredCount
          ? t('projects:staffing.nameTitleCount', { count: requiredCount })
          : t('projects:staffing.nameTitle')}
      </div>
      <div className="staffing-naming-form">
        <label>
          {t('projects:staffing.role')}
          <select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            <option value="">{t('projects:staffing.selectRole')}</option>
            {(roles as any[] | undefined)?.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </label>
        <label>
          {t('common:startDate')}
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label>
          {t('common:endDate')}
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <span className="staffing-naming-progress">
          {t('projects:staffing.picked', { picked: picked.size, target })}
        </span>
      </div>
      <div className="staffing-candidates">
        {candidates.map((c) => {
          const load = Math.round(c.total_allocation_percentage ?? 0);
          const over = load >= 100;
          const checked = picked.has(c.person_id);
          return (
            <label
              key={c.person_id}
              className={`staffing-candidate ${checked ? 'staffing-candidate--picked' : ''} ${over ? 'staffing-candidate--over' : ''}`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => {
                  setPicked((prev) => {
                    const next = new Set(prev);
                    if (next.has(c.person_id)) next.delete(c.person_id);
                    else next.add(c.person_id);
                    return next;
                  });
                }}
              />
              <span className="staffing-candidate-name">{c.person_name}</span>
              <span className="staffing-candidate-role">{c.primary_role_name}</span>
              <span className={`staffing-candidate-load ${over ? 'staffing-candidate-load--over' : ''}`}>
                {over && <AlertTriangle size={11} className="inline mr-0.5" />}
                {t('projects:staffing.load', { load })}
              </span>
            </label>
          );
        })}
        {candidates.length === 0 && (
          <div className="staffing-candidates-empty">{t('projects:staffing.noCandidates')}</div>
        )}
      </div>
      {error && <div className="staffing-error">{error}</div>}
      <div className="staffing-naming-actions">
        <button
          className="lifecycle-btn lifecycle-btn-primary"
          disabled={!ready || createMutation.isPending}
          onClick={() => createMutation.mutate([...picked])}
        >
          {t('projects:staffing.confirmNaming', { count: picked.size })}
        </button>
        <button className="lifecycle-btn" onClick={onCancel}>
          {t('common:cancel')}
        </button>
      </div>
    </div>
  );
}

/** Inline pool create/edit form */
function PoolForm({
  projectId,
  initial,
  onSaved,
  onCancel
}: {
  projectId: string;
  initial?: Partial<StaffingPool>;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [roleId, setRoleId] = useState(initial?.role_id ?? '');
  const [headcount, setHeadcount] = useState(String(initial?.headcount ?? 2));
  const [start, setStart] = useState(initial?.start_date ?? '');
  const [end, setEnd] = useState(initial?.end_date ?? '');

  const { data: roles } = useQuery({
    queryKey: queryKeys.roles.list(),
    queryFn: async () => {
      const response = await api.roles.list();
      const payload = response.data as any;
      return Array.isArray(payload) ? payload : payload?.data || [];
    }
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const body = {
        role_id: roleId,
        headcount: Number(headcount),
        start_date: start || null,
        end_date: end || null
      };
      if (initial?.id) {
        return api.poolDemands.update(initial.id, body);
      }
      return api.poolDemands.create(projectId, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
      onSaved();
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message || err?.response?.data?.error || t('projects:staffing.poolSaveFailed'));
    }
  });
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="staffing-pool-form">
      <div className="lifecycle-expand-form">
        <label>
          {t('projects:staffing.role')}
          <select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            <option value="">{t('projects:staffing.selectRole')}</option>
            {(roles as any[] | undefined)?.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </label>
        <label>
          {t('projects:staffing.headcount')}
          <input type="number" min="0.5" max="10" step="0.5" value={headcount}
                 onChange={(e) => setHeadcount(e.target.value)} />
        </label>
        <label>
          {t('common:startDate')}
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label>
          {t('common:endDate')}
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <button
          className="lifecycle-btn lifecycle-btn-primary"
          disabled={!roleId || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {initial?.id ? t('common:save') : t('projects:staffing.addPoolConfirm')}
        </button>
        <button className="lifecycle-btn" onClick={onCancel}>{t('common:cancel')}</button>
      </div>
      {error && <div className="staffing-error">{error}</div>}
    </div>
  );
}

export function StaffingSection({
  project,
  canEdit,
  onAssignmentClick,
  onDeleteAssignment
}: {
  project: any;
  canEdit: boolean;
  onAssignmentClick: (assignment: StaffingAssignment) => void;
  onDeleteAssignment: (assignment: StaffingAssignment) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [expand, setExpand] = useState<null | 'add-named' | 'add-pool'>(null);
  const [namingPool, setNamingPool] = useState<StaffingPool | null>(null);
  const [editingPool, setEditingPool] = useState<StaffingPool | null>(null);
  const [confirmDeletePool, setConfirmDeletePool] = useState<string | null>(null);

  const assignments: StaffingAssignment[] = project.assignments ?? [];
  const pools: StaffingPool[] = (project.pool_demands ?? []).filter((p: StaffingPool) => p.status !== 'cancelled');

  const summary = useMemo(() => {
    const acc = { design: { named: 0, pool: 0 }, dev: { named: 0, pool: 0 } };
    for (const a of assignments) {
      if (a.status === 'paused') continue;
      acc[sideOfRole(a.role_name)].named += (a.allocation_percentage ?? 0) / 100;
    }
    for (const p of pools) {
      if (p.status !== 'open') continue;
      acc[sideOfRole(p.role_name)].pool += p.headcount ?? 0;
    }
    return acc;
  }, [assignments, pools]);

  const markPoolMutation = useMutation({
    mutationFn: async ({ pool, namedCount }: { pool: StaffingPool; namedCount: number }) => {
      const remaining = (pool.headcount ?? 0) - namedCount;
      if (remaining > 0.01) {
        return api.poolDemands.update(pool.id, { headcount: Math.round(remaining * 100) / 100 });
      }
      return api.poolDemands.update(pool.id, { status: 'named' });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(project.id) })
  });

  const deletePoolMutation = useMutation({
    mutationFn: (id: string) => api.poolDemands.delete(id),
    onSuccess: () => {
      setConfirmDeletePool(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(project.id) });
    }
  });

  const poolDeleteTwoClick = (pool: StaffingPool) => {
    if (confirmDeletePool !== pool.id) {
      setConfirmDeletePool(pool.id);
      setTimeout(() => setConfirmDeletePool((cur) => (cur === pool.id ? null : cur)), 3000);
      return;
    }
    deletePoolMutation.mutate(pool.id);
  };

  const fte = (n: number) => (Math.round(n * 100) / 100).toString();

  return (
    <div className="staffing-section">
      {/* Side summary strip */}
      <div className="staffing-summary">
        <span className="staffing-summary-side">
          <span className="staffing-summary-label">{t('projects:staffing.designSide')}</span>
          <span>{t('projects:staffing.namedPlusPool', { named: fte(summary.design.named), pool: fte(summary.design.pool) })}</span>
        </span>
        <span className="staffing-summary-divider">│</span>
        <span className="staffing-summary-side">
          <span className="staffing-summary-label">{t('projects:staffing.devSide')}</span>
          <span>{t('projects:staffing.namedPlusPool', { named: fte(summary.dev.named), pool: fte(summary.dev.pool) })}</span>
        </span>
        {canEdit && (
          <span className="staffing-summary-actions">
            <button className="lifecycle-btn" onClick={() => { setExpand(expand === 'add-named' ? null : 'add-named'); setEditingPool(null); }}>
              <Plus size={13} className="inline mr-1" />
              {t('projects:staffing.addNamed')}
            </button>
            <button className="lifecycle-btn" onClick={() => { setExpand(expand === 'add-pool' ? null : 'add-pool'); setEditingPool(null); }}>
              <Plus size={13} className="inline mr-1" />
              {t('projects:staffing.addPool')}
            </button>
          </span>
        )}
      </div>

      {expand === 'add-named' && (
        <NamingPanel
          project={project}
          onFinished={() => setExpand(null)}
          onCancel={() => setExpand(null)}
        />
      )}
      {expand === 'add-pool' && (
        <PoolForm
          projectId={project.id}
          onSaved={() => setExpand(null)}
          onCancel={() => setExpand(null)}
        />
      )}

      {/* Mixed table: named rows + pool rows */}
      <div className="data-table-container">
        <table className="staffing-table">
          <thead>
            <tr>
              <th>{t('projects:staffing.colPerson')}</th>
              <th>{t('common:role')}</th>
              <th>{t('projects:staffing.colFte')}</th>
              <th>{t('projects:staffing.colPeriod')}</th>
              <th>{t('common:actions')}</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => (
              <tr
                key={a.id}
                className={`staffing-row ${a.status === 'paused' ? 'staffing-row--paused' : ''}`}
                onClick={() => onAssignmentClick(a)}
              >
                <td>
                  {a.status === 'paused' && <Pause size={12} className="inline mr-1 text-muted-foreground" />}
                  <Link to={`/people/${a.person_id}`} onClick={(e) => e.stopPropagation()} className="text-primary hover:underline">
                    {a.person_name}
                  </Link>
                </td>
                <td>{a.role_name}</td>
                <td>{a.allocation_percentage}%</td>
                <td>{fmtDate(a.computed_start_date ?? a.start_date)} ~ {fmtDate(a.computed_end_date ?? a.end_date)}</td>
                <td className="staffing-row-actions" onClick={(e) => e.stopPropagation()}>
                  {canEdit && (
                    <button className="btn table-action-btn" onClick={() => onDeleteAssignment(a)}>
                      {t('common:delete')}
                    </button>
                  )}
                </td>
              </tr>
            ))}

            {pools.map((p) => (
              <tr key={`pool-${p.id}`} className="staffing-row staffing-row--pool">
                <td>
                  <Diamond size={12} className="inline mr-1 fill-current" />
                  {p.status === 'open'
                    ? t('projects:staffing.poolPending', { count: p.headcount })
                    : t('projects:staffing.poolNamed', { count: p.headcount })}
                </td>
                <td>{p.role_name}</td>
                <td>{Math.round(p.headcount * 100)}%</td>
                <td>{fmtDate(p.start_date)} ~ {fmtDate(p.end_date)}</td>
                <td className="staffing-row-actions" onClick={(e) => e.stopPropagation()}>
                  {canEdit && p.status === 'open' && (
                    <>
                      <button className="btn table-action-btn" onClick={() => { setNamingPool(p); setEditingPool(null); }}>
                        {t('projects:staffing.nameAction')}
                      </button>
                      <button className="btn table-action-btn" onClick={() => { setEditingPool(p); setNamingPool(null); }}>
                        {t('common:edit')}
                      </button>
                      <button
                        className={`btn table-action-btn ${confirmDeletePool === p.id ? 'text-destructive font-semibold' : ''}`}
                        onClick={() => poolDeleteTwoClick(p)}
                      >
                        {confirmDeletePool === p.id ? t('common:confirm') : t('common:delete')}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}

            {assignments.length === 0 && pools.length === 0 && (
              <tr>
                <td colSpan={5} className="staffing-empty">
                  {t('projects:noTeamAssignments')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Naming expansion under the pool row context */}
      {namingPool && (
        <NamingPanel
          project={project}
          initialRoleId={namingPool.role_id}
          initialDates={{ start: (namingPool.start_date || '').slice(0, 10), end: (namingPool.end_date || '').slice(0, 10) }}
          requiredCount={undefined}
          onFinished={(count) => {
            markPoolMutation.mutate({ pool: namingPool, namedCount: count });
            setNamingPool(null);
          }}
          onCancel={() => setNamingPool(null)}
        />
      )}
      {editingPool && (
        <PoolForm
          projectId={project.id}
          initial={editingPool}
          onSaved={() => setEditingPool(null)}
          onCancel={() => setEditingPool(null)}
        />
      )}
    </div>
  );
}
