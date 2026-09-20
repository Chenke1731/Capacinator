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
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate
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

describe('Dashboard Component', () => {
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

  test('should handle API response with nested data structure', async () => {
    // This is the actual API response structure from the server
    const mockApiResponse = {
      data: {
        success: true,
        data: {
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

    (api.reporting.getDashboard as any).mockResolvedValue(mockApiResponse);

    renderDashboard();

    // Wait for the dashboard to load
    await waitFor(() => {
      expect(screen.getByText('Active Projects')).toBeInTheDocument();
    });

    // Verify the data is displayed correctly
    expect(screen.getByText('7')).toBeInTheDocument(); // projects count
    expect(screen.getAllByText('8')).toHaveLength(2); // people count and utilization (both are 8)
    expect(screen.getByText('13')).toBeInTheDocument(); // roles count
  });

  test('should handle undefined projectHealth gracefully', async () => {
    // Test case where projectHealth might be undefined
    const mockApiResponse = {
      data: {
        success: true,
        data: {
          summary: {
            projects: 0,
            people: 0,
            roles: 0
          },
          projectHealth: undefined, // This would cause the error
          capacityGaps: {},
          utilization: {},
          availability: {}
        },
        requestId: 'test-456'
      }
    };

    (api.reporting.getDashboard as any).mockResolvedValue(mockApiResponse);

    renderDashboard();

    // Should not throw an error
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });
  });

  test('should show loading state', () => {
    (api.reporting.getDashboard as any).mockImplementation(() => new Promise(() => {})); // Never resolves

    renderDashboard();

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  test('should show error state', async () => {
    (api.reporting.getDashboard as any).mockRejectedValue(new Error('API Error'));

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Failed to load dashboard data')).toBeInTheDocument();
    });
  });
});