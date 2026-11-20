/**
 * Single compatibility boundary for legacy list payloads.
 *
 * New endpoints return `{ data: [...] }`. A few untouched endpoints still
 * return a bare array; keeping that tolerance here means page code never grows
 * another `Array.isArray(payload) ? payload : payload?.data` branch.
 */
export function asList<T = any>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object') {
    const data = (payload as { data?: unknown }).data;
    if (Array.isArray(data)) return data as T[];
  }
  return [];
}
