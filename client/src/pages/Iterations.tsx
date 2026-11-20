import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, ChevronDown, ChevronRight, Pencil, Trash2, CalendarRange } from 'lucide-react';
import { api } from '../lib/api-client';
import { asList } from '../lib/apiPayload';
import { useToast } from '../hooks/use-toast';
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

/** react-query key 与 BoardCells.tsx 迭代选择弹层同 key——改互相刷新
 *  (2026-10-13 起统一走 queryKeys 工厂,双源字面量退役) */

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

/** 事项行: 名称 / 优先级 P / 状态中文 / 主投入人名; 点击跳详情。
 *  I02h/U24-B：沉底区（attach 传入时）带行内挂接控件——select + 显式确认钮，
 *  change 即写会随箭头键误发请求（评审 F2）；pending/失败回滚/行内错误。 */
function ItemRow({
  project,
  attach,
  anchor = false,
  rowRef,
}: {
  project: any;
  attach?: {
    iterations: Iteration[];
    onAttach: (iterationId: string) => Promise<void>;
    disabled?: boolean;
    disabledHint?: string;
  };
  anchor?: boolean;
  rowRef?: (el: HTMLDivElement | null) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [selected, setSelected] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doAttach = async () => {
    if (!attach || !selected || pending) return;
    setPending(true);
    setError(null);
    try {
      await attach.onAttach(selected);
    } catch (err: any) {
      setError(err?.response?.data?.message || t('iterations:attach.failed'));
      setSelected('');
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      className={`it-item-row ${anchor ? 'it-item-row--anchor' : ''}`}
      ref={rowRef}
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
      {attach && (
        <span
          className="it-attach"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <select
            className="it-attach-select"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={pending || attach.disabled}
            aria-label={t('iterations:attach.selectAria', { name: project.name })}
            data-testid={`iter-attach-select-${project.id}`}
          >
            <option value="">{t('iterations:attach.placeholder')}</option>
            {attach.iterations.map((it) => (
              <option key={it.id} value={it.id}>{it.name}</option>
            ))}
          </select>
          <button
            type="button"
            className="it-btn it-btn--ghost it-attach-confirm"
            disabled={!selected || pending || attach.disabled}
            onClick={doAttach}
            data-testid={`iter-attach-confirm-${project.id}`}
          >
            {pending ? t('iterations:attach.pending') : t('iterations:attach.confirm')}
          </button>
          {attach.disabled && attach.disabledHint && (
            <span className="it-attach-hint">{attach.disabledHint}</span>
          )}
          {error && (
            <span className="it-attach-error" role="alert" data-testid={`iter-attach-error-${project.id}`}>
              {error}
            </span>
          )}
        </span>
      )}
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

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.iterations.all });

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
  // I02h（F4 兜底）：展开清单与卡头 stats 同用 lifecycle 谓词——非生命周期
  // 项目即使带 iteration_id 也不进清单（服务端统计本来就只数 lifecycle）
  const cardItems = items.filter((p) => p.iteration_id === iteration.id && p.lifecycle_state);

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
    <div className={`it-card ${expanded ? 'it-card--open' : ''}`} data-iteration-id={iteration.id}>
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const anchorProjectId = searchParams.get('projectId');
  const { toast } = useToast();
  const anchorRowRef = useRef<HTMLDivElement | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: itersResp, isLoading, error } = useQuery({
    queryKey: queryKeys.iterations.list(),
    queryFn: async () => (await api.iterations.list()).data,
  });
  const iterations: Iteration[] = useMemo(
    () => asList(itersResp),
    [itersResp]
  );

  /** 事项池: 展开清单与未排沉底区共用一份数据(客户端过滤)。
   * 无上限循环翻页——同需求台 P5 修复(旧 limit:200 静默截断)。 */
  const { data: itemsResp, isLoading: itemsLoading } = useQuery({
    queryKey: queryKeys.iterations.items(),
    queryFn: async () => {
      const PAGE = 500;
      const all: any[] = [];
      for (let page = 1; ; page++) {
        const resp = (await api.projects.list({ limit: PAGE, page })).data;
        const rows: any[] = resp.data ?? resp;
        all.push(...rows);
        if (rows.length < PAGE) break;
      }
      return { data: all };
    },
  });
  const items: any[] = useMemo(
    () => asList(itemsResp),
    [itemsResp]
  );

  // SR 聚合父行（有子项）：服务端对父行设置/清除迭代一律 400（聚合只读窗），
  // 沉底区不给挂接控件（I02h/D5+F3）
  const parentIds = useMemo(
    () => new Set(items.map((p) => p.parent_id).filter(Boolean) as string[]),
    [items]
  );

  // U23 锚点：/iterations?projectId=<id> —— 四态可见反馈（已挂/不可挂/父行/未找到）
  const anchorQuery = useQuery({
    queryKey: ['project', anchorProjectId],
    queryFn: async () => {
      const resp = (await api.projects.get(anchorProjectId!)).data as any;
      return resp?.data ?? resp;
    },
    enabled: !!anchorProjectId,
    retry: false,
  });

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
  const aggregateRowCount = useMemo(
    () => unassigned.filter((p) => parentIds.has(p.id)).length,
    [unassigned, parentIds]
  );

  /** 锚点四态（F5/G7）：loading 静默；assigned/unsupported/aggregate/missing 显 banner；
   * highlight=可挂接且未挂 → 高亮行 + scrollIntoView */
  const anchor = useMemo(() => {
    if (!anchorProjectId) return null;
    if (anchorQuery.isLoading) return { kind: 'loading' as const };
    const project = anchorQuery.data as any;
    if (!project) return { kind: 'missing' as const };
    if (project.iteration_id) {
      const it = iterations.find((i) => i.id === project.iteration_id);
      return { kind: 'assigned' as const, iterationId: String(project.iteration_id), name: it?.name ?? '' };
    }
    const typeName = project.project_type_name ?? project.project_type?.name ?? null;
    if (categoryOfTypeName(typeName) !== 'demand' || !project.lifecycle_state) {
      return { kind: 'unsupported' as const };
    }
    if (parentIds.has(project.id)) return { kind: 'aggregate' as const };
    return { kind: 'highlight' as const };
  }, [anchorProjectId, anchorQuery.isLoading, anchorQuery.data, iterations, parentIds]);

  useEffect(() => {
    if (anchor?.kind === 'highlight' && anchorRowRef.current) {
      anchorRowRef.current.scrollIntoView({ block: 'center' });
    }
  }, [anchor?.kind, itemsLoading]);

  /** U24-B 行内挂接：显式确认后写 + 双域缓存失效 + 成功 toast（失败由行内呈现） */
  const attachTo = async (projectId: string, iterationId: string) => {
    await api.projects.update(projectId, { iteration_id: iterationId } as any);
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.iterations.all });
    const name = iterations.find((it) => it.id === iterationId)?.name;
    toast({ title: t('iterations:attach.success', { name: name ?? '' }) });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      api.iterations.create({ name: newName.trim(), start_date: newStart, end_date: newEnd }),
    onSuccess: () => {
      setCreating(false);
      setNewName(''); setNewStart(''); setNewEnd('');
      queryClient.invalidateQueries({ queryKey: queryKeys.iterations.all });
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

      {anchor && anchor.kind !== 'highlight' && anchor.kind !== 'loading' && (
        <div
          className={`it-anchor-banner it-anchor-banner--${anchor.kind}`}
          role="status"
          data-testid="iterations-anchor-banner"
        >
          <span>
            {anchor.kind === 'assigned' && t('iterations:anchor.assigned', { name: anchor.name })}
            {anchor.kind === 'unsupported' && t('iterations:anchor.unsupported')}
            {anchor.kind === 'aggregate' && t('iterations:anchor.aggregate')}
            {anchor.kind === 'missing' && t('iterations:anchor.missing')}
          </span>
          {anchor.kind === 'assigned' && anchor.iterationId && (
            <button
              type="button"
              className="it-btn it-btn--ghost"
              data-testid="iterations-anchor-view-card"
              onClick={() =>
                document
                  .querySelector(`[data-iteration-id="${anchor.iterationId}"]`)
                  ?.scrollIntoView({ block: 'center' })
              }
            >
              {t('iterations:anchor.viewCard')}
            </button>
          )}
          {anchor.kind === 'unsupported' && (
            <button
              type="button"
              className="it-btn it-btn--ghost"
              data-testid="iterations-anchor-goto-projects"
              onClick={() => navigate('/projects')}
            >
              {t('iterations:anchor.gotoProjects')}
            </button>
          )}
        </div>
      )}

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
          <>
            {aggregateRowCount > 0 && (
              <div className="it-subtitle" data-testid="iterations-aggregate-note">
                {t('iterations:attach.aggregateNote', { count: aggregateRowCount })}
              </div>
            )}
            {unassigned.map((p) => {
              const isAnchor = anchor?.kind === 'highlight' && anchorProjectId === p.id;
              return (
                <ItemRow
                  key={p.id}
                  project={p}
                  anchor={isAnchor}
                  rowRef={isAnchor ? (el) => { anchorRowRef.current = el; } : undefined}
                  attach={
                    parentIds.has(p.id)
                      ? {
                          iterations,
                          onAttach: async () => {},
                          disabled: true,
                          disabledHint: t('iterations:attach.aggregateRowHint'),
                        }
                      : { iterations, onAttach: (iterId) => attachTo(p.id, iterId) }
                  }
                />
              );
            })}
          </>
        )}
      </section>
    </div>
  );
}

export default Iterations;
