import React, { useState } from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query';
import '@testing-library/jest-dom';
import { useMutationFailureToaster } from '../useMutationFailureToaster';

/**
 * IP-06a/U02: mutation 失败必须可见且可重试。
 * 根因: 旧订阅比较 action.type === 'rejected'(promise 词汇),TanStack v5
 * 实际事件是 'error'——监听器永不触发。
 */
let mutationCalls = 0;

function Harness({ fail }: { fail: boolean }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <Inner fail={fail} />
    </QueryClientProvider>
  );
}

function Inner({ fail }: { fail: boolean }) {
  const { failure, dismiss } = useMutationFailureToaster();
  const mutation = useMutation({
    mutationFn: async () => {
      mutationCalls++;
      if (fail) throw new Error('保存失败(503)');
      return 'ok';
    }
  });

  return (
    <div>
      <button onClick={() => mutation.mutate()}>fire</button>
      {mutation.isSuccess && <span>retried-ok</span>}
      {failure && (
        <div role="alert">
          <span>{failure.message}</span>
          <button
            onClick={() => failure.retry()}
            disabled={!failure.canRetry}
          >
            retry
          </button>
          <button onClick={dismiss}>dismiss</button>
        </div>
      )}
    </div>
  );
}

describe('useMutationFailureToaster (U02)', () => {
  beforeEach(() => {
    mutationCalls = 0;
  });

  test('失败 mutation 触发 failure 提示(消费 v5 的 error 事件,非 rejected)', async () => {
    render(<Harness fail />);
    await userEvent.click(screen.getByText('fire'));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/保存失败\(503\)/)).toBeInTheDocument();
    expect(screen.getByText('retry')).toBeEnabled();
  });

  test('重试复用同一 mutation(草稿载荷不丢),重试一次后按钮禁用防重复', async () => {
    const { rerender } = render(<Harness fail />);
    await userEvent.click(screen.getByText('fire'));
    await screen.findByRole('alert');

    await userEvent.click(screen.getByText('retry'));
    expect(mutationCalls).toBe(2); // 原 1 + 重试 1,同一变量复用

    await screen.findByRole('alert');
    expect(screen.getByText('retry')).toBeDisabled();
  });

  test('成功 mutation 不触发提示;dismiss 清除', async () => {
    const { rerender } = render(<Harness fail />);
    await userEvent.click(screen.getByText('fire'));
    await screen.findByRole('alert');
    await userEvent.click(screen.getByText('dismiss'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    void rerender;
  });

  test('成功路径无 alert', async () => {
    render(<Harness fail={false} />);
    await userEvent.click(screen.getByText('fire'));
    await screen.findByText('retried-ok');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
