import type { Knex } from 'knex';
import type {
  DateRangeFilter,
  DemandReportFilters,
  ProjectReportFilters,
  DashboardStats,
  CapacityReportData,
  UtilizationReportData,
  DemandReportData,
  GapsAnalysisData,
  TimelineReportData,
  ProjectReportData,
  CapacityGapRow,
  PersonUtilizationRow,
  TimelineEntry,
  RoleCapacityData,
  TransformedUtilizationData,
  ExtendedCapacityGap,
  UnmetDemandProject,
  ProjectHealthRow,
  DemandDataRow,
} from './types.js';

/**
 * Service for fetching and aggregating report data.
 * Consolidates business logic from ReportingController and ExportController.
 */
export class ReportDataService {
  constructor(private db: Knex) {}

  /**
   * Get dashboard summary statistics
   */
  async getDashboardStats(): Promise<DashboardStats> {
    const currentDate = new Date().toISOString().split('T')[0];

    // Get summary stats - count projects that have active phases
    const projectCount = await this.db('projects')
      .join('project_phases_timeline', 'projects.id', 'project_phases_timeline.project_id')
      .where('project_phases_timeline.start_date', '<=', currentDate)
      .where('project_phases_timeline.end_date', '>=', currentDate)
      .where('projects.include_in_demand', true)
      .countDistinct('projects.id as count')
      .first();

    const peopleCount = await this.db('people').count('* as count').first();
    const rolesCount = await this.db('roles').count('* as count').first();

    // Get current projects and their phase status
    const currentProjects = await this.db('projects')
      .join('project_phases_timeline', 'projects.id', 'project_phases_timeline.project_id')
      .join('project_phases', 'project_phases_timeline.phase_id', 'project_phases.id')
      .select(
        'projects.id',
        'projects.name',
        'project_phases_timeline.start_date as phase_start',
        'project_phases_timeline.end_date as phase_end',
        'project_phases.name as phase_name'
      )
      .where('project_phases_timeline.start_date', '<=', currentDate)
      .where('project_phases_timeline.end_date', '>=', currentDate)
      .where('projects.include_in_demand', true)
      .orderBy(['projects.id', 'project_phases_timeline.start_date']);

    // Calculate project health status
    const projectHealth = this.calculateProjectHealth(currentProjects, currentDate);

    // Get capacity gaps
    const capacityGapsData = await this.db('capacity_gaps_view').select('*');
    const capacityGaps = this.categorizeCapacityGaps(capacityGapsData);

    // Get utilization overview
    const personUtilizationData = await this.db('person_utilization_view').select('*');
    const utilization = this.calculateUtilizationStats(personUtilizationData);
    const availability = this.calculateAvailability(personUtilizationData);

    // Design watch: items in 设计中 whose design deadline has arrived or is
    // close (drives the dashboard deadline warnings)
    const designWatch = await this.db('projects as p')
      .select(
        'p.id as project_id',
        'p.name as project_name',
        this.db.raw(`(
          SELECT ppt.end_date FROM project_phases_timeline ppt
          JOIN project_phases pp ON ppt.phase_id = pp.id
          WHERE ppt.project_id = p.id AND pp.name = '设计'
          ORDER BY ppt.end_date ASC LIMIT 1
        ) as design_deadline`),
        this.db.raw(`(
          SELECT de.estimated_design_pm FROM project_design_estimations de
          WHERE de.project_id = p.id
          ORDER BY de.created_at DESC, de.id DESC LIMIT 1
        ) as rough_design_pm`)
      )
      .where('p.lifecycle_state', 'designing');

    const design_watch = designWatch
      .filter((row: any) => row.design_deadline)
      .map((row: any) => {
        const daysOffset = Math.round(
          (new Date(row.design_deadline).getTime() - new Date(currentDate).getTime()) / 86400000
        );
        return {
          ...row,
          days_remaining: daysOffset,
          overdue: daysOffset < 0,
          due_soon: daysOffset >= 0 && daysOffset <= 7
        };
      })
      .filter((row: any) => row.overdue || row.due_soon);

    // Lifecycle summary: count per state (standing items excluded)
    const lifecycleRows = await this.db('projects')
      .whereNotNull('lifecycle_state')
      .count('lifecycle_state as count')
      .groupBy('lifecycle_state')
      .select('lifecycle_state');
    const lifecycle_summary: Record<string, number> = {};
    for (const row of lifecycleRows) {
      lifecycle_summary[row.lifecycle_state] = Number(row.count);
    }

    return {
      summary: {
        projects: Number(projectCount?.count) || 0,
        people: Number(peopleCount?.count) || 0,
        roles: Number(rolesCount?.count) || 0,
      },
      projectHealth,
      capacityGaps,
      utilization,
      availability,
      design_watch,
      lifecycle_summary,
    };
  }

