/**
 * Tests for enum label localization helpers.
 */
import i18n from '../../i18n';
import {
  projectStatusLabel,
  scenarioTypeLabel,
  scenarioStatusLabel,
  enumLabel,
} from '../enum-labels';

const originalLanguage = i18n.language;

describe('enum labels', () => {
  afterEach(() => {
    void i18n.changeLanguage(originalLanguage);
  });

  it('maps known values in Chinese', async () => {
    await i18n.changeLanguage('zh-CN');
    expect(projectStatusLabel('on_hold')).toBe('已暂停');
    expect(scenarioTypeLabel('baseline')).toBe('基线');
    expect(scenarioStatusLabel('archived')).toBe('已归档');
  });

  it('maps known values in English', async () => {
    await i18n.changeLanguage('en-US');
    expect(projectStatusLabel('on_hold')).toBe('On Hold');
    expect(scenarioTypeLabel('baseline')).toBe('Baseline');
  });

  it('falls back to the raw value for unknown enums', async () => {
    await i18n.changeLanguage('zh-CN');
    expect(projectStatusLabel('mysterious_status')).toBe('mysterious_status');
    expect(enumLabel('scenarioType', 'unknown')).toBe('unknown');
  });

  it('returns empty string for nullish input', () => {
    expect(projectStatusLabel(null)).toBe('');
    expect(projectStatusLabel(undefined)).toBe('');
  });
});
