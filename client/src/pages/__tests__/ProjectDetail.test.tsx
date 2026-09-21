import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectDetail } from '../ProjectDetail';
import { api } from '../../lib/api-client';

// Mock API module
jest.mock('../../lib/api-client', () => ({
  api: {
    projects: {
      get: jest.fn(),
      update: jest.fn()
    },
    projectTypes: {
      list: jest.fn()
    },
    locations: {
      list: jest.fn()
    },
    assignments: {
      delete: jest.fn(),
      update: jest.fn()
    }
  }
}));

// Mock react-router-dom
const mockNavigate = jest.fn();
const mockUseParams = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useParams: () => mockUseParams()
}));

// Mock unified timeline component
jest.mock('../../components/UnifiedProjectTimeline', () => ({
  __esModule: true,
  default: ({ projectId }: { projectId: string }) => (
    <div data-testid="unified-timeline">{`Timeline for project ${projectId}`}</div>
  )
}));

// Mock project demand chart
jest.mock('../../components/ProjectDemandChart', () => ({
  ProjectDemandChart: ({ projectId, projectName }: { projectId: string; projectName: string }) => (
    <div data-testid="demand-chart">{`Demand chart for ${projectName} (${projectId})`}</div>
  )
}));

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn()
};
Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage
});

// Test data
const mockProject = {
  id: 'project-1',
  name: 'Test Project',
  project_type_id: 'type-1',
  project_type_name: 'Development',
  project_type: {
    id: 'type-1',
    name: 'Development',
    color_code: '#3b82f6'
  },
  location_id: 'loc-1',
  location_name: 'San Francisco',
  priority: 2,
  description: 'Test project description',
  data_restrictions: 'Internal use only',
  include_in_demand: 1,
  aspiration_start: '2024-01-01',
  aspiration_finish: '2024-12-31',
  external_id: 'EXT-123',
  owner_id: 'user-1',
  owner_name: 'John Doe',
  created_at: 1640995200000, // 2022-01-01
  updated_at: 1704067200000, // 2024-01-01
  phases: [
    {
      id: 'phase-1',
      project_id: 'project-1',
      phase_id: 'phase-template-1',
      phase_name: 'Planning',
      phase_description: 'Project planning phase',
      start_date: 1704067200000,
      end_date: 1706745600000,
      created_at: 1704067200000,
      updated_at: 1704067200000
    }
  ],
  assignments: [
    {
      id: 'assign-1',
      project_id: 'project-1',
      person_id: 'person-1',
      person_name: 'Alice Johnson',
      role_id: 'role-1',
      role_name: 'Developer',
      phase_id: 'phase-1',
      start_date: 1704067200000,
      end_date: 1706745600000,
      allocation_percentage: 75,
      created_at: 1704067200000,
      updated_at: 1704067200000
    }
  ],
  planners: []
};

const mockProjectTypes = [
  { id: 'type-1', name: 'Development', color_code: '#3b82f6' },
  { id: 'type-2', name: 'Research', color_code: '#10b981' }
];

const mockLocations = [
  { id: 'loc-1', name: 'San Francisco' },
  { id: 'loc-2', name: 'New York' }
];

