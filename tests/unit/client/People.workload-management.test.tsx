import React from 'react';

// Mock Lucide React icons
jest.mock('lucide-react', () => ({
  Plus: ({ size }: any) => <span data-testid="plus-icon">+</span>,
  Edit2: ({ size }: any) => <span data-testid="edit-icon">Edit</span>,
  Trash2: ({ size }: any) => <span data-testid="trash-icon">Delete</span>,
  Power: ({ size }: any) => <span data-testid="power-icon">Power</span>,
  Eye: ({ size }: any) => <span data-testid="eye-icon">View</span>,
  Users: ({ size }: any) => <span data-testid="users-icon">Users</span>,
  UserPlus: ({ size }: any) => <span data-testid="user-plus-icon">Add User</span>,
  Search: ({ size }: any) => <span data-testid="search-icon">Search</span>,
  TrendingUp: ({ size }: any) => <span data-testid="trending-up-icon">Trending</span>,
  AlertTriangle: ({ size }: any) => <span data-testid="alert-icon">Alert</span>,
  CheckCircle: ({ size }: any) => <span data-testid="check-icon">Check</span>,
}));

// Mock the API client
jest.mock('../../../client/src/lib/api-client', () => ({
  api: {
    people: {
      list: jest.fn(),
      delete: jest.fn(),
      getUtilization: jest.fn(),
    },
    roles: {
      list: jest.fn(),
    },
    locations: {
      list: jest.fn(),
    },
    scenarios: {
      list: jest.fn(),
    },
  },
}));

// Mock react-router-dom hooks
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  Link: ({ children, to }: any) => <a href={to}>{children}</a>,
}));

