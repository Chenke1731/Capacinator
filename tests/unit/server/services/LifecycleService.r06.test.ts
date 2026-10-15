import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { LifecycleService } from '../../../../src/server/services/lifecycle/LifecycleService';

/**
 * IP-02d / R06: SE 赶不上告警不得因未声明的 62 天截断误报。
 * 冻结今天 2026-10-14,开工 2027-03-01,SE 粗估 2.2、占用 100%——
 * 完整窗口(仅剔除周末)约 4.5 工作月,2.2 人月完全来得及。
 * 旧实现把倒计时截为 62 天再 /7*5 统计换算 → 2.04 月 < 2.2 误报。
 */
describe('computeWarningsForProject SE_WONT_MAKE_IT (R06)', () => {
  let service: LifecycleService;

  beforeAll(() => {
    service = new LifecycleService(null as any);
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-14T08:00:00'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  const check = (sePm: number, sePct: number) =>
    service.computeWarningsForProject(
      {
        id: 'p1', lifecycle_state: 'designing',
        iter_start_date: '2027-03-01',
        se_estimate_pm: sePm, se_pct: sePct
      },
      new Map([['p1', { hasDesignEstimate: true }]])
    );

  test('R06: 完整窗口 4.5 工作月,2.2 人月不误报(62 天截断废除)', () => {
    const warnings = check(2.2, 100);
    expect(warnings).not.toContain('SE_WONT_MAKE_IT');
  });

  test('守卫: 真超容量仍要报(6 人月 > 4.5 工作月)', () => {
    const warnings = check(6, 100);
    expect(warnings).toContain('SE_WONT_MAKE_IT');
  });

  test('占用比例参与容量: 50% 占用时 2.3 人月超 4.5×0.5 报警', () => {
    const warnings = check(2.3, 50);
    expect(warnings).toContain('SE_WONT_MAKE_IT');
  });

  test('已开工(开工日在今天之前)不报倒计时告警', () => {
    const warnings = service.computeWarningsForProject(
      {
        id: 'p2', lifecycle_state: 'designing',
        iter_start_date: '2026-10-01',
        se_estimate_pm: 5, se_pct: 100
      },
      new Map([['p2', { hasDesignEstimate: true }]])
    );
    expect(warnings).not.toContain('SE_WONT_MAKE_IT');
  });
});
