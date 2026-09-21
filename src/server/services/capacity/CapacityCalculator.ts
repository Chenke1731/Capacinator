import { getAuditedDb } from '../../database/index.js';

export interface CapacityResult {
  role_id: string;
  role_name: string;
  total_capacity_hours: number;
  total_capacity_fte: number;
  allocated_hours: number;
  allocated_fte: number;
  available_hours: number;
  available_fte: number;
  utilization_percentage: number;
  people: Array<{
    person_id: string;
    person_name: string;
    capacity_hours: number;
    allocated_hours: number;
    available_hours: number;
  }>;
}

export class CapacityCalculator {
  private db: any;

  constructor() {
    this.db = getAuditedDb();
  }

  async calculateCapacityByRole(
    startDate: string,
    endDate: string,
    location_id?: string
  ): Promise<CapacityResult[]> {
    // Get all roles
    const roles = await this.db('roles').select('*');
    
    const results: CapacityResult[] = [];

    for (const role of roles) {
      // Get people with this role
      const peopleQuery = this.db('person_roles')
        .join('people', 'person_roles.person_id', 'people.id')
        .where('person_roles.role_id', role.id)
        .select(
          'people.*',
          'person_roles.proficiency_level'
        );

      if (location_id) {
        // TODO: Add location filtering when people have location
      }

      const peopleWithRole = await peopleQuery;

      let totalCapacityHours = 0;
      let totalAllocatedHours = 0;
      const peopleDetails = [];

      for (const person of peopleWithRole) {
        const capacity = await this.calculatePersonCapacity(
          person.id,
          startDate,
          endDate
        );

        const allocated = await this.calculatePersonAllocation(
          person.id,
          startDate,
          endDate
        );

        totalCapacityHours += capacity;
        totalAllocatedHours += allocated;

        peopleDetails.push({
          person_id: person.id,
          person_name: person.name,
          capacity_hours: capacity,
          allocated_hours: allocated,
          available_hours: capacity - allocated
        });
      }

      const workingDays = this.calculateWorkingDays(startDate, endDate);
      const hoursPerDay = 8;
      const totalWorkingHours = workingDays * hoursPerDay;

      results.push({
        role_id: role.id,
        role_name: role.name,
        total_capacity_hours: totalCapacityHours,
        total_capacity_fte: totalCapacityHours / totalWorkingHours,
        allocated_hours: totalAllocatedHours,
        allocated_fte: totalAllocatedHours / totalWorkingHours,
        available_hours: totalCapacityHours - totalAllocatedHours,
        available_fte: (totalCapacityHours - totalAllocatedHours) / totalWorkingHours,
        utilization_percentage: totalCapacityHours > 0 
          ? (totalAllocatedHours / totalCapacityHours) * 100 
          : 0,
        people: peopleDetails
      });
    }

    return results.sort((a, b) => b.total_capacity_fte - a.total_capacity_fte);
  }

  async calculatePersonCapacity(
    personId: string,
    startDate: string,
    endDate: string
  ): Promise<number> {
    // Get person's default availability
    const person = await this.db('people')
      .where('id', personId)
      .first();

    if (!person) return 0;

    // Get availability overrides in the period
    const overrides = await this.db('person_availability_overrides')
      .where('person_id', personId)
      .where('start_date', '<=', endDate)
      .where('end_date', '>=', startDate)
      .where('is_approved', true)
      .select('*');

    // Calculate capacity day by day
    let totalCapacityHours = 0;
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      // Skip weekends
      if (date.getDay() === 0 || date.getDay() === 6) continue;

      const dateStr = date.toISOString().split('T')[0];
      
      // Check if there's an override for this date
      const override = overrides.find((o: { start_date: string; end_date: string }) =>
        o.start_date <= dateStr && o.end_date >= dateStr
      );

      const availabilityPercentage = override?.availability_percentage ?? person.default_availability_percentage;
      const hoursPerDay = override?.hours_per_day ?? person.default_hours_per_day;

      totalCapacityHours += (hoursPerDay * availabilityPercentage) / 100;
    }

