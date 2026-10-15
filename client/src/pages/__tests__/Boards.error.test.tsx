import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom';
import { AffairsBoard } from '../AffairsBoard';
import { TicketsBoard } from '../TicketsBoard';
import { api } from '../../lib/api-client';

/**
 * IP-06a/U05: GET 失败不得显示"暂无条目"(误导用户以为数据不存在);
 * 失败态独立呈现并可重试,成功为空才显示空态。
 */
jest.mock('../../lib/api-client', () => ({
  api: {
    projects: {
      list: jest.fn(),
      get: jest.fn()
    }
  }
}));

jest.mock('../../contexts/ScenarioContext', () => ({
  useScenario: () => ({ currentScenario: { id: 's1' }, scenarios: [] })
}));

const mockedList = api.projects.list as jest.Mock;

const makeBoard = (Board: typeof AffairsBoard) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Board />
    </QueryClientProvider>
  );
};

describe('事项/问题单看板失败态 (U05)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('AffairsBoard: GET 失败显示错误面板而非"暂无条目",重试可再发起', async () => {
    mockedList.mockRejectedValue(new Error('network 503'));
    makeBoard(AffairsBoard);

    // 失败 → 错误面板(而非空态误导)
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/No affairs/i)).not.toBeInTheDocument();

    mockedList.mockResolvedValue({ data: { data: [] } });
    await userEvent.click(screen.getByRole('button', { name: /Retry/i }));
    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(2));
    // 重试成功后才是真正的空态
    expect(await screen.findByText(/No affairs/i)).toBeInTheDocument();
  });

  test('TicketsBoard: GET 失败显示错误面板而非"暂无条目"', async () => {
    mockedList.mockRejectedValue(new Error('network 503'));
    makeBoard(TicketsBoard);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/No ticket-pool items/i)).not.toBeInTheDocument();
  });

  test('AffairsBoard: 成功为空才显示空态', async () => {
    mockedList.mockResolvedValue({ data: { data: [] } });
    makeBoard(AffairsBoard);
    expect(await screen.findByText(/No affairs/i)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
