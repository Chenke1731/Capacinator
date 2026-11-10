import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { QuickCaptureDialog } from '../components/intake/QuickCaptureDialog';

/**
 * IntakeCaptureContext —— 全局快速捕捉入口（I01，2026-11-10 设计稿 §5.1）。
 *
 * 顶栏按钮 / 需求台工具栏 / Alt+N 共用同一 Dialog；Dialog 本体由 Provider
 * 挂载一次（App 内、Layout 外层），任何页面经 useIntakeCapture().openCapture()
 * 唤起。快捷键用 event.code 防 mac Alt 组合 key 值异常。
 */
interface IntakeCaptureContextValue {
  openCapture: () => void;
}

const IntakeCaptureContext = createContext<IntakeCaptureContextValue>({
  openCapture: () => undefined,
});

export function useIntakeCapture(): IntakeCaptureContextValue {
  return useContext(IntakeCaptureContext);
}

export const IntakeCaptureProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState(false);

  const openCapture = useCallback(() => setOpen(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyN' && !e.defaultPrevented) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <IntakeCaptureContext.Provider value={{ openCapture }}>
      {children}
      <QuickCaptureDialog open={open} onClose={() => setOpen(false)} />
    </IntakeCaptureContext.Provider>
  );
};
