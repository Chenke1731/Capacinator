/**
 * EstimationService — Step 1 estimation features (per docs/REQUIREMENTS_zh-CN.md):
 *
 * 1. LOC → person-month conversion with deviation interval
 *    (SE estimates lines of code; rate default 500 LOC/PM = 0.5k, configurable)
 * 2. Deadline feasibility check: compares demand interval against the team's
 *    free capacity in the window [start, deadline], per role side (SE / 开发).
 *    Free capacity already nets out ALL existing allocations — including the
 *    problem-ticket (30%) and project-affairs (25%) reservation buffers —
 *    because they are ordinary assignments on the reservation projects.
 *    This project's own assignments are excluded (they are the demand being
 *    evaluated, not existing load).
 *
 * Unit conventions:
 * - 1 person-month (PM) = one person at 100% availability for one calendar month
 * - window months = elapsed days / 30.4375 (365.25 / 12)
 */

export interface ConversionInput {
  estimated_loc: number;
  loc_rate_per_pm: number;    // LOC per person-month, default 500 (0.5k)
  design_share_pct: number;   // design share of total PM, default 15
  deviation_low_pct: number;  // optimistic deviation, default 20
  deviation_high_pct: number; // pessimistic deviation, default 50
}

export interface PmInterval {
  low: number;  // optimistic
  mid: number;  // point estimate
  high: number; // pessimistic
}

export interface ConversionResult {
  total: PmInterval;
  design: PmInterval;
  dev: PmInterval;
}

const DAYS_PER_MONTH = 365.25 / 12;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const DEFAULT_CONVERSION: Required<ConversionInput> = {
  estimated_loc: 0,
  loc_rate_per_pm: 500,
  design_share_pct: 15,
  deviation_low_pct: 20,
  deviation_high_pct: 50
};

/** Role names that make up the design side and the dev side of a delivery. */
export const DESIGN_SIDE_ROLES = ['SE'];
export const DEV_SIDE_ROLES = ['开发'];

export type Verdict = 'feasible' | 'tight' | 'infeasible';
const VERDICT_ORDER: Record<Verdict, number> = { feasible: 0, tight: 1, infeasible: 2 };

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function convertToPersonMonths(input: ConversionInput): ConversionResult {
  const p = { ...DEFAULT_CONVERSION, ...input };
  if (p.loc_rate_per_pm <= 0) {
    throw new Error('loc_rate_per_pm must be positive');
  }
  if (p.estimated_loc < 0) {
    throw new Error('estimated_loc must be >= 0');
  }
  if (p.design_share_pct < 0 || p.design_share_pct > 100) {
    throw new Error('design_share_pct must be between 0 and 100');
  }

  const totalMid = p.estimated_loc / p.loc_rate_per_pm;
  const lowFactor = 1 - p.deviation_low_pct / 100;
  const highFactor = 1 + p.deviation_high_pct / 100;

  const interval = (mid: number): PmInterval => ({
    low: mid * lowFactor,
    mid,
    high: mid * highFactor
  });

  return {
    total: interval(totalMid),
    design: interval(totalMid * (p.design_share_pct / 100)),
    dev: interval(totalMid * (1 - p.design_share_pct / 100))
  };
}

export function windowMonths(startISO: string, endISO: string): number {
  const start = new Date(startISO);
  const end = new Date(endISO);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error('invalid date');
  }
  const days = (end.getTime() - start.getTime()) / MS_PER_DAY;
  if (days <= 0) {
    throw new Error('end date must be after start date');
  }
  return days / DAYS_PER_MONTH;
}

interface TeamMember {
  id: string;
  name: string;
  availability: number; // percentage, 100 = full FTE
}

interface ExistingAssignment {
  person_id: string;
  project_id: string;
  allocation_percentage: number;
  computed_start_date: string | null;
  computed_end_date: string | null;
}

interface PoolDemandRow {
  project_id: string;
  headcount: number;
  start_date: string | null;
  end_date: string | null;
}

function poolOverlapMonths(
  pool: PoolDemandRow,
  windowStart: Date,
  windowEnd: Date
): number {
  // Pools without dates are treated as consuming throughout the window
  // (same semantics as assignments without dates)
  return overlapMonths(
    {
      person_id: '',
      project_id: pool.project_id,
      allocation_percentage: 100,
      computed_start_date: pool.start_date,
      computed_end_date: pool.end_date
    },
    windowStart,
    windowEnd
  );
}

function overlapMonths(
  assignment: ExistingAssignment,
  windowStart: Date,
  windowEnd: Date
): number {
  const aStart = assignment.computed_start_date
    ? new Date(assignment.computed_start_date)
    : null;
  const aEnd = assignment.computed_end_date
    ? new Date(assignment.computed_end_date)
    : null;

  // Assignments without dates are treated as active throughout the window
  const s = aStart && aStart > windowStart ? aStart : windowStart;
  const e = aEnd && aEnd < windowEnd ? aEnd : windowEnd;
  if (e <= s) return 0;

  const months = (e.getTime() - s.getTime()) / MS_PER_DAY / DAYS_PER_MONTH;
  const total = (windowEnd.getTime() - windowStart.getTime()) / MS_PER_DAY / DAYS_PER_MONTH;
  return Math.min(months, total);
}