  /**
   * Get capacity report with gaps and utilization data
   */
  async getCapacityReport(filters: DateRangeFilter): Promise<CapacityReportData> {
    const { startDate, endDate } = filters;

    // Get capacity gaps
    const capacityGaps = await this.db('capacity_gaps_view').select('*') as CapacityGapRow[];

    // Get person utilization
    const personUtilizationRaw = await this.db('person_utilization_view').select('*') as PersonUtilizationRow[];

    // Transform utilization data
    const utilizationData = this.transformUtilizationData(personUtilizationRaw);

    // Get project demands in date range
    let demandsQuery = this.db('project_demands_view')
      .join('projects', 'project_demands_view.project_id', 'projects.id')
      .join('roles', 'project_demands_view.role_id', 'roles.id')
      .select(
        'project_demands_view.*',
        'projects.name as project_name',
        'roles.name as role_name'
      );

    if (startDate) {
      demandsQuery = demandsQuery.where('project_demands_view.end_date', '>=', startDate);
    }
    if (endDate) {
      demandsQuery = demandsQuery.where('project_demands_view.start_date', '<=', endDate);
    }

    const projectDemands = await demandsQuery.orderBy('project_demands_view.start_date');

    // Calculate status for each gap
    const capacityGapsWithStatus = this.addGapStatus(capacityGaps);

    // Transform for frontend chart
    const byRole: RoleCapacityData[] = capacityGapsWithStatus.map((gap) => ({
      id: gap.role_id,
      role: gap.role_name,
      capacity: Math.round(gap.total_capacity_hours || 0),
      utilized: Math.round(gap.total_demand_hours || 0),
      available: Math.round((gap.total_capacity_hours || 0) - (gap.total_demand_hours || 0)),
      people_count: gap.people_count || 0,
      status: gap.status as 'GAP' | 'TIGHT' | 'OK',
    }));

    // Calculate timeline
    const timeline = await this.calculateCapacityTimeline(startDate, endDate);

    return {
      capacityGaps: capacityGapsWithStatus,
      byRole,
      personUtilization: personUtilizationRaw,
      utilizationData,
      projectDemands,
      timeline,
      summary: {
        totalGaps: capacityGapsWithStatus.filter((gap) => gap.status === 'GAP').length,
        totalTight: capacityGapsWithStatus.filter((gap) => gap.status === 'TIGHT').length,
        overAllocated: utilizationData.filter((p) => p.allocation_status === 'OVER_ALLOCATED').length,
        underAllocated: utilizationData.filter((p) => p.allocation_status === 'PARTIALLY_ALLOCATED').length,
      },
    };
  }

