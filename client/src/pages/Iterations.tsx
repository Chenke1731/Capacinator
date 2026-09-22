import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, ChevronDown, ChevronRight, Pencil, Trash2, CalendarRange } from 'lucide-react';
import { api } from '../lib/api-client';
import { categoryOfTypeName } from '../lib/projectCategories';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import './Iterations.css';

/**
 * 迭代导航页 v1 (BOARD_REDESIGN_2026-09-23 §B4 / §0.5)。
 *
 * 按季度分组的迭代卡: 卡头=名称+窗口(mono)+事项数+SE·MDE·开发人月合计;
 * 卡内=状态分布 + SE/MDE 负载块(强度>100% 琥珀, §0.5 防爆表监控面) +
 * 展开就地加载的事项清单(GET /projects?limit=200 按 iteration_id 过滤)。
 * 未排迭代沉底区: 需求类事项中 iteration_id 为空且生命周期非空的清单。
 * CRUD 全就地零弹窗; 删除仅空迭代(API 400 message 显示在卡内)。
 */

/** react-query key 与 BoardCells.tsx 迭代选择弹层同 key——改互相刷新 */
const ITERATIONS_LIST_KEY = ['iterations', 'list'] as const;
const ITERATIONS_ITEMS_KEY = ['iterations', 'items'] as const;

interface IterationLoadRow {
  role: string;
  person: string;
  items: number;
  pm: number;
  intensity_pct: number;
}

interface IterationStats {
  item_count: number;
  se_pm: number;
  mde_pm: number;
  dev_pm: number;
  states: { state: string | null; count: number }[];
  load: IterationLoadRow[];
}

interface Iteration {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  quarter?: string;
  stats?: IterationStats;
}

const fmtPm = (v: number | null | undefined): string =>
  String(Math.round((v ?? 0) * 10) / 10);

const stateLabel = (state: string | null, t: (k: string, o?: any) => string): string =>
  state ? t(`projects:lifecycle.state.${state}`, { defaultValue: state }) : '—';

/** 事项行: 名称 / 优先级 P / 状态中文 / 主投入人名; 点击跳详情 */
function ItemRow({ project }: { project: any }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div
      className="it-item-row"
      onClick={() => navigate(`/projects/${project.id}`)}
      title={project.name}
    >
      <span className="it-item-prio">P{project.priority ?? 5}</span>
      <span className="it-item-name">{project.name}</span>
      <span className="it-item-state">
        {stateLabel(project.lifecycle_state, t)}
      </span>
      <span className="it-item-dev">
        {project.primary_dev?.person_name ?? t('iterations:noPrimaryDev')}
      </span>
    </div>
  );
}

/** SE/MDE 负载块: 每人一行 `人名 · N 项 · X 人月 · 强度 Y%`, >100% 琥珀 */
function LoadBlock({ stats }: { stats: IterationStats }) {
  const { t } = useTranslation();
  if (!stats.load?.length) return null;
  return (
    <div className="it-load">
      <div className="it-subhead">{t('iterations:loadTitle')}</div>
      {stats.load.map((row) => (
        <div
          key={`${row.role}-${row.person}`}
          className={`it-load-row ${row.intensity_pct > 100 ? 'it-load-row--over' : ''}`}
          title={t('iterations:loadLine', {
            person: row.person,
            items: row.items,
            pm: fmtPm(row.pm),
            pct: row.intensity_pct,
          })}
        >
          <span className="it-load-role">{row.role}</span>
          <span className="it-load-line">
            {t('iterations:loadLine', {
              person: row.person,
              items: row.items,
              pm: fmtPm(row.pm),
              pct: row.intensity_pct,
            })}
          </span>
        </div>
      ))}
    </div>
  );
}

