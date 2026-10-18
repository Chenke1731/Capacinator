import React from 'react';
import { render, screen, waitFor as rtlWaitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Projects } from '../Projects';

// jsdom has no layout — the real virtualizer measures the scroll element,
// gets zeros, and renders no rows. Mock it to render every row (tests then
// assert the same full-board behavior as before virtualization).
jest.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () => Array.from({ length: count }, (_, i) => ({ index: i, start: i * 43, size: 43, key: i })),
    getTotalSize: () => count * 43,
    scrollToIndex: () => undefined,
  }),
}));

/** ① 提速: waitFor 轮询间隔 50ms→0(条件已满足时省一个轮询周期,49 测试省 ~2.5s) */
const waitFor = <T = void,>(cb: () => T | Promise<T>) => rtlWaitFor(cb, { interval: 10 }) as Promise<T>; /* 10ms 仍比默认 50 省 40ms;0 会错过 react-query 宏任务窗口 */

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
// 列宽 req-col-widths-v5: 直宽 min/max, 无 cap/elastic 机制; 默认宽以 REQ_COLUMNS
// 为准(name 210, component 84; tags 已并入名称格无独立列)。

// Mock the API client
jest.mock('../../lib/api-client', () => ({
  api: {
    projects: {
      list: jest.fn(),
      boardFeed: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
      batchDelete: jest.fn(),
      batchUpdate: jest.fn(),
    },
    tags: {
      list: jest.fn(),
      create: jest.fn(),
    },
    people: {
      list: jest.fn(),
      getUtilization: jest.fn(),
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
    // U13 预览用例:有 SE 粗估但未派人
    design_estimates: { se: 2, mde: 1 },
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
    // the board now fetches from board-feed (one slim whole-board request)
    (api.projects.boardFeed as jest.Mock).mockResolvedValue({
      data: { data: { data: mockProjects, total: mockProjects.length } },
    });
    (api.tags.list as jest.Mock).mockResolvedValue({
      data: { data: [{ id: 1, name: 'Reserved' }] },
    });
    (api.projects.update as jest.Mock).mockResolvedValue({ data: {} });
    (api.projects.delete as jest.Mock).mockResolvedValue({ data: {} });
    (api.projects.batchDelete as jest.Mock).mockResolvedValue({ data: { deleted: 0, items: [] } });
    (api.projects.batchUpdate as jest.Mock).mockResolvedValue({ data: { updated: 0, skipped: 0, items: [] } });
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
    // U13 预览数据源(今日快照口径,弹层内如实标注)
    (api.people.getUtilization as jest.Mock).mockResolvedValue({
      data: { data: [
        { person_id: 'p-1', person_name: '陈主管', total_allocation_percentage: 30, current_availability_percentage: 100, utilization_status: 'Partially-allocated' },
        { person_id: 'p-2', person_name: '李四', total_allocation_percentage: 0, current_availability_percentage: 100, utilization_status: 'Available' }
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
      // 前置选择列(2026-10-11 批量操作): 表头是全选三态框,无文本;
      // 其后 B3a 14 列: 名称|编号|组件|状态|代码规模|人力人月|SE|MDE|
      // 版本规划|交付计划|迭代|优先级|实名投入|操作(标签已并入名称格)
      expect(headers).toEqual([
        '', 'Name', 'Number', 'Component', 'Lifecycle', 'KLOC', 'Effort(pm)',
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

      const childRow = screen.getByText('Portal Login Rework').closest('.requirements-row') as HTMLElement;
      const se = childRow.querySelector('.req-role--se')!;
      expect(se.textContent).toContain('王后端');
      expect(se.textContent).toContain('1.5');
      const mde = childRow.querySelector('.req-role--mde')!;
      expect(mde.textContent).toContain('赵设计');
      expect(mde.textContent).toContain('0.8');

      // 未派格弱化显示 —
      const betaRow = screen.getByText('Project Beta').closest('.requirements-row') as HTMLElement;
      expect(betaRow.querySelector('.req-role--se')!.textContent).toContain('—');
      expect(betaRow.querySelector('.req-role--mde')!.textContent).toContain('—');
    });

    // U13/U14(2026-10-17,IP-06d 第一批):分配先预览再确认;0 工作量保护
    describe('RoleCell assign preview (U13/U14)', () => {
      const openSePopover = async (projectName: string) => {
        renderComponent();
        await waitFor(() => { expect(screen.getByText(projectName)).toBeInTheDocument(); });
        const row = screen.getByText(projectName).closest('.requirements-row') as HTMLElement;
        fireEvent.click(row.querySelector('.req-role--se')!);
        // 只等弹层本体:U14 零工作量分支没有候选列表/search
        await waitFor(() => { expect(document.querySelector('.role-pop')).not.toBeNull(); });
        return row;
      };
      const waitCandidates = async () => {
        await waitFor(() => { expect(document.querySelector('.role-pop')!.textContent).toContain('陈主管'); });
      };

      test('U13: 点候选进草稿而非提交;预览当前负荷/本次增加/调整后;确认才写入', async () => {
        await openSePopover('Project Beta');
        await waitCandidates();
        fireEvent.click(screen.getByText('陈主管'));
        // 草稿出现且未提交
        await waitFor(() => { expect(screen.getByText(/assignment draft/i)).toBeInTheDocument(); });
        expect(api.assignments.create).not.toHaveBeenCalled();
        // 预览三要素(mock:陈主管当前 30%)
        expect(screen.getByText(/current load/i)).toBeInTheDocument();
        expect(screen.getByText(/this add/i)).toBeInTheDocument();
        expect(screen.getByText(/after/i)).toBeInTheDocument();
        // 确认写入,载荷含人/角色/比例/起止
        fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));
        await waitFor(() => { expect(api.assignments.create).toHaveBeenCalledTimes(1); });
        expect(api.assignments.create).toHaveBeenCalledWith(expect.objectContaining({
          project_id: 'proj-2',
          person_id: 'p-1',
          role_id: 'r-se',
          allocation_percentage: expect.any(Number),
          start_date: expect.any(String),
          end_date: expect.any(String)
        }));
      });

      test('U13: 调整后超出可用率显示冲突提示(不阻止确认,操作者知情)', async () => {
        await openSePopover('Project Beta');
        await waitCandidates();
        fireEvent.click(screen.getByText('陈主管'));
        await waitFor(() => { expect(screen.getByText(/assignment draft/i)).toBeInTheDocument(); });
        // se=2pm / iterNov≈0.97月 → 建议≈200%(封顶),30+200=230 > 可用率100
        expect(screen.getByText(/exceeds availability/i)).toBeInTheDocument();
      });

      test('U13: 提交失败保留草稿(弹层不关,可改后重试)', async () => {
        (api.assignments.create as jest.Mock).mockRejectedValueOnce(new Error('409 conflict'));
        await openSePopover('Project Beta');
        await waitCandidates();
        fireEvent.click(screen.getByText('陈主管'));
        await waitFor(() => { expect(screen.getByText(/assignment draft/i)).toBeInTheDocument(); });
        fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));
        await waitFor(() => { expect(api.assignments.create).toHaveBeenCalledTimes(1); });
        // 失败后弹层不关、草稿仍在(草稿态不渲染候选 search——断言弹层本体)
        expect(document.querySelector('.role-pop')).not.toBeNull();
        expect(screen.getByText(/assignment draft/i)).toBeInTheDocument();
        expect(screen.getByText(/draft kept/i)).toBeInTheDocument(); // 错误行可见
      });

      test('U14: SE 粗估为 0(未补估算)时候选禁用并提示先补估算,不再产出 0% 建议', async () => {
        await openSePopover('Portal Home Rework');
        // 零工作量分支:提示先补估算,不渲染候选列表
        await waitFor(() => { expect(screen.getByText(/before assigning/i)).toBeInTheDocument(); });
        expect(document.querySelector('.role-pop')!.textContent).not.toContain('陈主管');
        expect(api.assignments.create).not.toHaveBeenCalled();
      });
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

      const childRow = screen.getByText('Portal Home Rework').closest('.requirements-row') as HTMLElement;
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
      const childRow = screen.getByText('Portal Login Rework').closest('.requirements-row') as HTMLElement;
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

      const alphaRow = screen.getByText('Project Alpha').closest('.requirements-row') as HTMLElement;
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

      const childRow = screen.getByText('Portal Home Rework').closest('.requirements-row') as HTMLElement;
      fireEvent.click(childRow.querySelector('.req-primary')!);

      const pop = document.querySelector('.primary-pop') as HTMLElement;
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

      const childRow = screen.getByText('Portal Login Rework').closest('.requirements-row') as HTMLElement;
      await user.click(childRow.querySelector('.req-role--se')!);

      const pop = await waitFor(() => {
        const el = document.querySelector<HTMLElement>('.role-pop');
        expect(el).not.toBeNull();
        return el as HTMLElement;
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

      const betaRow = screen.getByText('Project Beta').closest('.requirements-row') as HTMLElement;
      fireEvent.click(betaRow.querySelector('.req-role--mde')!);

      const pop = document.querySelector('.role-pop') as HTMLElement;
      // 候选就绪(角色档案到位后才可派)
      const candidate = await waitFor(() => {
        const el = within(pop).getByText('李四');
        expect(el.closest('button')).not.toBeDisabled();
        return el as HTMLElement;
      });

      // U13 两段式(2026-10-17 迁移):点击进草稿,确认才写入
      fireEvent.click(candidate);
      await waitFor(() => {
        expect(within(pop).getByText(/assignment draft/i)).toBeInTheDocument();
      });
      expect(api.assignments.create).not.toHaveBeenCalled();

      fireEvent.click(within(pop).getByRole('button', { name: /^confirm$/i }));

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

      const alphaRow = screen.getByText('Project Alpha').closest('.requirements-row') as HTMLElement;
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

      const alphaRow = screen.getByText('Project Alpha').closest('.requirements-row') as HTMLElement;
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

      const betaRow = screen.getByText('Project Beta').closest('.requirements-row') as HTMLElement;
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

      const alphaRow = screen.getByText('Project Alpha').closest('.requirements-row') as HTMLElement;
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

      const childRow = screen.getByText('Portal Login Rework').closest('.requirements-row') as HTMLElement;
      expect(childRow.querySelector('.req-kloc-num')!.textContent).toBe('4K');
      expect(childRow.querySelector('.req-effort-num')!.textContent).toBe('8');

      const betaRow = screen.getByText('Project Beta').closest('.requirements-row') as HTMLElement;
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

      const childRow = screen.getByText('Portal Login Rework').closest('.requirements-row') as HTMLElement;
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

      const srRow = screen.getByText('Project Alpha').closest('.requirements-row') as HTMLElement;
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

      const srRow = screen.getByText('Project Alpha').closest('.requirements-row') as HTMLElement;
      // 规模/人力: 仅 proj-1a 有评估 4K/8pm;SR 自身无值 → 子行聚合推导,带 Σ 标记(db7dfb4)
      expect(srRow.querySelector('.req-kloc-num')!.textContent).toBe('Σ4K');
      expect(srRow.querySelector('.req-effort-num')!.textContent).toBe('Σ8');
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
      const srRow = screen.getByText('Project Alpha').closest('.requirements-row') as HTMLElement;
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
      const betaRow2 = screen.getByText('Project Beta').closest('.requirements-row') as HTMLElement;
      expect(within(betaRow2).getByText('CAP-2')).toBeInTheDocument();

      // 子行(AR): 空 → 填 AR 号
      const childRow2 = screen.getByText('Portal Home Rework').closest('.requirements-row') as HTMLElement;
      fireEvent.click(childRow2.querySelector('.req-number-part')!);
      const input = await within(childRow2).findByRole('textbox');
      await user.type(input, 'AR-2026-999{Enter}');
      await waitFor(() => {
        expect(api.projects.update).toHaveBeenCalledWith('proj-1b', { external_number: 'AR-2026-999' });
      });

      // 顶层行(混排: 本身就可能是 SR 或 AR 粒度): 填 SR 号
      const betaRow = screen.getByText('Project Beta').closest('.requirements-row') as HTMLElement;
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
      await waitFor(() => { // debounced filter
        expect(screen.getByText('Portal Login Rework')).toBeInTheDocument();
        expect(screen.queryByText('Project Beta')).not.toBeInTheDocument();
      });
      expect(screen.getByText('Project Alpha')).toBeInTheDocument();
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
      localStorage.setItem('req-col-widths-v5', JSON.stringify({ version: 100, priority: 80 }));
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      const table = screen.getByTestId('requirements-table');
      expect(table.style.getPropertyValue('--req-w-version')).toBe('100px');
      expect(table.style.getPropertyValue('--req-w-priority')).toBe('80px');
      // 默认宽以 REQ_COLUMNS 为准: name 186(v5 列集,前置选择列让位)
      expect(table.style.getPropertyValue('--req-w-name')).toBe('186px');
    });

    test('dragging the name column just sets its width (direct width, no elastic)', async () => {
      localStorage.setItem('req-col-widths-v5', JSON.stringify({ name: 150 }));
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
      localStorage.setItem('req-col-widths-v5', JSON.stringify({ component: 200 }));
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
      localStorage.setItem('req-col-widths-v5', JSON.stringify({ component: 150 }));
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
      expect(JSON.parse(localStorage.getItem('req-col-widths-v5')!)).toEqual({});
    });
  });

  describe('Operations', () => {
    test('edit icon opens the project modal', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      const alphaRow = screen.getByText('Project Alpha').closest('.requirements-row') as HTMLElement;
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

      const alphaRow = screen.getByText('Project Alpha').closest('.requirements-row') as HTMLElement;
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
      await waitFor(() => { // debounced filter
        expect(screen.getByText(/No matching items/)).toBeInTheDocument();
      });

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
      const alphaRow = screen.getByText('Project Alpha').closest('.requirements-row') as HTMLElement;
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
      await waitFor(() => { // debounced: filter applies after the 150ms quiet window
        expect(screen.getByText('Portal Login Rework')).toBeInTheDocument();
        expect(screen.queryByText('Project Beta')).not.toBeInTheDocument();
      });
      expect(screen.getByText('Project Alpha')).toBeInTheDocument();
    });

    test('search by reference code locates the row (#序号)', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      // CAP-1 = seq_number 精确命中 Alpha(#N 旧格式仍兼容)
      await user.type(screen.getByTestId('search-input'), 'CAP-1');
      await waitFor(() => { // debounced filter
        expect(screen.queryByText('Project Beta')).not.toBeInTheDocument();
      });
      expect(screen.getByText('Project Alpha')).toBeInTheDocument();
    });

    test('lifecycle filter passes through to the API', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('lifecycle-filter')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('lifecycle-filter'), { target: { value: 'designing' } });

      await waitFor(() => {
        // the board fetches from board-feed (P7 single-request source)
        expect(api.projects.boardFeed).toHaveBeenLastCalledWith(
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
      (api.projects.boardFeed as jest.Mock).mockRejectedValueOnce(new Error('Failed to load'));
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toBeInTheDocument();
      });
    });

    test('shows empty state when no demand items', async () => {
      (api.projects.boardFeed as jest.Mock).mockResolvedValueOnce({ data: { data: { data: [], total: 0 } } });
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('No requirements')).toBeInTheDocument();
      });
    });
  });

  // 2026-10-11 批量选择与批量操作: 统一闭包(勾 SR=整棵子树),条上计数=作用行数
  describe('Bulk selection & operations (批量选择)', () => {
    const rowCheckbox = (index: number) =>
      document.querySelectorAll('.requirements-row .req-select .req-checkbox')[index] as HTMLElement;
    const headerCheckbox = () =>
      document.querySelector('.requirements-thead .req-select .req-checkbox') as HTMLElement;
    /** 行序(平铺排序后): 0=Beta(plain P1) 1=Alpha(SR) 2=1a(child) 3=1b(child) */

    test('checking an SR selects its whole subtree — bar counts children too', async () => {
      renderComponent();
      await waitFor(() => expect(screen.getByText('Project Alpha')).toBeInTheDocument());

      fireEvent.click(rowCheckbox(1)); // SR 行
      expect(screen.getByTestId('req-bulk-bar')).toBeInTheDocument();
      // 闭包: proj-1 + 1a + 1b = 3 项
      expect(screen.getByTestId('req-bulk-bar').textContent).toContain('3 selected');
      expect(rowCheckbox(1).dataset.state).toBe('checked');
      expect(rowCheckbox(2).dataset.state).toBe('checked');
      // aria 计数=子项数,不含 SR 自身(审视#5: 原先多报 1)
      expect(rowCheckbox(1).getAttribute('aria-label')).toContain('2 child items');
    });

    test('partial subtree → SR & header show indeterminate; header select-all covers all rows', async () => {
      renderComponent();
      await waitFor(() => expect(screen.getByText('Project Alpha')).toBeInTheDocument());

      fireEvent.click(rowCheckbox(2)); // 仅子行 1a
      expect(rowCheckbox(1).dataset.state).toBe('indeterminate');
      expect(headerCheckbox().dataset.state).toBe('indeterminate');
      expect(screen.getByTestId('req-bulk-bar').textContent).toContain('1 selected');

      fireEvent.click(headerCheckbox()); // 全选当前筛选
      expect(screen.getByTestId('req-bulk-bar').textContent).toContain('4 selected');
      expect(headerCheckbox().dataset.state).toBe('checked');

      fireEvent.click(headerCheckbox()); // 再点全清
      expect(screen.queryByTestId('req-bulk-bar')).not.toBeInTheDocument();
    });

    test('checkbox click does not navigate (row click still opens detail)', async () => {
      renderComponent();
      await waitFor(() => expect(screen.getByText('Project Alpha')).toBeInTheDocument());

      fireEvent.click(rowCheckbox(0));
      expect(mockNavigate).not.toHaveBeenCalled();
      fireEvent.click(document.querySelectorAll('.requirements-row')[0]);
      expect(mockNavigate).toHaveBeenCalled();
    });

    test('batch priority applies to the full selection via batch-update', async () => {
      renderComponent();
      await waitFor(() => expect(screen.getByText('Project Alpha')).toBeInTheDocument());

      fireEvent.click(rowCheckbox(0)); // Beta
      fireEvent.click(screen.getByTestId('bulk-priority-btn'));
      await waitFor(() => {
        expect(document.querySelector('[data-testid="bulk-priority-btn-popover"]')).toBeInTheDocument();
      });
      const p1Item = Array.from(
        document.querySelectorAll('[data-testid="bulk-priority-btn-popover"] .cell-pop-item')
      ).find((b) => b.textContent?.includes('P1')) as HTMLElement;
      fireEvent.click(p1Item);

      await waitFor(() => {
        expect(api.projects.batchUpdate).toHaveBeenCalledWith(['proj-2'], { priority: 1 });
      });
    });

    test('batch version: input applies; empty input offers explicit clear', async () => {
      renderComponent();
      await waitFor(() => expect(screen.getByText('Project Alpha')).toBeInTheDocument());

      fireEvent.click(rowCheckbox(0));
      fireEvent.click(screen.getByTestId('bulk-product_version-btn'));
      await waitFor(() => {
        expect(document.querySelector('.bulk-version-input')).toBeInTheDocument();
      });
      const input = document.querySelector('.bulk-version-input') as HTMLInputElement;
      // 空输入 → 按钮文案显式"清空 N 项"(准破坏性可见)
      const applyBtn = () => document.querySelector('.bulk-apply-btn') as HTMLElement;
      expect(applyBtn().textContent).toContain('Clear 1 items');

      fireEvent.change(input, { target: { value: 'B' } });
      expect(applyBtn().textContent).toContain('Apply to 1 items');
      fireEvent.click(applyBtn());

      await waitFor(() => {
        expect(api.projects.batchUpdate).toHaveBeenCalledWith(['proj-2'], { product_version: 'B' });
      });
    });

    test('batch tags: add chips submit add/remove sets; remove section lists tags on selection', async () => {
      renderComponent();
      await waitFor(() => expect(screen.getByText('Project Alpha')).toBeInTheDocument());

      fireEvent.click(rowCheckbox(1)); // SR 子树( proj-1 带 Reserved/Urgent 标签)
      fireEvent.click(screen.getByTestId('bulk-tags-btn'));
      await waitFor(() => {
        expect(document.querySelector('[data-testid="bulk-tags-btn-popover"]')).toBeInTheDocument();
      });
      // 移除段候选=选中项身上的标签(Reserved 在 mock tags 里);
      // 按段圈定——add 段同名 chip 也在 DOM,不能混点
      const removeSection = Array.from(document.querySelectorAll('.bulk-tags-section'))[1];
      const removeChips = Array.from(removeSection.querySelectorAll('.bulk-tag-chip'))
        .filter((c) => c.textContent?.includes('Reserved'));
      expect(removeChips.length).toBeGreaterThan(0);

      fireEvent.click(removeChips[0]); // 加入移除集(chip 变红)
      fireEvent.click(document.querySelector('.bulk-apply-btn')!);

      await waitFor(() => {
        expect(api.projects.batchUpdate).toHaveBeenCalledWith(
          ['proj-1', 'proj-1a', 'proj-1b'],
          { add_tag_ids: [], remove_tag_ids: ['1'] }
        );
      });
    });

    test('batch iteration sends full id list (server skips SR rows)', async () => {
      renderComponent();
      await waitFor(() => expect(screen.getByText('Project Alpha')).toBeInTheDocument());

      fireEvent.click(rowCheckbox(1)); // SR 子树
      fireEvent.click(screen.getByTestId('bulk-iteration-btn'));
      // 迭代列表是异步 query——等目标项渲染出来再点
      await waitFor(() => {
        const hit = Array.from(
          document.querySelectorAll('[data-testid="bulk-iteration-btn-popover"] .cell-pop-item')
        ).find((b) => b.textContent?.includes('Iter 2026-11'));
        expect(hit).toBeInTheDocument();
      });
      const iterItem = Array.from(
        document.querySelectorAll('[data-testid="bulk-iteration-btn-popover"] .cell-pop-item')
      ).find((b) => b.textContent?.includes('Iter 2026-11')) as HTMLElement;
      fireEvent.click(iterItem);

      await waitFor(() => {
        expect(api.projects.batchUpdate).toHaveBeenCalledWith(
          ['proj-1', 'proj-1a', 'proj-1b'],
          { iteration_id: 'iter-11' }
        );
      });
    });

    test('batch delete is two-click confirm, then clears selection', async () => {
      (api.projects.batchDelete as jest.Mock).mockResolvedValueOnce({
        data: { deleted: 1, items: [{ id: 'proj-2', name: 'Project Beta' }] }
      });
      renderComponent();
      await waitFor(() => expect(screen.getByText('Project Alpha')).toBeInTheDocument());

      fireEvent.click(rowCheckbox(0)); // Beta
      const delBtn = screen.getByTestId('bulk-delete-btn');
      expect(delBtn.textContent).toBe('Delete');
      fireEvent.click(delBtn); // 第一次: 进入确认态
      expect(delBtn.textContent).toContain('Delete 1?'); // U18: 确认文案带 SR/AR 构成
      fireEvent.click(delBtn); // 第二次: 执行

      await waitFor(() => {
        expect(api.projects.batchDelete).toHaveBeenCalledWith(['proj-2']);
      });
      // 删除成功后选择清除,条退场
      await waitFor(() => {
        expect(screen.queryByTestId('req-bulk-bar')).not.toBeInTheDocument();
      });
    });

    test('row-level delete reconciles selection — dead ids never enter a batch payload (审视#1)', async () => {
      // 数据源可变: 删除成功后刷新返回不含已删行的列表(对账的输入)
      let current = mockProjects;
      (api.projects.list as jest.Mock).mockImplementation(() => Promise.resolve({ data: { data: current } }));
      (api.projects.boardFeed as jest.Mock).mockImplementation(() =>
        Promise.resolve({ data: { data: { data: current, total: current.length } } }));
      (api.projects.delete as jest.Mock).mockImplementation((id: string) => {
        current = current.filter((p) => p.id !== id);
        return Promise.resolve({ data: {} });
      });
      renderComponent();
      await waitFor(() => expect(screen.getByText('Project Alpha')).toBeInTheDocument());

      fireEvent.click(rowCheckbox(2)); // 1a
      fireEvent.click(rowCheckbox(3)); // 1b
      expect(screen.getByTestId('req-bulk-bar').textContent).toContain('2 selected');

      // 行内两击删除 1a(不经批量条)——原先死 id 留在选择集毒化后续批量
      const delBtn = document.querySelectorAll('.requirements-row .req-icon-btn[title="Delete"]')[2] as HTMLElement;
      fireEvent.click(delBtn);
      fireEvent.click(delBtn); // 确认击
      await waitFor(() => expect(api.projects.delete).toHaveBeenCalledWith('proj-1a'));

      // 对账: 死 id 移出选择集,条计数回落(全有或全无的 400 不再可能)
      await waitFor(() => expect(screen.getByTestId('req-bulk-bar').textContent).toContain('1 selected'));
    });

    test('tags add/remove same tag: one side disables the other (server remove-wins made visible, 审视#7)', async () => {
      renderComponent();
      await waitFor(() => expect(screen.getByText('Project Alpha')).toBeInTheDocument());

      fireEvent.click(rowCheckbox(1)); // Alpha 子树(行上有 Reserved 标签)
      fireEvent.click(screen.getByTestId('bulk-tags-btn'));
      await waitFor(() => expect(screen.getByTestId('bulk-tags-btn-popover')).toBeInTheDocument());

      const pop = screen.getByTestId('bulk-tags-btn-popover');
      const sections = pop.querySelectorAll('.bulk-tags-section');
      const addChip = [...sections[0].querySelectorAll('.bulk-tag-chip')]
        .find((c) => c.textContent?.includes('Reserved')) as HTMLButtonElement;
      const removeChip = [...sections[1].querySelectorAll('.bulk-tag-chip')]
        .find((c) => c.textContent?.includes('Reserved')) as HTMLButtonElement;
      expect(removeChip.disabled).toBe(false);

      fireEvent.click(addChip); // add 段勾 Reserved
      await waitFor(() => expect(removeChip.disabled).toBe(true)); // 对侧同步禁用
    });
  });
});

