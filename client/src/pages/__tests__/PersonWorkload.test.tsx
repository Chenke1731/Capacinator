import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PersonWorkload from '../PersonWorkload';
import { api } from '../../lib/api-client';

jest.mock('../../lib/api-client', () => ({
  api: {
    people: {
      get: jest.fn(),
      getUtilization: jest.fn(),
      list: jest.fn(),
    },
    assignments: {
      list: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
      handover: jest.fn(),
    },
    projects: {
      list: jest.fn(),
    },
    projectPhases: {
      list: jest.fn(),
    },
  },
}));

const mockScenarios = [
  { id: 'baseline-0000-0000-0000-000000000000', name: 'Baseline' },
  { id: 'branch-1', name: 'Branch' },
];
const mockSetCurrentScenario = jest.fn();
var mockCurrentScenario = mockScenarios[0];

jest.mock('../../contexts/ScenarioContext', () => ({
  useScenario: () => ({
    currentScenario: mockCurrentScenario,
    scenarios: mockScenarios,
    setCurrentScenario: mockSetCurrentScenario,
    scenarioLock: null,
    lockScenarioSwitching: jest.fn(),
    unlockScenarioSwitching: jest.fn(),
  }),
}));

const person = {
  id: 'person-1',
  name: 'Jane Doe',
  primary_role_name: 'SE',
  roles: [{ role_id: 'role-se', role_name: 'SE', is_primary: 1 }],
};

const assignments = [
  {
    id: 'a1',
    version: 1,
    person_id: 'person-1',
    project_id: 'p1',
    project_name: 'Alpha',
    role_id: 'role-se',
    role_name: 'SE',
    phase_name: 'Design',
    allocation_percentage: 20,
    status: 'active',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    computed_start_date: '2026-01-01',
    computed_end_date: '2026-12-31',
    assignment_date_mode: 'fixed',
    assignment_type: 'scenario',
  },
  {
    id: 'a2',
    version: 1,
    person_id: 'person-1',
    project_id: 'p2',
    project_name: 'Beta',
    role_id: 'role-mde',
    role_name: 'MDE',
    allocation_percentage: 10,
    status: 'active',
    start_date: null,
    end_date: null,
    computed_start_date: null,
    computed_end_date: null,
    assignment_date_mode: 'fixed',
    assignment_type: 'direct',
  },
  {
    id: 'a3',
    version: 1,
    person_id: 'person-1',
    project_id: 'p3',
    project_name: 'Gamma',
    role_id: 'role-se',
    role_name: 'SE',
    allocation_percentage: 5,
    status: 'paused',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    assignment_type: 'scenario',
  },
  {
    id: 'a4',
    version: 1,
    person_id: 'person-1',
    project_id: 'p4',
    project_name: 'Delta',
    role_id: 'role-se',
    role_name: 'SE',
    allocation_percentage: 15,
    status: 'active',
    start_date: '2026-06-01',
    end_date: '2026-06-30',
    assignment_type: 'scenario',
  },
];

function pageElement(queryClient: QueryClient) {
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/people/person-1/workload']}>
        <Routes>
          <Route path="/people/:id/workload" element={<PersonWorkload />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    ...render(pageElement(queryClient)),
    queryClient,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentScenario = mockScenarios[0];
  mockSetCurrentScenario.mockClear();
  (api.people.get as jest.Mock).mockResolvedValue({ data: person });
  (api.assignments.list as jest.Mock).mockResolvedValue({
    data: { data: assignments, pagination: { total: assignments.length } },
  });
  (api.people.getUtilization as jest.Mock).mockResolvedValue({
    data: [
      {
        person_id: 'person-1',
        current_availability_percentage: 50,
        as_of: '2026-03-15',
        utilization_status: 'Partially-allocated',
      },
    ],
  });
  (api.assignments.update as jest.Mock).mockResolvedValue({ data: { success: true } });
  (api.assignments.delete as jest.Mock).mockResolvedValue({ data: { success: true } });
  (api.assignments.create as jest.Mock).mockResolvedValue({ data: { id: 'new-assignment' } });
  (api.assignments.handover as jest.Mock).mockResolvedValue({
    data: { success: true, data: { original: {}, created: {} } },
  });
  (api.people.list as jest.Mock).mockResolvedValue({
    data: { data: [{ id: 'person-1', name: 'Jane Doe' }, { id: 'person-2', name: 'John Smith' }] },
  });
  (api.projects.list as jest.Mock).mockResolvedValue({
    data: { data: [], pagination: { total: 0, has_more: false } },
  });
  (api.projectPhases.list as jest.Mock).mockResolvedValue({
    data: { data: [], pagination: { total: 0 } },
  });
});

