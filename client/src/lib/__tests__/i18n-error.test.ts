/**
 * Tests for server error message translation.
 */
import i18n from '../../i18n';
import {
  translateServerMessage,
  translateAxiosMessage,
} from '../i18n-error';

const originalLanguage = i18n.language;

describe('translateServerMessage', () => {
  afterEach(() => {
    void i18n.changeLanguage(originalLanguage);
  });

  it('passes messages through unchanged in English', async () => {
    await i18n.changeLanguage('en-US');
    expect(translateServerMessage('Authentication required')).toBe(
      'Authentication required'
    );
    expect(translateServerMessage('Project with ID 42 not found')).toBe(
      'Project with ID 42 not found'
    );
  });

  it('translates exact matches in Chinese', async () => {
    await i18n.changeLanguage('zh-CN');
    expect(translateServerMessage('Authentication required')).toBe('请先登录');
    expect(translateServerMessage('Internal server error')).toBe('服务器内部错误');
  });

  it('translates templated "not found" messages with localized resource names', async () => {
    await i18n.changeLanguage('zh-CN');
    expect(translateServerMessage('Project with ID 42 not found')).toBe(
      '未找到 ID 为 42 的项目'
    );
    expect(translateServerMessage('Person not found')).toBe('人员不存在');
  });

  it('prefixes unknown messages with a localized failure notice', async () => {
    await i18n.changeLanguage('zh-CN');
    expect(translateServerMessage('Something totally unexpected')).toBe(
      '操作失败:Something totally unexpected'
    );
  });

  it('returns a generic message for empty input', async () => {
    await i18n.changeLanguage('zh-CN');
    expect(translateServerMessage(undefined)).toBe('发生意外错误');
    expect(translateServerMessage('')).toBe('发生意外错误');
  });
});

describe('translateAxiosMessage', () => {
  afterEach(() => {
    void i18n.changeLanguage(originalLanguage);
  });

  it('passes through in English', async () => {
    await i18n.changeLanguage('en-US');
    expect(translateAxiosMessage('Network Error')).toBe('Network Error');
  });

  it('translates network errors in Chinese', async () => {
    await i18n.changeLanguage('zh-CN');
    expect(translateAxiosMessage('Network Error')).toBe(
      '网络错误,请检查网络连接后重试。'
    );
    expect(translateAxiosMessage('timeout of 30000ms exceeded')).toBe(
      '网络错误,请检查网络连接后重试。'
    );
  });
});