// Mock UI components
jest.mock('../../../client/src/components/ui/DataTable', () => ({
  DataTable: ({ data, columns, onRowClick }: any) => {
    // Make sure React is available in scope
    const React = require('react');
    return (
      <table role="table">
        <thead>
          <tr>
            {columns.map((col: any) => (
              <th key={col.key}>{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data?.map((row: any, idx: number) => (
            <tr key={idx} onClick={() => onRowClick?.(row)}>
              {columns.map((col: any) => (
                <td key={col.key}>
                  {col.render ? col.render(row[col.key], row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  },
  // Column is a type, not a value
}));

// Mock UserContext
jest.mock('../../../client/src/contexts/UserContext', () => ({
  UserProvider: ({ children }: any) => <>{children}</>,
  useUser: () => ({
    currentUser: { id: 'user-1', name: 'Test User' },
    isLoggedIn: true,
    setCurrentUser: jest.fn(),
    logout: jest.fn(),
  }),
}));

// Mock ScenarioContext
jest.mock('../../../client/src/contexts/ScenarioContext', () => ({
  useScenario: () => ({
    currentScenario: { id: '1', name: 'Baseline', scenario_type: 'baseline' },
    scenarios: [{ id: '1', name: 'Baseline', scenario_type: 'baseline' }],
    setCurrentScenario: jest.fn(),
    isLoading: false,
    error: null,
  }),
}));

// Mock useModal hook  
jest.mock('../../../client/src/hooks/useModal', () => ({
  useModal: () => ({
    isOpen: false,
    open: jest.fn(),
    close: jest.fn(),
  }),
}));

// Mock ThemeContext
jest.mock('../../../client/src/contexts/ThemeContext', () => ({
  ThemeProvider: ({ children }: any) => <>{children}</>,
  useTheme: () => ({
    theme: 'light',
    setTheme: jest.fn(),
  }),
}));

// Mock PortalThemeProvider
jest.mock('../../../client/src/components/PortalThemeProvider', () => ({
  PortalThemeProvider: ({ children }: any) => <>{children}</>,
}));

// Mock ConfirmDialog
jest.mock('../../../client/src/components/ui/ConfirmDialog', () => ({
  ConfirmDialog: ({ open, title, children, onConfirm }: any) => 
    open ? (
      <div data-testid="confirm-dialog">
        <h2>{title}</h2>
        <div>{children}</div>
        <button onClick={() => onConfirm()}>Confirm</button>
      </div>
    ) : null,
}));

// Mock PersonModal
jest.mock('../../../client/src/components/modals/PersonModal', () => {
  return {
    __esModule: true,
    default: ({ isOpen }: any) => isOpen ? <div data-testid="person-dialog">Mock Person Dialog</div> : null,
  };
});

// Mock SmartAssignmentModal
jest.mock('../../../client/src/components/modals/SmartAssignmentModal', () => ({
  SmartAssignmentModal: ({ isOpen }: any) => isOpen ? <div data-testid="smart-assignment-modal">Mock Smart Assignment</div> : null,
}));

// Mock UI components
jest.mock('../../../client/src/components/ui/FilterBar', () => ({
  FilterBar: ({ children }: any) => <div data-testid="filter-bar">{children}</div>,
}));

jest.mock('../../../client/src/components/ui/LoadingSpinner', () => ({
  LoadingSpinner: () => <div data-testid="loading-spinner">Loading...</div>,
}));

jest.mock('../../../client/src/components/ui/ErrorMessage', () => ({
  ErrorMessage: ({ message, details }: any) => <div data-testid="error-message">Error: {message || details || 'Unknown error'}</div>,
}));

// Mock CSS imports
jest.mock('../../../client/src/pages/People.css', () => ({}));

// Now import the rest
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './test-utils';
import '@testing-library/jest-dom';
import People from '../../../client/src/pages/People';

// Define the PeopleProps type based on what the component expects
interface Person {
  id: string;
  name: string;
  role_id: string | null;
  primary_role_name?: string | null;
  location_id: string;
  location_name?: string;
  email?: string;
  start_date?: string;
  default_availability_percentage: number;
  default_hours_per_day: number;
  worker_type: string;
}

// Mock data
const mockPeople: Person[] = [
  {
    id: '1',
    name: 'John Over-allocated',
    role_id: 'dev',
    primary_role_name: 'Developer', // Changed from role_name to primary_role_name
    location_id: 'nyc',
    location_name: 'New York',
    email: 'john@example.com',
    start_date: '2023-01-01',
    default_availability_percentage: 100,
    default_hours_per_day: 8,
    worker_type: 'FTE',
  },
  {
    id: '2',
    name: 'Jane Under-allocated',
    role_id: 'designer',
    primary_role_name: 'Designer',
    location_id: 'sf',
    location_name: 'San Francisco',
    email: 'jane@example.com',
    start_date: '2023-01-01',
    default_availability_percentage: 100,
    default_hours_per_day: 8,
    worker_type: 'Contractor',
  },
  {
    id: '3',
    name: 'Bob Fully-allocated',
    role_id: 'pm',
    primary_role_name: 'Project Manager',
    location_id: 'london',
    location_name: 'London',
    email: 'bob@example.com',
    start_date: '2023-01-01',
    default_availability_percentage: 100,
    default_hours_per_day: 8,
    worker_type: 'FTE',
  },
  {
    id: '4',
    name: 'Alice Available',
    role_id: 'dev',
    primary_role_name: 'Developer',
    location_id: 'nyc',
    location_name: 'New York',
    email: 'alice@example.com',
    start_date: '2023-01-01',
    default_availability_percentage: 100,
    default_hours_per_day: 8,
    worker_type: 'Consultant',
  },
];

const mockUtilizationData = {
  personUtilization: [
    {
      person_id: '1',
      total_allocation: 120, // Over-allocated (120% of 100 availability)
      current_availability_percentage: 100,
      allocation_status: 'OVER_ALLOCATED',
    },
    {
      person_id: '2',
      total_allocation: 60, // Under-allocated (60% of 100 availability)
      current_availability_percentage: 100,
      allocation_status: 'UNDER_ALLOCATED',
    },
    {
      person_id: '3',
      total_allocation: 90, // Fully allocated (90% of 100 availability)
      current_availability_percentage: 100,
      allocation_status: 'FULLY_ALLOCATED',
    },
    {
      person_id: '4',
      total_allocation: 20, // Available (20% of 100 availability)
      current_availability_percentage: 100,
      allocation_status: 'AVAILABLE',
    },
  ],
};

describe('People Workload Management', () => {
  const { api } = require('../../../client/src/lib/api-client');

  beforeEach(() => {
    jest.clearAllMocks();
    api.people.list.mockResolvedValue({ data: { data: mockPeople } });
    api.people.getUtilization.mockResolvedValue({ data: mockUtilizationData });
    api.roles.list.mockResolvedValue({ data: [] });
    api.locations.list.mockResolvedValue({ data: { data: [] } });
    api.scenarios.list.mockResolvedValue({ data: [] });
  });

  describe('Team Insights Summary', () => {
    test('should display team insights summary at page level', async () => {
      renderWithProviders(<People />);

      await waitFor(() => {
        // Check for the insights in the header
        expect(screen.getByText(/1 over-allocated/i)).toBeInTheDocument();
        expect(screen.getByText(/2 available/i)).toBeInTheDocument(); // 2 people are available based on our mock data
        expect(screen.getByText(/4 total people/i)).toBeInTheDocument();
      });
    });

    test('should show correct counts when no over-allocated people', async () => {
      const modifiedUtilizationData = {
        personUtilization: mockUtilizationData.personUtilization.map(p => ({
          ...p,
          total_allocation: p.total_allocation > 100 ? 80 : p.total_allocation,
          allocation_status: p.allocation_status === 'OVER_ALLOCATED' ? 'FULLY_ALLOCATED' : p.allocation_status,
        })),
      };
      
      api.people.getUtilization.mockResolvedValue({ data: modifiedUtilizationData });
      
      renderWithProviders(<People />);

      await waitFor(() => {
        expect(screen.queryByText(/0 over-allocated/i)).toBeInTheDocument();
      });
    });
  });

  describe('Workload Status Column', () => {
    test('should display workload status for each person', async () => {
      renderWithProviders(<People />);

      await waitFor(() => {
        // Check for workload status displays
        expect(screen.getByText('120%')).toBeInTheDocument(); // Over-allocated
        expect(screen.getByText('60%')).toBeInTheDocument(); // Under-allocated
        expect(screen.getByText('90%')).toBeInTheDocument(); // Fully allocated
        expect(screen.getByText('20%')).toBeInTheDocument(); // Available
      });
    });

    test('should handle missing utilization data gracefully', async () => {
      api.people.getUtilization.mockResolvedValue({ data: { personUtilization: [] } });
      
      renderWithProviders(<People />);

      await waitFor(() => {
        // Should still show people but status will show as unknown
        const johnLink = screen.getByRole('link', { name: 'John Over-allocated' });
        expect(johnLink).toBeInTheDocument();
        // Should show "View Details" action when no utilization data
        expect(screen.getAllByText('View Details').length).toBeGreaterThan(0);
      });
    });
  });

  describe('Quick Action Buttons', () => {
    test('should show "Reduce Load" action for over-allocated people', async () => {
      renderWithProviders(<People />);

      await waitFor(() => {
        const reduceButtons = screen.getAllByRole('button', { name: /Reduce Load/i });
        expect(reduceButtons.length).toBeGreaterThan(0);
      });
    });

    test('should show "Assign More" action for under-allocated people', async () => {
      renderWithProviders(<People />);

      await waitFor(() => {
        const assignMoreButtons = screen.getAllByRole('button', { name: /Assign More/i });
        expect(assignMoreButtons.length).toBeGreaterThan(0);
      });
    });

    test('should show "Monitor" action for fully allocated people', async () => {
      renderWithProviders(<People />);

      await waitFor(() => {
        const monitorButtons = screen.getAllByRole('button', { name: /Monitor/i });
        expect(monitorButtons.length).toBeGreaterThan(0);
      });
    });

    test('should show "Assign Project" action for available people', async () => {
      renderWithProviders(<People />);

      await waitFor(() => {
        const assignProjectButtons = screen.getAllByRole('button', { name: /Assign Project/i });
        expect(assignProjectButtons.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Status Color Coding', () => {
    test('should apply correct CSS classes for different statuses', async () => {
      renderWithProviders(<People />);

      await waitFor(() => {
        // Check for status indicators with appropriate classes
        const statusIndicators = screen.getAllByText(/\d+%/);
        
        // Find specific percentages and check their parent elements
        const overAllocated = statusIndicators.find(el => el.textContent === '120%');
        expect(overAllocated?.parentElement?.className).toContain('status-danger');
        
        const fullyAllocated = statusIndicators.find(el => el.textContent === '90%');
        expect(fullyAllocated?.parentElement?.className).toContain('status-warning');
        
        const underAllocated = statusIndicators.find(el => el.textContent === '60%');
        expect(underAllocated?.parentElement?.className).toContain('status-info');
        
        const available = statusIndicators.find(el => el.textContent === '20%');
        expect(available?.parentElement?.className).toContain('status-success');
      });
    });
  });

  describe('Button Styling and Variants', () => {
    test('should apply correct button variants for different actions', async () => {
      renderWithProviders(<People />);

      await waitFor(() => {
        const reduceButton = screen.getByRole('button', { name: /Reduce Load/i });
        expect(reduceButton.className).toContain('btn-danger');
        
        const assignMoreButton = screen.getByRole('button', { name: /Assign More/i });
        expect(assignMoreButton.className).toContain('btn-info');
        
        const monitorButton = screen.getByRole('button', { name: /Monitor/i });
        expect(monitorButton.className).toContain('btn-warning');
        
        const assignProjectButton = screen.getByRole('button', { name: /Assign Project/i });
        expect(assignProjectButton.className).toContain('btn-success');
      });
    });
  });

  describe('Integration with Person Status', () => {
    test('should correctly calculate utilization percentages', async () => {
      renderWithProviders(<People />);

      await waitFor(() => {
        // Verify the utilization calculation shows correctly
        const johnRow = screen.getByText('John Over-allocated').closest('tr');
        expect(johnRow).toHaveTextContent('120%');
        expect(johnRow).toHaveTextContent('over allocated');
      });
    });

    test('should handle edge case of zero availability', async () => {
      const peopleWithZeroAvailability = [
        {
          ...mockPeople[0],
          default_availability_percentage: 0,
        },
      ];
      
      api.people.list.mockResolvedValue({ data: { data: peopleWithZeroAvailability } });
      
      renderWithProviders(<People />);

      await waitFor(() => {
        // Should handle gracefully without dividing by zero
        const johnLink = screen.getByRole('link', { name: 'John Over-allocated' });
        expect(johnLink).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility and Interactions', () => {
    test('should handle edit button clicks without interfering with quick actions', async () => {
      renderWithProviders(<People />);

      await waitFor(() => {
        // Find all edit buttons
        const editButtons = screen.getAllByTitle('Edit');
        expect(editButtons.length).toBeGreaterThan(0);
        
        // Click the first edit button
        fireEvent.click(editButtons[0]);
        
        // The modal would open but since we mock it to always be closed,
        // we can at least verify the button exists and is clickable
        expect(editButtons[0]).toBeInTheDocument();
      });
    });

    test('should show proper tooltips and titles for action buttons', async () => {
      renderWithProviders(<People />);

      await waitFor(() => {
        const reduceButton = screen.getByRole('button', { name: /Reduce Load/i });
        expect(reduceButton).toHaveAttribute('title', 'Reduce Load');
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle API errors gracefully', async () => {
      api.people.list.mockRejectedValue(new Error('Failed to load people'));
      
      renderWithProviders(<People />);

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toBeInTheDocument();
      });
    });
  });
});