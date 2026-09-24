import React from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Users, AlertTriangle, GitBranch } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ReportSummaryCard, ReportEmptyState, ReportTable } from './index';
import { getChartColor } from './chartConfig';
import { useScenario } from '../../contexts/ScenarioContext';
import type { Column, ActionButton } from './ReportTable';

interface DemandReportProps {
  data: any;
  filters: any;
  CustomTooltip: React.FC<any>;
}

export const DemandReport: React.FC<DemandReportProps> = ({
  data,
  filters,
  CustomTooltip
}) => {
  const { t } = useTranslation();
  const { currentScenario } = useScenario();

  if (!data) return <div className="loading">{t('reports:loaders.demand')}</div>;

  // Debug logging

  // Define columns for high-demand projects table
  const projectDemandColumns: Column[] = [
    { header: t('reports:demand.headers.project'), accessor: 'name' },
    { header: t('reports:demand.headers.demand'), accessor: 'demand', render: (value) => t('reports:units.hrs', { value }) }
  ];

  const projectDemandActions = (row: any): ActionButton[] => [{
    to: `/projects/${row.id}?from=demand-report&demand=${row.demand}&startDate=${filters.startDate || ''}&endDate=${filters.endDate || ''}`,
    icon: ExternalLink,
    text: t('common:viewDetails'),
    variant: 'outline'
  }];

  // Define columns for high-demand roles table
  const roleDemandColumns: Column[] = [
    { header: t('common:role'), accessor: 'role_name' },
    { header: t('reports:demand.headers.demand'), accessor: 'total_hours', render: (value) => t('reports:units.hrs', { value }) }
  ];

  const roleDemandActions = (row: any): ActionButton[] => [{
    to: `/people?role=${encodeURIComponent(row.role_name)}&from=demand-report&demand=${row.total_hours}&startDate=${filters.startDate || ''}&endDate=${filters.endDate || ''}`,
    icon: Users,
    text: t('reports:actions.findPeople'),
    variant: 'outline'
  }];

  // Check if we have no demand data
  const hasNoDemand = !data.byProject || Object.keys(data.byProject).length === 0;

  return (
    <div className="report-content">
      {/* Scenario Context Display */}
      {currentScenario && (
        <div style={{
          backgroundColor: currentScenario.scenario_type === 'baseline' ? 'var(--bg-secondary)' : 'var(--primary-light)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <GitBranch size={20} style={{ color: 'var(--primary)' }} />
          <div>
            <strong style={{ color: 'var(--text-primary)' }}>{t('reports:scenario.currentLabel')}</strong>{' '}
            <span
              title={currentScenario.name}
              style={{
                color: 'var(--text-secondary)',
                display: 'inline-block',
                maxWidth: '40vw',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                verticalAlign: 'bottom'
              }}
            >
              {currentScenario.name}
              {currentScenario.scenario_type !== 'baseline' && (
                <span style={{ fontSize: '0.875rem', marginLeft: '8px' }}>
                  {t('reports:scenario.branchFrom', {
                    name: currentScenario.parent_scenario_name || t('reports:scenario.baseline')
                  })}
                </span>
              )}
            </span>
          </div>
          {currentScenario.description && (
            <div style={{ marginLeft: 'auto', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              {currentScenario.description}
            </div>
          )}
        </div>
      )}
      
      <div className="report-summary">
        <ReportSummaryCard
          title={t('reports:demand.summary.totalDemand')}
          metric={data.summary?.total_hours || 0}
          unit={t('reports:units.hours')}
        />
        <ReportSummaryCard
          title={t('reports:demand.summary.projectsWithDemand')}
          metric={data.summary?.total_projects || 0}
          actionLink={{
            to: `/projects?from=demand-report&action=view-high-demand&startDate=${filters.startDate || ''}&endDate=${filters.endDate || ''}`,
            icon: ExternalLink,
            text: t('reports:actions.viewProjects')
          }}
        />
        <ReportSummaryCard
          title={t('reports:demand.summary.rolesWithDemand')}
          metric={data.summary?.roles_with_demand || 0}
        />
        <ReportSummaryCard
          title={t('reports:summary.peakMonth')}
          metric={data.peakMonth || t('common:na')}
        />
      </div>

      {hasNoDemand && (
        <ReportEmptyState
          icon={AlertTriangle}
          title={t('reports:demand.empty.title')}
          description={t('reports:demand.empty.description')}
          actionLink={{
            to: '/projects',
            text: t('reports:demand.empty.createProjects')
          }}
        />
      )}

      <div className="charts-grid">
        <div className="chart-container">
          <h3>{t('reports:demand.charts.byProject')}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.byProject || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="demand" name={t('reports:series.demand')} fill={getChartColor('demand', 0)} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-container">
          <h3>{t('reports:demand.charts.byRole')}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.by_role || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis dataKey="role_name" />
              <YAxis />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="total_hours" name={t('reports:series.total_hours')} fill={getChartColor('demand', 1)} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-container">
          <h3>{t('reports:demand.charts.trend')}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data.trendOverTime || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="total_hours"
                name={t('reports:series.total_hours')}
                stroke={getChartColor('demand', 2)}
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="action-lists" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        <ReportTable
          title={t('reports:demand.tables.highDemandProjects')}
          columns={projectDemandColumns}
          data={data.byProject || []}
          actions={projectDemandActions}
          maxRows={5}
          emptyMessage={t('reports:demand.tables.emptyProjects')}
        />

        <ReportTable
          title={t('reports:demand.tables.highDemandRoles')}
          columns={roleDemandColumns}
          data={data.by_role || []}
          actions={roleDemandActions}
          maxRows={5}
          emptyMessage={t('reports:demand.tables.emptyRoles')}
        />
      </div>
    </div>
  );
};