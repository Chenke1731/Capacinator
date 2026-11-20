import React from 'react';

// Mock the API client
jest.mock('../../../../client/src/lib/api-client', () => ({
  api: {
    projectPhases: {
      list: jest.fn(),
      update: jest.fn(),
    },
    projectPhaseDependencies: {
      list: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    phases: {
      list: jest.fn(),
    },
  },
}));

// Mock InteractiveTimeline component
jest.mock('../../../../client/src/components/InteractiveTimeline', () => {
  const React = require('react');
  return function MockInteractiveTimeline({ items, onItemMove, onItemResize }: any) {
    // Use useEffect to call handlers after render to better simulate async behavior
    React.useEffect(() => {
      // Store handlers globally for tests to trigger them
      (window as any).__timelineHandlers = { onItemMove, onItemResize };
    }, [onItemMove, onItemResize]);
    
    return (
      <div data-testid="interactive-timeline">
        {items.map((item: any) => (
          <div key={item.id} data-testid={`timeline-item-${item.id}`}>
            <span>{item.name}</span>
            <button
              onClick={() => {
                if (onItemMove) {
                  onItemMove(item.id, new Date('2024-02-01'), new Date('2024-02-28'));
                }
              }}
              data-testid={`move-${item.id}`}
            >
              Move
            </button>
            <button
              onClick={() => {
                if (onItemResize) {
                  onItemResize(item.id, new Date('2024-01-01'), new Date('2024-03-01'));
                }
              }}
              data-testid={`resize-${item.id}`}
            >
              Resize
            </button>
          </div>
        ))}
      </div>
    );
  };
});

// Mock UI components that might be used
jest.mock('../../../../client/src/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('../../../../client/src/components/ui/button', () => ({
  Button: ({ children, onClick, ...props }: any) => <button onClick={onClick} {...props}>{children}</button>,
}));

// Mock PortalThemeProvider
jest.mock('../../../../client/src/components/PortalThemeProvider', () => ({
  PortalThemeProvider: ({ children }: any) => <>{children}</>,
}));

// Mock UserContext
jest.mock('../../../../client/src/contexts/UserContext', () => ({
  useUser: () => ({
    currentUser: { id: 'user-1', name: 'Test User' },
    isLoggedIn: true,
    setCurrentUser: jest.fn(),
    logout: jest.fn(),
  }),
  UserProvider: ({ children }: any) => <>{children}</>,
}));

// Mock ThemeContext  
jest.mock('../../../../client/src/contexts/ThemeContext', () => ({
  ThemeProvider: ({ children }: any) => <>{children}</>,
  useTheme: () => ({ theme: 'light', toggleTheme: jest.fn() }),
}));

