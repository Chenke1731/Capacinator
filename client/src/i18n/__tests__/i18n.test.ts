/**
 * Tests for i18n infrastructure: language detection, persistence and locale helpers.
 */
import i18n, {
  detectInitialLanguage,
  getLocale,
  persistLanguage,
  LANGUAGE_STORAGE_KEY,
} from '../index';

const originalLanguage = i18n.language;

describe('i18n infrastructure', () => {
  afterEach(() => {
    window.localStorage.clear();
    void i18n.changeLanguage(originalLanguage);
  });

  describe('detectInitialLanguage', () => {
    it('returns the stored preference when valid', () => {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh-CN');
      expect(detectInitialLanguage()).toBe('zh-CN');
    });

    it('ignores unsupported stored values', () => {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'fr-FR');
      expect(['zh-CN', 'en-US']).toContain(detectInitialLanguage());
    });

    it('resolves non-Chinese browser locale to English', () => {
      // jsdom defaults navigator.language to en-US
      window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
      expect(detectInitialLanguage()).toBe('en-US');
    });
  });

  describe('getLocale', () => {
    it('follows the active language', async () => {
      await i18n.changeLanguage('zh-CN');
      expect(getLocale()).toBe('zh-CN');
      expect(i18n.t('common:save')).toBe('保存');

      await i18n.changeLanguage('en-US');
      expect(getLocale()).toBe('en-US');
      expect(i18n.t('common:save')).toBe('Save');
    });
  });

  describe('persistLanguage', () => {
    it('writes the preference to localStorage', () => {
      persistLanguage('zh-CN');
      expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('zh-CN');
    });
  });

  describe('navigation dictionary', () => {
    it('translates navigation labels in both languages', async () => {
      await i18n.changeLanguage('zh-CN');
      expect(i18n.t('navigation:dashboard')).toBe('仪表盘');
      expect(i18n.t('navigation:settings')).toBe('设置');

      await i18n.changeLanguage('en-US');
      expect(i18n.t('navigation:dashboard')).toBe('Dashboard');
    });
  });

  describe('document lang attribute', () => {
    it('updates <html lang> when the language changes', async () => {
      await i18n.changeLanguage('zh-CN');
      expect(document.documentElement.lang).toBe('zh-CN');

      await i18n.changeLanguage('en-US');
      expect(document.documentElement.lang).toBe('en-US');
    });
  });
});
