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
    project_id: 'p1',
    project_name: 'Alpha',
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
    project_id: 'p2',
    project_name: 'Beta',
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
    project_id: 'p3',
    project_name: 'Gamma',
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
    project_id: 'p4',
    project_name: 'Delta',
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

  expect(screen.getByText('Alpha')).toBeInTheDocument();
  expect(screen.getByText('Beta')).toBeInTheDocument();
  expect(screen.getByText('Baseline (global)')).toBeInTheDocument();
  expect(screen.getAllByText('Current scenario').length).toBeGreaterThan(0);
  expect(screen.getByText('Paused')).toBeInTheDocument();
  expect(screen.getByText('Not started')).toBeInTheDocument();
  expect(screen.queryByText('Gamma')).toBeInTheDocument();
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
  expect(screen.getByTestId('pw-impact-preview')).toHaveTextContent(/Person: 30% → 45%/);
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

const taskTree = [
  {
    id: 'task-root',
    name: 'SR Parent',
    parent_id: null,
    child_count: 1,
    project_sub_type_name: 'SR',
    lifecycle_state: 'developing',
    include_in_demand: 1,
  },
  {
    id: 'task-leaf',
    name: 'Leaf Task',
    parent_id: 'task-root',
    child_count: 0,
    project_sub_type_name: 'AR',
    lifecycle_state: 'developing',
    include_in_demand: 1,
    start_date: '2026-03-01',
    end_date: '2026-03-31',
  },
  {
    id: 'task-leaf-2',
    name: 'Leaf Task 2',
    parent_id: 'task-root',
    child_count: 0,
    project_sub_type_name: 'AR',
    lifecycle_state: 'developing',
    include_in_demand: 1,
    start_date: '2026-04-01',
    end_date: '2026-04-30',
  },
];

test('task picker disables SR parent and adds a leaf in one create request', async () => {
  (api.projects.list as jest.Mock).mockResolvedValue({
    data: { data: taskTree, pagination: { total: 2, has_more: false } },
  });
  renderPage();

  const parent = await screen.findByRole('treeitem', { name: /SR Parent/i });
  expect(parent).toHaveAttribute('aria-expanded', 'true');

  const leaf = screen.getByRole('treeitem', { name: /^Leaf Task AR/i });
  fireEvent.click(leaf);

  await waitFor(() => {
    expect(screen.getByRole('button', { name: /^Add$/i })).toBeInTheDocument();
  });
  expect(screen.getByTestId('pw-impact-preview')).toHaveTextContent(/Person: 30% → 50%/);
  expect(screen.getByTestId('pw-impact-preview')).toHaveTextContent(/Project Leaf Task: 0% → 20%/);
  fireEvent.change(screen.getByLabelText('Allocation %'), { target: { value: '40' } });
  fireEvent.click(screen.getByRole('button', { name: /^Add$/i }));

  await waitFor(() => {
    expect(api.assignments.create).toHaveBeenCalledTimes(1);
  });
  expect(api.assignments.create).toHaveBeenCalledWith(
    expect.objectContaining({
      project_id: 'task-leaf',
      person_id: 'person-1',
      role_id: 'role-se',
      allocation_percentage: 40,
      assignment_date_mode: 'fixed',
      start_date: '2026-03-01',
      end_date: '2026-03-31',
    }),
    { scenarioId: 'baseline-0000-0000-0000-000000000000' }
  );
});

test('task scope switches from demand delivery to all assignable', async () => {
  (api.projects.list as jest.Mock).mockResolvedValue({
    data: { data: taskTree, pagination: { total: 2, has_more: false } },
  });
  renderPage();

  await screen.findByRole('treeitem', { name: /^Leaf Task AR/i });
  fireEvent.change(screen.getByLabelText('Task scope'), { target: { value: 'all' } });

  await waitFor(() => {
    const lastCall = (api.projects.list as jest.Mock).mock.calls.at(-1)?.[0];
    expect(lastCall).not.toHaveProperty('include_in_demand');
    expect(lastCall).toMatchObject({ slim: '1', include_ancestors: '1' });
  });
});

test('handover sends successor/effective date/allocation with one expected_version', async () => {
  renderPage();

  await waitFor(() => {
    expect(screen.getAllByRole('button', { name: 'Hand over' }).length).toBeGreaterThan(0);
  });
  fireEvent.click(screen.getAllByRole('button', { name: 'Hand over' })[0]);

  expect(await screen.findByLabelText('Successor')).toHaveValue('person-2');
  expect(screen.getByLabelText('Effective date')).toHaveValue('2026-03-15');
  fireEvent.click(screen.getByRole('button', { name: 'Confirm handover' }));

  await waitFor(() => {
    expect(api.assignments.handover).toHaveBeenCalledWith(
      'a1',
      {
        successor_person_id: 'person-2',
        effective_date: '2026-03-15',
        allocation_percentage: 20,
        expected_version: 1,
      },
      { scenarioId: 'baseline-0000-0000-0000-000000000000' }
    );
  });
  expect(await screen.findByText('Assignment handed over.')).toBeInTheDocument();
});

test('batch adjust saves each dirty row with its own version and scenario', async () => {
  renderPage();

  fireEvent.click(await screen.findByRole('button', { name: /Batch adjust allocations/i }));
  const inputs = screen.getAllByLabelText('Allocation %');
  expect(inputs).toHaveLength(4);
  fireEvent.change(inputs[0], { target: { value: '30' } });
  fireEvent.change(inputs[1], { target: { value: '15' } });
  fireEvent.click(screen.getByRole('button', { name: /Save changed rows/i }));

  await waitFor(() => {
    expect(api.assignments.update).toHaveBeenCalledTimes(2);
  });
  expect(api.assignments.update).toHaveBeenNthCalledWith(
    1,
    'a1',
    expect.objectContaining({ allocation_percentage: 30, expected_version: 1 }),
    { scenarioId: 'baseline-0000-0000-0000-000000000000' }
  );
  expect(api.assignments.update).toHaveBeenNthCalledWith(
    2,
    'a2',
    expect.objectContaining({ allocation_percentage: 15, expected_version: 1 }),
    { scenarioId: 'baseline-0000-0000-0000-000000000000' }
  );
  expect(await screen.findByText(/Saved 2 row/)).toBeInTheDocument();
});

