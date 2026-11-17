import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { WorkloadRangePanel } from '../WorkloadRangePanel';

function renderPanel(overrides: Partial<ComponentProps<typeof WorkloadRangePanel>> = {}) {
  const onApply = jest.fn();
  const onReset = jest.fn();
  const onClose = jest.fn();
  const props = {
    id: 'pw-gantt-range-panel',
    rangeStart: '2026-01-01',
    rangeEnd: '2026-12-31',
    asOf: '2026-03-15',
    isCustom: false,
    onApply,
    onReset,
    onClose,
    ...overrides,
  };
  render(<WorkloadRangePanel {...props} />);
  return { onApply, onReset, onClose };
}

describe('WorkloadRangePanel', () => {
  test('focuses the start date and applies the next-3-months preset', () => {
    const { onApply } = renderPanel();
    expect(screen.getByLabelText('Start Date')).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Next 3 months' }));
    expect(onApply).toHaveBeenCalledWith('2026-03-15', '2026-06-15');
  });

  test('applies a custom range through the form', () => {
    const { onApply } = renderPanel();
    fireEvent.change(screen.getByLabelText('Start Date'), { target: { value: '2026-02-01' } });
    fireEvent.change(screen.getByLabelText('End Date'), { target: { value: '2026-10-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply range' }));
    expect(onApply).toHaveBeenCalledWith('2026-02-01', '2026-10-31');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('blocks an inverted range and keeps the applied window', () => {
    const { onApply } = renderPanel();
    fireEvent.change(screen.getByLabelText('Start Date'), { target: { value: '2026-12-01' } });
    fireEvent.change(screen.getByLabelText('End Date'), { target: { value: '2026-02-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply range' }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Start date must not be after the end date.');
  });

  test('blocks a window longer than five years', () => {
    const { onApply } = renderPanel();
    fireEvent.change(screen.getByLabelText('Start Date'), { target: { value: '2010-01-01' } });
    fireEvent.change(screen.getByLabelText('End Date'), { target: { value: '2020-12-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply range' }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('The range cannot exceed 5 years.');
  });

  test('auto resets and Escape closes the panel', () => {
    const { onReset, onClose } = renderPanel({ isCustom: true });
    fireEvent.click(screen.getByRole('button', { name: 'Auto window' }));
    expect(onReset).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByTestId('pw-range-panel'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('warns when the reference date is outside the applied window', () => {
    renderPanel({ rangeStart: '2024-01-01', rangeEnd: '2024-12-31', isCustom: true });
    expect(
      screen.getByText(/2026-03-15 is outside this window; current workload still uses the reference date/i)
    ).toBeInTheDocument();
  });
});
