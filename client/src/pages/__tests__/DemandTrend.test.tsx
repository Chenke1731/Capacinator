import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import { DemandReport } from '../../components/reports/DemandReport';
import { buildDemandTrend } from '../ReportsTabContent';

/**
 * IP-02e / U10: 无时间数据不得伪造趋势。
 * 旧实现两处捏造:0 点时造"当前/下月×0.95/三月×0.90"假衰减曲线;
 * 1 点时把总量均摊到整个查询区间。真实点有多少显示多少,0 点=无法生成。
 */
jest.mock('../../contexts/ScenarioContext', () => ({
  useScenario: () => ({ currentScenario: null, scenarios: [] })
}));

const fmt = (m: string) => m;

describe('buildDemandTrend (U10)', () => {
  test('0 个时间点 → 空趋势(不再造 95%/90% 假曲线)', () => {
    const r = buildDemandTrend([], 500, { startDate: '2026-01-01', endDate: '2026-06-30' }, fmt);
    expect(r.trendOverTime).toEqual([]);
    expect(r.peakMonth).toBeNull();
  });

  test('1 个时间点 → 原样保留(不均摊到整个区间)', () => {
    const r = buildDemandTrend(
      [{ month: '2026-03', total_hours: 480 }],
      480,
      { startDate: '2026-01-01', endDate: '2026-06-30' },
      fmt
    );
    expect(r.trendOverTime).toEqual([{ month: '2026-03', total_hours: 480 }]);
    expect(r.peakMonth).toBe('2026-03');
  });

  test('多点 → 峰值取真实最大月', () => {
    const r = buildDemandTrend(
      [
        { month: '2026-01', total_hours: 100 },
        { month: '2026-02', total_hours: 300 },
        { month: '2026-03', total_hours: 200 }
      ],
      600,
      {},
      fmt
    );
    expect(r.peakMonth).toBe('2026-02');
  });
});

describe('DemandReport 空趋势态 (U10)', () => {
  test('趋势为空时显示"无法生成"而非空白图', () => {
    render(
      <MemoryRouter>
        <DemandReport
          data={{ byProject: [], byRole: [], trendOverTime: [] }}
          filters={{ startDate: '', endDate: '' }}
          CustomTooltip={() => <div />}
        />
      </MemoryRouter>
    );
    expect(screen.getByText(/No timeline data/i)).toBeInTheDocument();
  });
});
