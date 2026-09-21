import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Edit2, Trash2, Tag, ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import { api } from '../lib/api-client';
import { queryKeys } from '../lib/queryKeys';
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

/** 版本两段(产品·RP)各自内联可编辑 */
function VersionCell({ project, onSaved }: { project: any; onSaved: () => void }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<null | 'product' | 'release'>(null);
  const [draft, setDraft] = useState('');

  const updateMutation = useMutation({
    mutationFn: (patch: Record<string, string | null>) => api.projects.update(project.id, patch),
    onSuccess: () => {
      setEditing(null);
      onSaved();
    }
  });

  const begin = (part: 'product' | 'release') => {
    setDraft((project[part === 'product' ? 'product_version' : 'release_version'] ?? '') as string);
    setEditing(part);
  };
  const commit = () => {
    const field = editing === 'product' ? 'product_version' : 'release_version';
    const trimmed = draft.trim();
    if (trimmed !== ((project[field] ?? '') as string)) {
      updateMutation.mutate({ [field]: trimmed || null });
    } else {
      setEditing(null);
    }
  };

  if (editing) {
    return (
      <input
        className="inline-edit-input"
        style={{ width: 88 }}
        value={draft}
        autoFocus
        placeholder={editing === 'product' ? t('projects:version.productPlaceholder') : t('projects:version.releasePlaceholder')}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setEditing(null);
        }}
      />
    );
  }

  return (
    <span className="projects-version" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="projects-version-part" onClick={() => begin('product')}
              title={t('projects:version.productTitle')}>
        {project.product_version || <span className="text-muted">{t('projects:version.productPlaceholder')}</span>}
      </button>
      <span className="projects-version-sep">·</span>
      <button type="button" className="projects-version-part" onClick={() => begin('release')}
              title={t('projects:version.releaseTitle')}>
        {project.release_version || <span className="text-muted">{t('projects:version.releasePlaceholder')}</span>}
      </button>
    </span>
  );
}

/** 人力列: 微条形(长度编码) + 一位小数右对齐数字。
    named=主题色实心段, pool=琥珀段; 标尺上限 4 FTE。 */
function StaffingCell({ project }: { project: any }) {
  const { t } = useTranslation();
  const s = project.staffing_summary;
  if (!s) return <span className="text-muted">—</span>;
  const fmt = (n: number) => Number(n ?? 0).toFixed(1);
  const SCALE = 4;
  const pct = (n: number) => Math.min(100, (n / SCALE) * 100);
  const sides: Array<[string, { named: number; pool: number }]> = [
    [t('projects:staffing.designShort'), s.design],
    [t('projects:staffing.devShort'), s.dev]
  ];
  return (
    <span
      className="req-staff"
      title={t('projects:staffing.summaryTitle', {
        dn: fmt(s.design.named), dp: fmt(s.design.pool),
        vn: fmt(s.dev.named), vp: fmt(s.dev.pool)
      })}
    >
      {sides.map(([label, side]) => (
        <span className="req-staff-row" key={label}>
          <span className="req-staff-label">{label}</span>
          <span className="req-staff-track">
            <span className="req-staff-named" style={{ width: `${pct(side.named)}%` }} />
            {side.pool > 0 && <span className="req-staff-pool" style={{ width: `${pct(side.pool)}%` }} />}
          </span>
          <span className="req-staff-num">
            {fmt(side.named)}{side.pool > 0 ? `+${fmt(side.pool)}` : ''}
          </span>
        </span>
      ))}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: number }) {
  const level = Math.min(5, Math.max(1, Number(priority) || 5));
  return <span className={`req-pri req-pri--${level}`}>P{level}</span>;
}

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
            {t('projects:tags.manage')}
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
          <span>{t('projects:lifecycleColumn')}</span>
          <span>{t('projects:board.colStaffing')}</span>
          <span>{t('projects:board.colVersion')}</span>
          <span>{t('projects:board.colPriority')}</span>
          <span>{t('projects:board.colOwner')}</span>
          <span>{t('common:actions')}</span>
        </div>

        {groups.map((group) => {
          const groupKey = group.product ?? UNVERSIONED;
          const isCollapsed = collapsed.has(groupKey);
          return (
            <div key={groupKey} className="requirements-group">
              <button
                type="button"
                className="requirements-group-header"
                onClick={() => toggleGroup(groupKey)}
              >
                {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                <strong>{group.product ?? t('projects:board.unversionedGroup')}</strong>
                <span className="requirements-group-count">{t('projects:board.groupCount', { count: group.count })}</span>
              </button>

              {!isCollapsed &&
                group.releases.map((rg) => (
                  <div key={rg.release ?? UNVERSIONED} className="requirements-release">
                    <div className="requirements-release-header">
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
                          className={`requirements-row ${warned ? 'requirements-row--warned' : ''}`}
                          onClick={() => navigate(`/projects/${project.id}`)}
                        >
                          <span className="requirements-name">
                            <span className="requirements-name-text">{project.name}</span>
                            {project.project_sub_type_name && (
                              <span className="requirements-subtype">· {project.project_sub_type_name}</span>
                            )}
                            {(project.tags ?? []).slice(0, 3).map((tag: any) => (
                              <span
                                key={tag.id}
                                className="req-tag"
                                style={{
                                  color: tag.color || 'var(--text-secondary)',
                                  background: `${tag.color || '#888888'}1f`
                                }}
                              >
                                {tag.name}
                              </span>
                            ))}
                            {(project.tags?.length ?? 0) > 3 && (
                              <span
                                className="req-tag req-tag--more"
                                title={(project.tags ?? []).slice(3).map((tg: any) => tg.name).join('、')}
                              >
                                +{(project.tags?.length ?? 0) - 3}
                              </span>
                            )}
                          </span>

                          <span onClick={(e) => e.stopPropagation()}>
                            <LifecycleCellControls project={project} />
                          </span>

                          <StaffingCell project={project} />

                          <span onClick={(e) => e.stopPropagation()}>
                            <VersionCell project={project} onSaved={invalidate} />
                          </span>

                          <PriorityBadge priority={project.priority} />

                          <span className="requirements-owner">{project.owner_name || '—'}</span>

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
