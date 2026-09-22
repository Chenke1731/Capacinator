import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import { queryKeys } from '../../lib/queryKeys';
import { useCellPopover } from '../../hooks/useCellPopover';

/**
 * 看板新格件(BOARD_REDESIGN_2026-09-23,实施日志 D2):
 * 评估链三格(代码规模 KLOC / 人力·评估人月 / SE·MDE 人+粗估)与
 * 实名投入格。B3a 阶段为白板化只读;交互(弹层/就地编辑)在 B3c-B3e 逐步点亮。
 *
 * 排版契约: 值=12.5 mono/主色 或 姓名+值; 注记=11/次色; SR 行由页面侧
 * 传入聚合值(只读,设计 §1)。
 */

/** 代码规模: 最新评估换算 KLOC,只读(评估在详情页) */
export function KlocCell({ kloc }: { kloc: number | null }) {
  const { t } = useTranslation();
  if (kloc == null) return <span className="req-kloc req-kloc--empty">{t('projects:scale.empty')}</span>;
  return (
    <span className="req-kloc" title={t('projects:scale.tooltip')}>
      <span className="req-kloc-num">{kloc}K</span>
    </span>
  );
}

/** 人力: 评估开发人月(设计 §0.3——人月给事,开发侧总量) */
export function EffortCell({ pm }: { pm: number | null }) {
  const { t } = useTranslation();
  return (
    <span className="req-effort" title={t('projects:effort.tooltip')}>
      {pm != null ? <span className="req-effort-num">{pm}</span> : <span className="text-muted">—</span>}
    </span>
  );
}

/** SE/MDE 格: `王工 0.5`(人 primary + 粗估人月 mono 次色,设计 §5)。
    B3a 白板只读;B3d 点亮弹层(推导式/负载警示/占用%)。 */
export function RoleCell({
  roleName, person, pm, title
}: { roleName: string; person: { person_name: string; allocation_pct: number } | null; pm: number | null; title?: string }) {
  return (
    <span className={`req-role req-role--${roleName}`} title={title ?? `${roleName} 投入`}>
      {person ? (
        <>
          <span className="req-role-person">{person.person_name}</span>
          {pm != null && <span className="req-role-pm">{pm}</span>}
        </>
      ) : (
        <span className="text-muted">—</span>
      )}
    </span>
  );
}

/** 实名投入: 主投入开发 + 投入窗口(设计 §4);B3e 点亮弹层 */
export function PrimaryDevCell({
  primary
}: { primary: { person_name: string; start_date: string | null; end_date: string | null } | null }) {
  const { t } = useTranslation();
  const fmt = (d: string | null) => (d ? String(d).slice(5) : '');
  return (
    <span className="req-primary" title={t('projects:primaryDev.hint')}>
      {primary ? (
        <>
          <span className="req-primary-person">{primary.person_name}</span>
          {primary.start_date && (
            <span className="req-primary-window">
              {fmt(primary.start_date)}{primary.end_date ? `~${fmt(primary.end_date)}` : '~'}
            </span>
          )}
        </>
      ) : (
        <span className="text-muted">{t('projects:primaryDev.none')}</span>
      )}
    </span>
  );
}

/** 版本/交付计划各自内联可编辑(两列); onSaved 回报字段与新值供跳组高亮 */
export function VersionPart({ project, field, placeholder, hint, onSaved }: {
  project: any;
  field: 'product_version' | 'release_version';
  placeholder: string;
  /** title 用长文案;placeholder 只管显示(交付列占位改"—"后 title 仍需语义,P9) */
  hint: string;
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
        style={{ width: '100%' }}
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
    <span className={`req-edit-cell req-edit-cell--${field === 'release_version' ? 'release' : 'version'}`} onClick={(e) => e.stopPropagation()}>
      <button type="button" className="projects-version-part projects-version-part--single"
              title={hint}
              onClick={() => { setDraft(value); setEditing(true); }}>
        {value || <span className="text-muted">{placeholder}</span>}
      </button>
      <Pencil size={10} className="req-pencil" aria-hidden />
    </span>
  );
}


/** 交付计划复合格(B3c,设计 §3): 主行=RP(可编辑), 尾行=迭代窗口(派生唯一日期真相)。
    实施日志 D9: 列宽 76-84px 装不下"名+区间",尾行只显区间(mono 11px),
    全名进 title 与弹层;点击尾行=迭代选择弹层(按季度分组/解除挂接/内联新建)。 */
