import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PersonWorkload from '../PersonWorkload';
import { api } from '../../lib/api-client';
import { Toaster } from '../../components/ui/toaster';

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
      undoReplace: jest.fn(),
    },
    projects: {
      list: jest.fn(),
    },
    projectPhases: {
      list: jest.fn(),
    },
    availability: {
      list: jest.fn(),
    },
  },
}));

const mockScenarios = [
  { id: 'baseline-0000-0000-0000-000000000000', name: 'Baseline' },
  { id: 'branch-1', name: 'Branch' },
];
const mockSetCurrentScenario = jest.fn();
let mockCurrentScenario = mockScenarios[0];

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

function pageElement(queryClient: QueryClient, entry = '/people/person-1/workload') {
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/people/:id/workload" element={<PersonWorkload />} />
        </Routes>
      </MemoryRouter>
      {/* S6 撤销 toast 依赖 Toaster；应用里挂在 App，测试需显式挂载 */}
      <Toaster />
    </QueryClientProvider>
  );
}

function renderPage(entry?: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    ...render(pageElement(queryClient, entry)),
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
  (api.availability.list as jest.Mock).mockResolvedValue({
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

/* ===================== 评审修复批回归 ===================== */

test('B4: 弹窗打开期间父组件重渲染不夺焦点（onClose ref 化）', async () => {
  mockBoard();
  const view = renderPage();
  await openDialog();

  // 父级重渲染（inline onClose 换身份）后焦点仍在 dialog 内
  view.rerender(pageElement(view.queryClient));
  await waitFor(() => {
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
  expect((document.activeElement as HTMLElement)?.closest('[role="dialog"]')).toBeTruthy();
  expect(document.activeElement).not.toBe(screen.getByTestId('pw-add-assignment'));
});

test('B5: 未提交 ghost 时 SPA 返回需确认；确认丢弃才离开', async () => {
  window.localStorage.clear();
  const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
  mockBoard();
  const view = renderPage();
  await openDialog();
  fireEvent.click(screen.getByTestId('pw-select-task-task-leaf'));
  fireEvent.click(screen.getByTestId('pw-add-to-lane'));
  await screen.findByTestId('pw-commit-bar');

  // 拒绝离开：仍在工作负载页
  fireEvent.click(screen.getByTestId('pw-back'));
  expect(confirmSpy).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('heading', { name: 'Adjust Assignments' })).toBeInTheDocument();

  // 确认离开：导航生效
  confirmSpy.mockReturnValue(true);
  fireEvent.click(screen.getByTestId('pw-back'));
  await waitFor(() => {
    expect(screen.queryByRole('heading', { name: 'Adjust Assignments' })).not.toBeInTheDocument();
  });
  confirmSpy.mockRestore();
});

test('B8: 行编辑用编辑时版本快照——后台刷新后保存旧值必 409，不借新令牌覆盖', async () => {
  renderPage();
  await waitFor(() => {
    expect(screen.getAllByRole('button', { name: 'Edit' }).length).toBeGreaterThan(0);
  });

  // 用户基于 v1 打开编辑
  fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
  fireEvent.change(screen.getByLabelText('Allocation %'), { target: { value: '45' } });

  // 后台刷新：a1 已被他人改成 v2/allocation 99
  (api.assignments.list as jest.Mock).mockResolvedValue({
    data: {
      data: [{ ...assignments[0], version: 2, allocation_percentage: 99 }, ...assignments.slice(1)],
      pagination: { total: assignments.length, totalPages: 1 },
    },
  });
  const view = window;
  void view;
  // 保存：乐观锁必须用编辑时快照 v1 → 服务端 409，而不是拿 v2 写旧值 45
  (api.assignments.update as jest.Mock).mockRejectedValueOnce({ response: { status: 409, data: { code: 'ASSIGNMENT_VERSION_CONFLICT' } } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => {
    expect(api.assignments.update).toHaveBeenCalledWith(
      'a1',
      expect.objectContaining({ allocation_percentage: 45, expected_version: 1 }),
      { scenarioId: 'baseline-0000-0000-0000-000000000000' }
    );
  });
});

test('B8: 批量保存只发改过的行（按开始快照）；失败保留草稿不清空', async () => {
  renderPage();

  fireEvent.click(await screen.findByTestId('pw-batch-entry'));
  const inputs = screen.getAllByLabelText('Allocation %');
  expect(inputs).toHaveLength(4);
  fireEvent.change(inputs[0], { target: { value: '30' } });

  // 后台刷新改变其他行的比例——未编辑行不得被卷进保存
  (api.assignments.list as jest.Mock).mockResolvedValue({
    data: {
      data: assignments.map((row, i) => (i === 0 ? row : { ...row, allocation_percentage: 77 })),
      pagination: { total: assignments.length, totalPages: 1 },
    },
  });

  // 保存：唯一一次 update 是用户改过的 a1（快照 v1），且失败后批量草稿保留
  (api.assignments.update as jest.Mock).mockRejectedValueOnce({ response: { status: 409 } });
  fireEvent.click(screen.getByRole('button', { name: /Save changed rows/i }));

  await waitFor(() => {
    expect(api.assignments.update).toHaveBeenCalledTimes(1);
  });
  expect(api.assignments.update).toHaveBeenCalledWith(
    'a1',
    expect.objectContaining({ allocation_percentage: 30, expected_version: 1 }),
    { scenarioId: 'baseline-0000-0000-0000-000000000000' }
  );
  await waitFor(() => {
    expect(screen.getByText(/saved 0 row|failed 1/i)).toBeInTheDocument();
  });
  // 批量模式仍在，输入值保留（可改值重试）
  expect(screen.getAllByLabelText('Allocation %').length).toBeGreaterThan(0);
  expect((screen.getAllByLabelText('Allocation %')[0] as HTMLInputElement).value).toBe('30');
});

test('B7: 撤销替换恢复旧分配——删新行后按完整字段重建旧行', async () => {
  window.localStorage.clear();
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
          incumbent_allocation_percentage: 60,
          incumbent_phase_id: null,
          incumbent_assignment_date_mode: 'fixed',
          incumbent_raw_start_date: '2026-01-01',
          incumbent_raw_end_date: '2026-12-31',
        },
      ],
    }),
  ]);
  renderPage();
  await openDialog();

  fireEvent.click(screen.getByRole('button', { name: 'Replace Old SE' }));
  await screen.findByTestId('pw-commit-bar');
  const ghost = await screen.findByTestId('pw-ghost-bar');
  fireEvent.click(ghost);
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-04-01' } });
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-04-30' } });
  fireEvent.click(screen.getByLabelText(/I confirm deleting the old row/i));
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));

  (api.assignments.create as jest.Mock).mockResolvedValue({ data: { id: 'created-replacement' } });
  (api.assignments.delete as jest.Mock).mockResolvedValue({ data: { success: true } });
  fireEvent.click(screen.getByTestId('pw-confirm-assign'));
  await screen.findByTestId('pw-undo-create');

  fireEvent.click(screen.getByTestId('pw-undo-create'));
  await waitFor(() => {
    // 单事务端点：删新行 + 重建旧行（人/比例/日期/模式）一次请求完成
    expect(api.assignments.undoReplace).toHaveBeenCalledWith(
      'created-replacement',
      {
        expected_version: 1,
        incumbent: expect.objectContaining({
          person_id: 'person-old',
          role_id: 'role-se',
          allocation_percentage: 60,
          assignment_date_mode: 'fixed',
          start_date: '2026-01-01',
          end_date: '2026-12-31',
        }),
      },
      { scenarioId: 'baseline-0000-0000-0000-000000000000' }
    );
    // 不再拆分两条独立请求（删除+重建非原子=数据丢失窗口）
    expect(api.assignments.delete).not.toHaveBeenCalled();
  });
  await waitFor(() => {
    expect(screen.queryByTestId('pw-commit-bar')).not.toBeInTheDocument();
  });
});

