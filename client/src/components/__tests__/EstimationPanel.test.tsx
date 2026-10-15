import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom';
import { EstimationPanel } from '../estimation/EstimationPanel';
import { api } from '../../lib/api-client';

jest.mock('../../lib/api-client', () => ({
  api: {
    estimations: {
      listByProject: jest.fn(),
      create: jest.fn(),
      backfill: jest.fn(),
      check: jest.fn(),
    },
  },
}));

const mockedList = api.estimations.listByProject as jest.Mock;
const mockedCreate = api.estimations.create as jest.Mock;
const mockedCheck = api.estimations.check as jest.Mock;
const mockedBackfill = api.estimations.backfill as jest.Mock;

const renderPanel = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <EstimationPanel projectId="p1" />
    </QueryClientProvider>
  );
};

const CURRENT_ESTIMATION = {
  id: 7,
  project_id: 'p1',
  estimated_loc: 15000,
  loc_rate_per_pm: 500,
  design_share_pct: 15,
  deviation_low_pct: 20,
  deviation_high_pct: 50,
  expected_delivery_date: '2026-12-31',
  review_notes: 'first round',
  actual_loc: null,
  actual_design_pm: null,
  actual_dev_pm: null,
  actual_delivery_date: null,
  backfilled_at: null,
  created_by: null,
  created_at: '2026-09-20T00:00:00Z',
  updated_at: '2026-09-20T00:00:00Z',
  is_current: true
};

const CHECK_RESULT = {
  window: { start: '2026-09-20', deadline: '2026-12-31', months: 3.4 },
  design: {
    side: 'design', roleNames: ['SE'], teamSize: 2,
    demand: { low: 3.6, mid: 4.5, high: 6.8 },
    supplyPm: 4.8, slackPm: 0, gapPm: 0, verdict: 'tight'
  },
  dev: {
    side: 'dev', roleNames: ['开发'], teamSize: 8,
    demand: { low: 20.4, mid: 25.5, high: 38.3 },
    supplyPm: 13.2, slackPm: 0, gapPm: 7.2, verdict: 'infeasible'
  },
  overall: { verdict: 'infeasible' },
  assumptions: {
    loc_rate_per_pm: 500, design_share_pct: 15,
    deviation_low_pct: 20, deviation_high_pct: 50, capacity_note: 'note'
  }
};

