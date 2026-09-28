/**
 * Cache freshness contract for the git-sync pull flow (stale-render
 * investigation, 2026-09-27):
 *
 * staleTime=5min + refetchOnWindowFocus=false (deliberate, ee02050)
 * means invalidation is the only path to freshness. A sync pull applies
 * remote changes to local tables; once it returns — clean or conflicted —
 * the React Query cache is stale and must be invalidated.
 */
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const pushMock = jest.fn();
const pullMock = jest.fn();

jest.mock('../../../client/src/lib/api-client', () => ({
  api: {
    sync: {
      push: (...args: unknown[]) => pushMock(...args),
      pull: (...args: unknown[]) => pullMock(...args),
    },
  },
}));

import { GitSyncProvider, useGitSync } from '../../../client/src/contexts/GitSyncContext';

const Probe = ({ trigger }: { trigger: 'pull' | 'sync' }) => {
  const { pull, sync } = useGitSync();
  return (
    <button
      data-testid="probe"
      onClick={() => (trigger === 'pull' ? pull() : sync())}
    >
      probe
    </button>
  );
};

const renderWithQueryClient = (trigger: 'pull' | 'sync') => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
  render(
    <QueryClientProvider client={queryClient}>
      <GitSyncProvider>
        <Probe trigger={trigger} />
      </GitSyncProvider>
    </QueryClientProvider>
  );
  return { invalidateSpy };
};

describe('GitSyncContext cache invalidation', () => {
  beforeEach(() => {
    pushMock.mockReset().mockResolvedValue({ data: {} });
    pullMock.mockReset().mockResolvedValue({ data: { conflicts: [] } });
  });

  it('invalidates the query cache after a clean pull', async () => {
    const { invalidateSpy } = renderWithQueryClient('pull');
    document.querySelector('[data-testid="probe"]')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    await waitFor(() => expect(pullMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
  });

  it('invalidates the query cache after a conflicted pull (partial data may have applied)', async () => {
    pullMock.mockResolvedValue({ data: { conflicts: [{ id: 'c1' }] } });
    const { invalidateSpy } = renderWithQueryClient('pull');
    document.querySelector('[data-testid="probe"]')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    await waitFor(() => expect(pullMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
  });

  it('invalidates the query cache after a full sync (push+pull)', async () => {
    const { invalidateSpy } = renderWithQueryClient('sync');
    document.querySelector('[data-testid="probe"]')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    await waitFor(() => expect(pushMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(pullMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
  });
});
