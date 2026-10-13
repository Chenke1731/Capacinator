import { useMemo } from 'react';

/**
 * Chart data point interface for demand/capacity/gaps visualization
 */
export interface ChartDataPoint {
  date: string;
  timestamp: number;
  granularity?: string;
  [roleName: string]: string | number | undefined;
}

/**
 * Phase information for timeline overlay
 */
export interface PhaseInfo {
  id: string;
  phase_name: string;
  start_date: string;
  end_date: string;
  phase_order: number;
}

/**
 * API response structure for project demands
 */
export interface DemandApiResponse {
  /* 对齐服务端 /projects/:id/demands 真身(ProjectDemandsResponse):
     demands 是 role×phase 聚合行,日期窗可选——缺窗行不进逐日曲线 */
  phases: Array<{
    phase_id: string;
    phase_name: string;
    start_date: string;
    end_date: string;
    phase_order: number;
  }>;
  demands: Array<{
    role_name: string;
    role_id?: string;
    demand_hours?: number;
    demand_fte?: number;
    phase_id?: string;
    phase_name?: string;
    start_date?: string;
    end_date?: string;
    allocation_percentage?: number;
  }>;
}

/**
 * Assignment data structure
 */
export interface AssignmentData {
  role_name: string;
  start_date: string;
  end_date: string;
  computed_start_date?: string;
  computed_end_date?: string;
  allocation_percentage: number;
}

/**
 * Date range for chart boundaries
 */
export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Result from useProjectDemandData hook
 */
export interface ProjectDemandDataResult {
  demandData: ChartDataPoint[];
  capacityData: ChartDataPoint[];
  gapsData: ChartDataPoint[];
  phases: PhaseInfo[];
  dateRange: DateRange;
  allRoles: string[];
}

/**
 * Props for useProjectDemandData hook
 */
export interface UseProjectDemandDataProps {
  apiResponse: DemandApiResponse | null | undefined;
  assignmentsResponse: { data: AssignmentData[] } | null | undefined;
}

/**
 * Creates an empty timeline structure for the given date range
 */
