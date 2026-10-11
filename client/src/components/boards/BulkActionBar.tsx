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
}

/** 触发按钮 + 锚定气泡骨架(children 收 close 用于应用后收起) */
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
  const pop = useCellPopover(popClass, width, height);
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

export function BulkActionBar({ count, pending, onClear, onBatchUpdate, onBatchDelete, allTags, tagsOnSelection }: BulkActionBarProps) {
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
      <span className="req-bulk-count">{t('projects:board.bulkSelected', { n: count })}</span>

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
          {(close) => <VersionForm n={count} onApply={(v) => apply({ [field]: v }, close)} />}
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
            <button type="button" className="cell-pop-item" onClick={() => apply({ iteration_id: null }, close)}>
              <X size={13} />
              <span className="cell-pop-item-label">{t('projects:board.bulkIterDetach')}</span>
            </button>
            {iterations.length === 0 && (
              <div className="bulk-pop-empty">{t('projects:board.bulkIterNone')}</div>
            )}
            {iterations.map((it: any) => (
              <button key={it.id} type="button" className="cell-pop-item"
                      onClick={() => apply({ iteration_id: it.id }, close)}>
                <span className="cell-pop-item-label">{it.name}</span>
                <span className="bulk-pop-window">
                  {String(it.start_date ?? '').slice(5)}~{String(it.end_date ?? '').slice(5)}
                </span>
              </button>
            ))}
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
        {confirmingDelete ? t('projects:board.bulkDeleteConfirm', { n: count }) : t('projects:board.bulkDelete')}
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
function VersionForm({ n, onApply }: { n: number; onApply: (v: string | null) => void }) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const trimmed = value.trim();
  return (
    <div className="bulk-version-form">
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
