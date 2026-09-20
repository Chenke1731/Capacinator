import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { Dashboard } from '../Dashboard';
import { api } from '../../lib/api-client';

// Mock the API client
jest.mock('../../lib/api-client', () => ({
  api: {
    reporting: {
      getDashboard: jest.fn()
    }
  }
}));

// Mock the navigation
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => jest.fn()
}));

// Mock the ScenarioContext
jest.mock('../../contexts/ScenarioContext', () => ({
  useScenario: () => ({
    currentScenario: { 
      id: '123', 
      name: 'Test Scenario',
      scenario_type: 'baseline'
    },
    scenarios: [],
    setCurrentScenario: jest.fn(),
    isLoading: false,
    error: null
  }),
  ScenarioProvider: ({ children }: any) => <>{children}</>
}));

describe('Dashboard API Response Structure', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false }
      }
    });
    jest.clearAllMocks();
  });

  const renderDashboard = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Dashboard />
        </BrowserRouter>
      </QueryClientProvider>
    );
  };

  test('REGRESSION TEST: should handle API response with nested data.data structure', async () => {
    // This is the ACTUAL API response structure from the server
    const actualApiResponse = {
      data: {
        success: true,
        data: {  // <-- Note the nested data.data structure (fixed in Dashboard component)
          summary: {
            projects: 7,
            people: 8,
            roles: 13
          },
          projectHealth: {
            ACTIVE: 7
          },
          capacityGaps: {
            GAP: 0,
            TIGHT: 0,
            OK: 13
          },
          utilization: {
            Available: 8
          },
          availability: {
            AVAILABLE: 8,
            ASSIGNED: 0
          }
        },
        requestId: 'test-123'
      }
    };

    (api.reporting.getDashboard as any).mockResolvedValue(actualApiResponse);

    renderDashboard();

    // This should not throw an error
    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    // Verify the data is displayed correctly
    expect(screen.getByText('Active Projects')).toBeInTheDocument();
    expect(screen.getByText('Total People')).toBeInTheDocument();
    expect(screen.getByText('Total Roles')).toBeInTheDocument();
    
    // Verify the values are displayed
    expect(screen.getByText('7')).toBeInTheDocument(); // projects
    expect(screen.getAllByText('8')[0]).toBeInTheDocument(); // people
    expect(screen.getByText('13')).toBeInTheDocument(); // roles
  });

  test('EDGE CASE: should handle missing nested properties gracefully', async () => {
    // Test case where some properties might be undefined
    const apiResponseWithMissingData = {
      data: {
        success: true,
        data: {
          summary: {
            projects: 0,
            people: 0,
            roles: 0
          },
          // These could be undefined in edge cases
          projectHealth: undefined,
          capacityGaps: undefined,
          utilization: undefined,
          availability: undefined
        }
      }
    };

    (api.reporting.getDashboard as any).mockResolvedValue(apiResponseWithMissingData);

    // Should not throw an error even with undefined properties
    const { container } = renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    // Should render without crashing
    expect(container.querySelector('.page-container')).toBeInTheDocument();
  });

  test('BEFORE FIX: would fail with "Cannot convert undefined to object" error', async () => {
    // This simulates what the component was expecting before the fix
    const incorrectExpectation = {
      data: {  // Component was expecting data directly here
        summary: {
          projects: 7,
          people: 8,
          roles: 13
        },
        projectHealth: {
          ACTIVE: 7
        },
        capacityGaps: {},
        utilization: {},
        availability: {}
      }
    };

    // But the actual API returns a nested structure
    const actualApiResponse = {
      data: {
        success: true,
        data: incorrectExpectation.data  // <-- Nested!
      }
    };

    (api.reporting.getDashboard as any).mockResolvedValue(actualApiResponse);
    
    // Before the fix, this test would demonstrate the error:
    // The component would try to access response.data.projectHealth
    // but would actually get response.data.success instead,
    // causing Object.keys() to fail
    
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });
  });
});