import { storedDateToIso, toIsoDateString } from '../../../../src/server/utils/isoDate';

describe('isoDate utils', () => {
  describe('storedDateToIso(2026-10-13 导出归一)', () => {
    it('日期串原样返回(恒等,不进 Date 解析)', () => {
      expect(storedDateToIso('2026-03-15')).toBe('2026-03-15');
    });

    it('带 Z 时区标记的完整串取 UTC 日历日(写入即 UTC 序列化,UTC 部件即本意)', () => {
      expect(storedDateToIso('2026-03-15T22:30:00.000Z')).toBe('2026-03-15');
      expect(storedDateToIso('2026-03-16T04:30:00+08:00')).toBe('2026-03-15');
    });

    it('无时区的 naive 日期时间取本地日历日(本地写入语义,不再经 UTC 漂移)', () => {
      // UTC+8 环境下 05:00 naive 若走 UTC 切片会退前一天;本地部件恒为当日
      expect(storedDateToIso('2026-03-15T05:00:00')).toBe('2026-03-15');
      expect(storedDateToIso('2026-03-15T23:00:00')).toBe('2026-03-15');
    });

    it('解析不动的值原样交还,不制造新垃圾', () => {
      expect(storedDateToIso('not-a-date')).toBe('not-a-date');
    });
  });

  describe('toIsoDateString', () => {
    it('UTC 部件格式化', () => {
      expect(toIsoDateString(new Date(Date.UTC(2026, 2, 5)))).toBe('2026-03-05');
    });
  });
});