function createEmptyTimeline(minDate: Date, maxDate: Date): Record<string, ChartDataPoint> {
  const timeline: Record<string, ChartDataPoint> = {};
  const currentDate = new Date(minDate);
  const maxDatePlusOne = new Date(maxDate);
  maxDatePlusOne.setDate(maxDatePlusOne.getDate() + 1);

  while (currentDate < maxDatePlusOne) {
    const dateKey = currentDate.toISOString().split('T')[0];
    timeline[dateKey] = {
      date: dateKey,
      timestamp: currentDate.getTime()
    };
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return timeline;
}

/**
 * Hook to process raw API data into chart-ready demand, capacity, and gaps data.
 * Handles:
 * - Demand data calculation (from API response)
 * - Capacity data calculation (from assignments)
 * - Gaps data calculation (demand - capacity)
 * - Date range computation
 * - Phase information extraction
 */
export function useProjectDemandData({
  apiResponse,
  assignmentsResponse
}: UseProjectDemandDataProps): ProjectDemandDataResult {
  return useMemo(() => {
    // Default empty result
    const emptyResult: ProjectDemandDataResult = {
      demandData: [],
      capacityData: [],
      gapsData: [],
      phases: [],
      dateRange: { start: new Date(), end: new Date() },
      allRoles: []
    };

    if (!apiResponse || !apiResponse.phases || !Array.isArray(apiResponse.phases)) {
      return emptyResult;
    }

    // Extract phase information for the roadmap overlay
    const phases: PhaseInfo[] = apiResponse.phases.map((phase) => ({
      id: phase.phase_id,
      phase_name: phase.phase_name,
      start_date: phase.start_date,
      end_date: phase.end_date,
      phase_order: phase.phase_order
    })).sort((a, b) => a.phase_order - b.phase_order);

    // Find the overall date range for the project - consider both phases AND demands/assignments
    const allDates = phases.flatMap(p => [new Date(p.start_date), new Date(p.end_date)]);

    // Also include dates from demands and assignments to ensure full coverage
    const demandDates = apiResponse.demands.flatMap(d => d.start_date && d.end_date ? [new Date(d.start_date), new Date(d.end_date)] : []);
    const assignmentDates = assignmentsResponse?.data ?
      assignmentsResponse.data.flatMap(a => [
        new Date(a.computed_start_date || a.start_date),
        new Date(a.computed_end_date || a.end_date)
      ]) : [];

    const allProjectDates = [...allDates, ...demandDates, ...assignmentDates];

    // Guard against empty date arrays
    if (allProjectDates.length === 0) {
      return emptyResult;
    }

    const minDate = new Date(Math.min(...allProjectDates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...allProjectDates.map(d => d.getTime())));

    // 1. DEMAND DATA - convert allocation percentages to FTE
    const demandTimeline = createEmptyTimeline(minDate, maxDate);
    apiResponse.demands.forEach((demand) => {
      if (!demand.start_date || !demand.end_date) return; // 聚合行无日窗,不进逐日曲线
      const phaseStart = new Date(demand.start_date);
      const phaseEnd = new Date(demand.end_date);
      const roleName = demand.role_name;
      const allocation = demand.allocation_percentage || 0;

      const currentDay = new Date(phaseStart);
      while (currentDay <= phaseEnd) {
        const dayKey = currentDay.toISOString().split('T')[0];
        if (demandTimeline[dayKey]) {
          if (!demandTimeline[dayKey][roleName]) {
            demandTimeline[dayKey][roleName] = 0;
          }
          (demandTimeline[dayKey][roleName] as number) += allocation / 100; // Convert percentage to FTE
        }
        currentDay.setDate(currentDay.getDate() + 1);
      }
    });

    // Get unique roles from demands
    const uniqueRoles = [...new Set(apiResponse.demands.map((d) => d.role_name))];

    // 2. CAPACITY DATA - calculate from project assignments
    const capacityTimeline = createEmptyTimeline(minDate, maxDate);

    // Calculate capacity from people assigned to this specific project
    if (assignmentsResponse?.data && assignmentsResponse.data.length > 0) {
      assignmentsResponse.data.forEach((assignment) => {
        const assignmentStart = new Date(assignment.computed_start_date || assignment.start_date);
        const assignmentEnd = new Date(assignment.computed_end_date || assignment.end_date);
        const roleName = assignment.role_name;
        const allocationPercentage = assignment.allocation_percentage || 0;

        // Only include if role is relevant to demand data
        if (roleName && uniqueRoles.includes(roleName)) {
          // Apply allocation across assignment date range
          const currentDay = new Date(assignmentStart);
          while (currentDay <= assignmentEnd) {
            const dayKey = currentDay.toISOString().split('T')[0];
            if (capacityTimeline[dayKey]) {
              if (!capacityTimeline[dayKey][roleName]) {
                capacityTimeline[dayKey][roleName] = 0;
              }
              // Add this person's allocation as FTE to the role's total capacity for this day
              (capacityTimeline[dayKey][roleName] as number) += allocationPercentage / 100;
            }
            currentDay.setDate(currentDay.getDate() + 1);
          }
        }
      });
    } else {
      // No assignments found - show zero capacity for all roles
      Object.keys(capacityTimeline).forEach(dateKey => {
        uniqueRoles.forEach(roleName => {
          capacityTimeline[dateKey][roleName] = 0;
        });
      });
    }

    // 3. GAPS DATA - demand minus capacity (shortfalls)
    const gapsTimeline = createEmptyTimeline(minDate, maxDate);
    Object.keys(gapsTimeline).forEach(dateKey => {
      const demandDay = demandTimeline[dateKey];
      const capacityDay = capacityTimeline[dateKey];

      // Calculate gaps for each role that has demand
      uniqueRoles.forEach(roleName => {
        const demand = (demandDay[roleName] as number) || 0;
        const capacity = (capacityDay[roleName] as number) || 0;
        const gap = demand - capacity;

        // Only show shortfalls (positive gaps) where demand exceeds capacity
        if (gap > 0) {
          gapsTimeline[dateKey][roleName] = gap;
        }
      });
    });

    // Convert to arrays and sort by date
    const demandData = Object.values(demandTimeline).sort((a, b) => a.timestamp - b.timestamp);
    const capacityData = Object.values(capacityTimeline).sort((a, b) => a.timestamp - b.timestamp);
    const gapsData = Object.values(gapsTimeline).sort((a, b) => a.timestamp - b.timestamp);

    // Get all roles from demand data
    const allRoles = [...new Set(demandData.flatMap(d =>
      Object.keys(d).filter(key => !['date', 'timestamp', 'granularity'].includes(key))
    ))];

    return {
      demandData,
      capacityData,
      gapsData,
      phases,
      dateRange: { start: minDate, end: maxDate },
      allRoles
    };
  }, [apiResponse, assignmentsResponse]);
}

export default useProjectDemandData;
