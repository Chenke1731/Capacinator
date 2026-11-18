import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { shiftIsoMonths } from '../../lib/batchShift';
import {
  validateWorkloadRange,
  type WorkloadRangeError,
} from '../../lib/workloadRange';
import { IsoDateInput } from '../ui/iso-date-input';
import { ImeSafeForm } from '../ui/ime-safe-form';

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
  const panelRef = useRef<HTMLDivElement>(null);
  const autoPresetRef = useRef<HTMLButtonElement>(null);

  // Applied range changed externally (preset/minimap/locate) → sync the drafts.
  useEffect(() => {
    setStart(rangeStart);
    setEnd(rangeEnd);
    setError(null);
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
      { key: 'next24', start: asOf, end: shiftIsoMonths(asOf, 24) },
    ],
    [asOf]
  );

  const apply = (nextStart: string, nextEnd: string) => {
    const nextError = validateWorkloadRange(nextStart, nextEnd);
    setError(nextError);
    if (nextError) {
      // IX-2：语义错误提交后把焦点放到首个无效字段，而不是留在提交按钮
      const target =
        nextError === 'invalid-end' ? '#pw-range-end' : '#pw-range-start';
      panelRef.current?.querySelector<HTMLInputElement>(target)?.focus();
      return;
    }
    if (nextStart === rangeStart && nextEnd === rangeEnd) return;
    onApply(nextStart, nextEnd);
  };

  /** 预设/自动必须显式同步草稿：重复点击当前项也要把输入恢复为已应用值。 */
  const applyPreset = (presetStart: string, presetEnd: string) => {
    setStart(presetStart);
    setEnd(presetEnd);
    setError(null);
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

        <div className="pw-range-fields">
          <div className="pw-range-field">
            <label htmlFor="pw-range-start">{t('common:startDate')}</label>
            <IsoDateInput
              id="pw-range-start"
              className="pw-range-input"
              value={start}
              onValueChange={(value) => {
                setStart(value);
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
      </ImeSafeForm>
    </div>
  );
}
