import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Check, Pencil, Plus, Search, X } from 'lucide-react';
import { api } from '../../lib/api-client';
import { queryKeys } from '../../lib/queryKeys';
import { useCellPopover } from '../../hooks/useCellPopover';

/**
 * 需求台行内编辑三件套: 优先级 / 负责人 / 标签。
 * 交互词汇与人力气泡同源(useCellPopover 锚定气泡),选中即存、点外即收;
 * 呈现态保持只读密度,悬停铅笔提示可编辑。裁决(2026-09-22):
 * 负责人简版(姓名+主角色) / 标签气泡内可新建 / 不做拖拽排序。
 */

const PRIORITY_LABELS = ['highest', 'high', 'medium', 'low', 'lowest'] as const;

export function PriorityCell({ project, onSaved }: { project: any; onSaved: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const pop = useCellPopover('pri-pop', 180, 260);
  const [busy, setBusy] = useState(false);
  const level = Math.min(5, Math.max(1, Number(project.priority) || 5));

  const choose = async (p: number) => {
    pop.setOpen(false);
    if (p === level) return;
    setBusy(true);
    try {
      await api.projects.update(project.id, { priority: p });
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <span ref={pop.anchorRef} className="req-edit-cell req-edit-cell--pri" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        data-testid="priority-edit-btn"
        className={`req-pri req-pri--${level} req-editable`}
        disabled={busy}
        title={t('projects:prioritySelect.hint')}
        onClick={pop.toggle}
      >
        P{level}
      </button>
      <Pencil size={10} className="req-pencil" aria-hidden />
      {pop.open && (
        <div className="lc-popover cell-pop pri-pop" data-testid="priority-popover" style={pop.style}>
          <div className="lc-popover-title">{t('projects:prioritySelect.title')}</div>
          <div className="cell-pop-list">
            {[1, 2, 3, 4, 5].map((p) => (
              <button
                key={p}
                type="button"
                className={`cell-pop-item ${p === level ? 'cell-pop-item--active' : ''}`}
                onClick={() => choose(p)}
              >
                <span className={`req-pri req-pri--${p}`}>P{p}</span>
                <span className="cell-pop-item-label">{t(`projects:priorityLevel.${PRIORITY_LABELS[p - 1]}`)}</span>
                {p === level && <Check size={13} className="cell-pop-check" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </span>
  );
}

export function OwnerCell({ project, onSaved }: { project: any; onSaved: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const pop = useCellPopover('owner-pop', 262, 380);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: peoplePayload } = useQuery({
    queryKey: queryKeys.people.lists(),
    queryFn: async () => (await api.people.list({ limit: 500 })).data as any,
    enabled: pop.open
  });
  const people = useMemo(
    () =>
      ((peoplePayload?.data ?? []) as any[])
        .slice()
        .sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh')),
    [peoplePayload]
  );
  const needle = q.trim().toLowerCase();
  const filtered = needle ? people.filter((p) => String(p.name).toLowerCase().includes(needle)) : people;

  const choose = async (id: string | null) => {
    pop.setOpen(false);
    const current = project.owner_id ? String(project.owner_id) : null;
    if (current === (id ? String(id) : null)) return;
    setBusy(true);
    try {
      await api.projects.update(project.id, { owner_id: id });
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <span ref={pop.anchorRef} className="req-edit-cell req-edit-cell--owner" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        data-testid="owner-edit-btn"
        className={`requirements-owner-btn req-editable ${project.owner_name ? '' : 'is-empty'}`}
        disabled={busy}
        title={t('projects:ownerSelect.hint')}
        onClick={pop.toggle}
      >
        {project.owner_name || t('projects:ownerSelect.none')}
      </button>
      <Pencil size={10} className="req-pencil" aria-hidden />
      {pop.open && (
        <div className="lc-popover cell-pop owner-pop" data-testid="owner-popover" style={pop.style}>
          <div className="lc-popover-title">{t('projects:ownerSelect.title')}</div>
          <div className="cell-pop-search">
            <Search size={12} aria-hidden />
            <input
              autoFocus
              value={q}
              placeholder={t('projects:ownerSelect.searchPlaceholder')}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="cell-pop-list">
            {project.owner_id && (
              <button type="button" className="cell-pop-item cell-pop-item--danger" onClick={() => choose(null)}>
                <X size={13} />
                <span className="cell-pop-item-label">{t('projects:ownerSelect.clear')}</span>
              </button>
            )}
            {filtered.map((p) => {
              const active = String(p.id) === String(project.owner_id);
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`cell-pop-item ${active ? 'cell-pop-item--active' : ''}`}
                  onClick={() => choose(p.id)}
                >
                  <span className="cell-pop-item-label">{p.name}</span>
                  {p.primary_role_name && <span className="cell-pop-item-meta">{p.primary_role_name}</span>}
                  {active && <Check size={13} className="cell-pop-check" />}
                </button>
              );
            })}
            {filtered.length === 0 && <div className="cell-pop-empty">{t('projects:ownerSelect.empty')}</div>}
          </div>
        </div>
      )}
    </span>
  );
}

/** 标签 chip 文字色: 向 --tag-ink 收敛的比例按色彩亮度自适应——
 *  亮色(琥珀/黄)多收敛保 AA(2026-09-22 用户实测"预留"暴露: 固定 68% 时
 *  琥珀 ~3.1:1 不达标),深色保持 68% 维持饱和感。 */
function tagInkRatio(color?: string | null): number {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return 0.68;
  const n = parseInt(color.slice(1), 16);
  const lin = [16, 8, 0].map((sh) => {
    const c = ((n >> sh) & 255) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  return lum > 0.4 ? 0.42 : 0.68;
}

export function TagsCell({
  project,
  allTags,
  onSaved,
  onFilterByTag,
  activeTagId
}: {
  project: any;
  allTags: any[];
  onSaved: () => void;
  /** 2026-09-22 Q3 裁决: chip 点击=按此标签过滤(GitHub 式),再点同枚取消 */
  onFilterByTag: (tagId: string | number) => void;
  activeTagId?: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const pop = useCellPopover('tags-pop', 262, 400);
  const [q, setQ] = useState('');
  const [draftName, setDraftName] = useState('');
  const [busy, setBusy] = useState(false);

  const currentIds = new Set((project.tags ?? []).map((tg: any) => String(tg.id)));
  const needle = q.trim().toLowerCase();
  const visible = needle
    ? allTags.filter((tg) => String(tg.name).toLowerCase().includes(needle))
    : allTags;

  const commit = async (nextIds: Set<string>) => {
    setBusy(true);
    try {
      await api.projects.update(project.id, { tag_ids: [...nextIds] });
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  const toggle = (tagId: string | number) => {
    if (busy) return;
    const key = String(tagId);
    const next = new Set(currentIds);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    commit(next);
  };

  /** 新建标签并直接打上; 重名(409 带 data)时复用已有标签 */
  const createAndAdd = async () => {
    const name = draftName.trim();
    if (!name || busy) return;
    const hit = allTags.find((tg) => tg.name === name);
    let tag = hit;
    if (!tag) {
      try {
        tag = ((await api.tags.create({ name })).data as any)?.data;
        await queryClient.invalidateQueries({ queryKey: queryKeys.tags.list() });
      } catch (err: any) {
        tag = err?.response?.data?.data;
      }
    }
    if (!tag) return;
    setDraftName('');
    const next = new Set(currentIds);
    next.add(String(tag.id));
    commit(next);
  };

  const tags: any[] = project.tags ?? [];
  /* 2026-09-22 Q1-B 裁决: 标签迁入名称格行尾(弹性列吸收长度,不占独立列预算);
     Q1+Q5 联立: 标签治理(只放正交属性)后常态 1-2 枚全量可见,超出折叠 +N
     (点击 +N 即达全量编辑弹层,不止 title) */
  return (
    <span ref={pop.anchorRef} className="req-tags-inline" onClick={(e) => e.stopPropagation()}>
      {tags.slice(0, 2).map((tag: any) => (
        <button
          key={tag.id}
          type="button"
          className={`req-tag req-tag--filter ${String(activeTagId) === String(tag.id) ? 'req-tag--filtering' : ''}`}
          title={t('projects:tagSelect.filterHint')}
          style={{ color: `color-mix(in srgb, ${tag.color || '#888888'} ${Math.round(tagInkRatio(tag.color) * 100)}%, var(--tag-ink))`, background: `${tag.color || '#888888'}2b` }}
          onClick={(e) => { e.stopPropagation(); onFilterByTag(tag.id); }}
        >
          {tag.name}
        </button>
      ))}
      {tags.length > 2 && (
        <button
          type="button"
          className="req-tag req-tag--more"
          title={tags.slice(2).map((tg: any) => tg.name).join('、')}
          onClick={(e) => { e.stopPropagation(); pop.toggle(); }}
        >
          +{tags.length - 2}
        </button>
      )}
      {tags.length === 0 && (
        <button
          type="button"
          className="req-tag req-tag--add"
          title={t('projects:tagSelect.addTitle')}
          onClick={(e) => { e.stopPropagation(); pop.toggle(); }}
        >
          +
        </button>
      )}
      <button
        type="button"
        data-testid="tags-edit-btn"
        className="req-pencil req-pencil--act"
        title={t('projects:tagSelect.hint')}
        onClick={(e) => { e.stopPropagation(); pop.toggle(); }}
        aria-label={t('projects:tagSelect.hint')}
      >
        <Pencil size={10} aria-hidden />
      </button>
      {pop.open && (
        <div className="lc-popover cell-pop tags-pop" data-testid="tags-popover" style={pop.style}>
          <div className="lc-popover-title">{t('projects:tagSelect.title')}</div>
          <div className="cell-pop-search">
            <Search size={12} aria-hidden />
            <input
              value={q}
              placeholder={t('projects:tagSelect.searchPlaceholder')}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="cell-pop-list">
            {visible.map((tg) => {
              const active = currentIds.has(String(tg.id));
              return (
                <button
                  key={tg.id}
                  type="button"
                  className={`cell-pop-item ${active ? 'cell-pop-item--active' : ''}`}
                  onClick={() => toggle(tg.id)}
                >
                  <span className="cell-pop-tagdot" style={{ background: tg.color || 'var(--text-secondary)' }} />
                  <span className="cell-pop-item-label">{tg.name}</span>
                  <span className="cell-pop-item-meta">{t('projects:tagSelect.usageCount', { count: tg.project_count ?? 0 })}</span>
                  {active && <Check size={13} className="cell-pop-check" />}
                </button>
              );
            })}
            {visible.length === 0 && <div className="cell-pop-empty">{t('projects:tagSelect.empty')}</div>}
          </div>
          <div className="cell-pop-new">
            <input
              value={draftName}
              placeholder={t('projects:tagSelect.newPlaceholder')}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createAndAdd()}
            />
            <button
              type="button"
              className="cell-pop-new-btn"
              disabled={busy || !draftName.trim()}
              title={t('projects:tagSelect.newAdd')}
              onClick={createAndAdd}
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
      )}
    </span>
  );
}

/** 所属组件: 自由文本 combobox(列出已有值+可输入新值),与版本字段同款裁决 */
export function ComponentCell({
  project,
  options,
  onSaved
}: {
  project: any;
  options: string[];
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const pop = useCellPopover('component-pop', 262, 320);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const value = String(project.component ?? '').trim();

  const commit = async (v: string) => {
    pop.setOpen(false);
    if (v === value) return;
    setBusy(true);
    try {
      await api.projects.update(project.id, { component: v || null });
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  const needle = draft.trim().toLowerCase();
  const visible = needle
    ? options.filter((c) => c.toLowerCase().includes(needle))
    : options;

  return (
    <span ref={pop.anchorRef} className="req-edit-cell req-edit-cell--component" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        data-testid="component-edit-btn"
        className={`requirements-component-btn req-editable ${value ? '' : 'is-empty'}`}
        disabled={busy}
        title={t('projects:component.hint')}
        onClick={pop.toggle}
      >
        {value || t('projects:component.none')}
      </button>
      <Pencil size={10} className="req-pencil" aria-hidden />
      {pop.open && (
        <div className="lc-popover cell-pop component-pop" data-testid="component-popover" style={pop.style}>
          <div className="lc-popover-title">{t('projects:component.title')}</div>
          <div className="cell-pop-search">
            <Search size={12} aria-hidden />
            <input
              autoFocus
              value={draft}
              placeholder={t('projects:component.searchPlaceholder')}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit(draft.trim());
              }}
            />
          </div>
          <div className="cell-pop-list">
            {visible.map((c) => (
              <button
                key={c}
                type="button"
                className={`cell-pop-item ${c === value ? 'cell-pop-item--active' : ''}`}
                onClick={() => commit(c)}
              >
                <span className="cell-pop-item-label">{c}</span>
                {c === value && <Check size={13} className="cell-pop-check" />}
              </button>
            ))}
            {needle && !visible.some((c) => c === needle) && (
              <button type="button" className="cell-pop-item cell-pop-item--create" onClick={() => commit(needle)}>
                <Plus size={13} />
                <span className="cell-pop-item-label">{needle}</span>
              </button>
            )}
            {!needle && visible.length === 0 && (
              <div className="cell-pop-empty">{t('projects:component.empty')}</div>
            )}
          </div>
          {value && (
            <button type="button" className="cell-pop-item cell-pop-item--danger" onClick={() => commit('')}>
              <X size={13} />
              <span className="cell-pop-item-label">{t('projects:component.clear')}</span>
            </button>
          )}
        </div>
      )}
    </span>
  );
}
