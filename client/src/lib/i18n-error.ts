import i18n, { getLocale } from '../i18n';

/**
 * Translates server-side English error messages into the active UI language.
 * The backend returns plain English strings in `response.data.error`; this
 * module maps the high-frequency ones (plus templated patterns) to dictionary
 * keys so the UI can show localized messages without touching the server.
 *
 * English UI: messages pass through unchanged.
 * Chinese UI: known messages are translated; unknown ones get a localized
 * prefix followed by the original English text.
 */

interface ExactEntry {
  en: string;
  key: string;
}

interface PatternEntry {
  pattern: RegExp;
  key: string;
  /** Maps regex capture groups to interpolation variables. */
  vars?: (match: RegExpMatchArray) => Record<string, string>;
}

const EXACT_ENTRIES: ExactEntry[] = [
  { en: 'Authentication required', key: 'errors:messages.authenticationRequired' },
  { en: 'Forbidden', key: 'errors:messages.forbidden' },
  { en: 'Insufficient permissions', key: 'errors:messages.insufficientPermissions' },
  { en: 'System admin access required', key: 'errors:messages.systemAdminRequired' },
  { en: 'Login failed', key: 'errors:messages.loginFailed' },
  { en: 'Token refresh failed', key: 'errors:messages.tokenRefreshFailed' },
  { en: 'Internal server error', key: 'errors:messages.internalServerError' },
  { en: 'Validation failed', key: 'errors:messages.validationFailed' },
  { en: 'Bad Request', key: 'errors:messages.badRequest' },
  { en: 'Unauthorized', key: 'errors:messages.unauthorizedShort' },
  { en: 'Not Found', key: 'errors:messages.notFoundShort' },
  { en: 'No file uploaded', key: 'errors:messages.noFileUploaded' },
  { en: 'Please select an Excel file to upload', key: 'errors:messages.selectExcelFile' },
  { en: 'File must be an Excel file (.xlsx or .xls)', key: 'errors:messages.excelFileType' },
  { en: 'Excel import completed successfully', key: 'errors:messages.excelImportSuccess' },
  { en: 'Excel import completed with errors', key: 'errors:messages.excelImportWithErrors' },
  { en: 'Excel import failed', key: 'errors:messages.excelImportFailed' },
  { en: 'Failed to get import settings', key: 'errors:messages.getImportSettingsFailed' },
  { en: 'Invalid updates array provided', key: 'errors:messages.invalidUpdatesArray' },
  { en: 'Phase name is required', key: 'errors:messages.phaseNameRequired' },
  {
    en: 'Missing required fields: project_id, person_id, and role_id are required',
    key: 'errors:messages.missingAssignmentFields',
  },
  { en: 'Allocation percentage must be positive', key: 'errors:messages.allocationPositive' },
  { en: 'Allocation percentage cannot exceed 200%', key: 'errors:messages.allocationMaxExceeded' },
  {
    en: 'Invalid assignment_date_mode. Must be one of: fixed, project, phase',
    key: 'errors:messages.invalidAssignmentDateMode',
  },
  { en: 'Start date must be before or equal to end date', key: 'errors:messages.startBeforeEnd' },
  { en: 'Assignment deleted successfully', key: 'errors:messages.assignmentDeleted' },
  { en: 'Person ID is required', key: 'errors:messages.personIdRequired' },
];

/** Server resource names appearing in "<Resource> not found" messages. */
const RESOURCE_KEYS: Record<string, string> = {
  project: 'enums:resources.project',
  projects: 'enums:resources.project',
  person: 'enums:resources.person',
  people: 'enums:resources.person',
  role: 'enums:resources.role',
  location: 'enums:resources.location',
  'project type': 'enums:resources.projectType',
  'project type with': 'enums:resources.projectType',
  scenario: 'enums:resources.scenario',
  assignment: 'enums:resources.assignment',
  phase: 'enums:resources.phase',
  resource: 'enums:resources.resource',
  user: 'enums:resources.user',
};

function translateResourceTerm(term: string): string {
  const normalized = term.trim().toLowerCase().replace(/_/g, ' ');
  const key = RESOURCE_KEYS[normalized];
  return key ? i18n.t(key) : term;
}

const PATTERN_ENTRIES: PatternEntry[] = [
  {
    // e.g. "Project type with ID 5 not found", "Person not found"
    pattern: /^(.+?)\s+with ID\s+(\d+)\s+not found$/i,
    key: 'errors:patterns.withIdNotFound',
    vars: (m) => ({ resource: translateResourceTerm(m[1] ?? ''), id: m[2] ?? '' }),
  },
  {
    pattern: /^(.+?)\s+not found$/i,
    key: 'errors:patterns.resourceNotFound',
    vars: (m) => ({ resource: translateResourceTerm(m[1] ?? '') }),
  },
];

const EXACT_MAP = new Map(EXACT_ENTRIES.map((entry) => [entry.en.toLowerCase(), entry.key]));

export function translateServerMessage(message: string | null | undefined): string {
  const trimmed = typeof message === 'string' ? message.trim() : '';
  if (!trimmed) {
    return i18n.t('common:unknownError');
  }

  // English UI: identity — server strings are already English
  if (getLocale() === 'en-US') {
    return trimmed;
  }

  const exactKey = EXACT_MAP.get(trimmed.toLowerCase());
  if (exactKey) {
    return i18n.t(exactKey);
  }

  for (const entry of PATTERN_ENTRIES) {
    const match = trimmed.match(entry.pattern);
    if (match) {
      return i18n.t(entry.key, entry.vars ? entry.vars(match) : undefined);
    }
  }

  // Unmapped message: localize the prefix, keep the original text for diagnosis
  return `${i18n.t('errors:fallbackPrefix')}:${trimmed}`;
}

/** Translates axios-level generic messages that never reach response.data. */
export function translateAxiosMessage(message: string | null | undefined): string {
  const trimmed = typeof message === 'string' ? message.trim() : '';
  if (!trimmed) {
    return i18n.t('common:unknownError');
  }
  if (getLocale() === 'en-US') {
    return trimmed;
  }
  if (/^network error$/i.test(trimmed)) {
    return i18n.t('errors:generic.networkError');
  }
  if (/^timeout of \d+ms exceeded$/i.test(trimmed)) {
    return i18n.t('errors:generic.networkError');
  }
  if (/^request failed with status code \d+$/i.test(trimmed)) {
    return i18n.t('errors:generic.requestFailed');
  }
  return trimmed;
}
