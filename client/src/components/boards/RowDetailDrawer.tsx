import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * U16 行详情侧栏(2026-10-18,IP-06d): 列预设/窄视口下隐藏的字段在此完整承接。
 * 可键盘到达——行内按钮打开,Esc/关闭钮关闭,打开时焦点落关闭钮;只读呈现,
 * 编辑仍在格子与详情页(侧栏不复制编辑态)。字段直读 board-feed 行事实,
 * 无新增请求;告警给全文,不再依赖 title 悬停。
 */
export function RowDetailDrawer({ row, childRows, onClose }: {
  row: Record<string, any>;
  childRows?: Record<string, any>[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

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

  const Field = ({ label, children: content }: { label: string; children: ReactNode }) => (
    <div className="row-detail-field">
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
        <Field label={t('projects:board.colNumber')}>
          {row.external_number || (row.seq_number != null ? `CAP-${row.seq_number}` : '—')}
        </Field>
        <Field label={t('projects:board.filterComponent')}>{row.component || '—'}</Field>
        <Field label={t('projects:board.filterSubtype')}>{row.project_sub_type_name || '—'}</Field>
        <Field label={t('projects:lifecycleColumn')}>
          {row.lifecycle_state ? t(`projects:lifecycle.state.${row.lifecycle_state}`) : '—'}
        </Field>
        <Field label={t('projects:board.colKloc')}>
          {row.estimation_summary?.kloc ?? '—'}
        </Field>
        <Field label={t('projects:board.colEffort')}>
          {row.estimation_summary?.pm ?? '—'}
        </Field>
        <Field label={t('projects:board.colSe')}>{se}</Field>
        <Field label={t('projects:board.colMde')}>{mde}</Field>
        <Field label={t('projects:board.colVersion')}>{row.product_version || '—'}</Field>
        <Field label={t('projects:board.colRelease')}>{row.release_version || '—'}</Field>
        <Field label={t('projects:board.colIteration')}>
          {iter ? `${iter.name}${iter.start_date ? ` (${iter.start_date} → ${iter.end_date ?? '?'})` : ''}` : '—'}
        </Field>
        <Field label={t('projects:board.colPriority')}>{row.priority ?? '—'}</Field>
        <Field label={t('projects:board.colPrimary')}>{primary}</Field>
        <Field label={t('projects:tags.label')}>{tags}</Field>
      </dl>
      {warnings.length > 0 && (
        <div className="row-detail-warnings">
          <div className="row-detail-warnings-title">{t('projects:rowDetail.warnings')}</div>
          <ul>
            {warnings.map((w) => (
              <li key={w}>{t(`projects:lifecycle.warnings.${w}`, { defaultValue: w })}</li>
            ))}
          </ul>
        </div>
      )}
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
