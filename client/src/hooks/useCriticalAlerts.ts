import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api-client';
import { queryKeys } from '../lib/queryKeys';
import { peopleStatusPath } from '../lib/peopleStatusFilter';
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
  const {
    data: capacityReport,
    isLoading: capacityLoading,
    error: capacityError,
    refetch: refetchCapacity
  } = useQuery({
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
        // I02b/U25：真参数深链——People 页按 status 派生筛选
        navigationPath: peopleStatusPath('over-allocated'),
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
        // I02b/D3：dashboard 的 OVERDUE 数基于"窗口内重叠阶段"推导，而本 hook
        // 不传日期窗口 → 该计数当前恒 0（评审确认）。深链不再带假参数
        // filter=overdue（Projects 从未读取）；"逾期视图"另立台账待口径修正。
        navigationPath: '/projects',
        count: overdueProjects
      });
    }

    // Design deadline watch: items in 设计中 whose design deadline is due or
    // overdue (server-side design_watch from the lifecycle machinery)
    for (const watch of dashboard.design_watch ?? []) {
      alertList.push({
        id: `design-deadline-${watch.project_id}`,
        type: 'deadline_warning',
        severity: watch.overdue ? ((watch.days_remaining ?? 0) <= -7 ? 'critical' : 'high') : 'medium',
        title: watch.overdue
          ? t('dashboard:alerts.types.designDeadlineOverdue.title', { name: watch.project_name })
          : t('dashboard:alerts.types.designDeadlineSoon.title', { name: watch.project_name }),
        description: watch.overdue
          ? t('dashboard:alerts.types.designDeadlineOverdue.description', { days: Math.abs(watch.days_remaining ?? 0), date: String(watch.design_deadline).slice(0, 10) })
          : t('dashboard:alerts.types.designDeadlineSoon.description', { days: watch.days_remaining ?? 0, date: String(watch.design_deadline).slice(0, 10) }),
        actionText: t('dashboard:alerts.types.designDeadline.action'),
        navigationPath: `/projects/${watch.project_id}`,
        dueDate: String(watch.design_deadline).slice(0, 10)
      });
    }

    // High utilization warnings (potential future over-allocation)
    const fullyAllocated = dashboard.utilization?.FULLY_ALLOCATED ?? dashboard.utilization?.['Fully-allocated'] ?? 0;
    // I02b/D2：分母必须与分档人口一致（person_utilization_view 只含 is_active，
    // 而 summary.people 是全量含停用）——用利用率行总数作在用人口
    const utilizationPopulation = Object.values(dashboard.utilization ?? {}).reduce(
      (sum: number, count) => sum + Number(count || 0),
      0
    );
    const highUtilizationRatio = utilizationPopulation > 0 ? fullyAllocated / utilizationPopulation : 0;

    if (highUtilizationRatio > 0.8) {
      alertList.push({
        id: 'high-utilization',
        type: 'deadline_warning',
        severity: 'medium',
        title: t('dashboard:alerts.types.highUtilization.title'),
        description: t('dashboard:alerts.types.highUtilization.description', { percent: Math.round(highUtilizationRatio * 100) }),
        actionText: t('dashboard:alerts.types.highUtilization.action'),
        // I02b/D1：fully-allocated 无卡片入口，People 以"已筛选药丸"呈现
        navigationPath: peopleStatusPath('fully-allocated')
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
    // I02b/D4：任一数据源失败必须可见（此前 Dashboard 忽略 error，capacity
    // 500 时面板凭空消失=伪装"无告警"）
    error: dashboardError ?? capacityError ?? null,
    refetch: () => {
      void refetchCapacity();
    },
    hasAlerts: alerts.length > 0,
    criticalCount: alerts.filter(alert => alert.severity === 'critical').length,
    highCount: alerts.filter(alert => alert.severity === 'high').length
  };
}