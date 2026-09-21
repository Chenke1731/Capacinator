import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import Roles from '../Roles';
import { api } from '../../lib/api-client';

// Mock the API client
jest.mock('../../lib/api-client', () => ({
  api: {
    roles: {
      list: jest.fn(),
      delete: jest.fn(),
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
        placeholder="Search roles..."
        value={values.search}
        onChange={(e) => onChange('search', e.target.value)}
        data-testid="search-input"
      />
      <select
        value={values.has_planners}
        onChange={(e) => onChange('has_planners', e.target.value)}
        data-testid="has-planners-filter"
      >
        <option value="">All</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
      <select
        value={values.has_people}
        onChange={(e) => onChange('has_people', e.target.value)}
        data-testid="has-people-filter"
      >
        <option value="">All</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
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

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

describe('Roles Page', () => {
  let queryClient: QueryClient;

  const mockRoles = [
    {
      id: 'role-1',
      name: 'Software Developer',
      description: 'Develops software applications',
      external_id: 'DEV001',
      people_count: 15,
      planners_count: 3,
      standard_allocations_count: 5,
    },
    {
      id: 'role-2',
      name: 'Project Manager',
      description: 'Manages project timelines and resources',
      external_id: 'PM001',
      people_count: 8,
      planners_count: 8,
      standard_allocations_count: 12,
    },
    {
      id: 'role-3',
      name: 'UX Designer',
      description: null,
      external_id: null,
      people_count: 0,
      planners_count: 0,
      standard_allocations_count: 0,
    },
  ];

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    jest.clearAllMocks();

    // Setup default mock responses
    (api.roles.list as jest.Mock).mockResolvedValue({
      data: mockRoles,
    });
  });

  const renderComponent = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Roles />
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  describe('Table Rendering', () => {
    test('renders roles table with correct headers', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('data-table')).toBeInTheDocument();
      });

      const headers = screen.getAllByRole('columnheader');
      expect(headers[0]).toHaveTextContent('Role Name');
      expect(headers[1]).toHaveTextContent('External ID');
      expect(headers[2]).toHaveTextContent('People');
      expect(headers[3]).toHaveTextContent('Planners');
      expect(headers[4]).toHaveTextContent('Allocations');
      expect(headers[5]).toHaveTextContent('Actions');
    });

    test('displays role data correctly', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Software Developer')).toBeInTheDocument();
      });

      expect(screen.getByText('Project Manager')).toBeInTheDocument();
      expect(screen.getByText('UX Designer')).toBeInTheDocument();
      
      // Check descriptions
      expect(screen.getByText('Develops software applications')).toBeInTheDocument();
      expect(screen.getByText('Manages project timelines and resources')).toBeInTheDocument();
    });

    test('displays external IDs or dash for null', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('DEV001')).toBeInTheDocument();
      });

      expect(screen.getByText('PM001')).toBeInTheDocument();
      // Role 3 has null external_id
      const dashElements = screen.getAllByText('-');
      expect(dashElements.length).toBeGreaterThan(0);
    });

    test('displays people and planner counts with icons', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('15')).toBeInTheDocument(); // People count for role 1
      });

      // Role 2 has 8 for both people_count and planners_count
      const eightElements = screen.getAllByText('8');
      expect(eightElements).toHaveLength(2);
      
      expect(screen.getByText('3')).toBeInTheDocument(); // Planners count for role 1
      
      // Check that zero counts are displayed
      const zeroElements = screen.getAllByText('0');
      expect(zeroElements.length).toBeGreaterThan(0);
    });

    test('displays allocation counts', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('5')).toBeInTheDocument();
      });

      expect(screen.getByText('12')).toBeInTheDocument();
      // Role 3 has 0 allocations
      const zeroElements = screen.getAllByText('0');
      expect(zeroElements.length).toBeGreaterThan(0);
    });

    test('shows loading state', () => {
      (api.roles.list as jest.Mock).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      renderComponent();

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });

    test('shows error state', async () => {
      (api.roles.list as jest.Mock).mockRejectedValue(
        new Error('Failed to load roles')
      );

      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toBeInTheDocument();
      });
    });

    test('handles empty role list', async () => {
      (api.roles.list as jest.Mock).mockResolvedValue({
        data: [],
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('data-table')).toBeInTheDocument();
      });

      const rows = screen.getAllByRole('row');
      expect(rows).toHaveLength(1); // Only header row
    });
  });

  describe('Actions', () => {
    test('renders action buttons for each role', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('data-table')).toBeInTheDocument();
      });

      const viewButtons = screen.getAllByTitle('View Details');
      const editButtons = screen.getAllByTitle('Edit');
      const deleteButtons = screen.getAllByTitle('Delete');

      expect(viewButtons).toHaveLength(3);
      expect(editButtons).toHaveLength(3);
      expect(deleteButtons).toHaveLength(3);
    });

    test('navigates to role details on view button click', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getAllByTitle('View Details')[0]).toBeInTheDocument();
      });

      await user.click(screen.getAllByTitle('View Details')[0]);

      expect(mockNavigate).toHaveBeenCalledWith('/roles/role-1');
    });

    test('edit button opens the role details page (inline editing lives there)', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getAllByTitle('Edit')[0]).toBeInTheDocument();
      });

      await user.click(screen.getAllByTitle('Edit')[0]);

      expect(mockNavigate).toHaveBeenCalledWith('/roles/role-1');
    });

    test('deletes role with confirmation', async () => {
      const user = userEvent.setup();
      window.confirm = jest.fn(() => true);
      (api.roles.delete as jest.Mock).mockResolvedValue({});

      renderComponent();

      await waitFor(() => {
        expect(screen.getAllByTitle('Delete')[0]).toBeInTheDocument();
      });

      await user.click(screen.getAllByTitle('Delete')[0]);

      expect(window.confirm).toHaveBeenCalledWith(
        'Are you sure you want to delete the role "Software Developer"? This action cannot be undone.'
      );
      expect(api.roles.delete).toHaveBeenCalledWith('role-1');
    });

    test('cancels delete when not confirmed', async () => {
      const user = userEvent.setup();
      window.confirm = jest.fn(() => false);

      renderComponent();

      await waitFor(() => {
        expect(screen.getAllByTitle('Delete')[0]).toBeInTheDocument();
      });

      await user.click(screen.getAllByTitle('Delete')[0]);

      expect(api.roles.delete).not.toHaveBeenCalled();
    });
  });

  describe('Filtering', () => {
    test('filters roles by search term', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('filter-bar')).toBeInTheDocument();
      });

      const searchInput = screen.getByTestId('search-input');
      await user.type(searchInput, 'Developer');

      await waitFor(() => {
        expect(api.roles.list).toHaveBeenCalled();
      });
    });

    test('filters by has planners', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('has-planners-filter')).toBeInTheDocument();
      });

      const plannersFilter = screen.getByTestId('has-planners-filter');
      await user.selectOptions(plannersFilter, 'true');

      await waitFor(() => {
        expect(api.roles.list).toHaveBeenLastCalledWith({ has_planners: 'true' });
      });
    });

    test('filters by has people', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('has-people-filter')).toBeInTheDocument();
      });

      const peopleFilter = screen.getByTestId('has-people-filter');
      await user.selectOptions(peopleFilter, 'false');

      await waitFor(() => {
        expect(api.roles.list).toHaveBeenLastCalledWith({ has_people: 'false' });
      });
    });

    test('applies multiple filters simultaneously', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('filter-bar')).toBeInTheDocument();
      });

      await user.type(screen.getByTestId('search-input'), 'Manager');
      await user.selectOptions(screen.getByTestId('has-planners-filter'), 'true');
      await user.selectOptions(screen.getByTestId('has-people-filter'), 'true');

      await waitFor(() => {
        expect(api.roles.list).toHaveBeenCalled();
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
      await user.selectOptions(screen.getByTestId('has-planners-filter'), 'true');

      // Reset filters
      await user.click(screen.getByTestId('reset-filters'));

      await waitFor(() => {
        expect(api.roles.list).toHaveBeenLastCalledWith({});
      });
    });
  });

  describe('Navigation', () => {
    test('navigates to role details on row click', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('data-table')).toBeInTheDocument();
      });

      const firstRow = screen.getAllByRole('row')[1]; // Skip header row
      await user.click(firstRow);

      expect(mockNavigate).toHaveBeenCalledWith('/roles/role-1');
    });

    test('navigates to add role page', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add role/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add role/i }));

      expect(mockNavigate).toHaveBeenCalledWith('/roles/new');
    });
  });

  describe('Edge Cases', () => {
    test('handles roles with no description', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('UX Designer')).toBeInTheDocument();
      });

      // Role 3 has null description - should still render the role name
      const roleElement = screen.getByText('UX Designer');
      expect(roleElement).toBeInTheDocument();
    });

    test('handles zero counts gracefully', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('data-table')).toBeInTheDocument();
      });

      // Role 3 has zero counts for all fields
      const zeroElements = screen.getAllByText('0');
      expect(zeroElements.length).toBeGreaterThan(0);
    });

    test('handles API errors gracefully', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      (api.roles.list as jest.Mock).mockRejectedValue(new Error('API Error'));

      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toBeInTheDocument();
      });

      consoleError.mockRestore();
    });

    test('displays count badges correctly', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('data-table')).toBeInTheDocument();
      });

      // Check that the count badges render with icons
      const table = screen.getByTestId('data-table');
      const cells = within(table).getAllByRole('cell');
      
      // People and Planner counts should be rendered in badges with icons
      expect(cells.length).toBeGreaterThan(0);
    });
  });
});