// ── U15 任务视图(IP-06d,2026-10-17):六视图=服务端事实的行级谓词, ──
// chips 计数与树过滤同源;个人视图 localStorage 保存/恢复/删除。
describe('Task views (U15)', () => {
  const viewRows = [
    {
      id: 'sr-1', seq_number: 11, name: 'Clean SR', parent_id: null,
      project_type_id: 'type-1', project_type_name: '需求交付', project_sub_type_name: '标准需求',
      lifecycle_state: null, lifecycle_warnings: [], tags: []
    },
    {
      id: 'ar-1a', seq_number: 12, name: 'Backlog AR', parent_id: 'sr-1',
      project_type_id: 'type-1', project_type_name: '需求交付', project_sub_type_name: '标准需求',
      lifecycle_state: 'backlog', lifecycle_warnings: [], tags: []
    },
    {
      id: 'ar-1b', seq_number: 13, name: 'Conflicted Estimate AR', parent_id: 'sr-1',
      project_type_id: 'type-1', project_type_name: '需求交付', project_sub_type_name: '标准需求',
      lifecycle_state: 'in_iteration', lifecycle_warnings: ['NO_LOC_ESTIMATE'],
      primary_dev: { person_name: '李四' }, has_conflict: true, tags: []
    },
    {
      id: 'sr-2', seq_number: 14, name: 'Rat SR', parent_id: null,
      project_type_id: 'type-1', project_type_name: '需求交付', project_sub_type_name: '标准需求',
      lifecycle_state: 'pending_rat', lifecycle_warnings: [],
      design_estimates: { se: 1, mde: null }, tags: []
    },
    {
      id: 'sr-3', seq_number: 15, name: 'Backfill SR', parent_id: null,
      project_type_id: 'type-1', project_type_name: '需求交付', project_sub_type_name: '标准需求',
      lifecycle_state: 'delivered', lifecycle_warnings: ['DESIGN_NOT_BACKFILLED'],
      primary_dev: { person_name: '王五' }, tags: []
    }
  ];

  const renderBoard = () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <Projects />
      </QueryClientProvider>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    (useScenario as jest.Mock).mockReturnValue({
      currentScenario: { id: 'baseline-0000-0000-0000-000000000000', name: 'Baseline' }
    });
    (api.projects.boardFeed as jest.Mock).mockResolvedValue({
      data: { data: { data: viewRows, total: viewRows.length } }
    });
    (api.projects.list as jest.Mock).mockResolvedValue({ data: { data: viewRows } });
    (api.tags.list as jest.Mock).mockResolvedValue({ data: { data: [] } });
    (api.projects.update as jest.Mock).mockResolvedValue({ data: {} });
    (api.projects.delete as jest.Mock).mockResolvedValue({ data: {} });
    (api.projects.batchDelete as jest.Mock).mockResolvedValue({ data: { deleted: 0, items: [] } });
    (api.projects.batchUpdate as jest.Mock).mockResolvedValue({ data: { updated: 0, skipped: 0, items: [] } });
    (api.roles.list as jest.Mock).mockResolvedValue({ data: [] });
    (api.people.list as jest.Mock).mockResolvedValue({ data: { data: [] } });
    (api.people.getUtilization as jest.Mock).mockResolvedValue({ data: [] });
    (api.iterations.list as jest.Mock).mockResolvedValue({ data: { data: [] } });
  });

  test('六 chips 计数来自行级事实(一每视图),与树过滤同源', async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText('Clean SR')).toBeInTheDocument());

    expect(screen.getByTestId('task-view-pendingDecision').textContent).toContain('1');
    expect(screen.getByTestId('task-view-pendingEstimate').textContent).toContain('1');
    expect(screen.getByTestId('task-view-pendingStaffing').textContent).toContain('1');
    expect(screen.getByTestId('task-view-hasConflict').textContent).toContain('1');
    expect(screen.getByTestId('task-view-pendingSchedule').textContent).toContain('1');
    expect(screen.getByTestId('task-view-pendingBackfill').textContent).toContain('1');
  });

  test('点 chip 过滤=树语义(命中 AR 的整树保留为上下文,含未命中兄弟),再点取消恢复', async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText('Clean SR')).toBeInTheDocument());
    expect(screen.getByText('Conflicted Estimate AR')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('task-view-pendingSchedule'));
    // 命中树(srp-1)整棵保留: 命中 AR + SR 上下文 + 未命中兄弟 AR(上下文行,
    // 命中/上下文的视觉区分属 U19);其他树整棵隐藏
    await waitFor(() => expect(screen.queryByText('Rat SR')).not.toBeInTheDocument());
    expect(screen.getByText('Backlog AR')).toBeInTheDocument();
    expect(screen.getByText('Clean SR')).toBeInTheDocument();
    expect(screen.getByText('Conflicted Estimate AR')).toBeInTheDocument();
    expect(screen.queryByText('Backfill SR')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('task-view-pendingSchedule')); // 再点取消
    await waitFor(() => expect(screen.getByText('Rat SR')).toBeInTheDocument());
    expect(screen.getByText('Conflicted Estimate AR')).toBeInTheDocument();
  });

  test('chips 与属性筛选 AND 组合;reset 一并清任务视图', async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText('Clean SR')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('task-view-hasConflict'));
    await waitFor(() => expect(screen.getByText('Conflicted Estimate AR')).toBeInTheDocument());
    expect(screen.queryByText('Rat SR')).not.toBeInTheDocument();

    // reset 出现(任务视图活跃即计入)并清空两者
    fireEvent.click(screen.getByTestId('reset-filters'));
    await waitFor(() => expect(screen.getByText('Rat SR')).toBeInTheDocument());
    expect(screen.getByText('Conflicted Estimate AR')).toBeInTheDocument();
  });

  test('个人视图:保存当前(任务视图+属性筛选)→改动→恢复→删除', async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText('Clean SR')).toBeInTheDocument());

    // 组合一个上下文:任务视图 pendingBackfill + 生命周期筛选
    fireEvent.click(screen.getByTestId('task-view-pendingBackfill'));
    await waitFor(() => expect(screen.queryByText('Rat SR')).not.toBeInTheDocument());
    fireEvent.change(screen.getByTestId('lifecycle-filter'), { target: { value: 'delivered' } });
    // lifecycle 键换→重取→骨架屏一瞬: 等"筛后内容"而非"目标消失"(消失在骨架态假真)
    await waitFor(() => expect(screen.getByText('Backfill SR')).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText('Clean SR')).not.toBeInTheDocument());

    // 保存为 'my-queue'
    fireEvent.click(screen.getByTestId('personal-view-save'));
    fireEvent.change(screen.getByTestId('personal-view-name'), { target: { value: 'my-queue' } });
    fireEvent.click(screen.getByTestId('personal-view-confirm'));
    await waitFor(() => {
      const sel = screen.getByTestId('personal-view-select') as HTMLSelectElement;
      expect([...sel.options].some((o) => o.value === 'my-queue')).toBe(true);
    });

    // 打散上下文
    fireEvent.click(screen.getByTestId('reset-filters'));
    await waitFor(() => expect(screen.getByText('Rat SR')).toBeInTheDocument());

    // 恢复 my-queue(回放任务视图+筛选,lifecycle 键换再等一轮内容)
    fireEvent.change(screen.getByTestId('personal-view-select'), { target: { value: 'my-queue' } });
    await waitFor(() => expect(screen.getByText('Backfill SR')).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText('Rat SR')).not.toBeInTheDocument());
    expect((screen.getByTestId('lifecycle-filter') as HTMLSelectElement).value).toBe('delivered');

    // 删除
    fireEvent.click(screen.getByTestId('personal-view-delete'));
    await waitFor(() => {
      const sel = screen.getByTestId('personal-view-select') as HTMLSelectElement;
      expect([...sel.options].some((o) => o.value === 'my-queue')).toBe(false);
    });
  });

  test('localStorage 按 profile 分键:不同 currentUser 互不可见', async () => {
    window.localStorage.setItem('capacinator-req-personal-views:user-a',
      JSON.stringify([{ name: 'shared', taskView: 'hasConflict', filters: {} }]));
    renderBoard(); // 测试环境无 UserProvider → currentUser null → default 键
    await waitFor(() => expect(screen.getByText('Clean SR')).toBeInTheDocument());
    const sel = screen.getByTestId('personal-view-select') as HTMLSelectElement;
    expect([...sel.options].some((o) => o.value === 'shared')).toBe(false);
  });
});

