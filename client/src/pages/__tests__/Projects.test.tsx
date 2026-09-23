import React from 'react';
import { render, screen, waitFor as rtlWaitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Projects } from '../Projects';

/** ① 提速: waitFor 轮询间隔 50ms→0(条件已满足时省一个轮询周期,49 测试省 ~2.5s) */
const waitFor = (cb: () => void | Promise<void>) => rtlWaitFor(cb, { interval: 10 }); /* 10ms 仍比默认 50 省 40ms;0 会错过 react-query 宏任务窗口 */

// ── 2026-09-23 夜间重构对齐(看板 B3a-B3e 列模型, BOARD_REDESIGN) ──
// 13 列: 名称(标签内联+＋AR hover 钮)/编号/组件/状态单胶囊/代码规模(KlocCell)/
// 人力人月(EffortCell)/SE/MDE(RoleCell)/版本规划/交付计划(ReleaseCell: RP+迭代
// 尾行 req-release-iter)/优先级/实名投入(PrimaryDevCell)/操作。
// 退役格 → 新格用例映射(OwnerCell/StaffingCell 已从看板退役):
//   - "staffing column header carries the named+pool legend" → 并入 "renders the new column set"
//     (KLOC/Effort(pm)/SE/MDE/Primary Dev 列头断言)
//   - "staffing popover lists named people with percentages" → 并入
//     "role popover lists people (name + primary role) and detaches"(当前人 · % 档)
//   - "owner popover lists/clears" / "assigns from the unassigned row" → 改写为
//     RoleCell(.req-role--se/--mde) 的 detach / assign 等价断言
//   - "staffing popover states its edit model"(池步进) → 改写为 PrimaryDevCell
//     弹层的开发池步进器(池机制收进实名投入弹层, B3e)
// 列宽 req-col-widths-v4: 直宽 min/max, 无 cap/elastic 机制; 默认宽以 REQ_COLUMNS
// 为准(name 210, component 84; tags 已并入名称格无独立列)。

