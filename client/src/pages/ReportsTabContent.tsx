import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  Users,
  Download, RefreshCw, AlertTriangle, ChevronDown,
  User, ClipboardList, Boxes
} from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../lib/api-client';
import { queryKeys, type ReportFilters } from '../lib/queryKeys';
import { useScenario } from '../contexts/ScenarioContext';
import { getDefaultReportDateRange } from '../utils/date';
import { getLocale } from '../i18n';
import {
  ReportSummaryCard,
  ReportEmptyState,
  ReportTable,
  ReportStatusBadge,
  UtilizationReport,
  DemandReport,
  GapsReport,
  getChartColor,
  type Column,
  type ActionButton
} from '../components/reports';
import '../styles/reports.css';
import type { Location, ProjectType, Role, ProjectAssignment, Project, AllocationStatus } from '../types';
/* ReportFilters 用 queryKeys 导出版(2026-10-13 批清: 本地重复定义与查询键版
   字段不一致,4 处查询键传参冲突的根) */

// Report-specific types
interface TooltipPayloadEntry {
  name: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}

interface RoleCapacityData {
  role: string;
  capacity: number;
  utilized?: number;
}

interface PersonCapacityData {
  person_id: string;
  person_name: string;
  available_hours: number;
  default_hours_per_day: number;
  default_availability_percentage: number;
  allocation_status: AllocationStatus;
}

// Location capacity data interface (used in capacity report transformation)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type LocationCapacityData = { location: string; capacity: number; };

// Capacity over time data interface (used in chart generation)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type CapacityOverTimeData = { period: string; capacity: number; };

// CapacityReportData interface reserved for future capacity report feature

interface PersonUtilizationData {
  id: string;
  name: string;
  role: string;
  utilization: number;
  availableHours: number;
  projectCount: number;
  projects: string;
}

interface RoleUtilizationData {
  role: string;
  avgUtilization: number;
}

// UtilizationReportData interface reserved for future utilization report feature

interface DemandByProject {
  id: string;      // U04: 详情链身份——丢 id 会指向 /projects/undefined
  name: string;    // U04: 表格列与图表 dataKey="name" 的消费键
  project: string; // 兼容别名(历史消费键)
  demand: number;
}

/**
 * U04: 服务端 byProject 行 → 页面模型。id/name 必须全量保留——
 * 旧变换只留 {project: name, demand},图表/表格/详情三处同时失聪。
 */
export function toDemandByProject(
  rows: Array<{ id: string; name: string; demand: number }>,
  limit = 10
): DemandByProject[] {
  return (rows || [])
    .map((p) => ({ id: p.id, name: p.name, project: p.name, demand: p.demand }))
    .sort((a, b) => b.demand - a.demand)
    .slice(0, limit);
}

/**
 * U10: 需求趋势只用真实时间线点——0 点=无法生成(不造 95%/90% 假衰减),
 * 1 点=原样保留(不把总量均摊到整个查询区间冒充逐月数据)。
 */
export function buildDemandTrend(
  timeline: Array<{ month: string; total_hours: number }>,
  _summaryTotalHours: number,
  _filters: { startDate?: string; endDate?: string },
  formatMonth: (m: string) => string
): { trendOverTime: Array<{ month: string; total_hours: number }>; peakMonth: string | null } {
  const trendOverTime = (timeline || []).map((item) => ({
    month: formatMonth(item.month),
    total_hours: item.total_hours
  }));
  const peak = trendOverTime.reduce<{ month: string; total_hours: number } | null>(
    (p, c) => (c.total_hours > (p?.total_hours ?? -Infinity) ? c : p),
    null
  );
  return { trendOverTime, peakMonth: peak?.month ?? null };
}

// DemandReportData interface reserved for future demand report feature

interface GapsByRole {
  roleId: string;
  roleName: string;
  demand: number;
  capacity: number;
  gap: number;
  isShortage: boolean;
}

interface GapTrendData {
  period: string;
  gap: number;
}

// GapsReportData interface reserved for future gaps report feature

interface FilterOptions {
  projectTypes: ProjectType[];
  locations: Location[];
  roles: Role[];
}

interface SelectedPerson {
  id: string;
  name: string;
  utilization: number;
  role_id?: string;
  availableCapacity?: number;
}