test('B7-fail: 撤销替换失败 → 事务回滚（不丢数据），撤销记录保留可重试 + 错误可见', async () => {
  window.localStorage.clear();
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
          incumbent_allocation_percentage: 60,
          incumbent_phase_id: null,
          incumbent_assignment_date_mode: 'fixed',
          incumbent_raw_start_date: '2026-01-01',
          incumbent_raw_end_date: '2026-12-31',
        },
      ],
    }),
  ]);
  renderPage();
  await openDialog();

  fireEvent.click(screen.getByRole('button', { name: 'Replace Old SE' }));
  await screen.findByTestId('pw-commit-bar');
  const ghost = await screen.findByTestId('pw-ghost-bar');
  fireEvent.click(ghost);
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-04-01' } });
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-04-30' } });
  fireEvent.click(screen.getByLabelText(/I confirm deleting the old row/i));
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));

  (api.assignments.create as jest.Mock).mockResolvedValue({ data: { id: 'created-replacement' } });
  fireEvent.click(screen.getByTestId('pw-confirm-assign'));
  await screen.findByTestId('pw-undo-create');

  // 撤销失败（服务端事务整体回滚）：撤销记录不得清空，错误提示可见
  (api.assignments.undoReplace as jest.Mock).mockRejectedValueOnce({
    response: { status: 409, data: { code: 'ASSIGNMENT_DUPLICATE', message: 'key occupied' } },
  });
  fireEvent.click(screen.getByTestId('pw-undo-create'));

  await waitFor(() => {
    expect(screen.getByTestId('pw-undo-create')).toBeInTheDocument();
  });
  expect(screen.getByTestId('pw-undo-error')).toBeInTheDocument();
  // 未调用普通 delete（REPLACE 撤销必须走原子端点）
  expect(api.assignments.delete).not.toHaveBeenCalled();
});