test('current total, excluded rows, and scenario source badges share one selector', async () => {
  renderPage();

  await waitFor(() => {
    expect(screen.getByRole('heading', { name: 'Adjust Assignments' })).toBeInTheDocument();
  });

  expect(screen.getByTestId('pw-total')).toHaveTextContent('30%');
  expect(screen.getByTestId('pw-availability')).toHaveTextContent('50%');
  expect(screen.getByTestId('pw-relative')).toHaveTextContent('60%');
  expect(screen.getByTestId('pw-remaining')).toHaveTextContent('20%');
  expect(screen.getByTestId('pw-excluded')).toHaveTextContent('2 · 20%');

  expect(screen.getAllByText('Alpha').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Beta').length).toBeGreaterThan(0);
  expect(screen.getByText('Baseline (global)')).toBeInTheDocument();
  expect(screen.getAllByText('Current scenario').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Paused').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Not started').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Gamma').length).toBeGreaterThan(0);
});

test('availability 0 is shown as no capacity, relative utilization is —', async () => {
  (api.people.getUtilization as jest.Mock).mockResolvedValue({
    data: [
      {
        person_id: 'person-1',
        current_availability_percentage: 0,
        as_of: '2026-03-15',
      },
    ],
  });
  renderPage();

  await waitFor(() => {
    expect(screen.getByTestId('pw-availability')).toHaveTextContent('0%');
  });
  expect(screen.getByTestId('pw-relative')).toHaveTextContent('—');
  expect(screen.getByTestId('pw-remaining')).toHaveTextContent('-30%');
  expect(screen.getByText('No available capacity')).toBeInTheDocument();
});

test('utilization failure hides the percentage and offers retry', async () => {
  (api.people.getUtilization as jest.Mock).mockRejectedValue(new Error('utilization down'));
  renderPage();

  await waitFor(() => {
    expect(screen.getByText(/Could not load capacity/i)).toBeInTheDocument();
  });
  expect(screen.getByTestId('pw-availability')).toHaveTextContent('—');
  expect(screen.getByTestId('pw-relative')).toHaveTextContent('—');
  expect(screen.getByText('Retry')).toBeInTheDocument();
});

test('missing utilization row is data unavailable, not 100% availability', async () => {
  (api.people.getUtilization as jest.Mock).mockResolvedValue({ data: [] });
  renderPage();

  await waitFor(() => {
    expect(screen.getByText(/No utilization row for this person/i)).toBeInTheDocument();
  });
  expect(screen.getByTestId('pw-availability')).toHaveTextContent('—');
  expect(screen.getByTestId('pw-relative')).toHaveTextContent('—');
  expect(screen.getByText('Data unavailable')).toBeInTheDocument();
});

test('row edit saves allocation + dates in one PUT with one expected_version', async () => {
  renderPage();

  await waitFor(() => {
    expect(screen.getAllByRole('button', { name: 'Edit' }).length).toBeGreaterThan(0);
  });

  fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
  fireEvent.change(screen.getByLabelText('Allocation %'), { target: { value: '35' } });
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-02-01' } });
  expect(screen.getByTestId('pw-impact-preview')).toHaveTextContent(/Person: 45% → 60%/);
  await waitFor(() => {
    expect(screen.getByTestId('pw-impact-preview')).toHaveTextContent(/Project Alpha: 20% → 35%/);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => {
    expect(api.assignments.update).toHaveBeenCalledTimes(1);
  });
  expect(api.assignments.update).toHaveBeenCalledWith(
    'a1',
    expect.objectContaining({
      allocation_percentage: 35,
      start_date: '2026-02-01',
      expected_version: 1,
    }),
    { scenarioId: 'baseline-0000-0000-0000-000000000000' }
  );
});

test('409 keeps the row draft and shows an inline conflict message', async () => {
  (api.assignments.update as jest.Mock).mockRejectedValue({ response: { status: 409 } });
  renderPage();

  await waitFor(() => {
    expect(screen.getAllByRole('button', { name: 'Edit' }).length).toBeGreaterThan(0);
  });

  fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
  fireEvent.change(screen.getByLabelText('Allocation %'), { target: { value: '45' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => {
    expect(screen.getByRole('alert')).toHaveTextContent(/changed elsewhere/i);
  });
  expect(screen.getByLabelText('Allocation %')).toHaveValue(45);
});

test('switching scenario disables save and keeps the row draft', async () => {
  const view = renderPage();

  await waitFor(() => {
    expect(screen.getAllByRole('button', { name: 'Edit' }).length).toBeGreaterThan(0);
  });

  fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
  fireEvent.change(screen.getByLabelText('Allocation %'), { target: { value: '45' } });

  mockCurrentScenario = mockScenarios[1];
  view.rerender(pageElement(view.queryClient));

  await waitFor(() => {
    expect(screen.getByText('Scenario changed')).toBeInTheDocument();
  });
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
  expect(screen.getByLabelText('Allocation %')).toHaveValue(45);
});

test('direct assignment deletion requires the baseline-global confirmation', async () => {
  const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
  renderPage();

  await waitFor(() => {
    expect(screen.getAllByRole('button', { name: 'Delete' }).length).toBeGreaterThan(0);
  });

  // Row order: a1 scenario, a2 direct ("Beta"), a3 paused, a4 future
  fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[1]);

  expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('baseline-global'));
  await waitFor(() => {
    expect(api.assignments.delete).toHaveBeenCalledWith(
      'a2',
      { expected_version: 1 },
      { scenarioId: 'baseline-0000-0000-0000-000000000000' }
    );
  });
  await waitFor(() => {
    expect(document.activeElement).toHaveAttribute('data-testid', 'pw-edit-row');
  });
});

test('pause and resume send status with the row version and draft scenario', async () => {
  renderPage();

  await waitFor(() => {
    expect(screen.getAllByRole('button', { name: 'Pause' }).length).toBeGreaterThan(0);
  });

  fireEvent.click(screen.getAllByRole('button', { name: 'Pause' })[0]);
  await waitFor(() => {
    expect(api.assignments.update).toHaveBeenCalledWith(
      'a1',
      expect.objectContaining({ status: 'paused', expected_version: 1 }),
      { scenarioId: 'baseline-0000-0000-0000-000000000000' }
    );
  });

  fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
  await waitFor(() => {
    expect(api.assignments.update).toHaveBeenCalledWith(
      'a3',
      expect.objectContaining({ status: 'active', expected_version: 1 }),
      { scenarioId: 'baseline-0000-0000-0000-000000000000' }
    );
  });
});

test('phase/project rows keep derived dates read-only and edit allocation only', async () => {
  (api.assignments.list as jest.Mock).mockResolvedValue({
    data: {
      data: [
        {
          ...assignments[0],
          id: 'phase-row',
          assignment_date_mode: 'phase',
          start_date: null,
          end_date: null,
          computed_start_date: '2026-02-01',
          computed_end_date: '2026-02-28',
          phase_name: 'Design',
        },
      ],
      pagination: { total: 1 },
    },
  });
  renderPage();

  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  expect(screen.getByLabelText('Allocation %')).toBeInTheDocument();
  expect(screen.queryByLabelText('Start date')).not.toBeInTheDocument();
  expect(screen.getByText(/Dates follow the project\/phase/i)).toBeInTheDocument();
});

/* ===================== 工作台 v2：任务选择弹窗 → ghost → 提交 ===================== */

/** selection=1 行形状（§13.1） */
function selectionTask(overrides: Record<string, unknown>): Record<string, any> {
  return {
    parent_id: null,
    child_count: 0,
    has_children: false,
    lifecycle_state: 'developing',
    project_sub_type_name: 'AR',
    is_ancestor: false,
    timeline_start: null,
    timeline_end: null,
    aspiration_start: null,
    aspiration_finish: null,
    has_phase_timeline: false,
    role_demands: [],
    assigned_summary: [],
    single_person_slots: [],
    ...overrides,
  };
}

const boardTasks = [
  selectionTask({
    id: 'task-parent',
    name: 'SR Parent',
    child_count: 1,
    has_children: true,
    project_sub_type_name: 'SR',
  }),
  selectionTask({
    id: 'task-leaf',
    name: 'Leaf Task',
    parent_id: 'task-parent',
    role_demands: [{ role_id: 'role-se', role_name: 'SE', phase_id: 'phase-design', required_headcount: 1, source: 'template' }],
    assigned_summary: [],
    has_phase_timeline: true,
    timeline_start: '2026-04-01',
    timeline_end: '2026-04-30',
  }),
  selectionTask({
    id: 'task-leaf-2',
    name: 'Leaf Task 2',
    parent_id: 'task-parent',
    role_demands: [{ role_id: 'role-mde', role_name: 'MDE', phase_id: null, required_headcount: null, source: 'unconfigured' }],
    aspiration_start: '2026-05-01',
    aspiration_finish: '2026-05-31',
  }),
  selectionTask({
    id: 'task-terminal',
    name: 'Delivered Task',
    lifecycle_state: 'delivered',
  }),
  selectionTask({
    id: 'task-fixed',
    name: 'Fixed Window Task',
    role_demands: [{ role_id: 'role-se', role_name: 'SE', phase_id: null, required_headcount: 1, source: 'template' }],
  }),
];

function mockBoard(tasks: Record<string, any>[] = boardTasks, total = tasks.length) {
  (api.projects.list as jest.Mock).mockResolvedValue({
    data: { data: tasks, pagination: { page: 1, total, totalPages: 1, has_more: false } },
  });
}

async function openDialog() {
  fireEvent.click(await screen.findByTestId('pw-add-assignment'));
  await screen.findByRole('dialog');
  await screen.findByTestId('pw-task-board');
}

test('dialog: parent/terminal rows locked, leaf selectable; scope=demand by default', async () => {
  mockBoard();
  renderPage();
  await openDialog();

  expect((api.projects.list as jest.Mock).mock.calls.at(-1)?.[0]).toMatchObject({
    selection: '1',
    scope: 'demand',
  });

  // 父行与终态行只有锁；叶子行是复选框
  expect(screen.getByTestId('pw-select-task-task-leaf')).toBeInstanceOf(HTMLInputElement);
  expect(screen.queryByTestId('pw-select-task-task-parent')).not.toBeInTheDocument();
  expect(screen.queryByTestId('pw-select-task-task-terminal')).not.toBeInTheDocument();
  expect(screen.getAllByTitle(/Delivered or cancelled/i).length).toBeGreaterThan(0);

  // scope 切换到 all
  fireEvent.change(screen.getByLabelText('Task scope'), { target: { value: 'all' } });
  await waitFor(() => {
    expect((api.projects.list as jest.Mock).mock.calls.at(-1)?.[0]).toMatchObject({
      selection: '1',
      scope: 'all',
    });
  });
});

test('multi-select → 加入泳道 → ghosts in gantt + commit bar', async () => {
  mockBoard();
  renderPage();
  await openDialog();

  fireEvent.click(screen.getByTestId('pw-select-task-task-leaf'));
  fireEvent.click(screen.getByTestId('pw-select-task-task-fixed'));
  expect(screen.getByTestId('pw-dialog-count')).toHaveTextContent('2');

  // 迷你热区实时进入
  expect(screen.getByTestId('pw-mini-heat')).toBeInTheDocument();

  fireEvent.click(screen.getByTestId('pw-add-to-lane'));

  await waitFor(() => {
    expect(screen.getByTestId('pw-commit-count')).toHaveTextContent('2');
  });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  // 泳道出现 ghost bar（Leaf Task 为 phase 默认模式；fixed 任务无日期 → 未定日期 bar）
  expect(await screen.findAllByTestId('pw-ghost-bar').then((bars) => bars.length)).toBe(2);
});

test('ghost inspector: fixed dates + allocation edit, then sequential create per draft', async () => {
  mockBoard();
  renderPage();
  await openDialog();

  // 统一 fixed 模式并给日期（§6.5 统一参数）
  fireEvent.click(screen.getByTestId('pw-select-task-task-fixed'));
  fireEvent.change(screen.getByLabelText('Unified date mode'), { target: { value: 'fixed' } });
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-04-01' } });
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-04-30' } });
  fireEvent.click(screen.getByTestId('pw-add-to-lane'));

  await screen.findByTestId('pw-commit-bar');
  const ghost = await screen.findByTestId('pw-ghost-bar');
  fireEvent.click(ghost);

  const allocation = await screen.findByLabelText('Allocation %');
  fireEvent.change(allocation, { target: { value: '40' } });
  expect(screen.getByTestId('pw-ghost-impact')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));

  fireEvent.click(screen.getByTestId('pw-confirm-assign'));

  await waitFor(() => {
    expect(api.assignments.create).toHaveBeenCalledTimes(1);
  });
  expect(api.assignments.create).toHaveBeenCalledWith(
    expect.objectContaining({
      project_id: 'task-fixed',
      person_id: 'person-1',
      role_id: 'role-se',
      allocation_percentage: 40,
      assignment_date_mode: 'fixed',
      start_date: '2026-04-01',
      end_date: '2026-04-30',
    }),
    { scenarioId: 'baseline-0000-0000-0000-000000000000' }
  );
  // 全部成功后草稿清空：只剩“撤销创建”条（§11.1 + Phase 3 撤销 CREATE）
  await waitFor(() => {
    expect(screen.getByTestId('pw-undo-create')).toBeInTheDocument();
  });
  expect(screen.getByText(/Created 1 assignments/i)).toBeInTheDocument();

  // 撤销 CREATE：删除刚创建的行（新行 version=1）
  (api.assignments.delete as jest.Mock).mockResolvedValue({ data: { success: true } });
  fireEvent.click(screen.getByTestId('pw-undo-create'));
  await waitFor(() => {
    expect(api.assignments.delete).toHaveBeenCalledWith(
      'new-assignment',
      { expected_version: 1 },
      { scenarioId: 'baseline-0000-0000-0000-000000000000' }
    );
  });
  await waitFor(() => {
    expect(screen.queryByTestId('pw-commit-bar')).not.toBeInTheDocument();
  });
});

test('phase default mode creates with phase_id from the task demand, no manual dates', async () => {
  mockBoard();
  renderPage();
  await openDialog();

  fireEvent.click(screen.getByTestId('pw-select-task-task-leaf'));
  fireEvent.click(screen.getByTestId('pw-add-to-lane'));
  await screen.findByTestId('pw-commit-bar');
  fireEvent.click(screen.getByTestId('pw-confirm-assign'));

  await waitFor(() => {
    expect(api.assignments.create).toHaveBeenCalledTimes(1);
  });
  const payload = (api.assignments.create as jest.Mock).mock.calls[0][0];
  expect(payload).toMatchObject({
    project_id: 'task-leaf',
    assignment_date_mode: 'phase',
    phase_id: 'phase-design',
  });
  expect(payload).not.toHaveProperty('start_date');
  expect(payload).not.toHaveProperty('end_date');
});

test('project-mode draft (aspiration window) sends no raw dates', async () => {
  mockBoard();
  renderPage();
  await openDialog();

  fireEvent.click(screen.getByTestId('pw-select-task-task-leaf-2'));
  fireEvent.click(screen.getByTestId('pw-add-to-lane'));
  await screen.findByTestId('pw-commit-bar');
  fireEvent.click(screen.getByTestId('pw-confirm-assign'));

  await waitFor(() => {
    expect(api.assignments.create).toHaveBeenCalledTimes(1);
  });
  const payload = (api.assignments.create as jest.Mock).mock.calls[0][0];
  expect(payload).toMatchObject({ project_id: 'task-leaf-2', assignment_date_mode: 'project' });
  expect(payload).not.toHaveProperty('start_date');
  expect(payload).not.toHaveProperty('end_date');
});

test('duplicate-key row: checkbox locked, inline edit opens the existing row', async () => {
  // p1/Alpha 已有本人分配（role-se, phase null）；任务 p1 同键 → EDIT 入口
  mockBoard([
    selectionTask({
      id: 'p1',
      name: 'Assigned Task',
      role_demands: [{ role_id: 'role-se', role_name: 'SE', phase_id: null, required_headcount: 1, source: 'template' }],
    }),
  ]);
  renderPage();
  await openDialog();

  expect(screen.queryByTestId('pw-select-task-p1')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Edit existing assignment' }));

  expect(await screen.findByLabelText('Allocation %')).toHaveValue(20);
});

test('SE slot occupied: 替换占用者 → REPLACE ghost with incumbent; explicit confirm before submit', async () => {
  mockBoard([
    selectionTask({
      id: 'task-slot',
      name: 'Slot Task',
      role_demands: [{ role_id: 'role-se', role_name: 'SE', phase_id: null, required_headcount: 1, source: 'template' }],
      single_person_slots: [
        {
          role_id: 'role-se',
          role_name: 'SE',
          incumbent_assignment_id: 'spa-old-se',
          incumbent_person_id: 'person-old',
          incumbent_person_name: 'Old SE',
          incumbent_version: 3,
          incumbent_start_date: '2026-01-01',
          incumbent_end_date: '2026-12-31',
        },
      ],
    }),
  ]);
  renderPage();
  await openDialog();

  fireEvent.click(screen.getByRole('button', { name: 'Replace Old SE' }));
  await screen.findByTestId('pw-commit-bar');

  // 未确认前是 CONFLICT：确认按钮计数为 0
  expect(screen.getByTestId('pw-confirm-assign')).toBeDisabled();

  const ghost = await screen.findByTestId('pw-ghost-bar');
  fireEvent.click(ghost);
  expect(screen.getByTestId('pw-replace-incumbent')).toHaveTextContent('Old SE');
  // 无时间线/无 aspiration 的任务默认 fixed 空日期：补日期才可提交（§16）
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-04-01' } });
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-04-30' } });
  fireEvent.click(screen.getByLabelText(/I confirm deleting the old row/i));
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));

  fireEvent.click(screen.getByTestId('pw-confirm-assign'));
  await waitFor(() => {
    expect(api.assignments.create).toHaveBeenCalledTimes(1);
  });
  expect(api.assignments.create).toHaveBeenCalledWith(
    expect.objectContaining({
      project_id: 'task-slot',
      role_id: 'role-se',
      replace_assignment_id: 'old-se',
      replace_expected_version: 3,
    }),
    { scenarioId: 'baseline-0000-0000-0000-000000000000' }
  );
});

