import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

/**
 * 弹窗 Portal(2026-09-29): 需求台虚拟化后,行容器带 transform(translateY)
 * 定位虚拟行——CSS 规范下 transform 祖先成为 fixed 后代的包含块,
 * useCellPopover 的视口坐标从此相对虚拟行容器,弹窗漂移无法编辑。
 * Portal 到 body 后弹窗脱离 transform 祖先,fixed 恢复相对视口。
 */
export function PopoverPortal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}
