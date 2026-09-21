import type { Knex } from 'knex';
import type {
  DemandSummaryFilters,
  ProjectDemandsData,
  DemandSummaryData,
  ForecastData,
  DemandGapsData,
  ScenarioInput,
  ScenarioResult,
  DemandWithFte,
  PhaseWithDemands,
  RoleSummary,
  ProjectTypeSummary,
  TimelineMonth,
  ForecastMonth,
  ScenarioSummary,
} from './types.js';

/**
 * Base demand record for scenario calculations
 */
interface BaseDemand {
  project_id: string;
  role_id?: string;
  phase_id?: string;
  demand_hours: number;
  start_date: string;
  end_date: string;
  [key: string]: unknown;
}

/**
 * Service for demand calculations and forecasting.
 * Extracted from DemandController.
 */
export class DemandCalculationService {
  constructor(private db: Knex) {}

  /**
   * Get demands for a specific project with phase grouping
   */
  async getProjectDemands(projectId: string): Promise<ProjectDemandsData | null> {
    // Get project details
    const project = await this.db('projects')
      .join('project_types', 'projects.project_type_id', 'project_types.id')
      .where('projects.id', projectId)
      .select('projects.*', 'project_types.name as project_type_name')
      .first();

    if (!project) {
      return null;
    }

    // Get demands from view
    const demands = await this.db('project_demands_view')
      .join('project_phases', 'project_demands_view.phase_id', 'project_phases.id')
      .join('roles', 'project_demands_view.role_id', 'roles.id')
      .where('project_demands_view.project_id', projectId)
      .select(
        'project_demands_view.*',
        'project_phases.name as phase_name',
        'project_phases.order_index as phase_order',
        'roles.name as role_name'
      )
      .orderBy('project_demands_view.start_date', 'project_phases.order_index', 'roles.name');

    // Calculate FTE for each demand
    const demandsWithFte: DemandWithFte[] = demands.map((demand: Record<string, unknown>) => ({
      ...demand,
      project_id: demand.project_id as string,
      role_id: demand.role_id as string,
      phase_id: demand.phase_id as string,
      demand_hours: demand.demand_hours as number,
      start_date: demand.start_date as string,
      end_date: demand.end_date as string,
      phase_name: demand.phase_name as string,
      phase_order: demand.phase_order as number,
      role_name: demand.role_name as string,
      is_override: demand.is_override as boolean,
      demand_fte: this.calculateFte(
        demand.demand_hours as number,
        demand.start_date as string,
        demand.end_date as string
      ),
    }));

    // Group by phase
    const phaseMap = new Map<string, PhaseWithDemands>();
    demandsWithFte.forEach((demand) => {
      if (!phaseMap.has(demand.phase_id!)) {
        phaseMap.set(demand.phase_id!, {
          phase_id: demand.phase_id!,
          phase_name: demand.phase_name!,
          phase_order: demand.phase_order!,
          start_date: demand.start_date,
          end_date: demand.end_date,
          demands: [],
          total_hours: 0,
          total_fte: 0,
        });
      }

      const phase = phaseMap.get(demand.phase_id!)!;
      phase.demands.push(demand);
      phase.total_hours += demand.demand_hours;
      phase.total_fte += demand.demand_fte;
    });

    const phases = Array.from(phaseMap.values()).sort((a, b) => a.phase_order - b.phase_order);

    return {
      project,
      phases,
      demands: demandsWithFte,
      summary: {
        total_phases: phases.length,
        total_demands: demandsWithFte.length,
        total_hours: demandsWithFte.reduce((sum, d) => sum + d.demand_hours, 0),
        total_fte: demandsWithFte.reduce((sum, d) => sum + d.demand_fte, 0),
        override_count: demandsWithFte.filter((d) => d.is_override).length,
        roles_needed: new Set(demandsWithFte.map((d) => d.role_id)).size,
      },
    };
  }

