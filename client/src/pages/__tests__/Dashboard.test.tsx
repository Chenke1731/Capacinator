import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { Dashboard } from '../Dashboard';
import { api } from '../../lib/api-client';

// Mock the API client
jest.mock('../../lib/api-client', () => ({
  api: {
    reporting: {
      getDashboard: jest.fn()
    },
    intake: {
      counts: jest.fn()
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
    (api.intake.counts as jest.Mock).mockResolvedValue({
      data: { data: { new: 3, converted: 1, rejected: 0, by_source: { jdc_sr: 3 } } }
    });
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

  test('renders real unavailable/limited counts from availability (I02d)', async () => {
    const mockApiResponse = {
      data: {
        success: true,
        data: {
          summary: { projects: 0, people: 12, roles: 3 },
          projectHealth: {},
          capacityGaps: {},
          utilization: {},
          availability: {
            AVAILABLE: 5,
            ASSIGNED: 7,
            UNAVAILABLE: 2,
            LIMITED: 3
          }
        },
        requestId: 'test-i02d'
      }
    };

    (api.reporting.getDashboard as any).mockResolvedValue(mockApiResponse);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByLabelText(/2 people on leave/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/3 people with limited capacity/i)).toBeInTheDocument();
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

  test('U22: 收件箱面板显示 new 计数并可深链收件箱', async () => {
    (api.reporting.getDashboard as any).mockResolvedValue({
      data: { data: {
        summary: { projects: 1, people: 1, roles: 1 },
        projectHealth: {}, capacityGaps: {}, utilization: {},
        availability: {}, design_watch: [], lifecycle_summary: {}
      } }
    });
    renderDashboard();

    await waitFor(() => expect(screen.getByTestId('dashboard-inbox-count')).toBeInTheDocument());
    expect(screen.getByTestId('dashboard-inbox-count').textContent).toBe('3');
    // 点击冒泡到 Card（section 本身无 handler）
    fireEvent.click(screen.getByTestId('dashboard-inbox-count'));
    expect(mockNavigate).toHaveBeenCalledWith('/projects?tab=intake');
  });

  test('U22: 收件箱计数失败显示错误+重试（不得显示 0）', async () => {
    (api.reporting.getDashboard as any).mockResolvedValue({
      data: { data: {
        summary: { projects: 1, people: 1, roles: 1 },
        projectHealth: {}, capacityGaps: {}, utilization: {},
        availability: {}, design_watch: [], lifecycle_summary: {}
      } }
    });
    (api.intake.counts as jest.Mock).mockRejectedValue(new Error('boom'));
    renderDashboard();

    await waitFor(() => expect(screen.getByTestId('dashboard-inbox-error')).toBeInTheDocument());
    // 告警区也可能有 Retry——限定在收件箱错误块内
    expect(within(screen.getByTestId('dashboard-inbox-error')).getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-inbox-count')).not.toBeInTheDocument();
  });
});