  /**
   * Get utilization report with date-aware filtering
   */
  async getUtilizationReport(filters: DateRangeFilter): Promise<UtilizationReportData> {
    const { startDate, endDate } = filters;

    // Use current date as endDate if not provided
    const effectiveEndDate = endDate || (startDate
      ? new Date(new Date(startDate).getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0]);

    const effectiveStartDate = startDate || new Date().toISOString().split('T')[0];

    // Get utilization data with proper date filtering
    const utilizationQuery = `
      WITH date_filtered_assignments AS (
        SELECT
          pa.person_id,
          pa.project_id,
          p.name as project_name,
          pa.allocation_percentage,
          COALESCE(pa.start_date, p.aspiration_start) as computed_start_date,
          COALESCE(pa.end_date, p.aspiration_finish) as computed_end_date
        FROM project_assignments pa
        JOIN projects p ON pa.project_id = p.id
        WHERE
          pa.status = 'active'
          AND COALESCE(pa.start_date, p.aspiration_start) <= ?
          AND COALESCE(pa.end_date, p.aspiration_finish) >= ?

        UNION ALL

        SELECT
          spa.person_id,
          spa.project_id,
          p.name as project_name,
          spa.allocation_percentage,
          COALESCE(spa.start_date, p.aspiration_start) as computed_start_date,
          COALESCE(spa.end_date, p.aspiration_finish) as computed_end_date
        FROM scenario_project_assignments spa
        JOIN projects p ON spa.project_id = p.id
        JOIN scenarios s ON spa.scenario_id = s.id
        WHERE
          s.status = 'active'
          AND spa.status = 'active'
          AND COALESCE(spa.start_date, p.aspiration_start) <= ?
          AND COALESCE(spa.end_date, p.aspiration_finish) >= ?
      )
      SELECT
        p.id as person_id,
        p.name as person_name,
        p.email as person_email,
        p.worker_type,
        p.default_availability_percentage,
        p.default_hours_per_day,
        r.id as primary_role_id,
        r.name as primary_role_name,
        l.name as location_name,
        COALESCE(SUM(a.allocation_percentage), 0) as total_allocation_percentage,
        COUNT(DISTINCT a.project_id) as project_count,
        GROUP_CONCAT(DISTINCT a.project_name) as project_names
      FROM people p
      LEFT JOIN person_roles pr ON p.id = pr.person_id AND pr.is_primary = 1
      LEFT JOIN roles r ON pr.role_id = r.id
      LEFT JOIN locations l ON p.location_id = l.id
      LEFT JOIN date_filtered_assignments a ON p.id = a.person_id
      WHERE p.is_active = 1
      GROUP BY p.id
      ORDER BY total_allocation_percentage DESC
    `;

    const utilizationRaw = await this.db.raw(utilizationQuery, [
      effectiveEndDate, effectiveStartDate, effectiveEndDate, effectiveStartDate,
    ]);

    const utilizationData = this.transformUtilizationReportData(utilizationRaw);

    // Categorize by utilization status
    const overutilized = utilizationData.filter((p) => p.allocation_status === 'OVER_ALLOCATED');
    const underutilized = utilizationData.filter((p) =>
      p.allocation_status === 'UNDER_ALLOCATED' || p.allocation_status === 'AVAILABLE'
    );

    // Calculate statistics
    const avgUtilization = utilizationData.reduce((sum, p) =>
      sum + (p.total_allocation_percentage || 0), 0) / utilizationData.length;
    const peakUtilization = Math.max(...utilizationData.map((p) => p.total_allocation_percentage || 0));

    // Calculate health summary
    const healthSummary = { healthy: 0, warning: 0, critical: 0 };
    utilizationData.forEach((person) => {
      const alloc = person.total_allocation_percentage;
      if (alloc >= 50 && alloc <= 100) {
        healthSummary.healthy++;
      } else if (alloc > 100 && alloc <= 150) {
        healthSummary.warning++;
      } else {
        healthSummary.critical++;
      }
    });

    return {
      utilizationData,
      overutilized,
      underutilized,
      summary: {
        peopleOverutilized: overutilized.length,
        peopleUnderutilized: underutilized.length,
        averageUtilization: Math.round(avgUtilization * 100) / 100,
        peakUtilization,
      },
      healthSummary,
    };
  }

  /**
   * Get demand report with aggregations
   */
  async getDemandReport(filters: DemandReportFilters): Promise<DemandReportData> {
    const { startDate, endDate, scenarioId, includeAllScenarios } = filters;

    // Build base query with scenario filtering
    let demandQuery = this.db('project_demands_view').select('*');
    const scenarioType = await this.getScenarioType(scenarioId);
    demandQuery = this.applyScenarioFilter(demandQuery, scenarioId, includeAllScenarios, scenarioType);
    demandQuery = this.applyDateFilter(demandQuery, startDate, endDate);

    const demandData = await demandQuery as DemandDataRow[];

    // Aggregate by project
    const byProject = await this.aggregateDemandByProject(filters);

    // Aggregate by role
    const by_role = await this.aggregateDemandByRole(filters);

    // Aggregate by project type
    const by_project_type = await this.aggregateDemandByProjectType(filters);

    // Generate timeline
    const timeline = await this.generateDemandTimeline(filters);

    // Calculate summary
    const totalHours = byProject.reduce((sum, project) => sum + project.demand, 0);
    const projectsWithDemand = await this.countDistinctProjects(filters);
    const rolesWithDemand = await this.countDistinctRoles(filters);

    return {
      demandData,
      byProject,
      by_role,
      by_project_type,
      timeline,
      summary: {
        total_hours: totalHours,
        total_projects: projectsWithDemand,
        roles_with_demand: rolesWithDemand,
      },
    };
  }