test('task tree parents expand/collapse descendants', async () => {
  (api.projects.list as jest.Mock).mockResolvedValue({
    data: { data: taskTree, pagination: { total: 3, has_more: false } },
  });
  renderPage();

  const parent = await screen.findByRole('treeitem', { name: /SR Parent/i });
  expect(parent).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('treeitem', { name: /^Leaf Task AR/i })).toBeInTheDocument();

  fireEvent.click(parent);
  expect(parent).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('treeitem', { name: /^Leaf Task AR/i })).not.toBeInTheDocument();

  fireEvent.click(parent);
  expect(parent).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('treeitem', { name: /^Leaf Task AR/i })).toBeInTheDocument();
});

test('task picker supports roving tabindex and arrow/Enter keyboard selection', async () => {
  (api.projects.list as jest.Mock).mockResolvedValue({
    data: { data: taskTree, pagination: { total: 3, has_more: false } },
  });
  renderPage();

  const first = await screen.findByRole('treeitem', { name: /^Leaf Task AR/i });
  const second = screen.getByRole('treeitem', { name: /^Leaf Task 2 AR/i });
  expect(screen.getByRole('treeitem', { name: /SR Parent/i })).toHaveAttribute('tabindex', '-1');
  expect(first).toHaveAttribute('tabindex', '0');

  act(() => first.focus());
  fireEvent.keyDown(first, { key: 'ArrowDown' });
  expect(document.activeElement).toBe(second);

  fireEvent.keyDown(second, { key: 'Enter' });
  expect(await screen.findByLabelText('Date mode')).toBeInTheDocument();
  expect(screen.getByRole('treeitem', { name: /^Leaf Task 2 AR/i })).toHaveAttribute('aria-selected', 'true');
});

test('duplicate create 409 is shown as an inline edit-existing message, not a generic failure', async () => {
  (api.projects.list as jest.Mock).mockResolvedValue({
    data: { data: taskTree, pagination: { total: 2, has_more: false } },
  });
  (api.assignments.create as jest.Mock).mockRejectedValue({
    response: { status: 409, data: { code: 'ASSIGNMENT_DUPLICATE' } },
  });
  renderPage();

  fireEvent.click(await screen.findByRole('treeitem', { name: /^Leaf Task AR/i }));
  fireEvent.click(await screen.findByRole('button', { name: /^Add$/i }));

  await waitFor(() => {
    expect(screen.getByRole('alert')).toHaveTextContent(/Adjust the existing row/i);
  });
});

test('phase mode creates with phase_id and no manual dates', async () => {
  (api.projects.list as jest.Mock).mockResolvedValue({
    data: { data: taskTree, pagination: { total: 2, has_more: false } },
  });
  (api.projectPhases.list as jest.Mock).mockResolvedValue({
    data: {
      data: [
        {
          id: 'timeline-1',
          phase_id: 'phase-design',
          phase_name: 'Design',
          start_date: '2026-03-01',
          end_date: '2026-03-15',
        },
      ],
      pagination: { total: 1 },
    },
  });
  renderPage();

  fireEvent.click(await screen.findByRole('treeitem', { name: /^Leaf Task AR/i }));
  fireEvent.change(screen.getByLabelText('Date mode'), { target: { value: 'phase' } });

  await waitFor(() => {
    expect(screen.getByLabelText('Phase')).toBeInTheDocument();
  });
  expect(await screen.findByText(/2026-03-01/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^Add$/i }));

  await waitFor(() => {
    expect(api.assignments.create).toHaveBeenCalledTimes(1);
  });
  expect(api.assignments.create).toHaveBeenCalledWith(
    expect.objectContaining({
      project_id: 'task-leaf',
      assignment_date_mode: 'phase',
      phase_id: 'phase-design',
    }),
    { scenarioId: 'baseline-0000-0000-0000-000000000000' }
  );
  const payload = (api.assignments.create as jest.Mock).mock.calls[0][0];
  expect(payload).not.toHaveProperty('start_date');
  expect(payload).not.toHaveProperty('end_date');
});

test('project mode creates with project mode and derived read-only dates', async () => {
  (api.projects.list as jest.Mock).mockResolvedValue({
    data: { data: taskTree, pagination: { total: 2, has_more: false } },
  });
  renderPage();

  fireEvent.click(await screen.findByRole('treeitem', { name: /^Leaf Task AR/i }));
  fireEvent.change(screen.getByLabelText('Date mode'), { target: { value: 'project' } });

  await waitFor(() => {
    expect(screen.getByTestId('pw-derived-dates')).toHaveTextContent('2026-03-01');
  });
  fireEvent.click(screen.getByRole('button', { name: /^Add$/i }));

  await waitFor(() => {
    expect(api.assignments.create).toHaveBeenCalledTimes(1);
  });
  expect(api.assignments.create).toHaveBeenCalledWith(
    expect.objectContaining({
      project_id: 'task-leaf',
      assignment_date_mode: 'project',
    }),
    { scenarioId: 'baseline-0000-0000-0000-000000000000' }
  );
  const payload = (api.assignments.create as jest.Mock).mock.calls[0][0];
  expect(payload).not.toHaveProperty('start_date');
  expect(payload).not.toHaveProperty('end_date');
});