// Mock the API client
jest.mock('../../lib/api-client', () => ({
  api: {
    projects: {
      list: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
    tags: {
      list: jest.fn(),
      create: jest.fn(),
    },
    people: {
      list: jest.fn(),
    },
    lifecycle: {
      transition: jest.fn(),
    },
    roles: {
      list: jest.fn(),
    },
    assignments: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    iterations: {
      list: jest.fn(),
      create: jest.fn(),
    },
    poolDemands: {
      listByProject: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock('../../components/ui/LoadingSpinner', () => ({
  LoadingSpinner: () => <div data-testid="loading-spinner">Loading...</div>,
}));

jest.mock('../../components/ui/ErrorMessage', () => ({
  ErrorMessage: ({ message }: any) => (
    <div data-testid="error-message">{message}</div>
  ),
}));

jest.mock('../../components/modals/ProjectModal', () => ({
  __esModule: true,
  default: ({ isOpen, onClose, editingProject, presetParentId, presetParentName }: any) =>
    isOpen ? (
      <div data-testid="project-modal">
        <h2>{editingProject ? 'Edit Project' : 'New Project'}</h2>
        {presetParentId && <div data-testid="decompose-hint">AR of {presetParentName}</div>}
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

jest.mock('../../components/tags/TagManagerDialog', () => ({
  TagManagerDialog: ({ isOpen }: any) => (isOpen ? <div data-testid="tag-manager" /> : null),
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

import { api } from '../../lib/api-client';
import { useScenario } from '../../contexts/ScenarioContext';

jest.mock('../../contexts/ScenarioContext', () => ({
  useScenario: jest.fn(),
}));

// 需求台 fixtures — category matching is by seed type name (data-level)
// 2026-09-23 看板模型: 补 iteration(id/name/start_date/end_date) · design_estimates
// {se,mde} · se/mde_assignment{person_name,allocation_pct} · primary_dev{person_name,
// start_date,end_date} · estimation_summary{kloc,pm}; 人力(实+池)/负责人字段随
// OwnerCell/StaffingCell 退役(dev.pool 仍供实名投入弹层的池步进读取)
const iterNov = { id: 'iter-11', name: 'Iter 2026-11', quarter: '2026Q4', start_date: '2026-11-01', end_date: '2026-11-30' };
const iterDec = { id: 'iter-12', name: 'Iter 2026-12', quarter: '2026Q4', start_date: '2026-12-01', end_date: '2026-12-31' };

const mockProjects = [
  {
    id: 'proj-1',
    seq_number: 1,
    name: 'Project Alpha',
    project_type_id: 'type-1',
    project_type_name: '需求交付',
    project_sub_type_name: '标准需求',
    product_version: 'B',
    release_version: '26.RP4',
    priority: 2,
    component: 'HCCL_驱动组',
    lifecycle_state: 'pending_rat',
    lifecycle_warnings: ['NO_DEV_DEMAND'],
    tags: [{ id: 1, name: 'Reserved', color: '#f59e0b' }, { id: 2, name: 'Urgent', color: null }],
  },
  {
    id: 'proj-2',
    seq_number: 2,
    name: 'Project Beta',
    project_type_id: 'type-1',
    project_type_name: '需求交付',
    project_sub_type_name: '定制需求',
    product_version: 'A',
    release_version: '26.RP3',
    priority: 1,
    lifecycle_state: 'in_iteration',
    lifecycle_warnings: [],
    iteration: iterNov,
    tags: [],
  },
  // SR→AR: proj-1 的两个 AR 子行
  {
    id: 'proj-1a',
    seq_number: 3,
    name: 'Portal Login Rework',
    project_type_id: 'type-1',
    project_type_name: '需求交付',
    project_sub_type_name: '标准需求',
    parent_id: 'proj-1',
    product_version: 'B',
    release_version: '26.RP4',
    priority: 3,
    component: null,
    estimation_summary: { kloc: 4, pm: 8 },
    design_estimates: { se: 1.5, mde: 0.8 },
    se_assignment: { id: 'as-se-1', person_name: '王后端', allocation_pct: 50 },
    mde_assignment: { id: 'as-mde-1', person_name: '赵设计', allocation_pct: 30 },
    lifecycle_state: 'pending_rat',
    lifecycle_warnings: [],
    iteration: iterNov,
    external_number: 'AR-2026-101',
    tags: [],
  },
  {
    id: 'proj-1b',
    seq_number: 4,
    name: 'Portal Home Rework',
    project_type_id: 'type-1',
    project_type_name: '需求交付',
    project_sub_type_name: '标准需求',
    parent_id: 'proj-1',
    product_version: 'B',
    release_version: '26.RP4',
    priority: 2,
    component: null,
    estimation_summary: null,
    primary_dev: { id: 'as-pd-1', person_name: '李四', allocation_pct: 100, start_date: '2026-11-01', end_date: '2026-11-30' },
    lifecycle_state: 'in_iteration',
    lifecycle_warnings: [],
    staffing_summary: { dev: { pool: 1 } },
    iteration: iterDec,
    external_number: null,
    tags: [],
  },
  // Not a demand item — must NOT appear on the 需求台
  {
    id: 'proj-3',
    seq_number: 5,
    name: 'Project Gamma',
    project_type_id: null,
    project_type_name: null,
    lifecycle_state: null,
    tags: [],
  },
  {
    id: 'proj-4',
    seq_number: 6,
    name: 'Ticket Pool',
    project_type_id: 'type-9',
    project_type_name: '问题单支持',
    lifecycle_state: null,
    tags: [],
  },
];

describe('Requirements Board (需求台)', () => {
  let queryClient: QueryClient;

  const renderComponent = () => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return render(
      <QueryClientProvider client={queryClient}>
        <Projects />
      </QueryClientProvider>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockNavigate.mockClear();
    (api.projects.list as jest.Mock).mockResolvedValue({
      data: { data: mockProjects },
    });
    (api.tags.list as jest.Mock).mockResolvedValue({
      data: { data: [{ id: 1, name: 'Reserved' }] },
    });
    (api.projects.update as jest.Mock).mockResolvedValue({ data: {} });
    (api.projects.delete as jest.Mock).mockResolvedValue({ data: {} });
    (api.roles.list as jest.Mock).mockResolvedValue({
      data: [
        { id: 'r-se', name: 'SE' },
        { id: 'r-mde', name: 'MDE' },
        { id: 'r-dev', name: '开发' }
      ]
    });
    (api.people.list as jest.Mock).mockResolvedValue({
      data: { data: [
        { id: 'p-1', name: '陈主管', primary_role_name: 'SE' },
        { id: 'p-2', name: '李四', primary_role_name: '开发' }
      ] }
    });
    (api.tags.create as jest.Mock).mockResolvedValue({
      data: { data: { id: 9, name: 'Urgent', color: null } }
    });
    (api.lifecycle.transition as jest.Mock).mockResolvedValue({
      data: { project: { lifecycle_state: 'designing' }, event: {} }
    });
    (api.assignments.create as jest.Mock).mockResolvedValue({ data: {} });
    (api.assignments.update as jest.Mock).mockResolvedValue({ data: {} });
    (api.assignments.delete as jest.Mock).mockResolvedValue({ data: {} });
    (api.iterations.list as jest.Mock).mockResolvedValue({
      data: { data: [iterNov, iterDec] }
    });
    (api.iterations.create as jest.Mock).mockResolvedValue({ data: { id: 'iter-12' } });
    (api.poolDemands.listByProject as jest.Mock).mockResolvedValue({ data: { data: [] } });
    (api.poolDemands.create as jest.Mock).mockResolvedValue({ data: {} });
    (api.poolDemands.update as jest.Mock).mockResolvedValue({ data: {} });
    (api.poolDemands.delete as jest.Mock).mockResolvedValue({ data: {} });
    (useScenario as jest.Mock).mockReturnValue({
      currentScenario: { id: 'baseline-0000-0000-0000-000000000000', name: 'Baseline' }
    });
  });

  describe('Rendering', () => {
    test('renders the new column set', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('requirements-table')).toBeInTheDocument();
      });

      const header = screen.getByTestId('requirements-table').querySelector('.requirements-thead');
      const headers = Array.from(header?.children ?? []).map((el) => el.textContent);
      // B3a 13 列(2026-09-23 板卡重构): 名称|编号|组件|状态|代码规模|人力人月|
      // SE|MDE|版本规划|交付计划|优先级|实名投入|操作(标签已并入名称格)
      expect(headers).toEqual([
        'Name', 'Number', 'Component', 'Lifecycle', 'KLOC', 'Effort(pm)',
        'SE', 'MDE', 'Version', 'Release', 'Iteration', 'Priority', 'Primary Dev', 'Actions'
      ]);
    });

    test('flat item rows only — no version group headers (2026-09-22 裁决)', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      // 版本/交付计划两列已携带分组信息,分组头不再呈现
      expect(document.querySelectorAll('.requirements-group-header').length).toBe(0);
      expect(document.querySelectorAll('.requirements-release-header').length).toBe(0);
      // 行内只有 SR/AR 粒度事项本体: Beta + Alpha(SR) + 2 AR 子行
      expect(document.querySelectorAll('.requirements-row').length).toBe(4);
      // 平铺排序: 优先级为第一序轴(Beta P1 先于 Alpha P2),版本次之
      const names = Array.from(
        document.querySelectorAll('.requirements-row .requirements-name-text')
      ).map((el) => el.textContent);
      expect(names[0]).toBe('Project Beta');
      expect(names[1]).toBe('Project Alpha');
    });

    test('product version filter narrows rows client-side', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('product-filter'), { target: { value: 'A' } });
      expect(screen.getByText('Project Beta')).toBeInTheDocument();
      expect(screen.queryByText('Project Alpha')).not.toBeInTheDocument();
      expect(screen.queryByText('Portal Login Rework')).not.toBeInTheDocument();

      // "未排"哨兵: 筛出无版本事项(fixture 里没有 → 空态)
      fireEvent.change(screen.getByTestId('product-filter'), { target: { value: '__none__' } });
      expect(screen.queryByText('Project Beta')).not.toBeInTheDocument();
      expect(screen.getByText(/No matching items/)).toBeInTheDocument();
    });

    test('release version filter narrows rows client-side', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('release-filter'), { target: { value: '26.RP3' } });
      expect(screen.getByText('Project Beta')).toBeInTheDocument();
      expect(screen.queryByText('Project Alpha')).not.toBeInTheDocument();
    });

    test('shows only demand-category items (tickets/standing excluded)', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      expect(screen.getByText('Project Beta')).toBeInTheDocument();
      expect(screen.queryByText('Project Gamma')).not.toBeInTheDocument();
      expect(screen.queryByText('Ticket Pool')).not.toBeInTheDocument();
    });

    test('warning row tint + short-word chip', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      expect(screen.getByText('no pool')).toBeInTheDocument();
      const alphaRow = screen.getByText('Project Alpha').closest('.requirements-row');
      expect(alphaRow).toHaveClass('requirements-row--warned');
    });

    // 旧 "staffing summary renders both sides (named + pool)" 的等价断言:
    // 人力(实+池)列退役,SE/MDE 两格(RoleCell)承接"人+粗估人月"信息(B3d)
    test('SE/MDE role cells render person + rough estimate pm', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Portal Login Rework')).toBeInTheDocument();
      });

      const childRow = screen.getByText('Portal Login Rework').closest('.requirements-row')!;
      const se = childRow.querySelector('.req-role--se')!;
      expect(se.textContent).toContain('王后端');
      expect(se.textContent).toContain('1.5');
      const mde = childRow.querySelector('.req-role--mde')!;
      expect(mde.textContent).toContain('赵设计');
      expect(mde.textContent).toContain('0.8');

      // 未派格弱化显示 —
      const betaRow = screen.getByText('Project Beta').closest('.requirements-row')!;
      expect(betaRow.querySelector('.req-role--se')!.textContent).toContain('—');
      expect(betaRow.querySelector('.req-role--mde')!.textContent).toContain('—');
    });

    // 旧 "priority badge and owner render" 的等价断言: 负责人格退役,
    // 实名投入(PrimaryDevCell)承接"人"信息(B3e)
    test('priority badge and primary dev render', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      expect(screen.getAllByText('P2').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('P1').length).toBeGreaterThanOrEqual(1);

      const childRow = screen.getByText('Portal Home Rework').closest('.requirements-row')!;
      const primary = childRow.querySelector('.req-primary')!;
      expect(primary.textContent).toContain('李四');
      // 投入窗口随人内联(月-日 ~ 月-日)
      expect(primary.textContent).toContain('11-01~11-30');
    });
  });

  describe('Lifecycle in place', () => {
    test('advances lifecycle from the row (one click ›)', async () => {
      (api.lifecycle.transition as jest.Mock).mockResolvedValue({
        data: { project: { lifecycle_state: 'designing' }, event: {} }
      });
      renderComponent();

      await waitFor(() => {
        expect(screen.getAllByText('Pending RAT').length).toBeGreaterThan(0);
      });

      // B3b 单胶囊: 一键推进收进 ›(.lifecycle-advance-btn),不再有文字快捷钮
      const childRow = screen.getByText('Portal Login Rework').closest('.requirements-row')!;
      const advance = within(childRow).getByTitle('Advance to Designing');
      expect(advance).toHaveClass('lifecycle-advance-btn');
      fireEvent.click(advance);

      await waitFor(() => {
        expect(api.lifecycle.transition).toHaveBeenCalledWith('proj-1a', { to: 'designing' });
      });
    });

    test('badge popover offers the full flow-free state selector', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getAllByText('Pending RAT').length).toBeGreaterThan(0);
      });

      // the badge is the button (the select option is not a button)
      const badge = screen
        .getAllByRole('button', { name: /Pending RAT/ })
        .find((b) => b.closest('.lifecycle-cell'));
      fireEvent.click(badge!);

      const selector = within(screen.getByTestId('lc-state-list'));
      ['NOK', 'Designing', 'Backlog', 'Scheduled', 'Started', 'Delivered', 'Cancelled'].forEach(
        (label) => expect(selector.getByText(label)).toBeInTheDocument()
      );
      expect(selector.getByText('current')).toBeInTheDocument();
    });
  });

  describe('Version inline edit', () => {
    test('click product part → edit → saved via projects.update', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      const alphaRow = screen.getByText('Project Alpha').closest('.requirements-row')!;
      fireEvent.click(within(alphaRow).getByText('B'));

      const input = await screen.findByDisplayValue('B');
      await user.clear(input);
      await user.type(input, 'C{Enter}');

      await waitFor(() => {
        expect(api.projects.update).toHaveBeenCalledWith('proj-1', { product_version: 'C' });
      });
    });
  });

  describe('Inline editing (priority / roles / tags)', () => {
    // 旧 "staffing popover states its edit model" 的等价断言: 池机制收进
    // 实名投入弹层(B3e)——开发池 ±0.5 步进器 + 实名一档
    test('primary dev popover carries the dev pool stepper (pool mechanism moved here)', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Portal Home Rework')).toBeInTheDocument();
      });

      const childRow = screen.getByText('Portal Home Rework').closest('.requirements-row')!;
      fireEvent.click(childRow.querySelector('.req-primary')!);

      const pop = document.querySelector('.primary-pop')!;
      // 当前实名一档: 人 · 占用% · 窗口
      expect(within(pop).getByText('李四 · 100% · 11-01~11-30')).toBeInTheDocument();
      // 池步进器常驻,自带 ±0.5 语义(不靠猜)
      expect(within(pop).getByText('Dev pool')).toBeInTheDocument();
      expect(pop.querySelector('.staff-stepper-val')!.textContent).toBe('1.0');
      expect(pop.querySelector('button[title="+0.5"]')).toBeInTheDocument();
      expect(pop.querySelector('button[title="-0.5"]')).not.toBeDisabled();
    });

    // 旧 "owner popover lists people (name + primary role) and clears" 的
    // 等价断言: 负责人弹层退役,RoleCell 弹层承接(人 · 占用% + Detach)
    test('role popover lists people (name + primary role) and detaches', async () => {
      const user = userEvent.setup(); /* 保留 userEvent: 弹层人员列表依赖
        react-query 异步流,fireEvent 不推进事件循环(2026-09-23 提速改造实测) */
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Portal Login Rework')).toBeInTheDocument();
      });

      const childRow = screen.getByText('Portal Login Rework').closest('.requirements-row')!;
      await user.click(childRow.querySelector('.req-role--se')!);

      const pop = await waitFor(() => {
        const el = document.querySelector('.role-pop');
        expect(el).not.toBeNull();
        return el!;
      });
      expect(within(pop).getByText('王后端 · 50%')).toBeInTheDocument();
      // 候选列表: 姓名 + 主角色 meta
      await waitFor(() => {
        expect(within(pop).getAllByText('陈主管').length).toBeGreaterThanOrEqual(1);
      });
      expect(within(pop).getAllByText('SE').length).toBeGreaterThanOrEqual(1);

      fireEvent.click(within(pop).getByText('Detach'));
      await waitFor(() => {
        expect(api.assignments.delete).toHaveBeenCalledWith('as-se-1');
      });
    });

    // 旧 "owner popover assigns from the unassigned row" 的等价断言
    test('role popover assigns from the unassigned row', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Beta')).toBeInTheDocument();
      });

      const betaRow = screen.getByText('Project Beta').closest('.requirements-row')!;
      fireEvent.click(betaRow.querySelector('.req-role--mde')!);

      const pop = document.querySelector('.role-pop')!;
      // 候选就绪(角色档案到位后才可派)
      const candidate = await waitFor(() => {
        const el = within(pop).getByText('李四');
        expect(el.closest('button')).not.toBeDisabled();
        return el;
      });

      fireEvent.click(candidate);

      await waitFor(() => {
        expect(api.people.list).toHaveBeenCalled();
        expect(api.assignments.create).toHaveBeenCalledWith(expect.objectContaining({
          project_id: 'proj-2',
          person_id: 'p-2',
          role_id: 'r-mde',
          status: 'active'
        }));
      });
    });

    test('priority popover selects P1 and persists', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      const alphaRow = screen.getByText('Project Alpha').closest('.requirements-row')!;
      fireEvent.click(within(alphaRow).getByTestId('priority-edit-btn'));

      const popover = await screen.findByTestId('priority-popover');
      fireEvent.click(within(popover).getByText('Highest'));

      await waitFor(() => {
        expect(api.projects.update).toHaveBeenCalledWith('proj-1', { priority: 1 });
      });
    });

    test('tags popover toggles off and submits the full set', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      const alphaRow = screen.getByText('Project Alpha').closest('.requirements-row')!;
      fireEvent.click(within(alphaRow).getByTestId('tags-edit-btn'));

      const popover = await screen.findByTestId('tags-popover');
      fireEvent.click(within(popover).getByText('Reserved'));

      await waitFor(() => {
        expect(api.projects.update).toHaveBeenCalledWith('proj-1', { tag_ids: ['2'] });
      });
    });

    test('tags popover creates a new tag and applies it', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Beta')).toBeInTheDocument();
      });

      const betaRow = screen.getByText('Project Beta').closest('.requirements-row')!;
      fireEvent.click(within(betaRow).getByTestId('tags-edit-btn'));

      const popover = await screen.findByTestId('tags-popover');
      const input = within(popover).getByPlaceholderText('New tag…');
      await user.type(input, 'Urgent{Enter}');

      await waitFor(() => {
        expect(api.tags.create).toHaveBeenCalledWith({ name: 'Urgent' });
        expect(api.projects.update).toHaveBeenCalledWith('proj-2', { tag_ids: ['9'] });
      });
    });

    test('component cell shows value and commits via combobox', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      const alphaRow = screen.getByText('Project Alpha').closest('.requirements-row')!;
      expect(within(alphaRow).getByText('HCCL_驱动组')).toBeInTheDocument();

      fireEvent.click(within(alphaRow).getByTestId('component-edit-btn'));
      const pop = await screen.findByTestId('component-popover');
      const input = pop.querySelector('.cell-pop-search input') as HTMLInputElement;
      await user.clear(input);
      await user.type(input, '调度组{Enter}');

      await waitFor(() => {
        expect(api.projects.update).toHaveBeenCalledWith('proj-1', { component: '调度组' });
      });
    });

    // 旧 ScaleCell(.req-scale--empty) → 评估链两格: KlocCell + EffortCell
    test('kloc & effort cells render estimation and em-dash when absent', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Portal Login Rework')).toBeInTheDocument();
      });

      const childRow = screen.getByText('Portal Login Rework').closest('.requirements-row')!;
      expect(childRow.querySelector('.req-kloc-num')!.textContent).toBe('4K');
      expect(childRow.querySelector('.req-effort-num')!.textContent).toBe('8');

      const betaRow = screen.getByText('Project Beta').closest('.requirements-row')!;
      // 空值仍是可编辑按钮(2026-09-23 就地编辑),文本 —
      expect(betaRow.querySelector('.req-kloc')!.textContent).toBe('—');
      expect(betaRow.querySelector('.req-effort')!.textContent).toBe('—');
    });

    test('component filter narrows rows client-side', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('component-filter'), { target: { value: 'HCCL_驱动组' } });
      expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      expect(screen.queryByText('Project Beta')).not.toBeInTheDocument();
    });

    test('row click does not fire when clicking edit triggers', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Portal Login Rework')).toBeInTheDocument();
      });

      const childRow = screen.getByText('Portal Login Rework').closest('.requirements-row')!;
      fireEvent.click(within(childRow).getByTestId('priority-edit-btn'));
      fireEvent.click(within(childRow).getByTestId('tags-edit-btn'));
      fireEvent.click(within(childRow).getByTestId('component-edit-btn'));
      // 新增触发点: SE/MDE 格与实名投入格(负责人格退役)
      fireEvent.click(childRow.querySelector('.req-role--se')!);
      fireEvent.click(childRow.querySelector('.req-primary')!);

      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('Release plan (交付计划, B3c)', () => {
    test('release cell shows only RP; iteration in separate cell', async () => {
      renderComponent();
      await waitFor(() => { expect(screen.getByText('Project Alpha')).toBeInTheDocument(); });
      const relCell = document.querySelector('.req-release');
      expect(relCell).not.toBeNull();
      // Release 列只含 VersionPart(RP),无迭代尾行
      expect(relCell?.querySelector('.req-release-iter')).toBeNull();
      // 迭代在独立格
      expect(document.querySelector('.req-iter-cell')).not.toBeNull();
    });

    test('iteration cell opens the picker and re-attaches', async () => {
      renderComponent();
      await waitFor(() => { expect(screen.getByText('Project Alpha')).toBeInTheDocument(); });
      const iterBtn = document.querySelector('.req-iter-cell .req-iter-val');
      expect(iterBtn).not.toBeNull();
      if (iterBtn) fireEvent.click(iterBtn);
      await waitFor(() => {
        expect(document.querySelector('.iter-pop')).not.toBeNull();
      });
    });

  });

  describe('SR→AR decomposition', () => {
    test('SR row renders with AR count, state distribution and child rows', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      const srRow = screen.getByText('Project Alpha').closest('.requirements-row')!;
      expect(srRow).toHaveClass('requirements-row--sr');
      expect(within(srRow).getByText('(2 AR)')).toBeInTheDocument();
      // 状态分布: 1 子行待RAT + 1 已启动(SR 行不进单胶囊,页面侧状态分布)
      expect(within(srRow).getByText(/Pending RAT/)).toBeInTheDocument();
      expect(within(srRow).getByText(/Started/)).toBeInTheDocument();

      const childRows = document.querySelectorAll('.requirements-row--child');
      expect(childRows.length).toBe(2);
      expect(within(childRows[0] as HTMLElement).getByText('AR-2026-101')).toBeInTheDocument();
    });

    // 旧 "SR aggregates equal child sums (staffing & scale)" 的新列模型版:
    // 汇总只读=子行之和(规模/人力/SE/MDE/实名),同一数据源
    test('SR aggregates equal child sums (kloc/effort/roles/primary)', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      const srRow = screen.getByText('Project Alpha').closest('.requirements-row')!;
      // 规模/人力: 仅 proj-1a 有评估 4K/8pm
      expect(srRow.querySelector('.req-kloc-num')!.textContent).toBe('4K');
      expect(srRow.querySelector('.req-effort-num')!.textContent).toBe('8');
      // SE/MDE: Σ粗估(1.5/0.8,单人无 ·N人 尾注)
      expect(Array.from(srRow.querySelectorAll('.req-role--agg')).map((el) => el.textContent))
        .toEqual(['Σ1.5', 'Σ0.8']);
      // 实名投入: 1 名主投入
      expect(srRow.querySelector('.req-primary--agg')!.textContent).toBe('1人');
    });

    test('SR chevron toggles children; SR row click opens its detail (same as other rows)', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });
      expect(document.querySelectorAll('.requirements-row--child').length).toBe(2);

      // 折叠归箭头钮(2026-09-22 修正: SR 行点击进详情,不再折叠)
      fireEvent.click(document.querySelector('.req-sr-toggle')!);
      expect(document.querySelectorAll('.requirements-row--child').length).toBe(0);

      fireEvent.click(document.querySelector('.req-sr-toggle')!);
      expect(document.querySelectorAll('.requirements-row--child').length).toBe(2);

      fireEvent.click(screen.getByText('Project Alpha'));
      expect(mockNavigate).toHaveBeenCalledWith('/projects/proj-1');
    });

    test('decompose button opens the create modal preset to the parent', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      // ＋AR 钮在名称格,display:none 悬停显示——jsdom 只断存在性/可点,
      // 不断可见性(见 App.css .req-ar-add)。产品现状: SR 名称格渲染了两个
      // ＋AR 钮(疑似重复,见报告),取第一个即可
      const srRow = screen.getByText('Project Alpha').closest('.requirements-row')!;
      const addBtns = within(srRow).getAllByTitle('Decompose into AR');
      expect(addBtns.length).toBeGreaterThanOrEqual(1);
      fireEvent.click(addBtns[0]);

      const hint = await screen.findByTestId('decompose-hint');
      expect(hint.textContent).toContain('Project Alpha');
    });

    test('number cell is inline-editable on every row type (SR/AR unified)', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Portal Home Rework')).toBeInTheDocument();
      });

      // 空外部号 → 弱化 #序号(列表截图永远携带可指代标识)
      const betaRow2 = screen.getByText('Project Beta').closest('.requirements-row')!;
      expect(within(betaRow2).getByText('CAP-2')).toBeInTheDocument();

      // 子行(AR): 空 → 填 AR 号
      const childRow2 = screen.getByText('Portal Home Rework').closest('.requirements-row')!;
      fireEvent.click(childRow2.querySelector('.req-number-part')!);
      const input = await within(childRow2).findByRole('textbox');
      await user.type(input, 'AR-2026-999{Enter}');
      await waitFor(() => {
        expect(api.projects.update).toHaveBeenCalledWith('proj-1b', { external_number: 'AR-2026-999' });
      });

      // 顶层行(混排: 本身就可能是 SR 或 AR 粒度): 填 SR 号
      const betaRow = screen.getByText('Project Beta').closest('.requirements-row')!;
      fireEvent.click(betaRow.querySelector('.req-number-part')!);
      const input2 = await within(betaRow).findByRole('textbox');
      await user.type(input2, 'SR-26-001{Enter}');
      await waitFor(() => {
        expect(api.projects.update).toHaveBeenCalledWith('proj-2', { external_number: 'SR-26-001' });
      });
    });

    test('subtype is not inline in the name cell and filters via toolbar', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      // 2026-09-22 裁决: 子类型撤内联(常量重复零信息),分类走筛选
      expect(document.querySelectorAll('.requirements-subtype').length).toBe(0);

      fireEvent.change(screen.getByTestId('subtype-filter'), { target: { value: '标准需求' } });
      expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      expect(screen.queryByText('Project Beta')).not.toBeInTheDocument();

      fireEvent.change(screen.getByTestId('subtype-filter'), { target: { value: '定制需求' } });
      expect(screen.getByText('Project Beta')).toBeInTheDocument();
      expect(screen.queryByText('Project Alpha')).not.toBeInTheDocument();
    });

    test('search hitting a child keeps the whole tree visible', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      await user.type(screen.getByTestId('search-input'), 'Portal Login');
      expect(screen.getByText('Portal Login Rework')).toBeInTheDocument();
      expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      expect(screen.queryByText('Project Beta')).not.toBeInTheDocument();
    });
  });

  describe('Column resize (列宽拖拽)', () => {
    const lsStore = new Map<string, string>();
    beforeEach(() => {
      // jsdom 默认视口 1024 会走 <1560 紧凑默认;列宽断言统一按宽屏档
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1700 }); // 全列档(≥1680)默认值
      // 本环境 localStorage 是哑实现(setItem 后 getItem 仍 undefined),装功能版
      lsStore.clear();
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: {
          getItem: (k: string) => lsStore.get(k) ?? null,
          setItem: (k: string, v: string) => lsStore.set(k, String(v)),
          removeItem: (k: string) => lsStore.delete(k),
          clear: () => lsStore.clear(),
          key: (i: number) => [...lsStore.keys()][i] ?? null,
          get length() { return lsStore.size; }
        }
      });
    });

    test('renders a grip on every resizable column header', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      // 除操作列外全部有手柄(2026-09-23 修: 硬编码 i<10 漏掉后加列)
      const grips = screen.getAllByTestId(/^col-grip-/);
      expect(grips.map((g) => g.dataset.testid)).toEqual([
        'col-grip-name', 'col-grip-number', 'col-grip-component', 'col-grip-lifecycle',
        'col-grip-kloc', 'col-grip-effort', 'col-grip-se', 'col-grip-mde',
        'col-grip-version', 'col-grip-release', 'col-grip-iter',
        'col-grip-priority', 'col-grip-primary'
      ]);
    });

    test('persisted widths are applied as CSS vars on the table', async () => {
      localStorage.setItem('req-col-widths-v4', JSON.stringify({ version: 100, priority: 80 }));
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      const table = screen.getByTestId('requirements-table');
      expect(table.style.getPropertyValue('--req-w-version')).toBe('100px');
      expect(table.style.getPropertyValue('--req-w-priority')).toBe('80px');
      // 默认宽以 REQ_COLUMNS 为准: name 210(v4 列集)
      expect(table.style.getPropertyValue('--req-w-name')).toBe('210px');
    });

    test('dragging the name column just sets its width (direct width, no elastic)', async () => {
      localStorage.setItem('req-col-widths-v4', JSON.stringify({ name: 150 }));
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      // 2026-09-23 直宽裁决: 列定义无 elastic/fr 机制,拖=直宽钉死(min/max 钳制)
      const table = screen.getByTestId('requirements-table');
      expect(table.style.getPropertyValue('--req-w-name')).toBe('150px');
      expect(table.style.getPropertyValue('--req-f-name')).toBe('');
    });

    test('dragging a column pins its width (no cap mechanism)', async () => {
      localStorage.setItem('req-col-widths-v4', JSON.stringify({ component: 200 }));
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      // 2026-09-23 直宽裁决: 无 cap 机制,拖宽不再写 --req-cap-*
      const table = screen.getByTestId('requirements-table');
      expect(table.style.getPropertyValue('--req-w-component')).toBe('200px');
      expect(table.style.getPropertyValue('--req-cap-component')).toBe('');
    });

    test('double-click on a grip resets that column and persists the change', async () => {
      localStorage.setItem('req-col-widths-v4', JSON.stringify({ component: 150 }));
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      const table = screen.getByTestId('requirements-table');
      expect(table.style.getPropertyValue('--req-w-component')).toBe('150px');

      fireEvent.dblClick(screen.getByTestId('col-grip-component'));

      // 重置回 REQ_COLUMNS 默认: component def[0]=84
      await waitFor(() => {
        expect(table.style.getPropertyValue('--req-w-component')).toBe('84px');
      });
      expect(JSON.parse(localStorage.getItem('req-col-widths-v4')!)).toEqual({});
    });
  });

  describe('Operations', () => {
    test('edit icon opens the project modal', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      const alphaRow = screen.getByText('Project Alpha').closest('.requirements-row')!;
      fireEvent.click(within(alphaRow).getByTitle('Edit'));

      await waitFor(() => {
        expect(screen.getByTestId('project-modal')).toBeInTheDocument();
        expect(screen.getByText('Edit Project')).toBeInTheDocument();
      });
    });

    test('delete is a two-click confirm (zero modal)', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      const alphaRow = screen.getByText('Project Alpha').closest('.requirements-row')!;
      const deleteBtn = within(alphaRow).getByTitle('Delete');
      fireEvent.click(deleteBtn);

      // First click arms, second click executes — no window.confirm
      expect(api.projects.delete).not.toHaveBeenCalled();
      const confirmBtn = within(alphaRow).getByTitle('Confirm');
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(api.projects.delete).toHaveBeenCalledWith('proj-1');
      });
    });

    test('row click navigates to project detail', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Beta')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Project Beta'));
      expect(mockNavigate).toHaveBeenCalledWith('/projects/proj-2');
    });
  });

  describe('Filters', () => {
    test('search narrows rows client-side', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      await user.type(screen.getByTestId('search-input'), 'Alpha');
      await waitFor(() => {
        expect(screen.queryByText('Project Beta')).not.toBeInTheDocument();
      });
      expect(screen.getByText('Project Alpha')).toBeInTheDocument();
    });

    test('count summary discloses the AR subtotal (口径不沉默)', async () => {
      renderComponent();
      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });
      expect(screen.getByText(/2 requirements · 2 AR/)).toBeInTheDocument();
    });

    test('filtered-empty differs from no-data and offers one-click clear', async () => {
      const user = userEvent.setup();
      renderComponent();
      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      await user.type(screen.getByTestId('search-input'), 'ZZZ-no-hit');
      expect(screen.getByText(/No matching items/)).toBeInTheDocument();

      fireEvent.click(document.querySelector('.requirements-empty-clear') as HTMLButtonElement);
      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });
    });

    test('tags render inline in the name cell; chip click filters, click again clears (Q1-B/Q3)', async () => {
      renderComponent();
      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });
      const alphaRow = screen.getByText('Project Alpha').closest('.requirements-row')!;
      // 2 枚常态全量可见(治理后常态),不再折叠
      expect(within(alphaRow).getByText('Reserved')).toBeInTheDocument();
      expect(within(alphaRow).getByText('Urgent')).toBeInTheDocument();
      expect(within(alphaRow).queryByText('+1')).not.toBeInTheDocument();

      // chip 点击 = 按此标签过滤(无标签的 Beta 隐藏)
      fireEvent.click(within(alphaRow).getByText('Reserved'));
      expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      expect(screen.queryByText('Project Beta')).not.toBeInTheDocument();

      // 再点同枚取消
      fireEvent.click(within(alphaRow).getByText('Reserved'));
      expect(screen.getByText('Project Beta')).toBeInTheDocument();
    });

    test('decorative pencils are gone everywhere (2026-09-23 裁决: 点击即知可编辑)', async () => {
      renderComponent();
      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });
      // 纯提示铅笔全灭;唯一保留的是标签格的编辑入口按钮(--act,可点击本体)
      expect(document.querySelectorAll('.req-pencil:not(.req-pencil--act)').length).toBe(0);
    });

    test('search by external number locates the tree (parent or child hit)', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      await user.type(screen.getByTestId('search-input'), 'AR-2026-101');
      expect(screen.getByText('Portal Login Rework')).toBeInTheDocument();
      expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      expect(screen.queryByText('Project Beta')).not.toBeInTheDocument();
    });

    test('search by reference code locates the row (#序号)', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      // CAP-1 = seq_number 精确命中 Alpha(#N 旧格式仍兼容)
      await user.type(screen.getByTestId('search-input'), 'CAP-1');
      expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      expect(screen.queryByText('Project Beta')).not.toBeInTheDocument();
    });

    test('lifecycle filter passes through to the API', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('lifecycle-filter')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('lifecycle-filter'), { target: { value: 'designing' } });

      await waitFor(() => {
        expect(api.projects.list).toHaveBeenLastCalledWith(
          expect.objectContaining({ lifecycle_state: 'designing' })
        );
      });
    });
  });

  describe('States', () => {
    test('shows loading state (skeleton, 2026-09-23 P3)', () => {
      (api.projects.list as jest.Mock).mockImplementation(() => new Promise(() => {}));
      renderComponent();
      // 骨架屏 3 行占位(替代旧的转圈 spinner)
      expect(document.querySelectorAll('.req-skeleton-row').length).toBe(3);
    });

    test('shows error state', async () => {
      (api.projects.list as jest.Mock).mockRejectedValue(new Error('Failed to load'));
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toBeInTheDocument();
      });
    });

    test('shows empty state when no demand items', async () => {
      (api.projects.list as jest.Mock).mockResolvedValue({ data: { data: [] } });
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('No requirements')).toBeInTheDocument();
      });
    });
  });
});
