import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * ⚡CapaDebug — dev 专属需求台诊断面板(2026-09-23)
 *
 * 仅 dev 构建挂载(App.tsx 以 import.meta.env.DEV + 动态导入引用),
 * release 构建经 dead-code-elimination 整包剔除(dist 可 grep 验证)。
 * 热键 Ctrl+Shift+D 呼出。定位效率教训的沉淀: 列宽审计/元素探针/主题
 * 切换不再靠一次性脚本反复猜选择器。
 *
 * 面板能力:
 *  - 列宽实时审计: 轨道宽 × 内容自然宽(作用域内克隆测量) × 利用率 × 类别
 *  - 档位/视口/横滚/死区一览
 *  - 元素探针模式: 悬停任意元素显示 类名/尺寸/字体/颜色对比度
 *  - 一键: 重置列宽存储 / 切主题 / 控制台导出审计 JSON(window.__capaAudit)
 */

interface ColRow {
  key: string;
  track: number;
  natural: number;
  util: number;
  pinned: boolean;
}

interface Audit {
  vw: number;
  tier: string;
  hScroll: boolean;
  deadZone: number;
  cols: ColRow[];
}

const KEY_OF: Array<[RegExp, string]> = [
  [/requirements-name/, '名称'],
  [/--number/, '编号'],
  [/component/, '组件'],
  [/req-cell-center|lifecycle-cell/, '状态'],
  [/staff/, '人力'],
  [/req-scale/, '规模'],
  [/version|release/, '版本/交付'],
  [/--pri|req-pri/, '优先级'],
  [/owner/, '负责人'],
  [/actions/, '操作'],
];

function keyOf(cls: string): string {
  for (const [re, k] of KEY_OF) if (re.test(cls)) return k;
  return cls.slice(0, 10) || '(?)';
}

function collectAudit(): Audit {
  const board = document.querySelector('.projects-board');
  const table = document.querySelector('.requirements-table');
  if (!board || !table) {
    return { vw: window.innerWidth, tier: '(非需求台页面)', hScroll: false, deadZone: 0, cols: [] };
  }
  const row = document.querySelector(
    '.requirements-row:not(.requirements-row--child):not(.requirements-row--sr)'
  );
  const vw = window.innerWidth;
  const tier = vw >= 1680 ? '全列' : vw >= 1560 ? '中档' : '紧凑';
  const cols: ColRow[] = [];
  if (row) {
    const tracks = getComputedStyle(row).gridTemplateColumns.split(' ').map(parseFloat);
    const cells = [...row.children].filter((c) => (c as HTMLElement).getBoundingClientRect().width > 0);
    tracks.forEach((tw, i) => {
      const cell = cells[i] as HTMLElement | undefined;
      if (!cell) return;
      // 内容自然宽: 克隆进板内(保住 .projects-board 作用域,防全局按钮规则污染)
      let natural = 0;
      const kids = [...cell.children].filter(
        (k) => !String((k as HTMLElement).className).includes('req-pencil')
      );
      for (const k of kids) {
        const c = k.cloneNode(true) as HTMLElement;
        c.style.cssText += ';position:fixed;visibility:hidden;width:auto;max-width:none;min-width:0;left:-9999px;top:0';
        board.appendChild(c);
        natural = Math.max(natural, Math.round(c.getBoundingClientRect().width));
        c.remove();
      }
      if (natural === 0) natural = Math.round(cell.getBoundingClientRect().width);
      const track = Math.round(tw);
      cols.push({
        key: keyOf(String(cell.className)),
        track,
        natural,
        util: track > 0 ? Math.round((natural / track) * 100) : 0,
        pinned: cell.getAttribute('style')?.includes('--req-f-') ?? false,
      });
    });
  }
  const actions = document.querySelector('.requirements-actions')?.getBoundingClientRect();
  const tr = table.getBoundingClientRect();
  return {
    vw,
    tier,
    hScroll: table.scrollWidth > table.clientWidth + 1,
    deadZone: actions ? Math.round(tr.right - 14 - actions.right) : 0,
    cols,
  };
}