  /**
   * Get gaps analysis with capacity vs demand comparison
   */
  async getGapsAnalysis(): Promise<GapsAnalysisData> {
    // Get capacity gaps data
    const capacityGapsRaw = await this.db('capacity_gaps_view').select('*') as CapacityGapRow[];

    // Calculate gap percentage and status for each role
    const capacityGaps: ExtendedCapacityGap[] = capacityGapsRaw.map((gap) => {
      const demandVsCapacity = (gap.total_demand_fte || 0) - (gap.total_capacity_fte || 0);
      const gapPercentage = gap.total_capacity_fte > 0
        ? (demandVsCapacity / gap.total_capacity_fte) * 100
        : (gap.total_demand_fte > 0 ? 100 : 0);

      let status: string;
      if (demandVsCapacity > 0.5) {
        status = 'GAP';
      } else if (demandVsCapacity > 0) {
        status = 'TIGHT';
      } else {
        status = 'OK';
      }

      return {
        ...gap,
        gap_percentage: Math.round(gapPercentage * 100) / 100,
        demand_vs_capacity: Math.round(demandVsCapacity * 100) / 100,
        status,
      };
    }).sort((a, b) => b.gap_percentage - a.gap_percentage);

    // Get project health data
    const projectHealth = await this.db('project_health_view')
      .select('*')
      .orderBy('total_allocation_percentage', 'asc') as ProjectHealthRow[];

    // Get project demands
    const projectDemands = await this.db('project_demands_view')
      .select('*')
      .where('time_status', '!=', 'PAST');

    // Calculate projects with unmet demands
    const criticalProjectGaps = this.calculateProjectsWithUnmetDemands(projectDemands, projectHealth);

    // Identify critical role gaps
    const criticalRoleGaps = capacityGaps.filter((gap) => gap.status === 'GAP' && gap.gap_percentage > 50);

    // Calculate summary metrics
    const totalGapHours = capacityGaps.reduce((sum, gap) => {
      const demandVsCapacity = (gap.total_demand_fte || 0) - (gap.total_capacity_fte || 0);
      return sum + Math.max(0, demandVsCapacity) * 8 * 5;
    }, 0);

    const unutilizedHours = capacityGaps.reduce((sum, gap) => {
      const demandVsCapacity = (gap.total_demand_fte || 0) - (gap.total_capacity_fte || 0);
      return sum + Math.max(0, -demandVsCapacity) * 8 * 5;
    }, 0);

    return {
      capacityGaps,
      projectHealth,
      criticalRoleGaps,
      criticalProjectGaps,
      summary: {
        totalGapHours: Math.round(totalGapHours * 100) / 100,
        projectsWithGaps: criticalProjectGaps.length,
        rolesWithGaps: criticalRoleGaps.length,
        unutilizedHours: Math.round(unutilizedHours * 100) / 100,
      },
    };
  }

  /**
   * Get timeline report for projects and phases
   */
  async getTimelineReport(filters: DateRangeFilter): Promise<TimelineReportData> {
    const { startDate, endDate } = filters;

    // Get projects timeline
    let projectsQuery = this.db('projects')
      .leftJoin('project_types', 'projects.project_type_id', 'project_types.id')
      .leftJoin('people as owner', 'projects.owner_id', 'owner.id')
      .select(
        'projects.id',
        'projects.name',
        'projects.aspiration_start',
        'projects.aspiration_finish',
        'projects.priority',
        'project_types.name as project_type',
        'owner.name as owner_name'
      )
      .whereNotNull('projects.aspiration_start')
      .whereNotNull('projects.aspiration_finish');

    if (startDate && endDate) {
      projectsQuery = projectsQuery
        .where('projects.aspiration_start', '<=', endDate)
        .where('projects.aspiration_finish', '>=', startDate);
    }

    const projects = await projectsQuery.orderBy('projects.aspiration_start');

    // Get phases timeline
    let phasesQuery = this.db('project_phases_timeline')
      .join('projects', 'project_phases_timeline.project_id', 'projects.id')
      .join('project_phases', 'project_phases_timeline.phase_id', 'project_phases.id')
      .select(
        'project_phases_timeline.*',
        'projects.name as project_name',
        'project_phases.name as phase_name'
      );

    if (startDate && endDate) {
      phasesQuery = phasesQuery
        .where('project_phases_timeline.start_date', '<=', endDate)
        .where('project_phases_timeline.end_date', '>=', startDate);
    }

    const phases = await phasesQuery.orderBy('project_phases_timeline.start_date');

    return { projects, phases };
  }

