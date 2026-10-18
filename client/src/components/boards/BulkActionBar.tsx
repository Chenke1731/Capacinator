import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Check, Minus, Plus, X } from 'lucide-react';
import { PopoverPortal } from '../PopoverPortal';
import { useCellPopover } from '../../hooks/useCellPopover';
import { api } from '../../lib/api-client';

/**
 * 需求台批量操作条(2026-10-11): 选中>0 时底部浮动。
 * 交互词汇与行内编辑同族(useCellPopover 锚定气泡,选中即存);
 * 删除=二次点击确认(按钮变形 3 秒回退); pending 期间全禁用防双发。
 * 操作语义(统一闭包): 勾 SR=整棵子树,条上计数=实际作用行数;
 * 设迭代跳过有子行的 SR 行(其迭代列是子行聚合只读窗)。
 */

type BulkPatch = Record<string, unknown>;

interface BulkActionBarProps {
  count: number;
  pending: boolean;
  onClear: () => void;
  onBatchUpdate: (patch: BulkPatch) => unknown;
  onBatchDelete: () => unknown;
  allTags: Array<{ id: string | number; name: string; color_code?: string | null }>;
  tagsOnSelection: Set<string>;
  /** U18 批量选择可见性: 可见/隐藏计数 + 选中行原文 + 定位/清隐藏回调 */
  visibleCount: number;
  selectionRows: Array<Record<string, any>>;
  visibleIds: Set<string>;
  onClearHidden: () => void;
  onLocate: (id: string) => void;
}

/** 触发按钮 + 锚定气泡骨架(children 收 close 用于应用后收起)。
    dock:'above'=底边贴锚上翻: 批量条贴屏底,气泡在条上方贴合出现,
    不再经 top 钳位公式悬空(2026-10-11 位置断链/遮挡修复)。 */
function BarPop({ popClass, width, height, label, title, disabled, children, testId }: {
  popClass: string;
  width: number;
  height: number;
  label: string;
  title: string;
  disabled?: boolean;
  children: (close: () => void) => React.ReactNode;
  testId: string;
}) {
  const pop = useCellPopover(popClass, width, height, { dock: 'above' });
  return (
    <span ref={pop.anchorRef} className="req-bulk-anchor">
      <button
        type="button"
        data-testid={testId}
        className="req-bulk-btn"
        disabled={disabled}
        onClick={pop.toggle}
      >
        {label}
      </button>
      {pop.open && (
        <PopoverPortal>
          <div className={`lc-popover cell-pop ${popClass}`} style={pop.style} data-testid={`${testId}-popover`}>
            <div className="lc-popover-title">{title}</div>
            {children(() => pop.setOpen(false))}
          </div>
        </PopoverPortal>
      )}
    </span>
  );
}

const PRIORITY_LABELS = ['highest', 'high', 'medium', 'low', 'lowest'] as const;