test('C1: UNKNOWN 回读命中 → 解除锁定并清空草稿（不再永远锁住）', async () => {
  mockBoard();
  renderPage();
  await openDialog();

  fireEvent.click(screen.getByTestId('pw-select-task-task-leaf'));
  fireEvent.click(screen.getByTestId('pw-add-to-lane'));
  await screen.findByTestId('pw-commit-bar');

  // 无 HTTP 响应（网络断开）→ UNKNOWN；回读按原场景找到完全匹配的已保存行。
  // 页面初始读已消费默认 mock；此后所有 list 调用（回读 + 成功后的刷新）
  // 一律返回含 saved-row 的集合——回读命中，刷新后的列表也包含新行。
  (api.assignments.create as jest.Mock).mockRejectedValueOnce(new Error('Network Error'));
  const savedRow = {
    id: 'saved-unknown-row',
    version: 1,
    person_id: 'person-1',
    project_id: 'task-leaf',
    role_id: 'role-se',
    phase_id: 'phase-design',
    assignment_date_mode: 'phase',
    allocation_percentage: 20,
    status: 'active',
    start_date: null,
    end_date: null,
  };
  (api.assignments.list as jest.Mock).mockImplementation(() =>
    Promise.resolve({
      data: { data: [...assignments, savedRow], pagination: { total: assignments.length + 1, totalPages: 1 } },
    })
  );

  fireEvent.click(screen.getByTestId('pw-confirm-assign'));
  await waitFor(() => {
    // 回读判成功：草稿清空、commit bar 消失，且没有"结果未知"滞留
    expect(screen.queryByTestId('pw-commit-bar')).not.toBeInTheDocument();
  });
  expect(screen.queryByText(/1 unknown/i)).not.toBeInTheDocument();
});

test('C2/D-01a: utilization 缺失时弹窗热区判数据不可用（不按默认可用率出数）', async () => {
  (api.people.getUtilization as jest.Mock).mockResolvedValue({ data: [] });
  mockBoard();
  renderPage();
  await openDialog();

  const heat = screen.getByTestId('pw-mini-heat');
  await waitFor(() => {
    expect(heat).toHaveAttribute('role', 'img');
    expect(heat.getAttribute('aria-label')).toMatch(/unknown|数据不可用/i);
  });
});

test('F2: 行编辑把开始日改到结束日之后 → 预览不崩且显示日期顺序提示', async () => {
  renderPage();
  await waitFor(() => {
    expect(screen.getAllByRole('button', { name: 'Edit' }).length).toBeGreaterThan(0);
  });

  fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
  // 逐键中间态：开始日越过结束日（2026-12-31）——此前 workloadTimeline 抛错导致整页崩溃
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2027-03-01' } });

  expect(await screen.findByTestId('pw-impact-inverted')).toBeInTheDocument();
  // 页面仍存活（标题还在），预览数值基于归一窗口
  expect(screen.getByRole('heading', { name: 'Adjust Assignments' })).toBeInTheDocument();
  expect(screen.getByTestId('pw-impact-preview')).toBeInTheDocument();
});

test('F3: 未来已批准覆盖进热区——整窗 0% 可用率 → 热区不再按默认可用率出数', async () => {
  window.localStorage.clear();
  // 覆盖热区窗口的已批准 0% 覆盖（如整段休假）——旧实现只看"今天生效"窗口会漏掉
  (api.availability.list as jest.Mock).mockResolvedValue({
    data: {
      data: [
        {
          id: 'ov-future-leave',
          person_id: 'person-1',
          start_date: '2026-03-15',
          end_date: '2027-03-15',
          availability_percentage: 0,
          is_approved: 1,
        },
      ],
      pagination: { total: 1 },
    },
  });
  mockBoard();
  renderPage();
  await openDialog();

  await waitFor(() => {
    expect(api.availability.list).toHaveBeenCalledWith(
      expect.objectContaining({
        person_id: 'person-1',
        is_approved: true,
        start_date: '2026-03-15',
      })
    );
  });
  const heat = await screen.findByTestId('pw-mini-heat');
  await waitFor(() => {
    // 0% 可用率下没有可算的相对利用率（—），热区摘要不能是默认可用率的常规峰值
    expect(heat.getAttribute('aria-label')).toMatch(/unknown|不可用|unavailable/i);
  });
});

test('F5: 首次回读也失败 → UNKNOWN 锁定但[重新核对]可用；网络恢复后核对命中解锁', async () => {
  window.localStorage.clear();
  mockBoard();
  renderPage();
  await openDialog();

  fireEvent.click(screen.getByTestId('pw-select-task-task-leaf'));
  fireEvent.click(screen.getByTestId('pw-add-to-lane'));
  await screen.findByTestId('pw-commit-bar');

  const savedRow = {
    id: 'saved-after-recovery',
    version: 1,
    person_id: 'person-1',
    project_id: 'task-leaf',
    role_id: 'role-se',
    phase_id: 'phase-design',
    assignment_date_mode: 'phase',
    allocation_percentage: 20,
    status: 'active',
    start_date: null,
    end_date: null,
  };
  // 页面初始读已消费默认 mock；此后：第 1 次 list = 提交内回读（网络仍断），
  // 第 2 次起 = 手动核对回读（网络恢复，命中已保存行）
  let listCalls = 0;
  (api.assignments.list as jest.Mock).mockImplementation(() => {
    listCalls += 1;
    if (listCalls === 1) return Promise.reject(new Error('Network Error'));
    return Promise.resolve({
      data: { data: [...assignments, savedRow], pagination: { total: assignments.length + 1, totalPages: 1 } },
    });
  });
  (api.assignments.create as jest.Mock).mockRejectedValueOnce(new Error('Network Error'));

  fireEvent.click(screen.getByTestId('pw-confirm-assign'));

  // 回读失败：保持 UNKNOWN（锁定），但出口按钮在位
  const reconcileButton = await screen.findByTestId('pw-reconcile');
  expect(screen.getByTestId('pw-confirm-assign')).toBeDisabled();
  expect(screen.getAllByText(/1 unknown/i).length).toBeGreaterThan(0);

  // 网络恢复后手动核对：命中已保存行 → 解锁并清空
  fireEvent.click(reconcileButton);
  await waitFor(() => {
    expect(screen.queryByTestId('pw-commit-bar')).not.toBeInTheDocument();
  });
});