// ── U16 列预设+行详情(IP-06d,2026-10-18): 预设=JS 渲染驱动隐藏(默认档走 ──
// CSS 媒体查询,零回归);选择/名称/状态三列任何预设不藏;隐藏字段由可键盘
// 到达的行详情侧栏承接,不靠 title。
// 档位确定性:某前序测试将 innerWidth 设 1700 未还原——本 describe 显式
// 钉 1700(全列档,无档位隐藏),断言纯预设集语义(∪空集)。
describe('Column presets & row detail (U16)', () => {
  const u16Rows = [
    {
      id: 'sr-u16', seq_number: 21, name: 'U16 Feature SR', parent_id: null,
      project_type_id: 'type-1', project_type_name: '需求交付', project_sub_type_name: '标准需求',
      lifecycle_state: 'in_iteration',
      lifecycle_warnings: ['NO_LOC_ESTIMATE', 'DEV_NO_MDE'],
      external_number: 'SR-2026-777', component: 'HCCL_驱动组',
      product_version: 'B', release_version: '26.RP4', priority: 2,
      estimation_summary: { kloc: 4, pm: 8 },
      design_estimates: { se: 0.5, mde: null },
      se_assignment: { person_name: '陈设计', allocation_pct: 25 },
      mde_assignment: null,
      primary_dev: { person_name: '李开发', allocation_pct: 100 },
      iteration: { id: 'it-1', name: '26FW43', start_date: '2026-10-19', end_date: '2026-11-16' },
      tags: [{ id: 1, name: 'Reserved', color: '#f59e0b' }]
    },
    {
      id: 'ar-u16', seq_number: 22, name: 'U16 Child AR', parent_id: 'sr-u16',
      project_type_id: 'type-1', project_type_name: '需求交付', project_sub_type_name: '标准需求',
      lifecycle_state: 'scheduled', lifecycle_warnings: [],
      external_number: 'AR-2026-778', component: 'HCCL_驱动组',
      product_version: 'B', release_version: '26.RP4', priority: 3,
      tags: []
    }
  ];

  const renderBoard = () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <Projects />
      </QueryClientProvider>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1700 });
    (useScenario as jest.Mock).mockReturnValue({
      currentScenario: { id: 'baseline-0000-0000-0000-000000000000', name: 'Baseline' }
    });
    (api.projects.boardFeed as jest.Mock).mockResolvedValue({
      data: { data: { data: u16Rows, total: u16Rows.length } }
    });
    (api.projects.list as jest.Mock).mockResolvedValue({ data: { data: u16Rows } });
    (api.tags.list as jest.Mock).mockResolvedValue({ data: { data: [] } });
    (api.projects.update as jest.Mock).mockResolvedValue({ data: {} });
    (api.projects.delete as jest.Mock).mockResolvedValue({ data: {} });
    (api.projects.batchDelete as jest.Mock).mockResolvedValue({ data: { deleted: 0, items: [] } });
    (api.projects.batchUpdate as jest.Mock).mockResolvedValue({ data: { updated: 0, skipped: 0, items: [] } });
    (api.roles.list as jest.Mock).mockResolvedValue({ data: [] });
    (api.people.list as jest.Mock).mockResolvedValue({ data: { data: [] } });
    (api.people.getUtilization as jest.Mock).mockResolvedValue({ data: [] });
    (api.iterations.list as jest.Mock).mockResolvedValue({ data: { data: [] } });
  });

  const HEADER_LABELS: Record<string, string> = {
    name: 'Name', number: 'Number', component: 'Component', lifecycle: 'Lifecycle',
    kloc: 'KLOC', effort: 'Effort(pm)', se: 'SE', mde: 'MDE',
    version: 'Version', release: 'Release', iter: 'Iteration', priority: 'Priority', primary: 'Primary Dev'
  };
  const setPreset = (v: string) =>
    fireEvent.change(screen.getByTestId('col-preset-select'), { target: { value: v } });

  const headText = () => document.querySelector('.requirements-thead')?.textContent ?? '';

  test('默认档: 全列表头在 DOM(档位视觉隐藏由 CSS 管,与既有行为一致)', async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText('U16 Feature SR')).toBeInTheDocument());
    for (const label of Object.values(HEADER_LABELS)) {
      expect(headText()).toContain(label);
    }
  });

  test('评估预设: 藏 组件/迭代/实名(+紧凑档编号/交付),名称与状态受保护', async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText('U16 Feature SR')).toBeInTheDocument());
    setPreset('estimate');
    await waitFor(() => expect(headText()).not.toContain('Component'));
    // 预设集(1700 全列档∪空集): component/iter/primary 藏
    expect(headText()).not.toContain('Primary Dev');
    expect(headText()).not.toContain('Iteration');
    // 非预设列仍在(1700 档无联合隐藏)
    expect(headText()).toContain('Number');
    expect(headText()).toContain('Release');
    // 受保护三列 + 评估域列仍在
    expect(headText()).toContain('Name');
    expect(headText()).toContain('Lifecycle');
    expect(headText()).toContain('KLOC');
    expect(headText()).toContain('SE');
    expect(headText()).toContain('MDE');
    // 隐藏列的单元格也从行 DOM 消失(不是仅视觉隐藏)
    expect(document.querySelector('.requirements-component-btn')).toBeNull();
  });

  test('配人预设: 藏 编号/组件/版本/RP/迭代(+档位),SE/MDE/实名投入保留', async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText('U16 Feature SR')).toBeInTheDocument());
    setPreset('staffing');
    await waitFor(() => expect(headText()).not.toContain('Version'));
    expect(headText()).not.toContain('Number');
    expect(headText()).not.toContain('Release');
    expect(headText()).not.toContain('Iteration');
    expect(headText()).toContain('Primary Dev'); // 配人域列(1700 档无联合隐藏)
    expect(headText()).toContain('SE');
    expect(headText()).toContain('MDE');
    expect(headText()).toContain('Name');
    expect(headText()).toContain('Lifecycle');
  });

  test('交付预设: 藏 编号/组件/规模/人力/SE/MDE,版本/RP/迭代保留', async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText('U16 Feature SR')).toBeInTheDocument());
    setPreset('delivery');
    await waitFor(() => expect(headText()).not.toContain('KLOC'));
    expect(headText()).not.toContain('Effort(pm)');
    expect(headText()).not.toContain('SE');
    expect(headText()).not.toContain('MDE');
    expect(headText()).not.toContain('Number');
    expect(headText()).not.toContain('Component');
    expect(headText()).toContain('Version');
    expect(headText()).toContain('Lifecycle');
    expect(headText()).toContain('Priority');
  });

  test('预设持久化 + 恢复默认', async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText('U16 Feature SR')).toBeInTheDocument());
    setPreset('estimate');
    await waitFor(() => expect(headText()).not.toContain('Component'));
    expect(window.localStorage.getItem('req-col-preset-v1')).toBe('"estimate"');

    setPreset('default');
    await waitFor(() => expect(headText()).toContain('Component'));
    expect(window.localStorage.getItem('req-col-preset-v1')).toBe('"default"');
  });

  test('行详情:按钮打开侧栏,隐藏字段(编号/组件/完整告警)可见,Esc 关闭', async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText('U16 Feature SR')).toBeInTheDocument());

    fireEvent.click(screen.getAllByTestId('row-detail-btn')[0]);
    const drawer = await waitFor(() => screen.getByTestId('row-detail-drawer'));
    // 隐藏字段在侧栏完整可见——不再只靠 title(within 收窄:行内编号按钮同文)
    expect(within(drawer).getByText('SR-2026-777')).toBeInTheDocument();
    expect(within(drawer).getByText('HCCL_驱动组')).toBeInTheDocument();
    // 完整告警文案(不是截断 chip)
    expect(drawer.textContent).toContain('Scheduled / in iteration but no LOC estimation');
    expect(drawer.textContent).toContain('Primary dev assigned but no MDE pairing');
    // 迭代窗口与实名投入
    expect(drawer.textContent).toContain('26FW43');
    expect(drawer.textContent).toContain('李开发');
    // 键盘: Esc 关闭(监听在 document 上)
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('row-detail-drawer')).not.toBeInTheDocument());
  });

  test('SR 行详情列出子行名称', async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText('U16 Feature SR')).toBeInTheDocument());
    // 展开树(默认展开?——先点开 SR 折叠钮保险),再开 SR 详情
    fireEvent.click(screen.getAllByTestId('row-detail-btn')[0]);
    await waitFor(() => screen.getByTestId('row-detail-drawer'));
    // SR 的详情含子行清单
    expect(screen.getByTestId('row-detail-drawer').textContent).toContain('U16 Child AR');
  });
});

