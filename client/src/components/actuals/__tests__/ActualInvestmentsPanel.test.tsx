import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ActualInvestmentsPanel } from '../ActualInvestmentsPanel';

jest.mock('../../../lib/api-client', () => ({
  api: {
    actualInvestments: {
      list: jest.fn(),
      snapshot: jest.fn(),
      setManual: jest.fn(),
      remove: jest.fn()
    }
  }
}));

import { api } from '../../../lib/api-client';

// 实投入月帐: 计划(服务端实时算) vs 实际(快照默认+主管改写) vs 偏差
const rows = [
  { month: '2026-09', fte: 1.2, source: 'manual', planned_fte: 0.6 },
  { month: '2026-08', fte: 0.5, source: 'snapshot', planned_fte: 0.5 }
];

const renderPanel = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ActualInvestmentsPanel projectId="p-1" />
    </QueryClientProvider>
  );
};

describe('ActualInvestmentsPanel (投入履历)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // 响应体三层: axios.data → sendSuccess body → {data: rows}
    (api.actualInvestments.list as jest.Mock).mockResolvedValue({
      data: { data: { data: rows } }
    });
    (api.actualInvestments.snapshot as jest.Mock).mockResolvedValue({ data: { data: {} } });
    (api.actualInvestments.setManual as jest.Mock).mockResolvedValue({ data: { data: {} } });
    (api.actualInvestments.remove as jest.Mock).mockResolvedValue({ data: { data: {} } });
  });

  test('renders months with plan/actual/deviation/source', async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('2026-09')).toBeInTheDocument();
    });
    const sep = screen.getByText('2026-09').closest('.actuals-row')!;
    // 计划 0.60 / 实际 1.20 / 偏差 +100% / 来源 改写
    expect(within(sep).getAllByText('0.60').length).toBeGreaterThan(0);
    expect(within(sep).getAllByText('1.20').length).toBeGreaterThan(0);
    expect(within(sep).getByText('+100%')).toBeInTheDocument();
    expect(within(sep).getByText('manual')).toBeInTheDocument();
    // 快照月的偏差为 0%
    const aug = screen.getByText('2026-08').closest('.actuals-row')!;
    expect(within(aug).getByText('0%')).toBeInTheDocument();
  });

  test('snapshot button posts current month and refreshes', async () => {
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('2026-09')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /snapshot this month/i }));
    await waitFor(() => {
      expect(api.actualInvestments.snapshot).toHaveBeenCalledWith('p-1', expect.stringMatching(/^\d{4}-\d{2}$/));
    });
  });

  test('clicking actual value opens inline edit and saves manual', async () => {
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('2026-09')).toBeInTheDocument();
    });
    const sep = screen.getByText('2026-09').closest('.actuals-row')!;
    await user.click(within(sep).getAllByText('1.20')[0]);
    const input = await within(sep).findByDisplayValue('1.2');
    await user.clear(input);
    await user.type(input, '2{Enter}');
    await waitFor(() => {
      expect(api.actualInvestments.setManual).toHaveBeenCalledWith('p-1', '2026-09', 2);
    });
  });

  test('delete removes the month row', async () => {
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText('2026-09')).toBeInTheDocument();
    });
    const sep = screen.getByText('2026-09').closest('.actuals-row')!;
    await user.click(within(sep).getByTitle('Delete'));
    await waitFor(() => {
      expect(api.actualInvestments.remove).toHaveBeenCalledWith('p-1', '2026-09');
    });
  });
});
