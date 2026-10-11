import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { IS_DEV } from '../lib/devEnv';

/**
 * 锚定气泡的共用骨架: 视口内定位 + 外点/Esc 关闭。
 * 需求台所有就地编辑控件(人力/优先级/负责人/标签)共用同一套交互词汇,
 * 交互原则见 UI 约定: 零弹窗、单轴驱动、气泡锚定不遮行。
 */
export function useCellPopover(
  popoverClass: string,
  width = 280,
  height = 320,
  opts: { dock?: 'below' | 'above' } = {}
): {
  open: boolean;
  setOpen: (v: boolean) => void;
  anchorRef: RefObject<HTMLSpanElement | null>;
  style: CSSProperties;
  toggle: () => void;
} {
  const [open, setOpen] = useState(false);
  // dock:'above'(2026-10-11 批量条气泡): 底边贴锚上翻——用 bottom 锚定而非
  // top=预估高反推,内容实际高度变化时贴合关系不漂移(优先级气泡曾因
  // top 钳位公式悬空 228px+被批量条盖住底缘)。
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; maxHeight?: number }>({ top: -9999, left: -9999 });
  const anchorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if ((target as HTMLElement).closest?.(`.${popoverClass}`)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, popoverClass]);

  // 产物时刻自检(2026-10-11 气泡事故沉淀;DEV 常驻,release 构建剔除——同
  // CapaDebug 模式): 贴锚间距/层顶归属/视口越界,违例即红框+console 自曝。
  // 这批缺陷曾以"走查看一眼"漏过交付(P5 被批量条截断/应用钮被盖),守卫只
  // 覆盖已交付路径;自检让任何未来基于本钩子的气泡在开发时自行报错。
  useEffect(() => {
    if (!open || !IS_DEV) return;
    let cancelled = false;
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => {
      if (cancelled) return;
      const pop = document.querySelector(`.${popoverClass}`) as HTMLElement | null;
      const anchor = anchorRef.current;
      if (!pop || !anchor) return;
      const pr = pop.getBoundingClientRect();
      const ar = anchor.getBoundingClientRect();
      const problems: string[] = [];
      const gap = Math.round(opts.dock === 'above' ? ar.top - pr.bottom : pr.top - ar.bottom);
      if (gap < 3 || gap > 10) problems.push(`贴锚间距 ${gap}px(期望≈6)`);
      const cx = pr.left + pr.width / 2;
      const cy = Math.max(2, Math.min(window.innerHeight - 2, pr.top + pr.height / 2));
      const topEl = document.elementFromPoint(cx, cy) as HTMLElement | null;
      if (topEl && !pop.contains(topEl)) {
        problems.push(`中心点被遮挡(层顶=${topEl.className?.toString().split(' ')[0] || topEl.tagName},z 低于它)`);
      }
      if (pr.bottom > window.innerHeight + 1 || pr.top < -1 || pr.left < -1 || pr.right > window.innerWidth + 1) {
        problems.push(`视口越界(b=${Math.round(pr.bottom)}/${window.innerHeight})`);
      }
      if (problems.length > 0) {
        pop.classList.add('lc-popover--selfcheck-fail');
        console.error(`[useCellPopover] .${popoverClass} 自检失败: ${problems.join('; ')}`);
      }
    }));
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }, [open, popoverClass]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const r = anchorRef.current?.getBoundingClientRect();
    if (r) {
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 12));
      // 视口高度感知的 maxHeight(2026-10-11 批次二④裁决): top 钳位按估算
      // height 参数算, 实际内容更高时弹层越出视口底(SE 人员弹层实测越出
      // 至 195px)——按实际可用空间给 inline maxHeight, 内部滚动兜底
      if (opts.dock === 'above') {
        setPos({ bottom: window.innerHeight - r.top + 6, left, maxHeight: Math.max(120, r.top - 12) });
      } else {
        const top = Math.min(r.bottom + 6, Math.max(8, window.innerHeight - height));
        setPos({ top, left, maxHeight: Math.max(120, window.innerHeight - top - 8) });
      }
    }
    setOpen(true);
  };

  return { open, setOpen, anchorRef, style: { top: pos.top, bottom: pos.bottom, left: pos.left, maxHeight: pos.maxHeight }, toggle };
}