export interface SideCheckResult {
  side: 'design' | 'dev';
  roleNames: string[];
  teamSize: number;
  demand: PmInterval;
  supplyPm: number;
  slackPm: number;   // > 0 when supply exceeds even the pessimistic demand
  gapPm: number;     // > 0 when supply falls short of even the optimistic demand
  verdict: Verdict;
}

export interface DeadlineCheckInput {
  projectId: string;
  deadline: string;              // ISO date (yyyy-mm-dd)
  start?: string;                // defaults to today
  conversion: ConversionInput;
}

export interface DeadlineCheckResult {
  window: { start: string; deadline: string; months: number };
  design: SideCheckResult;
  dev: SideCheckResult;
  overall: { verdict: Verdict };
  assumptions: {
    loc_rate_per_pm: number;
    design_share_pct: number;
    deviation_low_pct: number;
    deviation_high_pct: number;
    capacity_note: string;
  };
}

export interface DesignCheckInput {
  projectId: string;
  deadline?: string;               // ISO date; defaults to 设计 phase end date
  start?: string;                  // defaults to today
  estimated_design_pm: number;     // rough design effort in person-months
  deviation_low_pct?: number;      // default 20
  deviation_high_pct?: number;     // default 50
}

export interface DesignDeadlineCheckResult {
  window: { start: string; deadline: string; months: number };
  design: SideCheckResult;
  overall: { verdict: Verdict };
  assumptions: {
    deviation_low_pct: number;
    deviation_high_pct: number;
    capacity_note: string;
  };
}

function judgeSide(demand: PmInterval, supply: number): { verdict: Verdict; slackPm: number; gapPm: number } {
  if (supply >= demand.high) {
    return { verdict: 'feasible', slackPm: supply - demand.high, gapPm: 0 };
  }
  if (supply >= demand.low) {
    return { verdict: 'tight', slackPm: 0, gapPm: 0 };
  }
  return { verdict: 'infeasible', slackPm: 0, gapPm: demand.low - supply };
}

export class EstimationService {
  private db: any;

  constructor(db: any) {
    this.db = db;
  }

  private async fetchTeam(roleNames: string[]): Promise<TeamMember[]> {
    return this.db('people')
      .select('people.id', 'people.name', 'people.default_availability_percentage as availability')
      .join('person_roles as pr', (builder: any) => {
        builder.on('pr.person_id', 'people.id').onVal('pr.is_primary', 1);
      })
      .join('roles as r', 'r.id', 'pr.role_id')
      .where('people.is_active', true)
      .whereIn('r.name', roleNames);
  }

  private async fetchAssignments(personIds: string[]): Promise<ExistingAssignment[]> {
    if (personIds.length === 0) return [];
    return this.db('effective_project_assignments as ea')
      .select(
        'ea.person_id',
        'ea.project_id',
        'ea.allocation_percentage',
        'ea.computed_start_date',
        'ea.computed_end_date'
      )
      .whereIn('ea.person_id', personIds)
      .where((builder: any) => {
        // Same semantics as person_utilization_view: base rows plus active
        // scenario rows only
        builder
          .whereNull('ea.scenario_id')
          .orWhereIn(
            'ea.scenario_id',
            this.db('scenarios').select('id').where('scenarios.status', 'active')
          );
      });
  }

  /**
   * Open pool placeholders for the given roles (any project).
   * Pool demand consumes side capacity exactly like named assignments.
   */
  private async fetchPoolDemands(roleNames: string[]): Promise<PoolDemandRow[]> {
    if (roleNames.length === 0) return [];
    return this.db('project_pool_demands as pmd')
      .join('roles as r', 'pmd.role_id', 'r.id')
      .where('pmd.status', 'open')
      .whereIn('r.name', roleNames)
      .select('pmd.project_id', 'pmd.headcount', 'pmd.start_date', 'pmd.end_date');
  }

