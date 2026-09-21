import React from 'react';
import { render, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import { Projects } from '../Projects';
import { api } from '../../lib/api-client';
import { useScenario } from '../../contexts/ScenarioContext';

// Mock the Scenario Context
jest.mock('../../contexts/ScenarioContext', () => ({
  useScenario: jest.fn(),
}));

// Mock the API client
jest.mock('../../lib/api-client', () => ({
  api: {
    projects: {
      list: jest.fn(),
      delete: jest.fn(),
    },
    locations: {
      list: jest.fn(),
    },
    projectTypes: {
      list: jest.fn(),
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
jest.mock('../../components/ui/DataTable', () => ({
  DataTable: ({ data, columns, onRowClick }: any) => (
    <div data-testid="data-table">
      <table>
        <thead>
          <tr>
            {columns.map((col: any) => (
              <th key={col.key}>{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data?.map((row: any, index: number) => (
            <tr key={row.id || index} onClick={() => onRowClick?.(row)}>
              {columns.map((col: any) => (
                <td key={col.key}>
                  {col.render ? col.render(row[col.key], row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ),
}));

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
        value={values.project_type_id}
        onChange={(e) => onChange('project_type_id', e.target.value)}
        data-testid="project-type-filter"
      >
        <option value="">All Types</option>
        <option value="type-1">Software Development</option>
        <option value="type-2">Data Migration</option>
      </select>
      <select
        value={values.tag_id}
        onChange={(e) => onChange('tag_id', e.target.value)}
        data-testid="tag-filter"
      >
        <option value="">All Tags</option>
        <option value="1">Reserved</option>
        <option value="2">Urgent</option>
      </select>
      <select
        value={values.status}
        onChange={(e) => onChange('status', e.target.value)}
        data-testid="status-filter"
      >
        <option value="">All Statuses</option>
        <option value="planned">Planned</option>
        <option value="active">Active</option>
        <option value="on_hold">On Hold</option>
        <option value="completed">Completed</option>
        <option value="cancelled">Cancelled</option>
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
  default: ({ isOpen, onClose, onSuccess, editingProject }: any) =>
    isOpen ? (
      <div data-testid="project-modal">
        <h2>{editingProject ? 'Edit Project' : 'New Project'}</h2>
        <button onClick={onClose}>Close</button>
        <button onClick={() => { onSuccess(); onClose(); }}>Save</button>
      </div>
    ) : null,
}));

jest.mock('../../components/ProjectAllocations', () => ({
  __esModule: true,
  default: ({ projectId, projectName, onClose }: any) => (
    <div data-testid="allocations-modal">
      <h2>Allocations for {projectName}</h2>
      <div>Project ID: {projectId}</div>
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

jest.mock('../../hooks/useModal', () => ({
  useModal: () => ({
    isOpen: false,
    open: jest.fn(),
    close: jest.fn(),
  }),
}));

jest.mock('../../lib/project-colors', () => ({
  getProjectTypeIndicatorStyle: (project: any) => ({
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    backgroundColor: project.project_type?.color_code || '#888',
    marginRight: '8px',
  }),
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

describe('Projects Page', () => {
  let queryClient: QueryClient;

  const mockProjects = [
    {
      id: 'proj-1',
      name: 'Project Alpha',
      project_type_id: 'type-1',
      project_type_name: 'Software Development',
      project_type_color_code: '#007bff',
      location: { id: 'loc-1', name: 'New York' },
      start_date: '2024-01-01',
      end_date: '2024-06-30',
      current_phase_name: 'Development',
      status: 'active',
    },
    {
      id: 'proj-2',
      name: 'Project Beta',
      project_type_id: 'type-2',
      project_type_name: 'Data Migration',
      project_type_color_code: '#28a745',
      location: { id: 'loc-2', name: 'San Francisco' },
      start_date: '2024-02-01',
      end_date: '2024-08-31',
      current_phase_name: 'Planning',
      status: 'planned',
    },
    {
      id: 'proj-3',
      name: 'Project Gamma',
      project_type_id: null,
      project_type_name: null,
      project_type_color_code: null,
      location: { id: 'loc-1', name: 'New York' },
      start_date: '2023-10-01',
      end_date: '2024-03-31',
      current_phase_name: null,
      status: 'completed',
    },
  ];

  const mockLocations = [
    { id: 'loc-1', name: 'New York' },
    { id: 'loc-2', name: 'San Francisco' },
  ];

  const mockProjectTypes = [
    { id: 'type-1', name: 'Software Development', color_code: '#007bff' },
    { id: 'type-2', name: 'Data Migration', color_code: '#28a745' },
  ];

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    jest.clearAllMocks();

    // Mock the scenario context
    (useScenario as jest.Mock).mockReturnValue({
      currentScenario: {
        id: 'baseline',
        name: 'Baseline',
        status: 'active',
        scenario_type: 'baseline'
      },
      scenarios: [{
        id: 'baseline',
        name: 'Baseline', 
        status: 'active',
        scenario_type: 'baseline'
      }],
      setCurrentScenario: jest.fn(),
      isLoading: false,
      error: null
    });

    // Setup default mock responses
    (api.projects.list as jest.Mock).mockResolvedValue({
      data: { data: mockProjects },
    });
    (api.locations.list as jest.Mock).mockResolvedValue({
      data: { data: mockLocations },
    });
    (api.projectTypes.list as jest.Mock).mockResolvedValue({
      data: { data: mockProjectTypes },
    });
  });

  const renderComponent = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Projects />
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  describe('Table Rendering', () => {
    test('renders projects table with correct headers', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('data-table')).toBeInTheDocument();
      });

      const headers = screen.getAllByRole('columnheader');
      expect(headers[0]).toHaveTextContent('Project Name');
      expect(headers[1]).toHaveTextContent('Project Type');
      expect(headers[2]).toHaveTextContent('Tags');
      expect(headers[3]).toHaveTextContent('Start Date');
      expect(headers[4]).toHaveTextContent('End Date');
      expect(headers[5]).toHaveTextContent('Lifecycle');
      expect(headers[6]).toHaveTextContent('Actions');
    });

    test('displays project data correctly', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      expect(screen.getByText('Project Beta')).toBeInTheDocument();
      expect(screen.getByText('Project Gamma')).toBeInTheDocument();
      
      // Check project types in the table (not in the filter)
      const table = screen.getByTestId('data-table');
      expect(within(table).getByText('Software Development')).toBeInTheDocument();
      expect(within(table).getByText('Data Migration')).toBeInTheDocument();
      expect(within(table).getByText('Not assigned')).toBeInTheDocument();
    });

    test('does not render the retired location column', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('data-table')).toBeInTheDocument();
      });

      // The location dimension was retired from the UI — no column for it
      const headers = screen.getAllByRole('columnheader');
      expect(headers.map((h) => h.textContent)).not.toContain('Location');
      expect(screen.queryByText('New York')).not.toBeInTheDocument();
    });

    test('formats dates correctly', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('data-table')).toBeInTheDocument();
      });

      // Check that dates are displayed (exact format depends on locale)
      const dateElements = screen.getAllByText(/2024|2023/);
      expect(dateElements.length).toBeGreaterThan(0);
    });

    test('displays lifecycle state or dash for standing items', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('data-table')).toBeInTheDocument();
      });

      // Fixtures carry no lifecycle_state — every row shows the standing-item dash
      const dashElements = screen.getAllByText('—');
      expect(dashElements.length).toBeGreaterThan(0);
    });

    test('advances lifecycle in place from the list row', async () => {
      const user = userEvent.setup();
      (api.projects.list as jest.Mock).mockResolvedValue({
        data: { data: [{ ...mockProjects[0], lifecycle_state: 'pending_rat' }] }
      });
      (api.lifecycle.transition as jest.Mock).mockResolvedValue({
        data: { project: { lifecycle_state: 'designing' }, event: {} }
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Pending RAT')).toBeInTheDocument();
      });

      // One click on the primary quick-advance button — no detail page, no modal
      await user.click(screen.getByRole('button', { name: 'Start design' }));

      await waitFor(() => {
        expect(api.lifecycle.transition).toHaveBeenCalledWith('proj-1', { to: 'designing' });
      });
    });

    test('badge popover offers the full flow-free state selector', async () => {
      const user = userEvent.setup();
      (api.projects.list as jest.Mock).mockResolvedValue({
        data: { data: [{ ...mockProjects[0], lifecycle_state: 'designing' }] }
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Designing')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Designing/ }));

      // All 8 states are selectable (flow-free); current one is tagged
      const selector = within(screen.getByTestId('lc-state-list'));
      expect(selector.getByText('Pending RAT')).toBeInTheDocument();
      expect(selector.getByText('NOK')).toBeInTheDocument();
      expect(selector.getByText('Backlog')).toBeInTheDocument();
      expect(selector.getByText('Scheduled')).toBeInTheDocument();
      expect(selector.getByText('In Iteration')).toBeInTheDocument();
      expect(selector.getByText('Delivered')).toBeInTheDocument();
      expect(selector.getByText('Cancelled')).toBeInTheDocument();
      expect(selector.getByText('current')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Admit' })).toBeInTheDocument();
    });

    test('shows loading state', () => {
      (api.projects.list as jest.Mock).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      renderComponent();

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });

    test('shows error state', async () => {
      (api.projects.list as jest.Mock).mockRejectedValue(
        new Error('Failed to load projects')
      );

      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toBeInTheDocument();
      });
    });

    test('handles empty project list', async () => {
      (api.projects.list as jest.Mock).mockResolvedValue({
        data: { data: [] },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('data-table')).toBeInTheDocument();
      });

      const rows = screen.getAllByRole('row');
      expect(rows).toHaveLength(1); // Only header row
    });
  });

  describe('Project Type Indicators', () => {
    test('displays project type color indicators', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('data-table')).toBeInTheDocument();
      });

      // The component renders color indicators as divs with backgroundColor
      const table = screen.getByTestId('data-table');
      const rows = within(table).getAllByRole('row');
      expect(rows.length).toBeGreaterThan(1); // Header + data rows
    });

    test('handles projects without project type', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Not assigned')).toBeInTheDocument();
      });

      // Project Gamma has no project type
      expect(screen.getByText('Project Gamma')).toBeInTheDocument();
    });
  });

  describe('Actions', () => {
    test('renders action buttons for each project', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('data-table')).toBeInTheDocument();
      });

      // Each project should have 4 action buttons
      const viewButtons = screen.getAllByTitle('View Details');
      const editButtons = screen.getAllByTitle('Edit');
      const allocateButtons = screen.getAllByTitle('Manage Allocations');
      const deleteButtons = screen.getAllByTitle('Delete');

      expect(viewButtons).toHaveLength(3);
      expect(editButtons).toHaveLength(3);
      expect(allocateButtons).toHaveLength(3);
      expect(deleteButtons).toHaveLength(3);
    });

    test('navigates to project details on view button click', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getAllByTitle('View Details')[0]).toBeInTheDocument();
      });

      await user.click(screen.getAllByTitle('View Details')[0]);

      expect(mockNavigate).toHaveBeenCalledWith('/projects/proj-1');
    });

    test('opens edit modal on edit button click', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getAllByTitle('Edit')[0]).toBeInTheDocument();
      });

      // Just verify the button is clickable
      const editButton = screen.getAllByTitle('Edit')[0];
      await user.click(editButton);
    });

    test('opens allocations modal on manage allocations button click', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getAllByTitle('Manage Allocations')[0]).toBeInTheDocument();
      });

      // Just verify the button is clickable
      const allocButton = screen.getAllByTitle('Manage Allocations')[0];
      await user.click(allocButton);
    });

    test('deletes project with confirmation', async () => {
      const user = userEvent.setup();
      window.confirm = jest.fn(() => true);
      (api.projects.delete as jest.Mock).mockResolvedValue({});

      renderComponent();

      await waitFor(() => {
        expect(screen.getAllByTitle('Delete')[0]).toBeInTheDocument();
      });

      await user.click(screen.getAllByTitle('Delete')[0]);

      expect(window.confirm).toHaveBeenCalledWith(
        'Are you sure you want to delete the project "Project Alpha"? This action cannot be undone.'
      );
      expect(api.projects.delete).toHaveBeenCalledWith('proj-1');
    });

    test('cancels delete when not confirmed', async () => {
      const user = userEvent.setup();
      window.confirm = jest.fn(() => false);

      renderComponent();

      await waitFor(() => {
        expect(screen.getAllByTitle('Delete')[0]).toBeInTheDocument();
      });

      await user.click(screen.getAllByTitle('Delete')[0]);

      expect(api.projects.delete).not.toHaveBeenCalled();
    });
  });

  describe('Filtering', () => {
    test('filters projects by search term', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('filter-bar')).toBeInTheDocument();
      });

      const searchInput = screen.getByTestId('search-input');
      await user.type(searchInput, 'Alpha');

      await waitFor(() => {
        // API should be called as user types
        expect(api.projects.list).toHaveBeenCalled();
      });
    });

    test('filters by project type', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('project-type-filter')).toBeInTheDocument();
      });

      const typeFilter = screen.getByTestId('project-type-filter');
      await user.selectOptions(typeFilter, 'type-1');

      await waitFor(() => {
        expect(api.projects.list).toHaveBeenLastCalledWith({ project_type_id: 'type-1' });
      });
    });

    test('filters by status', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('status-filter')).toBeInTheDocument();
      });

      const statusFilter = screen.getByTestId('status-filter');
      await user.selectOptions(statusFilter, 'active');

      await waitFor(() => {
        expect(api.projects.list).toHaveBeenLastCalledWith({ status: 'active' });
      });
    });

    test('filters projects by tag', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('tag-filter')).toBeInTheDocument();
      });

      await user.selectOptions(screen.getByTestId('tag-filter'), '1');
      await waitFor(() => {
        expect(api.projects.list).toHaveBeenLastCalledWith({ tag_id: '1' });
      });

      await user.selectOptions(screen.getByTestId('tag-filter'), '');
      await waitFor(() => {
        expect(api.projects.list).toHaveBeenLastCalledWith({});
      });
    });

    test('applies multiple filters simultaneously', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('filter-bar')).toBeInTheDocument();
      });

      await user.type(screen.getByTestId('search-input'), 'Project');
      await user.selectOptions(screen.getByTestId('status-filter'), 'planned');

      await waitFor(() => {
        expect(api.projects.list).toHaveBeenCalled();
      });
    });

    test('resets all filters', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('filter-bar')).toBeInTheDocument();
      });

      // Apply some filters
      await user.type(screen.getByTestId('search-input'), 'test');
      await user.selectOptions(screen.getByTestId('status-filter'), 'active');

      // Reset filters
      await user.click(screen.getByTestId('reset-filters'));

      await waitFor(() => {
        expect(api.projects.list).toHaveBeenLastCalledWith({});
      });
    });
  });

  describe('Navigation', () => {
    test('navigates to project details on row click', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('data-table')).toBeInTheDocument();
      });

      const firstRow = screen.getAllByRole('row')[1]; // Skip header row
      await user.click(firstRow);

      expect(mockNavigate).toHaveBeenCalledWith('/projects/proj-1');
    });

    test('opens new project modal', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /new project/i })).toBeInTheDocument();
      });

      const newProjectButton = screen.getByRole('button', { name: /new project/i });
      expect(newProjectButton).toBeInTheDocument();
      await user.click(newProjectButton);
    });

    test('navigates to demands view', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /view demands/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /view demands/i }));

      expect(mockNavigate).toHaveBeenCalledWith('/projects/demands');
    });
  });

  describe('Edge Cases', () => {
    test('handles API response without data wrapper', async () => {
      // Test direct array response
      (api.locations.list as jest.Mock).mockResolvedValue({
        data: mockLocations,
      });
      (api.projectTypes.list as jest.Mock).mockResolvedValue({
        data: mockProjectTypes,
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('data-table')).toBeInTheDocument();
      });

      // Should still render properly
      expect(screen.getByText('Project Alpha')).toBeInTheDocument();
    });

    test('handles projects with missing dates', async () => {
      const projectsWithNullDates = [
        {
          ...mockProjects[0],
          start_date: null,
          end_date: null,
        },
      ];
      (api.projects.list as jest.Mock).mockResolvedValue({
        data: { data: projectsWithNullDates },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('data-table')).toBeInTheDocument();
      });

      // Should show dashes for null dates
      const dashElements = screen.getAllByText('-');
      expect(dashElements.length).toBeGreaterThan(0);
    });

    test('handles API errors gracefully', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      (api.projects.list as jest.Mock).mockRejectedValue(new Error('API Error'));

      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toBeInTheDocument();
      });

      consoleError.mockRestore();
    });

    test('transforms flat project data to include project_type object', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('data-table')).toBeInTheDocument();
      });

      // Verify that project type names are displayed correctly after transformation
      const table = screen.getByTestId('data-table');
      expect(within(table).getByText('Software Development')).toBeInTheDocument();
      expect(within(table).getByText('Data Migration')).toBeInTheDocument();
    });
  });
});