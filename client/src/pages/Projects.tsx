import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Minus, Edit2, Trash2, Tag, ChevronDown, ChevronRight, Search, X, Pencil } from 'lucide-react';
import { api } from '../lib/api-client';
import { queryKeys } from '../lib/queryKeys';
import { useCellPopover } from '../hooks/useCellPopover';
import { PriorityCell, OwnerCell, TagsCell } from '../components/boards/EditableCells';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import ProjectModal from '../components/modals/ProjectModal';
import { LifecycleCellControls } from '../components/lifecycle/LifecycleCellControls';
import { TagManagerDialog } from '../components/tags/TagManagerDialog';
import { useModal } from '../hooks/useModal';
import { useScenario } from '../contexts/ScenarioContext';
import { categoryOfTypeName } from '../lib/projectCategories';
import type { Project } from '../types';
import './Projects.css';

/**
 * 需求台 (2026-09-21 分流裁决) — 项目导航 → 需求 tab.
 *
 * 信息密度重做: 名称(子类型+标签) | 状态(就地推进) | 人力(两侧实名+池 FTE) |
 * 版本(产品·RP 两段内联可编辑) | 优先级 | 负责人 | 操作(图标+二次确认删除)。
 * 按产品版本 → 交付版本两级分组, 未排版本沉底; 告警行淡黄底+短词。
 * 砍掉: 起止日期列 / 查看详情按钮(行点击即详情) / 人力分配旧弹窗。
 */

