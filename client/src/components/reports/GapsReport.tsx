import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { UserPlus, ExternalLink, Users, Briefcase, ClipboardList, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ReportSummaryCard, ReportEmptyState, ReportStatusBadge } from './index';
import { getChartColor, CHART_AXIS_CONFIG } from './chartConfig';

interface ProjectHealth {
  project_id: string;
  project_name: string;
  allocation_health: 'UNDER_ALLOCATED' | 'FULLY_ALLOCATED' | 'OVER_ALLOCATED';
  total_allocation_percentage: number;
}

interface RoleGap {
  role_id: string;
  roleName: string;
  gap: number;
}

interface GapTrendData {
  period: string;
  gap: number;
}

interface GapsReportData {
  summary?: { projectsWithGaps?: number; unutilizedHours?: number };
  projectHealth?: ProjectHealth[];
  gapsByRole?: RoleGap[];
  gapTrend?: GapTrendData[];
  totalGap: number;
  criticalRolesCount: number;
}

interface ReportFilters {
  startDate?: string;
  endDate?: string;
  projectTypeId?: string;
  locationId?: string;
  roleId?: string;
}

interface GapsReportProps {
  data: GapsReportData | null;
  filters: ReportFilters;
  CustomTooltip: React.FC<{ active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }>;
}

