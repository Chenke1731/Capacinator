import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ScenarioMergeModal } from '../ScenarioMergeModal';
import { api } from '../../../lib/api-client';

// Mock the API client
jest.mock('../../../lib/api-client', () => ({
  api: {
    scenarios: {
      merge: jest.fn()
    }
  }
}));

describe('ScenarioMergeModal', () => {
  const mockOnClose = jest.fn();
  const mockOnMergeComplete = jest.fn();

  const mockScenario = {
    id: 'scenario-1',
    name: 'Test Scenario',
    parent_scenario_id: 'parent-scenario-1',
    description: 'Test scenario description',
    created_by: 'user-1',
    status: 'active' as const,
    scenario_type: 'branch' as const,
    created_at: '2025-01-01',
    updated_at: '2025-01-02'
  };

  const mockConflicts = [
    {
      type: 'assignment',
      entity_id: 'entity-1',
      conflict_description: 'Assignment allocation differs between scenarios',
      source_data: { allocation: 50, person_name: 'John Doe' },
      target_data: { allocation: 40, person_name: 'John Doe' }
    },
    {
      type: 'phase_timeline',
      entity_id: 'entity-2',
      conflict_description: 'Phase dates differ between scenarios',
      source_data: { start_date: '2025-01-01', end_date: '2025-03-31' },
      target_data: { start_date: '2025-02-01', end_date: '2025-04-30' }
    }
  ];

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    scenario: mockScenario,
    onMergeComplete: mockOnMergeComplete
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderComponent = (props = {}) => {
    return render(<ScenarioMergeModal {...defaultProps} {...props} />);
  };

  describe('Basic Rendering', () => {
    it('renders when isOpen is true', () => {
      renderComponent();
      expect(screen.getByText('Scenario Merge')).toBeInTheDocument();
    });

    it('does not render when isOpen is false', () => {
      renderComponent({ isOpen: false });
      expect(screen.queryByText('Scenario Merge')).not.toBeInTheDocument();
    });

    it('displays scenario name in setup step', () => {
      renderComponent();
      expect(screen.getByText(/Merge Scenario: Test Scenario/i)).toBeInTheDocument();
    });
  });

  describe('Setup Step', () => {
    it('renders setup step by default', () => {
      renderComponent();
      expect(screen.getByText(/Merge Scenario: Test Scenario/i)).toBeInTheDocument();
      expect(screen.getByText('Merge Strategy')).toBeInTheDocument();
    });

    it('shows three merge strategy options', () => {
      renderComponent();
      expect(screen.getByText('Manual Resolution')).toBeInTheDocument();
      expect(screen.getByText('Source Priority')).toBeInTheDocument();
      expect(screen.getByText('Target Priority')).toBeInTheDocument();
    });

    it('has Manual Resolution selected by default', () => {
      renderComponent();
      const manualRadio = screen.getByRole('radio', { name: /Manual Resolution/i });
      expect(manualRadio).toBeChecked();
    });

    it('allows selecting different merge strategies', () => {
      renderComponent();
      const sourceRadio = screen.getByRole('radio', { name: /Source Priority/i });
      fireEvent.click(sourceRadio);
      expect(sourceRadio).toBeChecked();
    });

    it('shows Cancel and Analyze Conflicts buttons', () => {
      renderComponent();
      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Analyze Conflicts/i })).toBeInTheDocument();
    });

    it('calls onClose when Cancel is clicked', async () => {
      renderComponent();
      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      fireEvent.click(cancelButton);

      // Wait for the timeout in handleClose (200ms)
      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled();
      }, { timeout: 300 });
    });
  });

  describe('Merge Initiation', () => {
    it('calls API when Analyze Conflicts is clicked', async () => {
      (api.scenarios.merge as jest.Mock).mockResolvedValue({
        data: { success: true, message: 'Merge completed' }
      });

      renderComponent();
      const analyzeButton = screen.getByRole('button', { name: /Analyze Conflicts/i });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(api.scenarios.merge).toHaveBeenCalledWith('scenario-1', {
          resolve_conflicts_as: 'manual'
        });
      });
    });

    it('transitions to conflicts step when conflicts are detected', async () => {
      (api.scenarios.merge as jest.Mock).mockResolvedValue({
        data: {
          success: false,
          conflict_details: mockConflicts
        }
      });

      renderComponent();
      const analyzeButton = screen.getByRole('button', { name: /Analyze Conflicts/i });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(screen.getByText(/Resolve Merge Conflicts/i)).toBeInTheDocument();
      });
    });

    it('transitions to complete step when no conflicts', async () => {
      (api.scenarios.merge as jest.Mock).mockResolvedValue({
        data: { success: true, message: 'Merge completed successfully' }
      });

      renderComponent();
      const analyzeButton = screen.getByRole('button', { name: /Analyze Conflicts/i });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(screen.getByText(/Merge Completed Successfully/i)).toBeInTheDocument();
      });
    });

    it('shows error message on API failure', async () => {
      (api.scenarios.merge as jest.Mock).mockRejectedValue({
        response: { data: { error: 'Failed to merge' } }
      });

      renderComponent();
      const analyzeButton = screen.getByRole('button', { name: /Analyze Conflicts/i });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(screen.getByText('Failed to merge')).toBeInTheDocument();
      });
    });

    it('shows error when scenario has no parent', async () => {
      const scenarioWithoutParent = { ...mockScenario, parent_scenario_id: null };
      renderComponent({ scenario: scenarioWithoutParent });

      const analyzeButton = screen.getByRole('button', { name: /Analyze Conflicts/i });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(screen.getByText(/Cannot merge scenario without parent/i)).toBeInTheDocument();
      });
    });
  });

  describe('Conflicts Step', () => {
    beforeEach(async () => {
      (api.scenarios.merge as jest.Mock).mockResolvedValue({
        data: {
          success: false,
          conflict_details: mockConflicts
        }
      });

      renderComponent();
      const analyzeButton = screen.getByRole('button', { name: /Analyze Conflicts/i });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(screen.getByText(/Resolve Merge Conflicts/i)).toBeInTheDocument();
      });
    });

    it('displays conflict count', () => {
      expect(screen.getByText(/Resolve Merge Conflicts/i)).toBeInTheDocument();
    });

    it('shows current conflict details', () => {
      expect(screen.getByText(/Assignment allocation differs between scenarios/i)).toBeInTheDocument();
      // Check for conflict type in heading
      expect(screen.getAllByText(/ASSIGNMENT/i)[0]).toBeInTheDocument();
    });

    it('displays source and target data', () => {
      expect(screen.getByText(/Source \(This Scenario\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Target \(Parent Scenario\)/i)).toBeInTheDocument();
    });

    it('shows Use Source and Use Target buttons', () => {
      expect(screen.getByRole('button', { name: /Use Source/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Use Target/i })).toBeInTheDocument();
    });

    it('allows resolving conflict with source data', () => {
      const useSourceButton = screen.getByRole('button', { name: /Use Source/i });
      fireEvent.click(useSourceButton);

      expect(screen.getByText(/Resolved: Using source data/i)).toBeInTheDocument();
    });

    it('allows resolving conflict with target data', () => {
      const useTargetButton = screen.getByRole('button', { name: /Use Target/i });
      fireEvent.click(useTargetButton);

      expect(screen.getByText(/Resolved: Using target data/i)).toBeInTheDocument();
    });

    it('updates resolved count after resolving conflict', () => {
      const useSourceButton = screen.getByRole('button', { name: /Use Source/i });
      fireEvent.click(useSourceButton);

      expect(screen.getByText(/\(1\/2\)/)).toBeInTheDocument();
    });

    it('shows navigation buttons', () => {
      expect(screen.getByRole('button', { name: /Previous/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Next/i })).toBeInTheDocument();
    });

    it('disables Previous button on first conflict', () => {
      const previousButton = screen.getByRole('button', { name: /Previous/i });
      expect(previousButton).toBeDisabled();
    });

    it('allows navigating to next conflict', () => {
      const nextButton = screen.getByRole('button', { name: /Next/i });
      fireEvent.click(nextButton);

      // Check for phase timeline conflict description
      expect(screen.getByText(/Phase dates differ between scenarios/i)).toBeInTheDocument();
    });

    it('disables Next button on last conflict', () => {
      const nextButton = screen.getByRole('button', { name: /Next/i });
      fireEvent.click(nextButton);

      expect(nextButton).toBeDisabled();
    });

    it('shows conflict index counter', () => {
      expect(screen.getByText(/1 of 2/)).toBeInTheDocument();
    });

    it('disables Preview button until all conflicts resolved', () => {
      const previewButton = screen.getByRole('button', { name: /Resolve 2 more conflicts/i });
      expect(previewButton).toBeDisabled();
    });

    it('enables Preview button when all conflicts resolved', () => {
      // Resolve first conflict
      const useSourceButton = screen.getByRole('button', { name: /Use Source/i });
      fireEvent.click(useSourceButton);

      // Navigate to second conflict
      const nextButton = screen.getByRole('button', { name: /Next/i });
      fireEvent.click(nextButton);

      // Resolve second conflict
      const useTargetButton = screen.getByRole('button', { name: /Use Target/i });
      fireEvent.click(useTargetButton);

      // Check preview button is enabled
      const previewButton = screen.getByRole('button', { name: /Preview Merge/i });
      expect(previewButton).not.toBeDisabled();
    });

    it('allows going back to setup', () => {
      const backButton = screen.getByRole('button', { name: /Back to Setup/i });
      fireEvent.click(backButton);

      expect(screen.getByText(/Merge Strategy/i)).toBeInTheDocument();
    });
  });

  describe('Preview Step', () => {
    beforeEach(async () => {
      (api.scenarios.merge as jest.Mock).mockResolvedValue({
        data: {
          success: false,
          conflict_details: mockConflicts
        }
      });

      renderComponent();

      // Navigate through workflow
      const analyzeButton = screen.getByRole('button', { name: /Analyze Conflicts/i });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(screen.getByText(/Resolve Merge Conflicts/i)).toBeInTheDocument();
      });

      // Resolve all conflicts
      const useSourceButton = screen.getByRole('button', { name: /Use Source/i });
      fireEvent.click(useSourceButton);

      const nextButton = screen.getByRole('button', { name: /Next/i });
      fireEvent.click(nextButton);

      const useTargetButton = screen.getByRole('button', { name: /Use Target/i });
      fireEvent.click(useTargetButton);

      // Navigate to preview
      const previewButton = screen.getByRole('button', { name: /Preview Merge/i });
      fireEvent.click(previewButton);
    });

    it('displays preview heading', () => {
      expect(screen.getByText('Merge Preview')).toBeInTheDocument();
    });

    it('shows conflict resolutions count', () => {
      expect(screen.getByText(/Conflict Resolutions \(2\)/i)).toBeInTheDocument();
    });

    it('displays impact summary', () => {
      expect(screen.getByText('Impact Summary')).toBeInTheDocument();
      expect(screen.getByText(/Assignments affected:/i)).toBeInTheDocument();
      expect(screen.getByText(/Phase timelines affected:/i)).toBeInTheDocument();
    });

    it('shows Execute Merge button', () => {
      expect(screen.getByRole('button', { name: /Execute Merge/i })).toBeInTheDocument();
    });

    it('allows going back to conflicts', () => {
      const backButton = screen.getByRole('button', { name: /Back to Conflicts/i });
      fireEvent.click(backButton);

      expect(screen.getByText(/Resolve Merge Conflicts/i)).toBeInTheDocument();
    });
  });

  describe('Executing Step', () => {
    it('shows executing state during merge', async () => {
      (api.scenarios.merge as jest.Mock)
        .mockResolvedValueOnce({
          data: {
            success: false,
            conflict_details: mockConflicts
          }
        })
        .mockImplementation(() => new Promise(resolve => setTimeout(resolve, 1000)));

      renderComponent();

      const analyzeButton = screen.getByRole('button', { name: /Analyze Conflicts/i });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(screen.getByText(/Resolve Merge Conflicts/i)).toBeInTheDocument();
      });

      // Resolve conflicts
      const useSourceButton = screen.getByRole('button', { name: /Use Source/i });
      fireEvent.click(useSourceButton);

      const nextButton = screen.getByRole('button', { name: /Next/i });
      fireEvent.click(nextButton);

      const useTargetButton = screen.getByRole('button', { name: /Use Target/i });
      fireEvent.click(useTargetButton);

      const previewButton = screen.getByRole('button', { name: /Preview Merge/i });
      fireEvent.click(previewButton);

      await waitFor(() => {
        expect(screen.getByText('Merge Preview')).toBeInTheDocument();
      });

      const executeButton = screen.getByRole('button', { name: /Execute Merge/i });
      fireEvent.click(executeButton);

      // Should show executing state
      expect(screen.getByText(/Executing Merge.../i)).toBeInTheDocument();
    });
  });

  describe('Complete Step', () => {
    beforeEach(async () => {
      (api.scenarios.merge as jest.Mock)
        .mockResolvedValueOnce({
          data: {
            success: false,
            conflict_details: mockConflicts
          }
        })
        .mockResolvedValueOnce({
          data: { success: true, message: 'Merge completed' }
        });

      renderComponent();

      const analyzeButton = screen.getByRole('button', { name: /Analyze Conflicts/i });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(screen.getByText(/Resolve Merge Conflicts/i)).toBeInTheDocument();
      });

      // Resolve conflicts
      const useSourceButton = screen.getByRole('button', { name: /Use Source/i });
      fireEvent.click(useSourceButton);

      const nextButton = screen.getByRole('button', { name: /Next/i });
      fireEvent.click(nextButton);

      const useTargetButton = screen.getByRole('button', { name: /Use Target/i });
      fireEvent.click(useTargetButton);

      const previewButton = screen.getByRole('button', { name: /Preview Merge/i });
      fireEvent.click(previewButton);

      await waitFor(() => {
        expect(screen.getByText('Merge Preview')).toBeInTheDocument();
      });

      const executeButton = screen.getByRole('button', { name: /Execute Merge/i });
      fireEvent.click(executeButton);

      await waitFor(() => {
        expect(screen.getByText(/Merge Completed Successfully/i)).toBeInTheDocument();
      });
    });

    it('displays success message', () => {
      expect(screen.getByText(/Merge Completed Successfully/i)).toBeInTheDocument();
    });

    it('shows merge summary', () => {
      expect(screen.getByText('Merge Summary')).toBeInTheDocument();
      expect(screen.getByText(/Source Scenario:/i)).toBeInTheDocument();
      expect(screen.getByText(/Conflicts Resolved:/i)).toBeInTheDocument();
    });

    it('calls onMergeComplete callback', () => {
      expect(mockOnMergeComplete).toHaveBeenCalled();
    });

    it('shows Close button', () => {
      const closeButtons = screen.getAllByRole('button', { name: /Close/i });
      expect(closeButtons.length).toBeGreaterThan(0);
    });

    it('closes modal when Close button is clicked', async () => {
      const closeButtons = screen.getAllByRole('button', { name: /Close/i });
      fireEvent.click(closeButtons[closeButtons.length - 1]); // Click the last Close button

      // Wait for the timeout in handleClose (200ms)
      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled();
      }, { timeout: 300 });
    });
  });

  describe('State Management', () => {
    it('resets state when modal reopens', async () => {
      const { rerender } = renderComponent();

      // Set some state
      const analyzeButton = screen.getByRole('button', { name: /Analyze Conflicts/i });
      fireEvent.click(analyzeButton);

      // Close modal
      rerender(<ScenarioMergeModal {...defaultProps} isOpen={false} />);

      // Reopen modal
      rerender(<ScenarioMergeModal {...defaultProps} isOpen={true} />);

      // Should be back at setup step
      expect(screen.getByText(/Merge Strategy/i)).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('handles merge execution error', async () => {
      (api.scenarios.merge as jest.Mock)
        .mockResolvedValueOnce({
          data: {
            success: false,
            conflict_details: mockConflicts
          }
        })
        .mockRejectedValueOnce({
          response: { data: { error: 'Execution failed' } }
        });

      renderComponent();

      const analyzeButton = screen.getByRole('button', { name: /Analyze Conflicts/i });
      fireEvent.click(analyzeButton);

      await waitFor(() => {
        expect(screen.getByText(/Resolve Merge Conflicts/i)).toBeInTheDocument();
      });

      // Resolve conflicts
      const useSourceButton = screen.getByRole('button', { name: /Use Source/i });
      fireEvent.click(useSourceButton);

      const nextButton = screen.getByRole('button', { name: /Next/i });
      fireEvent.click(nextButton);

      const useTargetButton = screen.getByRole('button', { name: /Use Target/i });
      fireEvent.click(useTargetButton);

      const previewButton = screen.getByRole('button', { name: /Preview Merge/i });
      fireEvent.click(previewButton);

      await waitFor(() => {
        expect(screen.getByText('Merge Preview')).toBeInTheDocument();
      });

      const executeButton = screen.getByRole('button', { name: /Execute Merge/i });
      fireEvent.click(executeButton);

      // Should go back to conflicts step with error
      await waitFor(() => {
        expect(screen.getByText(/Resolve Merge Conflicts/i)).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('has proper dialog structure', () => {
      renderComponent();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('has radio buttons with proper labels', () => {
      renderComponent();
      expect(screen.getByRole('radio', { name: /Manual Resolution/i })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: /Source Priority/i })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: /Target Priority/i })).toBeInTheDocument();
    });
  });
});