// Helper function to format month-year string
const formatMonthYear = (monthStr: string): string => {
  if (!monthStr || !monthStr.includes('-')) return monthStr;
  const [year, month] = monthStr.split('-');
  const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1);
  return date.toLocaleDateString(getLocale(), { month: 'short', year: 'numeric' });
};

// Custom tooltip component for charts
const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div className="recharts-custom-tooltip" style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: '6px',
        padding: '0.75rem'
      }}>
        <p className="recharts-tooltip-label" style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
          {label}
        </p>
        {payload.map((entry: TooltipPayloadEntry, index: number) => (
          <p key={index} style={{ color: entry.color, margin: '0.25rem 0' }}>
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

interface ReportsTabContentProps {
  activeReport: string;
}

export const ReportsTabContent: React.FC<ReportsTabContentProps> = ({ activeReport }) => {
  const { t } = useTranslation();
  const { currentScenario } = useScenario();
  const [filters, setFilters] = useState<ReportFilters>(getDefaultReportDateRange());
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [showReduceLoadModal, setShowReduceLoadModal] = useState(false);
  const [showAddProjectsModal, setShowAddProjectsModal] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<SelectedPerson | null>(null);
  
  // Modal notification states (reserved for future notification display)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [modalNotification, setModalNotification] = useState<{
    type: 'success' | 'error' | 'warning' | 'info' | null;
    message: string;
  }>({ type: null, message: '' });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [showConfirmation, setShowConfirmation] = useState<{
    show: boolean;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
  }>({ show: false, message: '', onConfirm: () => {}, onCancel: () => {} });

  // Fetch report data
  const { data: capacityReport, isLoading: capacityLoading, refetch: refetchCapacity } = useQuery({
    queryKey: queryKeys.reports.capacity(filters, currentScenario?.id),
    queryFn: async () => {
      const [capacityResponse, peopleResponse] = await Promise.all([
        api.reporting.getCapacity(filters),
        api.people.list({ limit: 500 })
      ]);
      
      const data = capacityResponse.data.data;
      const peopleData = peopleResponse.data?.data || [];
      
      // Transform the API data to match chart requirements
      if (data) {
        // Use the correctly calculated byRole data from the API instead of frontend calculation
        const byRole: RoleCapacityData[] = data.byRole || [];

        // Calculate totals
        const totalCapacity = byRole.reduce((sum: number, r: RoleCapacityData) => sum + r.capacity, 0);
        const utilizedCapacity = byRole.reduce((sum: number, r: RoleCapacityData) => sum + (r.utilized || 0), 0);
        
        // Calculate actual location-based capacity using people data
        const locationCapacity = new Map<string, number>();

        interface PeopleDataItem {
          location_name?: string;
          default_availability_percentage?: number;
          default_hours_per_day?: number;
        }
        (peopleData as PeopleDataItem[]).forEach((person) => {
          const locationName = person.location_name || 'Unknown';
          const personCapacity = Math.round((person.default_availability_percentage || 100) * (person.default_hours_per_day || 8) * 20 / 100); // Monthly hours

          if (!locationCapacity.has(locationName)) {
            locationCapacity.set(locationName, 0);
          }
          locationCapacity.set(locationName, (locationCapacity.get(locationName) || 0) + personCapacity);
        });
        
        // Convert to array format for the chart
        const byLocation = Array.from(locationCapacity.entries()).map(([location, capacity]) => {
          return { location, capacity };
        });
        
        // Transform personUtilization to provide daily hours
        interface UtilizationDataItem {
          person_id?: string;
          person_name?: string;
          name?: string;
          available_hours?: number;
          default_availability_percentage?: number;
          allocation_status?: AllocationStatus;
        }
        const personUtilization = ((data.utilizationData || []) as UtilizationDataItem[]).map((person) => ({
          ...person,
          default_hours_per_day: person.available_hours || 8,
          person_name: person.person_name || person.name
        }));
        
        // Add chart-friendly capacity over time data
        const capacityOverTime = [
          { period: t('reports:period.currentMonth'), capacity: totalCapacity },
          { period: t('reports:period.nextMonth'), capacity: Math.round(totalCapacity * 1.02) },
          { period: t('reports:period.inThreeMonths'), capacity: Math.round(totalCapacity * 1.05) }
        ];
        
        return {
          ...data,
          totalCapacity: totalCapacity,
          utilizedCapacity: utilizedCapacity,
          personUtilization: personUtilization,
          byRole: byRole,
          byLocation: byLocation,
          capacityOverTime: capacityOverTime
        };
      }
      return data;
    },
    enabled: activeReport === 'capacity' && !!currentScenario
  });

  const { data: utilizationReport, isLoading: utilizationLoading, refetch: refetchUtilization } = useQuery({
    queryKey: queryKeys.reports.utilization(filters, currentScenario?.id),
    queryFn: async () => {
      const response = await api.reporting.getUtilization(filters);
      const data = response.data.data;
      
      if (data) {
        // Transform the data to match what the UtilizationReport component expects
        interface UtilizationApiItem {
          person_id: string;
          person_name: string;
          primary_role_name?: string;
          total_allocation_percentage?: number;
          available_hours?: number;
          project_count?: number;
          project_names?: string;
        }
        const peopleUtilization: PersonUtilizationData[] = ((data.utilizationData || []) as UtilizationApiItem[]).map((person) => ({
          id: person.person_id,
          name: person.person_name,
          role: person.primary_role_name || t('reports:noRole'),
          utilization: person.total_allocation_percentage || 0,
          availableHours: person.available_hours || 8,
          projectCount: person.project_count || 0,
          projects: person.project_names || ''
        }));

        // Calculate role-based utilization
        interface RoleMapEntry { role: string; totalUtilization: number; count: number }
        const roleMap = new Map<string, RoleMapEntry>();
        peopleUtilization.forEach((person: PersonUtilizationData) => {
          if (!roleMap.has(person.role)) {
            roleMap.set(person.role, {
              role: person.role,
              totalUtilization: 0,
              count: 0
            });
          }
          const roleData = roleMap.get(person.role)!;
          roleData.totalUtilization += person.utilization;
          roleData.count += 1;
        });

        const roleUtilization: RoleUtilizationData[] = Array.from(roleMap.values()).map(role => ({
          role: role.role,
          avgUtilization: role.count > 0 ? role.totalUtilization / role.count : 0
        }));

        // Calculate counts for summary cards
        const overAllocatedCount = peopleUtilization.filter((p: PersonUtilizationData) => p.utilization > 100).length;
        const underUtilizedCount = peopleUtilization.filter((p: PersonUtilizationData) => p.utilization > 0 && p.utilization < 80).length;
        const optimalCount = peopleUtilization.filter((p: PersonUtilizationData) => p.utilization >= 80 && p.utilization <= 100).length;
        
        return {
          ...data,
          peopleUtilization,
          roleUtilization,
          averageUtilization: data.summary?.averageUtilization || 0,
          overAllocatedCount,
          underUtilizedCount,
          optimalCount
        };
      }
      
      return data;
    },
    enabled: activeReport === 'utilization' && !!currentScenario
  });

  const { data: demandReport, isLoading: demandLoading, refetch: refetchDemand } = useQuery({
    queryKey: queryKeys.reports.demand(filters, currentScenario?.id),
    queryFn: async () => {
      const response = await api.reporting.getDemand(filters);
      const data = response.data.data;
      
      // Transform data for charts
      if (data) {
        // U04: 保留 id/name(图表 dataKey、表格列、详情链),只做排序与截断
        const byProject: DemandByProject[] = toDemandByProject(
          (data.byProject || []) as Array<{ id: string; name: string; demand: number }>
        );

        // U10: 趋势只用真实时间线——不再造 95%/90% 假曲线、不均摊单点
        const { trendOverTime, peakMonth } = buildDemandTrend(
          (data.timeline || []) as Array<{ month: string; total_hours: number }>,
          data.summary?.total_hours ?? 0,
          filters,
          formatMonthYear
        );

        return {
          ...data,
          byProject,
          trendOverTime,
          peakMonth: peakMonth ?? t('common:na')
        };
      }
      
      return data;
    },
    enabled: activeReport === 'demand' && !!currentScenario
  });

  const { data: gapsReport, isLoading: gapsLoading, refetch: refetchGaps } = useQuery({
    queryKey: queryKeys.reports.gaps(filters, currentScenario?.id),
    queryFn: async () => {
      const response = await api.reporting.getGaps(filters);
      const data = response.data.data;
      
      if (data) {
        // Transform capacity gaps data for charts
        interface CapacityGapApiItem {
          role_id: string;
          role_name: string;
          total_demand_fte: number;
          total_capacity_fte: number;
          capacity_gap_fte: number;
        }
        const gapsByRole: GapsByRole[] = ((data.capacityGaps || []) as unknown as CapacityGapApiItem[])
          .filter((gap: CapacityGapApiItem) => gap.total_demand_fte > 0 || gap.total_capacity_fte > 0)
          .map((gap: CapacityGapApiItem) => ({
            roleId: gap.role_id,
            roleName: gap.role_name,
            demand: Math.round(gap.total_demand_fte * 160),
            capacity: Math.round(gap.total_capacity_fte * 160),
            gap: Math.round(-gap.capacity_gap_fte * 160), // Negative means shortage
            isShortage: gap.capacity_gap_fte < 0
          }))
          .filter((gap: GapsByRole) => gap.gap !== 0)
          .sort((a: GapsByRole, b: GapsByRole) => b.gap - a.gap);

        // Calculate trend over time
        const gapTrend: GapTrendData[] = [
          { period: t('reports:period.current'), gap: data.summary?.totalGapHours || 0 },
          { period: t('reports:period.nextMonth'), gap: Math.round((data.summary?.totalGapHours || 0) * 0.8) },
          { period: t('reports:period.inThreeMonths'), gap: Math.round((data.summary?.totalGapHours || 0) * 0.5) }
        ];

        // Calculate total gap hours and other metrics
        const totalGapFte = ((data.capacityGaps || []) as unknown as CapacityGapApiItem[]).reduce((sum: number, g: CapacityGapApiItem) => sum + Math.max(0, -g.capacity_gap_fte || 0), 0);
        const totalGap = Math.round(totalGapFte * 160); // Convert to hours
        const criticalRolesCount = gapsByRole.filter((g: GapsByRole) => g.gap > 80).length;
        
        return {
          ...data,
          gapsByRole,
          gapTrend,
          totalGap,
          criticalRolesCount
        };
      }
      
      return data;
    },
    enabled: activeReport === 'gaps' && !!currentScenario
  });

  // Component distribution (066): demand count + staffing weight per
  // software component. No scenario/date filters — it aggregates the
  // whole dimension by design.
  const { data: componentReport, isLoading: componentLoading } = useQuery({
    queryKey: ['reporting', 'by-component'],
    queryFn: async () => {
      const response = await api.reporting.getByComponent();
      const payload = response.data as any;
      // sendSuccess wraps once ({success, data}), the controller once
      // more ({data, generated_at}) — unwrap to the rows array.
      const inner = payload?.data ?? payload;
      return Array.isArray(inner) ? inner : inner?.data ?? [];
    },
    enabled: activeReport === 'components'
  });

  // Fetch person's assignments for modals
  const { data: personAssignments = [] } = useQuery({
    queryKey: queryKeys.people.assignments(selectedPerson?.id ?? '', currentScenario?.id),
    queryFn: async () => {
      const response = await api.assignments.list({ person_id: selectedPerson!.id, limit: 2000 } as never);
      return response.data?.data || [];
    },
    enabled: !!selectedPerson?.id && (showReduceLoadModal || showAddProjectsModal)
  });

  // Fetch available projects with gaps for recommendations
  const { data: availableProjects = [] } = useQuery({
    queryKey: queryKeys.reports.availableProjects(selectedPerson?.id, currentScenario?.id),
    queryFn: async () => {
      const response = await api.projects.list({ limit: 500 });
      return response.data?.data || [];
    },
    enabled: showAddProjectsModal && !!selectedPerson?.id
  });

  // Fetch filter options
  const { data: filterOptions = {} as FilterOptions } = useQuery<FilterOptions>({
    queryKey: queryKeys.reports.filterOptions(),
    queryFn: async () => {
      const [projectTypes, locations, roles] = await Promise.all([
        api.projectTypes.list(),
        api.locations.list(),
        api.roles.list()
      ]);

      return {
        projectTypes: projectTypes.data?.data || [],
        locations: locations.data?.data || [],
        roles: roles.data?.data || []
      };
    }
  });

  // Get project removal recommendations (reserved for future use)
  interface AssignmentWithRecommendation extends ProjectAssignment {
    reductionAmount: number;
    newUtilization: number;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getProjectRemovalRecommendations = (person: SelectedPerson): AssignmentWithRecommendation[] => {
    // Sort by allocation percentage descending to suggest removing highest allocations first
    const sortedAssignments = [...personAssignments].sort((a, b) =>
      b.allocation_percentage - a.allocation_percentage
    );

    const recommendations: AssignmentWithRecommendation[] = [];
    let cumulativeReduction = 0;

    for (const assignment of sortedAssignments) {
      if (cumulativeReduction >= person.utilization - 100) break;

      recommendations.push({
        ...assignment,
        reductionAmount: assignment.allocation_percentage,
        newUtilization: person.utilization - cumulativeReduction - assignment.allocation_percentage
      });

      cumulativeReduction += assignment.allocation_percentage;
    }

    return recommendations;
  };

  // Get project addition recommendations (reserved for future use)
  interface ProjectWithAllocation extends Project {
    allocation_status?: string;
    required_role_id?: string;
    remaining_demand?: number;
    suggestedAllocation: number;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getProjectAdditionRecommendations = (person: SelectedPerson): ProjectWithAllocation[] => {
    const availableCapacity = person.availableCapacity || 0;

    // Find projects with gaps
    const projectsWithGaps = (availableProjects as Project[])
      .filter((project: Project & { allocation_status?: string; required_role_id?: string }) => {
        // Check if project has unmet demand
        const hasGap = project.allocation_status === 'UNDER_ALLOCATED';
        // Check if person has required role
        const hasRole = !project.required_role_id || person.role_id === project.required_role_id;
        return hasGap && hasRole;
      })
      .map((project: Project & { remaining_demand?: number }) => ({
        ...project,
        suggestedAllocation: Math.min(availableCapacity, project.remaining_demand || 20)
      }))
      .sort((a, b) => b.priority - a.priority);

    return projectsWithGaps;
  };

  // Handle person actions from utilization report
  const handlePersonAction = (person: SelectedPerson, action: 'reduce' | 'add') => {
    setSelectedPerson(person);
    if (action === 'reduce') {
      setShowReduceLoadModal(true);
    } else {
      const availableCapacity = Math.max(0, 100 - person.utilization);
      
      if (availableCapacity <= 5) {
        setModalNotification({
          type: 'warning',
          message: t('reports:notifications.nearlyFullCapacity', {
            name: person.name,
            utilization: person.utilization,
            remaining: availableCapacity.toFixed(1)
          })
        });
        return;
      }
      
      setSelectedPerson({
        ...person,
        availableCapacity: availableCapacity
      });
      setShowAddProjectsModal(true);
    }
  };

  // Export handlers
  const handleExport = async (format: 'csv' | 'xlsx' | 'json') => {
    try {
      let data;
      let endpoint;
      
      switch (activeReport) {
        case 'capacity':
          data = capacityReport;
          endpoint = 'capacity';
          break;
        case 'utilization':
          data = utilizationReport;
          endpoint = 'utilization';
          break;
        case 'demand':
          data = demandReport;
          endpoint = 'demand';
          break;
        case 'gaps':
          data = gapsReport;
          endpoint = 'gaps';
          break;
      }

      if (!data) {
        setModalNotification({
          type: 'warning',
          message: t('reports:notifications.noDataToExport')
        });
        return;
      }

      let response;

      // Call the appropriate export function based on format
      switch (format) {
        case 'xlsx':
          response = await api.export.reportAsExcel(endpoint!, filters);
          break;
        case 'csv':
          response = await api.export.reportAsCSV(endpoint!, filters);
          break;
        case 'json': {
          // For JSON, we'll use the current report data
          const jsonBlob = new Blob([JSON.stringify(data, null, 2)], {
            type: 'application/json'
          });
          const jsonUrl = URL.createObjectURL(jsonBlob);
          const jsonLink = document.createElement('a');
          jsonLink.href = jsonUrl;
          jsonLink.download = `${endpoint}-report.json`;
          document.body.appendChild(jsonLink);
          jsonLink.click();
          document.body.removeChild(jsonLink);
          URL.revokeObjectURL(jsonUrl);
          return;
        }
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }

      // Handle file download
      const blob = new Blob([response.data], {
        type: format === 'csv' ? 'text/csv' : format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/json'
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${endpoint}-report-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setShowExportDropdown(false);
      
    } catch (error) {
      console.error('Export error:', error);
      setModalNotification({
        type: 'error',
        message: t('reports:notifications.exportError')
      });
    }
  };

  const handleFilterChange = (key: keyof ReportFilters, value: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: value || undefined
    }));
  };

  // Render capacity report using standardized components
  const renderComponentsReport = () => {
    if (componentLoading || !componentReport) return <div className="loading">{t('reports:loaders.components')}</div>;

    const rows = componentReport as Array<{
      component_id: string | null;
      component_name: string;
      project_count: number;
      assignment_count: number;
      total_allocation_pct: number;
    }>;

    const columns: Column[] = [
      { header: t('reports:components.headers.name'), accessor: 'component_name', render: (value: React.ReactNode) => <strong>{value}</strong> },
      { header: t('reports:components.headers.demands'), accessor: 'project_count', render: (value: React.ReactNode) => value },
      { header: t('reports:components.headers.assignments'), accessor: 'assignment_count', render: (value: React.ReactNode) => value },
      {
        header: t('reports:components.headers.totalAllocation'),
        accessor: 'total_allocation_pct',
        render: (value: unknown) => `${Number(value || 0).toFixed(0)}%`
      }
    ];

    const totalDemands = rows.reduce((sum, r) => sum + (Number(r.project_count) || 0), 0);
    const assignedComponents = rows.filter((r) => r.component_id).length;
    const unassigned = rows.find((r) => r.component_id === null);
    const unassignedCount = Number(unassigned?.project_count) || 0;

    return (
      <div className="report-content">
        <div className="report-summary">
          <ReportSummaryCard
            title={t('reports:components.summary.components')}
            metric={assignedComponents}
          />
          <ReportSummaryCard
            title={t('reports:components.summary.totalDemands')}
            metric={totalDemands}
          />
          <ReportSummaryCard
            title={t('reports:components.summary.unassignedDemands')}
            metric={unassignedCount}
            metricType={unassignedCount > 0 ? 'warning' : 'success'}
            actionLink={unassignedCount > 0 ? {
              to: '/projects?tab=components',
              icon: Boxes,
              text: t('reports:components.summary.manageComponents')
            } : undefined}
          />
        </div>

        <div className="full-width-tables">
          <ReportTable
            title={t('reports:components.tableTitle')}
            columns={columns}
            data={rows}
            rowClassName={(row) => (row as any).component_id === null ? 'report-table-row-warning' : ''}
          />
        </div>
      </div>
    );
  };

  const renderCapacityReport = () => {
    if (capacityLoading || !capacityReport) return <div className="loading">{t('reports:loaders.capacity')}</div>;

    // Define columns for people capacity table
    const peopleCapacityColumns: Column[] = [
      { header: t('common:name'), accessor: 'person_name', render: (value: any) => <strong>{value}</strong> },
      { header: t('reports:capacity.headers.dailyHours'), accessor: 'available_hours', render: (value: any) => t('reports:units.hrsPerDay', { value }) },
      { header: t('reports:capacity.headers.availability'), accessor: 'default_availability_percentage', render: (value: any) => `${value}%` },
      {
        header: t('common:status'),
        accessor: 'allocation_status',
        render: (value: any) => {
          const variant = value === 'AVAILABLE' ? 'success' :
                         value === 'FULLY_ALLOCATED' ? 'warning' :
                         value === 'OVER_ALLOCATED' ? 'danger' : 'default';
          return <ReportStatusBadge status={value.replace(/_/g, ' ')} variant={variant} />;
        }
      }
    ];

    const peopleCapacityActions = (row: PersonCapacityData): ActionButton[] => {
      if (String(row.allocation_status) === 'AVAILABLE') {
        return [{
          // U03: person=ID(列表过滤用),personName 供上下文文案
          to: `/assignments?person=${encodeURIComponent(row.person_id)}&personName=${encodeURIComponent(row.person_name)}&action=assign&from=capacity-report&startDate=${filters.startDate || ''}&endDate=${filters.endDate || ''}`,
          icon: ClipboardList,
          text: t('reports:actions.assignToProject'),
          variant: 'primary'
        }];
      } else if (row.allocation_status === 'OVER_ALLOCATED') {
        return [{
          to: `/assignments?person=${encodeURIComponent(row.person_id)}&personName=${encodeURIComponent(row.person_name)}&action=reduce-load&from=capacity-report&startDate=${filters.startDate || ''}&endDate=${filters.endDate || ''}`,
          icon: AlertTriangle,
          text: t('reports:actions.reduceLoad'),
          variant: 'danger'
        }];
      }
      return [{
        to: `/people/${row.person_id}?from=capacity-report&startDate=${filters.startDate || ''}&endDate=${filters.endDate || ''}`,
        icon: User,
        text: t('common:viewDetails'),
        variant: 'outline'
      }];
    };

    // Define columns for role capacity table
    const roleCapacityColumns: Column[] = [
      { header: t('common:role'), accessor: 'role' },
      { header: t('reports:capacity.headers.totalCapacityHrs'), accessor: 'capacity' },
      { header: t('reports:capacity.headers.utilizedHrs'), accessor: (row: any) => row.utilized || 0 },
      { header: t('reports:capacity.headers.availableHrs'), accessor: (row: any) => row.capacity - (row.utilized || 0) },
      {
        header: t('common:status'),
        accessor: (row: any) => {
          const utilizationRate = row.capacity > 0 ? ((row.utilized || 0) / row.capacity) * 100 : 0;
          if (utilizationRate >= 90) return 'CRITICAL';
          if (utilizationRate >= 70) return 'HIGH';
          if (utilizationRate >= 50) return 'MODERATE';
          return 'AVAILABLE';
        },
        render: (value: any) => {
          const variant = value === 'AVAILABLE' ? 'success' : 
                         value === 'MODERATE' ? 'info' :
                         value === 'HIGH' ? 'warning' : 
                         value === 'CRITICAL' ? 'danger' : 'default';
          return <ReportStatusBadge status={value} variant={variant} />;
        }
      }
    ];

    const roleCapacityActions = (row: RoleCapacityData): ActionButton[] => [{
      to: `/people?role=${encodeURIComponent(row.role)}&from=capacity-report&startDate=${filters.startDate || ''}&endDate=${filters.endDate || ''}`,
      icon: Users,
      text: t('reports:actions.viewPeople'),
      variant: 'outline'
    }];

    return (
      <div className="report-content">
        <div className="report-summary">
          <ReportSummaryCard
            title={t('reports:capacity.summary.totalCapacity')}
            metric={capacityReport.totalCapacity || 0}
            unit={t('reports:units.hours')}
          />
          <ReportSummaryCard
            title={t('reports:capacity.summary.peopleWithCapacity')}
            metric={capacityReport.personUtilization?.length || 0}
            actionLink={{
              to: `/people?from=capacity-report&action=view-capacity&startDate=${filters.startDate || ''}&endDate=${filters.endDate || ''}`,
              icon: Users,
              text: t('reports:actions.viewPeople')
            }}
          />
          <ReportSummaryCard
            title={t('reports:capacity.summary.rolesWithCapacity')}
            metric={capacityReport.byRole?.length || 0}
          />
          <ReportSummaryCard
            title={t('reports:summary.peakMonth')}
            metric={t('common:na')}
          />
        </div>

        {(!capacityReport.personUtilization || capacityReport.personUtilization.length === 0) && (
          <ReportEmptyState
            icon={AlertTriangle}
            title={t('reports:capacity.empty.title')}
            description={t('reports:capacity.empty.description')}
            actionLink={{
              to: '/people',
              text: t('reports:capacity.empty.addPeople')
            }}
          />
        )}

        <div className="charts-grid">
          <div className="chart-container">
            <h3>{t('reports:capacity.charts.byPerson')}</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={capacityReport.personUtilization?.slice(0, 10) || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis dataKey="person_name" />
                <YAxis />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="default_hours_per_day" name={t('reports:series.default_hours_per_day')} fill={getChartColor('capacity', 0)} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-container">
            <h3>{t('reports:capacity.charts.byRole')}</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={capacityReport.byRole || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis dataKey="role" />
                <YAxis />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="capacity" name={t('reports:series.capacity')} fill={getChartColor('capacity', 1)} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-container">
            <h3>{t('reports:capacity.charts.trend')}</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={capacityReport.capacityOverTime || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis dataKey="period" />
                <YAxis />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="capacity" name={t('reports:series.capacity')} stroke={getChartColor('capacity', 2)} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="full-width-tables">
          <ReportTable
            title={t('reports:capacity.tables.peopleOverview')}
            columns={peopleCapacityColumns}
            data={capacityReport.utilizationData || []}
            rowClassName={(row) =>
              row.allocation_status === 'AVAILABLE' ? 'report-table-row-success' :
              row.allocation_status === 'FULLY_ALLOCATED' ? 'report-table-row-warning' :
              row.allocation_status === 'OVER_ALLOCATED' ? 'report-table-row-danger' : ''
            }
            actions={peopleCapacityActions}
          />

          <ReportTable
            title={t('reports:capacity.tables.roleAnalysis')}
            columns={roleCapacityColumns}
            data={capacityReport.byRole || []}
            rowClassName={(row) => {
              const utilizationRate = row.capacity > 0 ? ((row.utilized || 0) / row.capacity) * 100 : 0;
              if (utilizationRate >= 90) return 'report-table-row-danger';
              if (utilizationRate >= 70) return 'report-table-row-warning';
              return '';
            }}
            actions={roleCapacityActions}
          />
        </div>
      </div>
    );
  };

  const isLoading = capacityLoading || utilizationLoading || demandLoading || gapsLoading;

  return (
    <div className="reports-tab-content">
      <div className="page-header">
        <h1>{t('reports:title')}</h1>
        <div className="header-actions">
          <div className="dropdown">
            <button
              className="btn btn-secondary"
              onClick={() => setShowExportDropdown(!showExportDropdown)}
            >
              <Download size={16} />
              {t('common:export')}
              <ChevronDown size={16} />
            </button>
            {showExportDropdown && (
              <div className="dropdown-menu">
                <button onClick={() => handleExport('csv')}>{t('reports:export.csv')}</button>
                <button onClick={() => handleExport('xlsx')}>{t('reports:export.excel')}</button>
                <button onClick={() => handleExport('json')}>{t('reports:export.json')}</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="report-filters">
        <div className="filter-group">
          <label>{t('common:startDate')}</label>
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => handleFilterChange('startDate', e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label>{t('common:endDate')}</label>
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => handleFilterChange('endDate', e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label>{t('reports:filters.projectType')}</label>
          <select
            value={filters.projectTypeId || ''}
            onChange={(e) => handleFilterChange('projectTypeId', e.target.value)}
          >
            <option value="">{t('reports:filters.allTypes')}</option>
            {filterOptions.projectTypes?.map((type) => (
              <option key={type.id} value={type.id}>{type.name}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>{t('reports:filters.location')}</label>
          <select
            value={filters.locationId || ''}
            onChange={(e) => handleFilterChange('locationId', e.target.value)}
          >
            <option value="">{t('reports:filters.allLocations')}</option>
            {filterOptions.locations?.map((loc) => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            if (activeReport === 'capacity') refetchCapacity();
            else if (activeReport === 'utilization') refetchUtilization();
            else if (activeReport === 'demand') refetchDemand();
            else if (activeReport === 'gaps') refetchGaps();
          }}
          disabled={isLoading}
        >
          <RefreshCw size={16} />
          {t('common:refresh')}
        </button>
      </div>

      <div className="report-container">
        {activeReport === 'capacity' && renderCapacityReport()}
        {activeReport === 'utilization' && (
          <UtilizationReport
            data={utilizationReport ?? null}
            filters={filters}
            onPersonAction={handlePersonAction}
            CustomTooltip={CustomTooltip}
          />
        )}
        {activeReport === 'demand' && (
          <DemandReport 
            data={demandReport} 
            filters={filters}
            CustomTooltip={CustomTooltip}
          />
        )}
        {activeReport === 'gaps' && (
          <GapsReport
            data={gapsReport as unknown as Parameters<typeof GapsReport>[0]['data']}
            filters={filters}
            CustomTooltip={CustomTooltip}
          />
        )}
        {activeReport === 'components' && renderComponentsReport()}
      </div>
    </div>
  );
};