function luminance(rgb: string): number {
  const m = rgb.match(/\d+/g);
  if (!m) return 0;
  const [r, g, b] = m.slice(0, 3).map(Number).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function BoardDiagnostics() {
  const [open, setOpen] = useState(false);
  const [audit, setAudit] = useState<Audit | null>(null);
  const [probe, setProbe] = useState(false);
  const [probeInfo, setProbeInfo] = useState<{ x: number; y: number; text: string } | null>(null);
  const rafRef = useRef(0);

  const refresh = useCallback(() => setAudit(collectAudit()), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        setOpen((o) => !o);
        refresh();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => refresh();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open, refresh]);

  useEffect(() => {
    if (!probe) { setProbeInfo(null); return; }
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
        if (!el) return;
        const c = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const fg = luminance(c.color);
        const bg = luminance(c.backgroundColor);
        const ratio = ((Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05)).toFixed(1);
        setProbeInfo({
          x: e.clientX + 14,
          y: e.clientY + 14,
          text: `${(String(el.className) || el.tagName).toString().split(' ')[0].slice(0, 28)} · ${Math.round(r.width)}×${Math.round(r.height)} · ${c.fontSize}/${c.fontWeight} · 对比 ${ratio}:1`
        });
      });
    };
    window.addEventListener('mousemove', onMove);
    return () => { window.removeEventListener('mousemove', onMove); cancelAnimationFrame(rafRef.current); };
  }, [probe]);

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', right: 12, bottom: 12, zIndex: 99999,
      background: 'rgba(17,24,39,0.94)', color: '#f9fafb',
      fontFamily: 'ui-monospace, monospace', fontSize: 11, lineHeight: 1.5,
      borderRadius: 8, padding: 10, minWidth: 330, maxHeight: '70vh', overflow: 'auto',
      border: '1px solid #374151', boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
    }} data-testid="capa-debug-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <b>⚡CapaDebug</b>
        <span style={{ color: '#9ca3af' }}>Ctrl+Shift+D 收起</span>
      </div>
      {audit && (
        <div style={{ color: '#9ca3af', marginBottom: 6 }}>
          {audit.tier} @{audit.vw} · 横滚{audit.hScroll ? '⚠有' : '无'} · 死区{audit.deadZone}px
        </div>
      )}
      <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 8 }}>
        <thead>
          <tr style={{ color: '#9ca3af' }}>
            {['列', '轨道', '内容', '利用率'].map((h) => <th key={h} style={{ textAlign: 'left', padding: '1px 6px' }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {(audit?.cols ?? []).map((c, i) => (
            <tr key={i} style={{ color: c.util < 45 ? '#fbbf24' : '#f9fafb' }}>
              <td style={{ padding: '1px 6px' }}>{c.key}</td>
              <td style={{ padding: '1px 6px' }}>{c.track}</td>
              <td style={{ padding: '1px 6px' }}>{c.natural}</td>
              <td style={{ padding: '1px 6px' }}>{c.util}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" onClick={refresh} style={btn}>刷新审计</button>
        <button type="button" onClick={() => { localStorage.removeItem('req-col-widths-v4'); location.reload(); }} style={btn}>重置列宽</button>
        <button
          type="button"
          onClick={() => {
            const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
            localStorage.setItem('theme', next);
            document.documentElement.dataset.theme = next;
            refresh();
          }}
          style={btn}
        >
          切主题
        </button>
        <button type="button" onClick={() => setProbe((v) => !v)} style={{ ...btn, background: probe ? '#1d4ed8' : undefined, color: probe ? '#fff' : undefined }}>
          {probe ? '探针 ON' : '元素探针'}
        </button>
        <button
          type="button"
          onClick={() => { const a = collectAudit(); (window as any).__capaAudit = a; console.table(a.cols); }}
          style={btn}
        >
          控制台导出
        </button>
      </div>
      {probe && probeInfo && (
        <div style={{
          position: 'fixed', left: probeInfo.x, top: probeInfo.y, zIndex: 100000,
          background: 'rgba(29,78,216,0.95)', color: '#fff', padding: '2px 8px',
          borderRadius: 4, fontFamily: 'ui-monospace, monospace', fontSize: 11, pointerEvents: 'none'
        }}>
          {probeInfo.text}
        </div>
      )}
    </div>
  );
}

const btn: React.CSSProperties = {
  background: '#1f2937', color: '#e5e7eb', border: '1px solid #374151',
  borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer', minHeight: 24
};
