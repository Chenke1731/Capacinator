import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Minus, Edit2, Trash2, Tag, ChevronDown, ChevronRight, Search, X, Pencil, GitBranch, CornerDownRight } from 'lucide-react';
import { api } from '../lib/api-client';
import { queryKeys } from '../lib/queryKeys';
import { useCellPopover } from '../hooks/useCellPopover';
import { PriorityCell, OwnerCell, TagsCell, ComponentCell } from '../components/boards/EditableCells';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import ProjectModal from '../components/modals/ProjectModal';
import { LifecycleCellControls } from '../components/lifecycle/LifecycleCellControls';
import { TagManagerDialog } from '../components/tags/TagManagerDialog';
import { useModal } from '../hooks/useModal';
import { useScenario } from '../contexts/ScenarioContext';
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

/** 版本/交付计划各自内联可编辑(两列); onSaved 回报字段与新值供跳组高亮 */
function VersionPart({ project, field, placeholder, hint, onSaved }: {
  project: any;
  field: 'product_version' | 'release_version';
  placeholder: string;
  /** title 用长文案;placeholder 只管显示(交付列占位改"—"后 title 仍需语义,P9) */
  hint: string;
  onSaved: (field: 'product_version' | 'release_version', value: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const updateMutation = useMutation({
    mutationFn: (patch: Record<string, string | null>) => api.projects.update(project.id, patch),
    onSuccess: (_data, patch) => {
      setEditing(false);
      onSaved(field, (patch[field] as string | null) ?? null);
    }
  });
  const value = (project[field] ?? '') as string;
  if (editing) {
    return (
      <input
        className="inline-edit-input"
        style={{ width: '100%' }}
        value={draft}
        autoFocus
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const trimmed = draft.trim();
          if (trimmed !== value) updateMutation.mutate({ [field]: trimmed || null });
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
    <span className="req-edit-cell req-edit-cell--version" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="projects-version-part projects-version-part--single"
              title={hint}
              onClick={() => { setDraft(value); setEditing(true); }}>
        {value || <span className="text-muted">{placeholder}</span>}
      </button>
      <Pencil size={10} className="req-pencil" aria-hidden />
    </span>
  );
}

/** 人力列: 明文两行(设计/开发 实名+池), 点击弹就地调整气泡。
    池占位是规划杠杆,±0.5 步进直接改;实名分配仍走详情选人。 */
function StaffingCell({ project, onChanged }: { project: any; onChanged: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const pop = useCellPopover('staff-pop', 282, 300);
  const [busy, setBusy] = useState(false);

  const s = project.staffing_summary;
  const fmt = (n: number) => Number(n ?? 0).toFixed(1);

  const { data: roles } = useQuery({
    queryKey: queryKeys.roles.list(),
    queryFn: async () => {
      const response = await api.roles.list();
      const payload = response.data as any;
      return Array.isArray(payload) ? payload : payload?.data || [];
    },
    enabled: pop.open
  });
  const roleList = Array.isArray(roles) ? roles : ((roles as any)?.data ?? []);
  const seRole = roleList.find((r: any) => r.name === 'SE');
  const devRole = roleList.find((r: any) => r.name === '开发');

  /** ±0.5 步进池占位: 无行则建,归零则删 */
  const step = async (side: 'design' | 'dev', delta: number) => {
    setBusy(true);
    try {
      const roleId = side === 'design' ? seRole?.id : devRole?.id;
      if (!roleId) return;
      const pools = ((await api.poolDemands.listByProject(project.id)).data as any)?.data ?? [];
      const mine = pools.find((p: any) => p.status === 'open' && p.role_id === roleId);
      const current = mine ? Number(mine.headcount) : 0;
      const next = Math.round(Math.max(0, Math.min(10, current + delta)) * 10) / 10;
      if (!mine && next > 0) {
        await api.poolDemands.create(project.id, { role_id: roleId, headcount: next });
      } else if (mine && next <= 0) {
        await api.poolDemands.delete(mine.id);
      } else if (mine) {
        await api.poolDemands.update(mine.id, { headcount: next });
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  if (!s) return <span className="text-muted">—</span>;
  const sides: Array<[string, 'design' | 'dev', { named: number; pool: number }]> = [
    [t('projects:staffing.designFull'), 'design', s.design],
    [t('projects:staffing.devFull'), 'dev', s.dev]
  ];

  return (
    <span ref={pop.anchorRef} className="req-staff-wrap" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="req-staff" onClick={pop.toggle}
              title={t('projects:staffing.adjustHint')}>
        {sides.map(([label, side, v]) => (
          <span className="req-staff-row" key={label}
                title={t('projects:staffing.breakdown', { named: fmt(v.named), pool: fmt(v.pool) })}>
            <span className={`staff-dot staff-dot--${side}`} />
            <span className="req-staff-label">{label}</span>
            <span className="req-staff-num">
              <span className="req-staff-named">{fmt(v.named)}</span>
              {v.pool > 0 && <span className="req-staff-pool">+{fmt(v.pool)}</span>}
            </span>
          </span>
        ))}
      </button>
      <Pencil size={10} className="req-pencil" aria-hidden />

      {pop.open && (
        <div className="lc-popover staff-pop" style={pop.style}>
          <div className="lc-popover-title">{t('projects:staffing.adjustTitle')}</div>
          <div className="lc-popover-hint">{t('projects:staffing.adjustHow')}</div>
          {sides.map(([label, side, v]) => (
            <div key={label} className="staff-pop-group">
            <div className="staff-pop-row">
              <span className={`staff-dot staff-dot--${side}`} />
              <span className="staff-pop-side">{label}</span>
              <span className="staff-pop-named">
                {t('projects:staffing.namedLabel', { n: fmt(v.named) })}
              </span>
              <span className="staff-stepper-group">
                <span className="staff-stepper-label">{t('projects:staffing.poolShort')}</span>
                <span className="staff-stepper">
                  <button className="staff-stepper-btn" disabled={busy || v.pool <= 0}
                          onClick={() => step(side, -0.5)} title="-0.5">
                    <Minus size={14} />
                  </button>
                  <span className="staff-stepper-val">{fmt(v.pool)}</span>
                  <button className="staff-stepper-btn" disabled={busy}
                          onClick={() => step(side, 0.5)} title="+0.5">
                    <Plus size={14} />
                  </button>
                </span>
              </span>
            </div>
            {(v.named_detail ?? []).length > 0 && (
              <div className="staff-pop-people">
                {(v.named_detail ?? []).slice(0, 3).map((d: any) => (
                  <span key={d.name} className="staff-pop-person">
                    {d.name}<b>{Math.round(d.fte * 100)}%</b>
                  </span>
                ))}
                {(v.named_detail ?? []).length > 3 && (
                  <span
                    className="staff-pop-person staff-pop-person--more"
                    title={(v.named_detail ?? []).map((d: any) => `${d.name} ${Math.round(d.fte * 100)}%`).join('\n')}
                  >
                    +{(v.named_detail ?? []).length - 3}
                  </span>
                )}
              </div>
            )}
            </div>
          ))}
          <div className="lc-popover-hint">{t('projects:staffing.adjustHintFooter')}</div>
        </div>
      )}
    </span>
  );
}

/** 优先级/负责人/标签三列由 EditableCells 提供(锚定气泡就地编辑) */

/** 规模列: 最新评估换算 KLOC/人月,只读(评估仍在详情页)——计算同权,呈现分流 */
function ScaleCell({ project }: { project: any }) {
  const { t } = useTranslation();
  const e = project.estimation_summary;
  if (!e) {
    return <span className="req-scale req-scale--empty" title={t('projects:scale.tooltip')}>—</span>;
  }
  return (
    <span className="req-scale" title={t('projects:scale.tooltip')}>
      <span className="req-scale-kloc">{e.kloc}K</span>
      <span className="req-scale-pm">{e.pm}{t('projects:scale.pmUnit')}</span>
    </span>
  );
}

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
        className="inline-edit-input req-number-input"
        style={{ width: 96 }}
        value={draft}
        autoFocus
        placeholder={t('projects:number.placeholder')}
        onChange={(e) => setDraft(e.target.value)}
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
        {value || <span className="text-muted">#{project.seq_number}</span>}
      </button>
      <Pencil size={10} className="req-pencil" aria-hidden />
    </span>
  );
}

/** 版本筛选"未排"哨兵: 筛出 product_version/release_version 为空的事项 */
const VERSION_NONE = '__none__';

/** 列宽拖拽: 表头右缘手柄,拖=调宽窄(钳制 min/max),双击=重置该列;localStorage 持久化。
    列宽走 CSS 变量(--req-w-*),thead/row/两断点模板统一引用,一处设置处处生效;
    总量(--req-total)做行 min-width 兜底——拖宽不挤压他列,超出容器横向滚动。 */
const REQ_COLUMNS = [
  /* name 的 min 是"内容地板"(文字≥5字+黄牌chip+子类型),不是随意下限——地板低于
     单元格自身必要内容时,缺口全由名称文字省略号吸收(2026-09-22 名称截断审计)。
     默认预算原则: 默认(未拖拽)布局在 1600/1366 容器内零横向滚动,横滚只能由
     用户主动拖宽触发。 */
  /* def: [全列档(≥1680), 中档(1560–1679,藏规模), 窄档(<1560,藏规模+负责人)] */
  { key: 'name', def: [250, 250, 250], min: 120, max: 640 }, /* Q1-B: 标签迁入名称格,地板吃下腾出预算 */
  /* 编号: SR/AR 外部编号统一列,mono;窄档(<1560)与规模/负责人同藏(2026-09-22 裁决) */
  { key: 'number', def: [84, 80, 0], min: 56, max: 200 },
    { key: 'component', def: [92, 80, 80], min: 72, max: 240 },
  { key: 'lifecycle', def: [216, 224, 196], min: 170, max: 420 },
  { key: 'staffing', def: [116, 112, 108], min: 104, max: 220 },
  { key: 'scale', def: [72, 0, 0], min: 64, max: 200 },
  { key: 'version', def: [68, 64, 62], min: 56, max: 200 },
  { key: 'release', def: [68, 64, 62], min: 56, max: 200 },
  { key: 'priority', def: [44, 44, 44], min: 40, max: 120 },
  { key: 'owner', def: [72, 80, 0], min: 56, max: 200 },
  { key: 'actions', def: [108, 116, 116], min: 64, max: 200 }
] as const;
type ReqColKey = (typeof REQ_COLUMNS)[number]['key'];
/* v2: 列集变更(新增构成/规模列)必须 bump 版本,旧宽度按旧列预算调优,残留会挤压名称列 */
const REQ_WIDTHS_STORE = 'req-col-widths-v4';
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
    design: { named: number; pool: number };
    dev: { named: number; pool: number };
    states: Array<{ state: string | null; count: number }>;
  } | null;
}

function aggregateChildren(children: any[]): ProjectTree['agg'] {
  if (children.length === 0) return null;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  let kloc: number | null = null;
  let pm: number | null = null;
  const design = { named: 0, pool: 0 };
  const dev = { named: 0, pool: 0 };
  const stateCount = new Map<string | null, number>();
  for (const c of children) {
    const e = c.estimation_summary;
    if (e) {
      kloc = round2((kloc ?? 0) + Number(e.kloc || 0));
      pm = round2((pm ?? 0) + Number(e.pm || 0));
    }
    const s = c.staffing_summary;
    if (s) {
      design.named += s.design?.named ?? 0;
      design.pool += s.design?.pool ?? 0;
      dev.named += s.dev?.named ?? 0;
      dev.pool += s.dev?.pool ?? 0;
    }
    const key = c.lifecycle_state ?? null;
    stateCount.set(key, (stateCount.get(key) ?? 0) + 1);
  }
  return {
    count: children.length,
    kloc,
    pm,
    design: { named: round2(design.named), pool: round2(design.pool) },
    dev: { named: round2(dev.named), pool: round2(dev.pool) },
    states: [...stateCount.entries()]
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count)
  };
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

  const [filters, setFilters] = useState({
    search: '',
    lifecycle_state: '',
    tag_id: '',
    component: '',
    subtype: '',
    product_version: '',
    release_version: ''
  });
  const [collapsedSR, setCollapsedSR] = useState<Set<string>>(new Set());
  const [decomposeParent, setDecomposeParent] = useState<any | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  /** 就地保存反馈: 行 flash(版本两列同样走行反馈,平铺后无组头可跳) */
  const [flashId, setFlashId] = useState<string | null>(null);

  const addProjectModal = useModal();
  const editProjectModal = useModal();
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const { data: projects, isLoading, error } = useQuery({
    queryKey: queryKeys.projects.list({ category: 'demand', lifecycle: filters.lifecycle_state }, currentScenario?.id),
    queryFn: async () => {
      const response = await api.projects.list({
        limit: 200,
        ...(filters.lifecycle_state ? { lifecycle_state: filters.lifecycle_state } : {})
      });
      const raw: any[] = response.data.data;
      return raw.map((project) => ({
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
    () => (projects ?? []).filter((p: any) => categoryOfTypeName(p.project_type_name) === 'demand'),
    [projects]
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

  // SR→AR: 筛选作用于行(父或任一子命中 → 整树保留); 平铺排序 优先级→版本→名称
  const trees = useMemo(() => {
    const versionMatch = (value: unknown, filter: string) => {
      const v = String(value ?? '').trim();
      return filter === VERSION_NONE ? v === '' : v === filter;
    };
    const match = (p: any) => {
      if (filters.search) {
        // 名称包含,或引用码精确命中(#序号)——截图指代到检索的闭环
        const q = filters.search.trim().toLowerCase();
        const byCode = /^#(\d+)$/.exec(q);
        const hit = String(p.name).toLowerCase().includes(q)
          || String(p.external_number ?? '').toLowerCase().includes(q)
          || (byCode && Number(byCode[1]) === p.seq_number);
        if (!hit) return false;
      }
      if (filters.tag_id && !(p.tags ?? []).some((tag: any) => String(tag.id) === String(filters.tag_id))) return false;
      if (filters.component && String(p.component ?? '') !== filters.component) return false;
      if (filters.subtype && String(p.project_sub_type_name ?? '') !== filters.subtype) return false;
      if (filters.product_version && !versionMatch(p.product_version, filters.product_version)) return false;
      if (filters.release_version && !versionMatch(p.release_version, filters.release_version)) return false;
      return true;
    };
    const anyFilter = filters.search || filters.tag_id || filters.component || filters.subtype
      || filters.product_version || filters.release_version;
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
  }, [demandRows, filters.search, filters.tag_id, filters.component, filters.subtype, filters.product_version, filters.release_version]);

  /** 空态文案分支用: 是否有任何筛选在活跃(与 trees memo 内部口径一致) */
  const anyFilterActive = Boolean(
    filters.search || filters.tag_id || filters.component || filters.subtype
    || filters.product_version || filters.release_version || filters.lifecycle_state
  );

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
  const colVars = useMemo(() => {
    const vars: Record<string, string> = {};
    const hidden = compact ? ['scale', 'owner', 'number'] : showAll ? [] : ['scale', 'owner'];
    const visible = REQ_COLUMNS.filter((c) => !hidden.includes(c.key));
    let total = 28 /* 行左右 padding */ + 8 * (visible.length - 1) /* 列间 gap */;
    for (const c of visible) {
      const def = showAll ? c.def[0] : compact ? c.def[2] : c.def[1];
      const w = colWidths[c.key] ?? def;
      vars[`--req-w-${c.key}`] = `${w}px`;
      total += w;
    }
    /* 名称列被用户拖过=钉死宽(fr 归零),余量转由尾部不可见占位轨吸收——
       绝不转给真实列,否则承接列被 fr 撑住"拉不动"(2026-09-22 状态列教训) */
    if (colWidths.name !== undefined) {
      vars['--req-f-name'] = '0fr';
      vars['--req-spacer'] = '1fr';
    }
    vars['--req-total'] = `${total}px`;
    return vars as React.CSSProperties;
  }, [colWidths, showAll, compact]);

  const flashRow = (id: string) => {
    setFlashId(id);
    window.setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 900);
  };

  /** 行内保存统一出口: 刷新 + 行 flash */
  const handleCellSaved = (projectId: string) => {
    invalidate();
    flashRow(projectId);
  };

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={(error as any)?.message || t('projects:loadError')} />;

  return (
    <div className="projects-board">
      {/* 单行工具栏(静区): 计数 + 搜索 | 筛选 | 动作 —— 40px 栅格,主色仅"新建"一处 */}
      <div className="projects-toolbar" data-testid="filter-bar">
        <span className="board-count">
          {(() => {
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
            value={filters.search}
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
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
          || filters.product_version || filters.release_version) && (
          <button
            data-testid="reset-filters"
            className="board-reset"
            title={t('projects:board.resetFilters')}
            onClick={() => setFilters({
              search: '', lifecycle_state: '', tag_id: '', component: '', subtype: '',
              product_version: '', release_version: ''
            })}
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

      <div className="requirements-table" data-testid="requirements-table" style={colVars}>
        <div className="requirements-thead">
          {([
            ['projects:board.colName', 'name'],
            ['projects:board.colNumber', 'number'],
            ['projects:board.colComponent', 'component'],
            ['projects:lifecycleColumn', 'lifecycle'],
            ['projects:board.colStaffing', 'staffing'],
            ['projects:board.colScale', 'scale'],
            ['projects:board.colVersion', 'version'],
            ['projects:board.colRelease', 'release'],
            ['projects:board.colPriority', 'priority'],
            ['projects:board.colOwner', 'owner'],
            ['common:actions', 'actions']
          ] as const).map(([key, colKey], i) => (
            <span key={colKey} className={['lifecycle', 'priority', 'actions'].includes(colKey) ? 'col-c' : colKey === 'staffing' ? 'col-r' : ''}>
              {t(key)}
              {i < 10 && (
                <ColumnGrip colKey={colKey} widths={colWidths} setWidths={setColWidths} />
              )}
            </span>
          ))}
        </div>

        {/* 平铺呈现 SR/AR 粒度事项本体(2026-09-22 裁决: 版本维度走筛选,不做分组头) */}
        {trees.map((tree) => {
          const project = tree.project;
          const warned = (project.lifecycle_warnings ?? []).length > 0;
          const isSR = tree.children.length > 0;
          const srCollapsed = collapsedSR.has(project.id);

          if (!isSR) {
          return (
            <div
              key={project.id}
              className={`requirements-row ${warned ? 'requirements-row--warned' : ''} ${project.id === flashId ? 'requirements-row--flash' : ''}`}
              onClick={() => navigate(`/projects/${project.id}`)}
            >
              <span className="requirements-name">
                <span className="requirements-name-text" title={project.name}>{project.name}</span>
                {(project.lifecycle_warnings ?? []).length > 0 && (
                  <span
                    className="lifecycle-warn-chip"
                    title={(project.lifecycle_warnings ?? [])
                      .map((w: string) => t(`projects:lifecycle.warnings.${w}`))
                      .join('\n')}
                  >
                    {t(`projects:lifecycle.warningShort.${(project.lifecycle_warnings ?? [])[0]}`, {
                      defaultValue: t('projects:lifecycle.warningShort.GENERIC')
                    })}
                    {(project.lifecycle_warnings ?? []).length > 1
                      ? `+${(project.lifecycle_warnings ?? []).length - 1}`
                      : ''}
                  </span>
                )}
                <TagsCell project={project} allTags={tags} onSaved={() => handleCellSaved(project.id)} onFilterByTag={toggleTagFilter} activeTagId={filters.tag_id} />
              </span>

              <NumberPart project={project} onSaved={() => handleCellSaved(project.id)} />

              <ComponentCell project={project} options={componentOptions} onSaved={() => handleCellSaved(project.id)} />

              <span className="req-cell-center" onClick={(e) => e.stopPropagation()}>
                <LifecycleCellControls project={project} />
              </span>

              <StaffingCell project={project} onChanged={() => handleCellSaved(project.id)} />

              <ScaleCell project={project} />

              <VersionPart project={project} field="product_version"
                placeholder={t('projects:version.productPlaceholder')}
                hint={t('projects:version.productTitle')}
                onSaved={() => handleCellSaved(project.id)} />
              <VersionPart project={project} field="release_version"
                placeholder={t('projects:version.releasePlaceholder')}
                hint={t('projects:version.releaseTitle')}
                onSaved={() => handleCellSaved(project.id)} />

              <PriorityCell project={project} onSaved={() => handleCellSaved(project.id)} />

              <OwnerCell project={project} onSaved={() => handleCellSaved(project.id)} />

              <span className="requirements-actions" onClick={(e) => e.stopPropagation()}>
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

          // ── SR 折叠头行: 汇总只读(=子行之和,同一数据源);状态列=子行分布 ──
          const agg = tree.agg!;
          const aggStaff = (side: 'design' | 'dev') => (
            <span className="req-staff-row req-staff-row--ro" key={side}>
              <span className={`staff-dot staff-dot--${side}`} />
              <span className="req-staff-label">{t(`projects:staffing.${side === 'design' ? 'designFull' : 'devFull'}`)}</span>
              <span className="req-staff-num">
                <span className="req-staff-named">{agg[side].named.toFixed(1)}</span>
                {agg[side].pool > 0 && <span className="req-staff-pool">+{agg[side].pool.toFixed(1)}</span>}
              </span>
            </span>
          );
          return (
            <Fragment key={project.id}>
            <div
              className={`requirements-row requirements-row--sr ${warned ? 'requirements-row--warned' : ''} ${project.id === flashId ? 'requirements-row--flash' : ''}`}
              onClick={() => navigate(`/projects/${project.id}`)}
            >
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
                <span className="req-sr-chip">{t('projects:board.arCount', { count: agg.count })}</span>
                {(project.lifecycle_warnings ?? []).length > 0 && (
                  <span
                    className="lifecycle-warn-chip"
                    title={(project.lifecycle_warnings ?? [])
                      .map((w: string) => t(`projects:lifecycle.warnings.${w}`))
                      .join('\n')}
                  >
                    {t(`projects:lifecycle.warningShort.${(project.lifecycle_warnings ?? [])[0]}`, {
                      defaultValue: t('projects:lifecycle.warningShort.GENERIC')
                    })}
                    {(project.lifecycle_warnings ?? []).length > 1
                      ? `+${(project.lifecycle_warnings ?? []).length - 1}`
                      : ''}
                  </span>
                )}
                <TagsCell project={project} allTags={tags} onSaved={() => handleCellSaved(project.id)} onFilterByTag={toggleTagFilter} activeTagId={filters.tag_id} />
              </span>

              <NumberPart project={project} onSaved={() => handleCellSaved(project.id)} />

              <ComponentCell project={project} options={componentOptions} onSaved={() => handleCellSaved(project.id)} />

              <span className="req-cell-center req-state-dist">
                {agg.states.map((s: any) => (
                  <span key={s.state ?? 'none'} className="req-state-dist-item">
                    {s.count}·{s.state ? t(`projects:lifecycle.state.${s.state}`) : '—'}
                  </span>
                ))}
              </span>

              <span className="req-staff req-staff--ro">{aggStaff('design')}{aggStaff('dev')}</span>

              <span className="req-scale" title={t('projects:scale.srTooltip')}>
                {agg.kloc != null ? (
                  <>
                    <span className="req-scale-kloc">{agg.kloc}K</span>
                    <span className="req-scale-pm">{agg.pm}{t('projects:scale.pmUnit')}</span>
                  </>
                ) : <span className="text-muted">—</span>}
              </span>

              <VersionPart project={project} field="product_version"
                placeholder={t('projects:version.productPlaceholder')}
                hint={t('projects:version.productTitle')}
                onSaved={() => handleCellSaved(project.id)} />
              <VersionPart project={project} field="release_version"
                placeholder={t('projects:version.releasePlaceholder')}
                hint={t('projects:version.releaseTitle')}
                onSaved={() => handleCellSaved(project.id)} />

              <PriorityCell project={project} onSaved={() => handleCellSaved(project.id)} />
              <OwnerCell project={project} onSaved={() => handleCellSaved(project.id)} />

              <span className="requirements-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  className="req-icon-btn"
                  title={t('projects:board.decompose')}
                  onClick={() => setDecomposeParent(project)}
                >
                  <GitBranch size={14} />
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

            {!srCollapsed && (
              <div className="requirements-children">
                {tree.children.map((child) => (
                  <div
                    key={child.id}
                    className={`requirements-row requirements-row--child ${child.id === flashId ? 'requirements-row--flash' : ''}`}
                    onClick={() => navigate(`/projects/${child.id}`)}
                  >
                    <span className="requirements-name requirements-name--child">
                      <CornerDownRight size={13} className="req-child-arrow" />
                      <span className="requirements-name-text" title={child.name}>{child.name}</span>
                      <TagsCell project={child} allTags={tags} onSaved={() => handleCellSaved(child.id)} onFilterByTag={toggleTagFilter} activeTagId={filters.tag_id} />
                    </span>

                    <NumberPart project={child} onSaved={() => handleCellSaved(child.id)} />

                    <ComponentCell project={child} options={componentOptions} onSaved={() => handleCellSaved(child.id)} />

                    <span className="req-cell-center" onClick={(e) => e.stopPropagation()}>
                      <LifecycleCellControls project={child} />
                    </span>

                    <StaffingCell project={child} onChanged={() => handleCellSaved(child.id)} />
                    <ScaleCell project={child} />

                    <VersionPart project={child} field="product_version"
                      placeholder={t('projects:version.productPlaceholder')}
                      hint={t('projects:version.productTitle')}
                      onSaved={() => handleCellSaved(child.id)} />
                    <VersionPart project={child} field="release_version"
                      placeholder={t('projects:version.releasePlaceholder')}
                      hint={t('projects:version.releaseTitle')}
                      onSaved={() => handleCellSaved(child.id)} />

                    <PriorityCell project={child} onSaved={() => handleCellSaved(child.id)} />
                    <OwnerCell project={child} onSaved={() => handleCellSaved(child.id)} />

                    <span className="requirements-actions" onClick={(e) => e.stopPropagation()}>
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
                ))}
              </div>
            )}
            </Fragment>
          );
        })}

        {trees.length === 0 && (
          <div className="requirements-empty">
            {anyFilterActive
              ? t('projects:board.emptyFiltered')
              : t('projects:board.empty')}
            {anyFilterActive && (
              <button
                type="button"
                className="board-ghost-btn requirements-empty-clear"
                onClick={() => setFilters({
                  search: '', lifecycle_state: '', tag_id: '', component: '', subtype: '',
                  product_version: '', release_version: ''
                })}
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
        editingProject={editingProject}
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
    </div>
  );
}