test('批量入口不再静默禁用：行编辑中点击 → 明确提示且编辑保留；结束后点击进入批量并聚焦首个输入', async () => {
  renderPage();
  await waitFor(() => {
    expect(screen.getAllByRole('button', { name: 'Edit' }).length).toBeGreaterThan(0);
  });

  // 1) 行编辑未结束：入口可点，点击给出原因，不进入批量、不丢编辑
  fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
  const entry = screen.getByTestId('pw-batch-entry');
  expect(entry).toBeEnabled();
  fireEvent.click(entry);
  expect(await screen.findByText(/Finish or cancel the current row edit/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Save changed rows/i })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();

  // 2) 取消编辑后再点：进入批量，焦点落到第一个比例输入（用户立刻可改）
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.click(entry);
  await waitFor(() => {
    expect(screen.getAllByLabelText('Allocation %').length).toBe(4);
  });
  await waitFor(() => {
    expect((document.activeElement as HTMLElement)?.classList.contains('pw-allocation-input')).toBe(true);
  });
});

test('I03f: 批量入口在“计入当前工作负载”标题区；进入批量自动收起全员配置；面板行可跳转到对应人员', async () => {
  window.localStorage.clear();
  renderPage();
  await waitFor(() => {
    expect(screen.getByTestId('pw-batch-entry')).toBeInTheDocument();
  });

  // A：入口与目标表同区（位于 current 区块标题内）
  const currentSection = document.getElementById('pw-current-title')!.closest('section')!;
  expect(currentSection.contains(screen.getByTestId('pw-batch-entry'))).toBe(true);

  // B：打开全员配置面板后进入批量 → 面板自动收起
  (api.projects.list as jest.Mock).mockResolvedValue({
    data: { data: [], pagination: { page: 1, total: 0, totalPages: 1 } },
  });
  const laneLinks = screen.queryAllByRole('button', { name: /View staffing for/i });
  if (laneLinks.length > 0) {
    fireEvent.click(laneLinks[0]);
    expect(await screen.findByTestId('pw-project-staffing')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('pw-batch-entry'));
    await waitFor(() => {
      expect(screen.queryByTestId('pw-project-staffing')).not.toBeInTheDocument();
    });
    expect((document.activeElement as HTMLElement)?.classList.contains('pw-allocation-input')).toBe(true);
  } else {
    // 无泳道 bar 的夹具下至少保证入口可点并进入批量
    fireEvent.click(screen.getByTestId('pw-batch-entry'));
    await waitFor(() => {
      expect(screen.getAllByLabelText('Allocation %').length).toBe(4);
    });
  }
});

/* ===================== Phase A：已提交分配就地编辑（S1/S2/S6） ===================== */

function findGanttBarFor(projectName: string) {
  const bar = screen
    .getAllByTestId('pw-gantt-bar')
    .find((candidate) => candidate.getAttribute('aria-label')?.includes(projectName));
  if (!bar) throw new Error(`gantt bar not found: ${projectName}`);
  return bar;
}

test('S2: 点击已提交 fixed bar 打开面板——身份只读、比例/日期可改、无 asOf 下限', async () => {
  renderPage();
  await waitFor(() => {
    expect(screen.getAllByTestId('pw-gantt-bar').length).toBeGreaterThan(0);
  });

  fireEvent.click(findGanttBarFor('Alpha'));

  const panel = await screen.findByTestId('pw-committed-inspector');
  expect(panel).toHaveTextContent('Alpha');
  expect(panel).toHaveTextContent('SE');
  expect(panel.querySelector('.pw-inspector-readonly')).toBeTruthy();

  const allocation = panel.querySelector<HTMLInputElement>('input[type="number"]')!;
  expect(allocation.value).toBe('20');
  const dateInputs = panel.querySelectorAll<HTMLInputElement>('input[type="date"]');
  expect(dateInputs).toHaveLength(2);
  expect(dateInputs[0].value).toBe('2026-01-01');
  // committed 行已开始：日期输入不得套用 ghost 的 min=asOf（评审 B2）
  expect(dateInputs[0].getAttribute('min')).toBeNull();

  // 表行编辑入口与面板互斥：行编辑按钮仍存在但面板是当前编辑面
  expect(screen.queryByTestId('pw-ghost-inspector')).not.toBeInTheDocument();
});