export function ReleaseCell({ project, onSaved, readOnlyWindow }: {
  project: any;
  onSaved: (field: 'product_version' | 'release_version', value: string | null) => void;
  /** SR 聚合行: 子行迭代窗口 min~max(派生只读) */
  readOnlyWindow?: { start: string; end: string; names: string[] } | null;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const pop = useCellPopover('iter-pop', 264, 340);
  const [newName, setNewName] = useState('');
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: itersResp } = useQuery({
    queryKey: ['iterations', 'list'],
    queryFn: async () => (await api.iterations.list()).data,
    enabled: pop.open
  });
  const iterations: any[] = Array.isArray(itersResp) ? itersResp : (itersResp?.data ?? []);

  const attach = useMutation({
    mutationFn: (iterationId: string | null) =>
      api.projects.update(project.id, { iteration_id: iterationId } as any),
    onSuccess: () => {
      pop.setOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      onSaved('release_version', null);
    }
  });

  const createAndAttach = async () => {
    if (!newName.trim() || !newStart || !newEnd) return;
    setBusy(true);
    try {
      const res: any = await api.iterations.create({ name: newName.trim(), start_date: newStart, end_date: newEnd });
      const id = res?.data?.id ?? res?.id;
      if (id) await attach.mutateAsync(id);
      setNewName(''); setNewStart(''); setNewEnd('');
    } finally { setBusy(false); }
  };

  const fmt = (d: string) => String(d).slice(5);
  const it = project.iteration;

  return (
    <span ref={pop.anchorRef} className="req-release" onClick={(e) => e.stopPropagation()}>
      <VersionPart project={project} field="release_version"
        placeholder={t('projects:version.releasePlaceholder')} hint={t('projects:version.releaseTitle')}
        onSaved={onSaved} />
      {readOnlyWindow ? (
        <span className="req-release-iter" title={readOnlyWindow.names.join('、')}>
          {fmt(readOnlyWindow.start)}~{fmt(readOnlyWindow.end)}
        </span>
      ) : (
        <button
          type="button"
          className={`req-release-iter ${it ? '' : 'req-release-iter--empty'}`}
          title={it ? `${it.name} · ${it.start_date}~${it.end_date}` : t('projects:iteration.pickHint')}
          onClick={pop.toggle}
        >
          {it ? `${fmt(it.start_date)}~${fmt(it.end_date)}` : t('projects:iteration.unscheduled')}
        </button>
      )}

      {pop.open && (
        <div className="lc-popover iter-pop" style={pop.style}>
          <div className="lc-popover-title">{t('projects:iteration.pickTitle')}</div>
          <div className="iter-pop-list">
            {iterations.length === 0 && <div className="lc-popover-hint">{t('projects:iteration.empty')}</div>}
            {iterations.map((iter2) => (
              <button
                key={iter2.id}
                type="button"
                className={`iter-pop-item ${project.iteration_id === iter2.id ? 'iter-pop-item--active' : ''}`}
                disabled={attach.isPending}
                onClick={() => attach.mutate(iter2.id)}
              >
                <span className="iter-pop-quarter">{iter2.quarter}</span>
                <span className="iter-pop-name">{iter2.name}</span>
                <span className="iter-pop-window">{fmt(iter2.start_date)}~{fmt(iter2.end_date)}</span>
                {iter2.stats && <span className="iter-pop-count">{iter2.stats.item_count}{t('projects:iteration.itemUnit')}</span>}
              </button>
            ))}
            {it && (
              <button type="button" className="iter-pop-item iter-pop-item--detach" disabled={attach.isPending}
                      onClick={() => attach.mutate(null)}>
                {t('projects:iteration.detach')}
              </button>
            )}
          </div>
          <div className="lc-popover-title">{t('projects:iteration.createTitle')}</div>
          <div className="lc-popover-form iter-pop-create">
            <input placeholder={t('projects:iteration.namePlaceholder')} value={newName}
                   onChange={(e) => setNewName(e.target.value)} />
            <div className="iter-pop-dates">
              <input type="date" value={newStart} onChange={(e) => setNewStart(e.target.value)} />
              <span>~</span>
              <input type="date" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} />
            </div>
            <button type="button" className="board-primary-btn iter-pop-create-btn"
                    disabled={busy || !newName.trim() || !newStart || !newEnd}
                    onClick={createAndAttach}>
              {t('projects:iteration.createAndAttach')}
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