export const GapsReport: React.FC<GapsReportProps> = ({
  data,
  filters,
  CustomTooltip
}) => {
  const { t } = useTranslation();

  if (!data) return <div className="loading">{t('reports:loaders.gaps')}</div>;

  const hasNoGaps = data.totalGap === 0;

  return (
    <div className="report-content">
      <div className="report-summary">
        <ReportSummaryCard
          title={t('reports:gaps.summary.totalGapHours')}
          metric={data.totalGap || 0}
          unit={t('reports:units.hours')}
          metricType="danger"
          actionLink={data.totalGap > 0 ? {
            to: `/people?action=hire&from=gaps-report&gap=${data.totalGap}&startDate=${filters.startDate || ''}&endDate=${filters.endDate || ''}`,
            icon: UserPlus,
            text: t('reports:actions.addPeople')
          } : undefined}
        />
        <ReportSummaryCard
          title={t('reports:gaps.summary.projectsWithGaps')}
          metric={data.summary?.projectsWithGaps || 0}
          actionLink={{
            to: `/projects?from=demand-report&action=view-high-demand&startDate=${filters.startDate || ''}&endDate=${filters.endDate || ''}`,
            icon: ExternalLink,
            text: t('reports:actions.viewProjects')
          }}
        />
        <ReportSummaryCard
          title={t('reports:gaps.summary.rolesWithGaps')}
          metric={data.criticalRolesCount || 0}
          actionLink={data.criticalRolesCount > 0 ? {
            to: `/roles?from=gaps-report&action=address-gaps&startDate=${filters.startDate || ''}&endDate=${filters.endDate || ''}`,
            icon: Users,
            text: t('reports:actions.viewRoles')
          } : undefined}
        />
        <ReportSummaryCard
          title={t('reports:gaps.summary.unutilizedHours')}
          metric={data.summary?.unutilizedHours || 0}
          unit={t('reports:units.hours')}
        />
      </div>

      {hasNoGaps && (
        <ReportEmptyState
          icon={AlertTriangle}
          title={t('reports:gaps.empty.title')}
          description={t('reports:gaps.empty.description')}
        />
      )}

      <div className="charts-grid">
        <div className="chart-container">
          <h3>{t('reports:gaps.charts.byProject')}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.projectHealth || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis
                dataKey="project_name"
                {...CHART_AXIS_CONFIG.angled}
              />
              <YAxis />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="total_allocation_percentage" name={t('reports:series.total_allocation_percentage')} fill={getChartColor('gaps', 0)} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-container">
          <h3>{t('reports:gaps.charts.byRole')}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.gapsByRole || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis
                dataKey="roleName"
                {...CHART_AXIS_CONFIG.angled}
              />
              <YAxis />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="gap" name={t('reports:series.gap')} fill={getChartColor('gaps', 1)} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-container">
          <h3>{t('reports:gaps.charts.trend')}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data.gapTrend || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis dataKey="period" />
              <YAxis />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="gap" name={t('reports:series.gap')} stroke={getChartColor('gaps', 2)} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Full-width actionable sections */}
      <div className="actionable-sections">
        <div className="actionable-table-container">
          <h3>{t('reports:gaps.actionable.projects')}</h3>
          <div className="actionable-table">
            <div className="table-section">
              <h4>{t('reports:gaps.actionable.criticalProjects')}</h4>
              <div className="actionable-items-grid">
                {(data.projectHealth || [])
                  .filter((project: ProjectHealth) => project.allocation_health === 'UNDER_ALLOCATED')
                  .map((project: ProjectHealth) => (
                  <div key={project.project_id} className="actionable-item danger">
                    <div className="item-info">
                      <strong>{project.project_name}</strong>
                      <span className="item-detail">{t('reports:gaps.percentAllocated', { value: Math.round(project.total_allocation_percentage) })}</span>
                    </div>
                    <div className="item-actions">
                      <Link to={`/projects/${project.project_id}?from=gaps-report&gap=${100-project.total_allocation_percentage}&action=address-gap&startDate=${filters.startDate || ''}&endDate=${filters.endDate || ''}`} className="btn btn-sm btn-outline">
                        <Briefcase size={14} /> {t('reports:actions.viewProject')}
                      </Link>
                      <Link to={`/assignments?project=${encodeURIComponent(project.project_name)}&action=add-resources&from=gaps-report&gap=${100-project.total_allocation_percentage}&startDate=${filters.startDate || ''}&endDate=${filters.endDate || ''}`} className="btn btn-sm btn-danger">
                        <ClipboardList size={14} /> {t('reports:actions.addResources')}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="table-section">
              <h4>{t('reports:gaps.actionable.coveredProjects')}</h4>
              <div className="actionable-items-grid">
                {(data.projectHealth || [])
                  .filter((project: ProjectHealth) => project.allocation_health === 'FULLY_ALLOCATED' || project.allocation_health === 'OVER_ALLOCATED')
                  .slice(0, 3)
                  .map((project: ProjectHealth) => (
                  <div key={project.project_id} className="actionable-item success">
                    <div className="item-info">
                      <strong>{project.project_name}</strong>
                      <span className="item-detail">
                        {t('reports:gaps.percentAllocated', { value: Math.round(project.total_allocation_percentage) })} -
                        <ReportStatusBadge
                          status={project.allocation_health.replace(/_/g, ' ')}
                          variant={project.allocation_health === 'OVER_ALLOCATED' ? 'warning' : 'success'}
                          className="ml-2"
                        />
                      </span>
                    </div>
                    <div className="item-actions">
                      <Link to={`/projects/${project.project_id}?from=gaps-report`} className="btn btn-sm btn-outline">
                        <Briefcase size={14} /> {t('reports:actions.viewProject')}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="actionable-table-container">
          <h3>{t('reports:gaps.actionable.roles')}</h3>
          <div className="actionable-table">
            <div className="table-section">
              <h4>{t('reports:gaps.actionable.criticalRoles')}</h4>
              <div className="actionable-items-grid">
                {(data.gapsByRole || [])
                  .filter((role: RoleGap) => role.gap > 0)
                  .map((role: RoleGap) => (
                  <div key={role.roleId} className="actionable-item danger">
                    <div className="item-info">
                      <strong>{role.roleName}</strong>
                      <span className="item-detail">{t('reports:gaps.hoursShort', { value: role.gap })}</span>
                    </div>
                    <div className="item-actions">
                      <Link to={`/people?role=${encodeURIComponent(role.roleName)}&from=gaps-report&gap=${role.gap}&action=address-shortage&startDate=${filters.startDate || ''}&endDate=${filters.endDate || ''}`} className="btn btn-sm btn-outline">
                        <Users size={14} /> {t('reports:actions.viewPeople')}
                      </Link>
                      <Link to={`/people?role=${encodeURIComponent(role.roleName)}&action=hire&from=gaps-report&gap=${role.gap}&startDate=${filters.startDate || ''}&endDate=${filters.endDate || ''}`} className="btn btn-sm btn-danger">
                        <UserPlus size={14} /> {t('reports:actions.hireMore')}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="table-section">
              <h4>{t('reports:gaps.actionable.adequateRoles')}</h4>
              <div className="actionable-items-grid">
                {(data.gapsByRole || [])
                  .filter((role: RoleGap) => role.gap <= 0)
                  .slice(0, 3)
                  .map((role: RoleGap) => (
                  <div key={role.roleId} className="actionable-item success">
                    <div className="item-info">
                      <strong>{role.roleName}</strong>
                      <span className="item-detail">
                        {t('reports:gaps.hoursExcess', { value: Math.abs(role.gap) })}
                      </span>
                    </div>
                    <div className="item-actions">
                      <Link to={`/people?role=${encodeURIComponent(role.roleName)}&from=gaps-report`} className="btn btn-sm btn-outline">
                        <Users size={14} /> {t('reports:actions.viewPeople')}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};