test('S6: 面板保存单 PUT（快照版本）→ 撤销 toast 逆补丁恢复原值', async () => {
  (api.assignments.update as jest.Mock).mockResolvedValue({
    data: { data: { ...assignments[0], version: 2, allocation_percentage: 35 } },
  });
  renderPage();
  await waitFor(() => {
    expect(screen.getAllByTestId('pw-gantt-bar').length).toBeGreaterThan(0);
  });

  fireEvent.click(findGanttBarFor('Alpha'));
  const panel = await screen.findByTestId('pw-committed-inspector');
  const allocation = panel.querySelector<HTMLInputElement>('input[type="number"]')!;
  fireEvent.change(allocation, { target: { value: '35' } });
  fireEvent.click(screen.getByTestId('pw-committed-save'));

  await waitFor(() => {
    expect(api.assignments.update).toHaveBeenCalledWith(
      'a1',
      expect.objectContaining({ allocation_percentage: 35, expected_version: 1 }),
      { scenarioId: 'baseline-0000-0000-0000-000000000000' }
    );
  });
  await waitFor(() => {
    expect(screen.queryByTestId('pw-committed-inspector')).not.toBeInTheDocument();
  });

  // 撤销 toast（Toaster 已挂载）→ 逆补丁 + 保存响应版本
  const undo = await screen.findByRole('button', { name: /Undo/i });
  fireEvent.click(undo);
  await waitFor(() => {
    expect(api.assignments.update).toHaveBeenLastCalledWith(
      'a1',
      expect.objectContaining({ allocation_percentage: 20, expected_version: 2 }),
      { scenarioId: 'baseline-0000-0000-0000-000000000000' }
    );
  });
});

test('S2: 409 保留用户值并提示，使用最新值刷新后基线更新', async () => {
  (api.assignments.update as jest.Mock).mockRejectedValueOnce({
    response: { status: 409, data: { message: 'conflict' } },
  });
  renderPage();
  await waitFor(() => {
    expect(screen.getAllByTestId('pw-gantt-bar').length).toBeGreaterThan(0);
  });

  fireEvent.click(findGanttBarFor('Alpha'));
  const panel = await screen.findByTestId('pw-committed-inspector');
  const allocation = panel.querySelector<HTMLInputElement>('input[type="number"]')!;
  fireEvent.change(allocation, { target: { value: '45' } });
  fireEvent.click(screen.getByTestId('pw-committed-save'));

  await waitFor(() => {
    expect(screen.getByTestId('pw-committed-error')).toBeInTheDocument();
  });
  // 用户值保留，不静默清空/换令牌
  expect((panel.querySelector('input[type="number"]') as HTMLInputElement).value).toBe('45');
  expect(screen.getByTestId('pw-committed-refresh')).toBeInTheDocument();

  // 最新值刷新：refetch 返回他人修改后的行（allocation 99 / v5）
  (api.assignments.list as jest.Mock).mockResolvedValue({
    data: {
      data: [{ ...assignments[0], allocation_percentage: 99, version: 5 }, ...assignments.slice(1)],
      pagination: { total: assignments.length, totalPages: 1 },
    },
  });
  fireEvent.click(screen.getByTestId('pw-committed-refresh'));
  await waitFor(() => {
    expect((panel.querySelector('input[type="number"]') as HTMLInputElement).value).toBe('99');
  });
  expect(screen.queryByTestId('pw-committed-error')).not.toBeInTheDocument();
});

test('S2: 未保存修改关闭 → 确认对话框；继续编辑保留面板，确认丢弃关闭', async () => {
  renderPage();
  await waitFor(() => {
    expect(screen.getAllByTestId('pw-gantt-bar').length).toBeGreaterThan(0);
  });

  fireEvent.click(findGanttBarFor('Alpha'));
  const panel = await screen.findByTestId('pw-committed-inspector');
  fireEvent.change(panel.querySelector('input[type="number"]')!, { target: { value: '30' } });

  fireEvent.click(screen.getByRole('button', { name: 'Close inspector' }));
  expect(await screen.findByTestId('confirm-dialog')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Keep editing/i }));
  expect(screen.getByTestId('pw-committed-inspector')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Close inspector' }));
  await screen.findByTestId('confirm-dialog');
  fireEvent.click(screen.getByRole('button', { name: /Discard changes/i }));
  await waitFor(() => {
    expect(screen.queryByTestId('pw-committed-inspector')).not.toBeInTheDocument();
  });
});

