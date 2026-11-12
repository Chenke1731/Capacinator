/**
 * I02h/U23：路线图锚点（/projects?tab=roadmap&projectId=<id>）。
 * - 命中且有阶段：视口按阶段范围重定位 + 行高亮（project-row--anchor，特异性 0,3,0）
 * - 无阶段 / 未找到：banner 明确说明（禁止静默落在空白行）
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import ProjectRoadmap from '@client/pages/ProjectRoadmap';
import { api } from '@client/lib/api-client';

jest.mock('@client/lib/api-client', () => ({
  api: {
    projects: { list: jest.fn() },
    projectPhases: { list: jest.fn() },
  },
}));

jest.mock('@client/components/InteractiveTimeline', () => ({
  __esModule: true,
  default: () => <div data-testid="timeline-stub" />,
}));

const projects = [
  { id: 'p1', name: '锚点项目', project_type: { name: '需求交付', color_code: '#4F46E5' }, priority: 2, aspiration_start: '2026-01-01', aspiration_finish: '2026-06-30' },
  { id: 'p2', name: '无阶段项目', project_type: { name: '需求交付', color_code: '#4F46E5' }, priority: 3, aspiration_start: '2026-02-01', aspiration_finish: '2026-08-31' },
];

const phasesByProject: Record<string, any[]> = {
  p1: [
    { id: 'ph1', project_id: 'p1', phase_id: 'a', phase_order: 1, start_date: '2026-03-01', end_date: '2026-04-15' },
  ],
  p2: [],
};

const renderAt = (entry: string) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <ProjectRoadmap />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  (api.projects.list as jest.Mock).mockResolvedValue({ data: { data: projects } });
  (api.projectPhases.list as jest.Mock).mockImplementation(async ({ project_id }: { project_id: string }) => ({
    data: { data: phasesByProject[project_id] ?? [] },
  }));
});

describe('ProjectRoadmap 锚点（I02h/U23）', () => {
  test('命中且有阶段：目标行高亮、无 banner', async () => {
    const { container } = renderAt('/projects?tab=roadmap&projectId=p1');
    await waitFor(() => expect(container.querySelector('[data-project-id="p1"]')).toBeTruthy());
    expect(container.querySelector('[data-project-id="p1"]')?.className).toContain('project-row--anchor');
    expect(screen.queryByTestId('roadmap-anchor-banner')).not.toBeInTheDocument();
  });

  test('无阶段：banner 说明 + "仅显示该项目"把搜索框设为项目名', async () => {
    const { container } = renderAt('/projects?tab=roadmap&projectId=p2');
    await waitFor(() => expect(screen.getByTestId('roadmap-anchor-banner')).toBeInTheDocument());
    expect(screen.getByTestId('roadmap-anchor-banner').textContent).toMatch(/no phases/i);

    fireEvent.click(screen.getByTestId('roadmap-anchor-show-only'));
    const search = container.querySelector('.search-box input') as HTMLInputElement;
    expect(search.value).toBe('无阶段项目');
  });

  test('未找到：banner 说明项目不在当前数据中', async () => {
    renderAt('/projects?tab=roadmap&projectId=ghost');
    await waitFor(() => expect(screen.getByTestId('roadmap-anchor-banner')).toBeInTheDocument());
    expect(screen.getByTestId('roadmap-anchor-banner').textContent).toMatch(/not found/i);
  });
});
