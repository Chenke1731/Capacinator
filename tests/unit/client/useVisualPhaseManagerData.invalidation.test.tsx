/**
 * I02k：阶段 mutation 成功后必须失效全部排产读侧（不只 projectPhases）。
 *
 * 回归背景：后端 I02a 已在事务内刷新 computed，但前端只失效 projectPhases，
 * 5min staleTime 内 People/报表/看板仍读旧窗口。本测试钉住 update/delete
 * 两条 mutation 的失效键集合。
 */
import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const listMock = jest.fn().mockResolvedValue({ data: [] });
const updateMock = jest.fn().mockResolvedValue({ data: {} });
const deleteMock = jest.fn().mockResolvedValue({ data: {} });
const templatesMock = jest.fn().mockResolvedValue({ data: [] });
const dependenciesListMock = jest.fn().mockResolvedValue({ data: [] });

jest.mock('../../../client/src/lib/api-client', () => ({
  api: {
    projectPhases: {
      list: (...args: unknown[]) => listMock(...args),
      update: (...args: unknown[]) => updateMock(...args),
      delete: (...args: unknown[]) => deleteMock(...args),
      create: jest.fn(),
    },
    phases: {
      list: (...args: unknown[]) => templatesMock(...args),
    },
    projectPhaseDependencies: {
      list: (...args: unknown[]) => dependenciesListMock(...args),
    },
  },
}));

import { useVisualPhaseManagerData } from '../../../client/src/hooks/useVisualPhaseManagerData';

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function queryClientWithSpy() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const spy = jest.spyOn(queryClient, 'invalidateQueries');
  return { queryClient, spy };
}

const flatten = (key: readonly unknown[]) => JSON.stringify(key);

describe('useVisualPhaseManagerData 排产读侧失效', () => {
  test('updatePhaseMutation 成功后失效 reports/dashboard/people.utilization/assignments', async () => {
    const { queryClient, spy } = queryClientWithSpy();
    const { result } = renderHook(
      () => useVisualPhaseManagerData({ projectId: 'p-1' }),
      { wrapper: wrapper(queryClient) }
    );
    await waitFor(() => expect(dependenciesListMock).toHaveBeenCalled());

    await act(async () => {
      await result.current.updatePhaseMutation.mutateAsync({
        phaseId: 't-1',
        data: { start_date: '2026-03-01', end_date: '2026-03-31' },
      });
    });

    const keys = spy.mock.calls.map((call) => flatten(call[0].queryKey));
    expect(keys).toEqual(
      expect.arrayContaining([
        JSON.stringify(['project-phases']),
        JSON.stringify(['assignments']),
        JSON.stringify(['reports']),
        JSON.stringify(['dashboard']),
        JSON.stringify(['people', 'utilization']),
        JSON.stringify(['projects']),
      ])
    );
  });

  test('deletePhaseMutation 成功同样失效全部读侧', async () => {
    const { queryClient, spy } = queryClientWithSpy();
    const { result } = renderHook(
      () => useVisualPhaseManagerData({ projectId: 'p-2' }),
      { wrapper: wrapper(queryClient) }
    );
    await waitFor(() => expect(dependenciesListMock).toHaveBeenCalled());

    await act(async () => {
      await result.current.deletePhaseMutation.mutateAsync('t-2');
    });

    const keys = spy.mock.calls.map((call) => flatten(call[0].queryKey));
    expect(keys).toEqual(
      expect.arrayContaining([JSON.stringify(['reports']), JSON.stringify(['dashboard'])])
    );
  });
});
