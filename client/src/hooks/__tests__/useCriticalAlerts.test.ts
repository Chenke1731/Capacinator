import { renderHook } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import { useCriticalAlerts } from '../useCriticalAlerts';
import { useScenario } from '../../contexts/ScenarioContext';

// Mock dependencies
jest.mock('@tanstack/react-query');
jest.mock('../../contexts/ScenarioContext', () => ({
  useScenario: jest.fn()
}));
jest.mock('../../lib/api-client', () => ({
  api: {
    reporting: {
      getDashboard: jest.fn(),
      getCapacity: jest.fn()
    }
  }
}));

describe('useCriticalAlerts', () => {
  const mockUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;
  const mockUseScenario = useScenario as jest.Mock;

  beforeEach(() => {
    (mockUseScenario as jest.Mock).mockReturnValue({
      currentScenario: { id: 'scenario-1', name: 'Test Scenario' }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return empty alerts when data is not loaded', () => {
    mockUseQuery
      .mockReturnValueOnce({
        data: null,
        isLoading: true,
        error: null
      } as any)
      .mockReturnValueOnce({
        data: null,
        isLoading: true,
        error: null
      } as any);

    const { result } = renderHook(() => useCriticalAlerts());

    expect(result.current.alerts).toEqual([]);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.hasAlerts).toBe(false);
  });

  it('should generate critical capacity gap alerts', () => {
    const mockDashboard = {
      capacityGaps: { GAP: 5 },
      utilization: {},
      projectHealth: {}
    };

    mockUseQuery
      .mockReturnValueOnce({
        data: mockDashboard,
        isLoading: false,
        error: null
      } as any)
      .mockReturnValueOnce({
        data: { summary: {} },
        isLoading: false,
        error: null
      } as any);

    const { result } = renderHook(() => useCriticalAlerts());

    expect(result.current.alerts).toHaveLength(1);
    expect(result.current.alerts[0]).toMatchObject({
      id: 'capacity-gaps',
      type: 'capacity_gap',
      severity: 'critical',
      title: 'Critical Capacity Gaps',
      count: 5
    });
    expect(result.current.criticalCount).toBe(1);
  });

  it('should set high severity for 2-4 capacity gaps', () => {
    const mockDashboard = {
      capacityGaps: { GAP: 3 },
      utilization: {},
      projectHealth: {}
    };

    mockUseQuery
      .mockReturnValueOnce({ data: mockDashboard, isLoading: false, error: null } as any)
      .mockReturnValueOnce({ data: { summary: {} }, isLoading: false, error: null } as any);

    const { result } = renderHook(() => useCriticalAlerts());

    expect(result.current.alerts[0].severity).toBe('high');
    expect(result.current.highCount).toBe(1);
  });

  it('should set medium severity for 1 capacity gap', () => {
    const mockDashboard = {
      capacityGaps: { GAP: 1 },
      utilization: {},
      projectHealth: {}
    };

    mockUseQuery
      .mockReturnValueOnce({ data: mockDashboard, isLoading: false, error: null } as any)
      .mockReturnValueOnce({ data: { summary: {} }, isLoading: false, error: null } as any);

    const { result } = renderHook(() => useCriticalAlerts());

    expect(result.current.alerts[0].severity).toBe('medium');
  });

  it('should generate over-allocation alerts', () => {
    const mockDashboard = {
      capacityGaps: {},
      utilization: { OVER_ALLOCATED: 4 },
      projectHealth: {}
    };

    mockUseQuery
      .mockReturnValueOnce({ data: mockDashboard, isLoading: false, error: null } as any)
      .mockReturnValueOnce({ data: { summary: {} }, isLoading: false, error: null } as any);

    const { result } = renderHook(() => useCriticalAlerts());

    expect(result.current.alerts).toHaveLength(1);
    expect(result.current.alerts[0]).toMatchObject({
      id: 'over-allocation',
      type: 'over_allocation',
      severity: 'critical',
      count: 4
    });
  });

  it('should generate overdue project alerts', () => {
    const mockDashboard = {
      capacityGaps: {},
      utilization: {},
      projectHealth: { OVERDUE: 2 }
    };

    mockUseQuery
      .mockReturnValueOnce({ data: mockDashboard, isLoading: false, error: null } as any)
      .mockReturnValueOnce({ data: { summary: {} }, isLoading: false, error: null } as any);

    const { result } = renderHook(() => useCriticalAlerts());

    expect(result.current.alerts).toHaveLength(1);
    expect(result.current.alerts[0]).toMatchObject({
      id: 'project-overdue',
      type: 'project_risk',
      severity: 'high',
      count: 2
    });
  });

  it('should set critical severity for 3+ overdue projects', () => {
    const mockDashboard = {
      capacityGaps: {},
      utilization: {},
      projectHealth: { OVERDUE: 5 }
    };

    mockUseQuery
      .mockReturnValueOnce({ data: mockDashboard, isLoading: false, error: null } as any)
      .mockReturnValueOnce({ data: { summary: {} }, isLoading: false, error: null } as any);

    const { result } = renderHook(() => useCriticalAlerts());

    expect(result.current.alerts[0].severity).toBe('critical');
  });

  it('should generate high utilization warnings', () => {
    const mockDashboard = {
      capacityGaps: {},
      utilization: { FULLY_ALLOCATED: 9 },
      projectHealth: {},
      summary: { people: 10 }
    };

    mockUseQuery
      .mockReturnValueOnce({ data: mockDashboard, isLoading: false, error: null } as any)
      .mockReturnValueOnce({ data: { summary: {} }, isLoading: false, error: null } as any);

    const { result } = renderHook(() => useCriticalAlerts());

    expect(result.current.alerts).toHaveLength(1);
    expect(result.current.alerts[0]).toMatchObject({
      id: 'high-utilization',
      type: 'deadline_warning',
      severity: 'medium'
    });
  });

  it('should not generate high utilization warning below 80%', () => {
    const mockDashboard = {
      capacityGaps: {},
      utilization: { FULLY_ALLOCATED: 7 },
      projectHealth: {},
      summary: { people: 10 }
    };

    mockUseQuery
      .mockReturnValueOnce({ data: mockDashboard, isLoading: false, error: null } as any)
      .mockReturnValueOnce({ data: { summary: {} }, isLoading: false, error: null } as any);

    const { result } = renderHook(() => useCriticalAlerts());

    expect(result.current.alerts).toHaveLength(0);
  });

  it('should generate tight capacity warnings', () => {
    const mockDashboard = {
      capacityGaps: { TIGHT: 5 },
      utilization: {},
      projectHealth: {}
    };

    mockUseQuery
      .mockReturnValueOnce({ data: mockDashboard, isLoading: false, error: null } as any)
      .mockReturnValueOnce({ data: { summary: {} }, isLoading: false, error: null } as any);

    const { result } = renderHook(() => useCriticalAlerts());

    expect(result.current.alerts).toHaveLength(1);
    expect(result.current.alerts[0]).toMatchObject({
      id: 'tight-capacity',
      type: 'deadline_warning',
      severity: 'medium',
      count: 5
    });
  });

  it('should not generate tight capacity warning below threshold', () => {
    const mockDashboard = {
      capacityGaps: { TIGHT: 2 },
      utilization: {},
      projectHealth: {}
    };

    mockUseQuery
      .mockReturnValueOnce({ data: mockDashboard, isLoading: false, error: null } as any)
      .mockReturnValueOnce({ data: { summary: {} }, isLoading: false, error: null } as any);

    const { result } = renderHook(() => useCriticalAlerts());

    expect(result.current.alerts).toHaveLength(0);
  });

  it('should generate upcoming staffing shortfall alerts', () => {
    const mockDashboard = {
      capacityGaps: {},
      utilization: {},
      projectHealth: {}
    };

    const mockCapacityReport = {
      summary: { totalGaps: 120 }
    };

    mockUseQuery
      .mockReturnValueOnce({ data: mockDashboard, isLoading: false, error: null } as any)
      .mockReturnValueOnce({ data: mockCapacityReport, isLoading: false, error: null } as any);

    const { result } = renderHook(() => useCriticalAlerts());

    expect(result.current.alerts).toHaveLength(1);
    expect(result.current.alerts[0]).toMatchObject({
      id: 'upcoming-gaps',
      type: 'deadline_warning',
      severity: 'high'
    });
  });

  it('should handle multiple alert types simultaneously', () => {
    const mockDashboard = {
      capacityGaps: { GAP: 3, TIGHT: 4 },
      utilization: { OVER_ALLOCATED: 2 },
      projectHealth: { OVERDUE: 1 },
      summary: { people: 10 }
    };

    mockUseQuery
      .mockReturnValueOnce({ data: mockDashboard, isLoading: false, error: null } as any)
      .mockReturnValueOnce({ data: { summary: {} }, isLoading: false, error: null } as any);

    const { result } = renderHook(() => useCriticalAlerts());

    expect(result.current.alerts.length).toBeGreaterThan(1);
    expect(result.current.hasAlerts).toBe(true);
  });

  it('should return error when dashboard query fails', () => {
    const mockError = new Error('Failed to fetch dashboard');

    mockUseQuery
      .mockReturnValueOnce({
        data: null,
        isLoading: false,
        error: mockError
      } as any)
      .mockReturnValueOnce({
        data: null,
        isLoading: false,
        error: null
      } as any);

    const { result } = renderHook(() => useCriticalAlerts());

    expect(result.current.error).toBe(mockError);
  });

  it('should not run queries when no scenario is selected', () => {
    (mockUseScenario as jest.Mock).mockReturnValue({
      currentScenario: null
    });

    mockUseQuery
      .mockReturnValueOnce({ data: null, isLoading: false, error: null } as any)
      .mockReturnValueOnce({ data: null, isLoading: false, error: null } as any);

    renderHook(() => useCriticalAlerts());

    // Queries should be disabled (enabled: false)
    const firstCall = mockUseQuery.mock.calls[0][0];
    const secondCall = mockUseQuery.mock.calls[1][0];

    expect(firstCall.enabled).toBe(false);
    expect(secondCall.enabled).toBe(false);
  });
});