    return totalCapacityHours;
  }

  async calculatePersonAllocation(
    personId: string,
    startDate: string,
    endDate: string
  ): Promise<number> {
    // Get assignments in the period (paused rows do not consume capacity)
    const assignments = await this.db('project_assignments')
      .where('person_id', personId)
      .where('status', 'active')
      .where('start_date', '<=', endDate)
      .where('end_date', '>=', startDate)
      .select('*');

    let totalAllocatedHours = 0;

    for (const assignment of assignments) {
      // Calculate overlap period
      const overlapStart = new Date(Math.max(
        new Date(assignment.start_date).getTime(),
        new Date(startDate).getTime()
      ));
      const overlapEnd = new Date(Math.min(
        new Date(assignment.end_date).getTime(),
        new Date(endDate).getTime()
      ));

      const overlapDays = this.calculateWorkingDays(
        overlapStart.toISOString().split('T')[0],
        overlapEnd.toISOString().split('T')[0]
      );

      // Standard 8 hours per day * allocation percentage
      totalAllocatedHours += (overlapDays * 8 * assignment.allocation_percentage) / 100;
    }

    return totalAllocatedHours;
  }

  async calculateTeamCapacity(
    teamIds: string[],
    startDate: string,
    endDate: string
  ): Promise<any> {
    // TODO: Implement when teams table exists
    // For now, calculate for all people
    const people = await this.db('people').select('*');
    
    let totalCapacity = 0;
    let totalAllocated = 0;
    const memberDetails = [];

    for (const person of people) {
      const capacity = await this.calculatePersonCapacity(person.id, startDate, endDate);
      const allocated = await this.calculatePersonAllocation(person.id, startDate, endDate);

      totalCapacity += capacity;
      totalAllocated += allocated;

      memberDetails.push({
        person_id: person.id,
        person_name: person.name,
        capacity_hours: capacity,
        allocated_hours: allocated,
        utilization: capacity > 0 ? (allocated / capacity) * 100 : 0
      });
    }

    const workingDays = this.calculateWorkingDays(startDate, endDate);
    const hoursPerDay = 8;
    const totalWorkingHours = workingDays * hoursPerDay;

    return {
      team_capacity: {
        total_capacity_hours: totalCapacity,
        total_capacity_fte: totalCapacity / totalWorkingHours,
        total_allocated_hours: totalAllocated,
        total_allocated_fte: totalAllocated / totalWorkingHours,
        available_hours: totalCapacity - totalAllocated,
        available_fte: (totalCapacity - totalAllocated) / totalWorkingHours,
        utilization_percentage: totalCapacity > 0 ? (totalAllocated / totalCapacity) * 100 : 0
      },
      members: memberDetails.sort((a, b) => b.utilization - a.utilization)
    };
  }

  async identifyBottlenecks(
    startDate: string,
    endDate: string
  ): Promise<any[]> {
    // Get capacity by role
    const capacityByRole = await this.calculateCapacityByRole(startDate, endDate);

    // Get demand by role
    const demandByRole = await this.db('project_demands_view')
      .join('projects', 'project_demands_view.project_id', 'projects.id')
      .join('roles', 'project_demands_view.role_id', 'roles.id')
      .where('projects.include_in_demand', true)
      .where('project_demands_view.start_date', '<=', endDate)
      .where('project_demands_view.end_date', '>=', startDate)
      .select(
        'project_demands_view.role_id',
        'roles.name as role_name',
        this.db.raw('SUM(project_demands_view.demand_hours) as total_demand_hours')
      )
      .groupBy('project_demands_view.role_id', 'roles.name');

    const bottlenecks = [];

    for (const capacity of capacityByRole) {
      const demand = demandByRole.find((d: { role_id: string }) => d.role_id === capacity.role_id);
      
      if (demand && demand.total_demand_hours > capacity.available_hours) {
        bottlenecks.push({
          role_id: capacity.role_id,
          role_name: capacity.role_name,
          capacity_hours: capacity.total_capacity_hours,
          allocated_hours: capacity.allocated_hours,
          available_hours: capacity.available_hours,
          demand_hours: demand.total_demand_hours,
          shortage_hours: demand.total_demand_hours - capacity.available_hours,
          shortage_percentage: ((demand.total_demand_hours - capacity.available_hours) / demand.total_demand_hours) * 100,
          people_count: capacity.people.length,
          severity: this.calculateBottleneckSeverity(
            capacity.available_hours,
            demand.total_demand_hours
          )
        });
      }
    }

    return bottlenecks.sort((a, b) => b.shortage_percentage - a.shortage_percentage);
  }

  private calculateWorkingDays(startDate: string, endDate: string): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    let workingDays = 0;

    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      // Skip weekends
      if (date.getDay() !== 0 && date.getDay() !== 6) {
        workingDays++;
      }
    }

    return workingDays;
  }

  private calculateBottleneckSeverity(available: number, demand: number): string {
    const shortageRatio = (demand - available) / demand;
    
    if (shortageRatio > 0.5) return 'CRITICAL';
    if (shortageRatio > 0.25) return 'HIGH';
    if (shortageRatio > 0.1) return 'MEDIUM';
    return 'LOW';
  }

  async generateCapacityReport(
    startDate: string,
    endDate: string,
    options: {
      includeDetails?: boolean;
      groupBy?: 'role' | 'person' | 'project';
    } = {}
  ): Promise<any> {
    const capacityByRole = await this.calculateCapacityByRole(startDate, endDate);
    const bottlenecks = await this.identifyBottlenecks(startDate, endDate);
    const teamCapacity = await this.calculateTeamCapacity([], startDate, endDate);

    const report = {
      period: {
        start_date: startDate,
        end_date: endDate,
        working_days: this.calculateWorkingDays(startDate, endDate)
      },
      summary: {
        total_capacity_fte: capacityByRole.reduce((sum, r) => sum + r.total_capacity_fte, 0),
        total_allocated_fte: capacityByRole.reduce((sum, r) => sum + r.allocated_fte, 0),
        total_available_fte: capacityByRole.reduce((sum, r) => sum + r.available_fte, 0),
        overall_utilization: teamCapacity.team_capacity.utilization_percentage,
        roles_with_capacity: capacityByRole.length,
        bottleneck_count: bottlenecks.length,
        critical_bottlenecks: bottlenecks.filter(b => b.severity === 'CRITICAL').length
      },
      capacity_by_role: options.includeDetails ? capacityByRole : capacityByRole.map(r => ({
        role_id: r.role_id,
        role_name: r.role_name,
        capacity_fte: r.total_capacity_fte,
        allocated_fte: r.allocated_fte,
        available_fte: r.available_fte,
        utilization: r.utilization_percentage
      })),
      bottlenecks: bottlenecks.map(b => ({
        role_name: b.role_name,
        shortage_hours: b.shortage_hours,
        shortage_percentage: b.shortage_percentage,
        severity: b.severity
      })),
      recommendations: this.generateRecommendations(capacityByRole, bottlenecks)
    };

    return report;
  }

  private generateRecommendations(
    capacityByRole: CapacityResult[],
    bottlenecks: any[]
  ): string[] {
    const recommendations = [];

    // Critical bottlenecks
    const criticalBottlenecks = bottlenecks.filter(b => b.severity === 'CRITICAL');
    if (criticalBottlenecks.length > 0) {
      recommendations.push(
        `URGENT: ${criticalBottlenecks.length} role(s) have critical capacity shortages: ${
          criticalBottlenecks.map(b => b.role_name).join(', ')
        }. Immediate hiring or reallocation required.`
      );
    }

    // Under-utilized roles
    const underUtilized = capacityByRole.filter(r => r.utilization_percentage < 50);
    if (underUtilized.length > 0) {
      recommendations.push(
        `${underUtilized.length} role(s) are under-utilized (<50%): ${
          underUtilized.map(r => r.role_name).join(', ')
        }. Consider cross-training or reallocation.`
      );
    }

    // Over-utilized roles
    const overUtilized = capacityByRole.filter(r => r.utilization_percentage > 90);
    if (overUtilized.length > 0) {
      recommendations.push(
        `${overUtilized.length} role(s) are heavily utilized (>90%): ${
          overUtilized.map(r => r.role_name).join(', ')
        }. Monitor for burnout risk.`
      );
    }

    return recommendations;
  }
}