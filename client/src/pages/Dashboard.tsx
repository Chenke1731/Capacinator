import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  FolderKanban,
  AlertTriangle,
  TrendingUp,
  UserCheck,
  UserX,
  Activity,
  Briefcase,
} from 'lucide-react';
import { api } from '../lib/api-client';
import { queryKeys } from '../lib/queryKeys';
import { useScenario } from '../contexts/ScenarioContext';
import { useTranslation } from 'react-i18next';
import { healthStatusLabel, allocationStatusLabel, capacityHealthLabel } from '../lib/enum-labels';
import { DashboardSummary } from '../types';
import { Card } from '../components/ui/CustomCard';
import { StatCard } from '../components/ui/StatCard';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Alert, AlertDescription } from '../components/ui/alert';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { CriticalAlertsPanel } from '../components/dashboard/CriticalAlertsPanel';
import { DateRangeSelector, DateRangePreset } from '../components/dashboard/DateRangeSelector';
import { EnhancedKPIs } from '../components/dashboard/EnhancedKPIs';
 
import { useCriticalAlerts } from '../hooks/useCriticalAlerts';
import { peopleStatusPath } from '../lib/peopleStatusFilter';
import './Dashboard.css';
import '../components/chart-colors.css';

const COLORS = {
  primary: 'var(--series-blue)',
  success: 'var(--series-green)',
  warning: 'var(--series-amber)',
  danger: 'var(--series-red)',
  purple: 'var(--series-purple)',
  pink: 'var(--series-pink)',
};

