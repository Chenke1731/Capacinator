import '@testing-library/jest-dom';
import React from 'react';

// Add TextEncoder/TextDecoder polyfills for Jest
import { TextEncoder, TextDecoder } from 'util';

// Make React available globally
(global as any).React = React;

Object.assign(global, {
  TextEncoder,
  TextDecoder,
});

// Mock @/lib/utils (commonly used by UI components)
jest.mock('@/lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

// Mock common contexts to avoid undefined provider errors
jest.mock('../../../../client/src/contexts/UserContext', () => ({
  useUser: () => ({
    currentUser: { id: 'user-1', name: 'Test User' },
    isLoggedIn: true,
    setCurrentUser: jest.fn(),
    logout: jest.fn(),
  }),
  UserProvider: ({ children }: any) => children,
}));

jest.mock('../../../../client/src/contexts/ThemeContext', () => ({
  ThemeProvider: ({ children }: any) => children,
  useTheme: () => ({ theme: 'light', setTheme: jest.fn() }),
}));

jest.mock('../../../../client/src/contexts/ScenarioContext', () => ({
  ScenarioProvider: ({ children }: any) => children,
  useScenario: () => ({ activeScenarioId: null, setActiveScenarioId: jest.fn() }),
}));

// Mock PortalThemeProvider
jest.mock('../../../../client/src/components/PortalThemeProvider', () => ({
  PortalThemeProvider: ({ children }: any) => children,
}));

// Mock CSS variables for tests
const mockCSSVariables = {
  '--background': 'hsl(0 0% 100%)',
  '--foreground': 'hsl(222.2 84% 4.9%)',
  '--card': 'hsl(0 0% 100%)',
  '--card-foreground': 'hsl(222.2 84% 4.9%)',
  '--popover': 'hsl(0 0% 100%)',
  '--popover-foreground': 'hsl(222.2 84% 4.9%)',
  '--primary': 'hsl(221.2 83.2% 53.3%)',
  '--primary-foreground': 'hsl(210 40% 98%)',
  '--secondary': 'hsl(210 40% 96.1%)',
  '--secondary-foreground': 'hsl(222.2 47.4% 11.2%)',
  '--muted': 'hsl(210 40% 96.1%)',
  '--muted-foreground': 'hsl(215.4 16.3% 46.9%)',
  '--accent': 'hsl(210 40% 96.1%)',
  '--accent-foreground': 'hsl(222.2 47.4% 11.2%)',
  '--destructive': 'hsl(0 84.2% 60.2%)',
  '--destructive-foreground': 'hsl(210 40% 98%)',
  '--border': 'hsl(214.3 31.8% 91.4%)',
  '--input': 'hsl(214.3 31.8% 91.4%)',
  '--ring': 'hsl(221.2 83.2% 53.3%)',
  '--success': 'hsl(142 71% 45%)',
  '--success-foreground': 'hsl(0 0% 100%)',
  '--success-background': 'hsl(142 71% 45% / 0.1)',
  '--warning': 'hsl(38 92% 50%)',
  '--warning-foreground': 'hsl(0 0% 100%)',
  '--warning-background': 'hsl(38 92% 50% / 0.1)',
  '--danger': 'hsl(0 84% 60%)',
  '--danger-foreground': 'hsl(0 0% 100%)',
  '--danger-background': 'hsl(0 84% 60% / 0.1)',
  '--info': 'hsl(199 89% 48%)',
  '--info-foreground': 'hsl(0 0% 100%)',
  '--info-background': 'hsl(199 89% 48% / 0.1)',
  '--radius': '0.5rem',
  '--text-primary': 'hsl(222.2 84% 4.9%)',
  '--text-secondary': 'hsl(215.4 16.3% 46.9%)',
  '--text-tertiary': 'hsl(215 20.2% 65.1%)',
  '--bg-primary': 'hsl(0 0% 100%)',
  '--bg-secondary': 'hsl(210 40% 96.1%)',
  '--bg-hover': 'hsl(210 40% 94%)',
  '--card-bg': 'hsl(0 0% 100%)',
  '--border-color': 'hsl(214.3 31.8% 91.4%)',
  '--border-hover': 'hsl(214.3 31.8% 85%)',
  '--primary-dark': 'hsl(221.2 83.2% 48%)',
  '--shadow-sm': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  '--shadow-md': '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  '--shadow-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
  '--color-purple': 'hsl(271 91% 65%)',
};

// Mock document styles
if (typeof document !== 'undefined') {
  // Create a style element to inject CSS variables
  const style = document.createElement('style');
  style.innerHTML = `:root {
    ${Object.entries(mockCSSVariables)
      .map(([key, value]) => `${key}: ${value};`)
      .join('\n    ')}
  }`;
  document.head.appendChild(style);

  // Mock getComputedStyle to return our CSS variables
  const originalGetComputedStyle = window.getComputedStyle;
  window.getComputedStyle = function(element) {
    const styles = originalGetComputedStyle.call(this, element);
    
    // Create a proxy to intercept getPropertyValue calls
    return new Proxy(styles, {
      get(target, prop) {
        if (prop === 'getPropertyValue') {
          return function(property: string) {
            if (mockCSSVariables[property as keyof typeof mockCSSVariables]) {
              return mockCSSVariables[property as keyof typeof mockCSSVariables];
            }
            return target.getPropertyValue(property);
          };
        }
        return target[prop as keyof CSSStyleDeclaration];
      }
    });
  } as any;
}

// localStorage: 带真实存储语义的实现(i18n 持久化等测试依赖读写回环)。
// 不用 jest.fn 空壳——setItem 不落盘且会被根配置 resetMocks 清掉实现(2026-09-22
// 之前 i18n 两项常红的原因); 也无任何测试把它当 spy 断言,普通函数即可。
const storage = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => (storage.has(key) ? storage.get(key)! : null),
  setItem: (key: string, value: string) => { storage.set(key, String(value)); },
  removeItem: (key: string) => { storage.delete(key); },
  clear: () => { storage.clear(); },
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});