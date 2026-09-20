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
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { CriticalAlertsPanel } from '../components/dashboard/CriticalAlertsPanel';
import { DateRangeSelector, DateRangePreset } from '../components/dashboard/DateRangeSelector';
import { EnhancedKPIs } from '../components/dashboard/EnhancedKPIs';
 
import { useCriticalAlerts } from '../hooks/useCriticalAlerts';
import './Dashboard.css';

const COLORS = {
  primary: '#3b82f6',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  purple: '#8b5cf6',
  pink: '#ec4899',
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
      const response = await api.reporting.getDashboard();
      // Handle the nested response structure: response.data.data
      return response.data.data as DashboardSummary;
    },
    enabled: !!currentScenario
  });

  const { alerts, hasAlerts } = useCriticalAlerts();

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
    <div className="page-container">
      <header className="page-header" role="banner">
        <div>
          <h1>{t('dashboard:title')}</h1>
          <p className="page-subtitle">{t('dashboard:subtitle')}</p>
        </div>
      </header>

      {/* Date Range Filter */}
      <div className="dashboard-filter-bar">
        <DateRangeSelector
          selectedRange={dateRange}
          onRangeChange={setDateRange}
        />
      </div>

      {/* Critical Alerts Panel */}
      {hasAlerts && (
        <section className="mb-6" role="region" aria-labelledby="alerts-heading">
          <h2 id="alerts-heading" className="sr-only">{t('dashboard:srHeadings.alerts')}</h2>
          <CriticalAlertsPanel alerts={alerts} />
        </section>
      )}

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
                  fill="#8884d8"
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
              onClick={() => navigate('/people')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate('/people');
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
              aria-label={t('dashboard:quickStats.overAllocatedAria', { count: dashboard.utilization?.OVER_ALLOCATED || 0 })}
              onClick={() => navigate('/people')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate('/people');
                }
              }}
            >
              <TrendingUp className="stat-icon" color={COLORS.primary} aria-hidden="true" />
              <div>
                <div className="stat-value">{dashboard.utilization?.OVER_ALLOCATED || 0}</div>
                <div className="stat-label">{t('dashboard:quickStats.overAllocated')}</div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}