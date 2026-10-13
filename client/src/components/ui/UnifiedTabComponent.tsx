import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useBookmarkableTabs, type TabConfig } from '../../hooks/useBookmarkableTabs';
import './UnifiedTabComponent.css';

export interface UnifiedTabConfig extends TabConfig {
  icon?: React.ComponentType<{ size?: number }>;
  component?: React.ComponentType;
  disabled?: boolean;
}

interface UnifiedTabComponentProps {
  tabs: UnifiedTabConfig[];
  defaultTab?: string; /* 受控模式(activeTab+onTabChange)下可缺省 */
  paramName?: string;
  /* 受控模式(2026-10-13 批清: Settings 页持有 activeTab state):
     传入 activeTab/onTabChange 时覆盖 hook 内部状态 */
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  orientation?: 'horizontal' | 'vertical';
  variant?: 'primary' | 'secondary' | 'minimal';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  ariaLabel?: string;
  renderContent?: boolean;
  children?: React.ReactNode | ((activeTab: string) => React.ReactNode);
}

export const UnifiedTabComponent: React.FC<UnifiedTabComponentProps> = ({
  tabs,
  defaultTab,
  paramName = 'tab',
  activeTab: controlledTab,
  onTabChange,
  orientation = 'horizontal',
  variant = 'primary',
  size = 'md',
  className = '',
  ariaLabel,
  renderContent = true,
  children
}) => {
  const tabListRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [focusedTabId, setFocusedTabId] = useState<string | null>(null);

  // Use the existing bookmarkable tabs hook
  const { activeTab: internalTab, setActiveTab: setInternalTab, isActiveTab } = useBookmarkableTabs({
    tabs,
    defaultTab: defaultTab ?? tabs[0]?.id ?? '',
    paramName
  });
  const activeTab = controlledTab ?? internalTab;
  const setActiveTab = (tabId: string) => {
    if (onTabChange) onTabChange(tabId);
    else setInternalTab(tabId);
  };

  // Initialize focused tab to active tab
  useEffect(() => {
    if (!focusedTabId && activeTab) {
      setFocusedTabId(activeTab);
    }
  }, [activeTab, focusedTabId]);

  // Keyboard navigation handler
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    const enabledTabs = tabs.filter(tab => !tab.disabled);
    const currentIndex = enabledTabs.findIndex(tab => tab.id === focusedTabId);
    
    if (currentIndex === -1) return;

    let newIndex = currentIndex;
    let preventDefault = true;

    switch (event.key) {
      case 'ArrowLeft':
        if (orientation === 'horizontal') {
          newIndex = currentIndex > 0 ? currentIndex - 1 : enabledTabs.length - 1;
        } else {
          preventDefault = false;
        }
        break;
      case 'ArrowRight':
        if (orientation === 'horizontal') {
          newIndex = currentIndex < enabledTabs.length - 1 ? currentIndex + 1 : 0;
        } else {
          preventDefault = false;
        }
        break;
      case 'ArrowUp':
        if (orientation === 'vertical') {
          newIndex = currentIndex > 0 ? currentIndex - 1 : enabledTabs.length - 1;
        } else {
          preventDefault = false;
        }
        break;
      case 'ArrowDown':
        if (orientation === 'vertical') {
          newIndex = currentIndex < enabledTabs.length - 1 ? currentIndex + 1 : 0;
        } else {
          preventDefault = false;
        }
        break;
      case 'Home':
        newIndex = 0;
        break;
      case 'End':
        newIndex = enabledTabs.length - 1;
        break;
      case 'Enter':
      case ' ':
        // Activate the focused tab
        if (focusedTabId && focusedTabId !== activeTab) {
          setActiveTab(focusedTabId);
        }
        break;
      default:
        preventDefault = false;
    }

    if (preventDefault) {
      event.preventDefault();
      
      if (newIndex !== currentIndex) {
        const newTabId = enabledTabs[newIndex].id;
        setFocusedTabId(newTabId);
        
        // Focus the new tab
        const tabElement = tabRefs.current[newTabId];
        if (tabElement) {
          tabElement.focus();
        }
      }
    }
  }, [focusedTabId, orientation, tabs, activeTab, setActiveTab]);

  // Handle tab click
  const handleTabClick = useCallback((tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
    if (tab && !tab.disabled) {
      setActiveTab(tabId);
      setFocusedTabId(tabId);
    }
  }, [tabs, setActiveTab]);

  // Handle tab focus
  const handleTabFocus = useCallback((tabId: string) => {
    setFocusedTabId(tabId);
  }, []);

  // Get the active component to render
  const ActiveComponent = renderContent ? tabs.find(tab => tab.id === activeTab)?.component : null;

  // Generate unique IDs for ARIA relationships
  const getTabId = (tabId: string) => `tab-${paramName}-${tabId}`;
  const getPanelId = (tabId: string) => `tabpanel-${paramName}-${tabId}`;

  return (
    <div className={`unified-tab-container ${className}`}>
      {/* Tab Navigation */}
      <div 
        ref={tabListRef}
        className={`unified-tab-list unified-tab-list--${orientation} unified-tab-list--${variant} unified-tab-list--${size}`}
        role="tablist"
        aria-label={ariaLabel || "Navigation tabs"}
        aria-orientation={orientation}
        onKeyDown={handleKeyDown}
      >
        {tabs.map((tab, _index) => {
          const Icon = tab.icon;
          const isActive = isActiveTab(tab.id);
          const isFocused = focusedTabId === tab.id;
          const isDisabled = tab.disabled;
          
          return (
            <button
              key={tab.id}
              ref={(el) => { tabRefs.current[tab.id] = el; }}
              id={getTabId(tab.id)}
              className={`unified-tab ${isActive ? 'unified-tab--active' : ''} ${isFocused ? 'unified-tab--focused' : ''} ${isDisabled ? 'unified-tab--disabled' : ''}`}
              role="tab"
              aria-selected={isActive}
              aria-controls={getPanelId(tab.id)}
              aria-disabled={isDisabled}
              tabIndex={isActive && !isDisabled ? 0 : -1}
              disabled={isDisabled}
              onClick={() => handleTabClick(tab.id)}
              onFocus={() => handleTabFocus(tab.id)}
            >
              {Icon && <Icon size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} />}
              <span className="unified-tab__label">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {renderContent && (
        <div 
          className="unified-tab-content"
          role="tabpanel"
          id={getPanelId(activeTab)}
          aria-labelledby={getTabId(activeTab)}
          tabIndex={0}
        >
          {ActiveComponent ? <ActiveComponent /> : (typeof children === 'function' ? children(activeTab) : children)}
        </div>
      )}
    </div>
  );
};

export default UnifiedTabComponent;