// ── U17 可操作告警(IP-06d,2026-10-18): chip 点击打开问题面板(侧栏聚焦告警 ──
// 区),每条告警含原因/排产影响/推荐动作+对应字段定位;“只看同类”接入属性
// 筛选管线;纯建议不设生命周期硬门禁。
describe('Actionable warnings (U17)', () => {
  const warnRows = [
    {
      id: 'sr-w17', seq_number: 31, name: 'Warned SR', parent_id: null,
      project_type_id: 'type-1', project_type_name: '需求交付', project_sub_type_name: '标准需求',
      lifecycle_state: 'in_iteration',
      lifecycle_warnings: ['NO_LOC_ESTIMATE', 'DEV_NO_MDE'],
      external_number: null, component: null,
      tags: []
    },
    {
      id: 'ar-w17', seq_number: 32, name: 'Peer AR', parent_id: 'sr-w17',
      project_type_id: 'type-1', project_type_name: '需求交付', project_sub_type_name: '标准需求',
      lifecycle_state: 'in_iteration', lifecycle_warnings: ['NO_LOC_ESTIMATE'],
      tags: []
    },
    {
      id: 'sr-clean', seq_number: 33, name: 'Clean Peer SR', parent_id: null,
      project_type_id: 'type-1', project_type_name: '需求交付', project_sub_type_name: '标准需求',
      lifecycle_state: 'designing', lifecycle_warnings: [],
      tags: []
    }
  ];

  const renderBoard = () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <Projects />
      </QueryClientProvider>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1700 });
    (useScenario as jest.Mock).mockReturnValue({
      currentScenario: { id: 'baseline-0000-0000-0000-000000000000', name: 'Baseline' }
    });
    (api.projects.boardFeed as jest.Mock).mockResolvedValue({
      data: { data: { data: warnRows, total: warnRows.length } }
    });
    (api.projects.list as jest.Mock).mockResolvedValue({ data: { data: warnRows } });
    (api.tags.list as jest.Mock).mockResolvedValue({ data: { data: [] } });
    (api.projects.update as jest.Mock).mockResolvedValue({ data: {} });
    (api.projects.delete as jest.Mock).mockResolvedValue({ data: {} });
    (api.projects.batchDelete as jest.Mock).mockResolvedValue({ data: { deleted: 0, items: [] } });
    (api.projects.batchUpdate as jest.Mock).mockResolvedValue({ data: { updated: 0, skipped: 0, items: [] } });
    (api.roles.list as jest.Mock).mockResolvedValue({ data: [] });
    (api.people.list as jest.Mock).mockResolvedValue({ data: { data: [] } });
    (api.people.getUtilization as jest.Mock).mockResolvedValue({ data: [] });
    (api.iterations.list as jest.Mock).mockResolvedValue({ data: { data: [] } });
  });

  test('告警 chip 点击打开侧栏并聚焦告警区(不再只靠悬停 title)', async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText('Warned SR')).toBeInTheDocument());
    // chip 是可聚焦按钮
    const chip = document.querySelector('.lifecycle-warn-chip') as HTMLElement;
    expect(chip.tagName).toBe('BUTTON');
    fireEvent.click(chip);
    await waitFor(() => expect(screen.getByTestId('row-detail-drawer')).toBeInTheDocument());
    // 聚焦标志: 告警区滚动目标存在
    expect(document.querySelector('[data-warn-section]')).not.toBeNull();
  });

  test('告警卡片含 原因/排产影响/推荐动作 三段 + 对应字段高亮', async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText('Warned SR')).toBeInTheDocument());
    fireEvent.click(document.querySelector('.lifecycle-warn-chip') as HTMLElement);
    const drawer = await waitFor(() => screen.getByTestId('row-detail-drawer'));
    // 原因(已有全文)
    expect(drawer.textContent).toContain('Scheduled / in iteration but no LOC estimation');
    // 排产影响 + 推荐动作(本批新增文案)
    expect(drawer.textContent).toContain('Dev demand unknown');
    expect(drawer.textContent).toContain('Fill the LOC estimate');
    // 对应字段高亮: NO_LOC_ESTIMATE → KLOC 字段卡带 locate 类
    const klocField = drawer.querySelector('[data-field="kloc"]');
    expect(klocField?.className).toContain('row-detail-field--locate');
  });

  test('“只看同类”过滤看板:点 NO_LOC_ESTIMATE 后只剩命中树,清筛选恢复', async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText('Warned SR')).toBeInTheDocument());
    fireEvent.click(document.querySelector('.lifecycle-warn-chip') as HTMLElement);
    await waitFor(() => screen.getByTestId('row-detail-drawer'));
    // 卡片上的“只看同类”
    const sameBtn = screen.getAllByTestId('filter-same-warn')[0];
    fireEvent.click(sameBtn);
    await waitFor(() => expect(screen.queryByTestId('row-detail-drawer')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText('Clean Peer SR')).not.toBeInTheDocument());
    expect(screen.getByText('Warned SR')).toBeInTheDocument();
    // 活跃同类筛选 pill 可见且可清(sr-w17+ar-w17 两行带该码)
    const pill = screen.getByTestId('warn-filter-pill');
    expect(pill.textContent).toContain('2');
    fireEvent.click(screen.getByTestId('warn-filter-clear'));
    await waitFor(() => expect(screen.getByText('Clean Peer SR')).toBeInTheDocument());
  });

  test('同类筛选与属性筛选 AND 组合,reset 一并清', async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText('Warned SR')).toBeInTheDocument());
    fireEvent.click(document.querySelector('.lifecycle-warn-chip') as HTMLElement);
    await waitFor(() => screen.getByTestId('row-detail-drawer'));
    fireEvent.click(screen.getAllByTestId('filter-same-warn')[0]);
    await waitFor(() => expect(screen.queryByText('Clean Peer SR')).not.toBeInTheDocument());
    fireEvent.click(screen.getByTestId('reset-filters'));
    await waitFor(() => expect(screen.getByText('Clean Peer SR')).toBeInTheDocument());
  });
});

