import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { queryKeys } from '../lib/queryKeys';
import { useScenario } from '../contexts/ScenarioContext';

interface CriticalAlert {
  id: string;
  type: 'capacity_gap' | 'project_risk' | 'deadline_warning' | 'over_allocation';
  severity: 'critical' | 'high' | 'medium';
  title: string;
  description: string;
  actionText: string;
  navigationPath: string;
  count?: number;
  dueDate?: string;
}

export function useCriticalAlerts() {
  const { currentScenario } = useScenario();

  // Fetch dashboard data
  const { data: dashboard, isLoading: dashboardLoading, error: dashboardError } = useQuery({
    queryKey: queryKeys.dashboard.summary(currentScenario?.id),
    queryFn: async () => {
      const response = await api.reporting.getDashboard();
      return response.data.data;
    },
    enabled: !!currentScenario
  });

  // Fetch capacity report for more detailed information
  const { data: capacityReport, isLoading: capacityLoading } = useQuery({
    queryKey: queryKeys.reports.capacity(undefined, currentScenario?.id),
    queryFn: async () => {
      const response = await api.reporting.getCapacity();
      return response.data.data;
    },
    enabled: !!currentScenario
  });

  const alerts = useMemo((): CriticalAlert[] => {
    if (!dashboard || !capacityReport) return [];

    const alertList: CriticalAlert[] = [];

    // Critical capacity gaps
    const criticalGaps = dashboard.capacityGaps?.GAP || 0;
    if (criticalGaps > 0) {
      alertList.push({
        id: 'capacity-gaps',
        type: 'capacity_gap',
        severity: criticalGaps >= 5 ? 'critical' : criticalGaps >= 2 ? 'high' : 'medium',
        title: 'Critical Capacity Gaps',
        description: `${criticalGaps} roles have insufficient capacity to meet project demands`,
        actionText: 'View Capacity Report',
        navigationPath: '/reports?tab=capacity',
        count: criticalGaps
      });
    }

    // Over-allocated people
    // utilization keys come mixed-case ('Over-allocated') from the reporting
    // dashboard; UPPER_SNAKE kept as fallback for older payload shapes
    const overAllocated = dashboard.utilization?.OVER_ALLOCATED ?? dashboard.utilization?.['Over-allocated'] ?? 0;
    if (overAllocated > 0) {
      alertList.push({
        id: 'over-allocation',
        type: 'over_allocation',
        severity: overAllocated >= 3 ? 'critical' : overAllocated >= 2 ? 'high' : 'medium',
        title: 'Over-allocated Resources',
        description: `${overAllocated} people are allocated beyond their available capacity`,
        actionText: 'View People Utilization',
        navigationPath: '/people?tab=utilization',
        count: overAllocated
      });
    }

    // Project health risks
    const overdueProjects = dashboard.projectHealth?.OVERDUE || 0;
    if (overdueProjects > 0) {
      alertList.push({
        id: 'project-overdue',
        type: 'project_risk',
        severity: overdueProjects >= 3 ? 'critical' : 'high',
        title: 'Overdue Projects',
        description: `${overdueProjects} projects are behind schedule and may require resource reallocation`,
        actionText: 'View Project Status',
        navigationPath: '/projects?filter=overdue',
        count: overdueProjects
      });
    }

    // High utilization warnings (potential future over-allocation)
    const fullyAllocated = dashboard.utilization?.FULLY_ALLOCATED ?? dashboard.utilization?.['Fully-allocated'] ?? 0;
    const totalPeople = dashboard.summary?.people || 1;
    const highUtilizationRatio = fullyAllocated / totalPeople;

    if (highUtilizationRatio > 0.8) {
      alertList.push({
        id: 'high-utilization',
        type: 'deadline_warning',
        severity: 'medium',
        title: 'High Team Utilization',
        description: `${Math.round(highUtilizationRatio * 100)}% of team is fully allocated. Limited flexibility for new projects`,
        actionText: 'Review Utilization',
        navigationPath: '/people?tab=utilization'
      });
    }

    // Tight capacity warnings
    const tightCapacity = dashboard.capacityGaps?.TIGHT || 0;
    if (tightCapacity >= 3) {
      alertList.push({
        id: 'tight-capacity',
        type: 'deadline_warning',
        severity: 'medium',
        title: 'Tight Capacity Constraints',
        description: `${tightCapacity} roles are operating at or near maximum capacity`,
        actionText: 'View Capacity Analysis',
        navigationPath: '/reports?tab=capacity',
        count: tightCapacity
      });
    }

    // Future deadline warnings (projects starting soon without full staffing)
    if (capacityReport?.summary) {
      const totalGapHours = capacityReport.summary.totalGaps || 0;
      if (totalGapHours > 40) { // More than a week of work
        alertList.push({
          id: 'upcoming-gaps',
          type: 'deadline_warning',
          severity: 'high',
          title: 'Upcoming Staffing Shortfalls',
          description: `${Math.round(totalGapHours)} hours of unmet demand in upcoming projects`,
          actionText: 'View Gap Analysis',
          navigationPath: '/reports?tab=gaps'
        });
      }
    }

    return alertList;
  }, [dashboard, capacityReport]);

  return {
    alerts,
    isLoading: dashboardLoading || capacityLoading,
    error: dashboardError,
    hasAlerts: alerts.length > 0,
    criticalCount: alerts.filter(alert => alert.severity === 'critical').length,
    highCount: alerts.filter(alert => alert.severity === 'high').length
  };
}