function IterationCard({
  iteration,
  items,
  expanded,
  onToggle,
}: {
  iteration: Iteration;
  items: any[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(iteration.name);
  const [draftStart, setDraftStart] = useState(iteration.start_date);
  const [draftEnd, setDraftEnd] = useState(iteration.end_date);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['iterations'] });

  const saveMutation = useMutation({
    mutationFn: () =>
      api.iterations.update(iteration.id, {
        name: draftName.trim(),
        start_date: draftStart,
        end_date: draftEnd,
      }),
    onSuccess: () => { setEditing(false); invalidate(); },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.iterations.delete(iteration.id),
    onSuccess: () => invalidate(),
    onError: (err: any) => {
      setDeleteError(err?.response?.data?.message ?? t('iterations:deleteFailed'));
    },
  });

  const stats = iteration.stats;
  const cardItems = items.filter((p) => p.iteration_id === iteration.id);

  if (editing) {
    return (
      <div className="it-card">
        <div className="it-edit-form">
          <span className="it-subhead">{t('iterations:editIteration')}</span>
          <input
            className="it-input it-edit-name"
            value={draftName}
            autoFocus
            placeholder={t('iterations:namePlaceholder')}
            onChange={(e) => setDraftName(e.target.value)}
          />
          <div className="it-edit-dates">
            <input
              className="it-input"
              type="date"
              value={draftStart}
              onChange={(e) => setDraftStart(e.target.value)}
            />
            <span className="it-date-sep">~</span>
            <input
              className="it-input"
              type="date"
              value={draftEnd}
              onChange={(e) => setDraftEnd(e.target.value)}
            />
          </div>
          <div className="it-edit-actions">
            <button
              type="button"
              className="it-btn it-btn--primary"
              disabled={!draftName.trim() || !draftStart || !draftEnd || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {t('iterations:save')}
            </button>
            <button
              type="button"
              className="it-btn"
              onClick={() => {
                setDraftName(iteration.name);
                setDraftStart(iteration.start_date);
                setDraftEnd(iteration.end_date);
                setEditing(false);
              }}
            >
              {t('iterations:cancel')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`it-card ${expanded ? 'it-card--open' : ''}`}>
      <div
        className="it-card-head"
        onClick={onToggle}
        title={expanded ? t('iterations:collapseHint') : t('iterations:expandHint')}
      >
        <span className="it-chevron">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <span className="it-card-name">{iteration.name}</span>
        <span className="it-card-window">
          {iteration.start_date} ~ {iteration.end_date}
        </span>
        <span className="it-card-summary">
          {t('iterations:summaryLine', {
            count: stats?.item_count ?? 0,
            se: fmtPm(stats?.se_pm),
            mde: fmtPm(stats?.mde_pm),
            dev: fmtPm(stats?.dev_pm),
          })}
        </span>
        <span className="it-card-actions" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="it-icon-btn"
            title={t('iterations:editIteration')}
            onClick={() => setEditing(true)}
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            className="it-icon-btn it-icon-btn--danger"
            title={confirmingDelete ? t('iterations:deleteConfirm') : t('iterations:deleteIteration')}
            onClick={() => {
              setDeleteError(null);
              if (!confirmingDelete) {
                setConfirmingDelete(true);
                setTimeout(() => setConfirmingDelete(false), 3000);
                return;
              }
              setConfirmingDelete(false);
              deleteMutation.mutate();
            }}
          >
            <Trash2 size={13} />
          </button>
        </span>
      </div>

      {deleteError && <div className="it-card-error">{deleteError}</div>}

      {expanded && (
        <div className="it-card-body">
          {stats?.states?.length ? (
            <div className="it-states">
              <div className="it-subhead">{t('iterations:stateDistribution')}</div>
              <div className="it-states-row">
                {stats.states.map((s) => (
                  <span key={s.state ?? 'none'} className="it-state-chip">
                    {t('iterations:stateCount', {
                      count: s.count,
                      state: stateLabel(s.state, t),
                    })}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {stats && <LoadBlock stats={stats} />}

          <div className="it-items">
            <div className="it-subhead">{t('iterations:itemsTitle')}</div>
            {cardItems.length === 0 ? (
              <div className="it-items-empty">{t('iterations:itemsEmpty')}</div>
            ) : (
              cardItems.map((p) => <ItemRow key={p.id} project={p} />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function Iterations() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: itersResp, isLoading, error } = useQuery({
    queryKey: ITERATIONS_LIST_KEY,
    queryFn: async () => (await api.iterations.list()).data,
  });
  const iterations: Iteration[] = useMemo(
    () => (Array.isArray(itersResp) ? itersResp : (itersResp?.data ?? [])),
    [itersResp]
  );

  /** 事项池: 展开清单与未排沉底区共用一份数据(客户端过滤) */
  const { data: itemsResp, isLoading: itemsLoading } = useQuery({
    queryKey: ITERATIONS_ITEMS_KEY,
    queryFn: async () => (await api.projects.list({ limit: 200 })).data,
  });
  const items: any[] = useMemo(
    () => (Array.isArray(itemsResp) ? itemsResp : (itemsResp?.data ?? [])),
    [itemsResp]
  );

  /** 按季度(start_date 派生值)分组, 保持 API 的 start_date 倒序 */
  const groups = useMemo(() => {
    const map = new Map<string, Iteration[]>();
    for (const it of iterations) {
      const q = it.quarter ?? '—';
      if (!map.has(q)) map.set(q, []);
      map.get(q)!.push(it);
    }
    return [...map.entries()];
  }, [iterations]);

  /** 未排迭代沉底区: 需求类 + 无挂接 + 生命周期非空 */
  const unassigned = useMemo(
    () =>
      items
        .filter(
          (p) =>
            categoryOfTypeName(p.project_type_name) === 'demand' &&
            !p.iteration_id &&
            p.lifecycle_state
        )
        .sort((a, b) => (a.priority ?? 5) - (b.priority ?? 5) || a.name.localeCompare(b.name)),
    [items]
  );

  const createMutation = useMutation({
    mutationFn: () =>
      api.iterations.create({ name: newName.trim(), start_date: newStart, end_date: newEnd }),
    onSuccess: () => {
      setCreating(false);
      setNewName(''); setNewStart(''); setNewEnd('');
      queryClient.invalidateQueries({ queryKey: ['iterations'] });
    },
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={(error as any)?.message || String(error)} />;

  return (
    <div className="iterations-page">
      <div className="page-header">
        <div>
          <h1>{t('iterations:title')}</h1>
          <p className="it-subtitle">{t('iterations:subtitle')}</p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="it-btn it-btn--primary"
            onClick={() => setCreating((v) => !v)}
          >
            <Plus size={14} />
            {t('iterations:newIteration')}
          </button>
        </div>
      </div>

      {creating && (
        <div className="it-create-form">
          <input
            className="it-input it-create-name"
            value={newName}
            autoFocus
            placeholder={t('iterations:namePlaceholder')}
            onChange={(e) => setNewName(e.target.value)}
          />
          <div className="it-edit-dates">
            <input
              className="it-input"
              type="date"
              value={newStart}
              onChange={(e) => setNewStart(e.target.value)}
            />
            <span className="it-date-sep">~</span>
            <input
              className="it-input"
              type="date"
              value={newEnd}
              onChange={(e) => setNewEnd(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="it-btn it-btn--primary"
            disabled={!newName.trim() || !newStart || !newEnd || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {t('iterations:create')}
          </button>
          <button type="button" className="it-btn" onClick={() => setCreating(false)}>
            {t('iterations:cancel')}
          </button>
          {createMutation.isError && (
            <span className="it-form-error">
              {t('iterations:createFailed')}
            </span>
          )}
        </div>
      )}

      {iterations.length === 0 ? (
        <div className="it-empty">
          <CalendarRange size={28} className="it-empty-icon" />
          <div className="it-empty-title">{t('iterations:emptyTitle')}</div>
          <div className="it-empty-hint">{t('iterations:emptyHint')}</div>
        </div>
      ) : (
        groups.map(([quarter, iters]) => (
          <section key={quarter} className="it-group">
            <h2 className="it-group-title">{quarter}</h2>
            {iters.map((it) => (
              <IterationCard
                key={it.id}
                iteration={it}
                items={items}
                expanded={expandedId === it.id}
                onToggle={() => setExpandedId((cur) => (cur === it.id ? null : it.id))}
              />
            ))}
          </section>
        ))
      )}

      <section className="it-unassigned">
        <h2 className="it-group-title">{t('iterations:unassignedTitle')}</h2>
        <div className="it-subtitle">{t('iterations:unassignedHint')}</div>
        {itemsLoading ? (
          <div className="it-items-empty">{t('iterations:itemsLoading')}</div>
        ) : unassigned.length === 0 ? (
          <div className="it-items-empty">{t('iterations:unassignedEmpty')}</div>
        ) : (
          unassigned.map((p) => <ItemRow key={p.id} project={p} />)
        )}
      </section>
    </div>
  );
}

export default Iterations;