test('partial failure keeps failed ghost; UNKNOWN reconciles via read-back under draft scenario', async () => {
  mockBoard();
  renderPage();
  await openDialog();

  fireEvent.click(screen.getByTestId('pw-select-task-task-leaf'));
  fireEvent.click(screen.getByTestId('pw-select-task-task-leaf-2'));
  fireEvent.click(screen.getByTestId('pw-add-to-lane'));
  await screen.findByTestId('pw-commit-bar');

  // 第一条明确 409；第二条网络断开（无 response）→ UNKNOWN
  (api.assignments.create as jest.Mock)
    .mockRejectedValueOnce({ response: { status: 409, data: { code: 'ASSIGNMENT_DUPLICATE' } } })
    .mockRejectedValueOnce(new Error('Network Error'));

  fireEvent.click(screen.getByTestId('pw-confirm-assign'));

  await waitFor(() => {
    expect(api.assignments.create).toHaveBeenCalledTimes(2);
  });
  // UNKNOWN 回读发生在草稿绑定的原场景
  await waitFor(() => {
    const listCalls = (api.assignments.list as jest.Mock).mock.calls.filter(
      (call) => call[1] && call[1].scenarioId
    );
    expect(listCalls.length).toBeGreaterThan(0);
  });
  // 回读没有同键新行 → 标记失败，失败 ghost 保留
  await waitFor(() => {
    expect(screen.getByTestId('pw-commit-count')).toHaveTextContent('2');
  });
});

