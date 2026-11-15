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

  test('should show loading state', async () => {
    (api.reporting.getDashboard as any).mockImplementation(() => new Promise(() => {})); // Never resolves

    renderDashboard();

    /* 2026-11-15 ⑥: LoadingSpinner 默认 250ms 防闪延迟——同步断言改为 findBy(轮询到点) */
    expect(await screen.findByText('Loading...')).toBeInTheDocument();
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

  /* 盲评 B2-G1（2026-11-15）：堆叠条渲染数学守卫——比例=计数占比、零值键无段、空态分支。
     变异自证：改 entry.value/100 或删 healthTotal 守卫或删零值过滤 → 必红 */
  describe('health stacked bar (B2-G1)', () => {
    const mockHealth = (projectHealth: Record<string, number>) => {
      (api.reporting.getDashboard as jest.Mock).mockResolvedValue({
        data: { success: true, data: {
          summary: { projects: 70, people: 8, roles: 13 },
          projectHealth,
          capacityGaps: {}, utilization: {}, availability: {},
          design_watch: [], lifecycle_summary: {}
        } }
      });
    };

    test('多状态：段数=非零键数，宽度=计数占比(±0.01)，图例含计数', async () => {
      mockHealth({ ACTIVE: 45, PLANNING: 20, OVERDUE: 5, AT_RISK: 0 });
      renderDashboard();

      await waitFor(() => {
        const segs = document.querySelectorAll('.health-stacked-seg');
        expect(segs).toHaveLength(3); // AT_RISK:0 无段
        const expectWidth = (el: Element, pct: number) =>
          expect(parseFloat((el as HTMLElement).style.width)).toBeCloseTo(pct, 1);
        expectWidth(segs[0], 64.28); // 45/70
        expectWidth(segs[1], 28.57); // 20/70
        expectWidth(segs[2], 7.14);  // 5/70
        const legend = document.querySelectorAll('.health-legend li');
        expect(legend).toHaveLength(3);
        expect(legend[0].textContent).toMatch(/45/);
        expect(legend[1].textContent).toMatch(/20/);
        expect(legend[2].textContent).toMatch(/5/);
        // aria 与图例同源(零键不进 aria)
        const img = document.querySelector('.chart-container[role="img"]');
        expect(img?.getAttribute('aria-label')).not.toMatch(/AT_RISK/i);
      });
    });

    test('空 projectHealth：走 health-empty 分支', async () => {
      mockHealth({});
      renderDashboard();

      await waitFor(() => {
        expect(document.querySelector('.health-empty')).toBeTruthy();
        expect(document.querySelectorAll('.health-stacked-seg')).toHaveLength(0);
      });
    });
  });
});