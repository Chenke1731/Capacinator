import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    },
    assignments: {
      list: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
    },
    projects: {
      list: jest.fn(),
    },
  },
}));

jest.mock('../../contexts/ScenarioContext', () => ({
  useScenario: () => ({
    currentScenario: { id: 'baseline-0000-0000-0000-000000000000', name: 'Baseline' },
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

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/people/person-1/workload']}>
        <Routes>
          <Route path="/people/:id/workload" element={<PersonWorkload />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
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
  (api.projects.list as jest.Mock).mockResolvedValue({
    data: { data: [], pagination: { total: 0, has_more: false } },
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
    })
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
    expect(api.assignments.delete).toHaveBeenCalledWith('a2', { expected_version: 1 });
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
];

test('task picker disables SR parent and adds a leaf in one create request', async () => {
  (api.projects.list as jest.Mock).mockResolvedValue({
    data: { data: taskTree, pagination: { total: 2, has_more: false } },
  });
  renderPage();

  const parent = await screen.findByRole('treeitem', { name: /SR Parent/i });
  expect(parent).toHaveAttribute('aria-disabled', 'true');

  const leaf = screen.getByRole('treeitem', { name: /Leaf Task/i });
  fireEvent.click(leaf);

  await waitFor(() => {
    expect(screen.getByRole('button', { name: /^Add$/i })).toBeInTheDocument();
  });
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
    })
  );
});

test('duplicate create 409 is shown as an inline edit-existing message, not a generic failure', async () => {
  (api.projects.list as jest.Mock).mockResolvedValue({
    data: { data: taskTree, pagination: { total: 2, has_more: false } },
  });
  (api.assignments.create as jest.Mock).mockRejectedValue({
    response: { status: 409, data: { code: 'ASSIGNMENT_DUPLICATE' } },
  });
  renderPage();

  fireEvent.click(await screen.findByRole('treeitem', { name: /Leaf Task/i }));
  fireEvent.click(await screen.findByRole('button', { name: /^Add$/i }));

  await waitFor(() => {
    expect(screen.getByRole('alert')).toHaveTextContent(/Adjust the existing row/i);
  });
});
