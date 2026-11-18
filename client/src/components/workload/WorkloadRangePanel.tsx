import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { shiftIsoMonths } from '../../lib/batchShift';
import {
  validateWorkloadRange,
  type WorkloadRangeError,
} from '../../lib/workloadRange';
import { IsoDateInput } from '../ui/iso-date-input';
import { ImeSafeForm } from '../ui/ime-safe-form';
import { normalizeIsoDateInput } from '../../lib/isoDate';
import {
  clampViewMonth,
  monthFirstIso,
  monthKeyOf,
  monthLastIso,
} from '../../lib/workloadRangeCalendar';
import {
  WorkloadRangeCalendar,
  type WorkloadRangeAnchor,
} from './WorkloadRangeCalendar';

export interface WorkloadRangePanelProps {
  id: string;
  rangeStart: string;
  rangeEnd: string;
  asOf: string;
  isCustom: boolean;
  onApply: (start: string, end: string) => void;
  onReset: () => void;
  onClose: () => void;
}

const ERROR_KEYS: Record<WorkloadRangeError, string> = {
  'invalid-start': 'assignments:workbench.gantt.range.invalidStart',
  'invalid-end': 'assignments:workbench.gantt.range.invalidEnd',
  'invalid-order': 'assignments:workbench.gantt.range.invalidOrder',
  'too-long': 'assignments:workbench.gantt.range.tooLong',
};

