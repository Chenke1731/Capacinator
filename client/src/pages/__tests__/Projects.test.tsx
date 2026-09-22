import React from 'react';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Projects } from '../Projects';

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
  },
}));

// Mock the UI components
jest.mock('../../components/ui/FilterBar', () => ({
  FilterBar: ({ filters, values, onChange, onReset }: any) => (
    <div data-testid="filter-bar">
      <input
        placeholder="Search projects..."
        value={values.search}
        onChange={(e) => onChange('search', e.target.value)}
        data-testid="search-input"
      />
      <select
        value={values.lifecycle_state}
        onChange={(e) => onChange('lifecycle_state', e.target.value)}
        data-testid="lifecycle-filter"
      >
        <option value="">All</option>
        <option value="designing">Designing</option>
        <option value="scheduled">Scheduled</option>
      </select>
      <select
        value={values.tag_id}
        onChange={(e) => onChange('tag_id', e.target.value)}
        data-testid="tag-filter"
      >
        <option value="">All Tags</option>
        <option value="1">Reserved</option>
      </select>
      <button onClick={onReset} data-testid="reset-filters">
        Reset Filters
      </button>
    </div>
  ),
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
    estimation_summary: { kloc: 12, pm: 24 },
    owner_id: 'p-1',
    owner_name: '陈主管',
    lifecycle_state: 'pending_rat',
    lifecycle_warnings: ['NO_DEV_DEMAND'],
    staffing_summary: { design: { named: 0.5, pool: 1, named_detail: [{ name: '韩架构', fte: 0.5 }] }, dev: { named: 2, pool: 0, named_detail: [] } },
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
    owner_name: null,
    lifecycle_state: 'in_iteration',
    lifecycle_warnings: [],
    staffing_summary: { design: { named: 0, pool: 0 }, dev: { named: 0, pool: 0 } },
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
    owner_name: null,
    lifecycle_state: 'pending_rat',
    lifecycle_warnings: [],
    staffing_summary: { design: { named: 0.5, pool: 0, named_detail: [{ name: '王后端', fte: 0.5 }] }, dev: { named: 0, pool: 0.5, named_detail: [] } },
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
    owner_name: null,
    lifecycle_state: 'in_iteration',
    lifecycle_warnings: [],
    staffing_summary: { design: { named: 0, pool: 0, named_detail: [] }, dev: { named: 1, pool: 0, named_detail: [] } },
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
    (api.roles.list as jest.Mock).mockResolvedValue({ data: [] });
    (api.people.list as jest.Mock).mockResolvedValue({
      data: { data: [
        { id: 'p-1', name: '陈主管', primary_role_name: 'SE' },
        { id: 'p-2', name: '李四', primary_role_name: '开发' }
      ] }
    });
    (api.tags.create as jest.Mock).mockResolvedValue({
      data: { data: { id: 9, name: 'Urgent', color: null } }
    });
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
      expect(headers).toEqual(['Name', 'Number', 'Component', 'Lifecycle', 'Named + pool', 'Scale', 'Version', 'Release', 'Priority', 'Owner', 'Actions']);
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
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      await user.selectOptions(screen.getByTestId('product-filter'), 'A');
      expect(screen.getByText('Project Beta')).toBeInTheDocument();
      expect(screen.queryByText('Project Alpha')).not.toBeInTheDocument();
      expect(screen.queryByText('Portal Login Rework')).not.toBeInTheDocument();

      // "未排"哨兵: 筛出无版本事项(fixture 里没有 → 空态)
      await user.selectOptions(screen.getByTestId('product-filter'), '__none__');
      expect(screen.queryByText('Project Beta')).not.toBeInTheDocument();
      expect(screen.getByText(/No matching items/)).toBeInTheDocument();
    });

    test('release version filter narrows rows client-side', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      await user.selectOptions(screen.getByTestId('release-filter'), '26.RP3');
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

    test('staffing summary renders both sides (named + pool)', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      const alphaRow = screen.getByText('Project Alpha').closest('.requirements-row')!;
      const staffing = within(alphaRow).getAllByText(/0\.5/);
      expect(staffing.length).toBeGreaterThan(0);
    });

    test('priority badge and owner render', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      expect(screen.getAllByText('P2').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('P1').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('陈主管').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Lifecycle in place', () => {
    test('advances lifecycle from the row (one click)', async () => {
      const user = userEvent.setup();
      (api.lifecycle.transition as jest.Mock).mockResolvedValue({
        data: { project: { lifecycle_state: 'designing' }, event: {} }
      });
      renderComponent();

      await waitFor(() => {
        expect(screen.getAllByText('Pending RAT').length).toBeGreaterThan(0);
      });

      await user.click(screen.getAllByRole('button', { name: 'Start design' })[0]);

      await waitFor(() => {
        expect(api.lifecycle.transition).toHaveBeenCalledWith(expect.any(String), { to: 'designing' });
      });
    });

    test('badge popover offers the full flow-free state selector', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getAllByText('Pending RAT').length).toBeGreaterThan(0);
      });

      // the badge is the button (the select option is not a button)
      const badge = screen
        .getAllByRole('button', { name: /Pending RAT/ })
        .find((b) => b.closest('.lifecycle-cell'));
      await user.click(badge!);

      const selector = within(screen.getByTestId('lc-state-list'));
      ['NOK', 'Designing', 'Backlog', 'Scheduled', 'In Iteration', 'Delivered', 'Cancelled'].forEach(
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
      await user.click(within(alphaRow).getByText('B'));

      const input = await screen.findByDisplayValue('B');
      await user.clear(input);
      await user.type(input, 'C{Enter}');

      await waitFor(() => {
        expect(api.projects.update).toHaveBeenCalledWith('proj-1', { product_version: 'C' });
      });
    });
  });

  describe('Inline editing (priority / owner / tags)', () => {
    test('staffing popover states its edit model (pool labeled, division of labor up top)', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      const betaRow = screen.getByText('Project Beta').closest('.requirements-row')!;
      await user.click(within(betaRow).getByTitle('Click to adjust staffing'));

      const pop = document.querySelector('.staff-pop')!;
      expect(within(pop).getByText('Staffing adjust')).toBeInTheDocument();
      // 顶部说明: 单位、此处只调池、实名去哪调
      expect(within(pop).getByText(/only the pool adjusts here/)).toBeInTheDocument();
      // 步进器自带"Pool"标签,不靠猜
      const labels = pop.querySelectorAll('.staff-stepper-label');
      expect(labels.length).toBe(2);
      labels.forEach((l) => expect(l.textContent).toBe('Pool'));
      // 实名一行一档
      expect(within(pop).getAllByText(/named 0\.0/).length).toBe(2);
    });

    test('staffing column header carries the named+pool legend', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      const header = screen.getByTestId('requirements-table').querySelector('.requirements-thead');
      expect(Array.from(header?.children ?? []).map((el) => el.textContent)).toContain('Named + pool');
    });

    test('priority popover selects P1 and persists', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      const alphaRow = screen.getByText('Project Alpha').closest('.requirements-row')!;
      await user.click(within(alphaRow).getByTestId('priority-edit-btn'));

      const popover = await screen.findByTestId('priority-popover');
      await user.click(within(popover).getByText('Highest'));

      await waitFor(() => {
        expect(api.projects.update).toHaveBeenCalledWith('proj-1', { priority: 1 });
      });
    });

    test('owner popover lists people (name + primary role) and clears', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      const alphaRow = screen.getByText('Project Alpha').closest('.requirements-row')!;
      await user.click(within(alphaRow).getByTestId('owner-edit-btn'));

      const popover = await screen.findByTestId('owner-popover');
      expect(within(popover).getByText('李四')).toBeInTheDocument();
      expect(within(popover).getByText('开发')).toBeInTheDocument();

      await user.click(within(popover).getByText('Clear owner'));
      await waitFor(() => {
        expect(api.projects.update).toHaveBeenCalledWith('proj-1', { owner_id: null });
      });
    });

    test('owner popover assigns from the unassigned row', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Beta')).toBeInTheDocument();
      });

      const betaRow = screen.getByText('Project Beta').closest('.requirements-row')!;
      await user.click(within(betaRow).getByTestId('owner-edit-btn'));

      const popover = await screen.findByTestId('owner-popover');
      await user.click(within(popover).getByText('李四'));

      await waitFor(() => {
        expect(api.people.list).toHaveBeenCalled();
        expect(api.projects.update).toHaveBeenCalledWith('proj-2', { owner_id: 'p-2' });
      });
    });

    test('tags popover toggles off and submits the full set', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      const alphaRow = screen.getByText('Project Alpha').closest('.requirements-row')!;
      await user.click(within(alphaRow).getByTestId('tags-edit-btn'));

      const popover = await screen.findByTestId('tags-popover');
      await user.click(within(popover).getByText('Reserved'));

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
      await user.click(within(betaRow).getByTestId('tags-edit-btn'));

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

      await user.click(within(alphaRow).getByTestId('component-edit-btn'));
      const pop = await screen.findByTestId('component-popover');
      const input = pop.querySelector('.cell-pop-search input') as HTMLInputElement;
      await user.clear(input);
      await user.type(input, '调度组{Enter}');

      await waitFor(() => {
        expect(api.projects.update).toHaveBeenCalledWith('proj-1', { component: '调度组' });
      });
    });

    test('scale column renders estimation (KLOC + pm) and em-dash when absent', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      const alphaRow = screen.getByText('Project Alpha').closest('.requirements-row')!;
      expect(within(alphaRow).getByText('4K')).toBeInTheDocument();
      expect(within(alphaRow).getByText('8 pm')).toBeInTheDocument();

      const betaRow = screen.getByText('Project Beta').closest('.requirements-row')!;
      expect(betaRow.querySelectorAll('.req-scale--empty').length).toBe(1);
    });

    test('staffing popover lists named people with percentages', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      const childRow = screen.getByText('Portal Login Rework').closest('.requirements-row')!;
      await user.click(within(childRow).getByTitle('Click to adjust staffing'));

      const pop = document.querySelector('.staff-pop')!;
      expect(within(pop).getByText('王后端')).toBeInTheDocument();
      expect(within(pop).getByText('50%')).toBeInTheDocument();
    });

    test('component filter narrows rows client-side', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      await user.selectOptions(screen.getByTestId('component-filter'), 'HCCL_驱动组');
      expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      expect(screen.queryByText('Project Beta')).not.toBeInTheDocument();
    });

    test('row click does not fire when clicking edit triggers', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      const alphaRow = screen.getByText('Project Alpha').closest('.requirements-row')!;
      await user.click(within(alphaRow).getByTestId('priority-edit-btn'));
      await user.click(within(alphaRow).getByTestId('owner-edit-btn'));
      await user.click(within(alphaRow).getByTestId('tags-edit-btn'));

      expect(mockNavigate).not.toHaveBeenCalled();
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
      expect(within(srRow).getByText('2 AR')).toBeInTheDocument();
      // 状态分布: 1 子行待RAT + 1 已启动
      expect(within(srRow).getByText(/Pending RAT/)).toBeInTheDocument();
      expect(within(srRow).getByText(/In Iteration/)).toBeInTheDocument();

      const childRows = document.querySelectorAll('.requirements-row--child');
      expect(childRows.length).toBe(2);
      expect(within(childRows[0] as HTMLElement).getByText('AR-2026-101')).toBeInTheDocument();
    });

    test('SR aggregates equal child sums (staffing & scale)', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      const srRow = screen.getByText('Project Alpha').closest('.requirements-row')!;
      // 人力: design named = 子行 0.5;dev named = 0+1 = 1
      expect(within(srRow).getByText('0.5')).toBeInTheDocument();
      expect(within(srRow).getAllByText('1.0').length).toBeGreaterThan(0);
      // 规模: 仅 proj-1a 有评估 4K/8pm
      expect(within(srRow).getByText('4K')).toBeInTheDocument();
      expect(within(srRow).getByText('8 pm')).toBeInTheDocument();
    });

    test('SR chevron toggles children; SR row click opens its detail (same as other rows)', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });
      expect(document.querySelectorAll('.requirements-row--child').length).toBe(2);

      // 折叠归箭头钮(2026-09-22 修正: SR 行点击进详情,不再折叠)
      await user.click(document.querySelector('.req-sr-toggle')!);
      expect(document.querySelectorAll('.requirements-row--child').length).toBe(0);

      await user.click(document.querySelector('.req-sr-toggle')!);
      expect(document.querySelectorAll('.requirements-row--child').length).toBe(2);

      await user.click(screen.getByText('Project Alpha'));
      expect(mockNavigate).toHaveBeenCalledWith('/projects/proj-1');
    });

    test('decompose button opens the create modal preset to the parent', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      const srRow = screen.getByText('Project Alpha').closest('.requirements-row')!;
      await user.click(within(srRow).getByTitle('Decompose into AR'));

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
      expect(within(betaRow2).getByText('#2')).toBeInTheDocument();

      // 子行(AR): 空 → 填 AR 号
      const childRow2 = screen.getByText('Portal Home Rework').closest('.requirements-row')!;
      await user.click(childRow2.querySelector('.req-number-part')!);
      const input = await within(childRow2).findByRole('textbox');
      await user.type(input, 'AR-2026-999{Enter}');
      await waitFor(() => {
        expect(api.projects.update).toHaveBeenCalledWith('proj-1b', { external_number: 'AR-2026-999' });
      });

      // 顶层行(混排: 本身就可能是 SR 或 AR 粒度): 填 SR 号
      const betaRow = screen.getByText('Project Beta').closest('.requirements-row')!;
      await user.click(betaRow.querySelector('.req-number-part')!);
      const input2 = await within(betaRow).findByRole('textbox');
      await user.type(input2, 'SR-26-001{Enter}');
      await waitFor(() => {
        expect(api.projects.update).toHaveBeenCalledWith('proj-2', { external_number: 'SR-26-001' });
      });
    });

    test('subtype is not inline in the name cell and filters via toolbar', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      // 2026-09-22 裁决: 子类型撤内联(常量重复零信息),分类走筛选
      expect(document.querySelectorAll('.requirements-subtype').length).toBe(0);

      await user.selectOptions(screen.getByTestId('subtype-filter'), '标准需求');
      expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      expect(screen.queryByText('Project Beta')).not.toBeInTheDocument();

      await user.selectOptions(screen.getByTestId('subtype-filter'), '定制需求');
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
      // jsdom 默认视口 1024 会走 <1440 紧凑默认;列宽断言统一按宽屏档
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

      // 前 10 列有手柄,最右操作列没有(右缘手柄只到负责人列)
      const grips = screen.getAllByTestId(/^col-grip-/);
      expect(grips.map((g) => g.dataset.testid)).toEqual([
        'col-grip-name', 'col-grip-number', 'col-grip-component', 'col-grip-lifecycle',
        'col-grip-staffing', 'col-grip-scale', 'col-grip-version', 'col-grip-release',
        'col-grip-priority', 'col-grip-owner'
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
      expect(table.style.getPropertyValue('--req-w-name')).toBe('260px');
    });

    test('dragging the name column just sets its width (fixed-width, slack to spacer)', async () => {
      localStorage.setItem('req-col-widths-v4', JSON.stringify({ name: 150 }));
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      // 2026-09-22 权重分配: 拖拽=钉死(该列 fr 归零),余量由其余 flex 列分食
      const table = screen.getByTestId('requirements-table');
      expect(table.style.getPropertyValue('--req-w-name')).toBe('150px');
      expect(table.style.getPropertyValue('--req-f-name')).toBe('0fr');
    });

    test('dragging a bounded column locks its cap at the dragged width (kind: cap)', async () => {
      localStorage.setItem('req-col-widths-v4', JSON.stringify({ component: 200 }));
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      const table = screen.getByTestId('requirements-table');
      expect(table.style.getPropertyValue('--req-w-component')).toBe('200px');
      expect(table.style.getPropertyValue('--req-cap-component')).toBe('200px');
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

      await waitFor(() => {
        expect(table.style.getPropertyValue('--req-w-component')).toBe('92px');
      });
      expect(JSON.parse(localStorage.getItem('req-col-widths-v4')!)).toEqual({});
    });
  });

  describe('Operations', () => {
    test('edit icon opens the project modal', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      const alphaRow = screen.getByText('Project Alpha').closest('.requirements-row')!;
      await user.click(within(alphaRow).getByTitle('Edit'));

      await waitFor(() => {
        expect(screen.getByTestId('project-modal')).toBeInTheDocument();
        expect(screen.getByText('Edit Project')).toBeInTheDocument();
      });
    });

    test('delete is a two-click confirm (zero modal)', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });

      const alphaRow = screen.getByText('Project Alpha').closest('.requirements-row')!;
      const deleteBtn = within(alphaRow).getByTitle('Delete');
      await user.click(deleteBtn);

      // First click arms, second click executes — no window.confirm
      expect(api.projects.delete).not.toHaveBeenCalled();
      const confirmBtn = within(alphaRow).getByTitle('Confirm');
      await user.click(confirmBtn);

      await waitFor(() => {
        expect(api.projects.delete).toHaveBeenCalledWith('proj-1');
      });
    });

    test('row click navigates to project detail', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Project Beta')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Project Beta'));
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

      await user.click(document.querySelector('.requirements-empty-clear') as HTMLButtonElement);
      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });
    });

    test('tags render inline in the name cell; chip click filters, click again clears (Q1-B/Q3)', async () => {
      const user = userEvent.setup();
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
      await user.click(within(alphaRow).getByText('Reserved'));
      expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      expect(screen.queryByText('Project Beta')).not.toBeInTheDocument();

      // 再点同枚取消
      await user.click(within(alphaRow).getByText('Reserved'));
      expect(screen.getByText('Project Beta')).toBeInTheDocument();
    });

    test('number cell carries the pencil affordance like other edit points (P6)', async () => {
      renderComponent();
      await waitFor(() => {
        expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      });
      const alphaRow = screen.getByText('Project Alpha').closest('.requirements-row')!;
      expect(alphaRow.querySelector('.req-edit-cell--number .req-pencil')).not.toBeNull();
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

      // #1 = seq_number 精确命中 Alpha
      await user.type(screen.getByTestId('search-input'), '#1');
      expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      expect(screen.queryByText('Project Beta')).not.toBeInTheDocument();
    });

    test('lifecycle filter passes through to the API', async () => {
      const user = userEvent.setup();
      renderComponent();

      await waitFor(() => {
        expect(screen.getByTestId('lifecycle-filter')).toBeInTheDocument();
      });

      await user.selectOptions(screen.getByTestId('lifecycle-filter'), 'designing');

      await waitFor(() => {
        expect(api.projects.list).toHaveBeenLastCalledWith(
          expect.objectContaining({ lifecycle_state: 'designing' })
        );
      });
    });
  });

  describe('States', () => {
    test('shows loading state', () => {
      (api.projects.list as jest.Mock).mockImplementation(() => new Promise(() => {}));
      renderComponent();
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
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