export function Dashboard() {
  const navigate = useNavigate();
  const { currentScenario } = useScenario();
  const { t } = useTranslation();
  
  // Date range state for time-based filtering
  const [dateRange, setDateRange] = React.useState({
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    preset: 'current' as DateRangePreset
  });
  
  const { data: dashboard, isLoading, error } = useQuery({
    queryKey: queryKeys.dashboard.summary(currentScenario?.id, dateRange),
    queryFn: async () => {
      // 日期窗口真正进数据层(2026-10-13 全库审计: 原先只进 queryKey,换日期
      // 拉同一份"今天"数据)
      const response = await api.reporting.getDashboard({
        start_date: dateRange.startDate,
        end_date: dateRange.endDate
      });
      // Handle the nested response structure: response.data.data
      return response.data.data as DashboardSummary;
    },
    enabled: !!currentScenario
  });

  const {
    alerts,
    hasAlerts,
    isLoading: alertsLoading,
    error: alertsError,
    refetch: refetchAlerts
  } = useCriticalAlerts();

  // U22（D20 批5）：收件箱待分流计数——失败/加载不得显示 0（EXP-005）
  const {
    data: inboxCounts,
    isLoading: inboxLoading,
    error: inboxError,
    refetch: refetchInbox
  } = useQuery({
    queryKey: queryKeys.intake.counts(),
    queryFn: async () => {
      const body = (await api.intake.counts()).data as any;
      return (body?.data ?? body) as { new?: number } | undefined;
    },
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={t('dashboard:errors.loadFailed')} />;
  if (!dashboard) return null;

  // Prepare data for charts with defensive checks
  const projectHealthData = dashboard.projectHealth && Object.keys(dashboard.projectHealth).length > 0
    ? Object.entries(dashboard.projectHealth).map(([status, count]) => ({
        status,
        name: healthStatusLabel(status),
        value: count,
      }))
    : [{ status: '', name: t('dashboard:noProjects'), value: 0 }];

  // Handle empty utilization data gracefully
  const utilizationData = dashboard.utilization && Object.keys(dashboard.utilization).length > 0
    ? Object.entries(dashboard.utilization).map(([status, count]) => ({
        name: status === 'NO_ASSIGNMENTS' ? t('dashboard:noAssignmentsYet') : allocationStatusLabel(status),
        value: count,
      }))
    : [{ name: t('dashboard:noData'), value: 0 }];

  const capacityData = dashboard.capacityGaps && Object.keys(dashboard.capacityGaps).length > 0
    ? Object.entries(dashboard.capacityGaps).map(([status, count]) => ({
        name: capacityHealthLabel(status),
        value: count,
        color: status === 'GAP' ? COLORS.danger : status === 'TIGHT' ? COLORS.warning : COLORS.success,
      }))
    : [{ name: t('dashboard:noData'), value: 0, color: COLORS.primary }];

  return (
    <div className="page-container dashboard-page">
      {/* Compact toolbar: the sidebar already says where you are — no 62px
          title strip; the date-range selector sits in one slim row */}
      <div className="dashboard-toolbar">
        <h1 className="sr-only">{t('dashboard:title')}</h1>
        <p className="page-subtitle dashboard-subtitle">{t('dashboard:subtitle')}</p>
        <DateRangeSelector
          selectedRange={dateRange}
          onRangeChange={setDateRange}
        />
      </div>

      {/* Critical Alerts Panel */}
      {/* I02b/D4：数据源失败必须可见可重试——不得因 capacity 查询失败而让
          面板凭空消失（那等于向用户宣称"没有告警"） */}
      {alertsError ? (
        <section className="mb-6" role="alert">
          <Alert variant="destructive">
            <AlertDescription className="flex items-center gap-2">
              <span>{t('dashboard:alerts.loadFailed')}</span>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => refetchAlerts()}>
                {t('common:retry')}
              </button>
            </AlertDescription>
          </Alert>
        </section>
      ) : alertsLoading ? (
        <section className="mb-6" aria-busy="true">
          <LoadingSpinner />
        </section>
      ) : hasAlerts ? (
        <section className="mb-6" role="region" aria-labelledby="alerts-heading">
          <h2 id="alerts-heading" className="sr-only">{t('dashboard:srHeadings.alerts')}</h2>
          <CriticalAlertsPanel alerts={alerts} />
        </section>
      ) : null}

      <section className="stats-grid" role="region" aria-labelledby="stats-heading">
        <h2 id="stats-heading" className="sr-only">{t('dashboard:srHeadings.stats')}</h2>
        <StatCard
          title={t('dashboard:stats.currentProjects')}
          value={dashboard.summary.projects}
          icon={FolderKanban}
          color="primary"
          onClick={() => navigate('/projects')}
          aria-label={t('dashboard:stats.currentProjectsAria', { count: dashboard.summary.projects })}
        />
        <StatCard
          title={t('dashboard:stats.totalPeople')}
          value={dashboard.summary.people}
          icon={Users}
          color="success"
          onClick={() => navigate('/people')}
          aria-label={t('dashboard:stats.totalPeopleAria', { count: dashboard.summary.people })}
        />
        <StatCard
          title={t('dashboard:stats.totalRoles')}
          value={dashboard.summary.roles}
          icon={Briefcase}
          color="purple"
          onClick={() => navigate('/people')}
          aria-label={t('dashboard:stats.totalRolesAria', { count: dashboard.summary.roles })}
        />
        <StatCard
          title={t('dashboard:stats.capacityGaps')}
          value={dashboard.capacityGaps?.GAP || 0}
          icon={AlertTriangle}
          color="danger"
          onClick={() => navigate('/reports')}
          aria-label={t('dashboard:stats.capacityGapsAria', { count: dashboard.capacityGaps?.GAP || 0 })}
        />
      </section>

      {/* U22（D20 批5）：收件箱待分流信号——计数 + 深链收件箱；侧边栏角标不做。
          放在统计卡之后：顶部首屏布局保持稳定（states 覆盖率依赖首屏交互位置） */}
      <section className="mb-6" role="region" aria-labelledby="inbox-signal-heading" data-testid="dashboard-inbox-signal">
        <h2 id="inbox-signal-heading" className="sr-only">{t('dashboard:inbox.title')}</h2>
        <Card title={t('dashboard:inbox.title')} onClick={() => navigate('/projects?tab=intake')}>
          <div className="flex items-center justify-between gap-4">
            {inboxLoading ? (
              <span className="text-sm text-muted-foreground" data-testid="dashboard-inbox-loading">
                {t('dashboard:inbox.loading')}
              </span>
            ) : inboxError ? (
              <span className="flex items-center gap-2 text-sm" data-testid="dashboard-inbox-error">
                {t('dashboard:inbox.loadFailed')}
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={(e) => { e.stopPropagation(); refetchInbox(); }}
                >
                  {t('common:retry')}
                </button>
              </span>
            ) : (
              <>
                <span className="text-2xl font-bold" data-testid="dashboard-inbox-count">
                  {inboxCounts?.new ?? 0}
                </span>
                <span className="text-sm text-muted-foreground">{t('dashboard:inbox.action')}</span>
              </>
            )}
          </div>
        </Card>
      </section>

      {/* Enhanced KPIs Section */}
      <EnhancedKPIs dashboard={dashboard} className="mb-6" />

      <div className="charts-grid" role="region" aria-labelledby="charts-heading">
        <h2 id="charts-heading" className="sr-only">{t('dashboard:srHeadings.charts')}</h2>
        <Card
          title={t('dashboard:charts.projectHealth')}
          onClick={() => navigate('/projects')}
        >
          <div
            className="chart-container"
            role="img"
            aria-label={t('dashboard:charts.healthBreakdownAria', {
              items: projectHealthData.map(item => t('dashboard:charts.healthBreakdownItem', { name: item.name, count: item.value })).join(', '),
            })}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                navigate('/projects');
              }
            }}
          >
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={projectHealthData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => t('dashboard:charts.pieLabel', { name, value })}
                  outerRadius={100}
                  fill="var(--series-violet)"
                  dataKey="value"
                  onClick={() => navigate('/projects')}
                  style={{ cursor: 'pointer' }}
                >
                  {projectHealthData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        entry.status.includes('OVERDUE') ? COLORS.danger :
                        entry.status.includes('ACTIVE') ? COLORS.success :
                        entry.status.includes('PLANNING') ? COLORS.warning :
                        COLORS.primary
                      }
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card
          title={t('dashboard:charts.resourceUtilization')}
          onClick={() => navigate('/people')}
        >
          <div
            className="chart-container"
            role="img"
            aria-label={t('dashboard:charts.utilizationBreakdownAria', {
              items: utilizationData.map(item => t('dashboard:charts.utilizationBreakdownItem', { name: item.name, count: item.value })).join(', '),
            })}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                navigate('/people');
              }
            }}
          >
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={utilizationData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                <YAxis />
                <Tooltip />
                <Bar 
                  dataKey="value" 
                  fill={COLORS.primary}
                  onClick={() => navigate('/people')}
                  style={{ cursor: 'pointer' }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card
          title={t('dashboard:charts.capacityByRole')}
          onClick={() => navigate('/reports')}
        >
          <div
            className="capacity-summary"
            role="list"
            aria-label={t('dashboard:charts.capacityListAria')}
          >
            {capacityData.map((item, _index) => (
              <div
                key={item.name}
                className="capacity-item capacity-item-clickable"
                role="listitem"
                tabIndex={0}
                aria-label={t('dashboard:charts.capacityItemAria', { name: item.name, count: item.value })}
                onClick={(e) => {
                  e.stopPropagation();
                  navigate('/reports');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate('/reports');
                  }
                }}
              >
                <div className="capacity-label">
                  <span
                    className="capacity-status"
                    style={{ backgroundColor: item.color }}
                    role="img"
                    aria-label={t('dashboard:charts.statusIndicatorAria', { name: item.name })}
                  ></span>
                  <span>{item.name}</span>
                </div>
                <span className="capacity-value">{t('dashboard:charts.rolesCount', { count: item.value })}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title={t('dashboard:charts.quickStats')}>
          <div className="quick-stats" role="list" aria-label={t('dashboard:quickStats.listAria')}>
            <div
              className="stat-item stat-item-clickable"
              role="listitem"
              tabIndex={0}
              aria-label={t('dashboard:quickStats.availableAria', { count: dashboard.availability?.AVAILABLE || 0 })}
              onClick={() => navigate(peopleStatusPath('available'))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(peopleStatusPath('available'));
                }
              }}
            >
              <UserCheck className="stat-icon" color={COLORS.success} aria-hidden="true" />
              <div>
                <div className="stat-value">{dashboard.availability?.AVAILABLE || 0}</div>
                <div className="stat-label">{t('dashboard:quickStats.available')}</div>
              </div>
            </div>
            <div
              className="stat-item stat-item-clickable"
              role="listitem"
              tabIndex={0}
              aria-label={t('dashboard:quickStats.onLeaveAria', { count: dashboard.availability?.UNAVAILABLE || 0 })}
              onClick={() => navigate('/people')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate('/people');
                }
              }}
            >
              <UserX className="stat-icon" color={COLORS.danger} aria-hidden="true" />
              <div>
                <div className="stat-value">{dashboard.availability?.UNAVAILABLE || 0}</div>
                <div className="stat-label">{t('dashboard:quickStats.onLeave')}</div>
              </div>
            </div>
            <div
              className="stat-item stat-item-clickable"
              role="listitem"
              tabIndex={0}
              aria-label={t('dashboard:quickStats.limitedAria', { count: dashboard.availability?.LIMITED || 0 })}
              onClick={() => navigate('/people')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate('/people');
                }
              }}
            >
              <Activity className="stat-icon" color={COLORS.warning} aria-hidden="true" />
              <div>
                <div className="stat-value">{dashboard.availability?.LIMITED || 0}</div>
                <div className="stat-label">{t('dashboard:quickStats.limitedCapacity')}</div>
              </div>
            </div>
            <div
              className="stat-item stat-item-clickable"
              role="listitem"
              tabIndex={0}
              aria-label={t('dashboard:quickStats.overAllocatedAria', { count: dashboard.utilization?.OVER_ALLOCATED ?? dashboard.utilization?.['Over-allocated'] ?? 0 })}
              onClick={() => navigate(peopleStatusPath('over-allocated'))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(peopleStatusPath('over-allocated'));
                }
              }}
            >
              <TrendingUp className="stat-icon" color={COLORS.primary} aria-hidden="true" />
              <div>
                <div className="stat-value">{dashboard.utilization?.OVER_ALLOCATED ?? dashboard.utilization?.['Over-allocated'] ?? 0}</div>
                <div className="stat-label">{t('dashboard:quickStats.overAllocated')}</div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
