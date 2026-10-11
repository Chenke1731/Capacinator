import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';

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
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number }>({ top: -9999, left: -9999 });
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

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const r = anchorRef.current?.getBoundingClientRect();
    if (r) {
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 12));
      setPos(opts.dock === 'above'
        ? { bottom: window.innerHeight - r.top + 6, left }
        : { top: Math.min(r.bottom + 6, Math.max(8, window.innerHeight - height)), left });
    }
    setOpen(true);
  };

  return { open, setOpen, anchorRef, style: { top: pos.top, bottom: pos.bottom, left: pos.left }, toggle };
}
