import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();

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
        title: t('dashboard:alerts.types.capacityGap.title'),
        description: t('dashboard:alerts.types.capacityGap.description', { count: criticalGaps }),
        actionText: t('dashboard:alerts.types.capacityGap.action'),
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
        title: t('dashboard:alerts.types.overAllocation.title'),
        description: t('dashboard:alerts.types.overAllocation.description', { count: overAllocated }),
        actionText: t('dashboard:alerts.types.overAllocation.action'),
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
        title: t('dashboard:alerts.types.projectOverdue.title'),
        description: t('dashboard:alerts.types.projectOverdue.description', { count: overdueProjects }),
        actionText: t('dashboard:alerts.types.projectOverdue.action'),
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
        title: t('dashboard:alerts.types.highUtilization.title'),
        description: t('dashboard:alerts.types.highUtilization.description', { percent: Math.round(highUtilizationRatio * 100) }),
        actionText: t('dashboard:alerts.types.highUtilization.action'),
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
        title: t('dashboard:alerts.types.tightCapacity.title'),
        description: t('dashboard:alerts.types.tightCapacity.description', { count: tightCapacity }),
        actionText: t('dashboard:alerts.types.tightCapacity.action'),
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
          title: t('dashboard:alerts.types.upcomingGaps.title'),
          description: t('dashboard:alerts.types.upcomingGaps.description', { hours: Math.round(totalGapHours) }),
          actionText: t('dashboard:alerts.types.upcomingGaps.action'),
          navigationPath: '/reports?tab=gaps'
        });
      }
    }

    return alertList;
  }, [dashboard, capacityReport, t]);

  return {
    alerts,
    isLoading: dashboardLoading || capacityLoading,
    error: dashboardError,
    hasAlerts: alerts.length > 0,
    criticalCount: alerts.filter(alert => alert.severity === 'critical').length,
    highCount: alerts.filter(alert => alert.severity === 'high').length
  };
}