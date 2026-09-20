import i18n from '../i18n';

/**
 * Server enums are stored as stable English identifiers (e.g. 'on_hold',
 * 'baseline', 'OVER_ALLOCATED') and rendered in several places. These helpers
 * map them to localized labels, falling back to the raw value when unknown.
 */

const ENUM_GROUPS = {
  projectStatus: 'enums:projectStatus',
  scenarioType: 'enums:scenarioType',
  scenarioStatus: 'enums:scenarioStatus',
  allocationStatus: 'enums:allocationStatus',
  capacityHealth: 'enums:capacityHealth',
  healthStatus: 'enums:healthStatus',
} as const;

export type EnumGroup = keyof typeof ENUM_GROUPS;

export function enumLabel(
  group: EnumGroup,
  value: string | null | undefined
): string {
  if (!value) return '';
  const key = `${ENUM_GROUPS[group]}.${value}`;
  return i18n.exists(key) ? i18n.t(key) : value;
}

export const projectStatusLabel = (value: string | null | undefined) =>
  enumLabel('projectStatus', value);

export const scenarioTypeLabel = (value: string | null | undefined) =>
  enumLabel('scenarioType', value);

export const scenarioStatusLabel = (value: string | null | undefined) =>
  enumLabel('scenarioStatus', value);

export const allocationStatusLabel = (value: string | null | undefined) =>
  enumLabel('allocationStatus', value);

export const capacityHealthLabel = (value: string | null | undefined) =>
  enumLabel('capacityHealth', value);

export const healthStatusLabel = (value: string | null | undefined) =>
  enumLabel('healthStatus', value);
