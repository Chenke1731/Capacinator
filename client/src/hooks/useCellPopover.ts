import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';

/**
 * 锚定气泡的共用骨架: 视口内定位 + 外点/Esc 关闭。
 * 需求台所有就地编辑控件(人力/优先级/负责人/标签)共用同一套交互词汇,
 * 交互原则见 UI 约定: 零弹窗、单轴驱动、气泡锚定不遮行。
 */
export function useCellPopover(
  popoverClass: string,
  width = 280,
  height = 320
): {
  open: boolean;
  setOpen: (v: boolean) => void;
  anchorRef: RefObject<HTMLSpanElement | null>;
  style: CSSProperties;
  toggle: () => void;
} {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: -9999, left: -9999 });
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
      setPos({
        top: Math.min(r.bottom + 6, Math.max(8, window.innerHeight - height)),
        left: Math.max(8, Math.min(r.left, window.innerWidth - width - 12))
      });
    }
    setOpen(true);
  };

  return { open, setOpen, anchorRef, style: { top: pos.top, left: pos.left }, toggle };
}
