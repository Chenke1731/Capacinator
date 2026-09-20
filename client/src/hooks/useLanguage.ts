import { useCallback, useEffect, useState } from 'react';
import i18n, {
  LANGUAGES,
  persistLanguage,
  type AppLanguage,
} from '../i18n';

export interface UseLanguageResult {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  languages: typeof LANGUAGES;
}

/**
 * Read/write access to the active UI language.
 * Unlike ThemeContext, the preference is read back from localStorage on load
 * (handled by i18n detection) so it survives page reloads.
 */
export function useLanguage(): UseLanguageResult {
  const [language, setLanguageState] = useState<AppLanguage>(() =>
    i18n.language?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
  );

  useEffect(() => {
    const handleLanguageChanged = (lng: string) => {
      setLanguageState(lng.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US');
    };
    i18n.on('languageChanged', handleLanguageChanged);
    return () => {
      i18n.off('languageChanged', handleLanguageChanged);
    };
  }, []);

  const setLanguage = useCallback((next: AppLanguage) => {
    persistLanguage(next);
    void i18n.changeLanguage(next);
  }, []);

  return { language, setLanguage, languages: LANGUAGES };
}