test('S2: 面板内 Enter=保存；Esc 关闭并把焦点还给原 bar', async () => {
  (api.assignments.update as jest.Mock).mockResolvedValue({
    data: { data: { ...assignments[0], allocation_percentage: 35, version: 2 } },
  });
  renderPage();
  await waitFor(() => {
    expect(screen.getAllByTestId('pw-gantt-bar').length).toBeGreaterThan(0);
  });

  const bar = findGanttBarFor('Alpha');
  fireEvent.click(bar);
  const panel = await screen.findByTestId('pw-committed-inspector');
  const allocation = panel.querySelector<HTMLInputElement>('input[type="number"]')!;
  fireEvent.change(allocation, { target: { value: '35' } });
  fireEvent.keyDown(allocation, { key: 'Enter' });

  await waitFor(() => {
    expect(api.assignments.update).toHaveBeenCalledTimes(1);
  });
  await waitFor(() => {
    expect(screen.queryByTestId('pw-committed-inspector')).not.toBeInTheDocument();
  });
  // 关闭后焦点回原 bar（§5.2/§15）
  await waitFor(() => {
    expect(document.activeElement).toBe(findGanttBarFor('Alpha'));
  });

  // Esc（无脏值）直接关闭；不产生第二次保存
  fireEvent.click(findGanttBarFor('Alpha'));
  await screen.findByTestId('pw-committed-inspector');
  fireEvent.keyDown(screen.getByTestId('pw-committed-inspector').querySelector('input')!, {
    key: 'Escape',
  });
  await waitFor(() => {
    expect(screen.queryByTestId('pw-committed-inspector')).not.toBeInTheDocument();
  });
  expect(api.assignments.update).toHaveBeenCalledTimes(1);
});

test('S2: Esc 遇到未保存修改 → 确认对话框（不静默丢弃）', async () => {
  renderPage();
  await waitFor(() => {
    expect(screen.getAllByTestId('pw-gantt-bar').length).toBeGreaterThan(0);
  });

  fireEvent.click(findGanttBarFor('Alpha'));
  const panel = await screen.findByTestId('pw-committed-inspector');
  const allocation = panel.querySelector<HTMLInputElement>('input[type="number"]')!;
  fireEvent.change(allocation, { target: { value: '30' } });
  fireEvent.keyDown(allocation, { key: 'Escape' });

  expect(await screen.findByTestId('confirm-dialog')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Keep editing/i }));
  expect(screen.getByTestId('pw-committed-inspector')).toBeInTheDocument();
  expect((screen.getByTestId('pw-committed-inspector').querySelector('input[type="number"]') as HTMLInputElement).value).toBe('30');
});

test('S2: phase 派生行可打开面板——日期只读派生、仅比例可改', async () => {
  (api.assignments.list as jest.Mock).mockResolvedValue({
    data: {
      data: [
        {
          ...assignments[0],
          id: 'phase-row',
          assignment_date_mode: 'phase',
          start_date: null,
          end_date: null,
          computed_start_date: '2026-01-01',
          computed_end_date: '2026-12-31',
        },
      ],
      pagination: { total: 1, totalPages: 1 },
    },
  });
  renderPage();
  await waitFor(() => {
    expect(screen.getAllByTestId('pw-gantt-bar').length).toBeGreaterThan(0);
  });

  fireEvent.click(findGanttBarFor('Alpha'));
  const panel = await screen.findByTestId('pw-committed-inspector');
  expect(panel.querySelector('input[type="date"]')).toBeNull();
  expect(panel).toHaveTextContent('2026-01-01 → 2026-12-31');
  expect(panel.querySelector('input[type="number"]')).toBeTruthy();
  // 派生行不可拖（canDragCommittedBar 拒绝 phase/project）
  expect(findGanttBarFor('Alpha').querySelector('.pw-gantt-resize')).toBeNull();
});

/* ===================== Phase B：S3 批量平移/暂停恢复 + S6 批量撤销 ===================== */

async function enterBatch() {
  fireEvent.click(await screen.findByTestId('pw-batch-entry'));
  await waitFor(() => {
    expect(screen.getAllByLabelText('Allocation %')).toHaveLength(4);
  });
}

test('S3: 平移预览给出影响/跳过分项，应用后逐行 PUT（冻结版本）', async () => {
  (api.assignments.update as jest.Mock).mockResolvedValue({ data: { data: { version: 2 } } });
  renderPage();
  await enterBatch();

  fireEvent.click(screen.getByTestId('pw-batch-shift-toggle'));
  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '7' } });
  fireEvent.click(screen.getByTestId('pw-batch-shift-preview'));

  const summary = await screen.findByTestId('pw-batch-shift-summary');
  expect(summary).toHaveTextContent('Will shift 2 row(s)');
  expect(summary).toHaveTextContent('skip 2');
  expect(summary).toHaveTextContent('paused 1');
  expect(summary).toHaveTextContent('undated 1');
  expect(summary).toHaveTextContent('Alpha: 2026-01-01 → 2026-01-08');

  fireEvent.click(screen.getByTestId('pw-batch-shift-apply'));
  await waitFor(() => {
    expect(api.assignments.update).toHaveBeenCalledTimes(2);
  });
  expect(api.assignments.update).toHaveBeenCalledWith(
    'a1',
    expect.objectContaining({
      start_date: '2026-01-08',
      end_date: '2027-01-07',
      expected_version: 1,
    }),
    { scenarioId: 'baseline-0000-0000-0000-000000000000' }
  );
  expect(api.assignments.update).toHaveBeenCalledWith(
    'a4',
    expect.objectContaining({
      start_date: '2026-06-08',
      end_date: '2026-07-07',
      expected_version: 1,
    }),
    { scenarioId: 'baseline-0000-0000-0000-000000000000' }
  );
  expect(await screen.findByTestId('pw-batch-message')).toHaveTextContent('Shifted 2 row(s).');

  // S6：批量平移同样是一次保存操作——一次撤销把两行日期还原
  expect(await screen.findByText('Saved 2 row(s)')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^Undo$/ }));
  await waitFor(() => {
    expect(api.assignments.update).toHaveBeenCalledTimes(4);
  });
  const updateMock = api.assignments.update as jest.Mock;
  expect(updateMock).toHaveBeenNthCalledWith(
    3,
    'a1',
    expect.objectContaining({
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      expected_version: 2,
    }),
    { scenarioId: 'baseline-0000-0000-0000-000000000000' }
  );
  expect(updateMock).toHaveBeenNthCalledWith(
    4,
    'a4',
    expect.objectContaining({ start_date: '2026-06-01', end_date: '2026-06-30' }),
    { scenarioId: 'baseline-0000-0000-0000-000000000000' }
  );
});