describe('EstimationPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedList.mockResolvedValue({ data: { data: [CURRENT_ESTIMATION] } });
  });

  test('shows the empty state when no estimation exists', async () => {
    mockedList.mockResolvedValue({ data: { data: [] } });
    renderPanel();
    expect(await screen.findByText(/No estimation yet/i)).toBeInTheDocument();
  });

  test('shows current estimate and live conversion preview while typing LOC', async () => {
    renderPanel();

    expect(await screen.findByText(/Current Estimate/i)).toBeInTheDocument();
    expect(screen.getByText(/15,000 lines/)).toBeInTheDocument();

    const locInput = screen.getByLabelText(/Estimated Lines of Code/i);
    await userEvent.clear(locInput);
    await userEvent.type(locInput, '10000');

    // 10000 / 500 = 20 PM; [16, 20, 30]; design 15% = [2.4, 3, 4.5]; dev 85% = [13.6, 17, 25.5]
    const preview = screen.getByText(/Conversion preview/i).closest('div')!;
    expect(preview.textContent).toContain('16 ~ 30');
    expect(preview.textContent).toContain('2.4 ~ 4.5');
    expect(preview.textContent).toContain('13.6 ~ 25.5');
  });

  test('save button posts the estimation payload', async () => {
    mockedCreate.mockResolvedValue({ data: { data: { ...CURRENT_ESTIMATION, id: 8 } } });
    renderPanel();

    await screen.findByText(/Current Estimate/i);
    await userEvent.type(screen.getByLabelText(/Estimated Lines of Code/i), '20000');
    await userEvent.click(screen.getByRole('button', { name: /Save Estimate/i }));

    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledWith('p1', expect.objectContaining({ estimated_loc: 20000 }));
    });
  });

  test('deadline check renders overall verdict and per-side rows', async () => {
    mockedCheck.mockResolvedValue({ data: { data: CHECK_RESULT } });
    renderPanel();

    await screen.findByText(/Current Estimate/i);
    await userEvent.click(screen.getByRole('button', { name: /Deadline Check/i }));

    expect(await screen.findByText(/Overall: Infeasible/i)).toBeInTheDocument();
    expect(screen.getByText('Design (SE)')).toBeInTheDocument();
    expect(screen.getByText(/Gap\/Slack/)).toBeInTheDocument();
    // dev side gap is negative (shortfall)
    expect(screen.getByText('-7.2')).toBeInTheDocument();
  });

  test('backfill form appears for current estimate without actuals', async () => {
    renderPanel();
    expect(await screen.findByText(/Post-delivery Backfill/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Actual Lines of Code/i)).toBeInTheDocument();
  });

  test('save-backfill is disabled until at least one actual is filled (C12 client side)', async () => {
    renderPanel();
    await screen.findByText(/Post-delivery Backfill/i);
    expect(screen.getByRole('button', { name: /Save Backfill/i })).toBeDisabled();
  });

  test('partial backfill submits only filled fields, no null keys (C11)', async () => {
    mockedBackfill.mockResolvedValue({ data: { data: CURRENT_ESTIMATION, deviation: {} } });
    renderPanel();
    await screen.findByText(/Post-delivery Backfill/i);

    await userEvent.type(screen.getByLabelText(/Actual Dev PM/i), '3');
    await userEvent.click(screen.getByRole('button', { name: /Save Backfill/i }));

    await waitFor(() => {
      expect(mockedBackfill).toHaveBeenCalledTimes(1);
    });
    const [, payload] = mockedBackfill.mock.calls[0];
    expect(payload).toEqual({ actual_dev_pm: 3 });
  });

  test('filled backfill fields submit as numbers, date as string', async () => {
    mockedBackfill.mockResolvedValue({ data: { data: CURRENT_ESTIMATION, deviation: {} } });
    renderPanel();
    await screen.findByText(/Post-delivery Backfill/i);

    await userEvent.type(screen.getByLabelText(/Actual Lines of Code/i), '900');
    await userEvent.type(screen.getByLabelText(/Actual Delivery Date/i), '2026-12-20');
    await userEvent.click(screen.getByRole('button', { name: /Save Backfill/i }));

    await waitFor(() => {
      expect(mockedBackfill.mock.calls.length).toBe(1);
    });
    const [, payload] = mockedBackfill.mock.calls[0];
    expect(payload).toEqual({ actual_loc: 900, actual_delivery_date: '2026-12-20' });
  });

  test('R07: legal zero share/deviations are preserved in the save payload, not defaulted', async () => {
    mockedCreate.mockResolvedValue({ data: { data: { ...CURRENT_ESTIMATION, id: 8 } } });
    renderPanel();
    await screen.findByText(/Current Estimate/i);

    await userEvent.type(screen.getByLabelText(/Estimated Lines of Code/i), '500');
    for (const [label, value] of [
      [/Design Share/i, '0'],
      [/Optimistic deviation/i, '0'],
      [/Pessimistic deviation/i, '0']
    ] as const) {
      await userEvent.clear(screen.getByLabelText(label));
      await userEvent.type(screen.getByLabelText(label), value);
    }
    await userEvent.click(screen.getByRole('button', { name: /Save Estimate/i }));

    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledTimes(1);
    });
    const [, payload] = mockedCreate.mock.calls[0];
    expect(payload.design_share_pct).toBe(0);
    expect(payload.deviation_low_pct).toBe(0);
    expect(payload.deviation_high_pct).toBe(0);
  });

  test('R07: empty optional fields fall back to defaults 500/15/20/50', async () => {
    mockedCreate.mockResolvedValue({ data: { data: { ...CURRENT_ESTIMATION, id: 8 } } });
    renderPanel();
    await screen.findByText(/Current Estimate/i);

    await userEvent.type(screen.getByLabelText(/Estimated Lines of Code/i), '500');
    for (const label of [/Conversion rate/i, /Design Share/i, /Optimistic deviation/i, /Pessimistic deviation/i]) {
      await userEvent.clear(screen.getByLabelText(label));
    }
    await userEvent.click(screen.getByRole('button', { name: /Save Estimate/i }));

    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledTimes(1);
    });
    const [, payload] = mockedCreate.mock.calls[0];
    expect(payload.loc_rate_per_pm).toBe(500);
    expect(payload.design_share_pct).toBe(15);
    expect(payload.deviation_low_pct).toBe(20);
    expect(payload.deviation_high_pct).toBe(50);
  });

  test('R07: out-of-range share is rejected before submit with a visible message', async () => {
    renderPanel();
    await screen.findByText(/Current Estimate/i);

    await userEvent.type(screen.getByLabelText(/Estimated Lines of Code/i), '500');
    await userEvent.clear(screen.getByLabelText(/Design Share/i));
    await userEvent.type(screen.getByLabelText(/Design Share/i), '150');
    await userEvent.click(screen.getByRole('button', { name: /Save Estimate/i }));

    expect(await screen.findByText(/design_share_pct must be between 0 and 100/i)).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  test('R07: preview uses the default share when the field is cleared (matches what save would send)', async () => {
    renderPanel();
    await screen.findByText(/Current Estimate/i);

    await userEvent.type(screen.getByLabelText(/Estimated Lines of Code/i), '1000');
    await userEvent.clear(screen.getByLabelText(/Design Share/i));

    // 1000/500=2PM; 默认 15% → design 0.2 ~ 0.5(0.45 按 r1 半位进到 0.5;空串不能被当成 0 显示 0 ~ 0)
    const preview = screen.getByText(/Conversion preview/i).closest('div')!;
    expect(preview.textContent).toContain('0.2 ~ 0.5');
  });
});