  /**
   * Get demand summary with filtering and aggregations
   */
  async getDemandSummary(filters: DemandSummaryFilters): Promise<DemandSummaryData> {
    const { startDate, endDate, locationId, projectTypeId } = filters;

    // Build base query (paused assignments are not demand)
    let baseQuery = this.db('project_assignments as pa')
      .join('projects as p', 'pa.project_id', 'p.id')
      .join('roles as r', 'pa.role_id', 'r.id')
      .where('p.include_in_demand', true)
      .where('pa.status', 'active');

    if (startDate) {
      baseQuery = baseQuery.where('pa.end_date', '>=', startDate);
    }
    if (endDate) {
      baseQuery = baseQuery.where('pa.start_date', '<=', endDate);
    }
    if (locationId) {
      baseQuery = baseQuery.where('p.location_id', locationId);
    }
    if (projectTypeId) {
      baseQuery = baseQuery.where('p.project_type_id', projectTypeId);
    }

    // Get demands from actual assignments
    const demands = await baseQuery
      .leftJoin('project_types as pt', 'p.project_type_id', 'pt.id')
      .select(
        'pa.id',
        'pa.project_id',
        'pa.role_id',
        'pa.allocation_percentage',
        'pa.start_date',
        'pa.end_date',
        'p.name as project_name',
        'p.priority as project_priority',
        'p.project_type_id',
        'pt.name as project_type_name',
        'r.name as role_name'
      );

    // Aggregate by role - using internal types with Set for accumulation
    interface RoleAccumulator {
      role_id: string;
      role_name: string;
      total_hours: number;
      total_fte: number;
      project_count: Set<string>;
    }
    interface ProjectTypeAccumulator {
      project_type_id: string | null;
      project_type_name: string;
      total_hours: number;
      total_fte: number;
      project_count: Set<string>;
    }
    const roleMap = new Map<string, RoleAccumulator>();
    const projectTypeMap = new Map<string, ProjectTypeAccumulator>();

    demands.forEach((demand: Record<string, unknown>) => {
      const roleId = demand.role_id as string;
      const durationDays = this.calculateWorkDays(demand.start_date as string, demand.end_date as string);
      const demandHours = ((demand.allocation_percentage as number) / 100) * durationDays * 8;

      if (!roleMap.has(roleId)) {
        roleMap.set(roleId, {
          role_id: roleId,
          role_name: demand.role_name as string,
          total_hours: 0,
          total_fte: 0,
          project_count: new Set(),
        });
      }

      const role = roleMap.get(roleId)!;
      role.total_hours += demandHours;
      role.total_fte += (demand.allocation_percentage as number) / 100;
      role.project_count.add(demand.project_id as string);

      // Project type aggregation
      const projectTypeKey = (demand.project_type_id as string) || 'unknown';
      if (!projectTypeMap.has(projectTypeKey)) {
        projectTypeMap.set(projectTypeKey, {
          project_type_id: demand.project_type_id as string | null,
          project_type_name: (demand.project_type_name as string) || 'Unknown',
          total_hours: 0,
          total_fte: 0,
          project_count: new Set(),
        });
      }

      const projectType = projectTypeMap.get(projectTypeKey)!;
      projectType.total_hours += demandHours;
      projectType.total_fte += (demand.allocation_percentage as number) / 100;
      projectType.project_count.add(demand.project_id as string);
    });

    const by_role: RoleSummary[] = Array.from(roleMap.values())
      .map((role) => ({
        ...role,
        project_count: role.project_count.size,
      }))
      .sort((a, b) => b.total_fte - a.total_fte);

    const by_project_type: ProjectTypeSummary[] = Array.from(projectTypeMap.values())
      .map((pt) => ({
        ...pt,
        project_count: pt.project_count.size,
      }))
      .sort((a, b) => b.total_fte - a.total_fte);

    // Calculate timeline
    const timeline = this.calculateTimelineFromDemands(demands, startDate, endDate);

    return {
      filters: { startDate, endDate, locationId, projectTypeId },
      summary: {
        total_demands: demands.length,
        total_projects: new Set(demands.map((d: Record<string, unknown>) => d.project_id)).size,
        total_hours: by_role.reduce((sum, r) => sum + r.total_hours, 0),
        total_fte: by_role.reduce((sum, r) => sum + r.total_fte, 0),
      },
      by_role,
      by_project_type,
      timeline,
    };
  }