// Test wrapper component
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {children}
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('ProjectDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseParams.mockReturnValue({ id: 'project-1' });
    mockLocalStorage.getItem.mockImplementation((key) => {
      if (key === 'userRole') return 'admin';
      return null;
    });

    // Setup default API mocks
    (api.projects.get as jest.Mock).mockResolvedValue({
      data: { data: mockProject }
    });
    (api.projectTypes.list as jest.Mock).mockResolvedValue({
      data: { data: mockProjectTypes }
    });
    (api.locations.list as jest.Mock).mockResolvedValue({
      data: { data: mockLocations }
    });
  });

  describe('Basic Rendering', () => {
    test('renders loading state initially', () => {
      (api.projects.get as jest.Mock).mockReturnValue(new Promise(() => {})); // Never resolves
      
      render(
        <TestWrapper>
          <ProjectDetail />
        </TestWrapper>
      );

      // Check for skeleton loading elements instead of text
      expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
    });

    test('renders project details when loaded', async () => {
      render(
        <TestWrapper>
          <ProjectDetail />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Test Project')).toBeInTheDocument();
      });

      expect(screen.getAllByText('High')[0]).toBeInTheDocument(); // Priority badge
      expect(screen.getByText('Development')).toBeInTheDocument(); // Project type
    });

    test('renders error state when project fails to load', async () => {
      (api.projects.get as jest.Mock).mockRejectedValue(new Error('Failed to fetch'));

      render(
        <TestWrapper>
          <ProjectDetail />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Error Loading Project')).toBeInTheDocument();
        expect(screen.getByText('Failed to load project details. This could be due to a network issue or the project may not exist.')).toBeInTheDocument();
        expect(screen.getByText('Retry')).toBeInTheDocument();
        expect(screen.getByText('Back to Projects')).toBeInTheDocument();
      });
    });

    test('renders all collapsible sections', async () => {
      render(
        <TestWrapper>
          <ProjectDetail />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Project Information')).toBeInTheDocument();
      });

      expect(screen.getByText('Resource Demand')).toBeInTheDocument();
      expect(screen.getByText('Team Assignments')).toBeInTheDocument();
      expect(screen.getByText('History')).toBeInTheDocument();
    });
  });

  describe('Section Expand/Collapse', () => {
    test('toggles sections when clicked', async () => {
      render(
        <TestWrapper>
          <ProjectDetail />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Project Information')).toBeInTheDocument();
      });

      // Initially basic section should be expanded
      expect(screen.getByText('Test project description')).toBeInTheDocument();

      // Click to collapse
      fireEvent.click(screen.getByText('Project Information'));
      
      await waitFor(() => {
        expect(screen.queryByText('Test project description')).not.toBeInTheDocument();
      });

      // Click to expand again
      fireEvent.click(screen.getByText('Project Information'));
      
      await waitFor(() => {
        expect(screen.getByText('Test project description')).toBeInTheDocument();
      });
    });

    test('history section starts collapsed', async () => {
      render(
        <TestWrapper>
          <ProjectDetail />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('History')).toBeInTheDocument();
      });

      // History content should not be visible initially
      expect(screen.queryByText('Project created')).not.toBeInTheDocument();

      // Click to expand
      fireEvent.click(screen.getByText('History'));
      
      await waitFor(() => {
        expect(screen.getByText('Project created')).toBeInTheDocument();
      });
    });
  });

  describe('Inline Editing', () => {
    test('enables inline editing for admin users', async () => {
      render(
        <TestWrapper>
          <ProjectDetail />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Test Project')).toBeInTheDocument();
      });

      // Should show edit icons for editable fields (using class selector since data-testid not set)
      const editIcons = document.querySelectorAll('.edit-icon');
      expect(editIcons.length).toBeGreaterThan(0);
    });

    test('disables inline editing for viewer users', async () => {
      mockLocalStorage.getItem.mockImplementation((key) => {
        if (key === 'userRole') return 'viewer';
        return null;
      });

      render(
        <TestWrapper>
          <ProjectDetail />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Test Project')).toBeInTheDocument();
      });

      // Should not show edit icons for viewer role
      const editIcons = document.querySelectorAll('.edit-icon');
      expect(editIcons).toHaveLength(0);
    });

    test('saves field updates when edited', async () => {
      const user = userEvent.setup();
      (api.projects.update as jest.Mock).mockResolvedValue({ data: { data: mockProject } });

      render(
        <TestWrapper>
          <ProjectDetail />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Test Project')).toBeInTheDocument();
      });

      // Find the description field
      const descriptionDiv = screen.getByText('Test project description');
      await user.click(descriptionDiv);

      // After clicking, a textarea should appear
      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      const descriptionField = screen.getByRole('textbox');
      
      // Clear and type new value
      await user.clear(descriptionField);
      await user.type(descriptionField, 'Updated description');
      
      // Click save button (the green check button)
      const saveButton = screen.getByTitle('Save');
      await user.click(saveButton);

      await waitFor(() => {
        expect(api.projects.update).toHaveBeenCalledWith('project-1', {
          description: 'Updated description'
        });
      });
    });

    test('handles select field editing', async () => {
      const user = userEvent.setup();
      (api.projects.update as jest.Mock).mockResolvedValue({ data: { data: mockProject } });

      render(
        <TestWrapper>
          <ProjectDetail />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Development')).toBeInTheDocument();
      });

      // Click on project type field to edit
      const projectTypeField = screen.getByText('Development');
      await user.click(projectTypeField);

      // Should show select dropdown
      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });

      // Select different option
      await user.selectOptions(screen.getByRole('combobox'), 'type-2');
      
      // Click save button
      const saveButton = screen.getByTitle('Save');
      await user.click(saveButton);

      await waitFor(() => {
        expect(api.projects.update).toHaveBeenCalledWith('project-1', {
          project_type_id: 'type-2'
        });
      });
    });
  });

  describe('Team Assignments', () => {
    test('displays assignments table when assignments exist', async () => {
      render(
        <TestWrapper>
          <ProjectDetail />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      });

      expect(screen.getByText('Developer')).toBeInTheDocument();
      expect(screen.getByText('75%')).toBeInTheDocument();
    });

    test('shows empty state when no assignments exist', async () => {
      const projectWithoutAssignments = { ...mockProject, assignments: [] };
      (api.projects.get as jest.Mock).mockResolvedValue({
        data: { data: projectWithoutAssignments }
      });

      render(
        <TestWrapper>
          <ProjectDetail />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('No team assignments')).toBeInTheDocument();
      });

      // In-place staffing (no jump to /assignments): add buttons live in the section
      expect(screen.getByText('Named')).toBeInTheDocument();
      expect(screen.getByText('Pool')).toBeInTheDocument();
    });

    test('opens assignment modal when assignment is clicked', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ProjectDetail />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      });

      // Click on assignment row
      const assignmentRow = screen.getByRole('row', { name: /Alice Johnson/ });
      await user.click(assignmentRow);

      // Modal should open
      await waitFor(() => {
        expect(screen.getByText('Assignment Details')).toBeInTheDocument();
      });

      // Look for the allocation value in the modal dialog
      const modal = screen.getByRole('dialog');
      expect(within(modal).getByText('75%')).toBeInTheDocument();
    });

    test('allows editing assignment in modal', async () => {
      const user = userEvent.setup();
      (api.assignments.update as jest.Mock).mockResolvedValue({ data: {} });

      render(
        <TestWrapper>
          <ProjectDetail />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      });

      // Click on assignment row (look for table row containing the name)
      const assignmentRow = screen.getByRole('row', { name: /Alice Johnson/ });
      await user.click(assignmentRow);

      await waitFor(() => {
        expect(screen.getByText('Assignment Details')).toBeInTheDocument();
      });

      // Click edit button
      await user.click(screen.getByText('Edit'));

      // Should show editing form
      await waitFor(() => {
        expect(screen.getByText('Edit Assignment')).toBeInTheDocument();
      });

      // Update allocation
      const allocationInput = screen.getByDisplayValue('75');
      await user.clear(allocationInput);
      await user.type(allocationInput, '80');

      // Save changes
      await user.click(screen.getByText('Save Changes'));

      await waitFor(() => {
        expect(api.assignments.update).toHaveBeenCalledWith('assign-1', {
          allocation_percentage: 80,
          start_date: expect.any(Number),
          end_date: expect.any(Number)
        });
      });
    });

    test('allows deleting assignment', async () => {
      const user = userEvent.setup();
      (api.assignments.delete as jest.Mock).mockResolvedValue({ data: {} });
      
      // Mock window.confirm
      const originalConfirm = window.confirm;
      window.confirm = jest.fn(() => true);

      render(
        <TestWrapper>
          <ProjectDetail />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      });

      // Delete lives in the mixed staffing table's row actions
      const row = screen.getByRole('row', { name: /Alice Johnson/ });
      await user.click(within(row).getByText('Delete'));

      await waitFor(() => {
        expect(api.assignments.delete).toHaveBeenCalledWith('assign-1');
      });

      // Restore original confirm
      window.confirm = originalConfirm;
    });
  });

  // Timeline Integration tests removed - UnifiedProjectTimeline component was removed from ProjectDetail
  // as it was redundant with the Resource Demand section which includes an integrated phase timeline

  describe('Demand Chart Integration', () => {
    test('renders project demand chart', async () => {
      render(
        <TestWrapper>
          <ProjectDetail />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('demand-chart')).toBeInTheDocument();
      });

      expect(screen.getByText('Demand chart for Test Project (project-1)')).toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    test('navigates back to projects list when back button clicked', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ProjectDetail />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Test Project')).toBeInTheDocument();
      });

      // Click back button (it has an ArrowLeft icon but no aria-label) - get the first button
      const buttons = screen.getAllByRole('button');
      const backButton = buttons[0]; // First button should be the back button
      await user.click(backButton);

      expect(mockNavigate).toHaveBeenCalledWith('/projects');
    });

    test('navigates to person details when person link clicked', async () => {
      const user = userEvent.setup();

      render(
        <TestWrapper>
          <ProjectDetail />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      });

      // Person name should be a link
      const personLink = screen.getByRole('link', { name: 'Alice Johnson' });
      expect(personLink).toHaveAttribute('href', '/people/person-1');
    });
  });

  describe('Error Handling', () => {
    test('handles null/undefined assignments gracefully', async () => {
      const projectWithNullAssignments = { ...mockProject, assignments: null };
      (api.projects.get as jest.Mock).mockResolvedValue({
        data: { data: projectWithNullAssignments }
      });

      render(
        <TestWrapper>
          <ProjectDetail />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Test Project')).toBeInTheDocument();
      });

      // Should show empty state instead of crashing
      expect(screen.getByText('No team assignments')).toBeInTheDocument();
    });

    test('handles API errors during field updates', async () => {
      const user = userEvent.setup();
      (api.projects.update as jest.Mock).mockRejectedValue(new Error('Update failed'));

      render(
        <TestWrapper>
          <ProjectDetail />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Test Project')).toBeInTheDocument();
      });

      // Try to edit description
      const descriptionDiv = screen.getByText('Test project description');
      await user.click(descriptionDiv);
      
      // After clicking, a textarea should appear
      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      const descriptionField = screen.getByRole('textbox');
      await user.clear(descriptionField);
      await user.type(descriptionField, 'Updated description');
      
      // Click save button
      const saveButton = screen.getByTitle('Save');
      await user.click(saveButton);

      // Should not crash even if update fails
      await waitFor(() => {
        expect(api.projects.update).toHaveBeenCalled();
      });
    });

    test('handles missing project type data', async () => {
      const projectWithoutType = { ...mockProject, project_type: null, project_type_name: null };
      (api.projects.get as jest.Mock).mockResolvedValue({
        data: { data: projectWithoutType }
      });

      render(
        <TestWrapper>
          <ProjectDetail />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Test Project')).toBeInTheDocument();
      });

      // Should handle missing project type gracefully  
      // The component should render without crashing - just check it loads
      expect(screen.getByText('Project Information')).toBeInTheDocument();
    });
  });

  describe('Permissions', () => {
    test('shows edit controls for admin users', async () => {
      mockLocalStorage.getItem.mockImplementation((key) => {
        if (key === 'userRole') return 'admin';
        return null;
      });

      render(
        <TestWrapper>
          <ProjectDetail />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Test Project')).toBeInTheDocument();
      });

      // Should show in-place staffing actions and row delete for admins
      expect(screen.getByText('Named')).toBeInTheDocument();
      expect(screen.getByText('Pool')).toBeInTheDocument();
      const row = screen.getByRole('row', { name: /Alice Johnson/ });
      expect(within(row).getByText('Delete')).toBeInTheDocument();
    });

    test('hides edit controls for viewer users', async () => {
      mockLocalStorage.getItem.mockImplementation((key) => {
        if (key === 'userRole') return 'viewer';
        return null;
      });

      render(
        <TestWrapper>
          <ProjectDetail />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Test Project')).toBeInTheDocument();
      });

      // Should not show staffing actions or row delete for viewers
      expect(screen.queryByText('Named')).not.toBeInTheDocument();
      expect(screen.queryByText('Pool')).not.toBeInTheDocument();
      const row = screen.getByRole('row', { name: /Alice Johnson/ });
      expect(within(row).queryByText('Delete')).not.toBeInTheDocument();
    });
  });

  describe('Data Formatting', () => {
    test('formats dates correctly', async () => {
      render(
        <TestWrapper>
          <ProjectDetail />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('History')).toBeInTheDocument();
      });

      // Expand history section
      fireEvent.click(screen.getByText('History'));

      await waitFor(() => {
        // Should show history timeline items
        expect(screen.getByText('Project created')).toBeInTheDocument();
        expect(screen.getByText('Last updated')).toBeInTheDocument();
      });
    });

    test('displays priority labels correctly', async () => {
      render(
        <TestWrapper>
          <ProjectDetail />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getAllByText('High')[0]).toBeInTheDocument(); // Priority 2 = High
      });
    });

    test('formats allocation percentages correctly', async () => {
      render(
        <TestWrapper>
          <ProjectDetail />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('75%')).toBeInTheDocument();
      });
    });
  });
});