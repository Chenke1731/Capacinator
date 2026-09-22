import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { enUS, zhCN, type Locale } from 'date-fns/locale';

import commonEn from './locales/en-US/common.json';
import navigationEn from './locales/en-US/navigation.json';
import authEn from './locales/en-US/auth.json';
import enumsEn from './locales/en-US/enums.json';
import errorsEn from './locales/en-US/errors.json';
import validationEn from './locales/en-US/validation.json';
import settingsEn from './locales/en-US/settings.json';
import dashboardEn from './locales/en-US/dashboard.json';
import projectsEn from './locales/en-US/projects.json';
import iterationsEn from './locales/en-US/iterations.json';
import peopleEn from './locales/en-US/people.json';
import assignmentsEn from './locales/en-US/assignments.json';
import scenariosEn from './locales/en-US/scenarios.json';
import reportsEn from './locales/en-US/reports.json';
import importExportEn from './locales/en-US/importExport.json';
import locationsEn from './locales/en-US/locations.json';
import auditLogEn from './locales/en-US/auditLog.json';
import phasesEn from './locales/en-US/phases.json';
import rolesEn from './locales/en-US/roles.json';
import gitSyncEn from './locales/en-US/gitSync.json';

import commonZh from './locales/zh-CN/common.json';
import navigationZh from './locales/zh-CN/navigation.json';
import authZh from './locales/zh-CN/auth.json';
import enumsZh from './locales/zh-CN/enums.json';
import errorsZh from './locales/zh-CN/errors.json';
import validationZh from './locales/zh-CN/validation.json';
import settingsZh from './locales/zh-CN/settings.json';
import dashboardZh from './locales/zh-CN/dashboard.json';
import projectsZh from './locales/zh-CN/projects.json';
import iterationsZh from './locales/zh-CN/iterations.json';
import peopleZh from './locales/zh-CN/people.json';
import assignmentsZh from './locales/zh-CN/assignments.json';
import scenariosZh from './locales/zh-CN/scenarios.json';
import reportsZh from './locales/zh-CN/reports.json';
import importExportZh from './locales/zh-CN/importExport.json';
import locationsZh from './locales/zh-CN/locations.json';
import auditLogZh from './locales/zh-CN/auditLog.json';
import phasesZh from './locales/zh-CN/phases.json';
import rolesZh from './locales/zh-CN/roles.json';
import gitSyncZh from './locales/zh-CN/gitSync.json';

export const LANGUAGE_STORAGE_KEY = 'capacinator-language';

export const LANGUAGES = [
  { code: 'zh-CN', label: '中文' },
  { code: 'en-US', label: 'English' },
] as const;

export type AppLanguage = (typeof LANGUAGES)[number]['code'];

export const NAMESPACES = [
  'common',
  'navigation',
  'auth',
  'enums',
  'errors',
  'validation',
  'settings',
  'dashboard',
  'projects',
  'iterations',
  'people',
  'assignments',
  'scenarios',
  'reports',
  'importExport',
  'locations',
  'auditLog',
  'phases',
  'roles',
  'gitSync',
] as const;

const enResources = {
  common: commonEn,
  navigation: navigationEn,
  auth: authEn,
  enums: enumsEn,
  errors: errorsEn,
  validation: validationEn,
  settings: settingsEn,
  dashboard: dashboardEn,
  projects: projectsEn,
  iterations: iterationsEn,
  people: peopleEn,
  assignments: assignmentsEn,
  scenarios: scenariosEn,
  reports: reportsEn,
  importExport: importExportEn,
  locations: locationsEn,
  auditLog: auditLogEn,
  phases: phasesEn,
  roles: rolesEn,
  gitSync: gitSyncEn,
};

const zhResources = {
  common: commonZh,
  navigation: navigationZh,
  auth: authZh,
  enums: enumsZh,
  errors: errorsZh,
  validation: validationZh,
  settings: settingsZh,
  dashboard: dashboardZh,
  projects: projectsZh,
  iterations: iterationsZh,
  people: peopleZh,
  assignments: assignmentsZh,
  scenarios: scenariosZh,
  reports: reportsZh,
  importExport: importExportZh,
  locations: locationsZh,
  auditLog: auditLogZh,
  phases: phasesZh,
  roles: rolesZh,
  gitSync: gitSyncZh,
};

const resources = {
  'en-US': enResources,
  'zh-CN': zhResources,
};

const isAppLanguage = (value: string): value is AppLanguage =>
  LANGUAGES.some((lang) => lang.code === value);

/**
 * Detection order: explicitly saved preference → browser language → English.
 * Browsers/tests reporting a non-Chinese locale (e.g. jsdom's en-US) resolve to
 * English so that existing English-text assertions keep working.
 */
export function detectInitialLanguage(): AppLanguage {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored && isAppLanguage(stored)) {
      return stored;
    }
  } catch {
    // localStorage unavailable (SSR / restricted environment) — fall through
  }

  const browserLanguage =
    typeof navigator !== 'undefined' ? navigator.language : '';
  return browserLanguage && browserLanguage.toLowerCase().startsWith('zh')
    ? 'zh-CN'
    : 'en-US';
}

void i18n.use(initReactI18next).init({
  resources,
  lng: detectInitialLanguage(),
  fallbackLng: 'en-US',
  supportedLngs: LANGUAGES.map((lang) => lang.code),
  defaultNS: 'common',
  ns: [...NAMESPACES],
  interpolation: {
    // React already escapes rendered strings
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
  returnNull: false,
});

// Keep <html lang> in sync so browsers, screen readers and font selection follow the UI language
i18n.on('languageChanged', (lng) => {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lng;
  }
});

if (typeof document !== 'undefined') {
  document.documentElement.lang = i18n.language;
}

/** BCP-47 locale matching the active UI language, for Intl/date formatting. */
export function getLocale(): 'zh-CN' | 'en-US' {
  return i18n.language?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
}

/** date-fns locale object for the active UI language. */
export function getDateFnsLocale(): Locale {
  return getLocale() === 'zh-CN' ? zhCN : enUS;
}

export function persistLanguage(language: AppLanguage): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // ignore storage failures — switching still works for the session
  }
}

export default i18n;