  /**
   * Get project report with health status
   */
  async getProjectReport(filters: ProjectReportFilters): Promise<ProjectReportData> {
    const { status, priority, projectType, location } = filters;

    let query = this.db('project_health_view').select('*');

    if (status) {
      query = query.where('health_status', status);
    }
    if (priority) {
      query = query.where('priority', priority);
    }
    if (projectType) {
      query = query.where('project_type_id', projectType);
    }
    if (location) {
      query = query.where('location_id', location);
    }

    const projects = await query.orderBy('priority', 'desc') as ProjectHealthRow[];

    // Get summary by status
    const statusSummary = await this.db('project_health_view')
      .select('health_status')
      .count('* as count')
      .groupBy('health_status');

    // Get summary by priority
    const prioritySummary = await this.db('project_health_view')
      .select('priority')
      .count('* as count')
      .groupBy('priority')
      .orderBy('priority', 'desc');

    return {
      projects,
      summary: {
        byStatus: statusSummary.reduce((acc: Record<string, number>, item: Record<string, unknown>) => {
          acc[item.health_status as string] = item.count as number;
          return acc;
        }, {}),
        byPriority: prioritySummary.reduce((acc: Record<string, number>, item: Record<string, unknown>) => {
          acc[item.priority as string] = item.count as number;
          return acc;
        }, {}),
      },
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private calculateProjectHealth(
    currentProjects: Record<string, unknown>[],
    currentDate: string
  ): Record<string, number> {
    const projectHealthMap = new Map<string, string>();

    currentProjects.forEach((project) => {
      if (!projectHealthMap.has(project.id as string)) {
        let healthStatus = 'ACTIVE';
        if (project.phase_end && (project.phase_end as string) < currentDate) {
          healthStatus = 'OVERDUE';
        } else if (project.phase_start && (project.phase_start as string) > currentDate) {
          healthStatus = 'PLANNING';
        }
        projectHealthMap.set(project.id as string, healthStatus);
      }
    });

    return Array.from(projectHealthMap.values()).reduce((acc, status) => {
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private categorizeCapacityGaps(
    capacityGapsData: Record<string, unknown>[]
  ): { GAP: number; TIGHT: number; OK: number } {
    let gapRoles = 0;
    let okRoles = 0;
    let tightRoles = 0;

    capacityGapsData.forEach((role) => {
      const demandVsCapacity = (role.total_demand_fte as number) - (role.total_capacity_fte as number);
      if (demandVsCapacity > 0.5) {
        gapRoles++;
      } else if (demandVsCapacity > 0) {
        tightRoles++;
      } else {
        okRoles++;
      }
    });

    return { GAP: gapRoles, TIGHT: tightRoles, OK: okRoles };
  }

  private calculateUtilizationStats(
    personUtilizationData: Record<string, unknown>[]
  ): Record<string, number> {
    const utilizationStats: Record<string, number> = personUtilizationData.reduce<Record<string, number>>((acc, person) => {
      const status = person.utilization_status as string;
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    return Object.keys(utilizationStats).length > 0 ? utilizationStats : { NO_DATA: 0 };
  }

  private calculateAvailability(
    personUtilizationData: Record<string, unknown>[]
  ): { AVAILABLE: number; ASSIGNED: number } {
    const availablePeople = personUtilizationData.filter((p) => p.utilization_status === 'Available').length;
    const assignedPeople = personUtilizationData.filter((p) => p.utilization_status !== 'Available').length;
    return { AVAILABLE: availablePeople, ASSIGNED: assignedPeople };
  }

  private transformUtilizationData(raw: PersonUtilizationRow[]): TransformedUtilizationData[] {
    return raw.map((person) => {
      const totalAllocHours = person.total_allocation_percentage * (person.default_hours_per_day || 8) / 100.0;

      return {
        ...person,
        default_availability_percentage: person.current_availability_percentage,
        total_allocated_hours: totalAllocHours,
        available_hours: person.default_hours_per_day || 8,
        allocation_status: person.utilization_status === 'Over-allocated' ? 'OVER_ALLOCATED' as const :
          person.utilization_status === 'Fully-allocated' ? 'FULLY_ALLOCATED' as const :
          person.utilization_status === 'Partially-allocated' ? 'PARTIALLY_ALLOCATED' as const :
          person.utilization_status === 'Available' ? 'AVAILABLE' as const :
          person.utilization_status === 'Unavailable' ? 'UNAVAILABLE' as const : 'AVAILABLE' as const,
        project_names: '',
      };
    });
  }

  private transformUtilizationReportData(raw: Record<string, unknown>[]): UtilizationReportData['utilizationData'] {
    return raw.map((person) => {
      const totalAllocHours = (person.total_allocation_percentage as number) *
        (person.default_hours_per_day as number || 8) / 100.0;

      let allocationWarning: string | null = null;
      let displayAllocationPercentage = person.total_allocation_percentage as number;

      if ((person.total_allocation_percentage as number) > 300) {
        allocationWarning = 'extreme_overallocation';
        displayAllocationPercentage = 300;
      } else if ((person.total_allocation_percentage as number) > 200) {
        allocationWarning = 'severe_overallocation';
      } else if ((person.total_allocation_percentage as number) > 150) {
        allocationWarning = 'high_overallocation';
      }

      const alloc = person.total_allocation_percentage as number;
      const allocation_status = alloc > 100 ? 'OVER_ALLOCATED' :
        alloc >= 90 ? 'FULLY_ALLOCATED' :
        alloc >= 50 ? 'PARTIALLY_ALLOCATED' :
        alloc > 0 ? 'UNDER_ALLOCATED' : 'AVAILABLE';

      return {
        person_id: person.person_id as string,
        person_name: person.person_name as string,
        person_email: person.person_email as string | undefined,
        worker_type: person.worker_type as string | undefined,
        default_availability_percentage: person.default_availability_percentage as number | undefined,
        default_hours_per_day: person.default_hours_per_day as number | undefined,
        primary_role_id: person.primary_role_id as string | undefined,
        primary_role_name: person.primary_role_name as string | undefined,
        location_name: person.location_name as string | undefined,
        total_allocation_percentage: person.total_allocation_percentage as number,
        project_count: person.project_count as number,
        project_names: (person.project_names as string) || '',
        total_allocated_hours: totalAllocHours,
        available_hours: (person.default_hours_per_day as number) || 8,
        allocation_status,
        allocation_warning: allocationWarning,
        display_allocation_percentage: displayAllocationPercentage,
      };
    });
  }

  private addGapStatus(gaps: CapacityGapRow[]): (CapacityGapRow & { status: string })[] {
    return gaps.map((role) => {
      const demandVsCapacity = (role.total_demand_fte || 0) - (role.total_capacity_fte || 0);
      let status: string;
      if (demandVsCapacity > 0.5) {
        status = 'GAP';
      } else if (demandVsCapacity > 0) {
        status = 'TIGHT';
      } else {
        status = 'OK';
      }
      return { ...role, status };
    });
  }

  private async calculateCapacityTimeline(startDate?: string, endDate?: string): Promise<TimelineEntry[]> {
    const people = await this.db('people')
      .select('id', 'name', 'default_hours_per_day', 'default_availability_percentage')
      .where('is_active', true);

    const monthlyMap = new Map<string, number>();
    const filterStart = startDate ? new Date(startDate) : new Date('2023-01-01');
    const filterEnd = endDate ? new Date(endDate) : new Date('2024-12-31');

    const currentDate = new Date(filterStart);
    currentDate.setDate(1);

    while (currentDate <= filterEnd) {
      const monthKey = currentDate.toISOString().slice(0, 7);
      let monthlyCapacity = 0;

      people.forEach((person: Record<string, unknown>) => {
        const workingDaysPerMonth = 22;
        const dailyHours = (person.default_hours_per_day as number) || 8;
        const availabilityPercent = ((person.default_availability_percentage as number) || 100) / 100;
        monthlyCapacity += workingDaysPerMonth * dailyHours * availabilityPercent;
      });

      monthlyMap.set(monthKey, monthlyCapacity);
      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    return Array.from(monthlyMap.entries()).map(([month, capacity]) => ({
      period: month,
      capacity: Math.round(capacity),
    }));
  }

  private calculateProjectsWithUnmetDemands(
    projectDemands: Record<string, unknown>[],
    projectHealth: ProjectHealthRow[]
  ): UnmetDemandProject[] {
    const projectsWithGaps: UnmetDemandProject[] = [];

    // Group demands by project_id
    const demandsByProject = projectDemands.reduce((acc: Record<string, Record<string, unknown>[]>, demand) => {
      const projectId = demand.project_id as string;
      if (!acc[projectId]) {
        acc[projectId] = [];
      }
      acc[projectId].push(demand);
      return acc;
    }, {});

    for (const [projectId, demandsRaw] of Object.entries(demandsByProject)) {
      const demands = demandsRaw as Record<string, unknown>[];
      const projectHealthRecord = projectHealth.find((p) => p.project_id === projectId);

      if (!projectHealthRecord || projectHealthRecord.allocation_health === 'UNASSIGNED') {
        projectsWithGaps.push({
          project_id: projectId,
          project_name: (demands[0]?.project_name as string) || 'Unknown',
          gap_type: 'UNASSIGNED',
          unmet_demands: demands.length,
          total_demand_percentage: demands.reduce((sum, d) =>
            sum + ((d.allocation_percentage as number) || 0), 0),
        });
        continue;
      }

      const totalDemandPercentage = demands.reduce((sum, d) =>
        sum + ((d.allocation_percentage as number) || 0), 0);
      const actualAllocation = projectHealthRecord.total_allocation_percentage || 0;

      if (totalDemandPercentage > 0 && (actualAllocation / totalDemandPercentage) < 0.8) {
        projectsWithGaps.push({
          project_id: projectId,
          project_name: (demands[0]?.project_name as string) || 'Unknown',
          gap_type: 'UNDER_COVERED',
          unmet_demands: demands.length,
          total_demand_percentage: totalDemandPercentage,
          actual_allocation_percentage: actualAllocation,
          coverage_ratio: actualAllocation / totalDemandPercentage,
        });
      }
    }

    return projectsWithGaps;
  }

  /**
   * NOTE: this must stay synchronous and callers must NOT await its result —
   * a knex QueryBuilder is thenable, so awaiting a builder returned from an
   * async function executes the query and yields a row array (which then
   * crashes the next .where). The scenario type is therefore pre-fetched
   * separately via getScenarioType.
   */
  private applyScenarioFilter(
    query: Knex.QueryBuilder,
    scenarioId?: string,
    includeAllScenarios?: boolean,
    scenarioType?: string
  ): Knex.QueryBuilder {
    if (!scenarioId || includeAllScenarios) {
      return query;
    }

    if (scenarioType === 'baseline') {
      return query.where(function (this: Knex.QueryBuilder) {
        this.whereNull('scenario_id').orWhere('scenario_id', scenarioId);
      });
    } else {
      return query.where('scenario_id', scenarioId);
    }
  }

  private async getScenarioType(scenarioId?: string): Promise<string | undefined> {
    if (!scenarioId) return undefined;
    const scenario = await this.db('scenarios').where('id', scenarioId).first();
    return scenario?.scenario_type;
  }

  private applyDateFilter(
    query: Knex.QueryBuilder,
    startDate?: string,
    endDate?: string
  ): Knex.QueryBuilder {
    if (startDate && endDate) {
      return query.where(function (this: Knex.QueryBuilder) {
        this.where('start_date', '<=', endDate).andWhere('end_date', '>=', startDate);
      });
    } else if (startDate) {
      return query.where('end_date', '>=', startDate);
    } else if (endDate) {
      return query.where('start_date', '<=', endDate);
    }
    return query;
  }

  private async aggregateDemandByProject(filters: DemandReportFilters) {
    const { startDate, endDate, scenarioId, includeAllScenarios } = filters;

    let query = this.db('project_demands_view')
      .select('project_id', 'project_name')
      .sum('demand_hours as total_hours')
      .groupBy('project_id', 'project_name')
      .orderBy('total_hours', 'desc');

    const scenarioType = await this.getScenarioType(scenarioId);
    query = this.applyScenarioFilter(query, scenarioId, includeAllScenarios, scenarioType);
    query = this.applyDateFilter(query, startDate, endDate);

    const results = await query;
    return results.map((project: Record<string, unknown>) => ({
      id: project.project_id as string,
      name: project.project_name as string,
      demand: (project.total_hours as number) || 0,
    }));
  }

  private async aggregateDemandByRole(filters: DemandReportFilters) {
    const { startDate, endDate, scenarioId, includeAllScenarios } = filters;

    let query = this.db('project_demands_view')
      .select('role_id', 'role_name')
      .sum('demand_hours as total_hours')
      .groupBy('role_id', 'role_name')
      .orderBy('total_hours', 'desc');

    const scenarioType = await this.getScenarioType(scenarioId);
    query = this.applyScenarioFilter(query, scenarioId, includeAllScenarios, scenarioType);
    query = this.applyDateFilter(query, startDate, endDate);

    const results = await query;
    return results.map((role: Record<string, unknown>) => ({
      role_name: role.role_name as string,
      total_hours: (role.total_hours as number) || 0,
    }));
  }

  private async aggregateDemandByProjectType(filters: DemandReportFilters) {
    const { startDate, endDate, scenarioId, includeAllScenarios } = filters;

    let query = this.db('project_demands_view')
      .select('project_type_id', 'project_type_name')
      .sum('demand_hours as total_hours')
      .groupBy('project_type_id', 'project_type_name')
      .orderBy('total_hours', 'desc');

    const scenarioType = await this.getScenarioType(scenarioId);
    query = this.applyScenarioFilter(query, scenarioId, includeAllScenarios, scenarioType);
    query = this.applyDateFilter(query, startDate, endDate);

    const results = await query;
    return results.map((type: Record<string, unknown>) => ({
      project_type_name: type.project_type_name as string,
      total_hours: (type.total_hours as number) || 0,
    }));
  }

  private async generateDemandTimeline(filters: DemandReportFilters) {
    const { startDate, endDate, scenarioId, includeAllScenarios } = filters;
    const timeline = [];

    if (startDate && endDate) {
      const start = new Date(startDate + 'T00:00:00');
      const end = new Date(endDate + 'T00:00:00');

      const startYear = start.getFullYear();
      const startMonth = start.getMonth();
      const endYear = end.getFullYear();
      const endMonth = end.getMonth();
      const monthsDiff = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;

      const months = [];
      for (let i = 0; i < monthsDiff; i++) {
        const currentYear = startYear + Math.floor((startMonth + i) / 12);
        const currentMonth = (startMonth + i) % 12;
        months.push({
          monthKey: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`,
          monthStart: new Date(currentYear, currentMonth, 1).toISOString().split('T')[0],
          monthEnd: new Date(currentYear, currentMonth + 1, 0).toISOString().split('T')[0],
        });
      }

      for (const month of months) {
        let monthQuery = this.db('project_demands_view')
          .sum('demand_hours as total_hours')
          .where('start_date', '<=', month.monthEnd)
          .andWhere('end_date', '>=', month.monthStart);

        const scenarioType = await this.getScenarioType(scenarioId);
    monthQuery = this.applyScenarioFilter(monthQuery, scenarioId, includeAllScenarios, scenarioType);

        const monthData = await monthQuery.first();
        timeline.push({
          month: month.monthKey,
          total_hours: Math.round((monthData?.total_hours as number) || 0),
        });
      }
    } else {
      let timelineQuery = this.db('project_demands_view')
        .select(this.db.raw("strftime('%Y-%m', start_date) as month"))
        .sum('demand_hours as total_hours')
        .groupBy(this.db.raw("strftime('%Y-%m', start_date)"))
        .orderBy('month');

      const scenarioType = await this.getScenarioType(scenarioId);
    timelineQuery = this.applyScenarioFilter(timelineQuery, scenarioId, includeAllScenarios, scenarioType);

      const timelineData = await timelineQuery;
      timeline.push(...timelineData.map((month: Record<string, unknown>) => ({
        month: month.month as string,
        total_hours: Math.round((month.total_hours as number) || 0),
      })));
    }

    return timeline;
  }

  private async countDistinctProjects(filters: DemandReportFilters): Promise<number> {
    const { scenarioId, includeAllScenarios } = filters;

    let query = this.db('project_demands_view').countDistinct('project_id as count');
    const scenarioType = await this.getScenarioType(scenarioId);
    query = this.applyScenarioFilter(query, scenarioId, includeAllScenarios, scenarioType);

    const result = await query.first();
    return (result?.count as number) || 0;
  }

  private async countDistinctRoles(filters: DemandReportFilters): Promise<number> {
    const { scenarioId, includeAllScenarios } = filters;

    let query = this.db('project_demands_view').countDistinct('role_id as count');
    const scenarioType = await this.getScenarioType(scenarioId);
    query = this.applyScenarioFilter(query, scenarioId, includeAllScenarios, scenarioType);

    const result = await query.first();
    return (result?.count as number) || 0;
  }
}