// Now import everything else
import { describe, test, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import '@testing-library/jest-dom';
import VisualPhaseManager from '../../../../client/src/components/VisualPhaseManager';
import { api } from '../../../../client/src/lib/api-client';

const mockToast = jest.fn();
jest.mock('../../../../client/src/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockApi = api as jest.Mocked<typeof api>;

// Mock data
const mockProjectPhases = [
  {
    id: '1',
    project_id: 'project-1',
    phase_id: 'phase-1',
    phase_name: 'Design',
    start_date: '2024-01-01',
    end_date: '2024-01-31',
    phase_order: 1,
  },
  {
    id: '2', 
    project_id: 'project-1',
    phase_id: 'phase-2',
    phase_name: 'Development',
    start_date: '2024-02-01',
    end_date: '2024-03-31',
    phase_order: 2,
  },
  {
    id: '3',
    project_id: 'project-1',
    phase_id: 'phase-3',
    phase_name: 'Testing',
    start_date: '2024-04-01',
    end_date: '2024-04-30',
    phase_order: 3,
  },
];

const mockDependencies = [
  {
    id: 'dep-1',
    predecessor_phase_timeline_id: '1',
    successor_phase_timeline_id: '2',
    dependency_type: 'FS',
    lag_days: 0,
    predecessor_phase_name: 'Design',
    successor_phase_name: 'Development',
  },
  {
    id: 'dep-2',
    predecessor_phase_timeline_id: '2',
    successor_phase_timeline_id: '3',
    dependency_type: 'FS',
    lag_days: 0,
    predecessor_phase_name: 'Development',
    successor_phase_name: 'Testing',
  },
];


describe('VisualPhaseManager - Dependencies', () => {
  const defaultProps = {
    projectId: 'project-1',
    projectName: 'Test Project',
    onPhasesChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.projectPhases.list.mockResolvedValue({ data: { data: mockProjectPhases } });
    mockApi.projectPhaseDependencies.list.mockResolvedValue({ data: { data: mockDependencies } });
    mockApi.phases.list.mockResolvedValue({ data: { data: [] } });
  });

  describe('dependency loading and display', () => {
    test('should load and display project phases with dependencies', async () => {
      renderWithProviders(<VisualPhaseManager {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('interactive-timeline')).toBeInTheDocument();
        expect(screen.getByText('Design')).toBeInTheDocument();
        expect(screen.getByText('Development')).toBeInTheDocument();
        expect(screen.getByText('Testing')).toBeInTheDocument();
      });

      expect(mockApi.projectPhases.list).toHaveBeenCalledWith({ project_id: 'project-1' });
      expect(mockApi.projectPhaseDependencies.list).toHaveBeenCalledWith({ project_id: 'project-1' });
    });

    test('should display dependency information in timeline', async () => {
      renderWithProviders(<VisualPhaseManager {...defaultProps} />);

      await waitFor(() => {
        // Wait for timeline to be rendered
        expect(screen.getByTestId('interactive-timeline')).toBeInTheDocument();
      });

      // Check that dependencies are loaded
      expect(mockApi.projectPhaseDependencies.list).toHaveBeenCalledWith({ project_id: 'project-1' });
    });
  });

  describe('phase movement and updates', () => {
    test('should update phase when moving it', async () => {
      mockApi.projectPhases.update.mockResolvedValue({ data: { id: '1' } });
      
      renderWithProviders(<VisualPhaseManager {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('timeline-item-1')).toBeInTheDocument();
      });

      // Move the first phase
      const moveButton = screen.getByTestId('move-1');
      fireEvent.click(moveButton);

      // Wait a bit for the mutation to be triggered
      await new Promise(resolve => setTimeout(resolve, 100));

      await waitFor(() => {
        expect(mockApi.projectPhases.update).toHaveBeenCalled();
        const calls = mockApi.projectPhases.update.mock.calls;
        expect(calls.length).toBeGreaterThan(0);
        expect(calls[0][0]).toBe('1'); // First arg is phase ID
        expect(calls[0][1]).toHaveProperty('start_date');
        expect(calls[0][1]).toHaveProperty('end_date');
      });
    });

    test('should update phase when resizing it', async () => {
      mockApi.projectPhases.update.mockResolvedValue({ data: { id: '1' } });
      
      renderWithProviders(<VisualPhaseManager {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('timeline-item-1')).toBeInTheDocument();
      });

      // Resize the first phase
      const resizeButton = screen.getByTestId('resize-1');
      fireEvent.click(resizeButton);

      // Wait a bit for the mutation to be triggered
      await new Promise(resolve => setTimeout(resolve, 100));

      await waitFor(() => {
        expect(mockApi.projectPhases.update).toHaveBeenCalled();
        const calls = mockApi.projectPhases.update.mock.calls;
        expect(calls.length).toBeGreaterThan(0);
        expect(calls[0][0]).toBe('1'); // First arg is phase ID
        expect(calls[0][1]).toHaveProperty('start_date');
        expect(calls[0][1]).toHaveProperty('end_date');
      });
    });

    test('should show alert on validation error', async () => {
      const error = {
        response: {
          data: {
            validation_errors: ['Dependency validation failed: Phase cannot start before predecessor ends']
          }
        }
      };
      mockApi.projectPhases.update.mockRejectedValue(error);
      
      renderWithProviders(<VisualPhaseManager {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('timeline-item-1')).toBeInTheDocument();
      });

      const moveButton = screen.getByTestId('move-1');
      fireEvent.click(moveButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Dependency validation failed:',
          description: 'Dependency validation failed: Phase cannot start before predecessor ends',
          variant: 'destructive',
        });
      });
    });
  });

  describe('dependency management', () => {
    test('should show dependencies section with Add Dependency button', async () => {
      renderWithProviders(<VisualPhaseManager {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Phase Dependencies')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Add Dependency/i })).toBeInTheDocument();
      });

      // Should show existing dependencies
      expect(screen.getByText('Design → Development')).toBeInTheDocument();
      expect(screen.getByText('Development → Testing')).toBeInTheDocument();
    });

    test('should open dependency modal when clicking Add Dependency', async () => {
      renderWithProviders(<VisualPhaseManager {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add Dependency/i })).toBeInTheDocument();
      });

      const addButton = screen.getByRole('button', { name: /Add Dependency/i });
      fireEvent.click(addButton);

      // Check modal appears
      await waitFor(() => {
        expect(screen.getByText('Add Phase Dependency')).toBeInTheDocument();
        expect(screen.getByText('Predecessor Phase (must complete first)')).toBeInTheDocument();
        expect(screen.getByText('Successor Phase (depends on predecessor)')).toBeInTheDocument();
      });
    });

    test('should create new dependency', async () => {
      mockApi.projectPhaseDependencies.create.mockResolvedValue({ data: { id: 'new-dep' } });
      
      renderWithProviders(<VisualPhaseManager {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add Dependency/i })).toBeInTheDocument();
      });

      // Click Add Dependency button
      const addButton = screen.getByRole('button', { name: /Add Dependency/i });
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(screen.getByText('Add Phase Dependency')).toBeInTheDocument();
      });

      // Select phases - the selects are right after their label texts
      const selects = screen.getAllByRole('combobox');
      const predecessorSelect = selects[0]; // First select is predecessor
      const successorSelect = selects[1];   // Second select is successor
      
      fireEvent.change(predecessorSelect, { target: { value: '1' } });
      fireEvent.change(successorSelect, { target: { value: '3' } });

      // Submit form
      const createButton = screen.getByRole('button', { name: /Create Dependency/i });
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(mockApi.projectPhaseDependencies.create).toHaveBeenCalledWith({
          project_id: 'project-1',
          predecessor_phase_timeline_id: '1',
          successor_phase_timeline_id: '3',
          dependency_type: 'FS',
          lag_days: 0,
        });
      });
    });

    test('should edit existing dependency', async () => {
      mockApi.projectPhaseDependencies.update.mockResolvedValue({ data: { id: 'dep-1' } });
      
      renderWithProviders(<VisualPhaseManager {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Design → Development')).toBeInTheDocument();
      });

      // Click edit button for first dependency
      const editButtons = screen.getAllByRole('button', { name: /Edit/i });
      fireEvent.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Edit Phase Dependency')).toBeInTheDocument();
      });

      // Change lag days - find input by type number
      const lagInput = screen.getByRole('spinbutton');
      fireEvent.change(lagInput, { target: { value: '5' } });

      // Submit form
      const updateButton = screen.getByRole('button', { name: /Update Dependency/i });
      fireEvent.click(updateButton);

      await waitFor(() => {
        expect(mockApi.projectPhaseDependencies.update).toHaveBeenCalledWith('dep-1', {
          project_id: 'project-1',
          predecessor_phase_timeline_id: '1',
          successor_phase_timeline_id: '2',
          dependency_type: 'FS',
          lag_days: 5,
        });
      });
    });

    test('should delete dependency with confirmation', async () => {
      mockApi.projectPhaseDependencies.delete.mockResolvedValue({});
      
      renderWithProviders(<VisualPhaseManager {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Design → Development')).toBeInTheDocument();
      });

      // Click delete button for first dependency
      const deleteButtons = screen.getAllByRole('button', { name: /Delete/i });
      fireEvent.click(deleteButtons[0]);
      const dialog = await screen.findByTestId('confirm-dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

      await waitFor(() => {
        expect(mockApi.projectPhaseDependencies.delete).toHaveBeenCalledWith('dep-1');
      });
    });
  });

  describe('error handling', () => {
    test('should show loading state while fetching phases', async () => {
      // Keep the API call pending
      let resolvePhases: any;
      const phasesPromise = new Promise((resolve) => {
        resolvePhases = resolve;
      });
      mockApi.projectPhases.list.mockReturnValue(phasesPromise);
      
      renderWithProviders(<VisualPhaseManager {...defaultProps} />);

      expect(screen.getByText('Loading project phases...')).toBeInTheDocument();
      
      // Resolve the promise
      resolvePhases({ data: { data: mockProjectPhases } });
      
      await waitFor(() => {
        expect(screen.queryByText('Loading project phases...')).not.toBeInTheDocument();
      });
    });

    test('should handle dependency creation errors', async () => {
      const error = new Error('Failed to create dependency');
      mockApi.projectPhaseDependencies.create.mockRejectedValue(error);
      
      // Spy on console.error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      renderWithProviders(<VisualPhaseManager {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Add Dependency/i })).toBeInTheDocument();
      });

      // Open modal and try to create dependency
      const addButton = screen.getByRole('button', { name: /Add Dependency/i });
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(screen.getByText('Add Phase Dependency')).toBeInTheDocument();
      });

      // Select phases - the selects are right after their label texts
      const selects = screen.getAllByRole('combobox');
      const predecessorSelect = selects[0]; // First select is predecessor
      const successorSelect = selects[1];   // Second select is successor
      
      fireEvent.change(predecessorSelect, { target: { value: '1' } });
      fireEvent.change(successorSelect, { target: { value: '3' } });

      // Submit form
      const createButton = screen.getByRole('button', { name: /Create Dependency/i });
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to save dependency:', error);
      });
      
      consoleErrorSpy.mockRestore();
    });

    test('should handle dependency deletion errors', async () => {
      const error = new Error('Failed to delete dependency');
      mockApi.projectPhaseDependencies.delete.mockRejectedValue(error);
      
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      renderWithProviders(<VisualPhaseManager {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Design → Development')).toBeInTheDocument();
      });

      // Click delete button
      const deleteButtons = screen.getAllByRole('button', { name: /Delete/i });
      fireEvent.click(deleteButtons[0]);
      const dialog = await screen.findByTestId('confirm-dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to delete dependency:', error);
      });
      
      consoleErrorSpy.mockRestore();
    });
  });
});