// ── U18 批量选择可见性(IP-06d,2026-10-18): 条上 总数/可见/隐藏 + 选中清单 ──
// (点击定位=清筛选+滚到行+flash) + 清除隐藏;版本/迭代/删除弹层预检摘要
// (SR/AR 数、值分布、跳过数、可计算冲突徽章)。
describe('Bulk selection visibility (U18)', () => {
  const u18Rows = [
    {
      id: 'sr-u18a', seq_number: 41, name: 'Bulk SR A', parent_id: null,
      project_type_id: 'type-1', project_type_name: '需求交付', project_sub_type_name: '标准需求',
      lifecycle_state: 'backlog', lifecycle_warnings: [],
      product_version: 'B', release_version: '26.RP4', priority: 2, tags: []
    },
    {
      id: 'ar-u18a', seq_number: 42, name: 'Bulk AR A1', parent_id: 'sr-u18a',
      project_type_id: 'type-1', project_type_name: '需求交付', project_sub_type_name: '标准需求',
      lifecycle_state: 'backlog', lifecycle_warnings: [],
      product_version: '', release_version: '', priority: 3,
      primary_dev: { person_name: '李开发', end_date: '2026-12-31' }, tags: []
    },
    {
      id: 'sr-u18b', seq_number: 43, name: 'Bulk SR B', parent_id: null,
      project_type_id: 'type-1', project_type_name: '需求交付', project_sub_type_name: '定制需求',
      lifecycle_state: 'backlog', lifecycle_warnings: [],
      product_version: 'A', release_version: '', priority: 1, tags: []
    }
  ];

  const renderBoard = () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <Projects />
      </QueryClientProvider>
    );
  };

  const rowCheckbox = (idx: number) =>
    document.querySelectorAll('.requirements-row .req-select input, .requirements-row .req-select [role="checkbox"], .requirements-row .req-select button')[idx];

  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1700 });
    (useScenario as jest.Mock).mockReturnValue({
      currentScenario: { id: 'baseline-0000-0000-0000-000000000000', name: 'Baseline' }
    });
    (api.projects.boardFeed as jest.Mock).mockResolvedValue({
      data: { data: { data: u18Rows, total: u18Rows.length } }
    });
    (api.projects.list as jest.Mock).mockResolvedValue({ data: { data: u18Rows } });
    (api.tags.list as jest.Mock).mockResolvedValue({ data: { data: [] } });
    (api.projects.update as jest.Mock).mockResolvedValue({ data: {} });
    (api.projects.delete as jest.Mock).mockResolvedValue({ data: {} });
    (api.projects.batchDelete as jest.Mock).mockResolvedValue({ data: { deleted: 0, items: [] } });
    (api.projects.batchUpdate as jest.Mock).mockResolvedValue({ data: { updated: 0, skipped: 0, items: [] } });
    (api.roles.list as jest.Mock).mockResolvedValue({ data: [] });
    (api.people.list as jest.Mock).mockResolvedValue({ data: { data: [] } });
    (api.people.getUtilization as jest.Mock).mockResolvedValue({ data: [] });
    (api.iterations.list as jest.Mock).mockResolvedValue({
      data: { data: [
        { id: 'it-x', name: '26FW45', start_date: '2026-11-02', end_date: '2026-11-29' },
        { id: 'it-y', name: '26FW43', start_date: '2026-10-19', end_date: '2026-11-15' }
      ] }
    });
  });

  test('条上显示 总数/可见/隐藏;清除隐藏只留可见集', async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText('Bulk SR A')).toBeInTheDocument());
    // 勾两棵树(全部 3 行)——平铺序: [0]=sr-u18b(P1) [1]=sr-u18a(P2,勾=整树2行)
    const boxes = () => document.querySelectorAll('.requirements-row .req-select');
    fireEvent.click(within(boxes()[0] as HTMLElement).getByRole('checkbox'));
    fireEvent.click(within(boxes()[1] as HTMLElement).getByRole('checkbox'));
    await waitFor(() => expect(screen.getByTestId('req-bulk-bar')).toBeInTheDocument());
    expect(screen.getByTestId('req-bulk-bar').textContent).toContain('3');

    // 筛掉 SR B(子类型=定制需求只剩 sr-u18b → 不对,子类型筛选定制需求=sr-u18b 树)——
    // 用搜索词筛掉 B 树
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'Bulk SR A' } });
    await waitFor(() => expect(screen.queryByText('Bulk SR B')).not.toBeInTheDocument());
    // 条上: 总 3,可见 2(sr-u18a+ar-u18a),隐藏 1
    const barText = screen.getByTestId('req-bulk-bar').textContent;
    expect(barText).toContain('3');
    expect(barText).toMatch(/2.*1/); // 可见2 隐藏1

    fireEvent.click(screen.getByTestId('bulk-clear-hidden'));
    await waitFor(() => expect(screen.getByTestId('req-bulk-bar').textContent).not.toContain('3'));
    // 清筛选恢复全部
    fireEvent.click(screen.getByTestId('reset-filters'));
    await waitFor(() => expect(screen.getByText('Bulk SR B')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('req-bulk-bar').textContent).toContain('2'));
  });

  test('选中清单: 列名字+SR/AR;点隐藏项=清筛选+定位该行', async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText('Bulk SR A')).toBeInTheDocument());
    const boxes = () => document.querySelectorAll('.requirements-row .req-select');
    fireEvent.click(within(boxes()[0] as HTMLElement).getByRole('checkbox'));
    fireEvent.click(within(boxes()[1] as HTMLElement).getByRole('checkbox'));
    await waitFor(() => expect(screen.getByTestId('req-bulk-bar')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'Bulk SR A' } });
    await waitFor(() => expect(screen.queryByText('Bulk SR B')).not.toBeInTheDocument());

    fireEvent.click(screen.getByTestId('bulk-roster-btn'));
    const roster = await waitFor(() => screen.getByTestId('bulk-roster-btn-popover'));
    expect(roster.textContent).toContain('Bulk SR B');
    expect(roster.textContent).toContain('SR');
    expect(roster.textContent).toContain('AR');

    // 点击隐藏项 Bulk SR B → 筛选被清 + 行回到视野
    fireEvent.click(within(roster).getByText('Bulk SR B'));
    await waitFor(() => expect(screen.getByText('Bulk SR A')).toBeInTheDocument());
    expect(screen.getByText('Bulk SR B')).toBeInTheDocument();
  });

  test('版本弹层: 选中项当前值分布 + 清空后果计数', async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText('Bulk SR A')).toBeInTheDocument());
    const boxes = () => document.querySelectorAll('.requirements-row .req-select');
    fireEvent.click(within(boxes()[0] as HTMLElement).getByRole('checkbox'));
    fireEvent.click(within(boxes()[1] as HTMLElement).getByRole('checkbox'));
    await waitFor(() => expect(screen.getByTestId('req-bulk-bar')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('bulk-product_version-btn'));
    const pop = await waitFor(() => screen.getByTestId('bulk-product_version-btn-popover'));
    // 分布(选中= sr-b:A + sr-a:B + ar:空): B×1 A×1 空×1
    expect(pop.textContent).toContain('B×1');
    expect(pop.textContent).toContain('A×1');
    // 清空显式标后果: 2 项已有值将被清空
    expect(pop.textContent).toContain('2 items with a value');
  });

  test('迭代弹层: SR/AR 数 + 有子行 SR 跳过提示 + 冲突徽章(节拍不符可计算)', async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText('Bulk SR A')).toBeInTheDocument());
    const boxes = () => document.querySelectorAll('.requirements-row .req-select');
    fireEvent.click(within(boxes()[0] as HTMLElement).getByRole('checkbox'));
    fireEvent.click(within(boxes()[1] as HTMLElement).getByRole('checkbox'));
    await waitFor(() => expect(screen.getByTestId('req-bulk-bar')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('bulk-iteration-btn'));
    const pop = await waitFor(() => screen.getByTestId('bulk-iteration-btn-popover'));
    expect(pop.textContent).toContain('SR 2');
    expect(pop.textContent).toContain('AR 1');
    expect(pop.textContent).toContain('1'); // 1 个有子行 SR 将跳过
    // it-x(11 月起=26.RP4) 对 sr-u18a 的 26.RP4 不冲突;it-y(10 月起=26.RP4? 10月=Q4→26.RP4)——
    // 用 primary_dev 越窗: ar-u18a 主投入末 2026-12-31 > it-y 末 11-15 → it-y 带徽章
    const badges = pop.querySelectorAll('.bulk-iter-warn');
    expect(badges.length).toBeGreaterThan(0);
  });

  test('删除确认含 SR/AR 构成', async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText('Bulk SR A')).toBeInTheDocument());
    const boxes = () => document.querySelectorAll('.requirements-row .req-select');
    fireEvent.click(within(boxes()[1] as HTMLElement).getByRole('checkbox')); // sr-u18a 整树
    await waitFor(() => expect(screen.getByTestId('req-bulk-bar')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('bulk-delete-btn'));
    const confirmText = screen.getByTestId('bulk-delete-btn').textContent;
    expect(confirmText).toContain('SR 1');
    expect(confirmText).toContain('AR 1');
  });
});