  /**
   * Generate demand forecast for specified number of months
   */
  async getDemandForecast(months: number): Promise<ForecastData> {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + months);

    // Get all active projects
    const projects = await this.db('projects')
      .where('include_in_demand', true)
      .where('aspiration_finish', '>=', startDate)
      .select('*');

    // Get demands for forecast period
    const demands = await this.db('project_demands_view')
      .join('projects', 'project_demands_view.project_id', 'projects.id')
      .join('roles', 'project_demands_view.role_id', 'roles.id')
      .where('projects.include_in_demand', true)
      .where('project_demands_view.end_date', '>=', startDate)
      .where('project_demands_view.start_date', '<=', endDate)
      .select(
        'project_demands_view.*',
        'projects.name as project_name',
        'projects.priority as project_priority',
        'roles.name as role_name'
      );

    // Calculate monthly forecast
    const forecast: ForecastMonth[] = [];

    for (let month = 0; month < months; month++) {
      const monthStart = new Date(startDate);
      monthStart.setMonth(monthStart.getMonth() + month);
      monthStart.setDate(1);

      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthEnd.getMonth() + 1);
      monthEnd.setDate(0);

      const monthDemands = demands.filter((d: Record<string, unknown>) =>
        (d.start_date as string) <= monthEnd.toISOString().split('T')[0] &&
        (d.end_date as string) >= monthStart.toISOString().split('T')[0]
      );

      const monthData: ForecastMonth = {
        month: monthStart.toISOString().slice(0, 7),
        start_date: monthStart.toISOString().split('T')[0],
        end_date: monthEnd.toISOString().split('T')[0],
        total_hours: 0,
        total_fte: 0,
        by_role: {},
        project_count: 0,
      };

      const projectIds = new Set<string>();

      monthDemands.forEach((demand: Record<string, unknown>) => {
        const demandStart = new Date(Math.max(
          new Date(demand.start_date as string).getTime(),
          monthStart.getTime()
        ));
        const demandEnd = new Date(Math.min(
          new Date(demand.end_date as string).getTime(),
          monthEnd.getTime()
        ));
        const daysInMonth = (demandEnd.getTime() - demandStart.getTime()) / (1000 * 60 * 60 * 24) + 1;
        const totalDays = (
          new Date(demand.end_date as string).getTime() -
          new Date(demand.start_date as string).getTime()
        ) / (1000 * 60 * 60 * 24) + 1;

        const monthHours = ((demand.demand_hours as number) * daysInMonth) / totalDays;
        const monthFte = this.calculateFte(
          monthHours,
          demandStart.toISOString().split('T')[0],
          demandEnd.toISOString().split('T')[0]
        );

        monthData.total_hours += monthHours;
        monthData.total_fte += monthFte;
        projectIds.add(demand.project_id as string);

        const roleName = demand.role_name as string;
        if (!monthData.by_role[roleName]) {
          monthData.by_role[roleName] = { hours: 0, fte: 0 };
        }
        monthData.by_role[roleName].hours += monthHours;
        monthData.by_role[roleName].fte += monthFte;
      });

