import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { locateFieldOf } from '../../lib/warningActions';

/**
 * U16 行详情侧栏(2026-10-18,IP-06d): 列预设/窄视口下隐藏的字段在此完整承接。
 * 可键盘到达——行内按钮打开,Esc/关闭钮关闭,打开时焦点落关闭钮;只读呈现,
 * 编辑仍在格子与详情页(侧栏不复制编辑态)。字段直读 board-feed 行事实,
 * 无新增请求;告警给全文,不再依赖 title 悬停。
 *
 * U17(2026-10-18 第四批): 告警区升格为问题面板——每码一张卡片:
 * 原因(既有全文)/排产影响/推荐动作 + 对应字段定位(字段卡高亮) +
 * “只看同类问题”(回调宿主设筛选)。卡片内容是建议,不是生命周期门禁。
 */
export function RowDetailDrawer({ row, childRows, focusSection, onClose, onFilterWarning }: {
  row: Record<string, any>;
  childRows?: Record<string, any>[];
  /** 'warnings' = 由告警 chip 进入,滚动聚焦告警区 */
  focusSection?: 'warnings' | null;
  onClose: () => void;
  onFilterWarning?: (code: string) => void;
}) {
  const { t } = useTranslation();
  const closeRef = useRef<HTMLButtonElement>(null);
  const warnRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    if (focusSection === 'warnings' && warnRef.current) {
      warnRef.current.scrollIntoView?.({ block: 'start' }); // jsdom 无此 API,可选调用
    }
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, focusSection]);

  const warnings: string[] = Array.isArray(row.lifecycle_warnings) ? row.lifecycle_warnings : [];
  const iter = row.iteration;
  const se = row.se_assignment
    ? `${row.se_assignment.person_name} · ${row.se_assignment.allocation_pct}%`
    : (row.design_estimates?.se != null ? `${t('projects:rowDetail.estimateOnly')} ${row.design_estimates.se}pm` : '—');
  const mde = row.mde_assignment
    ? `${row.mde_assignment.person_name} · ${row.mde_assignment.allocation_pct}%`
    : (row.design_estimates?.mde != null ? `${t('projects:rowDetail.estimateOnly')} ${row.design_estimates.mde}pm` : '—');
  const primary = row.primary_dev
    ? `${row.primary_dev.person_name}${row.primary_dev.end_date ? ` → ${String(row.primary_dev.end_date).slice(0, 10)}` : ''}`
    : '—';
  const tags = (row.tags ?? []).map((tag: any) => tag.name).join('、') || '—';
  /** U17: 当前行告警的定位字段集合——字段卡高亮即“定位对应字段” */
  const locateFields = new Set(warnings.map((w) => locateFieldOf(w)).filter(Boolean) as string[]);

  const Field = ({ fieldKey, label, children: content }: { fieldKey: string; label: string; children: ReactNode }) => (
    <div
      data-field={fieldKey}
      className={`row-detail-field${locateFields.has(fieldKey) ? ' row-detail-field--locate' : ''}`}
    >
      <dt>{label}</dt>
      <dd>{content}</dd>
    </div>
  );

  return createPortal(
    <aside
      data-testid="row-detail-drawer"
      className="row-detail-drawer"
      role="dialog"
      aria-label={t('projects:rowDetail.title', { name: row.name })}
    >
      <div className="row-detail-head">
        <strong className="row-detail-title">{row.name}</strong>
        <button
          type="button"
          ref={closeRef}
          className="req-icon-btn"
          title={t('projects:rowDetail.close')}
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>
      <dl className="row-detail-fields">
        <Field fieldKey="number" label={t('projects:board.colNumber')}>
          {row.external_number || (row.seq_number != null ? `CAP-${row.seq_number}` : '—')}
        </Field>
        <Field fieldKey="component" label={t('projects:board.filterComponent')}>{row.component || '—'}</Field>
        <Field fieldKey="subtype" label={t('projects:board.filterSubtype')}>{row.project_sub_type_name || '—'}</Field>
        <Field fieldKey="lifecycle" label={t('projects:lifecycleColumn')}>
          {row.lifecycle_state ? t(`projects:lifecycle.state.${row.lifecycle_state}`) : '—'}
        </Field>
        <Field fieldKey="kloc" label={t('projects:board.colKloc')}>
          {row.estimation_summary?.kloc ?? '—'}
        </Field>
        <Field fieldKey="effort" label={t('projects:board.colEffort')}>
          {row.estimation_summary?.pm ?? '—'}
        </Field>
        <Field fieldKey="se" label={t('projects:board.colSe')}>{se}</Field>
        <Field fieldKey="mde" label={t('projects:board.colMde')}>{mde}</Field>
        <Field fieldKey="version" label={t('projects:board.colVersion')}>{row.product_version || '—'}</Field>
        <Field fieldKey="release" label={t('projects:board.colRelease')}>{row.release_version || '—'}</Field>
        <Field fieldKey="iter" label={t('projects:board.colIteration')}>
          {iter ? `${iter.name}${iter.start_date ? ` (${iter.start_date} → ${iter.end_date ?? '?'})` : ''}` : '—'}
        </Field>
        <Field fieldKey="priority" label={t('projects:board.colPriority')}>{row.priority ?? '—'}</Field>
        <Field fieldKey="primary" label={t('projects:board.colPrimary')}>{primary}</Field>
        <Field fieldKey="tags" label={t('projects:tags.label')}>{tags}</Field>
      </dl>
      <div ref={warnRef} data-warn-section className="row-detail-warnings">
        <div className="row-detail-warnings-title">{t('projects:rowDetail.warnings')}</div>
        {warnings.length === 0 && <div className="row-detail-warn-empty">{t('projects:rowDetail.noWarnings')}</div>}
        {warnings.map((w) => (
          <div key={w} className="row-detail-warn-card">
            <div className="row-detail-warn-cause">{t(`projects:lifecycle.warnings.${w}`, { defaultValue: w })}</div>
            <div className="row-detail-warn-impact">
              <span className="row-detail-warn-k">{t('projects:rowDetail.impact')}</span>
              {t(`projects:lifecycle.warningImpact.${w}`, { defaultValue: '' })}
            </div>
            <div className="row-detail-warn-action">
              <span className="row-detail-warn-k">{t('projects:rowDetail.action')}</span>
              {t(`projects:lifecycle.warningAction.${w}`, { defaultValue: '' })}
            </div>
            <div className="row-detail-warn-ops">
              {locateFieldOf(w) && (
                <span className="row-detail-warn-locate">{t('projects:rowDetail.locateField')}: {t(`projects:rowDetail.fieldName.${locateFieldOf(w)}`, { defaultValue: locateFieldOf(w) })}</span>
              )}
              {onFilterWarning && (
                <button type="button" data-testid="filter-same-warn" className="board-ghost-btn" onClick={() => onFilterWarning(w)}>
                  {t('projects:rowDetail.filterSame')}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {childRows && childRows.length > 0 && (
        <div className="row-detail-children">
          <div className="row-detail-children-title">
            {t('projects:rowDetail.children', { count: childRows.length })}
          </div>
          <ul>
            {childRows.map((c) => (
              <li key={c.id}>{c.name}</li>
            ))}
          </ul>
        </div>
      )}
    </aside>,
    document.body
  );
}
