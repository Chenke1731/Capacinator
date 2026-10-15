import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';

/**
 * IP-06a/U02: mutation 失败的可见提示 + 重试。
 * 根因修复: TanStack Query v5 mutation 缓存事件的失败动作是 'error'——
 * 旧订阅比较 'rejected'(promise 词汇)永不触发,任何保存 503 都无反馈。
 * 重试复用 mutation.execute() 携带的同一变量(草稿载荷不丢);同一 mutation
 * 只允许重试一次,防连点重复写入。
 */
export interface MutationFailure {
  mutationId: number;
  message: string;
  retry: () => void;
  canRetry: boolean;
}

function extractMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  const e = err as { message?: string; response?: { data?: { message?: string } } } | null | undefined;
  return e?.response?.data?.message || e?.message || '操作失败';
}

export function useMutationFailureToaster(client?: QueryClient) {
  const contextClient = useQueryClient();
  const queryClient = client ?? contextClient;
  const [failure, setFailure] = useState<MutationFailure | null>(null);
  const retriedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const unsub = queryClient.getMutationCache().subscribe((event) => {
      if (event.type !== 'updated') return;
      const action = event.action as { type?: string; error?: unknown };
      const mutation = event.mutation;
      const mutationId = mutation?.mutationId ?? -1;

      if (action?.type === 'error') {
        const err = action.error ?? mutation?.state?.error;
        setFailure({
          mutationId,
          message: extractMessage(err),
          canRetry: mutationId >= 0 && !retriedRef.current.has(mutationId),
          retry: () => {
            if (mutationId < 0 || retriedRef.current.has(mutationId)) return;
            retriedRef.current.add(mutationId);
            // 同一变量重跑,草稿不丢;再失败的呈现由缓存订阅统一处理,
            // 这里吞掉 promise 拒绝避免未处理拒绝
            mutation?.execute(mutation.state.variables!).catch(() => undefined);
          }
        });
      } else if (action?.type === 'success') {
        // 重试成功后自动收起
        setFailure((prev) => (prev && prev.mutationId === mutationId ? null : prev));
      }
    });
    return unsub;
  }, [queryClient]);

  const dismiss = useCallback(() => setFailure(null), []);
  return { failure, dismiss };
}
