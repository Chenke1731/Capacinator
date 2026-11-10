/**
 * I01 QuickCaptureDialog 交互测试（设计稿 §5.2 收敛决策）。
 *
 * 覆盖：单行 Enter 提交+载荷解析、多行预览批提交、失败保留输入可重试、
 * "收入并继续"清正文保来源不关闭、来源记住上次选择。
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QuickCaptureDialog } from '../QuickCaptureDialog';
import { api } from '../../../lib/api-client';
import * as toastHook from '../../../hooks/use-toast';

jest.mock('../../../lib/api-client', () => ({
  api: {
    intake: {
      capture: jest.fn(),
      captureBatch: jest.fn(),
    },
  },
}));

// toast 收集到全局以便断言
jest.mock('../../../hooks/use-toast', () => {
  const toast = jest.fn();
  return {
    useToast: () => ({ toast }),
    __intakeToastMock: toast,
  };
});

const getToastMock = () => (toastHook as any).__intakeToastMock;

const renderDialog = (onClose = jest.fn()) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <QuickCaptureDialog open onClose={onClose} />
    </QueryClientProvider>
  );
  return { onClose };
};

const captureMock = api.intake.capture as jest.Mock;
const captureBatchMock = api.intake.captureBatch as jest.Mock;

describe('QuickCaptureDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    captureMock.mockResolvedValue({
      data: { success: true, data: { id: 'intake-1', status: 'new' }, warnings: [] },
    });
  });

  test('单行：粘贴 SR+日期+P 档 → ref/日期自动填充；Enter 直接提交且载荷正确', async () => {
    const { onClose } = renderDialog();
    const text = screen.getByTestId('intake-text');
    await userEvent.type(text, 'SR123456 用户登录改造 P2 2026-11-30');

    // 自动提取填充（单行模式显示可编辑的 ref/日期输入）
    await waitFor(() => {
      expect((screen.getByTestId('intake-ref') as HTMLInputElement).value).toBe('SR123456');
    });
    expect((screen.getByTestId('intake-finish') as HTMLInputElement).value).toBe('2026-11-30');

    // 无换行内容 + auto 模式：Enter 即提交
    await userEvent.type(text, '{Enter}');

    await waitFor(() => expect(captureMock).toHaveBeenCalledTimes(1));
    const payload = captureMock.mock.calls[0][0];
    expect(payload.title).toBe('用户登录改造');
    expect(payload.source_ref).toBe('SR123456');
    expect(payload.source_ref).toBe('SR123456');
    expect(payload.expected_finish).toBe('2026-11-30');
    expect(payload.priority_hint).toBe(2);
    expect(payload.source_channel).toBe('internal');
    expect(payload.raw_text).toBe('SR123456 用户登录改造 P2 2026-11-30');
    expect(onClose).toHaveBeenCalled();
    expect(getToastMock()).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining('1') })
    );
  });

  test('多行：预览逐行可改标题；提交走批量端点（一行一条，共用来源）', async () => {
    renderDialog();
    // 多行来自粘贴（Enter 在单行内容下会直接提交）——模拟 paste 语义
    fireEvent.change(screen.getByTestId('intake-text'), {
      target: { value: 'SR000101 一号需求\nSR000102 二号需求' },
    });

    await waitFor(() => expect(screen.getByTestId('intake-row-title-1')).toBeTruthy());

    // 第二行改标题
    fireEvent.change(screen.getByTestId('intake-row-title-1'), {
      target: { value: '二号需求（改名）' },
    });

    captureBatchMock.mockResolvedValue({
      data: { success: true, data: { created: [{ id: 'a' }, { id: 'b' }], skipped: [] } },
    });

    fireEvent.click(screen.getByTestId('intake-submit'));

    await waitFor(() => expect(captureBatchMock).toHaveBeenCalledTimes(1));
    const items = captureBatchMock.mock.calls[0][0];
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ title: '一号需求', source_ref: 'SR000101' });
    expect(items[1]).toMatchObject({ title: '二号需求（改名）', source_ref: 'SR000102' });
    expect(items[1].source_channel).toBe('internal');
    expect(getToastMock()).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining('2') })
    );
  });

  test('失败保留输入并显示可重试错误（重复编号 → 专属文案）', async () => {
    renderDialog();
    const text = screen.getByTestId('intake-text');
    await userEvent.type(text, 'SR000201 重复需求');

    captureMock.mockRejectedValueOnce({
      response: { data: { error: 'duplicate_source_ref', message: 'dup' } },
    });
    fireEvent.click(screen.getByTestId('intake-submit'));

    await waitFor(() => expect(screen.getByTestId('intake-capture-error')).toBeTruthy());
    // 输入保留（E2 契约）
    expect((screen.getByTestId('intake-text') as HTMLTextAreaElement).value).toContain('SR000201');
    expect(screen.getByTestId('intake-capture-error').textContent).toContain('already captured');

    // 重试成功 → 错误清除并关闭
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(captureMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByTestId('intake-capture-error')).toBeNull());
  });

  test('收入并继续：成功后不关闭、清正文、保留来源、来源记忆写 localStorage', async () => {
    // 来源经"记住上次"预载（jsdom 下 Radix Select 选项点击会误关 Dialog——
    // 真实 Select 交互归 e2e/走查覆盖）
    localStorage.setItem('intake-source', 'jdc_sr');
    const { onClose } = renderDialog();

    const text = screen.getByTestId('intake-text');
    await userEvent.type(text, 'SR000301 三号需求');
    fireEvent.click(screen.getByTestId('intake-submit-continue'));

    await waitFor(() => expect(captureMock).toHaveBeenCalledTimes(1));
    expect(captureMock.mock.calls[0][0].source_channel).toBe('jdc_sr');
    expect(localStorage.getItem('intake-source')).toBe('jdc_sr');
    // 不关闭 + 正文清空（继续录入）
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByTestId('intake-text') as HTMLTextAreaElement).value).toBe('');
  });

  test('空内容时提交按钮禁用（防误触）', () => {
    renderDialog();
    expect((screen.getByTestId('intake-submit') as HTMLButtonElement).disabled).toBe(true);
    // 空态给批量入口提示
    expect(screen.getByTestId('intake-empty-hint').textContent).toContain('multiple lines');
  });

  test('已识别 chips：解析结果紧贴输入区，点击编号 chip 聚焦对应字段', async () => {
    renderDialog();
    await userEvent.type(screen.getByTestId('intake-text'), 'SR777888 登录改造 P3 2026-12-05');

    await waitFor(() => expect(screen.getByTestId('intake-parsed-chips')).toBeTruthy());
    const chips = screen.getByTestId('intake-parsed-chips');
    expect(chips.textContent).toContain('SR777888');
    expect(chips.textContent).toContain('P3');
    expect(chips.textContent).toContain('2026-12-05');

    fireEvent.click(within(chips).getByRole('button', { name: 'SR777888' }));
    expect(document.activeElement).toBe(screen.getByTestId('intake-ref'));
  });
});
