import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import { Scenario } from '../../types';

// IMPORTANT: Unmock ScenarioContext so we test the real implementation
// The global test setup mocks it, but we need the real version here
jest.unmock('../ScenarioContext');

// Now import the real ScenarioContext
import { ScenarioProvider, useScenario } from '../ScenarioContext';

// Mock the API client
jest.mock('../../lib/api-client', () => ({
  api: {
    scenarios: {
      list: jest.fn()
    }
  }
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    })
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

describe('ScenarioContext', () => {
  let queryClient: QueryClient;

  const mockBaselineScenario: Scenario = {
    id: 'baseline-1',
    name: 'Baseline Scenario',
    scenario_type: 'baseline',
    description: 'The baseline scenario',
    created_at: '2025-01-01',
    updated_at: '2025-01-01',
    parent_scenario_id: null as unknown as string | undefined,
    created_by: 'test',
    status: 'active' as never
  };

  const mockAlternativeScenario: Scenario = {
    id: 'alt-1',
    name: 'Alternative Scenario',
    scenario_type: 'branch',
    description: 'An alternative scenario',
    created_at: '2025-01-02',
    updated_at: '2025-01-02',
    parent_scenario_id: 'baseline-1',
    created_by: 'test',
    status: 'active' as never
  };

  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();

    // Create a fresh QueryClient for each test
    // Note: Don't set cacheTime/staleTime to 0 as it can prevent queries from executing
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          refetchOnWindowFocus: false,
          // Remove cacheTime and staleTime settings that might prevent query execution
        },
        mutations: { retry: false }
      }
    });

    // Set up a default mock to prevent errors in tests that don't override it
    (api.scenarios.list as jest.Mock).mockImplementation(() =>
      Promise.resolve({
        data: {
          data: []
        }
      })
    );
  });

  // Helper component to test the hook
  function TestComponent() {
    const { currentScenario, scenarios, isLoading, error } = useScenario();

    if (isLoading) return <div>Loading...</div>;
    if (error) return <div>Error: {error.message}</div>;

    return (
      <div>
        <div data-testid="current-scenario">
          {currentScenario ? currentScenario.name : 'No scenario selected'}
        </div>
        <div data-testid="scenario-count">{scenarios?.length || 0}</div>
        <div data-testid="scenarios-list">
          {scenarios?.map(s => (
            <div key={s.id} data-testid={`scenario-${s.id}`}>
              {s.name}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function TestSetScenarioComponent() {
    const { setCurrentScenario, scenarios } = useScenario();

    return (
      <div>
        <button
          onClick={() => scenarios?.[1] && setCurrentScenario(scenarios[1])}
          data-testid="switch-scenario-btn"
        >
          Switch to Alternative
        </button>
        <button
          onClick={() => setCurrentScenario(null)}
          data-testid="clear-scenario-btn"
        >
          Clear Scenario
        </button>
      </div>
    );
  }

  const renderWithProvider = (component: React.ReactElement) => {
    // Use the shared queryClient from beforeEach
    return render(
      <QueryClientProvider client={queryClient}>
        <ScenarioProvider>
          {component}
        </ScenarioProvider>
      </QueryClientProvider>
    );
  };

  describe('Provider Initialization', () => {
    it('verifies mock is callable', async () => {
      // Direct test to verify the mock works
      (api.scenarios.list as jest.Mock).mockReset().mockResolvedValue({
        data: {
          data: [mockBaselineScenario]
        }
      });

      const result = await api.scenarios.list();
      expect(result.data.data).toHaveLength(1);
      expect(api.scenarios.list).toHaveBeenCalledTimes(1);
    });

    it('renders children', async () => {
      (api.scenarios.list as jest.Mock).mockReset().mockImplementation(() =>
        Promise.resolve({
          data: {
            data: [mockBaselineScenario]
          }
        })
      );

      renderWithProvider(<div data-testid="child">Test Child</div>);

      expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('fetches scenarios on mount', async () => {
      // Reset and set up fresh mock for this test
      (api.scenarios.list as jest.Mock).mockReset().mockImplementation(() =>
        Promise.resolve({
          data: {
            data: [mockBaselineScenario, mockAlternativeScenario]
          }
        })
      );

      renderWithProvider(<TestComponent />);

      // Wait for the query to complete and scenarios to load
      await waitFor(() => {
        expect(screen.getByTestId('scenario-count')).toHaveTextContent('2');
      });

      expect(api.scenarios.list).toHaveBeenCalledTimes(1);
    });

    it('shows loading state while fetching', async () => {
      (api.scenarios.list as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ data: { data: [] } }), 100))
      );

      renderWithProvider(<TestComponent />);

      expect(screen.getByText('Loading...')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      });
    });
  });

  describe('Scenario Loading and Selection', () => {
    it('loads scenarios from API', async () => {
      (api.scenarios.list as jest.Mock).mockReset().mockImplementation(() =>
        Promise.resolve({
          data: {
            data: [mockBaselineScenario, mockAlternativeScenario]
          }
        })
      );

      renderWithProvider(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByTestId('scenario-count')).toHaveTextContent('2');
      });

      expect(screen.getByTestId('scenario-baseline-1')).toHaveTextContent('Baseline Scenario');
      expect(screen.getByTestId('scenario-alt-1')).toHaveTextContent('Alternative Scenario');
    });

    it('auto-selects baseline scenario as default', async () => {
      (api.scenarios.list as jest.Mock).mockReset().mockImplementation(() =>
        Promise.resolve({
          data: {
            data: [mockBaselineScenario, mockAlternativeScenario]
          }
        })
      );

      renderWithProvider(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByTestId('current-scenario')).toHaveTextContent('Baseline Scenario');
      });
    });

    it('handles empty scenarios list', async () => {
      // Use default empty mock from beforeEach
      renderWithProvider(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByTestId('scenario-count')).toHaveTextContent('0');
      });

      expect(screen.getByTestId('current-scenario')).toHaveTextContent('No scenario selected');
    });

    it('handles API error gracefully', async () => {
      const errorMessage = 'Failed to fetch scenarios';
      (api.scenarios.list as jest.Mock).mockReset().mockImplementation(() =>
        Promise.reject(new Error(errorMessage))
      );

      renderWithProvider(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByText(`Error: ${errorMessage}`)).toBeInTheDocument();
      });
    });

    it('only auto-selects baseline when no scenario is currently selected', async () => {
      (api.scenarios.list as jest.Mock).mockReset().mockImplementation(() =>
        Promise.resolve({
          data: {
            data: [mockBaselineScenario, mockAlternativeScenario]
          }
        })
      );

      renderWithProvider(
        <>
          <TestComponent />
          <TestSetScenarioComponent />
        </>
      );

      // Wait for baseline to be auto-selected
      await waitFor(() => {
        expect(screen.getByTestId('current-scenario')).toHaveTextContent('Baseline Scenario');
      });

      // Switch to alternative scenario
      const switchBtn = screen.getByTestId('switch-scenario-btn');
      act(() => {
        switchBtn.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('current-scenario')).toHaveTextContent('Alternative Scenario');
      });

      // Current scenario should remain as alternative (not revert to baseline)
      expect(screen.getByTestId('current-scenario')).toHaveTextContent('Alternative Scenario');
    });
  });

  describe('Scenario Switching', () => {
    it('allows switching scenarios', async () => {
      (api.scenarios.list as jest.Mock).mockImplementation(() =>
        Promise.resolve({
          data: {
            data: [mockBaselineScenario, mockAlternativeScenario]
          }
        })
      );

      renderWithProvider(
        <>
          <TestComponent />
          <TestSetScenarioComponent />
        </>
      );

      await waitFor(() => {
        expect(screen.getByTestId('current-scenario')).toHaveTextContent('Baseline Scenario');
      });

      const switchBtn = screen.getByTestId('switch-scenario-btn');
      act(() => {
        switchBtn.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('current-scenario')).toHaveTextContent('Alternative Scenario');
      });
    });

    it('prevents clearing when baseline exists (auto-selects baseline)', async () => {
      (api.scenarios.list as jest.Mock).mockReset().mockImplementation(() =>
        Promise.resolve({
          data: {
            data: [mockBaselineScenario]
          }
        })
      );

      renderWithProvider(
        <>
          <TestComponent />
          <TestSetScenarioComponent />
        </>
      );

      await waitFor(() => {
        expect(screen.getByTestId('current-scenario')).toHaveTextContent('Baseline Scenario');
      });

      const clearBtn = screen.getByTestId('clear-scenario-btn');
      act(() => {
        clearBtn.click();
      });

      // After clearing, the auto-select effect immediately re-selects the baseline
      // This is by design - we always want a scenario selected if one is available
      await waitFor(() => {
        expect(screen.getByTestId('current-scenario')).toHaveTextContent('Baseline Scenario');
      });
    });
  });

  describe('LocalStorage Persistence', () => {
    it('stores current scenario in localStorage when selected', async () => {
      (api.scenarios.list as jest.Mock).mockImplementation(() =>
        Promise.resolve({
          data: {
            data: [mockBaselineScenario]
          }
        })
      );

      renderWithProvider(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByTestId('current-scenario')).toHaveTextContent('Baseline Scenario');
      });

      await waitFor(() => {
        expect(localStorageMock.setItem).toHaveBeenCalledWith(
          'currentScenario',
          JSON.stringify(mockBaselineScenario)
        );
        expect(localStorageMock.setItem).toHaveBeenCalledWith(
          'capacinator-current-scenario',
          'baseline-1'
        );
      });
    });

    it('loads scenario from localStorage on mount', async () => {
      // Pre-populate localStorage
      localStorageMock.getItem.mockImplementation((key: string) => {
        if (key === 'capacinator-current-scenario') return 'alt-1';
        return null;
      });

      (api.scenarios.list as jest.Mock).mockImplementation(() =>
        Promise.resolve({
          data: {
            data: [mockBaselineScenario, mockAlternativeScenario]
          }
        })
      );

      renderWithProvider(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByTestId('current-scenario')).toHaveTextContent('Alternative Scenario');
      });
    });

    it('falls back to baseline if saved scenario not found', async () => {
      localStorageMock.getItem.mockImplementation((key: string) => {
        if (key === 'capacinator-current-scenario') return 'nonexistent-id';
        return null;
      });

      (api.scenarios.list as jest.Mock).mockImplementation(() =>
        Promise.resolve({
          data: {
            data: [mockBaselineScenario]
          }
        })
      );

      renderWithProvider(<TestComponent />);

      // Since saved scenario doesn't exist, should select baseline
      await waitFor(() => {
        expect(screen.getByTestId('current-scenario')).toHaveTextContent('Baseline Scenario');
      });
    });

    it('stores updated scenario when switching', async () => {
      (api.scenarios.list as jest.Mock).mockImplementation(() =>
        Promise.resolve({
          data: {
            data: [mockBaselineScenario, mockAlternativeScenario]
          }
        })
      );

      renderWithProvider(
        <>
          <TestComponent />
          <TestSetScenarioComponent />
        </>
      );

      await waitFor(() => {
        expect(screen.getByTestId('current-scenario')).toHaveTextContent('Baseline Scenario');
      });

      const switchBtn = screen.getByTestId('switch-scenario-btn');
      act(() => {
        switchBtn.click();
      });

      await waitFor(() => {
        expect(localStorageMock.setItem).toHaveBeenCalledWith(
          'currentScenario',
          JSON.stringify(mockAlternativeScenario)
        );
        expect(localStorageMock.setItem).toHaveBeenCalledWith(
          'capacinator-current-scenario',
          'alt-1'
        );
      });
    });
  });

  describe('useScenario Hook', () => {
    it('throws error when used outside ScenarioProvider', () => {
      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      function InvalidComponent() {
        useScenario();
        return null;
      }

      expect(() => {
        render(<InvalidComponent />);
      }).toThrow('useScenario must be used within a ScenarioProvider');

      consoleSpy.mockRestore();
    });

    it('provides context values', async () => {
      (api.scenarios.list as jest.Mock).mockImplementation(() =>
        Promise.resolve({
          data: {
            data: [mockBaselineScenario]
          }
        })
      );

      function TestHookValues() {
        const context = useScenario();
        return (
          <div>
            <div data-testid="has-current-scenario">
              {context.currentScenario ? 'yes' : 'no'}
            </div>
            <div data-testid="has-scenarios">
              {(context.scenarios?.length || 0) > 0 ? 'yes' : 'no'}
            </div>
            <div data-testid="has-set-function">
              {typeof context.setCurrentScenario === 'function' ? 'yes' : 'no'}
            </div>
            <div data-testid="is-loading">
              {context.isLoading ? 'yes' : 'no'}
            </div>
          </div>
        );
      }

      renderWithProvider(<TestHookValues />);

      await waitFor(() => {
        expect(screen.getByTestId('has-scenarios')).toHaveTextContent('yes');
      });

      expect(screen.getByTestId('has-set-function')).toHaveTextContent('yes');
      expect(screen.getByTestId('is-loading')).toHaveTextContent('no');
    });
  });

  describe('Edge Cases', () => {
    it('handles multiple scenarios with same type', async () => {
      const scenario1: Scenario = { ...mockBaselineScenario, id: 'base-1', name: 'Baseline 1' };
      const scenario2: Scenario = { ...mockBaselineScenario, id: 'base-2', name: 'Baseline 2' };

      (api.scenarios.list as jest.Mock).mockImplementation(() =>
        Promise.resolve({
          data: {
            data: [scenario1, scenario2]
          }
        })
      );

      renderWithProvider(<TestComponent />);

      await waitFor(() => {
        // Should select the first baseline found
        expect(screen.getByTestId('current-scenario')).toHaveTextContent('Baseline 1');
      });
    });

    it('handles scenarios without baseline type', async () => {
      (api.scenarios.list as jest.Mock).mockImplementation(() =>
        Promise.resolve({
          data: {
            data: [mockAlternativeScenario]
          }
        })
      );

      renderWithProvider(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByTestId('scenario-count')).toHaveTextContent('1');
      });

      // No baseline, so no auto-selection
      expect(screen.getByTestId('current-scenario')).toHaveTextContent('No scenario selected');
    });

    it('handles rapid scenario switches', async () => {
      (api.scenarios.list as jest.Mock).mockImplementation(() =>
        Promise.resolve({
          data: {
            data: [mockBaselineScenario, mockAlternativeScenario]
          }
        })
      );

      renderWithProvider(
        <>
          <TestComponent />
          <TestSetScenarioComponent />
        </>
      );

      await waitFor(() => {
        expect(screen.getByTestId('current-scenario')).toHaveTextContent('Baseline Scenario');
      });

      const switchBtn = screen.getByTestId('switch-scenario-btn');

      // Rapid clicks
      act(() => {
        switchBtn.click();
        switchBtn.click();
        switchBtn.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('current-scenario')).toHaveTextContent('Alternative Scenario');
      });
    });
  });
});