  private async checkSide(
    side: 'design' | 'dev',
    roleNames: string[],
    demand: PmInterval,
    windowStart: Date,
    windowEnd: Date,
    months: number,
    projectId: string
  ): Promise<SideCheckResult> {
    const team = await this.fetchTeam(roleNames);
    const assignments = await this.fetchAssignments(team.map((m: TeamMember) => m.id));
    const pools = await this.fetchPoolDemands(roleNames);

    const allocatedByPerson = new Map<string, number>();
    for (const a of assignments) {
      if (a.project_id === projectId) continue; // this project's demand is what we evaluate
      const pm =
        (a.allocation_percentage / 100) *
        overlapMonths(a, windowStart, windowEnd);
      allocatedByPerson.set(a.person_id, (allocatedByPerson.get(a.person_id) ?? 0) + pm);
    }

    let supply = 0;
    for (const member of team) {
      const gross = (member.availability ?? 100) / 100 * months;
      const allocated = allocatedByPerson.get(member.id) ?? 0;
      supply += Math.max(0, gross - allocated);
    }

    // Other projects' open pool placeholders reduce the side's free capacity,
    // symmetric with named assignments. Own project's pools are part of the
    // demand being evaluated, not the supply.
    for (const pool of pools) {
      if (pool.project_id === projectId) continue;
      supply -= pool.headcount * poolOverlapMonths(pool, windowStart, windowEnd);
    }
    supply = Math.max(0, supply);

    const { verdict, slackPm, gapPm } = judgeSide(demand, supply);
    return {
      side,
      roleNames,
      teamSize: team.length,
      demand: { low: round1(demand.low), mid: round1(demand.mid), high: round1(demand.high) },
      supplyPm: round1(supply),
      slackPm: round1(slackPm),
      gapPm: round1(gapPm),
      verdict
    };
  }

  async checkDeadline(input: DeadlineCheckInput): Promise<DeadlineCheckResult> {
    const start = input.start ?? new Date().toISOString().slice(0, 10);
    const months = windowMonths(start, input.deadline);
    if (months > 60) {
      throw new Error('deadline window exceeds 60 months');
    }

    const windowStart = new Date(start);
    const windowEnd = new Date(input.deadline);
    const conversion = { ...DEFAULT_CONVERSION, ...input.conversion };
    const pm = convertToPersonMonths(conversion);

    const [design, dev] = await Promise.all([
      this.checkSide('design', DESIGN_SIDE_ROLES, pm.design, windowStart, windowEnd, months, input.projectId),
      this.checkSide('dev', DEV_SIDE_ROLES, pm.dev, windowStart, windowEnd, months, input.projectId)
    ]);

    const worst = [design, dev].reduce<Verdict>((acc, s) =>
      VERDICT_ORDER[s.verdict] > VERDICT_ORDER[acc] ? s.verdict : acc, 'feasible');

    return {
      window: { start, deadline: input.deadline, months: round1(months) },
      design,
      dev,
      overall: { verdict: worst },
      assumptions: {
        loc_rate_per_pm: conversion.loc_rate_per_pm,
        design_share_pct: conversion.design_share_pct,
        deviation_low_pct: conversion.deviation_low_pct,
        deviation_high_pct: conversion.deviation_high_pct,
        capacity_note:
          'supply = availability - existing allocations in window (incl. reservation buffers and open pool placeholders), this project excluded; 1 PM = 1 FTE for 1 calendar month'
      }
    };
  }

  /**
   * Design deadline = end date of the project's 设计 phase timeline row.
   * Returns null when the project has no design phase (or no dates).
   */
  async getDesignDeadline(projectId: string): Promise<string | null> {
    const row = await this.db('project_phases_timeline as ppt')
      .join('project_phases as pp', 'ppt.phase_id', 'pp.id')
      .where('ppt.project_id', projectId)
      .where('pp.name', '设计')
      .whereNotNull('ppt.end_date')
      .orderBy('ppt.end_date', 'asc')
      .first('ppt.end_date');
    return row?.end_date ?? null;
  }

  async checkDesignDeadline(input: DesignCheckInput): Promise<DesignDeadlineCheckResult> {
    let deadline: string | null | undefined = input.deadline;
    if (!deadline) {
      deadline = await this.getDesignDeadline(input.projectId);
    }
    if (!deadline) {
      throw new Error('deadline is required (body.deadline or a 设计 phase end date)');
    }

    const start = input.start ?? new Date().toISOString().slice(0, 10);
    const months = windowMonths(start, deadline);
    if (months > 60) {
      throw new Error('deadline window exceeds 60 months');
    }

    if (!(input.estimated_design_pm > 0)) {
      throw new Error('estimated_design_pm must be positive');
    }

    const lowFactor = 1 - (input.deviation_low_pct ?? 20) / 100;
    const highFactor = 1 + (input.deviation_high_pct ?? 50) / 100;
    const demand: PmInterval = {
      low: input.estimated_design_pm * lowFactor,
      mid: input.estimated_design_pm,
      high: input.estimated_design_pm * highFactor
    };

    const windowStart = new Date(start);
    const windowEnd = new Date(deadline);
    const design = await this.checkSide(
      'design', DESIGN_SIDE_ROLES, demand, windowStart, windowEnd, months, input.projectId
    );

    return {
      window: { start, deadline, months: round1(months) },
      design,
      overall: { verdict: design.verdict },
      assumptions: {
        deviation_low_pct: input.deviation_low_pct ?? 20,
        deviation_high_pct: input.deviation_high_pct ?? 50,
        capacity_note:
          'design-side supply = SE availability - existing allocations in window (incl. buffers and open pool placeholders), this project excluded'
      }
    };
  }
}