test('retry-failed only resubmits the failed row; batch edit applies unified params', async () => {
  mockBoard();
  renderPage();
  await openDialog();

  fireEvent.click(screen.getByTestId('pw-select-task-task-leaf'));
  fireEvent.click(screen.getByTestId('pw-select-task-task-fixed'));
  fireEvent.click(screen.getByTestId('pw-add-to-lane'));
  await screen.findByTestId('pw-commit-bar');

  // 批量编辑：统一比例 33 + 统一 fixed 日期（补齐 fixed 任务的缺日期）
  fireEvent.click(screen.getByTestId('pw-batch-edit'));
  fireEvent.change(screen.getByLabelText('Unified allocation %'), { target: { value: '33' } });
  fireEvent.change(screen.getAllByLabelText('Date mode')[0], { target: { value: 'fixed' } });
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-04-01' } });
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-04-30' } });
  fireEvent.click(screen.getByRole('button', { name: /Apply to 2/i }));
  await waitFor(() => {
    expect(screen.getByText(/Confirm assignments \(2\)/i)).toBeInTheDocument();
  });

  // 第一条 5xx（明确失败，非冲突）、第二条成功 → 重试按钮只重发失败行
  (api.assignments.create as jest.Mock)
    .mockRejectedValueOnce({ response: { status: 500, data: { message: 'boom' } } })
    .mockResolvedValueOnce({ data: { id: 'created-ok' } })
    .mockResolvedValueOnce({ data: { id: 'created-retry' } });
  fireEvent.click(screen.getByTestId('pw-confirm-assign'));
  await waitFor(() => {
    expect(api.assignments.create).toHaveBeenCalledTimes(2);
  });
  const retry = await screen.findByTestId('pw-retry-failed');
  expect(retry).toHaveTextContent(/Retry failed \(1\)/i);

  fireEvent.click(retry);
  await waitFor(() => {
    expect(api.assignments.create).toHaveBeenCalledTimes(3);
  });
});