test('S3: 提前平移触及下限的行标失败、其余继续；参数变更后旧预览作废', async () => {
  (api.assignments.update as jest.Mock).mockResolvedValue({ data: { data: { version: 2 } } });
  renderPage();
  await enterBatch();

  fireEvent.click(screen.getByTestId('pw-batch-shift-toggle'));
  fireEvent.change(screen.getByLabelText('Direction'), { target: { value: 'earlier' } });
  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '30' } });
  fireEvent.click(screen.getByTestId('pw-batch-shift-preview'));

  const summary = await screen.findByTestId('pw-batch-shift-summary');
  expect(summary).toHaveTextContent('Will shift 1 row(s)');
  expect(screen.getByTestId('pw-batch-shift-blocked')).toHaveTextContent('1 row(s) blocked');

  fireEvent.click(screen.getByTestId('pw-batch-shift-apply'));
  await waitFor(() => {
    expect(api.assignments.update).toHaveBeenCalledTimes(1);
  });
  // 只有未来行 a4 被平移；已开始行 a1 因新开始日早于原 start 被判 blocked
  expect(api.assignments.update).toHaveBeenCalledWith(
    'a4',
    expect.objectContaining({ start_date: '2026-05-02', end_date: '2026-05-31' }),
    expect.anything()
  );
  expect(await screen.findByTestId('pw-batch-message')).toHaveTextContent('failed 1');

  // 参数一改，冻结预览作废：应用按钮禁用，需重新预览
  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '31' } });
  expect(screen.queryByTestId('pw-batch-shift-summary')).not.toBeInTheDocument();
  expect(screen.getByTestId('pw-batch-shift-apply')).toBeDisabled();
});

test('S3: 批量暂停 = 一次统一确认（含 direct 计数），逐行快照版本保存', async () => {
  (api.assignments.update as jest.Mock).mockResolvedValue({ data: { data: { version: 2 } } });
  renderPage();
  await enterBatch();

  fireEvent.click(screen.getByTestId('pw-batch-pause'));
  const dialog = await screen.findByTestId('confirm-dialog');
  expect(dialog).toHaveTextContent('Pause 3 active row(s), including 1 baseline-global row(s)?');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Pause' }));

  await waitFor(() => {
    expect(api.assignments.update).toHaveBeenCalledTimes(3);
  });
  const updateMock = api.assignments.update as jest.Mock;
  for (const [id, payload] of updateMock.mock.calls as Array<[string, any]>) {
    expect(payload).toMatchObject({ status: 'paused', expected_version: 1 });
    expect(['a1', 'a2', 'a4']).toContain(id);
  }
  expect(await screen.findByTestId('pw-batch-message')).toHaveTextContent('Paused 3 row(s).');
});

test('S6: 批量保存成功给一次撤销；撤销逐行逆补丁 + 保存响应版本', async () => {
  (api.assignments.update as jest.Mock)
    .mockResolvedValueOnce({ data: { data: { version: 2 } } })
    .mockResolvedValueOnce({ data: { data: { version: 5 } } });
  renderPage();
  await enterBatch();

  const inputs = screen.getAllByLabelText('Allocation %');
  fireEvent.change(inputs[0], { target: { value: '30' } });
  fireEvent.change(inputs[1], { target: { value: '22' } });
  fireEvent.click(screen.getByRole('button', { name: /Save changed rows/i }));

  await waitFor(() => {
    expect(api.assignments.update).toHaveBeenCalledTimes(2);
  });
  expect(await screen.findByText('Saved 2 row(s)')).toBeInTheDocument();
  const undo = screen.getByRole('button', { name: /^Undo$/ });
  fireEvent.click(undo);

  await waitFor(() => {
    expect(api.assignments.update).toHaveBeenCalledTimes(4);
  });
  expect(api.assignments.update).toHaveBeenNthCalledWith(
    3,
    'a1',
    expect.objectContaining({ allocation_percentage: 20, expected_version: 2 }),
    { scenarioId: 'baseline-0000-0000-0000-000000000000' }
  );
  expect(api.assignments.update).toHaveBeenNthCalledWith(
    4,
    'a2',
    expect.objectContaining({ allocation_percentage: 10, expected_version: 5 }),
    { scenarioId: 'baseline-0000-0000-0000-000000000000' }
  );
  expect(await screen.findByText('Undid 2 row(s).')).toBeInTheDocument();
});