export function WorkloadRangePanel({
  id,
  rangeStart,
  rangeEnd,
  asOf,
  isCustom,
  onApply,
  onReset,
  onClose,
}: WorkloadRangePanelProps) {
  const { t } = useTranslation(['assignments', 'common']);
  const [start, setStart] = useState(rangeStart);
  const [end, setEnd] = useState(rangeEnd);
  const [error, setError] = useState<WorkloadRangeError | null>(null);
  const [viewMonth, setViewMonth] = useState(() => clampViewMonth(monthKeyOf(rangeStart)));
  const [anchor, setAnchor] = useState<WorkloadRangeAnchor | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const autoPresetRef = useRef<HTMLButtonElement>(null);

  // Applied range changed externally (preset/minimap/locate) → sync the drafts.
  useEffect(() => {
    setStart(rangeStart);
    setEnd(rangeEnd);
    setError(null);
    setAnchor(null);
    setViewMonth(clampViewMonth(monthKeyOf(rangeStart)));
  }, [rangeStart, rangeEnd]);

  useEffect(() => {
    // 预设位于 DOM 首位：聚焦首个预设，正向 Tab 才能覆盖全部控件。
    autoPresetRef.current?.focus();
  }, []);

  const presets = useMemo(
    () => [
      { key: 'last3', start: shiftIsoMonths(asOf, -3), end: asOf },
      { key: 'next3', start: asOf, end: shiftIsoMonths(asOf, 3) },
      { key: 'next6', start: asOf, end: shiftIsoMonths(asOf, 6) },
      { key: 'next12', start: asOf, end: shiftIsoMonths(asOf, 12) },
    ],
    [asOf]
  );

  /**
   * 日历两次点击：第一次候选成为草稿并记住锚点；第二次与锚点取并集。
   * 顺序反置由并集自然处理，日/月候选可混用。
   */
  const selectCandidate = (candidateStart: string, candidateEnd: string) => {
    setError(null);
    if (!anchor) {
      setStart(candidateStart);
      setEnd(candidateEnd);
      setAnchor({ start: candidateStart, end: candidateEnd });
      return;
    }
    setStart(anchor.start < candidateStart ? anchor.start : candidateStart);
    setEnd(anchor.end > candidateEnd ? anchor.end : candidateEnd);
    setAnchor(null);
  };

  const apply = (nextStart: string, nextEnd: string) => {
    setAnchor(null);
    // 接受 2026-12-1 这类自然输入，统一归一成 YYYY-MM-DD 后再校验/应用
    const normalizedStart = normalizeIsoDateInput(nextStart) ?? nextStart;
    const normalizedEnd = normalizeIsoDateInput(nextEnd) ?? nextEnd;
    setStart(normalizedStart);
    setEnd(normalizedEnd);
    const nextError = validateWorkloadRange(normalizedStart, normalizedEnd);
    setError(nextError);
    if (nextError) {
      // IX-2：语义错误提交后把焦点放到首个无效字段，而不是留在提交按钮
      const target =
        nextError === 'invalid-end' ? '#pw-range-end' : '#pw-range-start';
      panelRef.current?.querySelector<HTMLInputElement>(target)?.focus();
      return;
    }
    if (normalizedStart === rangeStart && normalizedEnd === rangeEnd) return;
    onApply(normalizedStart, normalizedEnd);
  };

  /** 预设/自动必须显式同步草稿：重复点击当前项也要把输入恢复为已应用值。 */
  const applyPreset = (presetStart: string, presetEnd: string) => {
    setStart(presetStart);
    setEnd(presetEnd);
    setError(null);
    setAnchor(null);
    setViewMonth(clampViewMonth(monthKeyOf(presetStart)));
    apply(presetStart, presetEnd);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    apply(start, end);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    onClose();
  };

  const presetActive = (presetStart: string, presetEnd: string) =>
    isCustom && rangeStart === presetStart && rangeEnd === presetEnd;

  const outsideAsOf = asOf < rangeStart || asOf > rangeEnd;
  const describedBy = error ? 'pw-range-error pw-range-hint' : 'pw-range-hint';

  return (
    <div
      id={id}
      ref={panelRef}
      className="pw-range-panel"
      role="group"
      aria-label={t('assignments:workbench.gantt.range.panelLabel')}
      data-testid="pw-range-panel"
      onKeyDown={handleKeyDown}
    >
      <ImeSafeForm
        className="pw-range-form"
        noValidate
        onSubmit={handleSubmit}
      >
        <div className="pw-range-presets">
          <button
            ref={autoPresetRef}
            type="button"
            className="btn btn-ghost btn-sm pw-range-preset"
            aria-pressed={!isCustom}
            onClick={() => {
              setStart(rangeStart);
              setEnd(rangeEnd);
              setError(null);
              setAnchor(null);
              setViewMonth(clampViewMonth(monthKeyOf(rangeStart)));
              onReset();
            }}
          >
            {t('assignments:workbench.gantt.range.auto')}
          </button>
          {presets.map((preset) => (
            <button
              key={preset.key}
              type="button"
              className="btn btn-secondary btn-sm pw-range-preset"
              aria-pressed={presetActive(preset.start, preset.end)}
              onClick={() => applyPreset(preset.start, preset.end)}
            >
              {t(`assignments:workbench.gantt.range.${preset.key}`)}
            </button>
          ))}
        </div>

        <WorkloadRangeCalendar
          start={start}
          end={end}
          asOf={asOf}
          viewMonth={viewMonth}
          anchor={anchor}
          onViewMonthChange={(month) => setViewMonth(clampViewMonth(month))}
          onSelectDay={(iso) => selectCandidate(iso, iso)}
          onSelectMonth={(month) =>
            selectCandidate(monthFirstIso(month), monthLastIso(month))
          }
        />

        {error ? (
          <p id="pw-range-error" className="pw-range-error" role="alert">
            {t(ERROR_KEYS[error])}
          </p>
        ) : null}
        <p
          id="pw-range-hint"
          className={`pw-range-hint${outsideAsOf ? ' pw-range-hint--warning' : ''}`}
        >
          {outsideAsOf
            ? t('assignments:workbench.gantt.range.asOfOutside', { date: asOf })
            : t('assignments:workbench.gantt.range.hint', { date: asOf })}
        </p>

        <div className="pw-range-footer" data-testid="pw-range-footer">
          <p
            className="pw-range-selected"
            data-testid="pw-range-selected"
            title={error ? undefined : `${start} ~ ${end}`}
          >
            {error
              ? t('assignments:workbench.gantt.range.selectedInvalid')
              : t('assignments:workbench.gantt.range.selected', { start, end })}
          </p>
          <div className="pw-range-fields">
            <div className="pw-range-field">
              <label htmlFor="pw-range-start">{t('common:startDate')}</label>
              <IsoDateInput
                id="pw-range-start"
                className="pw-range-input"
                value={start}
                onValueChange={(value) => {
                  setStart(value);
                  setAnchor(null);
                  if (error) setError(null);
                }}
                ariaLabel={t('common:startDate')}
                ariaDescribedBy={describedBy}
                invalid={
                  error === 'invalid-start' ||
                  error === 'invalid-order' ||
                  error === 'too-long'
                }
              />
            </div>
            <div className="pw-range-field">
              <label htmlFor="pw-range-end">{t('common:endDate')}</label>
              <IsoDateInput
                id="pw-range-end"
                className="pw-range-input"
                value={end}
                onValueChange={(value) => {
                  setEnd(value);
                  setAnchor(null);
                  if (error) setError(null);
                }}
                ariaLabel={t('common:endDate')}
                ariaDescribedBy={describedBy}
                invalid={
                  error === 'invalid-end' ||
                  error === 'invalid-order' ||
                  error === 'too-long'
                }
              />
            </div>
            <button type="submit" className="btn btn-primary btn-sm pw-range-apply">
              {t('assignments:workbench.gantt.range.apply')}
            </button>
          </div>
        </div>
      </ImeSafeForm>
    </div>
  );
}
