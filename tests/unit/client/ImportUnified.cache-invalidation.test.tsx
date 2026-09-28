/**
 * Cache freshness contract for the import flow (stale-render
 * investigation, 2026-09-27):
 *
 * The app deliberately keeps staleTime=5min and disables
 * refetch-on-focus (ee02050 — focus refetch was perceived as stutter).
 * That makes every cache INVALIDATION the only path to freshness. An
 * Excel import rewrites whole tables (clearExistingData=true by default),
 * so once the server has processed an upload — success OR failure — the
 * React Query cache is stale and must be invalidated, or the user sees
 * pre-import data on every page until a manual reload.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const uploadExcel = jest.fn();

jest.mock('../../../client/src/lib/api-client', () => ({
  api: {
    import: {
      uploadExcel: (...args: unknown[]) => uploadExcel(...args),
      // Mount-time settings load (ImportUnified.tsx loadSettings) — mock it
      // so the component doesn't console.error on a missing api method.
      getSettings: jest.fn().mockResolvedValue({ data: { data: { clearExistingData: false } } }),
    },
  },
}));

jest.mock('../../../client/src/contexts/ScenarioContext', () => ({
  useScenario: () => ({ currentScenario: { id: 'baseline-0000-0000-0000-000000000000', name: 'Baseline' } }),
}));

jest.mock('../../../client/src/hooks/useBookmarkableTabs', () => ({
  useBookmarkableTabs: () => ({ tabs: [], activeTab: 'import', setActiveTab: jest.fn() }),
}));

jest.mock('../../../client/src/components/ui/UnifiedTabComponent', () => ({
  UnifiedTabComponent: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('../../../client/src/components/ui/OperationProgress', () => ({
  useOperationProgress: () => ({
    status: 'idle',
    start: jest.fn(),
    updateProgress: jest.fn(),
    complete: jest.fn(),
    fail: jest.fn(),
    addWarning: jest.fn(),
    addError: jest.fn(),
  }),
  OperationProgress: () => null,
}));

import ImportUnified from '../../../client/src/pages/ImportUnified';

const renderWithQueryClient = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
  render(
    <QueryClientProvider client={queryClient}>
      <ImportUnified />
    </QueryClientProvider>
  );
  return { invalidateSpy };
};

// The upload flow needs a File selected before its button activates.
const selectFile = () => {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  if (!input) throw new Error('file input not rendered');
  fireEvent.change(input, {
    target: { files: [new File(['x'], 'plan.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })] },
  });
};

const clickImport = () => {
  const buttons = screen.getAllByRole('button');
  const importButton = buttons.find(b => /import/i.test(b.textContent || ''));
  if (!importButton) throw new Error('import button not found');
  fireEvent.click(importButton);
};

describe('ImportUnified cache invalidation', () => {
  beforeEach(() => {
    uploadExcel.mockReset();
  });

  it('invalidates the query cache after a successful import', async () => {
    uploadExcel.mockResolvedValue({
      data: { success: true, message: 'Imported', imported: { projects: 3 } },
    });
    const { invalidateSpy } = renderWithQueryClient();

    selectFile();
    clickImport();

    await waitFor(() => expect(uploadExcel).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
  });

  it('invalidates the query cache after a FAILED import response (world may have partially changed)', async () => {
    uploadExcel.mockResolvedValue({
      data: { success: false, message: 'Row 7 invalid', errors: ['Row 7: bad date'] },
    });
    const { invalidateSpy } = renderWithQueryClient();

    selectFile();
    clickImport();

    await waitFor(() => expect(uploadExcel).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
  });

  it('invalidates the query cache when the request itself errors', async () => {
    uploadExcel.mockRejectedValue(new Error('network down'));
    const { invalidateSpy } = renderWithQueryClient();

    selectFile();
    clickImport();

    await waitFor(() => expect(uploadExcel).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
  });
});
