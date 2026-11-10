/**
 * I01 IntakeTriageDialog 测试（设计稿 §5.4 收敛决策）。
 *
 * Radix Select 交互在 jsdom 偏脆——子类型选择经"记住上次"localStorage 预填
 * 绕开（真实 Select 交互由 e2e/走查覆盖）。断言转换载荷、基线说明切换、
 * invalid_status 错误路径与标题覆盖。
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntakeTriageDialog } from '../IntakeTriageDialog';
import { api } from '../../../lib/api-client';
import type { DemandIntake } from '../../../types';

jest.mock('../../../lib/api-client', () => ({
  api: {
    projectSubTypes: { list: jest.fn() },
    people: { list: jest.fn() },
    intake: { convert: jest.fn() },
  },
}));

const baseIntake: DemandIntake = {
  id: 'intake-9',
  title: '登录改造',
  raw_text: 'SR777777 原文',
  source_channel: 'jdc_sr',
  source_ref: 'SR777777',
  requester: '张三',
  priority_hint: 2,
  expected_start: null,
  expected_finish: '2027-03-31',
  note: '备注',
  status: 'new',
  reject_reason: null,
  converted_project_id: null,
  converted_at: null,
  created_by: null,
  created_at: '2026-11-10T10:00:00.000Z',
  updated_at: '2026-11-10T10:00:00.000Z',
};

const subTypeGroups = [
  {
    project_type_id: 'type-1',
    project_type_name: '需求交付',
    sub_types: [{ id: 'sub-1', name: 'SR', is_active: 1 }],
  },
];

const renderDialog = (intake: DemandIntake, onConverted = jest.fn()) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <IntakeTriageDialog open intake={intake} onClose={jest.fn()} onConverted={onConverted} />
    </QueryClientProvider>
  );
  return { onConverted };
};

describe('IntakeTriageDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    (api.projectSubTypes.list as jest.Mock).mockResolvedValue({ data: { data: subTypeGroups } });
    (api.people.list as jest.Mock).mockResolvedValue({ data: { data: [] } });
    (api.intake.convert as jest.Mock).mockResolvedValue({
      data: {
        success: true,
        data: {
          project: { id: 'project-1', name: '登录改造', lifecycle_state: 'pending_rat' },
          intake: { ...baseIntake, status: 'converted', converted_project_id: 'project-1' },
          baseline: 'set',
          baseline_reason: null,
          phase_count: 2,
          external_number_linked: 'SR777777',
          baseline_warnings: [],
        },
      },
    });
    localStorage.setItem('intake-triage-subtype', 'sub-1');
  });

  test('默认值预填：priority_hint 优先级、期望结束来自收件箱；提交载荷派生父类型', async () => {
    const { onConverted } = renderDialog(baseIntake);
    await waitFor(() =>
      expect((screen.getByTestId('triage-submit') as HTMLButtonElement).disabled).toBe(false)
    );

    // 未选择期望开始 → 未定基线说明
    expect(screen.getByTestId('triage-baseline-note').textContent).toMatch(/No expected start date/i);

    fireEvent.change(screen.getByTestId('triage-start'), { target: { value: '2027-03-01' } });
    // 有开始日 → 基线说明切换
    expect(screen.getByTestId('triage-baseline-note').textContent).toMatch(/generated from that date/i);

    // 标题覆盖
    fireEvent.change(screen.getByTestId('triage-title'), { target: { value: '登录改造（改）' } });

    fireEvent.click(screen.getByTestId('triage-submit'));

    await waitFor(() => expect(api.intake.convert).toHaveBeenCalledTimes(1));
    const [id, payload] = (api.intake.convert as jest.Mock).mock.calls[0];
    expect(id).toBe('intake-9');
    expect(payload).toMatchObject({
      title: '登录改造（改）',
      project_type_id: 'type-1', // 由子类型派生（单选择器决策）
      project_sub_type_id: 'sub-1',
      priority: 2, // priority_hint 预填
      expected_start: '2027-03-01',
      expected_finish: '2027-03-31',
    });
    await waitFor(() => expect(onConverted).toHaveBeenCalledTimes(1));
    expect((onConverted as jest.Mock).mock.calls[0][0].baseline).toBe('set');
  });

  test('无期望开始日提交：载荷为 null（服务端不建阶段——契约同构）', async () => {
    renderDialog(baseIntake);
    await waitFor(() =>
      expect((screen.getByTestId('triage-submit') as HTMLButtonElement).disabled).toBe(false)
    );
    fireEvent.click(screen.getByTestId('triage-submit'));
    await waitFor(() => expect(api.intake.convert).toHaveBeenCalledTimes(1));
    const payload = (api.intake.convert as jest.Mock).mock.calls[0][1];
    expect(payload.expected_start).toBeNull();
  });

  test('行有期望开始日：start 预填行值、说明为有基线文案、载荷携带（D14）', async () => {
    renderDialog({ ...baseIntake, expected_start: '2027-03-01' });
    await waitFor(() =>
      expect((screen.getByTestId('triage-submit') as HTMLButtonElement).disabled).toBe(false)
    );

    // 预填行值，而非空 + "不生成阶段"（与服务端 inStart ?? intake.expected_start 回落一致）
    expect((screen.getByTestId('triage-start') as HTMLInputElement).value).toBe('2027-03-01');
    expect(screen.getByTestId('triage-baseline-note').textContent).toMatch(/generated from that date/i);

    fireEvent.click(screen.getByTestId('triage-submit'));
    await waitFor(() => expect(api.intake.convert).toHaveBeenCalledTimes(1));
    const payload = (api.intake.convert as jest.Mock).mock.calls[0][1];
    expect(payload.expected_start).toBe('2027-03-01');
  });

  test('invalid_status（双击/他处已转换）→ 专属错误文案，不清空表单', async () => {
    (api.intake.convert as jest.Mock).mockRejectedValueOnce({
      response: { data: { error: 'invalid_status', message: 'already' } },
    });
    renderDialog(baseIntake);
    await waitFor(() =>
      expect((screen.getByTestId('triage-submit') as HTMLButtonElement).disabled).toBe(false)
    );
    fireEvent.click(screen.getByTestId('triage-submit'));
    await waitFor(() => expect(screen.getByTestId('triage-error')).toBeTruthy());
    expect(screen.getByTestId('triage-error').textContent).toContain('already converted or rejected');
    // 表单保留
    expect((screen.getByTestId('triage-title') as HTMLInputElement).value).toBe('登录改造');
  });

  test('未选子类型时提交禁用', async () => {
    localStorage.removeItem('intake-triage-subtype');
    renderDialog(baseIntake);
    await waitFor(() => expect(screen.getByTestId('triage-submit')).toBeTruthy());
    expect((screen.getByTestId('triage-submit') as HTMLButtonElement).disabled).toBe(true);
  });
});