test('project lane mode: lane click opens the project staffing panel; minimap moves the window', async () => {
  mockBoard();
  renderPage();
  await waitFor(() => {
    expect(screen.getAllByTestId('pw-gantt-bar').length).toBeGreaterThan(0);
  });

  // Phase 3 项目泳道模式：点击 lane 项目名查看全员配置
  const laneLink = screen.getAllByRole('button', { name: /View staffing for/i })[0];
  fireEvent.click(laneLink);
  expect(await screen.findByTestId('pw-project-staffing')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() => {
    expect(screen.queryByTestId('pw-project-staffing')).not.toBeInTheDocument();
  });

  // Phase 3 mini-map：点击第 4 个月桶移动观察窗（范围标签更新）
  const minimap = screen.getByTestId('pw-minimap');
  const months = minimap.querySelectorAll('button');
  expect(months.length).toBeGreaterThanOrEqual(4);
  const originalRange = screen.getByTestId('pw-gantt').textContent;
  fireEvent.click(months[3]);
  await waitFor(() => {
    expect(screen.getByTestId('pw-gantt').textContent).not.toBe(originalRange);
  });
});

test('recent quick add: added tasks resurface as one-click chips', async () => {
  window.localStorage.clear();
  mockBoard();
  renderPage();
  await openDialog();
  fireEvent.click(screen.getByTestId('pw-select-task-task-leaf'));
  fireEvent.click(screen.getByTestId('pw-add-to-lane'));
  await screen.findByTestId('pw-commit-count');

  // 重开弹窗：最近选择里出现刚加的任务，点击即快速加入（命令式快速添加）
  fireEvent.click(screen.getByTestId('pw-add-assignment'));
  await screen.findByTestId('pw-task-board');
  const chip = await screen.findByRole('button', { name: /Quick add Leaf Task/i });
  fireEvent.click(chip);
  await waitFor(() => {
    expect(screen.getByTestId('pw-commit-count')).toHaveTextContent('2');
  });
  window.localStorage.clear();
});

