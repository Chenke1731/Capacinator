import React, { useEffect, useRef } from 'react';
import { useTheme } from '../contexts/ThemeContext';

interface PortalThemeProviderProps {
  children: React.ReactNode;
}

/**
 * PortalThemeProvider ensures that portal-rendered content (like modals)
 * inherits the current theme by copying theme-related attributes and classes
 * from the document root.
 */
export function PortalThemeProvider({ children }: PortalThemeProviderProps) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Copy theme-related attributes and classes from document root
    const root = document.documentElement;
    const container = containerRef.current;

    // Copy theme class
    container.className = theme;
    
    // Copy data-theme attribute
    container.setAttribute('data-theme', theme);

    // Copy computed styles for CSS variables
    // 2026-10 任务B: --primary 从 <body> 取值——body 层是 index.css hex 主题块的
    // 事实标准(data-theme 挂在 body 上);从根取会拿到 globals.css 的 HSL 三元组,
    // 灌回弹窗后行内样式碾压一切,弹窗内 var(--primary) 直用变无效色。
    // 其余令牌两层的值一致,保持从根复制。
    const rootStyle = getComputedStyle(root);
    const bodyStyle = getComputedStyle(document.body);
    const cssVariables = [
      '--background', '--foreground', '--card', '--card-foreground',
      '--popover', '--popover-foreground', '--primary', '--primary-foreground',
      '--secondary', '--secondary-foreground', '--muted', '--muted-foreground',
      '--accent', '--accent-foreground', '--destructive', '--destructive-foreground',
      '--border', '--input', '--ring',
      '--success', '--success-foreground', '--success-background',
      '--warning', '--warning-foreground', '--warning-background',
      '--danger', '--danger-foreground', '--danger-background',
      '--info', '--info-foreground', '--info-background',
      '--radius'
    ];

    // Apply all CSS variables to the container
    cssVariables.forEach(variable => {
      const value = variable === '--primary'
        ? bodyStyle.getPropertyValue(variable)
        : rootStyle.getPropertyValue(variable);
      if (value) {
        container.style.setProperty(variable, value);
      }
    });

  }, [theme]);

  return (
    <div ref={containerRef} style={{ display: 'contents' }}>
      {children}
    </div>
  );
}