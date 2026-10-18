import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { flattenTrees, type FlatRow } from '../lib/demandTree';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Edit2, Trash2, Tag, ChevronDown, ChevronRight, Search, X, GitBranch, CornerDownRight, Info } from 'lucide-react';
import { api } from '../lib/api-client';
import { queryKeys } from '../lib/queryKeys';
import { PriorityCell, TagsCell, ComponentCell } from '../components/boards/EditableCells';
import { KlocCell, EffortCell, RoleCell, PrimaryDevCell, VersionPart, ReleaseCell, IterationCell } from '../components/boards/BoardCells';
import { ReqCheckbox } from '../components/boards/ReqCheckbox';
import { RowDetailDrawer } from '../components/boards/RowDetailDrawer';
import { BulkActionBar } from '../components/boards/BulkActionBar';
import { BoardNotifications } from '../components/boards/BoardNotifications';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import ProjectModal from '../components/modals/ProjectModal';
import { LifecycleCellControls } from '../components/lifecycle/LifecycleCellControls';
import { TagManagerDialog } from '../components/tags/TagManagerDialog';
import { useModal } from '../hooks/useModal';
import { useMutationFailureToaster } from '../hooks/useMutationFailureToaster';
import { useScenario } from '../contexts/ScenarioContext';
import { useUser } from '../contexts/UserContext';
import { TASK_VIEW_IDS, countByTaskView, taskViewPredicate, type TaskViewId } from '../lib/taskViews';
import { categoryOfTypeName } from '../lib/projectCategories';
import type { Project } from '../types';
import './Projects.css';

/**
 * 需求台 (2026-09-21 分流裁决) — 项目导航 → 需求 tab.
 *
 * 信息密度重做: 名称(子类型+标签) | 状态(就地推进) | 人力(两侧实名+池 FTE) |
 * 版本(产品·RP 两段内联可编辑) | 优先级 | 负责人 | 操作(图标+二次确认删除)。
 * 平铺不做版本分组(2026-09-22 裁决): 版本/交付计划两列已携带该信息,
 * 版本维度改由工具栏筛选表达; 行内只呈现 SR/AR 粒度事项本体; 告警行淡黄底+短词。
 * 砍掉: 起止日期列 / 查看详情按钮(行点击即详情) / 人力分配旧弹窗。
 */

/** 优先级/负责人/标签三列由 EditableCells 提供(锚定气泡就地编辑) */

/** 编号列: 每行(顶层/SR/子行)统一就地编辑,自由文本——前缀(SRxxx/ARxxx)
    自述粒度,混排世界粒度是事项属性不是树结构位置(2026-09-22 裁决) */
