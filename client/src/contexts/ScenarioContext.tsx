import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { queryKeys } from '../lib/queryKeys';
import { Scenario } from '../types';

interface ScenarioContextType {
  currentScenario: Scenario | null;
  scenarios: Scenario[];
  setCurrentScenario: (scenario: Scenario | null) => void;
  isLoading: boolean;
  error: any;
  /** 提交中锁定场景切换（工作台 v2 §12）；reason 供 UI 提示 */
  scenarioLock: string | null;
  lockScenarioSwitching: (reason: string) => void;
  unlockScenarioSwitching: () => void;
}

const ScenarioContext = createContext<ScenarioContextType | undefined>(undefined);

interface ScenarioProviderProps {
  children: ReactNode;
}

export function ScenarioProvider({ children }: ScenarioProviderProps) {
  const [currentScenario, setCurrentScenario] = useState<Scenario | null>(null);
  // 工作台 v2 §12：CommitInFlight 期间禁止切换场景——草稿绑定原场景，
  // 在途请求虽带显式场景头，切换仍会让泳道口径与草稿脱节。锁定期间静默
  // 忽略切换（选择器仍可见，原因由页面横幅说明）。
  const [scenarioLock, setScenarioLock] = useState<string | null>(null);

  // Fetch all scenarios
  const { data: scenarios = [], isLoading, error } = useQuery({
    queryKey: queryKeys.scenarios.list(),
    queryFn: async () => {
      const response = await api.scenarios.list();
      // Handle both nested and flat response structures for backward compatibility
      return response.data?.data || response.data || [];
    },
  });

  // Auto-select baseline scenario as default if no scenario is selected
  useEffect(() => {
    if (!currentScenario && scenarios.length > 0) {
      const baseline = scenarios.find(s => s.scenario_type === 'baseline');
      if (baseline) {
        setCurrentScenario(baseline);
      }
    }
  }, [scenarios, currentScenario]);

  // Store current scenario in localStorage for persistence
  useEffect(() => {
    if (currentScenario) {
      // Store the full scenario object for the API client to use
      localStorage.setItem('currentScenario', JSON.stringify(currentScenario));
      // Also store just the ID for backward compatibility
      localStorage.setItem('capacinator-current-scenario', currentScenario.id);
    }
  }, [currentScenario]);

  // Load current scenario from localStorage on mount
  useEffect(() => {
    const savedScenarioId = localStorage.getItem('capacinator-current-scenario');
    if (savedScenarioId && scenarios.length > 0) {
      const savedScenario = scenarios.find(s => s.id === savedScenarioId);
      if (savedScenario) {
        setCurrentScenario(savedScenario);
      }
    }
  }, [scenarios]);

  const value: ScenarioContextType = {
    currentScenario,
    scenarios,
    setCurrentScenario: (scenario: Scenario | null) => {
      if (scenarioLock) return;
      setCurrentScenario(scenario);
    },
    isLoading,
    error,
    scenarioLock,
    lockScenarioSwitching: (reason: string) => setScenarioLock(reason),
    unlockScenarioSwitching: () => setScenarioLock(null),
  };

  return (
    <ScenarioContext.Provider value={value}>
      {children}
    </ScenarioContext.Provider>
  );
}

export function useScenario() {
  const context = useContext(ScenarioContext);
  if (context === undefined) {
    throw new Error('useScenario must be used within a ScenarioProvider');
  }
  return context;
}