export function BulkActionBar({ count, pending, onClear, onBatchUpdate, onBatchDelete, allTags, tagsOnSelection, visibleCount, selectionRows, visibleIds, onClearHidden, onLocate }: BulkActionBarProps) {
  const { t } = useTranslation();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  useEffect(() => {
    if (!confirmingDelete) return;
    const id = window.setTimeout(() => setConfirmingDelete(false), 3000);
    return () => window.clearTimeout(id);
  }, [confirmingDelete]);

  const { data: itersResp } = useQuery({
    queryKey: ['iterations', 'list'],
    queryFn: async () => (await api.iterations.list()).data
  });
  const iterations: any[] = Array.isArray(itersResp) ? itersResp : (itersResp?.data ?? []);

  // ── U18 选择可见性/预检事实(全部由选中行原文现算,不加请求) ──
  const hiddenCount = Math.max(0, count - visibleCount);
  const srCount = selectionRows.filter((r) => !r.parent_id).length;
  const arCount = selectionRows.filter((r) => r.parent_id).length;
  // 有子行的 SR(迭代列=子行聚合只读窗,挂迭代被服务端跳过)
  const childParentIds = new Set(selectionRows.filter((r) => r.parent_id).map((r) => r.parent_id));
  const iterSkipSr = selectionRows.filter((r) => !r.parent_id && childParentIds.has(r.id)).length;
  const valueDist = (field: 'product_version' | 'release_version') => {
    const m = new Map<string, number>();
    for (const r of selectionRows) {
      const v = String(r[field] ?? '').trim() || '∅';
      m.set(v, (m.get(v) ?? 0) + 1);
    }
    return [...m.entries()].map(([value, c]) => ({ value, count: c }));
  };
  const hasValueCount = (field: 'product_version' | 'release_version') =>
    selectionRows.filter((r) => String(r[field] ?? '').trim() !== '').length;
  /** 可计算冲突摘要: 该迭代窗口下,主投入越窗数 + RP 节拍不符数(行内事实现算) */
  const iterConflicts = (it: any) => {
    let late = 0;
    let rhythm = 0;
    const end = String(it.end_date ?? '');
    const startD = it.start_date ? new Date(String(it.start_date) + 'T00:00:00') : null;
    const quarter = startD ? `${String(startD.getFullYear()).slice(2)}.RP${Math.floor(startD.getMonth() / 3) + 1}` : null;
    for (const r of selectionRows) {
      if (end && r.primary_dev?.end_date && String(r.primary_dev.end_date).slice(0, 10) > end) late += 1;
      if (quarter && String(r.release_version ?? '').trim() && String(r.release_version).trim() !== quarter) rhythm += 1;
    }
    return { late, rhythm };
  };

  const apply = (patch: BulkPatch, close: () => void) => {
    close();
    onBatchUpdate(patch);
  };

  const doDelete = () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setConfirmingDelete(false);
    onBatchDelete();
  };

  return (
    <div className="req-bulk-bar" data-testid="req-bulk-bar">
      <span className="req-bulk-count">
        {t('projects:board.bulkSelected', { n: count })}
        {hiddenCount > 0 && (
          <span className="req-bulk-sub"> {t('projects:board.bulkVisibility', { v: visibleCount, h: hiddenCount })}</span>
        )}
      </span>
      {hiddenCount > 0 && (
        <button type="button" data-testid="bulk-clear-hidden" className="req-bulk-btn req-bulk-btn--ghost"
                title={t('projects:board.bulkClearHiddenTitle')} onClick={onClearHidden}>
          {t('projects:board.bulkClearHidden', { n: hiddenCount })}
        </button>
      )}

      <BarPop popClass="bulk-pri-pop" width={200} height={260} testId="bulk-priority-btn"
              label={t('projects:board.bulkPriority')} title={t('projects:prioritySelect.title')} disabled={pending}>
        {(close) => (
          <div className="cell-pop-list">
            {[1, 2, 3, 4, 5].map((p) => (
              <button key={p} type="button" className="cell-pop-item"
                      onClick={() => apply({ priority: p }, close)}>
                <span className={`req-pri req-pri--${p}`}>P{p}</span>
                <span className="cell-pop-item-label">{t(`projects:priorityLevel.${PRIORITY_LABELS[p - 1]}`)}</span>
              </button>
            ))}
          </div>
        )}
      </BarPop>

      {(['product_version', 'release_version'] as const).map((field) => (
        <BarPop key={field} popClass={field === 'product_version' ? 'bulk-pv-pop' : 'bulk-rv-pop'}
                width={240} height={150} testId={`bulk-${field}-btn`}
                label={field === 'product_version' ? t('projects:board.bulkProductVersion') : t('projects:board.bulkReleaseVersion')}
                title={field === 'product_version' ? t('projects:version.productTitle') : t('projects:version.releaseTitle')}
                disabled={pending}>
          {(close) => <VersionForm n={count} dist={valueDist(field)} existing={hasValueCount(field)}
                                  onApply={(v) => apply({ [field]: v }, close)} />}
        </BarPop>
      ))}

      <BarPop popClass="bulk-tag-pop" width={280} height={340} testId="bulk-tags-btn"
              label={t('projects:board.bulkTags')} title={t('projects:board.bulkTagTitle')} disabled={pending}>
        {(close) => (
          <TagsForm n={count} allTags={allTags} tagsOnSelection={tagsOnSelection}
                    onApply={(add, remove) => apply({ add_tag_ids: add, remove_tag_ids: remove }, close)} />
        )}
      </BarPop>

      <BarPop popClass="bulk-iter-pop" width={260} height={320} testId="bulk-iteration-btn"
              label={t('projects:board.bulkIteration')} title={t('projects:board.colIteration')} disabled={pending}>
        {(close) => (
          <div className="cell-pop-list">
            <div className="bulk-iter-facts" data-testid="bulk-iter-facts">
              {t('projects:board.bulkIterFacts', { sr: srCount, ar: arCount, skip: iterSkipSr })}
            </div>
            <button type="button" className="cell-pop-item" onClick={() => apply({ iteration_id: null }, close)}>
              <X size={13} />
              <span className="cell-pop-item-label">{t('projects:board.bulkIterDetach')}</span>
            </button>
            {iterations.length === 0 && (
              <div className="bulk-pop-empty">{t('projects:board.bulkIterNone')}</div>
            )}
            {iterations.map((it: any) => {
              const { late, rhythm } = iterConflicts(it);
              const warn = late + rhythm;
              return (
                <button key={it.id} type="button" className="cell-pop-item"
                        onClick={() => apply({ iteration_id: it.id }, close)}>
                  <span className="cell-pop-item-label">{it.name}</span>
                  <span className="bulk-pop-window">
                    {String(it.start_date ?? '').slice(5)}~{String(it.end_date ?? '').slice(5)}
                  </span>
                  {warn > 0 && (
                    <span className="bulk-iter-warn" title={
                      t('projects:board.bulkIterWarnLate', { n: late }) + ' / ' + t('projects:board.bulkIterWarnRhythm', { n: rhythm })
                    }>⚠{warn}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </BarPop>

      <BarPop popClass="bulk-roster-pop" width={300} height={340} testId="bulk-roster-btn"
              label={t('projects:board.bulkRoster', { n: count })} title={t('projects:board.bulkRosterTitle')} disabled={pending}>
        {(close) => (
          <div className="bulk-roster-list">
            {selectionRows.map((r) => {
              const hidden = !visibleIds.has(String(r.id));
              return (
                <button key={String(r.id)} type="button"
                        className={`bulk-roster-item ${hidden ? 'bulk-roster-item--hidden' : ''}`}
                        title={hidden ? t('projects:board.bulkRosterLocateHidden') : undefined}
                        onClick={() => { onLocate(String(r.id)); close(); }}>
                  <span className="bulk-roster-kind">{r.parent_id ? 'AR' : 'SR'}</span>
                  <span className="bulk-roster-name">{r.name}</span>
                  {hidden && <span className="bulk-roster-flag">{t('projects:board.bulkRosterHidden')}</span>}
                </button>
              );
            })}
          </div>
        )}
      </BarPop>

      <span className="req-bulk-divider" />

      <button
        type="button"
        data-testid="bulk-delete-btn"
        className={`req-bulk-btn req-bulk-btn--danger ${confirmingDelete ? 'req-bulk-btn--confirm' : ''}`}
        disabled={pending}
        onClick={doDelete}
      >
        {confirmingDelete
          ? t('projects:board.bulkDeleteConfirmBreakdown', { n: count, sr: srCount, ar: arCount })
          : t('projects:board.bulkDelete')}
      </button>
      <button
        type="button"
        className="req-bulk-btn req-bulk-btn--close"
        onClick={onClear}
        title={t('projects:board.bulkClearSelection')}
        aria-label={t('projects:board.bulkClearSelection')}
      >
        <X size={14} />
      </button>
    </div>
  );
}

/** 版本输入: 空输入=清空(按钮文案显式标注后果后仍一步执行——准破坏性可见) */
function VersionForm({ n, dist, existing, onApply }: {
  n: number;
  dist: Array<{ value: string; count: number }>;
  existing: number;
  onApply: (v: string | null) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const trimmed = value.trim();
  return (
    <div className="bulk-version-form">
      {/* U18 预检: 选中项当前值分布——覆盖面与清空后果在选择前可见 */}
      <div className="bulk-version-dist">
        {dist.map((d) => (
          <span key={d.value} className="bulk-version-dist-chip">{d.value === '∅' ? t('projects:board.bulkVersionEmpty') : d.value}×{d.count}</span>
        ))}
      </div>
      {trimmed === '' && existing > 0 && (
        <div className="bulk-version-hint">{t('projects:board.bulkClearVersionHint', { n: existing })}</div>
      )}
      <input
        className="inline-edit-input bulk-version-input"
        autoFocus
        value={value}
        placeholder={t('projects:board.bulkVersionPlaceholder')}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && trimmed) onApply(trimmed); }}
      />
      <button
        type="button"
        className={`bulk-apply-btn ${trimmed === '' ? 'bulk-apply-btn--clear' : ''}`}
        onClick={() => onApply(trimmed === '' ? null : trimmed)}
      >
        {trimmed === '' ? t('projects:board.bulkClearVersion', { n }) : t('projects:board.bulkApplyVersion', { n })}
      </button>
    </div>
  );
}

/** 标签两段式: 上半勾选添加 / 下半(选中项已有标签并集)勾选移除,一次应用 */
function TagsForm({ n, allTags, tagsOnSelection, onApply }: {
  n: number;
  allTags: Array<{ id: string | number; name: string }>;
  tagsOnSelection: Set<string>;
  onApply: (add: string[], remove: string[]) => void;
}) {
  const { t } = useTranslation();
  const [add, setAdd] = useState<Set<string>>(new Set());
  const [remove, setRemove] = useState<Set<string>>(new Set());
  const toggle = (set: 'add' | 'remove', id: string) => {
    const setter = set === 'add' ? setAdd : setRemove;
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const removable = allTags.filter((tg) => tagsOnSelection.has(String(tg.id)));
  return (
    <div className="bulk-tags-form">
      <div className="bulk-tags-section">
        <div className="bulk-tags-sec-title"><Plus size={11} />{t('projects:board.bulkTagAddTitle')}</div>
        {allTags.length === 0 && <div className="bulk-pop-empty">{t('projects:board.bulkTagNoTags')}</div>}
        <div className="bulk-tags-chips">
          {allTags.map((tg) => (
            <button key={String(tg.id)} type="button"
                    className={`bulk-tag-chip ${add.has(String(tg.id)) ? 'bulk-tag-chip--on' : ''}`}
                    disabled={remove.has(String(tg.id))}
                    title={remove.has(String(tg.id)) ? t('projects:board.bulkTagConflict') : undefined}
                    onClick={() => toggle('add', String(tg.id))}>
              {add.has(String(tg.id)) && <Check size={10} />}
              {tg.name}
            </button>
          ))}
        </div>
      </div>
      <div className="bulk-tags-section">
        <div className="bulk-tags-sec-title"><Minus size={11} />{t('projects:board.bulkTagRemoveTitle')}</div>
        {removable.length === 0 && <div className="bulk-pop-empty">{t('projects:board.bulkTagNoneOnSelection')}</div>}
        <div className="bulk-tags-chips">
          {removable.map((tg) => (
            <button key={String(tg.id)} type="button"
                    className={`bulk-tag-chip ${remove.has(String(tg.id)) ? 'bulk-tag-chip--off' : ''}`}
                    disabled={add.has(String(tg.id))}
                    title={add.has(String(tg.id)) ? t('projects:board.bulkTagConflict') : undefined}
                    onClick={() => toggle('remove', String(tg.id))}>
              {remove.has(String(tg.id)) && <X size={10} />}
              {tg.name}
            </button>
          ))}
        </div>
      </div>
      <button type="button" className="bulk-apply-btn" disabled={n === 0 || (add.size === 0 && remove.size === 0)}
              onClick={() => onApply([...add], [...remove])}>
        {t('projects:board.bulkApply', { n })}
      </button>
    </div>
  );
}