function NumberPart({ project, onSaved }: { project: any; onSaved: () => void }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const updateMutation = useMutation({
    mutationFn: (patch: Record<string, string | null>) => api.projects.update(project.id, patch),
    onSuccess: () => { setEditing(false); onSaved(); }
  });
  const value = (project.external_number ?? '') as string;
  if (editing) {
    return (
      <input
        className="inline-edit-input req-number-input inline-edit-input--expand"
        value={draft}
        style={{ width: `${Math.max(4, draft.length + 2)}ch` }}
        autoFocus
        placeholder={t('projects:number.placeholder')}
        onChange={(e) => { setDraft(e.target.value); e.target.size = Math.max(2, e.target.value.length + 1); }}
        onBlur={() => {
          const trimmed = draft.trim();
          if (trimmed !== value) updateMutation.mutate({ external_number: trimmed || null });
          else setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }
  return (
    <span className="req-edit-cell req-edit-cell--number" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="req-number-part req-editable" title={t('projects:number.hint')}
              onClick={() => { setDraft(value); setEditing(true); }}>
        {/* 空外部号时弱化显示 #序号: 列表截图永远携带可指代标识(# 自区分于 SR/AR 号) */}
        {value || <span className="text-muted">CAP-{project.seq_number}</span>}
      </button>
    </span>
  );
}

/** 版本筛选"未排"哨兵: 筛出 product_version/release_version 为空的事项 */
const VERSION_NONE = '__none__';

/** 列宽拖拽: 表头右缘手柄,拖=调宽窄(钳制 min/max),双击=重置该列;localStorage 持久化。
    列宽走 CSS 变量(--req-w-*),thead/row/两断点模板统一引用,一处设置处处生效;
    总量(--req-total)做行 min-width 兜底——拖宽不挤压他列,超出容器横向滚动。 */
const REQ_COLUMNS = [
  /* B3a 列集(设计 §1): 选择|名称|编号|组件|状态|代码规模|人力|SE|MDE|版本规划|交付计划|迭代|优先级|实名投入|操作
     选择列(2026-10-11 批量操作): 前置 26px,预算由名称列让位(210→186)净零。
     预算(设计 §1 复核): 全列 1376≤1380@1680; 中档藏组件 1284≤1300@1600;
     紧凑藏 组件/编号/交付/实名 1012≤1066@1366 */
  { key: 'select', def: [26, 26, 26], min: 26, max: 26 },
  { key: 'name', def: [186, 186, 186], min: 120, max: 640 },
  { key: 'number', def: [84, 80, 0], min: 56, max: 200 },
  { key: 'component', def: [84, 84, 0], min: 72, max: 240 },
  { key: 'lifecycle', def: [200, 200, 196], min: 170, max: 420 },
  { key: 'kloc', def: [64, 64, 64], min: 56, max: 120 },
  { key: 'effort', def: [64, 64, 64], min: 52, max: 120 },
  { key: 'se', def: [88, 88, 88], min: 72, max: 160 },
  { key: 'mde', def: [88, 88, 88], min: 72, max: 160 },
  { key: 'version', def: [68, 64, 62], min: 56, max: 200 },
  { key: 'release', def: [68, 64, 62], min: 48, max: 200 },
  { key: 'iter', def: [80, 78, 0], min: 60, max: 200, kind: 'cap', cap: [90, 88, 0] }, /* 迭代窗口(2026-09-23 拆列) */
  { key: 'priority', def: [44, 44, 44], min: 40, max: 120 },
  { key: 'primary', def: [88, 80, 0], min: 56, max: 200 },
  { key: 'actions', def: [92, 92, 92], min: 64, max: 200 }
] as const;
type ReqColKey = (typeof REQ_COLUMNS)[number]['key'];
/* v5: 列集变更(前置选择列)必须 bump 版本,旧宽度按旧列预算调优,残留会挤压名称列 */
const REQ_WIDTHS_STORE = 'req-col-widths-v5';

/** U16 列预设(2026-10-18,IP-06d): 评估/配人/交付三预设聚焦当前任务域。
 *  非默认预设=JS 渲染驱动隐藏(∪当前档位隐藏集,窄视口不破预算),默认档
 *  维持 CSS 媒体查询路径零回归;选择/名称/状态/操作四列任何预设不藏
 *  (受保护集)。隐藏字段由 RowDetailDrawer 侧栏完整承接,不靠 title。 */
const COL_PRESET_IDS = ['default', 'estimate', 'staffing', 'delivery'] as const;
type ColPresetId = (typeof COL_PRESET_IDS)[number];
const COL_PRESET_HIDDEN: Record<Exclude<ColPresetId, 'default'>, readonly ReqColKey[]> = {
  estimate: ['component', 'iter', 'primary'],
  staffing: ['number', 'component', 'version', 'release', 'iter'],
  delivery: ['number', 'component', 'kloc', 'effort', 'se', 'mde']
};
const COL_PRESET_STORE = 'req-col-preset-v1';
/** U20 返回上下文键: { scrollTop, selected[] } — sessionStorage(会话内有效) */
const REQ_BOARD_CTX = 'req-board-ctx-v1';
/** 批量端点单次上限(与服务端 ProjectsController batch-* 校验同步;
 *  超限走本地报错而非服务端 400——用户看到的必须是本地化文案) */
const BATCH_LIMIT = 2000;
const clampWidth = (col: (typeof REQ_COLUMNS)[number], w: number) =>
  Math.round(Math.min(col.max, Math.max(col.min, w)));

function ColumnGrip({ colKey, widths, setWidths }: {
  colKey: ReqColKey;
  widths: Partial<Record<ReqColKey, number>>;
  setWidths: React.Dispatch<React.SetStateAction<Partial<Record<ReqColKey, number>>>>;
}) {
  const { t } = useTranslation();
  const col = REQ_COLUMNS.find((c) => c.key === colKey)!;
  const persist = (next: Partial<Record<ReqColKey, number>>) =>
    localStorage.setItem(REQ_WIDTHS_STORE, JSON.stringify(next));

  const onPointerDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    el.classList.add('req-col-grip--active');
    document.body.classList.add('req-col-dragging');
    const startX = e.clientX;
    // 从实际渲染宽起步(fr 列也准),拖拽增量叠加
    const startW = el.parentElement?.getBoundingClientRect().width ?? col.def[0];
    let last = widths;
    const move = (ev: PointerEvent) => {
      const next = clampWidth(col, startW + ev.clientX - startX);
      setWidths((prev) => {
        last = { ...prev, [colKey]: next };
        return last;
      });
    };
    const up = () => {
      el.classList.remove('req-col-grip--active');
      document.body.classList.remove('req-col-dragging');
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      persist(last);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const reset = (e: React.MouseEvent) => {
    e.stopPropagation();
    setWidths((prev) => {
      const next = { ...prev };
      delete next[colKey];
      persist(next);
      return next;
    });
  };

  return (
    <span
      className="req-col-grip"
      data-testid={`col-grip-${colKey}`}
      title={t('projects:board.resizeHint')}
      onPointerDown={onPointerDown}
      onDoubleClick={reset}
    />
  );
}

/** SR→AR 树: 无父=顶层(普通需求或 SR),有父=子行(AR)。
    聚合(规模/人力/状态分布)直接由子行数据求和——单一数据源,汇总恒等于子行之和。 */
interface ProjectTree {
  project: any;
  children: any[];
  agg: {
    count: number;
    kloc: number | null;
    pm: number | null;
    effortPm: number | null;
    sePm: number | null;
    mdePm: number | null;
    sePersons: string[];
    mdePersons: string[];
    primaryPersons: string[];
    states: Array<{ state: string | null; count: number }>;
  } | null;
}

function aggregateChildren(children: any[]): ProjectTree['agg'] {
  if (children.length === 0) return null;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  let kloc: number | null = null;
  let effortPm: number | null = null;
  let sePm: number | null = null;
  let mdePm: number | null = null;
  const sePersons = new Set<string>();
  const mdePersons = new Set<string>();
  const primaryPersons = new Set<string>();
  const stateCount = new Map<string | null, number>();
  for (const c of children) {
    const e = c.estimation_summary;
    if (e) {
      kloc = round2((kloc ?? 0) + Number(e.kloc || 0));
      effortPm = round2((effortPm ?? 0) + Number(e.pm || 0));
    }
    const de = c.design_estimates;
    if (de) {
      sePm = round2((sePm ?? 0) + Number(de.se ?? 0));
      mdePm = round2((mdePm ?? 0) + Number(de.mde ?? 0));
    }
    if (c.se_assignment?.person_name) sePersons.add(c.se_assignment.person_name);
    if (c.mde_assignment?.person_name) mdePersons.add(c.mde_assignment.person_name);
    if (c.primary_dev?.person_name) primaryPersons.add(c.primary_dev.person_name);
    const key = c.lifecycle_state ?? null;
    stateCount.set(key, (stateCount.get(key) ?? 0) + 1);
  }
  return {
    count: children.length,
    kloc,
    pm: effortPm,
    effortPm,
    sePm,
    mdePm,
    sePersons: [...sePersons],
    mdePersons: [...mdePersons],
    primaryPersons: [...primaryPersons],
    states: [...stateCount.entries()]
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count)
  };
}


/** SR 行交付计划尾行: 子行迭代窗口的最早起~最晚止(派生只读,设计 §3) */
function aggIterWindow(children: any[]): { start: string; end: string; names: string[] } | null {
  const its = children.map((c) => c.iteration).filter(Boolean);
  if (its.length === 0) return null;
  const start = its.map((i) => i.start_date).sort()[0];
  const end = its.map((i) => i.end_date).sort().reverse()[0];
  const names = [...new Set(its.map((i) => i.name))];
  return { start, end, names };
}

function buildTree(rows: any[]): ProjectTree[] {
  const childrenOf = new Map<string, any[]>();
  const tops: any[] = [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const r of rows) {
    const parent = r.parent_id ? byId.get(r.parent_id) : undefined;
    if (parent) {
      const list = childrenOf.get(r.parent_id) ?? [];
      list.push(r);
      childrenOf.set(r.parent_id, list);
    } else {
      tops.push(r);
    }
  }
  return tops.map((project) => {
    const children = childrenOf.get(project.id) ?? [];
    return { project, children, agg: aggregateChildren(children) };
  });
}

/** 平铺排序: 优先级 → 产品版本 → 交付版本 → 名称; 未排版本沉底(文本排序天然正确) */
function sortTrees(trees: ProjectTree[]): ProjectTree[] {
  const sink = (v: unknown) => String(v ?? '').trim() || '\uffff';
  return [...trees].sort((a, b) => {
    const pa = a.project.priority ?? 5;
    const pb = b.project.priority ?? 5;
    if (pa !== pb) return pa - pb;
    const byProduct = sink(a.project.product_version).localeCompare(sink(b.project.product_version));
    if (byProduct) return byProduct;
    const byRelease = sink(a.project.release_version).localeCompare(sink(b.project.release_version));
    if (byRelease) return byRelease;
    return String(a.project.name).localeCompare(String(b.project.name));
  });
}

export function Projects() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { currentScenario } = useScenario();

  /** U20 URL 视图状态: 筛选/任务视图/同类告警/列预设入 URL——可分享、
   *  刷新/返回即恢复;后续变化 replace 写回(不刷历史栈) */
  const [searchParams, setSearchParams] = useSearchParams();
  const urlFilters = {
    search: searchParams.get('q') ?? '',
    lifecycle_state: searchParams.get('lc') ?? '',
    tag_id: searchParams.get('tag') ?? '',
    component: searchParams.get('comp') ?? '',
    subtype: searchParams.get('sub') ?? '',
    product_version: searchParams.get('pv') ?? '',
    release_version: searchParams.get('rv') ?? ''
  };
  const [filters, setFilters] = useState(urlFilters);
  /** 搜索框本地值(U20: 初始与 URL q 同步——恢复时框内可见关键词) */
  const [searchInput, setSearchInput] = useState(urlFilters.search);
  /** U15 任务视图(2026-10-17): ''=全部;谓词/计数单一真相在 lib/taskViews,
   *  六视图只组织服务端行事实(生命周期态/告警码/分配估算/冲突标志) */
  const [taskView, setTaskView] = useState<TaskViewId | ''>(() => {
    const v = searchParams.get('tv') ?? '';
    return (TASK_VIEW_IDS as readonly string[]).includes(v) ? (v as TaskViewId) : '';
  });
  /** U16 列预设: localStorage 持久化,非法值回落默认档 */
  const [colPreset, setColPreset] = useState<ColPresetId>(() => {
    const fromUrl = searchParams.get('preset') ?? '';
    if ((COL_PRESET_IDS as readonly string[]).includes(fromUrl)) return fromUrl as ColPresetId;
    try {
      const v = JSON.parse(localStorage.getItem(COL_PRESET_STORE) ?? 'null');
      return (COL_PRESET_IDS as readonly string[]).includes(v) ? (v as ColPresetId) : 'default';
    } catch {
      return 'default';
    }
  });
  const applyColPreset = (v: ColPresetId) => {
    setColPreset(v);
    localStorage.setItem(COL_PRESET_STORE, JSON.stringify(v));
  };
  /** U16 行详情侧栏: 承接被预设/窄视口隐藏的字段 */
  const [detailRow, setDetailRow] = useState<Record<string, any> | null>(null);
  /** U17 侧栏聚焦段: 告警 chip 进入时滚到告警区 */
  const [detailFocus, setDetailFocus] = useState<'warnings' | null>(null);
  /** U17 只看同类: 按告警码过滤——接入属性管线(chips 计数随筛选联动) */
  const [warningFilter, setWarningFilter] = useState(searchParams.get('warn') ?? '');
  const closeDetail = () => { setDetailRow(null); setDetailFocus(null); };

  /** U20 URL 写回: 任一视图状态变化 → replace 到当前查询串(空值不写)。
   *  deps 不含 searchParams——写回不回流,无环 */
  useEffect(() => {
    const next: Record<string, string> = {};
    if (filters.search) next.q = filters.search;
    if (filters.lifecycle_state) next.lc = filters.lifecycle_state;
    if (filters.tag_id) next.tag = filters.tag_id;
    if (filters.component) next.comp = filters.component;
    if (filters.subtype) next.sub = filters.subtype;
    if (filters.product_version) next.pv = filters.product_version;
    if (filters.release_version) next.rv = filters.release_version;
    if (taskView) next.tv = taskView;
    if (warningFilter) next.warn = warningFilter;
    if (colPreset !== 'default') next.preset = colPreset;
    setSearchParams(Object.keys(next).length > 0 ? next : {}, { replace: true });
  }, [filters, taskView, warningFilter, colPreset, setSearchParams]);
  /** U15 个人视图: 任务视图+属性筛选快照,localStorage 按 profile 分键(保存/恢复/删除) */
  const { currentUser } = useUser();
  const personalViewsKey = `capacinator-req-personal-views:${currentUser?.id ?? 'default'}`;
  const [personalViews, setPersonalViews] = useState<{ name: string; taskView: TaskViewId | ''; filters: Record<string, string> }[]>([]);
  const [appliedPersonalView, setAppliedPersonalView] = useState('');
  const [namingView, setNamingView] = useState(false);
  const [viewName, setViewName] = useState('');
  useEffect(() => {
    try {
      setPersonalViews(JSON.parse(localStorage.getItem(personalViewsKey) ?? '[]'));
    } catch {
      setPersonalViews([]);
    }
    setAppliedPersonalView('');
    setNamingView(false);
    setViewName('');
  }, [personalViewsKey]);
  const [collapsedSR, setCollapsedSR] = useState<Set<string>>(new Set());
  /** 搜索防抖: 击键只更新本地值,150ms 静默后才触发全量过滤/排序/树重建 */
  useEffect(() => {
    const id = setTimeout(() => setFilters((prev) => (prev.search === searchInput ? prev : { ...prev, search: searchInput })), 150);
    return () => clearTimeout(id);
  }, [searchInput]);
  const [decomposeParent, setDecomposeParent] = useState<any | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  /** 就地保存反馈: 行 flash(版本两列同样走行反馈,平铺后无组头可跳) */
  const [flashId, setFlashId] = useState<string | null>(null);

  const addProjectModal = useModal();
  const editProjectModal = useModal();
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const { data: projects, isLoading, error } = useQuery({
    // board-feed 裸 {data} 信封与 list 分页信封不同形——专用键,不再借
    // list 键(2026-10-13 缓存键守卫首战: 同签名换端点即互投毒)
    queryKey: queryKeys.projects.boardFeed(filters.lifecycle_state, currentScenario?.id),
    queryFn: async () => {
      // board-feed (P7): the whole board in one slim request — projection
      // audited against the board's 14 cells + tree/filter/category inputs.
      // Replaces the loop-paging stopgap that itself replaced limit:200.
      const response = await api.projects.boardFeed(
        filters.lifecycle_state ? { lifecycle_state: filters.lifecycle_state } : undefined
      );
      // sendSuccess wraps once ({success, data}), the controller once more
      // ({data: rows, total}) — unwrap to the rows array either way.
      const payload = (response.data as any)?.data;
      const rows: any[] = Array.isArray(payload) ? payload : payload?.data ?? [];
      return rows.map((project) => ({
        ...project,
        project_type: project.project_type_name
          ? { id: project.project_type_id, name: project.project_type_name, color_code: project.project_type_color_code }
          : undefined
      }));
    },
    enabled: !!currentScenario
  });

  const { data: tagsData } = useQuery({
    queryKey: queryKeys.tags.list(),
    queryFn: async () => (await api.tags.list()).data
  });
  const tags = (tagsData?.data as any[]) || [];

  // Controlled component dimension (066): resolve component names for
  // display/filtering; rows predating the backfill fall back to their
  // legacy free-text component value so nothing disappears.
  const { data: componentsData } = useQuery({
    queryKey: queryKeys.components.list(),
    queryFn: async () => {
      const response = await api.components.list();
      const payload = response.data;
      return Array.isArray(payload) ? payload : payload?.data || [];
    }
  });
  const componentNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of (componentsData as any[]) || []) m.set(String(c.id), String(c.name));
    return m;
  }, [componentsData]);

  const deleteProjectMutation = useMutation({
    mutationFn: (id: string) => api.projects.delete(id),
    onSuccess: () => {
      setConfirmingDelete(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    }
  });

  // Category scoping (需求台) + client filters
  // 组件/版本选项来自全量需求(不受各自筛选影响),排序稳定
  const demandRows = useMemo(
    () => (projects ?? [])
      .filter((p: any) => categoryOfTypeName(p.project_type_name) === 'demand')
      .map((p: any) => ({
        ...p,
        component: p.component_id ? (componentNameById.get(String(p.component_id)) ?? '') : (p.component ?? '')
      })),
    [projects, componentNameById]
  );
  const distinctOf = (field: 'component' | 'product_version' | 'release_version') =>
    [...new Set(demandRows.map((p: any) => String(p[field] ?? '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'zh'));
  const componentOptions = useMemo(() => distinctOf('component'), [demandRows]);
  const subtypeOptions = useMemo(
    () => [...new Set(demandRows.map((p: any) => String(p.project_sub_type_name ?? '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'zh')),
    [demandRows]
  );
  const productOptions = useMemo(() => distinctOf('product_version'), [demandRows]);
  const releaseOptions = useMemo(() => distinctOf('release_version'), [demandRows]);

  // U15: 属性匹配单源——trees 与 chips 计数共用(计数随筛选上下文走,
  // 与表格数一致);任务视图谓词在 client/src/lib/taskViews.ts 单一真相。
  const attrMatch = useMemo(() => {
    const versionMatch = (value: unknown, filter: string) => {
      const v = String(value ?? '').trim();
      return filter === VERSION_NONE ? v === '' : v === filter;
    };
    return (p: any) => {
      if (filters.search) {
        // 名称包含,或引用码精确命中(#序号)——截图指代到检索的闭环
        const q = filters.search.trim().toLowerCase();
        const byCode = /^(?:#|CAP-)(\d+)$/i.exec(q);
        const hit = String(p.name).toLowerCase().includes(q)
          || String(p.external_number ?? '').toLowerCase().includes(q)
          || (byCode && Number(byCode[1]) === p.seq_number);
        if (!hit) return false;
      }
      if (warningFilter && !(p.lifecycle_warnings ?? []).includes(warningFilter)) return false;
      if (filters.tag_id && !(p.tags ?? []).some((tag: any) => String(tag.id) === String(filters.tag_id))) return false;
      if (filters.component && String(p.component ?? '') !== filters.component) return false;
      if (filters.subtype && String(p.project_sub_type_name ?? '') !== filters.subtype) return false;
      if (filters.product_version && !versionMatch(p.product_version, filters.product_version)) return false;
      if (filters.release_version && !versionMatch(p.release_version, filters.release_version)) return false;
      return true;
    };
  }, [filters.search, filters.tag_id, filters.component, filters.subtype, filters.product_version, filters.release_version, warningFilter]);

  /** U15 chips 计数: 属性筛选后的行集 × 六视图行级谓词(非树口径——
   *  chip 直接回答"多少件事待处理",树上下文由表格自己表达) */
  const taskCounts = useMemo(
    () => countByTaskView(demandRows.filter(attrMatch)),
    [demandRows, attrMatch]
  );

  /** U19 树筛选谓词(单源): trees 保留逻辑与命中高亮共用同一 match */
  const treeFilterActive = Boolean(
    filters.search || filters.tag_id || filters.component || filters.subtype
    || filters.product_version || filters.release_version || taskView || warningFilter
  );
  const matchRow = useMemo(
    () => (p: any) => attrMatch(p) && (!taskView || taskViewPredicate(taskView, p)),
    [attrMatch, taskView]
  );
  /** U19 命中行集合(筛选期才有——区分真命中与树语义保留的上下文行) */
  const hitIds = useMemo(
    () => (treeFilterActive ? new Set(demandRows.filter(matchRow).map((p: any) => p.id as string)) : null),
    [treeFilterActive, demandRows, matchRow]
  );
  /** U19 命中路径自动展开: 有命中子行的 SR 在筛选期不折叠 */
  const srAutoExpand = useMemo(() => {
    if (!hitIds) return new Set<string>();
    const s = new Set<string>();
    for (const r of demandRows) {
      if (r.parent_id && hitIds.has(r.id)) s.add(r.parent_id);
    }
    return s;
  }, [hitIds, demandRows]);

  // SR→AR: 筛选作用于行(父或任一子命中 → 整树保留); 平铺排序 优先级→版本→名称
  const trees = useMemo(() => {
    const match = matchRow;
    const anyFilter = treeFilterActive;
    if (!anyFilter) return sortTrees(buildTree(demandRows));
    // 命中父或任一子 → 父及其全部子行保留
    const childrenOf = new Map<string, any[]>();
    for (const r of demandRows) {
      if (!r.parent_id) continue;
      const list = childrenOf.get(r.parent_id) ?? [];
      list.push(r);
      childrenOf.set(r.parent_id, list);
    }
    // 保留命中的父(或任一子命中的父) + 这些父的全部子行
    const keptParents = demandRows.filter(
      (p: any) => !p.parent_id && (match(p) || (childrenOf.get(p.id) ?? []).some(match))
    );
    const keptIds = new Set(keptParents.map((p: any) => p.id));
    const keptChildren = demandRows.filter((p: any) => p.parent_id && keptIds.has(p.parent_id));
    return sortTrees(buildTree([...keptParents, ...keptChildren]));
  }, [demandRows, matchRow, treeFilterActive]);

  /** 表格容器宽(余量→列间距 分配的基础;jsdom 无 ResizeObserver 时跳过) */
  const [containerW, setContainerW] = useState(0);
  const tableRef = useRef<HTMLDivElement>(null);
  /** 首帧量宽竞态根治: colVars 是渲染期 memo,ResizeObserver 的 state 到达
   *  晚于首帧定格(紧凑档实测卡死在原始列宽→横滚 71px)。layout effect 在
   *  paint 前同步校正宽度,diff 才 set 避免循环;ResizeObserver 仍管窗口 resize。 */
  useLayoutEffect(() => {
    const el = tableRef.current;
    if (el && Math.abs(el.clientWidth - containerW) > 1) setContainerW(el.clientWidth);
  });

  /** 虚拟化平铺(P5+P6 根治): 树 → 均匀行序列,折叠态决定子行是否入列。
   *  U19: 筛选期命中路径自动展开(collapsedSR 本体不动——快照/恢复见下) */
  const flatRows = useMemo(
    () => flattenTrees(
      trees,
      treeFilterActive ? new Set([...collapsedSR].filter((id) => !srAutoExpand.has(id))) : collapsedSR
    ),
    [trees, collapsedSR, treeFilterActive, srAutoExpand]
  );

  /** U20 同级位次: 同优先级顶层行按显示顺序 1..k——"同级先后"显式化
   *  (P 级表达等级,位次表达队列序;实际调序依赖 D10 裁决,本批只展示) */
  const priorityRanks = useMemo(() => {
    const m = new Map<string, number>();
    const counters = new Map<number, number>();
    for (const r of flatRows) {
      if (r.kind === 'child') continue;
      const p = Math.min(5, Math.max(1, Number(r.project.priority) || 5));
      const k = (counters.get(p) ?? 0) + 1;
      counters.set(p, k);
      m.set(String(r.project.id), k);
    }
    return m;
  }, [flatRows]);

  /** U19 折叠快照/恢复: 进入筛选态前存原折叠,清除筛选恢复(用户在筛选期
   *  的手动折叠不被覆盖,恢复以进入前状态为准——回到"我原来的视角") */
  const wasFilteredRef = useRef(false);
  const preFilterCollapsedRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (treeFilterActive && !wasFilteredRef.current) {
      preFilterCollapsedRef.current = new Set(collapsedSR);
    } else if (!treeFilterActive && wasFilteredRef.current && preFilterCollapsedRef.current) {
      setCollapsedSR(new Set(preFilterCollapsedRef.current));
      preFilterCollapsedRef.current = null;
    }
    wasFilteredRef.current = treeFilterActive;
  }, [treeFilterActive]);
  /** U20 滚动恢复(初始偏移): 从会话上下文读回,交 virtualizer 挂载期应用——
   *  effect 内写 scrollTop 在 SPA 返回路径被挂载测量回零(实机探针实证),
   *  initialOffset 是虚拟列表管线下唯一无竞态的恢复口 */
  const [initialScrollTop] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(REQ_BOARD_CTX) ?? 'null');
      return Number(saved?.scrollTop ?? 0) || 0;
    } catch {
      return 0;
    }
  });
  const rowVirtualizer = useVirtualizer({
    count: flatRows.length,
    initialOffset: initialScrollTop,
    getScrollElement: () => tableRef.current,
    // 实测两档稳定行高(child 40 / sr+plain 43)且单行省略号锁定——固定
    // 尺寸免去 measureElement 的 mount→measure→recalculate 级联回流
    // (快速滚动时实测 11 个 long task、最坏 640ms 的主凶)。
    estimateSize: (i) => (flatRows[i].kind === 'child' ? 40 : 43),
    overscan: 10, // 编辑中滚动不丢行的缓冲(编辑态无全局信号,以距离兜底)
    getItemKey: (i) => flatRows[i].project.id,
  });
  /** U20 直写兜底通道: jsdom 无 ResizeObserver,virtualizer 的 initialOffset
   *  不落元素——一次性直写让无头环境可测;真浏览器 SPA 返回路径此直写会被
   *  挂载测量回零,由 initialOffset 主通道兜住(双通道幂等无害) */
  const directRestoreRef = useRef(false);
  useEffect(() => {
    if (directRestoreRef.current || initialScrollTop <= 0 || flatRows.length === 0 || !tableRef.current) return;
    directRestoreRef.current = true;
    tableRef.current.scrollTop = initialScrollTop;
  }, [initialScrollTop, flatRows.length]);
  // 保存反馈(flash)的行可能在视口外——先滚过去再闪
  const flashTargetIndex = flashId ? flatRows.findIndex((r) => r.project.id === flashId) : -1;
  useEffect(() => {
    if (flashTargetIndex >= 0) rowVirtualizer.scrollToIndex(flashTargetIndex, { align: 'auto' });
  }, [flashTargetIndex, rowVirtualizer]);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const el = tableRef.current;
    if (!el) return; // loading 期表未渲染,依赖 projects 数据到位后重挂
    const ro = new ResizeObserver(() => setContainerW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [projects]);


  /** 空态文案分支用: 是否有任何筛选在活跃(与 trees memo 内部口径一致) */
  const anyFilterActive = Boolean(
    filters.search || filters.tag_id || filters.component || filters.subtype
    || filters.product_version || filters.release_version || filters.lifecycle_state
    || taskView || warningFilter
  );

  // ── U15 个人视图动作: 快照=任务视图+属性筛选(含未防抖搜索词),恢复全量回放 ──
  const persistPersonalViews = (next: typeof personalViews) => {
    setPersonalViews(next);
    localStorage.setItem(personalViewsKey, JSON.stringify(next));
  };
  const savePersonalView = () => {
    const name = viewName.trim();
    if (!name) return;
    const snapshot = {
      name,
      taskView,
      filters: { ...filters, search: searchInput }
    };
    persistPersonalViews([...personalViews.filter((v) => v.name !== name), snapshot]);
    setAppliedPersonalView(name);
    setNamingView(false);
    setViewName('');
  };
  const restorePersonalView = (name: string) => {
    setAppliedPersonalView(name);
    const v = personalViews.find((x) => x.name === name);
    if (!v) return;
    setSearchInput(v.filters.search ?? '');
    setFilters({
      search: v.filters.search ?? '',
      lifecycle_state: v.filters.lifecycle_state ?? '',
      tag_id: v.filters.tag_id ?? '',
      component: v.filters.component ?? '',
      subtype: v.filters.subtype ?? '',
      product_version: v.filters.product_version ?? '',
      release_version: v.filters.release_version ?? ''
    });
    setTaskView(v.taskView ?? '');
  };
  const deletePersonalView = () => {
    if (!appliedPersonalView) return;
    persistPersonalViews(personalViews.filter((v) => v.name !== appliedPersonalView));
    setAppliedPersonalView('');
  };

  /** Q3: chip 点击=按标签过滤,再点同枚取消(GitHub 式) */
  const toggleTagFilter = (tagId: string | number) => {
    setFilters((prev) => ({ ...prev, tag_id: prev.tag_id === String(tagId) ? '' : String(tagId) }));
  };

  const toggleSR = (id: string) => {
    setCollapsedSR((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleEditProject = (project: Project) => {
    setEditingProject(project);
    editProjectModal.open();
  };

  const twoClickDelete = (project: any) => {
    if (confirmingDelete !== project.id) {
      setConfirmingDelete(project.id);
      setTimeout(() => setConfirmingDelete((cur) => (cur === project.id ? null : cur)), 3000);
      return;
    }
    deleteProjectMutation.mutate(project.id);
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });

  // ── 批量选择模型(2026-10-11): 统一闭包——勾 SR=整棵子树入选; ──
  // 全部操作(含删除)作用于同一集合,条上计数=实际作用行数(含折叠子行);
  // 筛选/折叠变化不丢选择;删除成功后仅移除已删 id,更新后保持(允许链式)。
  /** U20 返回上下文: 详情返回/会话内重进——滚动位与选择集可恢复 */
  const ctxDirtyRef = useRef(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(REQ_BOARD_CTX) ?? 'null');
      return new Set<string>(Array.isArray(saved?.selected) ? saved.selected : []);
    } catch {
      return new Set<string>();
    }
  });
  const toggleIds = (ids: string[], select: boolean) => {
    ctxDirtyRef.current = true; // U20: 有过选择交互,卸载时才值得写上下文
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (select) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };
  const triState = (ids: string[]): boolean | 'indeterminate' => {
    let hit = 0;
    for (const id of ids) if (selectedIds.has(id)) hit += 1;
    return hit === 0 ? false : hit === ids.length ? true : 'indeterminate';
  };
  /** 全选作用域=当前筛选结果全部行(含折叠子行),从 trees 直接取 */
  const viewRowIds = useMemo(
    () => trees.flatMap((tr) => [tr.project.id, ...tr.children.map((c: any) => c.id)]),
    [trees]
  );
  const selectedList = useMemo(() => [...selectedIds], [selectedIds]);
  /** 行索引(全量需求行,不受当前筛选影响——选择可跨筛选存续) */
  const rowById = useMemo(() => new Map(demandRows.map((r: any) => [r.id as string, r])), [demandRows]);
  /** 选中项身上出现过的标签并集(标签气泡"移除"段候选) */
  const tagsOnSelection = useMemo(() => {
    const s = new Set<string>();
    for (const id of selectedIds) {
      for (const tg of rowById.get(id)?.tags ?? []) s.add(String(tg.id));
    }
    return s;
  }, [selectedIds, rowById]);
  /** U18 选择可见性: 可见行集合/可见选中数/选中行原文(清单与预检用) */
  const visibleRowIdSet = useMemo(() => new Set(viewRowIds), [viewRowIds]);
  const visibleSelectedCount = useMemo(
    () => [...selectedIds].filter((id) => visibleRowIdSet.has(id)).length,
    [selectedIds, visibleRowIdSet]
  );
  const selectionRowsRaw = useMemo(
    () => [...selectedIds].map((id) => rowById.get(id)).filter(Boolean) as Array<Record<string, any>>,
    [selectedIds, rowById]
  );
  /** U18 定位对象: 清全部筛选让目标回视野,复用 flash 滚动+闪烁 */
  const locateSelected = (id: string) => {
    setSearchInput('');
    setFilters({
      search: '', lifecycle_state: '', tag_id: '', component: '', subtype: '',
      product_version: '', release_version: ''
    });
    setTaskView('');
    setWarningFilter('');
    setFlashId(id);
  };

  /** 选择集↔活数据对账(2026-10-11 审视#1): 任何删除路径(行内删/详情页删/
   *  批量删/外部改库)在数据刷新后自动移出已消失行——否则死 id 毒化后续批量
   *  (全有或全无 400,报错含用户看不见的 UUID)。基准=demandRows(全量行,
   *  不受筛选影响,跨筛选存续语义不变)。 */
  useEffect(() => {
    if (projects === undefined) return; // U20: 加载中行集为空——不清刚恢复的选择
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const alive = new Set(demandRows.map((r: any) => r.id as string));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (alive.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [demandRows, projects]);
  /** U20 上下文保存: 选择集变化即存,卸载清理时再存一次(带最新滚动位)——
   *  详情页返回/重进即恢复;对账 effect 剔除已消失行防死 id */
  /** 滚动位持续记入 ref——卸载清理时 tableRef.current 已被 React 摘成 null,
   *  直接读元素必得 0(实机 goBack 探针实证);onScroll 实时镜像最稳。
   *  dirty 门控: 只有本挂载发生过真实交互(选择/滚动)才写——挂载零写,
   *  StrictMode 开发期双跑与"进页即出"都不会把预存上下文清成空载 */
  const scrollPosRef = useRef(0);
  useEffect(() => {
    const save = () => {
      if (!ctxDirtyRef.current) return;
      try {
        sessionStorage.setItem(REQ_BOARD_CTX, JSON.stringify({
          scrollTop: scrollPosRef.current,
          selected: [...selectedIds]
        }));
      } catch { /* 隐私模式等存储异常静默 */ }
    };
    save();
    return save;
  }, [selectedIds]);


  const batchDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => {
      if (ids.length > BATCH_LIMIT) {
        throw new Error(t('projects:board.bulkTooMany', { n: ids.length, limit: BATCH_LIMIT }));
      }
      return api.projects.batchDelete(ids);
    },
    onSuccess: (resp: any) => {
      // axios 信封 {success, data:{deleted, items}} → 双层解包(防御取形)
      const payload = resp?.data?.data ?? resp?.data ?? {};
      const deleted = new Set<string>((payload.items ?? []).map((i: any) => i.id));
      setSelectedIds((prev) => new Set([...prev].filter((id) => !deleted.has(id))));
      invalidate();
      showOkToast(t('projects:board.bulkDeleted', { n: payload.deleted ?? 0 }));
    }
  });
  const batchUpdateMutation = useMutation({
    mutationFn: ({ ids, patch }: { ids: string[]; patch: Record<string, unknown> }) => {
      if (ids.length > BATCH_LIMIT) {
        throw new Error(t('projects:board.bulkTooMany', { n: ids.length, limit: BATCH_LIMIT }));
      }
      return api.projects.batchUpdate(ids, patch);
    },
    onSuccess: (resp: any) => {
      invalidate();
      // 批量挂接/解除同样改迭代归属: 迭代卡统计服务端实时算自 projects
      // (GET /iterations),只失效 projects 时迭代卡陈旧最长 5 分钟(2026-10-13 审计)
      queryClient.invalidateQueries({ queryKey: queryKeys.iterations.all });
      const payload = resp?.data?.data ?? resp?.data ?? {};
      const n = payload.updated ?? 0;
      const skipped = payload.skipped ?? 0;
      showOkToast(skipped > 0
        ? t('projects:board.bulkUpdatedSkip', { n, skip: skipped })
        : t('projects:board.bulkUpdated', { n }));
    }
  });
  const batchPending = batchDeleteMutation.isPending || batchUpdateMutation.isPending;

  // ── 列宽拖拽状态: localStorage 初始化,容器挂 CSS 变量驱动全部行/断点 ──
  const [colWidths, setColWidths] = useState<Partial<Record<ReqColKey, number>>>(() => {
    try {
      return JSON.parse(localStorage.getItem(REQ_WIDTHS_STORE) ?? '{}');
    } catch {
      return {};
    }
  });
  /* 三档与 App.css 断点一致: ≥1680 全列 / [1560,1680) 藏规模 / <1560 藏规模+负责人 */
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1600;
  /* 2026-09-22 P16 实测修正: 1600 视口真实内容宽 ~1300(左侧导航 ~300px),
     全列 1438 只能横滚——全列档维持 ≥1680;中档(1560–1679)藏 规模+负责人
     (编号列加入的预算由负责人让位),紧凑档再藏编号 */
  const showAll = vw >= 1680;
  const compact = vw < 1560;
  /** U16 预设隐藏集: 非默认预设=预设集∪档位集(联合口径,窄视口不破预算);
   *  null=默认档,隐藏完全由 CSS 媒体查询管(JS 不参与,零回归)。iter 在
   *  紧凑档今日即 0 宽(def[2]=0),联合集里显式列入等价处理 */
  const hiddenCols: Set<ReqColKey> | null = useMemo(() => {
    if (colPreset === 'default') return null;
    const tierHidden: ReqColKey[] = compact
      ? ['number', 'component', 'release', 'primary', 'iter']
      : showAll ? [] : ['component'];
    return new Set<ReqColKey>([...COL_PRESET_HIDDEN[colPreset], ...tierHidden]);
  }, [colPreset, compact, showAll]);
  const colVisible = (key: ReqColKey) => !hiddenCols?.has(key);
  const colVars = useMemo(() => {
    const vars: Record<string, string> = {};
    const hidden = compact ? ['component', 'number', 'release', 'primary'] : showAll ? [] : ['component'];
    const visible = REQ_COLUMNS.filter((c) => !hidden.includes(c.key));
    const visibleForTemplate = hiddenCols ? visible.filter((c) => !hiddenCols.has(c.key)) : null;
    const nGaps = Math.max(1, visible.length - 1);
    const rawWidths = visible.map((c) => {
      const def = showAll ? c.def[0] : compact ? c.def[2] : c.def[1];
      return colWidths[c.key] ?? def;
    });
    const fixedTracks = 28 + rawWidths.reduce((a, b) => a + b, 0);

    /* 余量分配(2026-09-23 用户裁决"左松右紧"→ 空间节奏再设计):
       优先均匀摊进列间距(8px 起 24px 封顶)——间距放大必须先于 scale 判定,
       否则 total 低估实际轨道和(紧凑档 71px 横滚的最终根因) */
    let gap = 8;
    if (containerW > 0) {
      const fitGap = Math.floor((containerW - fixedTracks) / nGaps);
      gap = Math.max(8, Math.min(24, fitGap));
      if (gap > 8) vars['--req-gap'] = `${gap}px`;
    }

    // 空间不足(滚动容器时代纵向滚动条吃掉 ~15px + 部分档位轨道逼近预算)
    // → 整排等比微缩(不动列语义/隐藏裁决)且间距回底档,零横滚优先。
    const rawTotal = fixedTracks + gap * nGaps;
    const scale = containerW > 0 && rawTotal > containerW ? (containerW - 2) / rawTotal : 1;
    if (scale < 1) vars['--req-gap'] = '8px';
    let total = 28;
    visible.forEach((c, i) => {
      const w = Math.round(rawWidths[i] * scale);
      vars[`--req-w-${c.key}`] = `${w}px`;
      total += w;
    });
    total += (scale < 1 ? 8 : gap) * nGaps;

    /* 拖过的列=钉死,按类别退出分配: elastic(名称) fr 归零并启用尾部占位轨
       承接剩余; cap 列上限锁为拖宽值(minmax(w,w)=定死); 定宽列本就 var 直取 */
    for (const c of visible) {
      const w = colWidths[c.key];
      if (w === undefined) continue;
      if ((c as any).kind === 'elastic') {
        vars[`--req-f-${c.key}`] = '0fr';
        vars['--req-spacer'] = '1fr';
      } else if ((c as any).kind === 'cap') {
        vars[`--req-cap-${c.key}`] = `${w}px`;
      }
    }

    /* U16 预设模板: JS 按可见集生成 grid-template,经 --req-template 覆盖
       CSS 四处字面量声明(已包 var fallback,默认档不设此变量=CSS 原路径)。
       轨道语法与字面量同构: name=elastic minmax+fr, iter=cap minmax, 余定宽 */
    if (visibleForTemplate) {
      const tierIdx = showAll ? 0 : compact ? 2 : 1;
      const tracks = visibleForTemplate.map((c) => {
        const w = colWidths[c.key] ?? (showAll ? c.def[0] : compact ? c.def[2] : c.def[1]);
        if (c.key === 'name') return `minmax(${w}px, ${colWidths.name !== undefined ? '0fr' : '1.2fr'})`;
        if ((c as any).kind === 'cap') {
          const cap = (colWidths as any)[c.key] ?? (c as any).cap[tierIdx];
          return `minmax(${w}px, ${cap}px)`;
        }
        return `${w}px`;
      });
      vars['--req-template'] = `${tracks.join(' ')} var(--req-spacer, 0fr)`;
    }

    vars['--req-total'] = containerW > 0 ? `${Math.min(total, containerW)}px` : `${total}px`;
    return vars as React.CSSProperties;
  }, [colWidths, showAll, compact, containerW, hiddenCols]);

  /** 批量操作成功反馈(2026-10-11): 与失败 toast 同形态。
   *  失败面由 useMutationFailureToaster 承担(2026-10-16 lint 清):
   *  旧 errorToast 链唯一写入口 showErrorToast 已无人调用,整链摘除 */
  const [okToast, setOkToast] = useState<string | null>(null);
  const showOkToast = (msg: string) => {
    setOkToast(msg);
    window.setTimeout(() => setOkToast(null), 3000);
  };
  // IP-06a/U02: 全量 mutation 失败提示 + 重试。旧订阅比较 'rejected'(v5 实为
  // 'error')永不触发——生命周期推进/KLOC 保存/选人 503 均无任何反馈
  const { failure: mutationFailure, dismiss: dismissMutationFailure } = useMutationFailureToaster(queryClient);

  const flashRow = (id: string) => {
    // invalidate 后 rerender 可能吞掉同步 setState;下一帧再闪(2026-09-23 P1)
    requestAnimationFrame(() => {
      setFlashId(id);
      window.setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 900);
    });
  };

  /** 行内保存统一出口: 刷新 + 行 flash (可选 field/value 兼容 ReleaseCell 回调形) */
  const handleCellSaved = (projectId: string, _field?: string, _value?: string | null) => {
    invalidate();
    flashRow(projectId);
  };

  if (isLoading) return (
    <div className='projects-board req-skeleton'>
      {[1,2,3].map(i => <div key={i} className='req-skeleton-row' />)}
    </div>
  );
  if (error) return <ErrorMessage message={(error as any)?.message || t('projects:loadError')} />;

  return (
    <div className="projects-board">
      {/* 单行工具栏(静区): 计数 + 搜索 | 筛选 | 动作 —— 40px 栅格,主色仅"新建"一处 */}
      <div className="projects-toolbar" data-testid="filter-bar">
        <span className="board-count">
          {(() => {
            // U19: 筛选期区分 真命中/连同上下文(树语义保留的父与兄弟)
            if (treeFilterActive && hitIds && hitIds.size < flatRows.length) {
              return t('projects:board.countHitContext', { hit: hitIds.size, total: flatRows.length });
            }
            const arCount = trees.reduce((n, tr) => n + tr.children.length, 0);
            return arCount > 0
              ? t('projects:board.countSummaryWithAr', { count: trees.length, ar: arCount })
              : t('projects:board.countSummary', { count: trees.length });
          })()}
        </span>
        <div className="board-search">
          <Search size={14} className="board-search-icon" />
          <input
            data-testid="search-input"
            className="board-search-input"
            placeholder={t('projects:searchPlaceholder')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <select
          data-testid="lifecycle-filter"
          className="board-select"
          value={filters.lifecycle_state}
          onChange={(e) => setFilters((prev) => ({ ...prev, lifecycle_state: e.target.value }))}
        >
          <option value="">{t('projects:lifecycle.filterLabel')}</option>
          {['pending_rat', 'nok', 'designing', 'backlog', 'scheduled', 'in_iteration', 'delivered', 'cancelled'].map(
            (s) => <option key={s} value={s}>{t(`projects:lifecycle.state.${s}`)}</option>
          )}
        </select>
        <select
          data-testid="tag-filter"
          className="board-select"
          value={filters.tag_id}
          onChange={(e) => setFilters((prev) => ({ ...prev, tag_id: e.target.value }))}
        >
          <option value="">{t('projects:tags.filterLabel')}</option>
          {tags.map((tag) => <option key={String(tag.id)} value={String(tag.id)}>{tag.name}</option>)}
        </select>
        <select
          data-testid="component-filter"
          className="board-select"
          value={filters.component}
          onChange={(e) => setFilters((prev) => ({ ...prev, component: e.target.value }))}
        >
          <option value="">{t('projects:board.filterComponent')}</option>
          {componentOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          data-testid="subtype-filter"
          className="board-select"
          value={filters.subtype}
          onChange={(e) => setFilters((prev) => ({ ...prev, subtype: e.target.value }))}
        >
          <option value="">{t('projects:board.filterSubtype')}</option>
          {subtypeOptions.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        {/* 版本维度以筛选表达(2026-09-22 裁决: 不做分组头,两列已携带信息) */}
        <select
          data-testid="product-filter"
          className="board-select"
          value={filters.product_version}
          onChange={(e) => setFilters((prev) => ({ ...prev, product_version: e.target.value }))}
        >
          <option value="">{t('projects:board.colVersion')}</option>
          {productOptions.map((v) => <option key={v} value={v}>{v}</option>)}
          <option value={VERSION_NONE}>{t('projects:version.productPlaceholder')}</option>
        </select>
        <select
          data-testid="release-filter"
          className="board-select"
          value={filters.release_version}
          onChange={(e) => setFilters((prev) => ({ ...prev, release_version: e.target.value }))}
        >
          <option value="">{t('projects:board.colRelease')}</option>
          {releaseOptions.map((v) => <option key={v} value={v}>{v}</option>)}
          <option value={VERSION_NONE}>{t('projects:version.releasePlaceholder')}</option>
        </select>
        {(filters.search || filters.lifecycle_state || filters.tag_id || filters.component || filters.subtype
          || filters.product_version || filters.release_version || taskView || warningFilter) && (
          <button
            data-testid="reset-filters"
            className="board-reset"
            title={t('projects:board.resetFilters')}
            onClick={() => { setSearchInput('');
              setFilters({
              search: '', lifecycle_state: '', tag_id: '', component: '', subtype: '',
              product_version: '', release_version: ''
            }); setTaskView(''); setWarningFilter(''); }}
          >
            <X size={13} />
          </button>
        )}
        <div className="board-toolbar-right">
          <button className="board-ghost-btn" onClick={() => setTagManagerOpen(true)}>
            <Tag size={14} />
            {t('projects:tags.manageButton')}
          </button>
          <button className="board-primary-btn" onClick={addProjectModal.open}>
            <Plus size={15} />
            {t('projects:addNewProject')}
          </button>
        </div>
      </div>

      {/* U15 任务视图行(2026-10-17,IP-06d): 六个事实锚定的队列入口——点选过滤
          (树语义:AR 命中保 SR 上下文),再点取消;计数随属性筛选上下文(与表格
          同源,lib/taskViews 单一真相)。右侧个人视图:保存/恢复/删除本页上下文 */}
      <div className="task-views" data-testid="task-views" role="group" aria-label={t('projects:taskViews.groupLabel')}>
        <button
          type="button"
          data-testid="task-view-all"
          className="task-view-chip"
          aria-pressed={taskView === ''}
          onClick={() => setTaskView('')}
        >
          {t('projects:taskViews.all')}
        </button>
        {TASK_VIEW_IDS.map((v) => (
          <button
            key={v}
            type="button"
            data-testid={`task-view-${v}`}
            className="task-view-chip"
            aria-pressed={taskView === v}
            title={t(`projects:taskViews.${v}Hint`)}
            onClick={() => setTaskView((cur) => (cur === v ? '' : v))}
          >
            {t(`projects:taskViews.${v}`)}
            <span className="task-view-count">{taskCounts[v]}</span>
          </button>
        ))}
        {warningFilter && (() => {
          const count = demandRows.filter((p: any) => attrMatch(p) && (p.lifecycle_warnings ?? []).includes(warningFilter)).length;
          return (
            <span className="task-view-chip warn-filter-pill" data-testid="warn-filter-pill">
              {t(`projects:lifecycle.warnings.${warningFilter}`, { defaultValue: warningFilter })}
              <span className="task-view-count">{count}</span>
              <button
                type="button"
                data-testid="warn-filter-clear"
                className="warn-filter-clear"
                title={t('projects:board.resetFilters')}
                onClick={() => setWarningFilter('')}
              >
                <X size={11} />
              </button>
            </span>
          );
        })()}
        <div className="personal-views">
          <select
            data-testid="col-preset-select"
            className="board-select"
            aria-label={t('projects:colPresets.label')}
            value={colPreset}
            onChange={(e) => applyColPreset(e.target.value as ColPresetId)}
          >
            {COL_PRESET_IDS.map((p) => (
              <option key={p} value={p}>{t(`projects:colPresets.${p}`)}</option>
            ))}
          </select>
          <select
            data-testid="personal-view-select"
            className="board-select"
            value={appliedPersonalView}
            onChange={(e) => restorePersonalView(e.target.value)}
          >
            <option value="">{t('projects:taskViews.myViews')}</option>
            {personalViews.map((v) => (
              <option key={v.name} value={v.name}>{v.name}</option>
            ))}
          </select>
          {namingView ? (
            <>
              <input
                data-testid="personal-view-name"
                className="personal-view-name"
                value={viewName}
                placeholder={t('projects:taskViews.namePlaceholder')}
                onChange={(e) => setViewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && savePersonalView()}
              />
              <button type="button" data-testid="personal-view-confirm" className="board-ghost-btn" onClick={savePersonalView}>
                {t('projects:taskViews.confirmSave')}
              </button>
            </>
          ) : (
            <button type="button" data-testid="personal-view-save" className="board-ghost-btn" onClick={() => setNamingView(true)}>
              {t('projects:taskViews.save')}
            </button>
          )}
          <button
            type="button"
            data-testid="personal-view-delete"
            className="board-ghost-btn"
            disabled={!appliedPersonalView}
            onClick={deletePersonalView}
          >
            {t('projects:taskViews.delete')}
          </button>
        </div>
      </div>

      <div
        ref={tableRef}
        className={`requirements-table ${selectedIds.size > 0 ? 'requirements-table--bulk' : ''}`}
        data-testid="requirements-table"
        style={colVars}
        onScroll={(e) => {
          scrollPosRef.current = e.currentTarget.scrollTop;
          if (e.currentTarget.scrollTop > 0) ctxDirtyRef.current = true;
        }}
      >
        <div className="requirements-thead">
          <span className="req-select req-select--head">
            <ReqCheckbox
              checked={viewRowIds.length > 0 ? triState(viewRowIds) : false}
              onToggle={(next) => toggleIds(viewRowIds, next)}
              label={t('projects:board.selectAll')}
              disabled={viewRowIds.length === 0}
            />
          </span>
          {([
            ['projects:board.colName', 'name'],
            ['projects:board.colNumber', 'number'],
            ['projects:board.colComponent', 'component'],
            ['projects:lifecycleColumn', 'lifecycle'],
            ['projects:board.colKloc', 'kloc'],
            ['projects:board.colEffort', 'effort'],
            ['projects:board.colSe', 'se'],
            ['projects:board.colMde', 'mde'],
            ['projects:board.colVersion', 'version'],
            ['projects:board.colRelease', 'release'],
            ['projects:board.colIteration', 'iter'],
            ['projects:board.colPriority', 'priority'],
            ['projects:board.colPrimary', 'primary'],
            ['common:actions', 'actions']
          ] as const).filter(([, colKey]) => colVisible(colKey)).map(([key, colKey]) => (
            <span key={colKey} className={['lifecycle', 'priority', 'actions'].includes(colKey) ? 'col-c' : ''}>
              {t(key)}
              {colKey !== 'actions' && ( /* 2026-09-23 修: 硬编码 i<10 漏掉后加的列 */
                <ColumnGrip colKey={colKey} widths={colWidths} setWidths={setColWidths} />
              )}
            </span>
          ))}
        </div>

        {/* 平铺呈现 SR/AR 粒度事项本体(2026-09-22 裁决: 版本维度走筛选,不做分组头)。
            虚拟化改造(P5+P6 根治): 行渲染逻辑保留原三分支 JSX,外层换 virtualizer。 */}
        {(() => {
          const renderFlatRow = (row: FlatRow) => {
          const project = row.project;
          const warned = (project.lifecycle_warnings ?? []).length > 0;
          const isSR = row.kind === 'sr';
          const srCollapsed = isSR && collapsedSR.has(project.id);

          if (row.kind === 'plain') {
          const hitCls = hitIds ? (hitIds.has(project.id) ? 'requirements-row--hit' : 'requirements-row--context') : '';
          return (
            <div
              key={project.id}
              className={`requirements-row ${hitCls} ${warned ? 'requirements-row--warned' : ''} ${project.id === flashId ? 'requirements-row--flash' : ''}`}
              onClick={() => { scrollPosRef.current = tableRef.current?.scrollTop ?? scrollPosRef.current; navigate(`/projects/${project.id}`); }}
            >
              <span className="req-select" onClick={(e) => e.stopPropagation()}>
                <ReqCheckbox
                  checked={selectedIds.has(project.id)}
                  onToggle={(next) => toggleIds([project.id], next)}
                  label={t('projects:board.selectRow', { name: project.name })}
                />
              </span>
              <span className="requirements-name">
                <span className="requirements-name-text" title={project.name}>{project.name}</span>
                {(project.lifecycle_warnings ?? []).length > 0 && (
                  <button
                    type="button"
                    className="lifecycle-warn-chip"
                    title={(project.lifecycle_warnings ?? [])
                      .map((w: string) => t(`projects:lifecycle.warnings.${w}`))
                      .join('\n')}
                    onClick={(e) => { e.stopPropagation(); setDetailRow(project); setDetailFocus('warnings'); }}
                  >
                    {t(`projects:lifecycle.warningShort.${(project.lifecycle_warnings ?? [])[0]}`, {
                      defaultValue: t('projects:lifecycle.warningShort.GENERIC')
                    })}
                    {(project.lifecycle_warnings ?? []).length > 1
                      ? `+${(project.lifecycle_warnings ?? []).length - 1}`
                      : ''}
                  </button>
                )}
                <TagsCell project={project} allTags={tags} onSaved={() => handleCellSaved(project.id)} onFilterByTag={toggleTagFilter} activeTagId={filters.tag_id} />
                <button type="button" className="req-ar-add" title={t('projects:board.decompose')}
                        onClick={(e) => { e.stopPropagation(); setDecomposeParent(project); }}>
                  <GitBranch size={12} />
                </button>
              </span>

              {colVisible('number') && <NumberPart project={project} onSaved={() => handleCellSaved(project.id)} />}

              {colVisible('component') && <ComponentCell project={project} options={componentOptions} onSaved={() => handleCellSaved(project.id)} />}

              <span className="req-cell-center" onClick={(e) => e.stopPropagation()}>
                <LifecycleCellControls project={project} />
              </span>

              {colVisible('kloc') && <KlocCell project={project} kloc={project.estimation_summary?.kloc ?? null} onSaved={() => handleCellSaved(project.id)} />}

              {colVisible('effort') && <EffortCell project={project} pm={project.estimation_summary?.pm ?? null} overridden={project.estimation_summary?.pm_overridden} onSaved={() => handleCellSaved(project.id)} />}

              {colVisible('se') && <RoleCell roleName="se" person={project.se_assignment} pm={project.design_estimates?.se ?? null} project={project} onSaved={() => handleCellSaved(project.id)} />}

              {colVisible('mde') && <RoleCell roleName="mde" person={project.mde_assignment} pm={project.design_estimates?.mde ?? null} project={project} onSaved={() => handleCellSaved(project.id)} />}

              {colVisible('version') && <VersionPart project={project} field="product_version"
                placeholder={t('projects:version.productPlaceholder')}
                hint={t('projects:version.productTitle')}
                onSaved={() => handleCellSaved(project.id)} />}
              {colVisible('release') && <ReleaseCell project={project} onSaved={() => handleCellSaved(project.id)} />}
              {colVisible('iter') && <IterationCell project={project} onSaved={() => handleCellSaved(project.id)} />}

              {colVisible('priority') && <PriorityCell project={project} rank={priorityRanks.get(project.id)} onSaved={() => handleCellSaved(project.id)} />}

              {colVisible('primary') && <PrimaryDevCell primary={project.primary_dev} project={project} onSaved={() => handleCellSaved(project.id)} />}

              <span className="requirements-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  className="req-icon-btn"
                  data-testid="row-detail-btn"
                  title={t('projects:rowDetail.open')}
                  onClick={(e) => { e.stopPropagation(); setDetailRow(project); }}
                >
                  <Info size={14} />
                </button>
                <button
                  className="req-icon-btn"
                  title={t('common:edit')}
                  onClick={() => handleEditProject(project)}
                >
                  <Edit2 size={14} />
                </button>
                <button
                  className={`req-icon-btn ${confirmingDelete === project.id ? 'req-icon-btn--confirm' : ''}`}
                  title={confirmingDelete === project.id ? t('common:confirm') : t('common:delete')}
                  onClick={() => twoClickDelete(project)}
                >
                  {confirmingDelete === project.id ? t('common:confirm') : <Trash2 size={14} />}
                </button>
              </span>
            </div>
          );
          }

          if (isSR) {
          // ── SR 折叠头行: 汇总只读(=子行之和,同一数据源);状态列=子行分布 ──
          const agg = row.agg!;
          // 勾 SR=整棵子树入选(三态框),与批量删除的后代闭包语义一致
          const subtreeIds = [project.id as string, ...(row.children ?? []).map((c: any) => c.id as string)];
          const hitCls = hitIds ? (hitIds.has(project.id) ? 'requirements-row--hit' : 'requirements-row--context') : '';
          return (
            <div
              key={project.id}
              className={`requirements-row requirements-row--sr ${hitCls} ${warned ? 'requirements-row--warned' : ''} ${project.id === flashId ? 'requirements-row--flash' : ''}`}
              onClick={() => { scrollPosRef.current = tableRef.current?.scrollTop ?? scrollPosRef.current; navigate(`/projects/${project.id}`); }}
            >
              <span className="req-select" onClick={(e) => e.stopPropagation()}>
                <ReqCheckbox
                  checked={triState(subtreeIds)}
                  onToggle={(next) => toggleIds(subtreeIds, next)}
                  label={t('projects:board.selectTree', { name: project.name, count: subtreeIds.length - 1 })}
                />
              </span>
              <span className="requirements-name">
                <button
                  type="button"
                  className="req-sr-toggle"
                  title={t('projects:board.srToggleHint')}
                  aria-expanded={!srCollapsed}
                  onClick={(e) => { e.stopPropagation(); toggleSR(project.id); }}
                >
                  {srCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                </button>
                <span className="requirements-name-text" title={project.name}>{project.name}</span>
                <span className="req-sr-note">{t('projects:board.arCountNote', { count: agg.count })}</span>
                {(project.lifecycle_warnings ?? []).length > 0 && (
                  <button
                    type="button"
                    className="lifecycle-warn-chip"
                    title={(project.lifecycle_warnings ?? [])
                      .map((w: string) => t(`projects:lifecycle.warnings.${w}`))
                      .join('\n')}
                    onClick={(e) => { e.stopPropagation(); setDetailRow(project); setDetailFocus('warnings'); }}
                  >
                    {t(`projects:lifecycle.warningShort.${(project.lifecycle_warnings ?? [])[0]}`, {
                      defaultValue: t('projects:lifecycle.warningShort.GENERIC')
                    })}
                    {(project.lifecycle_warnings ?? []).length > 1
                      ? `+${(project.lifecycle_warnings ?? []).length - 1}`
                      : ''}
                  </button>
                )}
                <TagsCell project={project} allTags={tags} onSaved={() => handleCellSaved(project.id)} onFilterByTag={toggleTagFilter} activeTagId={filters.tag_id} />
                <button type="button" className="req-ar-add" title={t('projects:board.decompose')}
                        onClick={(e) => { e.stopPropagation(); setDecomposeParent(project); }}>
                  <GitBranch size={12} />
                </button>
              </span>

              {colVisible('number') && <NumberPart project={project} onSaved={() => handleCellSaved(project.id)} />}

              {colVisible('component') && <ComponentCell project={project} options={componentOptions} onSaved={() => handleCellSaved(project.id)} />}

              <span className="req-cell-center req-state-dist">
                {agg.states.map((s: any) => (
                  <span key={s.state ?? 'none'} className="req-state-dist-item">
                    {s.count}·{s.state ? t(`projects:lifecycle.state.${s.state}`) : '—'}
                  </span>
                ))}
              </span>

              {/* SR 规模/人月(2026-09-23 用户裁决"参数都可调"):
                  显示 = SR 自身值 ?? 子行聚合; 偏差 = 两者都有且不等 → 琥珀告警 */}
              {colVisible('kloc') && <KlocCell project={project}
                kloc={project.estimation_summary?.kloc ?? agg.kloc}
                derived={project.estimation_summary?.kloc == null && agg.kloc != null}
                deviated={project.estimation_summary?.kloc != null && agg.kloc != null && project.estimation_summary.kloc !== agg.kloc}
                onSaved={() => handleCellSaved(project.id)} />}

              {colVisible('effort') && <EffortCell project={project}
                pm={project.estimation_summary?.pm ?? agg.effortPm}
                derived={project.estimation_summary?.pm == null && agg.effortPm != null}
                deviated={project.estimation_summary?.pm != null && agg.effortPm != null && project.estimation_summary.pm !== agg.effortPm}
                onSaved={() => handleCellSaved(project.id)} />}

              {colVisible('se') && <span className="req-role req-role--agg" title={t('projects:roleCell.srTooltip', { role: 'SE', persons: agg.sePersons.join('、') || '—' })}>
                {agg.sePm != null
                  ? <span className="req-role-pm">Σ{agg.sePm}{agg.sePersons.length > 1 ? `·${agg.sePersons.length}人` : ''}</span>
                  : <span className="text-muted">—</span>}
              </span>}

              {colVisible('mde') && <span className="req-role req-role--agg" title={t('projects:roleCell.srTooltip', { role: 'MDE', persons: agg.mdePersons.join('、') || '—' })}>
                {agg.mdePm != null
                  ? <span className="req-role-pm">Σ{agg.mdePm}{agg.mdePersons.length > 1 ? `·${agg.mdePersons.length}人` : ''}</span>
                  : <span className="text-muted">—</span>}
              </span>}

              {colVisible('version') && <VersionPart project={project} field="product_version"
                placeholder={t('projects:version.productPlaceholder')}
                hint={t('projects:version.productTitle')}
                onSaved={() => handleCellSaved(project.id)} />}
              {colVisible('release') && <ReleaseCell project={project} onSaved={() => handleCellSaved(project.id)}
                readOnlyWindow={aggIterWindow(row.children ?? [])} />}
              {colVisible('iter') && <IterationCell project={project} onSaved={() => handleCellSaved(project.id)}
                readOnlyWindow={aggIterWindow(row.children ?? [])} />}

              {colVisible('priority') && <PriorityCell project={project} rank={priorityRanks.get(project.id)} onSaved={() => handleCellSaved(project.id)} />}
              {colVisible('primary') && <span className="req-primary req-primary--agg" title={agg.primaryPersons.join('、') || undefined}>
                {agg.primaryPersons.length > 0
                  ? <span className="req-primary-person">{agg.primaryPersons.length}人</span>
                  : <span className="text-muted">—</span>}
              </span>}

              <span className="requirements-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  className="req-icon-btn"
                  data-testid="row-detail-btn"
                  title={t('projects:rowDetail.open')}
                  onClick={(e) => { e.stopPropagation(); setDetailRow(project); }}
                >
                  <Info size={14} />
                </button>
                <button
                  className="req-icon-btn"
                  title={t('common:edit')}
                  onClick={() => handleEditProject(project)}
                >
                  <Edit2 size={14} />
                </button>
                <button
                  className={`req-icon-btn ${confirmingDelete === project.id ? 'req-icon-btn--confirm' : ''}`}
                  title={confirmingDelete === project.id ? t('common:confirm') : t('common:delete')}
                  onClick={() => twoClickDelete(project)}
                >
                  {confirmingDelete === project.id ? t('common:confirm') : <Trash2 size={14} />}
                </button>
              </span>
            </div>
          );
          }

          // ── AR 子行: 平铺后独立渲染单元(原 .requirements-children 容器无自身样式,虚线边框转由 --child 类承担) ──
          const renderChildRow = (child: any) => (
                  <div
                    key={child.id}
                    className={`requirements-row requirements-row--child ${hitIds ? (hitIds.has(child.id) ? 'requirements-row--hit' : 'requirements-row--context') : ''} ${child.id === flashId ? 'requirements-row--flash' : ''}`}
                    onClick={() => { scrollPosRef.current = tableRef.current?.scrollTop ?? scrollPosRef.current; navigate(`/projects/${child.id}`); }}
                  >
                    <span className="req-select" onClick={(e) => e.stopPropagation()}>
                      <ReqCheckbox
                        checked={selectedIds.has(child.id)}
                        onToggle={(next) => toggleIds([child.id], next)}
                        label={t('projects:board.selectRow', { name: child.name })}
                      />
                    </span>
                    <span className="requirements-name requirements-name--child">
                      <CornerDownRight size={13} className="req-child-arrow" />
                      <span className="requirements-name-text" title={child.name}>{child.name}</span>
                      <TagsCell project={child} allTags={tags} onSaved={() => handleCellSaved(child.id)} onFilterByTag={toggleTagFilter} activeTagId={filters.tag_id} />
                    </span>

                    {colVisible('number') && <NumberPart project={child} onSaved={() => handleCellSaved(child.id)} />}

                    {colVisible('component') && <ComponentCell project={child} options={componentOptions} onSaved={() => handleCellSaved(child.id)} />}

                    <span className="req-cell-center" onClick={(e) => e.stopPropagation()}>
                      <LifecycleCellControls project={child} />
                    </span>

                    {colVisible('kloc') && <KlocCell project={child} kloc={child.estimation_summary?.kloc ?? null} onSaved={() => handleCellSaved(child.id)} />}
                    {colVisible('effort') && <EffortCell project={child} pm={child.estimation_summary?.pm ?? null} overridden={child.estimation_summary?.pm_overridden} onSaved={() => handleCellSaved(child.id)} />}
                    {colVisible('se') && <RoleCell roleName="se" person={child.se_assignment} pm={child.design_estimates?.se ?? null} project={child} onSaved={() => handleCellSaved(child.id)} />}
                    {colVisible('mde') && <RoleCell roleName="mde" person={child.mde_assignment} pm={child.design_estimates?.mde ?? null} project={child} onSaved={() => handleCellSaved(child.id)} />}

                    {colVisible('version') && <VersionPart project={child} field="product_version"
                      placeholder={t('projects:version.productPlaceholder')}
                      hint={t('projects:version.productTitle')}
                      onSaved={() => handleCellSaved(child.id)} />}
                    {colVisible('release') && <ReleaseCell project={child} onSaved={() => handleCellSaved(child.id)} />}
                    {colVisible('iter') && <IterationCell project={child} onSaved={() => handleCellSaved(child.id)} />}

                    {colVisible('priority') && <PriorityCell project={child} onSaved={() => handleCellSaved(child.id)} />}
                    {colVisible('primary') && <PrimaryDevCell primary={child.primary_dev} project={child} onSaved={() => handleCellSaved(child.id)} />}

                    <span className="requirements-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="req-icon-btn"
                        data-testid="row-detail-btn"
                        title={t('projects:rowDetail.open')}
                        onClick={(e) => { e.stopPropagation(); setDetailRow(child); }}
                      >
                        <Info size={14} />
                      </button>
                      <button
                        className="req-icon-btn"
                        title={t('common:edit')}
                        onClick={() => handleEditProject(child)}
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        className={`req-icon-btn ${confirmingDelete === child.id ? 'req-icon-btn--confirm' : ''}`}
                        title={confirmingDelete === child.id ? t('common:confirm') : t('common:delete')}
                        onClick={() => twoClickDelete(child)}
                      >
                        {confirmingDelete === child.id ? t('common:confirm') : <Trash2 size={14} />}
                      </button>
                    </span>
                  </div>
          );

          return renderChildRow(project);
          };

          return (
            <div
              style={{ height: rowVirtualizer.getTotalSize(), position: 'relative', minWidth: 'var(--req-total, 0)' }}
              data-testid="requirements-virtual-body"
            >
              {rowVirtualizer.getVirtualItems().map((vi) => (
                <div
                  key={flatRows[vi.index].project.id}
                  data-index={vi.index}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: flatRows[vi.index].kind === 'child' ? 40 : 43, transform: `translateY(${vi.start}px)` }}
                >
                  {renderFlatRow(flatRows[vi.index])}
                </div>
              ))}
            </div>
          );
        })()}

        {trees.length === 0 && (
          <div className="requirements-empty">
            {anyFilterActive
              ? t('projects:board.emptyFiltered')
              : t('projects:board.empty')}
            {anyFilterActive && (
              <button
                type="button"
                className="board-ghost-btn requirements-empty-clear"
                onClick={() => { setSearchInput('');
                  setFilters({
                  search: '', lifecycle_state: '', tag_id: '', component: '', subtype: '',
                  product_version: '', release_version: ''
                }); setTaskView(''); setWarningFilter(''); }}
              >
                {t('projects:board.clearFilters')}
              </button>
            )}
          </div>
        )}
      </div>

      <ProjectModal
        isOpen={addProjectModal.isOpen}
        onClose={addProjectModal.close}
        onSuccess={invalidate}
      />

      <ProjectModal
        isOpen={editProjectModal.isOpen}
        onClose={() => {
          setEditingProject(null);
          editProjectModal.close();
        }}
        editingProject={editingProject ?? undefined}
        onSuccess={invalidate}
      />

      <ProjectModal
        isOpen={!!decomposeParent}
        onClose={() => setDecomposeParent(null)}
        onSuccess={() => { setDecomposeParent(null); invalidate(); }}
        presetParentId={decomposeParent?.id}
        presetParentName={decomposeParent?.name}
      />

      <TagManagerDialog isOpen={tagManagerOpen} onClose={() => setTagManagerOpen(false)} />

      {/* U16 行详情侧栏: 承接预设/窄视口隐藏字段(只读,Esc 关闭) */}
      {detailRow && (
        <RowDetailDrawer
          row={detailRow}
          childRows={demandRows.filter((p: any) => p.parent_id === detailRow.id)}
          focusSection={detailFocus}
          onClose={closeDetail}
          onFilterWarning={(code) => { setWarningFilter(code); closeDetail(); }}
        />
      )}

      {selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          pending={batchPending}
          onClear={() => setSelectedIds(new Set())}
          onBatchUpdate={(patch) => batchUpdateMutation.mutate({ ids: selectedList, patch })}
          onBatchDelete={() => batchDeleteMutation.mutate(selectedList)}
          allTags={tags}
          tagsOnSelection={tagsOnSelection}
          visibleCount={visibleSelectedCount}
          selectionRows={selectionRowsRaw}
          visibleIds={visibleRowIdSet}
          onClearHidden={() => setSelectedIds((prev) => new Set([...prev].filter((id) => visibleRowIdSet.has(id))))}
          onLocate={locateSelected}
        />
      )}

      {/* toast 堆叠容器(2026-10-11 审视#4): 成功/失败同位叠加改为纵向堆叠,
          几何(定位/居中/让位)收敛到容器一处 */}
      <BoardNotifications success={okToast} />
      {mutationFailure && (
        <div className="req-toast-stack">
          <div
            className="req-error-toast"
            role="alert"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <span>{mutationFailure.message}</span>
            {mutationFailure.canRetry && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={mutationFailure.retry}
              >
                {t('common:retry')}
              </button>
            )}
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={dismissMutationFailure}
              aria-label={t('common:close')}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
