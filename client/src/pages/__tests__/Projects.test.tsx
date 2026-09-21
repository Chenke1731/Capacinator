import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Projects } from '../Projects';

// Mock the API client
jest.mock('../../lib/api-client', () => ({
  api: {
    projects: {
      list: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
    tags: {
      list: jest.fn(),
    },
    lifecycle: {
      transition: jest.fn(),
    },
    roles: {
      list: jest.fn(),
    },
  },
}));

// Mock the UI components
jest.mock('../../components/ui/FilterBar', () => ({
  FilterBar: ({ filters, values, onChange, onReset }: any) => (
    <div data-testid="filter-bar">
      <input
        placeholder="Search projects..."
        value={values.search}
        onChange={(e) => onChange('search', e.target.value)}
        data-testid="search-input"
      />
      <select
        value={values.lifecycle_state}
        onChange={(e) => onChange('lifecycle_state', e.target.value)}
        data-testid="lifecycle-filter"
      >
        <option value="">All</option>
        <option value="designing">Designing</option>
        <option value="scheduled">Scheduled</option>
      </select>
      <select
        value={values.tag_id}
        onChange={(e) => onChange('tag_id', e.target.value)}
        data-testid="tag-filter"
      >
        <option value="">All Tags</option>
        <option value="1">Reserved</option>
      </select>
      <button onClick={onReset} data-testid="reset-filters">
        Reset Filters
      </button>
    </div>
  ),
}));

jest.mock('../../components/ui/LoadingSpinner', () => ({
  LoadingSpinner: () => <div data-testid="loading-spinner">Loading...</div>,
}));

jest.mock('../../components/ui/ErrorMessage', () => ({
  ErrorMessage: ({ message }: any) => (
    <div data-testid="error-message">{message}</div>
  ),
}));

jest.mock('../../components/modals/ProjectModal', () => ({
  __esModule: true,
  default: ({ isOpen, onClose, editingProject }: any) =>
    isOpen ? (
      <div data-testid="project-modal">
        <h2>{editingProject ? 'Edit Project' : 'New Project'}</h2>
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

jest.mock('../../components/tags/TagManagerDialog', () => ({
  TagManagerDialog: ({ isOpen }: any) => (isOpen ? <div data-testid="tag-manager" /> : null),
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

import { api } from '../../lib/api-client';
import { useScenario } from '../../contexts/ScenarioContext';

jest.mock('../../contexts/ScenarioContext', () => ({
  useScenario: jest.fn(),
}));

// 需求台 fixtures — category matching is by seed type name (data-level)
const mockProjects = [
  {
    id: 'proj-1',
    name: 'Project Alpha',
    project_type_id: 'type-1',
    project_type_name: '需求交付',
    project_sub_type_name: '标准需求',
    product_version: 'B',
    release_version: '26.RP4',
    priority: 2,
    owner_name: '陈主管',
    lifecycle_state: 'pending_rat',
    lifecycle_warnings: ['NO_DEV_DEMAND'],
    staffing_summary: { design: { named: 0.5, pool: 1 }, dev: { named: 2, pool: 0 } },
    tags: [{ id: 1, name: 'Reserved', color: '#f59e0b' }],
  },
  {
    id: 'proj-2',
    name: 'Project Beta',
    project_type_id: 'type-1',
    project_type_name: '需求交付',
    project_sub_type_name: '标准需求',
    product_version: 'A',
    release_version: '26.RP3',
    priority: 1,
    owner_name: null,
    lifecycle_state: 'in_iteration',
    lifecycle_warnings: [],
    staffing_summary: { design: { named: 0, pool: 0 }, dev: { named: 0, pool: 0 } },
    tags: [],
  },
  // Not a demand item — must NOT appear on the 需求台
  {
    id: 'proj-3',
    name: 'Project Gamma',
    project_type_id: null,
    project_type_name: null,
    lifecycle_state: null,
    tags: [],
  },
  {
    id: 'proj-4',
    name: 'Ticket Pool',
    project_type_id: 'type-9',
    project_type_name: '问题单支持',
    lifecycle_state: null,
    tags: [],
  },
];

describe('Requirements Board (需求台)', () => {
  let queryClient: QueryClient;

  const renderComponent = () => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return render(
      <QueryClientProvider client={queryClient}>
        <Projects />
      </QueryClientProvider>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockNavigate.mockClear();
    (api.projects.list as jest.Mock).mockResolvedValue({
      data: { data: mockProjects },
    });
    (api.tags.list as jest.Mock).mockResolvedValue({
      data: { data: [{ id: 1, name: 'Reserved' }] },
    });
    (api.projects.update as jest.Mock).mockResolvedValue({ data: {} });
    (api.projects.delete as jest.Mock).mockResolvedValue({ data: {} });
    (api.roles.list as jest.Mock).mockResolvedValue({ data: [] });
    (useScenario as jest.Mock).mockReturnValue({
      currentScenario: { id: 'baseline-0000-0000-0000-000000000000', name: 'Baseline' }
    });
  });

  describe('Rendering', () => {
    test('renders the new column set', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('requirements-table')).toBeInTheDocument();
      });

      const header = screen.getByTestId('requirements-table').querySelector('.requirements-thead');
      const headers = Array.from(header?.children ?? []).map((el) => el.textContent);
      expect(headers).toEqual(['Name', 'Tags', 'Lifecycle', 'Staffing', 'Version', 'Release', 'Priority', 'Owner', 'Actions']);
    });

    test('groups by product version then release, unversioned last', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      const groupHeaders = await screen.findAllByRole('button', { name: /A|B/ });
      const groupLabels = groupHeaders
        .map((g) => g.querySelector('strong')?.textContent)
        .filter(Boolean);
      expect(groupLabels).toEqual(['A', 'B']);
      const releaseHeaders = document.querySelectorAll('.requirements-release-header');
      expect(releaseHeaders.length).toBe(2);
      expect(releaseHeaders[0].textContent).toContain('26.RP3');
      expect(releaseHeaders[1].textContent).toContain('26.RP4');
    });

    test('shows only demand-category items (tickets/standing excluded)', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      expect(screen.getByText('Project Beta')).toBeInTheDocument();
      expect(screen.queryByText('Project Gamma')).not.toBeInTheDocument();
      expect(screen.queryByText('Ticket Pool')).not.toBeInTheDocument();
    });

    test('warning row tint + short-word chip', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      expect(screen.getByText('no pool')).toBeInTheDocument();
      const alphaRow = screen.getByText('Project Alpha').closest('.requirements-row');
      expect(alphaRow).toHaveClass('requirements-row--warned');
    });

    test('staffing summary renders both sides (named + pool)', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      const alphaRow = screen.getByText('Project Alpha').closest('.requirements-row')!;
      const staffing = within(alphaRow).getAllByText(/0\.5/);
      expect(staffing.length).toBeGreaterThan(0);
    });

    test('priority badge and owner render', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      expect(screen.getByText('P2')).toBeInTheDocument();
      expect(screen.getByText('P1')).toBeInTheDocument();
      expect(screen.getByText('陈主管')).toBeInTheDocument();
    });
  });

  describe('Lifecycle in place', () => {
    test('advances lifecycle from the row (one click)', async () => {
      const user = userEvent.setup();
      (api.lifecycle.transition as jest.Mock).mockResolvedValue({
        data: { project: { lifecycle_state: 'designing' }, event: {} }
      });
      renderComponent();

      await waitFor(() => {
        expect(screen.getAllByText('Pending RAT').length).toBeGreaterThan(0);
      });

      await user.click(screen.getByRole('button', { name: 'Start design' }));

      await waitFor(() => {
        expect(api.lifecycle.transition).toHaveBeenCalledWith('proj-1', { to: 'designing' });
      });
    });

    test('badge popover offers the full flow-free state selector', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getAllByText('Pending RAT').length).toBeGreaterThan(0);
      });

      // the badge is the button (the select option is not a button)
      const badge = screen
        .getAllByRole('button', { name: /Pending RAT/ })
        .find((b) => b.closest('.lifecycle-cell'));
      await user.click(badge!);

      const selector = within(screen.getByTestId('lc-state-list'));
      ['NOK', 'Designing', 'Backlog', 'Scheduled', 'In Iteration', 'Delivered', 'Cancelled'].forEach(
        (label) => expect(selector.getByText(label)).toBeInTheDocument()
      );
      expect(selector.getByText('current')).toBeInTheDocument();
    });
  });

  describe('Version inline edit', () => {
    test('click product part → edit → saved via projects.update', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      const alphaRow = screen.getByText('Project Alpha').closest('.requirements-row')!;
      await user.click(within(alphaRow).getByText('B'));

      const input = await screen.findByDisplayValue('B');
      await user.clear(input);
      await user.type(input, 'C{Enter}');

      await waitFor(() => {
        expect(api.projects.update).toHaveBeenCalledWith('proj-1', { product_version: 'C' });
      });
    });
  });

  describe('Operations', () => {
    test('edit icon opens the project modal', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      const alphaRow = screen.getByText('Project Alpha').closest('.requirements-row')!;
      await user.click(within(alphaRow).getByTitle('Edit'));

      await waitFor(() => {
        expect(screen.getByTestId('project-modal')).toBeInTheDocument();
        expect(screen.getByText('Edit Project')).toBeInTheDocument();
      });
    });

    test('delete is a two-click confirm (zero modal)', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      const alphaRow = screen.getByText('Project Alpha').closest('.requirements-row')!;
      const deleteBtn = within(alphaRow).getByTitle('Delete');
      await user.click(deleteBtn);

      // First click arms, second click executes — no window.confirm
      expect(api.projects.delete).not.toHaveBeenCalled();
      const confirmBtn = within(alphaRow).getByTitle('Confirm');
      await user.click(confirmBtn);

      await waitFor(() => {
        expect(api.projects.delete).toHaveBeenCalledWith('proj-1');
      });
    });

    test('row click navigates to project detail', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Beta')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Project Beta'));
      expect(mockNavigate).toHaveBeenCalledWith('/projects/proj-2');
    });
  });

  describe('Filters', () => {
    test('search narrows rows client-side', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      await user.type(screen.getByTestId('search-input'), 'Alpha');
      await waitFor(() => {
        expect(screen.queryByText('Project Beta')).not.toBeInTheDocument();
      });
      expect(screen.getByText('Project Alpha')).toBeInTheDocument();
    });

    test('lifecycle filter passes through to the API', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('lifecycle-filter')).toBeInTheDocument();
      });

      await user.selectOptions(screen.getByTestId('lifecycle-filter'), 'designing');

      await waitFor(() => {
        expect(api.projects.list).toHaveBeenLastCalledWith(
          expect.objectContaining({ lifecycle_state: 'designing' })
        );
      });
    });
  });

  describe('States', () => {
    test('shows loading state', () => {
      (api.projects.list as jest.Mock).mockImplementation(() => new Promise(() => {}));
      renderComponent();
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });

    test('shows error state', async () => {
      (api.projects.list as jest.Mock).mockRejectedValue(new Error('Failed to load'));
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toBeInTheDocument();
      });
    });

    test('shows empty state when no demand items', async () => {
      (api.projects.list as jest.Mock).mockResolvedValue({ data: { data: [] } });
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('No requirements')).toBeInTheDocument();
      });
    });
  });
});
