import { toISODateString } from './dateUtils';
/**
 * Phase Duration Utilities
 *
 * Calculates default durations for different phase types based on naming conventions.
 * Extracted from SmartAssignmentModal to improve testability.
 */

/**
 * Calculates the recommended duration in weeks for a given phase
 * based on its name/type.
 *
 * @param phaseName - The name of the phase (case-insensitive)
 * @returns Duration in weeks
 *
 * @example
 * calculatePhaseDurationWeeks("Planning Phase") // returns 2
 * calculatePhaseDurationWeeks("Development") // returns 8
 * calculatePhaseDurationWeeks("Testing") // returns 3
 */
export function calculatePhaseDurationWeeks(phaseName: string): number {
  const normalizedName = (phaseName || '').toLowerCase();

  if (normalizedName.includes('planning') || normalizedName.includes('pending')) {
    return 2;
  }

  if (normalizedName.includes('development')) {
    return 8;
  }

  if (normalizedName.includes('testing')) {
    return 3;
  }

  if (normalizedName.includes('cutover') || normalizedName.includes('hypercare')) {
    return 2;
  }

  // Default duration for unrecognized phase types
  return 4;
}

/**
 * Calculates start and end dates for a phase assignment starting today.
 *
 * @param phaseName - The name of the phase to calculate duration for
 * @param startDate - Optional custom start date (defaults to today)
 * @returns Object containing startDate and endDate as ISO strings (YYYY-MM-DD)
 *
 * @example
 * calculatePhaseDates("Development Phase")
 * // returns { startDate: "2025-10-17", endDate: "2025-12-12" } (8 weeks from today)
 */
export function calculatePhaseDates(
  phaseName: string,
  startDate?: Date
): { startDate: string; endDate: string } {
  const start = startDate || new Date();
  const end = new Date(start);

  const durationWeeks = calculatePhaseDurationWeeks(phaseName);
  end.setDate(end.getDate() + (durationWeeks * 7));

  return {
    startDate: toISODateString(start),
    endDate: toISODateString(end)
  };
}