test('scenario switch after adding ghosts: submit disabled until back or discard', async () => {
  mockBoard();
  const view = renderPage();
  await openDialog();
  fireEvent.click(screen.getByTestId('pw-select-task-task-leaf'));
  fireEvent.click(screen.getByTestId('pw-add-to-lane'));
  await screen.findByTestId('pw-commit-bar');

  mockCurrentScenario = mockScenarios[1];
  view.rerender(pageElement(view.queryClient));

  await waitFor(() => {
    expect(screen.getByTestId('pw-draft-scenario-mismatch')).toBeInTheDocument();
  });
  expect(screen.getByTestId('pw-confirm-assign')).toBeDisabled();

  // 回到原场景恢复可提交
  mockCurrentScenario = mockScenarios[0];
  view.rerender(pageElement(view.queryClient));
  await waitFor(() => {
    expect(screen.queryByTestId('pw-draft-scenario-mismatch')).not.toBeInTheDocument();
  });
  expect(screen.getByTestId('pw-confirm-assign')).toBeEnabled();
});

test('ESC closes the dialog and focus returns to the add-assignment button', async () => {
  mockBoard();
  renderPage();
  await openDialog();

  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  await waitFor(() => {
    expect(document.activeElement).toBe(screen.getByTestId('pw-add-assignment'));
  });
});