      monthData.project_count = projectIds.size;
      forecast.push(monthData);
    }

    return {
      forecast,
      summary: {
        months,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        total_projects: projects.length,
        peak_month: forecast.reduce((max, month) =>
          month.total_fte > (max?.total_fte || 0) ? month : max, forecast[0]),
        average_monthly_fte: forecast.reduce((sum, m) => sum + m.total_fte, 0) / forecast.length,
      },
    };
  }

  /**
   * Get demand gaps where demand exceeds capacity
   */
  async getDemandGaps(): Promise<DemandGapsData> {
    const gapsData = await this.db('capacity_gaps_view').select('*');

    const gaps = gapsData
      .map((role: Record<string, unknown>) => {
        const gapFte = (role.total_demand_fte as number) - (role.total_capacity_fte as number);
        return {
          role_id: role.role_id as string,
          role_name: role.role_name as string,
          total_demand_fte: (role.total_demand_fte as number) || 0,
          total_capacity_fte: (role.total_capacity_fte as number) || 0,
          gap_fte: gapFte,
        };
      })
      .filter((role) => role.gap_fte > 0);

    return {
      gaps,
      summary: {
        total_gaps: gaps.length,
        total_shortage_fte: gaps.reduce((sum, g) => sum + Math.abs(g.gap_fte), 0),
        critical_gaps: gaps.filter((g) =>
          Math.abs(g.gap_fte / (g.total_capacity_fte || 1)) > 0.2
        ).length,
      },
    };
  }

  /**
   * Calculate scenario impact (what-if analysis)
   */
  async calculateScenarioImpact(scenario: ScenarioInput): Promise<ScenarioResult> {
    const baselineDemands = await this.getBaselineDemands();
    let scenarioDemands = [...baselineDemands];

    // Apply scenario changes
    if (scenario.new_projects) {
      for (const newProject of scenario.new_projects) {
        const projectDemands = await this.calculateProjectDemandsFromType(newProject);
        scenarioDemands.push(...projectDemands);
      }
    }

    if (scenario.remove_projects) {
      scenarioDemands = scenarioDemands.filter((d) =>
        !scenario.remove_projects!.includes(d.project_id)
      );
    }

    if (scenario.delay_projects) {
      for (const delay of scenario.delay_projects) {
        scenarioDemands = scenarioDemands.map((d) => {
          if (d.project_id === delay.project_id) {
            const newStartDate = new Date(d.start_date);
            const newEndDate = new Date(d.end_date);
            newStartDate.setDate(newStartDate.getDate() + delay.delay_days);
            newEndDate.setDate(newEndDate.getDate() + delay.delay_days);

            return {
              ...d,
              start_date: newStartDate.toISOString().split('T')[0],
              end_date: newEndDate.toISOString().split('T')[0],
            };
          }
          return d;
        });
      }
    }

    // Calculate impact
    const baselineSummary = this.summarizeDemands(baselineDemands);
    const scenarioSummary = this.summarizeDemands(scenarioDemands);

    const impact = {
      total_fte_change: scenarioSummary.total_fte - baselineSummary.total_fte,
      total_hours_change: scenarioSummary.total_hours - baselineSummary.total_hours,
      roles_impacted: this.compareRoleDemands(baselineSummary.by_role, scenarioSummary.by_role),
      new_gaps: this.identifyNewGaps(scenarioSummary),
    };

    return {
      scenario,
      baseline: baselineSummary,
      projected: scenarioSummary,
      impact,
      recommendation: this.generateRecommendation(impact),
    };
  }

  // ============================================================================
  // Shared Calculation Utilities
  // ============================================================================

  /**
   * Calculate FTE from hours and date range
   */
  calculateFte(hours: number, startDate: string, endDate: string): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const workingDays = days * (5 / 7);
    const hoursPerDay = 8;
    const totalAvailableHours = workingDays * hoursPerDay;

    return totalAvailableHours > 0 ? hours / totalAvailableHours : 0;
  }

  /**
   * Calculate working days between two dates
   */
  calculateWorkDays(startDate: string, endDate: string): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.round(diffDays * (5 / 7));
  }

  /**
   * Calculate timeline from demands array
   */
  calculateTimelineFromDemands(
    demands: Record<string, unknown>[],
    filterStartDate?: string,
    filterEndDate?: string
  ): TimelineMonth[] {
    const monthlyMap = new Map<string, TimelineMonth>();

    const filterStart = filterStartDate ? new Date(filterStartDate) : null;
    const filterEnd = filterEndDate ? new Date(filterEndDate) : null;

    demands.forEach((demand) => {
      const startDate = new Date(demand.start_date as string);
      const endDate = new Date(demand.end_date as string);

      const durationDays = this.calculateWorkDays(demand.start_date as string, demand.end_date as string);
      const demandHours = ((demand.allocation_percentage as number) / 100) * durationDays * 8;

      const durationMonths = Math.max(1, Math.ceil(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
      ));
      const hoursPerMonth = demandHours / durationMonths;

      const currentDate = new Date(startDate);
      currentDate.setDate(1);

      while (currentDate <= endDate) {
        const monthKey = currentDate.toISOString().slice(0, 7);
        const monthDate = new Date(monthKey + '-01');

        if (filterStart) {
          const filterStartMonth = new Date(filterStart.getFullYear(), filterStart.getMonth(), 1);
          if (monthDate < filterStartMonth) {
            currentDate.setMonth(currentDate.getMonth() + 1);
            continue;
          }
        }
        if (filterEnd) {
          const filterEndMonth = new Date(filterEnd.getFullYear(), filterEnd.getMonth(), 1);
          if (monthDate > filterEndMonth) {
            break;
          }
        }

        if (!monthlyMap.has(monthKey)) {
          monthlyMap.set(monthKey, {
            month: monthKey,
            total_hours: 0,
            total_fte: 0,
            role_breakdown: {},
          });
        }

        const monthData = monthlyMap.get(monthKey)!;
        monthData.total_hours += hoursPerMonth;
        monthData.total_fte += hoursPerMonth / 160;

        currentDate.setMonth(currentDate.getMonth() + 1);
      }
    });

    return Array.from(monthlyMap.values()).sort((a, b) => a.month.localeCompare(b.month));
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async getBaselineDemands(): Promise<BaseDemand[]> {
    const results = await this.db('project_demands_view')
      .join('projects', 'project_demands_view.project_id', 'projects.id')
      .where('projects.include_in_demand', true)
      .select('project_demands_view.*');
    return results as BaseDemand[];
  }

  private async calculateProjectDemandsFromType(project: {
    id: string;
    project_type_id: string;
    start_date: string;
    end_date: string;
  }): Promise<BaseDemand[]> {
    const allocations = await this.db('standard_allocations')
      .where('project_type_id', project.project_type_id)
      .select('*');

    return allocations.map((allocation: Record<string, unknown>): BaseDemand => ({
      project_id: project.id,
      role_id: allocation.role_id as string,
      phase_id: allocation.phase_id as string,
      demand_hours: (allocation.allocation_percentage as number) * 8 * 20,
      start_date: project.start_date,
      end_date: project.end_date,
    }));
  }

  private summarizeDemands(demands: BaseDemand[]): ScenarioSummary {
    const summary: ScenarioSummary = {
      total_hours: 0,
      total_fte: 0,
      by_role: {},
    };

    demands.forEach((demand) => {
      summary.total_hours += (demand.demand_hours as number) || 0;
      summary.total_fte += this.calculateFte(
        (demand.demand_hours as number) || 0,
        demand.start_date as string,
        demand.end_date as string
      );
    });

    return summary;
  }

  private compareRoleDemands(
    _baseline: Record<string, unknown>,
    _scenario: Record<string, unknown>
  ): unknown[] {
    // Implementation would compare role demands
    return [];
  }

  private identifyNewGaps(_scenarioSummary: ScenarioSummary): unknown[] {
    // Implementation would identify capacity gaps
    return [];
  }

  private generateRecommendation(impact: {
    total_fte_change: number;
    new_gaps: unknown[];
  }): string {
    if (impact.total_fte_change > 10) {
      return 'This scenario would require significant additional resources';
    } else if (impact.new_gaps.length > 0) {
      return 'This scenario would create capacity gaps that need to be addressed';
    } else {
      return 'This scenario appears feasible with current resources';
    }
  }
}
