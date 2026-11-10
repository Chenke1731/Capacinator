/**
 * I01 IntakeInbox 页测试：列表渲染、三态分离（空/加载/失败）、行详情、
 * 删除确认、拒绝必填理由、转换成功 toast + 项目跳转动作。
 * TriageDialog 以桩替换（真实交互另见 IntakeTriageDialog.test）。
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { IntakeInbox } from '../IntakeInbox';
import { api } from '../../lib/api-client';
import * as toastHook from '../../hooks/use-toast';

jest.mock('../../lib/api-client', () => ({
  api: {
    intake: {
      list: jest.fn(),
      counts: jest.fn(),
      update: jest.fn(),
      reject: jest.fn(),
      remove: jest.fn(),
    },
  },
}));

jest.mock('../../hooks/use-toast', () => {
  const toast = jest.fn();
  return { useToast: () => ({ toast }), __intakeToastMock: toast };
});
const getToastMock = () => (toastHook as any).__intakeToastMock;

// Triage 桩：暴露按钮模拟 onConverted（断言收件箱对转换结果的收尾）
jest.mock('../../components/intake/IntakeTriageDialog', () => ({
  IntakeTriageDialog: ({ intake, onConverted }: any) => (
    <div data-testid="triage-stub">
      <span data-testid="triage-stub-intake">{intake?.id}</span>
      <button
        type="button"
        data-testid="triage-stub-convert"
        onClick={() =>
          onConverted({
            project: { id: 'project-77', name: '转换后项目' },
            baseline: 'set',
            phase_count: 2,
            baseline_warnings: [],
          })
        }
      >
        simulate-convert
      </button>
    </div>
  ),
}));

const row = (over: Record<string, unknown> = {}) => ({
  id: 'intake-1',
  title: '用户登录改造',
  raw_text: 'SR123456 用户登录改造',
  source_channel: 'jdc_sr',
  source_ref: 'SR123456',
  requester: '张三',
  priority_hint: null,
  expected_start: null,
  expected_finish: '2026-11-30',
  note: null,
  status: 'new',
  reject_reason: null,
  converted_project_id: null,
  converted_at: null,
  created_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...over,
});

const renderPage = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <IntakeInbox />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

const listMock = api.intake.list as jest.Mock;
const countsMock = api.intake.counts as jest.Mock;

describe('IntakeInbox', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    countsMock.mockResolvedValue({
      data: { data: { new: 1, converted: 0, rejected: 0, by_source: { jdc_sr: 1 } } },
    });
  });

  test('列表渲染：行字段 + 计数行 + 操作按钮', async () => {
    listMock.mockResolvedValue({
      data: { success: true, data: [row()], pagination: { total: 1 } },
    });
    renderPage();

    await waitFor(() => expect(screen.getByTestId('intake-row-intake-1')).toBeTruthy());
    expect(screen.getByText('用户登录改造')).toBeTruthy();
    expect(screen.getByText('JDC/SR')).toBeTruthy();
    expect(screen.getByText('SR123456')).toBeTruthy();
    expect(screen.getByText('张三')).toBeTruthy();
    expect(screen.getByTestId('intake-counts').textContent).toContain('Pending: 1');
    expect(screen.getByTestId('intake-convert-intake-1')).toBeTruthy();
    expect(screen.getByTestId('intake-reject-intake-1')).toBeTruthy();
    expect(screen.getByTestId('intake-delete-intake-1')).toBeTruthy();
  });

  test('空态：提示 Alt+N 入口（不冒充失败）', async () => {
    listMock.mockResolvedValue({ data: { success: true, data: [], pagination: { total: 0 } } });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('intake-empty')).toBeTruthy());
    expect(screen.getByTestId('intake-empty').textContent).toContain('Alt+N');
  });

  test('计数失败：显示错误与重试，不以 0 冒充（G-03）', async () => {
    listMock.mockResolvedValue({ data: { success: true, data: [row()], pagination: { total: 1 } } });
    countsMock.mockRejectedValue(new Error('500'));
    renderPage();
    await waitFor(() => expect(screen.getByTestId('intake-counts').textContent).toContain('Failed to load counts'));
    // 列表正常渲染，计数不显示 0
    expect(screen.getByTestId('intake-row-intake-1')).toBeTruthy();
    expect(screen.getByTestId('intake-counts').textContent).not.toMatch(/Pending: 0/);

    countsMock.mockResolvedValue({
      data: { data: { new: 1, converted: 0, rejected: 0, by_source: { jdc_sr: 1 } } },
    });
    fireEvent.click(screen.getByTestId('intake-counts').querySelector('button')!);
    await waitFor(() => expect(screen.getByTestId('intake-counts').textContent).toContain('Pending: 1'));
  });

  test('筛选无结果：显示"没有符合筛选"与清除入口，不冒充全局空态（G-11）', async () => {
    listMock.mockResolvedValue({ data: { success: true, data: [], pagination: { total: 0 } } });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('intake-search')).toBeTruthy());
    fireEvent.change(screen.getByTestId('intake-search'), { target: { value: '不存在的关键字' } });
    await waitFor(() => expect(screen.getByTestId('intake-empty')).toBeTruthy());
    expect(screen.getByTestId('intake-empty').textContent).toContain('No items match');
    expect(screen.getByTestId('intake-empty').textContent).not.toContain('Inbox is empty');
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeTruthy();
  });

  test('失败态：独立呈现可重试（U05 契约）', async () => {
    listMock.mockRejectedValue(new Error('500'));
    renderPage();
    await waitFor(() => expect(screen.getByTestId('intake-error')).toBeTruthy());
    expect(screen.getByTestId('intake-error').textContent).toContain('Failed to load');

    listMock.mockResolvedValue({ data: { success: true, data: [], pagination: { total: 0 } } });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByTestId('intake-empty')).toBeTruthy());
  });

  test('行展开：显示原文 + 待处理可编辑入口', async () => {
    listMock.mockResolvedValue({ data: { success: true, data: [row()], pagination: { total: 1 } } });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('intake-toggle-intake-1')).toBeTruthy());
    fireEvent.click(screen.getByTestId('intake-toggle-intake-1'));
    expect(screen.getByTestId('intake-detail-intake-1').textContent).toContain('SR123456 用户登录改造');
    expect(screen.getByTestId('intake-edit-intake-1')).toBeTruthy();
  });

  test('删除：二次确认后调用 remove', async () => {
    listMock.mockResolvedValue({ data: { success: true, data: [row()], pagination: { total: 1 } } });
    (api.intake.remove as jest.Mock).mockResolvedValue({ data: { success: true } });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('intake-delete-intake-1')).toBeTruthy());
    fireEvent.click(screen.getByTestId('intake-delete-intake-1'));
    await waitFor(() => expect(screen.getByText('Delete this intake?')).toBeTruthy());
    // 确认按钮与行内删除同名——确认层取最后一个
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);
    await waitFor(() => expect(api.intake.remove).toHaveBeenCalledWith('intake-1'));
  });

  test('拒绝：无理由禁用；填写后调用 reject(id, reason)', async () => {
    listMock.mockResolvedValue({ data: { success: true, data: [row()], pagination: { total: 1 } } });
    (api.intake.reject as jest.Mock).mockResolvedValue({
      data: { success: true, data: row({ status: 'rejected' }) },
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('intake-reject-intake-1')).toBeTruthy());
    fireEvent.click(screen.getByTestId('intake-reject-intake-1'));
    await waitFor(() => expect(screen.getByTestId('intake-reject-submit')).toBeTruthy());
    expect((screen.getByTestId('intake-reject-submit') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId('intake-reject-reason'), {
      target: { value: '重复提交' },
    });
    fireEvent.click(screen.getByTestId('intake-reject-submit'));
    await waitFor(() => expect(api.intake.reject).toHaveBeenCalledWith('intake-1', '重复提交'));
  });

  test('转换成功：toast 携带基线信息与打开项目动作；条目收尾', async () => {
    listMock.mockResolvedValue({ data: { success: true, data: [row()], pagination: { total: 1 } } });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('intake-convert-intake-1')).toBeTruthy());
    fireEvent.click(screen.getByTestId('intake-convert-intake-1'));
    await waitFor(() => expect(screen.getByTestId('triage-stub-convert')).toBeTruthy());
    expect(screen.getByTestId('triage-stub-intake').textContent).toBe('intake-1');
    fireEvent.click(screen.getByTestId('triage-stub-convert'));

    const toastCall = getToastMock().mock.calls[0][0];
    expect(toastCall.title).toContain('转换后项目');
    expect(toastCall.description).toContain('2'); // baselineSet 带 phase_count
    expect(toastCall.action.props.children).toBe('Open project');
  });
});
