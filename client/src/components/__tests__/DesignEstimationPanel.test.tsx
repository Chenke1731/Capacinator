import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom';
import { DesignEstimationPanel } from '../estimation/DesignEstimationPanel';
import { api } from '../../lib/api-client';

jest.mock('../../lib/api-client', () => ({
  api: {
    designEstimations: {
      listByProject: jest.fn(),
      create: jest.fn(),
      backfill: jest.fn(),
      check: jest.fn(),
    },
  },
}));

const mockedList = api.designEstimations.listByProject as jest.Mock;
const mockedCreate = api.designEstimations.create as jest.Mock;
const mockedBackfill = api.designEstimations.backfill as jest.Mock;

const renderPanel = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DesignEstimationPanel projectId="p1" designDeadline={null} />
    </QueryClientProvider>
  );
};

const CURRENT_DESIGN_ESTIMATION = {
  id: 3,
  project_id: 'p1',
  estimated_design_pm: 1.5,
  deviation_low_pct: 20,
  deviation_high_pct: 50,
  notes: 'first round',
  actual_design_pm: null,
  backfilled_at: null,
  created_by: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  is_current: true
};

describe('DesignEstimationPanel backfill (IP-07a / C11 / C12)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedList.mockResolvedValue({ data: { data: [CURRENT_DESIGN_ESTIMATION] } });
  });

  test('save-backfill is disabled until the actual PM field is filled', async () => {
    renderPanel();
    expect(await screen.findByText(/Backfill actual design effort/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save Backfill/i })).toBeDisabled();
  });

  test('filled actual PM submits a single numeric field, no null keys', async () => {
    mockedBackfill.mockResolvedValue({
      data: { data: CURRENT_DESIGN_ESTIMATION, deviation: { design_pm: 33.3 } }
    });
    renderPanel();
    await screen.findByText(/Backfill actual design effort/i);

    await userEvent.type(screen.getByLabelText(/Actual design PM/i), '2');
    await userEvent.click(screen.getByRole('button', { name: /Save Backfill/i }));

    await waitFor(() => {
      expect(mockedBackfill).toHaveBeenCalledTimes(1);
    });
    const [id, payload] = mockedBackfill.mock.calls[0];
    expect(id).toBe(3);
    expect(payload).toEqual({ actual_design_pm: 2 });
  });

  test('R07: legal zero deviations are preserved in the design payload, not defaulted', async () => {
    mockedCreate.mockResolvedValue({ data: { data: { ...CURRENT_DESIGN_ESTIMATION, id: 4 } } });
    renderPanel();
    await screen.findByText(/Current Rough Design Estimate/i);

    await userEvent.type(screen.getByLabelText(/Rough design effort/i), '1');
    await userEvent.clear(screen.getByLabelText(/Optimistic deviation/i));
    await userEvent.type(screen.getByLabelText(/Optimistic deviation/i), '0');
    await userEvent.clear(screen.getByLabelText(/Pessimistic deviation/i));
    await userEvent.type(screen.getByLabelText(/Pessimistic deviation/i), '0');
    await userEvent.click(screen.getByRole('button', { name: /Save Estimate/i }));

    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledTimes(1);
    });
    const [, payload] = mockedCreate.mock.calls[0];
    expect(payload.deviation_low_pct).toBe(0);
    expect(payload.deviation_high_pct).toBe(0);
  });

  test('R07: empty deviations fall back to defaults 20/50', async () => {
    mockedCreate.mockResolvedValue({ data: { data: { ...CURRENT_DESIGN_ESTIMATION, id: 4 } } });
    renderPanel();
    await screen.findByText(/Current Rough Design Estimate/i);

    await userEvent.type(screen.getByLabelText(/Rough design effort/i), '1');
    await userEvent.clear(screen.getByLabelText(/Optimistic deviation/i));
    await userEvent.clear(screen.getByLabelText(/Pessimistic deviation/i));
    await userEvent.click(screen.getByRole('button', { name: /Save Estimate/i }));

    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledTimes(1);
    });
    const [, payload] = mockedCreate.mock.calls[0];
    expect(payload.deviation_low_pct).toBe(20);
    expect(payload.deviation_high_pct).toBe(50);
  });

  test('R07: negative deviation is rejected before submit with a visible message', async () => {
    renderPanel();
    await screen.findByText(/Current Rough Design Estimate/i);

    await userEvent.type(screen.getByLabelText(/Rough design effort/i), '1');
    await userEvent.clear(screen.getByLabelText(/Optimistic deviation/i));
    await userEvent.type(screen.getByLabelText(/Optimistic deviation/i), '-5');
    await userEvent.click(screen.getByRole('button', { name: /Save Estimate/i }));

    expect(await screen.findByText(/deviation_low_pct must be between 0 and 99/i)).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();
  });
});
