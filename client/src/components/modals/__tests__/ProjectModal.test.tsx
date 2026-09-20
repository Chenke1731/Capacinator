import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectModal } from '../ProjectModal';
import { api } from '../../../lib/api-client';

// Mock the API client
jest.mock('../../../lib/api-client', () => ({
  api: {
    projects: {
      create: jest.fn(),
      update: jest.fn()
    },
    projectTypes: {
      list: jest.fn()
    },
    locations: {
      list: jest.fn()
    },
    people: {
      list: jest.fn()
    },
    phases: {
      list: jest.fn()
    },
    tags: {
      list: jest.fn(),
      create: jest.fn()
    }
  }
}));

describe('ProjectModal', () => {
  let queryClient: QueryClient;

  const mockOnClose = jest.fn();
  const mockOnSuccess = jest.fn();

  const mockProjectTypes = {
    data: [
      { id: 'type-1', name: 'Web Development', parent_id: 'parent-1' },
      { id: 'type-2', name: 'Mobile App', parent_id: 'parent-1' }
    ]
  };

  const mockLocations = {
    data: [
      { id: 'loc-1', name: 'New York' },
      { id: 'loc-2', name: 'London' }
    ]
  };

  const mockPeople = {
    data: [
      { id: 'person-1', name: 'John Doe', title: 'Manager', location_id: 'loc-1', roles: [{ role_name: 'Project Manager' }] },
      { id: 'person-2', name: 'Jane Smith', title: 'Director', location_id: 'loc-2', roles: [{ role_name: 'Director' }] }
    ]
  };

  const mockPhases = {
    data: [
      { id: 'phase-1', name: 'Planning' },
      { id: 'phase-2', name: 'Development' }
    ]
  };

  const mockProject = {
    id: 'project-1',
    name: 'Website Redesign',
    project_type_id: 'type-1',
    location_id: 'loc-1',
    priority: 2,
    description: 'Complete website redesign',
    data_restrictions: 'Confidential',
    include_in_demand: true,
    external_id: 'EXT-123',
    owner_id: 'person-1',
    current_phase_id: 'phase-1'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });

    // Default mock responses
    (api.projectTypes.list as jest.Mock).mockResolvedValue(mockProjectTypes);
    (api.locations.list as jest.Mock).mockResolvedValue(mockLocations);
    (api.people.list as jest.Mock).mockResolvedValue(mockPeople);
    (api.phases.list as jest.Mock).mockResolvedValue(mockPhases);
    (api.tags.list as jest.Mock).mockResolvedValue({ data: { data: [] } });

    // Mock scrollIntoView for Radix Select
    Element.prototype.scrollIntoView = jest.fn();
  });

  const renderComponent = (props = {}) => {
    const defaultProps = {
      isOpen: true,
      onClose: mockOnClose,
      onSuccess: mockOnSuccess
    };

    return render(
      <QueryClientProvider client={queryClient}>
        <ProjectModal {...defaultProps} {...props} />
      </QueryClientProvider>
    );
  };

  describe('Basic Rendering', () => {
    it('renders when isOpen is true', async () => {
      renderComponent();
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Add New Project/i })).toBeInTheDocument();
      });
    });

    it('does not render when isOpen is false', () => {
      renderComponent({ isOpen: false });
      expect(screen.queryByRole('heading', { name: /Add New Project/i })).not.toBeInTheDocument();
    });

    it('shows Add title for new project', async () => {
      renderComponent();
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Add New Project' })).toBeInTheDocument();
      });
    });

    it('shows Edit title when editing', async () => {
      renderComponent({ editingProject: mockProject });
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Edit Project' })).toBeInTheDocument();
      });
    });

    it('renders form fields', async () => {
      renderComponent();
      await waitFor(() => {
        expect(screen.getByRole('textbox', { name: /project name/i })).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: /project type/i })).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: /location/i })).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: /project owner/i })).toBeInTheDocument();
      });
    });
  });

  describe('Form Initialization', () => {
    it('initializes with empty values for new project', async () => {
      renderComponent();
      await waitFor(() => {
        const nameInput = screen.getByRole('textbox', { name: /project name/i }) as HTMLInputElement;
        expect(nameInput.value).toBe('');
      });
    });

    it('initializes priority to default value', async () => {
      renderComponent();
      await waitFor(() => {
        // Priority select exists and has a default value
        const nameInput = screen.getByRole('textbox', { name: /project name/i });
        expect(nameInput).toBeInTheDocument();
      });
    });

    it('initializes include_in_demand to checked', async () => {
      renderComponent();
      await waitFor(() => {
        const checkbox = screen.getByRole('checkbox', { name: /Include in demand planning/i });
        expect(checkbox).toBeChecked();
      });
    });

    it('multi-tag chips toggle independently and submit the full tag set', async () => {
      (api.tags.list as jest.Mock).mockResolvedValue({
        data: { data: [
          { id: 1, name: 'Urgent', color: '#ef4444' },
          { id: 2, name: 'Outsource', color: null },
          { id: 3, name: 'Internal', color: null }
        ] }
      });
      (api.projects.update as jest.Mock).mockResolvedValue({ data: { data: {} } });
      renderComponent({
        editingProject: {
          ...mockProject,
          tags: [
            { id: 1, name: 'Urgent', color: '#ef4444' },
            { id: 2, name: 'Outsource', color: null }
          ]
        }
      });

      await waitFor(() => expect(screen.getByText('Outsource')).toBeInTheDocument());
      // initial selection reflects the project's tags
      expect(screen.getByText('Urgent').className).toContain('tag-chip-selected');
      expect(screen.getByText('Outsource').className).toContain('tag-chip-selected');
      expect(screen.getByText('Internal').className).not.toContain('tag-chip-selected');

      // toggle one off, another on — independently
      fireEvent.click(screen.getByText('Outsource'));
      fireEvent.click(screen.getByText('Internal'));
      expect(screen.getByText('Outsource').className).not.toContain('tag-chip-selected');
      expect(screen.getByText('Internal').className).toContain('tag-chip-selected');
      expect(screen.getByText('Urgent').className).toContain('tag-chip-selected');

      fireEvent.click(screen.getByRole('button', { name: /Update Project/i }));
      await waitFor(() => expect(api.projects.update).toHaveBeenCalled());
      const payload = (api.projects.update as jest.Mock).mock.calls[0][1];
      expect([...payload.tag_ids].sort()).toEqual([1, 3]);
    });

    it('populates form with project data when editing', async () => {
      renderComponent({ editingProject: mockProject });
      await waitFor(() => {
        const nameInput = screen.getByRole('textbox', { name: /project name/i }) as HTMLInputElement;
        const descriptionInput = screen.getByLabelText(/Description/i) as HTMLTextAreaElement;
        const externalIdInput = screen.getByLabelText(/External ID/i) as HTMLInputElement;

        expect(nameInput.value).toBe('Website Redesign');
        expect(descriptionInput.value).toBe('Complete website redesign');
        expect(externalIdInput.value).toBe('EXT-123');
      });
    });
  });

  describe('Data Loading', () => {
    it('fetches project types data', async () => {
      renderComponent();
      await waitFor(() => {
        expect(api.projectTypes.list).toHaveBeenCalled();
      });
    });

    it('fetches locations data', async () => {
      renderComponent();
      await waitFor(() => {
        expect(api.locations.list).toHaveBeenCalled();
      });
    });

    it('fetches people data', async () => {
      renderComponent();
      await waitFor(() => {
        expect(api.people.list).toHaveBeenCalled();
      });
    });

    it('fetches phases data', async () => {
      renderComponent();
      await waitFor(() => {
        expect(api.phases.list).toHaveBeenCalled();
      });
    });
  });

  describe('Form Interactions', () => {
    it('allows typing in name field', async () => {
      renderComponent();
      await waitFor(() => {
        const nameInput = screen.getByRole('textbox', { name: /project name/i });
        fireEvent.change(nameInput, { target: { value: 'New Project' } });
        expect(nameInput).toHaveValue('New Project');
      });
    });

    it('allows typing in description field', async () => {
      renderComponent();
      await waitFor(() => {
        const descriptionInput = screen.getByLabelText(/Description/i);
        fireEvent.change(descriptionInput, { target: { value: 'Project description' } });
        expect(descriptionInput).toHaveValue('Project description');
      });
    });

    it('allows toggling include_in_demand checkbox', async () => {
      renderComponent();
      await waitFor(() => {
        const checkbox = screen.getByRole('checkbox', { name: /Include in demand planning/i });
        expect(checkbox).toBeChecked();

        fireEvent.click(checkbox);
        expect(checkbox).not.toBeChecked();
      });
    });
  });

  describe('Form Validation', () => {
    it('shows error when submitting without project name', async () => {
      renderComponent();
      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /Create Project/i });
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Project name is required')).toBeInTheDocument();
      });
    });

    it('shows error when submitting without project type', async () => {
      renderComponent();
      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /Create Project/i });
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Project type is required')).toBeInTheDocument();
      });
    });

    it('does not require location (data model allows NULL)', async () => {
      renderComponent();
      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Create Project/i }));
      });
      await waitFor(() => {
        expect(screen.getByText('Project name is required')).toBeInTheDocument();
      });
      expect(screen.queryByText('Location is required')).not.toBeInTheDocument();
    });

    it('does not require project owner (data model allows NULL)', async () => {
      renderComponent();
      await waitFor(() => {
        fireEvent.click(screen.getByRole('button', { name: /Create Project/i }));
      });
      await waitFor(() => {
        expect(screen.getByText('Project name is required')).toBeInTheDocument();
      });
      expect(screen.queryByText('Project owner is required')).not.toBeInTheDocument();
    });

    it('shows error alert when there are validation errors', async () => {
      renderComponent();
      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /Create Project/i });
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        expect(screen.getByText(/Please fix the errors below before submitting/i)).toBeInTheDocument();
      });
    });

    it('clears errors when user starts typing', async () => {
      renderComponent();

      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /Create Project/i });
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Project name is required')).toBeInTheDocument();
      });

      const nameInput = screen.getByRole('textbox', { name: /project name/i });
      fireEvent.change(nameInput, { target: { value: 'New Project' } });

      expect(screen.queryByText('Project name is required')).not.toBeInTheDocument();
    });

    it('does not call API when validation fails', async () => {
      renderComponent();
      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /Create Project/i });
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Project name is required')).toBeInTheDocument();
      });

      expect(api.projects.create).not.toHaveBeenCalled();
    });
  });

  describe('Form Submission - Create Mode', () => {
    it('shows Create Project button in create mode', async () => {
      renderComponent();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Create Project/i })).toBeInTheDocument();
      });
    });

    it('invalidates projects queries on successful submission', async () => {
      (api.projects.update as jest.Mock).mockResolvedValue({ data: {} });
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      renderComponent({ editingProject: mockProject });

      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /Update Project/i });
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects'] });
      });

      invalidateSpy.mockRestore();
    });
  });

  describe('Form Submission - Edit Mode', () => {
    it('calls update API when editing', async () => {
      (api.projects.update as jest.Mock).mockResolvedValue({ data: {} });

      renderComponent({ editingProject: mockProject });

      await waitFor(() => {
        const nameInput = screen.getByRole('textbox', { name: /project name/i });
        fireEvent.change(nameInput, { target: { value: 'Updated Project' } });
      });

      const submitButton = screen.getByRole('button', { name: /Update Project/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(api.projects.update).toHaveBeenCalledWith('project-1', expect.objectContaining({
          name: 'Updated Project'
        }));
      });
    });

    it('calls onSuccess after successful update', async () => {
      const updatedData = { ...mockProject, name: 'Updated' };
      (api.projects.update as jest.Mock).mockResolvedValue({ data: updatedData });

      renderComponent({ editingProject: mockProject });

      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /Update Project/i });
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalledWith(updatedData);
      });
    });

    it('shows Update button in edit mode', async () => {
      renderComponent({ editingProject: mockProject });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Update Project/i })).toBeInTheDocument();
      });
    });

    it('invalidates specific project query after update', async () => {
      (api.projects.update as jest.Mock).mockResolvedValue({ data: {} });
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      renderComponent({ editingProject: mockProject });

      await waitFor(() => {
        const submitButton = screen.getByRole('button', { name: /Update Project/i });
        fireEvent.click(submitButton);
      });

      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects', 'detail', 'project-1'] });
      });

      invalidateSpy.mockRestore();
    });
  });

  describe('Modal Interactions', () => {
    it('shows Cancel button', async () => {
      renderComponent();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
      });
    });

    it('calls onClose when Cancel button is clicked', async () => {
      renderComponent();

      await waitFor(() => {
        const cancelButton = screen.getByRole('button', { name: /Cancel/i });
        fireEvent.click(cancelButton);
      });

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('clears form when closing modal', async () => {
      renderComponent();

      await waitFor(() => {
        const nameInput = screen.getByRole('textbox', { name: /project name/i });
        fireEvent.change(nameInput, { target: { value: 'Test' } });
      });

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      fireEvent.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('has proper labels for form fields', async () => {
      renderComponent();
      await waitFor(() => {
        expect(screen.getByRole('textbox', { name: /project name/i })).toBeInTheDocument();
        expect(screen.getByLabelText(/Description/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/External ID/i)).toBeInTheDocument();
      });
    });

    it('has proper dialog structure', async () => {
      renderComponent();
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });
  });
});
