import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { WorkloadRangeCalendar } from '../WorkloadRangeCalendar';

function renderCalendar(overrides: Partial<ComponentProps<typeof WorkloadRangeCalendar>> = {}) {
  const onViewMonthChange = jest.fn();
  const onSelectDay = jest.fn();
  const onSelectMonth = jest.fn();
  const props = {
    start: '2026-01-01',
    end: '2026-01-31',
    asOf: '2026-01-15',
    viewMonth: '2026-03',
    anchor: null,
    onViewMonthChange,
    onSelectDay,
    onSelectMonth,
    ...overrides,
  };
  render(<WorkloadRangeCalendar {...props} />);
  return { onViewMonthChange, onSelectDay, onSelectMonth };
}

describe('WorkloadRangeCalendar', () => {
  test('disables second-click candidates beyond the five-year union', () => {
    renderCalendar({
      start: '2026-01-05',
      end: '2026-01-05',
      anchor: { start: '2026-01-05', end: '2026-01-05' },
      viewMonth: '2031-01',
    });
    expect(screen.getByTestId('pw-range-day-2031-01-06')).toBeEnabled();
    expect(screen.getByTestId('pw-range-day-2031-02-01')).toBeDisabled();
    expect(screen.getByTestId('pw-range-day-2031-02-01').getAttribute('aria-label')).not.toMatch(
      /choose/i
    );
    expect(screen.getByTestId('pw-range-month-2031-02')).toBeDisabled();
  });

  test('arrow keys move focus through the day grid', () => {
    renderCalendar();
    const grid = screen
      .getByTestId('pw-range-calendar')
      .querySelector<HTMLElement>('[data-month="2026-03"]');
    expect(grid).toBeTruthy();
    fireEvent.keyDown(grid!, { key: 'ArrowRight' });
    expect(screen.getByTestId('pw-range-day-2026-03-01')).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId('pw-range-day-2026-03-01'), {
      key: 'ArrowRight',
    });
    expect(screen.getByTestId('pw-range-day-2026-03-02')).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId('pw-range-day-2026-03-02'), {
      key: 'ArrowDown',
    });
    expect(screen.getByTestId('pw-range-day-2026-03-09')).toHaveFocus();
  });

  test('navigation buttons shift the view within supported bounds', () => {
    const { onViewMonthChange } = renderCalendar({ viewMonth: '2200-11' });
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(onViewMonthChange).toHaveBeenCalledWith('2200-10');
  });
});
