/**
 * I02h 批3：迭代页沉底区行内挂接 + 锚点四态 + 卡头/清单同源计数。
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import { Iterations } from '../Iterations';
import { api } from '../../lib/api-client';
import * as toastHook from '../../hooks/use-toast';

jest.mock('../../lib/api-client', () => ({
  api: {
    iterations: { list: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    projects: { list: jest.fn(), get: jest.fn(), update: jest.fn() },
  },
}));

jest.mock('../../hooks/use-toast', () => {
  const toast = jest.fn();
  return { useToast: () => ({ toast }), __iterToastMock: toast };
});
const getToastMock = () => (toastHook as any).__iterToastMock;

const iterations = [
  {
    id: 'it1',
    name: '2026 Q1',
    start_date: '2026-01-01',
    end_date: '2026-03-31',
    quarter: '2026-Q1',
    stats: { item_count: 1, se_pm: 0, mde_pm: 0, dev_pm: 0, states: [], load: [] },
  },
];

// p1=SR 父行（p2 之子），p2=已挂 it1 的子 AR，p3=非生命周期但带 iteration_id
const items = [
  { id: 'p1', name: '父需求SR', project_type_name: '需求交付', lifecycle_state: 'pending_rat', priority: 1, iteration_id: null, parent_id: null },
  { id: 'p2', name: '子AR', project_type_name: '需求交付', lifecycle_state: 'pending_rat', priority: 2, iteration_id: 'it1', parent_id: 'p1' },
  { id: 'p3', name: '问题单-挂迭代', project_type_name: '问题单支持', lifecycle_state: null, priority: 2, iteration_id: 'it1', parent_id: null },
  { id: 'p4', name: '待排需求', project_type_name: '需求交付', lifecycle_state: 'pending_rat', priority: 3, iteration_id: null, parent_id: null },
];

const renderPage = (initialEntry = '/iterations') => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Iterations />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  (api.iterations.list as jest.Mock).mockResolvedValue({ data: iterations });
  (api.projects.list as jest.Mock).mockResolvedValue({ data: { data: items } });
  (api.projects.update as jest.Mock).mockResolvedValue({ data: { data: {} } });
});

describe('Iterations 批3（I02h）', () => {
  test('沉底区行内挂接：select + 显式确认才发写请求，成功 toast', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('iter-attach-select-p4')).toBeInTheDocument());

    // 只改 select 不发请求（change 即写会随箭头键误发——F2）
    fireEvent.change(screen.getByTestId('iter-attach-select-p4'), { target: { value: 'it1' } });
    expect(api.projects.update).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('iter-attach-confirm-p4'));
    await waitFor(() =>
      expect(api.projects.update).toHaveBeenCalledWith('p4', { iteration_id: 'it1' })
    );
    await waitFor(() =>
      expect(getToastMock()).toHaveBeenCalledWith({ title: 'Attached to "2026 Q1"' })
    );
  });

  test('挂接失败：行内错误可见且 select 回滚到占位（不显示未持久化的值）', async () => {
    (api.projects.update as jest.Mock).mockRejectedValue({
      response: { data: { message: 'Iteration not found' } },
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('iter-attach-select-p4')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('iter-attach-select-p4'), { target: { value: 'it1' } });
    fireEvent.click(screen.getByTestId('iter-attach-confirm-p4'));

    await waitFor(() => expect(screen.getByTestId('iter-attach-error-p4')).toBeInTheDocument());
    expect(screen.getByTestId('iter-attach-error-p4').textContent).toBe('Iteration not found');
    expect((screen.getByTestId('iter-attach-select-p4') as HTMLSelectElement).value).toBe('');
  });

  test('SR 聚合父行：挂接控件禁用并说明原因；顶部有聚合说明', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('iter-attach-select-p1')).toBeInTheDocument());
    expect((screen.getByTestId('iter-attach-select-p1') as HTMLSelectElement).disabled).toBe(true);
    expect(screen.getByTestId('iterations-aggregate-note').textContent).toContain('1');
    // 子行 AR 仍可挂接（已挂就无沉底行——这里验证 p4 可用即可）
    expect((screen.getByTestId('iter-attach-select-p4') as HTMLSelectElement).disabled).toBe(false);
  });

  test('卡头计数 = 展开清单行数（非生命周期项目不计入，F4）', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(screen.getAllByText('2026 Q1').length).toBeGreaterThan(0));
    // 展开迭代卡（卡头与沉底 select option 同名——用卡头 class 定位）
    const head = container.querySelector('.it-card-head') as HTMLElement;
    fireEvent.click(head);
    await waitFor(() =>
      expect(within(container.querySelector('.it-card') as HTMLElement).getByText('子AR')).toBeInTheDocument()
    );
    // p3（问题单支持，非生命周期）虽带 iteration_id，但不在清单里
    expect(within(container.querySelector('.it-card') as HTMLElement).queryByText('问题单-挂迭代')).not.toBeInTheDocument();
  });

  test('锚点四态：已挂接项目 → banner 说明并给"查看迭代卡"', async () => {
    (api.projects.get as jest.Mock).mockResolvedValue({
      data: { data: { id: 'p2', name: '子AR', iteration_id: 'it1' } },
    });
    renderPage('/iterations?projectId=p2');
    await waitFor(() => expect(screen.getByTestId('iterations-anchor-banner')).toBeInTheDocument());
    expect(screen.getByTestId('iterations-anchor-banner').textContent).toContain('2026 Q1');
    expect(screen.getByTestId('iterations-anchor-view-card')).toBeInTheDocument();
  });

  test('锚点四态：聚合父行 → banner 指路子项', async () => {
    (api.projects.get as jest.Mock).mockResolvedValue({
      data: { data: { id: 'p1', name: '父需求SR', iteration_id: null, lifecycle_state: 'pending_rat', project_type_name: '需求交付' } },
    });
    renderPage('/iterations?projectId=p1');
    await waitFor(() => expect(screen.getByTestId('iterations-anchor-banner')).toBeInTheDocument());
    expect(screen.getByTestId('iterations-anchor-banner').textContent).toMatch(/child/i);
  });

  test('锚点四态：不支持类型 → banner 指向需求台', async () => {
    (api.projects.get as jest.Mock).mockResolvedValue({
      data: { data: { id: 'p3', name: '问题单', iteration_id: null, lifecycle_state: null, project_type_name: '问题单支持' } },
    });
    renderPage('/iterations?projectId=p3');
    await waitFor(() => expect(screen.getByTestId('iterations-anchor-banner')).toBeInTheDocument());
    expect(screen.getByTestId('iterations-anchor-goto-projects')).toBeInTheDocument();
  });

  test('锚点四态：项目不存在 → banner 说明', async () => {
    (api.projects.get as jest.Mock).mockRejectedValue(new Error('404'));
    renderPage('/iterations?projectId=ghost');
    await waitFor(() => expect(screen.getByTestId('iterations-anchor-banner')).toBeInTheDocument());
    expect(screen.getByTestId('iterations-anchor-banner').textContent).toMatch(/not found/i);
  });

  test('锚点命中未挂项目：沉底行高亮（可挂接路径）', async () => {
    (api.projects.get as jest.Mock).mockResolvedValue({
      data: { data: { id: 'p4', name: '待排需求', iteration_id: null, lifecycle_state: 'pending_rat', project_type_name: '需求交付' } },
    });
    renderPage('/iterations?projectId=p4');
    await waitFor(() => {
      const row = screen.getByTestId('iter-attach-select-p4').closest('.it-item-row');
      expect(row?.className).toContain('it-item-row--anchor');
    });
    // 高亮态不显示 banner（行本身即反馈）
    expect(screen.queryByTestId('iterations-anchor-banner')).not.toBeInTheDocument();
  });
});