// ── U19 命中/上下文区分(IP-06d,2026-10-18): 树语义保留的上下文行视觉弱化, ──
// 真命中高亮;计数"命中 N/连同上下文 M";筛选自动展开命中路径,清除恢复原折叠。
describe('Hit vs context distinction (U19)', () => {
  const u19Rows = [
    {
      id: 'sr-mix', seq_number: 51, name: 'Parent SR', parent_id: null,
      project_type_id: 'type-1', project_type_name: '需求交付', project_sub_type_name: '标准需求',
      lifecycle_state: 'designing', lifecycle_warnings: [], product_version: 'B', tags: []
    },
    {
      id: 'ar-hit', seq_number: 52, name: 'Payment AR hit', parent_id: 'sr-mix',
      project_type_id: 'type-1', project_type_name: '需求交付', project_sub_type_name: '标准需求',
      lifecycle_state: 'designing', lifecycle_warnings: [], product_version: 'B', tags: []
    },
    {
      id: 'ar-miss', seq_number: 53, name: 'Sibling AR', parent_id: 'sr-mix',
      project_type_id: 'type-1', project_type_name: '需求交付', project_sub_type_name: '标准需求',
      lifecycle_state: 'backlog', lifecycle_warnings: [], product_version: 'A', tags: []
    },
    {
      id: 'sr-hit', seq_number: 54, name: 'Payment standalone SR', parent_id: null,
      project_type_id: 'type-1', project_type_name: '需求交付', project_sub_type_name: '标准需求',
      lifecycle_state: 'designing', lifecycle_warnings: [], product_version: 'B', tags: []
    }
  ];

  const renderBoard = () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <Projects />
      </QueryClientProvider>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1700 });
    (useScenario as jest.Mock).mockReturnValue({
      currentScenario: { id: 'baseline-0000-0000-0000-000000000000', name: 'Baseline' }
    });
    (api.projects.boardFeed as jest.Mock).mockResolvedValue({
      data: { data: { data: u19Rows, total: u19Rows.length } }
    });
    (api.projects.list as jest.Mock).mockResolvedValue({ data: { data: u19Rows } });
    (api.tags.list as jest.Mock).mockResolvedValue({ data: { data: [] } });
    (api.projects.update as jest.Mock).mockResolvedValue({ data: {} });
    (api.projects.delete as jest.Mock).mockResolvedValue({ data: {} });
    (api.projects.batchDelete as jest.Mock).mockResolvedValue({ data: { deleted: 0, items: [] } });
    (api.projects.batchUpdate as jest.Mock).mockResolvedValue({ data: { updated: 0, skipped: 0, items: [] } });
    (api.roles.list as jest.Mock).mockResolvedValue({ data: [] });
    (api.people.list as jest.Mock).mockResolvedValue({ data: { data: [] } });
    (api.people.getUtilization as jest.Mock).mockResolvedValue({ data: [] });
    (api.iterations.list as jest.Mock).mockResolvedValue({ data: { data: [] } });
  });

  const rowClassOf = (name: string) => {
    const el = [...document.querySelectorAll('.requirements-name-text')]
      .find((e) => (e.getAttribute('title') ?? e.textContent) === name);
    return el?.closest('.requirements-row')?.className ?? '';
  };

  test('无筛选: 行无命中/上下文类;搜索后: 命中行高亮、上下文行弱化', async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText('Parent SR')).toBeInTheDocument());
    expect(rowClassOf('Parent SR')).not.toContain('requirements-row--hit');
    expect(rowClassOf('Parent SR')).not.toContain('requirements-row--context');

    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'Payment' } });
    // 等命中类出现(防抖 150ms 后过滤才生效——行本身未过滤时就在 DOM,存在≠已筛)
    await waitFor(() => expect(rowClassOf('Payment AR hit')).toContain('requirements-row--hit'));
    // 命中: 两个 Payment 行
    expect(rowClassOf('Payment standalone SR')).toContain('requirements-row--hit');
    // 上下文: 父 SR + 未命中兄弟 AR(树语义保留但弱化)
    expect(rowClassOf('Parent SR')).toContain('requirements-row--context');
    expect(rowClassOf('Sibling AR')).toContain('requirements-row--context');
  });

  test('计数文案区分 命中/连同上下文', async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText('Parent SR')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'Payment' } });
    await waitFor(() => expect((document.querySelector('.board-count')?.textContent ?? '').toLowerCase()).toMatch(/hit|命中/));
    const countText = document.querySelector('.board-count')?.textContent ?? '';
    expect(countText).toContain('2');
    expect(countText).toContain('4');
    // 清筛选恢复普通计数
    fireEvent.click(screen.getByTestId('reset-filters'));
    await waitFor(() => expect(document.querySelector('.board-count')?.textContent).not.toMatch(/hit|命中/i));
  });

  test('搜索自动展开命中路径;清筛选恢复原折叠', async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText('Parent SR')).toBeInTheDocument());
    // 先折叠 sr-mix
    fireEvent.click(document.querySelector('.req-sr-toggle') as HTMLElement);
    await waitFor(() => expect(screen.queryByText('Sibling AR')).not.toBeInTheDocument());
    // 搜索命中其子行 → 自动展开
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'Payment' } });
    await waitFor(() => expect(screen.getByText('Payment AR hit')).toBeInTheDocument());
    expect(screen.getByText('Sibling AR')).toBeInTheDocument(); // 展开后上下文也可见
    // 清筛选 → 恢复折叠
    fireEvent.click(screen.getByTestId('reset-filters'));
    await waitFor(() => expect(screen.getByText('Parent SR')).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText('Sibling AR')).not.toBeInTheDocument());
  });

  test('任务视图同样区分命中/上下文', async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText('Parent SR')).toBeInTheDocument());
    // backlog 只有 ar-miss 命中
    fireEvent.click(screen.getByTestId('task-view-pendingSchedule'));
    await waitFor(() => expect(screen.getByText('Sibling AR')).toBeInTheDocument());
    expect(rowClassOf('Sibling AR')).toContain('requirements-row--hit');
    expect(rowClassOf('Parent SR')).toContain('requirements-row--context');
    expect(rowClassOf('Payment AR hit')).toContain('requirements-row--context');
  });
});
