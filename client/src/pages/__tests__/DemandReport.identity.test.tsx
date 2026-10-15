import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import { DemandReport } from '../../components/reports/DemandReport';
import { toDemandByProject } from '../ReportsTabContent';

/**
 * IP-06a/U04: 总需求→项目图表/表格/详情同一模型贯通。
 * 旧变换 `.map(({project: name, demand}))` 丢 id 且把 name 改键——
 * 图表 dataKey="name" 落空、项目名列空、详情链指向 /projects/undefined。
 */
jest.mock('../../contexts/ScenarioContext', () => ({
  useScenario: () => ({ currentScenario: null, scenarios: [] })
}));

describe('toDemandByProject (U04)', () => {
  test('id/name/demand 全量保留并按需求降序取前 10', () => {
    const rows = [
      { id: 'p1', name: '事项A', demand: 30 },
      { id: 'p2', name: '事项B', demand: 80 },
      { id: 'p3', name: '事项C', demand: 50 }
    ];
    const out = toDemandByProject(rows);
    expect(out[0]).toEqual({ id: 'p2', name: '事项B', project: '事项B', demand: 80 });
    expect(out[1].id).toBe('p3');
    expect(out[2].id).toBe('p1');
    expect(out.length).toBe(3);
  });

  test('超过 10 条只取前 10', () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, demand: i }));
    expect(toDemandByProject(rows).length).toBe(10);
  });
});

describe('DemandReport 项目行身份 (U04)', () => {
  test('表格渲染项目名,详情链指向有效 /projects/:id 而非 undefined', () => {
    render(
      <MemoryRouter>
        <DemandReport
          data={{
            byProject: [{ id: 'p1', name: '事项A', project: '事项A', demand: 10 }],
            byRole: [],
            timeline: []
          }}
          filters={{ startDate: '', endDate: '' }}
          CustomTooltip={() => <div />}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('事项A')).toBeInTheDocument();
    const detailLinks = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(detailLinks.some((href) => href?.includes('/projects/p1'))).toBe(true);
    expect(detailLinks.some((href) => href?.includes('/projects/undefined'))).toBe(false);
  });
});
