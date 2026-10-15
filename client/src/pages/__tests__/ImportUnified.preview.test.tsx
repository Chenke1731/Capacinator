import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import ImportUnified from '../ImportUnified';
import { api } from '../../lib/api-client';

/**
 * IP-05c: 导入"预览→核对→确认执行→结果一致"整段流程。
 * 预览不落库(dry-run)、确认用同一文件同一选项、执行结果与预览逐项对账、
 * 文件或选项变化后预览标过期。
 */
jest.mock('../../lib/api-client', () => ({
  api: {
    import: {
      getSettings: jest.fn(),
      analyzeImport: jest.fn(),
      uploadExcel: jest.fn(),
    },
  },
}));

jest.mock('../../contexts/ScenarioContext', () => ({
  useScenario: () => ({ currentScenario: null, scenarios: [] }),
}));

const mockedSettings = api.import.getSettings as jest.Mock;
const mockedAnalyze = api.import.analyzeImport as jest.Mock;
const mockedUpload = api.import.uploadExcel as jest.Mock;

const ANALYSIS = {
  success: true,
  message: 'Import analysis completed successfully',
  analysis: {
    summary: {
      totalChanges: 4,
      wouldCreate: { projectTypes: 1, phases: 12, projects: 3, locations: 1 },
      wouldUpdate: {},
      wouldDelete: {}
    },
    conflicts: [],
    warnings: [],
    errors: [],
    preview: { newEntities: [], modifiedEntities: [], deletedEntities: [], duplicates: [] },
    riskAssessment: { level: 'low', factors: [], recommendations: [] },
    dryRun: true,
    wouldSucceed: true
  },
  options: { clearExisting: false, useV2: true, dryRun: true },
  fileInfo: { name: 'plan.xlsx', size: 1024, formatVersion: 'V2 (Fiscal Weeks)' }
};

const renderPage = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ImportUnified />
      </QueryClientProvider>
    </MemoryRouter>
  );
};

const selectFile = async () => {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['xlsx-bytes'], 'plan.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByText('plan.xlsx');
  return file;
};

describe('ImportUnified preview → confirm flow (IP-05c)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSettings.mockResolvedValue({
      data: {
        data: {
          clearExistingData: false,
          validateDuplicates: true,
          autoCreateMissingRoles: false,
          autoCreateMissingLocations: false,
          defaultProjectPriority: 2,
          dateFormat: 'MM/DD/YYYY'
        }
      }
    });
  });

  test('analyze button previews counts without writing (uploadExcel not called)', async () => {
    mockedAnalyze.mockResolvedValue({ data: ANALYSIS });
    renderPage();
    const file = await selectFile();

    await userEvent.click(await screen.findByRole('button', { name: /Analyze before import/i }));

    await waitFor(() => {
      expect(mockedAnalyze).toHaveBeenCalledTimes(1);
    });
    const [sentFile, options] = mockedAnalyze.mock.calls[0];
    expect(sentFile).toBe(file);
    expect(options).toEqual({ clearExisting: false, useV2: true });
    expect(mockedUpload).not.toHaveBeenCalled();

    expect(await screen.findByText(/Import preview/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing is written/i)).toBeInTheDocument();
    expect(screen.getByText('projects:')).toBeInTheDocument(); // stats 网格渲染 wouldCreate 键
  });

  test('confirm executes with the same file and options, and matches preview counts', async () => {
    mockedAnalyze.mockResolvedValue({ data: ANALYSIS });
    mockedUpload.mockResolvedValue({
      data: {
        success: true,
        message: 'Excel import completed successfully',
        imported: { projectTypes: 1, phases: 12, projects: 3, locations: 1 },
        warnings: [],
        errors: []
      }
    });
    renderPage();
    await selectFile();
    await userEvent.click(await screen.findByRole('button', { name: /Analyze before import/i }));
    await screen.findByText(/Import preview/i);

    await userEvent.click(screen.getByRole('button', { name: /Confirm import/i }));

    await waitFor(() => {
      expect(mockedUpload).toHaveBeenCalledTimes(1);
    });
    const [sentFile, options] = mockedUpload.mock.calls[0];
    expect(sentFile.name).toBe('plan.xlsx');
    expect(options).toEqual({ clearExisting: false, useV2: true });

    expect(await screen.findByText(/Execution matches the preview/i)).toBeInTheDocument();
  });

  test('count mismatches between execution and preview are surfaced per key', async () => {
    mockedAnalyze.mockResolvedValue({ data: ANALYSIS });
    mockedUpload.mockResolvedValue({
      data: {
        success: true,
        message: 'Excel import completed successfully',
        imported: { projectTypes: 1, phases: 12, projects: 4, locations: 1 },
        warnings: [],
        errors: []
      }
    });
    renderPage();
    await selectFile();
    await userEvent.click(await screen.findByRole('button', { name: /Analyze before import/i }));
    await screen.findByText(/Import preview/i);
    await userEvent.click(screen.getByRole('button', { name: /Confirm import/i }));

    expect(await screen.findByText(/Execution differs from the preview/i)).toBeInTheDocument();
    expect(screen.getByText(/projects: preview 3 \/ actual 4/i)).toBeInTheDocument();
  });

  test('changing an option after preview marks it stale and blocks confirm', async () => {
    mockedAnalyze.mockResolvedValue({ data: ANALYSIS });
    renderPage();
    await selectFile();
    await userEvent.click(await screen.findByRole('button', { name: /Analyze before import/i }));
    await screen.findByText(/Import preview/i);

    // 预览后翻转 clearExisting 选项 → 预览过期
    await userEvent.click(screen.getByRole('checkbox', { name: /Clear existing data/i }));

    expect(await screen.findByText(/File or options changed — re-run the preview/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirm import/i })).toBeDisabled();
    expect(mockedUpload).not.toHaveBeenCalled();
  });
});