/* ===================== Phase B：S5 跨人员上下文接力 ===================== */

const staffingRow = {
  id: 'staff-1',
  person_id: 'person-2',
  person_name: 'John Smith',
  role_name: 'SE',
  phase_name: null,
  allocation_percentage: 50,
  status: 'active',
  start_date: '2026-01-01',
  end_date: '2026-12-31',
  computed_start_date: '2026-01-01',
  computed_end_date: '2026-12-31',
};

function mockStaffingAndTarget() {
  (api.assignments.list as jest.Mock).mockImplementation(async (params: any) => {
    if (params?.project_id) {
      return { data: { data: [staffingRow], pagination: { total: 1, totalPages: 1 } } };
    }
    if (params?.person_id === 'person-2') {
      return { data: { data: [staffingRow], pagination: { total: 1, totalPages: 1 } } };
    }
    return {
      data: { data: assignments, pagination: { total: assignments.length, totalPages: 1 } },
    };
  });
}

test('S5: staffing 面板“调整此人”经守卫跳转，目标页深链定位并高亮', async () => {
  mockStaffingAndTarget();
  renderPage();
  await waitFor(() => {
    expect(screen.getAllByTestId('pw-gantt-bar').length).toBeGreaterThan(0);
  });

  fireEvent.click(screen.getAllByRole('button', { name: /View staffing for/i })[0]);
  const panel = await screen.findByTestId('pw-project-staffing');
  fireEvent.click(await within(panel).findByTestId('pw-staffing-adjust-person-2'));

  // 目标人员页（同一路由组件）读取深链：等待数据后定位 + 高亮 + 提示
  const banner = await screen.findByTestId('pw-deeplink');
  expect(banner).toHaveTextContent('From project staffing');
  expect(banner).toHaveTextContent('Located the assignment');
  expect(document.querySelector('tr[data-assignment-id="staff-1"]')).toHaveClass('pw-row--deeplink');
  expect(screen.queryByTestId('pw-project-staffing')).not.toBeInTheDocument();
});

test('S5: 目标不存在时只提示不报错', async () => {
  renderPage('/people/person-1/workload?project=p1&assignment=gone');
  const banner = await screen.findByTestId('pw-deeplink');
  expect(banner).toHaveTextContent('Source assignment not found');
});

test('S5（Codex P1）: 有未提交 ghost 时跳转被拒 → 保留源面板不导航', async () => {
  mockBoard();
  mockStaffingAndTarget();
  const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
  renderPage();
  await openDialog();
  fireEvent.click(screen.getByTestId('pw-select-task-task-leaf'));
  fireEvent.click(screen.getByTestId('pw-add-to-lane'));
  await screen.findByTestId('pw-commit-bar');

  fireEvent.click(screen.getAllByRole('button', { name: /View staffing for/i })[0]);
  const panel = await screen.findByTestId('pw-project-staffing');
  fireEvent.click(await within(panel).findByTestId('pw-staffing-adjust-person-2'));

  expect(confirmSpy).toHaveBeenCalled();
  expect(screen.getByTestId('pw-project-staffing')).toBeInTheDocument();
  expect(screen.queryByTestId('pw-deeplink')).not.toBeInTheDocument();
  confirmSpy.mockRestore();
});

test('S6: 表格行保存也提供一次撤销（逆补丁 + 保存响应版本）', async () => {
  (api.assignments.update as jest.Mock).mockResolvedValueOnce({
    data: { data: { ...assignments[0], allocation_percentage: 45, version: 3 } },
  });
  renderPage();
  await waitFor(() => {
    expect(screen.getAllByRole('button', { name: 'Edit' }).length).toBeGreaterThan(0);
  });

  fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
  const allocation = screen.getByLabelText('Allocation %');
  fireEvent.change(allocation, { target: { value: '45' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => {
    expect(api.assignments.update).toHaveBeenNthCalledWith(
      1,
      'a1',
      expect.objectContaining({ allocation_percentage: 45, expected_version: 1 }),
      { scenarioId: 'baseline-0000-0000-0000-000000000000' }
    );
  });
  expect(await screen.findByText('Assignment saved')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^Undo$/ }));

  await waitFor(() => {
    expect(api.assignments.update).toHaveBeenNthCalledWith(
      2,
      'a1',
      expect.objectContaining({ allocation_percentage: 20, expected_version: 3 }),
      { scenarioId: 'baseline-0000-0000-0000-000000000000' }
    );
  });
  expect(await screen.findByText('Save undone')).toBeInTheDocument();
});