/** 版本/交付计划各自内联可编辑(两列); onSaved 回报字段与新值供跳组高亮 */
function VersionPart({ project, field, placeholder, onSaved }: {
  project: any;
  field: 'product_version' | 'release_version';
  placeholder: string;
  onSaved: (field: 'product_version' | 'release_version', value: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const updateMutation = useMutation({
    mutationFn: (patch: Record<string, string | null>) => api.projects.update(project.id, patch),
    onSuccess: (_data, patch) => {
      setEditing(false);
      onSaved(field, (patch[field] as string | null) ?? null);
    }
  });
  const value = (project[field] ?? '') as string;
  if (editing) {
    return (
      <input
        className="inline-edit-input"
        style={{ width: 74 }}
        value={draft}
        autoFocus
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const trimmed = draft.trim();
          if (trimmed !== value) updateMutation.mutate({ [field]: trimmed || null });
          else setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }
  return (
    <span className="req-edit-cell req-edit-cell--version" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="projects-version-part projects-version-part--single"
              title={placeholder}
              onClick={() => { setDraft(value); setEditing(true); }}>
        {value || <span className="text-muted">{placeholder}</span>}
      </button>
      <Pencil size={10} className="req-pencil" aria-hidden />
    </span>
  );
}

/** 人力列: 明文两行(设计/开发 实名+池), 点击弹就地调整气泡。
    池占位是规划杠杆,±0.5 步进直接改;实名分配仍走详情选人。 */
function StaffingCell({ project, onChanged }: { project: any; onChanged: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const pop = useCellPopover('staff-pop', 282, 300);
  const [busy, setBusy] = useState(false);

  const s = project.staffing_summary;
  const fmt = (n: number) => Number(n ?? 0).toFixed(1);

  const { data: roles } = useQuery({
    queryKey: queryKeys.roles.list(),
    queryFn: async () => {
      const response = await api.roles.list();
      const payload = response.data as any;
      return Array.isArray(payload) ? payload : payload?.data || [];
    },
    enabled: pop.open
  });
  const roleList = Array.isArray(roles) ? roles : ((roles as any)?.data ?? []);
  const seRole = roleList.find((r: any) => r.name === 'SE');
  const devRole = roleList.find((r: any) => r.name === '开发');

  /** ±0.5 步进池占位: 无行则建,归零则删 */
  const step = async (side: 'design' | 'dev', delta: number) => {
    setBusy(true);
    try {
      const roleId = side === 'design' ? seRole?.id : devRole?.id;
      if (!roleId) return;
      const pools = ((await api.poolDemands.listByProject(project.id)).data as any)?.data ?? [];
      const mine = pools.find((p: any) => p.status === 'open' && p.role_id === roleId);
      const current = mine ? Number(mine.headcount) : 0;
      const next = Math.round(Math.max(0, Math.min(10, current + delta)) * 10) / 10;
      if (!mine && next > 0) {
        await api.poolDemands.create(project.id, { role_id: roleId, headcount: next });
      } else if (mine && next <= 0) {
        await api.poolDemands.delete(mine.id);
      } else if (mine) {
        await api.poolDemands.update(mine.id, { headcount: next });
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  if (!s) return <span className="text-muted">—</span>;
  const sides: Array<[string, 'design' | 'dev', { named: number; pool: number }]> = [
    [t('projects:staffing.designFull'), 'design', s.design],
    [t('projects:staffing.devFull'), 'dev', s.dev]
  ];

  return (
    <span ref={pop.anchorRef} className="req-staff-wrap" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="req-staff" onClick={pop.toggle}
              title={t('projects:staffing.adjustHint')}>
        {sides.map(([label, side, v]) => (
          <span className="req-staff-row" key={label}
                title={t('projects:staffing.breakdown', { named: fmt(v.named), pool: fmt(v.pool) })}>
            <span className={`staff-dot staff-dot--${side}`} />
            <span className="req-staff-label">{label}</span>
            <span className="req-staff-num">
              <span className="req-staff-named">{fmt(v.named)}</span>
              {v.pool > 0 && <span className="req-staff-pool">+{fmt(v.pool)}</span>}
            </span>
          </span>
        ))}
      </button>
      <Pencil size={10} className="req-pencil" aria-hidden />

      {pop.open && (
        <div className="lc-popover staff-pop" style={pop.style}>
          <div className="lc-popover-title">{t('projects:staffing.adjustTitle')}</div>
          <div className="lc-popover-hint">{t('projects:staffing.adjustHow')}</div>
          {sides.map(([label, side, v]) => (
            <div key={label} className="staff-pop-row">
              <span className={`staff-dot staff-dot--${side}`} />
              <span className="staff-pop-side">{label}</span>
              <span className="staff-pop-named">
                {t('projects:staffing.namedLabel', { n: fmt(v.named) })}
              </span>
              <span className="staff-stepper-group">
                <span className="staff-stepper-label">{t('projects:staffing.poolShort')}</span>
                <span className="staff-stepper">
                  <button className="staff-stepper-btn" disabled={busy || v.pool <= 0}
                          onClick={() => step(side, -0.5)} title="-0.5">
                    <Minus size={14} />
                  </button>
                  <span className="staff-stepper-val">{fmt(v.pool)}</span>
                  <button className="staff-stepper-btn" disabled={busy}
                          onClick={() => step(side, 0.5)} title="+0.5">
                    <Plus size={14} />
                  </button>
                </span>
              </span>
            </div>
          ))}
          <div className="lc-popover-hint">{t('projects:staffing.adjustHintFooter')}</div>
        </div>
      )}
    </span>
  );
}

/** 优先级/负责人/标签三列由 EditableCells 提供(锚定气泡就地编辑) */

const UNVERSIONED = '__unversioned__';

interface ReleaseGroup {
  release: string | null;
  projects: any[];
}
interface ProductGroup {
  product: string | null;
  releases: ReleaseGroup[];
  count: number;
}

function buildGroups(projects: any[]): ProductGroup[] {
  const byProduct = new Map<string, any[]>();
  for (const p of projects) {
    const key = (p.product_version ?? '').trim() || UNVERSIONED;
    const list = byProduct.get(key) ?? [];
    list.push(p);
    byProduct.set(key, list);
  }

  const sortKey = (k: string) => (k === UNVERSIONED ? '\uffff' : k);
  const products = [...byProduct.keys()].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

  return products.map((product) => {
    const items = byProduct.get(product)!;
    const byRelease = new Map<string, any[]>();
    for (const p of items) {
      const key = (p.release_version ?? '').trim() || UNVERSIONED;
      const list = byRelease.get(key) ?? [];
      list.push(p);
      byRelease.set(key, list);
    }
    const releases = [...byRelease.keys()]
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
      .map((release) => ({
        release: release === UNVERSIONED ? null : release,
        projects: byRelease.get(release)!.sort(
          (a, b) => (a.priority ?? 5) - (b.priority ?? 5) || String(a.name).localeCompare(String(b.name))
        )
      }));
    return { product: product === UNVERSIONED ? null : product, releases, count: items.length };
  });
}

export function Projects() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { currentScenario } = useScenario();

  const [filters, setFilters] = useState({ search: '', lifecycle_state: '', tag_id: '' });
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  /** 就地保存反馈: 行 flash + 版本跳组后目标组头高亮 */
  const [flashId, setFlashId] = useState<string | null>(null);
  const [flashGroup, setFlashGroup] = useState<string | null>(null);

  const addProjectModal = useModal();
  const editProjectModal = useModal();
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const { data: projects, isLoading, error } = useQuery({
    queryKey: queryKeys.projects.list({ category: 'demand', lifecycle: filters.lifecycle_state }, currentScenario?.id),
    queryFn: async () => {
      const response = await api.projects.list({
        limit: 200,
        ...(filters.lifecycle_state ? { lifecycle_state: filters.lifecycle_state } : {})
      });
      const raw: any[] = response.data.data;
      return raw.map((project) => ({
        ...project,
        project_type: project.project_type_name
          ? { id: project.project_type_id, name: project.project_type_name, color_code: project.project_type_color_code }
          : undefined
      }));
    },
    enabled: !!currentScenario
  });

  const { data: tagsData } = useQuery({
    queryKey: queryKeys.tags.list(),
    queryFn: async () => (await api.tags.list()).data
  });
  const tags = (tagsData?.data as any[]) || [];

  const deleteProjectMutation = useMutation({
    mutationFn: (id: string) => api.projects.delete(id),
    onSuccess: () => {
      setConfirmingDelete(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    }
  });

  // Category scoping (需求台) + client filters
  const demandProjects = useMemo(() => {
    let rows = (projects ?? []).filter(
      (p: any) => categoryOfTypeName(p.project_type_name) === 'demand'
    );
    if (filters.search) {
      const q = filters.search.toLowerCase();
      rows = rows.filter((p: any) => String(p.name).toLowerCase().includes(q));
    }
    if (filters.tag_id) {
      rows = rows.filter((p: any) => (p.tags ?? []).some((tag: any) => String(tag.id) === String(filters.tag_id)));
    }
    return rows;
  }, [projects, filters.search, filters.tag_id]);

  const groups = useMemo(() => buildGroups(demandProjects), [demandProjects]);

  const toggleGroup = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleEditProject = (project: Project) => {
    setEditingProject(project);
    editProjectModal.open();
  };

  const twoClickDelete = (project: any) => {
    if (confirmingDelete !== project.id) {
      setConfirmingDelete(project.id);
      setTimeout(() => setConfirmingDelete((cur) => (cur === project.id ? null : cur)), 3000);
      return;
    }
    deleteProjectMutation.mutate(project.id);
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });

  const flashRow = (id: string) => {
    setFlashId(id);
    window.setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 900);
  };

  /** 行内保存统一出口: 刷新 + 行 flash */
  const handleCellSaved = (projectId: string) => {
    invalidate();
    flashRow(projectId);
  };

  /** 版本保存: 行 flash + 目标分组头高亮(行可能跳组,给落点) */
  const handleVersionSaved = (
    project: any,
    field: 'product_version' | 'release_version',
    value: string | null
  ) => {
    flashRow(project.id);
    const product = String((field === 'product_version' ? value : project.product_version) ?? '').trim() || UNVERSIONED;
    const release = String((field === 'release_version' ? value : project.release_version) ?? '').trim() || UNVERSIONED;
    setFlashGroup(`${product}::${release}`);
    window.setTimeout(() => setFlashGroup(null), 1400);
  };
  const flashProduct = flashGroup?.split('::')[0] ?? null;
  const flashRelease = flashGroup?.split('::')[1] ?? null;

  if (isLoading) return <LoadingSpinner />;  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={(error as any)?.message || t('projects:loadError')} />;

  return (
    <div className="projects-board">
      {/* 单行工具栏(静区): 计数 + 搜索 | 筛选 | 动作 —— 40px 栅格,主色仅"新建"一处 */}
      <div className="projects-toolbar" data-testid="filter-bar">
        <span className="board-count">{t('projects:board.countSummary', { count: demandProjects.length })}</span>
        <div className="board-search">
          <Search size={14} className="board-search-icon" />
          <input
            data-testid="search-input"
            className="board-search-input"
            placeholder={t('projects:searchPlaceholder')}
            value={filters.search}
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
          />
        </div>
        <select
          data-testid="lifecycle-filter"
          className="board-select"
          value={filters.lifecycle_state}
          onChange={(e) => setFilters((prev) => ({ ...prev, lifecycle_state: e.target.value }))}
        >
          <option value="">{t('projects:lifecycle.filterLabel')}</option>
          {['pending_rat', 'nok', 'designing', 'backlog', 'scheduled', 'in_iteration', 'delivered', 'cancelled'].map(
            (s) => <option key={s} value={s}>{t(`projects:lifecycle.state.${s}`)}</option>
          )}
        </select>
        <select
          data-testid="tag-filter"
          className="board-select"
          value={filters.tag_id}
          onChange={(e) => setFilters((prev) => ({ ...prev, tag_id: e.target.value }))}
        >
          <option value="">{t('projects:tags.filterLabel')}</option>
          {tags.map((tag) => <option key={String(tag.id)} value={String(tag.id)}>{tag.name}</option>)}
        </select>
        {(filters.search || filters.lifecycle_state || filters.tag_id) && (
          <button
            data-testid="reset-filters"
            className="board-reset"
            title={t('projects:board.resetFilters')}
            onClick={() => setFilters({ search: '', lifecycle_state: '', tag_id: '' })}
          >
            <X size={13} />
          </button>
        )}
        <div className="board-toolbar-right">
          <button className="board-ghost-btn" onClick={() => setTagManagerOpen(true)}>
            <Tag size={14} />
            {t('projects:tags.manageButton')}
          </button>
          <button className="board-primary-btn" onClick={addProjectModal.open}>
            <Plus size={15} />
            {t('projects:addNewProject')}
          </button>
        </div>
      </div>

      <div className="requirements-table" data-testid="requirements-table">
        <div className="requirements-thead">
          <span>{t('projects:board.colName')}</span>
          <span>{t('projects:board.colTags')}</span>
          <span className="col-c">{t('projects:lifecycleColumn')}</span>
          <span>{t('projects:board.colStaffing')}</span>
          <span>{t('projects:board.colVersion')}</span>
          <span>{t('projects:board.colRelease')}</span>
          <span className="col-c">{t('projects:board.colPriority')}</span>
          <span>{t('projects:board.colOwner')}</span>
          <span className="col-c">{t('common:actions')}</span>
        </div>

        {groups.map((group) => {
          const groupKey = group.product ?? UNVERSIONED;
          const isCollapsed = collapsed.has(groupKey);
          return (
            <div key={groupKey} className="requirements-group">
              <button
                type="button"
                className={`requirements-group-header ${(group.product ?? UNVERSIONED) === flashProduct ? 'requirements-group-header--flash' : ''}`}
                onClick={() => toggleGroup(groupKey)}
              >
                {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                <strong>
                  {group.product
                    ? t('projects:board.productGroupLabel', { name: group.product })
                    : t('projects:board.unversionedGroup')}
                </strong>
                <span className="requirements-group-count">{t('projects:board.groupCount', { count: group.count })}</span>
              </button>

              {!isCollapsed &&
                group.releases.map((rg) => (
                  <div key={rg.release ?? UNVERSIONED} className="requirements-release">
                    <div className={`requirements-release-header ${(groupKey === flashProduct && (rg.release ?? UNVERSIONED) === flashRelease) ? 'requirements-release-header--flash' : ''}`}>
                      {rg.release ?? t('projects:board.unscheduledGroup')}
                      <span className="requirements-group-count">
                        {t('projects:board.groupCount', { count: rg.projects.length })}
                      </span>
                    </div>

                    {rg.projects.map((project) => {
                      const warned = (project.lifecycle_warnings ?? []).length > 0;
                      return (
                        <div
                          key={project.id}
                          className={`requirements-row ${warned ? 'requirements-row--warned' : ''} ${project.id === flashId ? 'requirements-row--flash' : ''}`}
                          onClick={() => navigate(`/projects/${project.id}`)}
                        >
                          <span className="requirements-name">
                            <span className="requirements-name-text">{project.name}</span>
                            {(project.lifecycle_warnings ?? []).length > 0 && (
                              <span
                                className="lifecycle-warn-chip"
                                title={(project.lifecycle_warnings ?? [])
                                  .map((w: string) => t(`projects:lifecycle.warnings.${w}`))
                                  .join('\n')}
                              >
                                {t(`projects:lifecycle.warningShort.${(project.lifecycle_warnings ?? [])[0]}`, {
                                  defaultValue: t('projects:lifecycle.warningShort.GENERIC')
                                })}
                                {(project.lifecycle_warnings ?? []).length > 1
                                  ? `+${(project.lifecycle_warnings ?? []).length - 1}`
                                  : ''}
                              </span>
                            )}
                            {project.project_sub_type_name && (
                              <span className="requirements-subtype">· {project.project_sub_type_name}</span>
                            )}
                          </span>

                          <TagsCell project={project} allTags={tags} onSaved={() => handleCellSaved(project.id)} />

                          <span className="req-cell-center" onClick={(e) => e.stopPropagation()}>
                            <LifecycleCellControls project={project} />
                          </span>

                          <StaffingCell project={project} onChanged={() => handleCellSaved(project.id)} />

                          <VersionPart project={project} field="product_version"
                            placeholder={t('projects:version.productPlaceholder')}
                            onSaved={(field, value) => handleVersionSaved(project, field, value)} />
                          <VersionPart project={project} field="release_version"
                            placeholder={t('projects:version.releasePlaceholder')}
                            onSaved={(field, value) => handleVersionSaved(project, field, value)} />

                          <PriorityCell project={project} onSaved={() => handleCellSaved(project.id)} />

                          <OwnerCell project={project} onSaved={() => handleCellSaved(project.id)} />

                          <span className="requirements-actions" onClick={(e) => e.stopPropagation()}>
                            <button
                              className="req-icon-btn"
                              title={t('common:edit')}
                              onClick={() => handleEditProject(project)}
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              className={`req-icon-btn ${confirmingDelete === project.id ? 'req-icon-btn--confirm' : ''}`}
                              title={confirmingDelete === project.id ? t('common:confirm') : t('common:delete')}
                              onClick={() => twoClickDelete(project)}
                            >
                              {confirmingDelete === project.id ? t('common:confirm') : <Trash2 size={14} />}
                            </button>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ))}
            </div>
          );
        })}

        {demandProjects.length === 0 && (
          <div className="requirements-empty">{t('projects:board.empty')}</div>
        )}
      </div>

      <ProjectModal
        isOpen={addProjectModal.isOpen}
        onClose={addProjectModal.close}
        onSuccess={invalidate}
      />

      <ProjectModal
        isOpen={editProjectModal.isOpen}
        onClose={() => {
          setEditingProject(null);
          editProjectModal.close();
        }}
        editingProject={editingProject}
        onSuccess={invalidate}
      />

      <TagManagerDialog isOpen={tagManagerOpen} onClose={() => setTagManagerOpen(false)} />
    </div>
  );
}
