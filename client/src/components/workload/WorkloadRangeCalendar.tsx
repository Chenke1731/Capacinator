import { useMemo, useRef, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getLocale } from '../../i18n';
import { shiftIsoDate } from '../../lib/batchShift';
import {
  WORKLOAD_CALENDAR_MAX_VIEW_MONTH,
  WORKLOAD_CALENDAR_MIN_MONTH,
  buildWorkloadMonthGrid,
  monthFirstIso,
  monthLastIso,
  shiftMonthKey,
} from '../../lib/workloadRangeCalendar';
import {
  WORKLOAD_RANGE_MAX_DAYS,
  WORKLOAD_RANGE_MAX_ISO,
  WORKLOAD_RANGE_MIN_ISO,
  workloadRangeDays,
} from '../../lib/workloadRange';

export interface WorkloadRangeAnchor {
  start: string;
  end: string;
}

export interface WorkloadRangeCalendarProps {
  start: string;
  end: string;
  asOf: string;
  viewMonth: string;
  anchor: WorkloadRangeAnchor | null;
  onViewMonthChange: (month: string) => void;
  onSelectDay: (iso: string) => void;
  onSelectMonth: (month: string) => void;
}

const WEEKDAY_ANCHOR_DAY = Date.UTC(2023, 0, 2); // 2023-01-02 是周一

function formatMonthTitle(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString(getLocale(), {
    year: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

function formatDayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(getLocale(), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    timeZone: 'UTC',
  });
}

export function WorkloadRangeCalendar({
  start,
  end,
  asOf,
  viewMonth,
  anchor,
  onViewMonthChange,
  onSelectDay,
  onSelectMonth,
}: WorkloadRangeCalendarProps) {
  const { t } = useTranslation(['assignments']);
  const rootRef = useRef<HTMLDivElement>(null);
  const locale = getLocale();

  const months = useMemo(
    () => [viewMonth, shiftMonthKey(viewMonth, 1)],
    [viewMonth]
  );
  const grids = useMemo(
    () => months.map((month) => ({ month, weeks: buildWorkloadMonthGrid(month) })),
    [months]
  );
  const weekdayLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        new Date(WEEKDAY_ANCHOR_DAY + index * 86_400_000).toLocaleDateString(
          locale,
          { weekday: 'short', timeZone: 'UTC' }
        )
      ),
    [locale]
  );

  // 第二次点击的候选与锚点的并集不能超过 5 年：越界日期/月份直接禁用
  const anchorWindow = useMemo(() => {
    if (!anchor) return null;
    return {
      min: shiftIsoDate(anchor.end, WORKLOAD_RANGE_MAX_DAYS - 1, 'day', 'earlier'),
      max: shiftIsoDate(anchor.start, WORKLOAD_RANGE_MAX_DAYS - 1, 'day', 'later'),
    };
  }, [anchor]);

  const dayDisabled = (month: string, iso: string): boolean => {
    if (iso.slice(0, 7) !== month) return true;
    if (iso < WORKLOAD_RANGE_MIN_ISO || iso > WORKLOAD_RANGE_MAX_ISO) return true;
    if (!anchorWindow) return false;
    return iso < anchorWindow.min || iso > anchorWindow.max;
  };

  const monthDisabled = (month: string): boolean => {
    const first = monthFirstIso(month);
    const last = monthLastIso(month);
    if (first < WORKLOAD_RANGE_MIN_ISO || last > WORKLOAD_RANGE_MAX_ISO) return true;
    if (!anchor) return false;
    const unionStart = first < anchor.start ? first : anchor.start;
    const unionEnd = last > anchor.end ? last : anchor.end;
    const days = workloadRangeDays(unionStart, unionEnd);
    return days === null || days > WORKLOAD_RANGE_MAX_DAYS;
  };

  const dayClasses = (iso: string): string => {
    const classes = ['pw-range-cal-day'];
    if (iso === start) classes.push('pw-range-cal-day--start');
    if (iso === end) classes.push('pw-range-cal-day--end');
    if (iso > start && iso < end) classes.push('pw-range-cal-day--in-range');
    if (iso === asOf) classes.push('pw-range-cal-day--today');
    return classes.join(' ');
  };

  const handleGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const deltas: Record<string, { amount: number; direction: 'earlier' | 'later' }> = {
      ArrowLeft: { amount: 1, direction: 'earlier' },
      ArrowRight: { amount: 1, direction: 'later' },
      ArrowUp: { amount: 7, direction: 'earlier' },
      ArrowDown: { amount: 7, direction: 'later' },
    };
    const delta = deltas[event.key];
    if (!delta) return;
    event.preventDefault();
    const active = event.target as HTMLElement;
    const currentIso = active.closest<HTMLButtonElement>('.pw-range-cal-day')?.dataset.iso;
    if (!currentIso) {
      rootRef.current
        ?.querySelector<HTMLButtonElement>('.pw-range-cal-day:not([disabled])')
        ?.focus();
      return;
    }
    const target = shiftIsoDate(currentIso, delta.amount, 'day', delta.direction);
    const targetButton = rootRef.current?.querySelector<HTMLButtonElement>(
      `[data-iso="${target}"]:not([disabled])`
    );
    targetButton?.focus();
  };

  const prevDisabled = viewMonth <= WORKLOAD_CALENDAR_MIN_MONTH;
  const nextDisabled = viewMonth >= WORKLOAD_CALENDAR_MAX_VIEW_MONTH;
  const dayAriaKey = anchor ? 'daySelectEnd' : 'daySelectStart';

  return (
    <div
      ref={rootRef}
      className="pw-range-calendar"
      role="group"
      aria-label={t('assignments:workbench.gantt.range.calendarLabel')}
      data-testid="pw-range-calendar"
    >
      <div className="pw-range-cal-nav">
        <button
          type="button"
          className="btn btn-ghost btn-sm pw-range-cal-nav-button"
          onClick={() => onViewMonthChange(shiftMonthKey(viewMonth, -1))}
          disabled={prevDisabled}
          aria-label={t('assignments:workbench.gantt.range.prevMonth')}
        >
          <ChevronLeft size={14} aria-hidden="true" />
        </button>
        <div className="pw-range-cal-titles">
          {months.map((month) => {
            const title = formatMonthTitle(month);
            return (
              <button
                key={month}
                type="button"
                className="btn btn-ghost btn-sm pw-range-cal-month"
                onClick={() => onSelectMonth(month)}
                disabled={monthDisabled(month)}
                aria-label={t('assignments:workbench.gantt.range.monthSelect', { month: title })}
                title={t('assignments:workbench.gantt.range.monthSelect', { month: title })}
                data-testid={`pw-range-month-${month}`}
              >
                {title}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm pw-range-cal-nav-button"
          onClick={() => onViewMonthChange(shiftMonthKey(viewMonth, 1))}
          disabled={nextDisabled}
          aria-label={t('assignments:workbench.gantt.range.nextMonth')}
        >
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
      <p className="pw-range-cal-hint">
        {anchor
          ? t('assignments:workbench.gantt.range.calendarHintAnchor', {
              date: anchor.start,
            })
          : t('assignments:workbench.gantt.range.calendarHint')}
      </p>
      <div className="pw-range-cal-months">
        {grids.map(({ month, weeks }) => (
          <div
            key={month}
            className="pw-range-cal-grid"
            role="grid"
            tabIndex={0}
            aria-label={formatMonthTitle(month)}
            onKeyDown={handleGridKeyDown}
            data-month={month}
          >
            <div className="pw-range-cal-weekdays" role="row">
              {weekdayLabels.map((label, index) => (
                <div key={index} role="columnheader" aria-label={label}>
                  {label}
                </div>
              ))}
            </div>
            {weeks.map((week, weekIndex) => (
              <div className="pw-range-cal-week" role="row" key={weekIndex}>
                {week.map((iso) => {
                  const otherMonth = iso.slice(0, 7) !== month;
                  const disabled = dayDisabled(month, iso);
                  const label = formatDayLabel(iso);
                  return (
                    <div role="gridcell" key={iso}>
                      <button
                        type="button"
                        className={dayClasses(iso)}
                        tabIndex={-1}
                        disabled={disabled}
                        data-iso={iso}
                        data-testid={
                          otherMonth
                            ? `pw-range-other-${month}-${iso}`
                            : `pw-range-day-${iso}`
                        }
                        aria-label={
                          disabled
                            ? label
                            : t(`assignments:workbench.gantt.range.${dayAriaKey}`, {
                                date: label,
                              })
                        }
                        onClick={() => onSelectDay(iso)}
                      >
                        {Number(iso.slice(8, 10))}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
