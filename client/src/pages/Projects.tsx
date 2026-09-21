import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Edit2, Trash2, Eye, Calendar, Users, Tag } from 'lucide-react';
import { api } from '../lib/api-client';
import { queryKeys } from '../lib/queryKeys';
import { DataTable, Column } from '../components/ui/DataTable';
import { FilterBar } from '../components/ui/FilterBar';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import ProjectModal from '../components/modals/ProjectModal';
import { LifecycleCellControls } from '../components/lifecycle/LifecycleCellControls';
import { TagManagerDialog } from '../components/tags/TagManagerDialog';
import ProjectAllocations from '../components/ProjectAllocations';
import { useModal } from '../hooks/useModal';
import { useScenario } from '../contexts/ScenarioContext';
import { getProjectTypeIndicatorStyle } from '../lib/project-colors';
import { getLocale } from '../i18n';
import { projectStatusLabel } from '../lib/enum-labels';
import type { Project, ProjectType } from '../types';
import './Projects.css';

export function Projects() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { currentScenario } = useScenario();
  const [filters, setFilters] = useState({
    search: '',
    project_type_id: '',
    status: '',
    tag_id: '',
    lifecycle_state: ''
  });
  
  const addProjectModal = useModal();
  const editProjectModal = useModal();
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const allocationModal = useModal();
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [selectedProjectForAllocations, setSelectedProjectForAllocations] = useState<Project | null>(null);

  // Fetch projects - will refetch when scenario changes
  const { data: projects, isLoading: projectsLoading, error: projectsError } = useQuery({
    queryKey: queryKeys.projects.list(filters, currentScenario?.id),
    queryFn: async () => {
      const params = Object.entries(filters)
        .filter(([_, value]) => value)
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
      const response = await api.projects.list(params);
      const rawProjects = response.data.data;
      
      // Transform flat response to include project_type object
      return rawProjects.map((project: any) => ({
        ...project,
        project_type: project.project_type_name ? {
          id: project.project_type_id,
          name: project.project_type_name,
          color_code: project.project_type_color_code
        } : undefined
      })) as Project[];
    },
    enabled: !!currentScenario
  });

  // Fetch tags for filter
  const { data: tagsData } = useQuery({
    queryKey: queryKeys.tags.list(),
    queryFn: async () => {
      const response = await api.tags.list();
      return response.data;
    }
  });
  const tags = (tagsData?.data as any[]) || [];

  

  // Fetch project types for filter
  const { data: projectTypes } = useQuery({
    queryKey: queryKeys.projectTypes.list(),
    queryFn: async () => {
      const response = await api.projectTypes.list();
      // Handle both wrapped {data: [...]} and direct array [...] responses
      return (response.data?.data || response.data || []) as ProjectType[];
    }
  });

  // Delete project mutation
  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      await api.projects.delete(projectId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    }
  });

  const handleDeleteProject = (projectId: string, projectName: string) => {
    if (confirm(t('projects:deleteConfirmation', { name: projectName }))) {
      deleteProjectMutation.mutate(projectId);
    }
  };

  const handleEditProject = (project: Project) => {
    setEditingProject(project);
    editProjectModal.open();
  };

  const handleManageAllocations = (project: Project) => {
    setSelectedProjectForAllocations(project);
    allocationModal.open();
  };

  const handleProjectSuccess = () => {
    // Both modals will close automatically via onClose
    setEditingProject(null);
  };

  const handleCloseAllocations = () => {
    setSelectedProjectForAllocations(null);
    allocationModal.close();
  };

  const handleFilterChange = (name: string, value: string) => {
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleResetFilters = () => {
    setFilters({
      search: '',
      project_type_id: '',
      status: '',
      tag_id: '',
      lifecycle_state: ''
    });
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'planned': return 'badge badge-primary';
      case 'active': return 'badge badge-success';
      case 'on_hold': return 'badge badge-warning';
      case 'completed': return 'badge badge-secondary';
      case 'cancelled': return 'badge badge-danger';
      default: return 'badge';
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString(getLocale());
  };

  const columns: Column<Project>[] = [
    {
      key: 'name',
      header: t('projects:projectName'),
      sortable: true,
      render: (value, row) => (
        <div className="project-name">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={getProjectTypeIndicatorStyle(row)} />
            <span>{value}</span>
          </div>
          {row.tags && row.tags.length > 0 && (
            <div className="project-tag-badges" style={{ display: 'flex', gap: '0.25rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
              {row.tags.map((tag: any) => (
                <span
                  key={tag.id}
                  className="tag-badge"
                  style={{ backgroundColor: tag.color || 'var(--text-tertiary)' }}
                >
                  {tag.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )
    },
    {
      key: 'project_type.name',
      header: t('projects:projectType'),
      sortable: true,
      render: (value, row) => (
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={getProjectTypeIndicatorStyle(row)} />
          <span>{row.project_type?.name || t('projects:notAssigned')}</span>
        </div>
      )
    },
    {
      key: 'start_date',
      header: t('common:startDate'),
      sortable: true,
      render: formatDate
    },
    {
      key: 'end_date',
      header: t('common:endDate'),
      sortable: true,
      render: formatDate
    },
    {
      key: 'lifecycle_state',
      header: t('projects:lifecycleColumn'),
      width: '170px',
      render: (value: string | null, row: any) =>
        value ? <LifecycleCellControls project={row} /> : <span className="text-muted">—</span>
    },
    {
      key: 'actions',
      header: t('common:actions'),
      width: '390px',
      render: (_, row) => (
        <div className="table-actions">
          <button
            className="btn table-action-btn"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/projects/${row.id}`);
            }}
            title={t('common:viewDetails')}
          >
            <Eye size={14} />
            {t('common:viewDetails')}
          </button>
          <button
            className="btn table-action-btn"
            onClick={(e) => {
              e.stopPropagation();
              handleEditProject(row);
            }}
            title={t('common:edit')}
          >
            <Edit2 size={14} />
            {t('common:edit')}
          </button>
          <button
            className="btn table-action-btn"
            onClick={(e) => {
              e.stopPropagation();
              handleManageAllocations(row);
            }}
            title={t('projects:manageAllocations')}
          >
            <Users size={14} />
            {t('projects:manageAllocations')}
          </button>
          <button
            className="btn table-action-btn btn-danger"
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteProject(row.id, row.name);
            }}
            title={t('common:delete')}
          >
            <Trash2 size={14} />
            {t('common:delete')}
          </button>
        </div>
      )
    }
  ];

  const filterConfig = [
    {
      name: 'search',
      label: t('common:search'),
      type: 'search' as const,
      placeholder: t('projects:searchPlaceholder')
    },
    {
      name: 'project_type_id',
      label: t('projects:projectType'),
      type: 'select' as const,
      options: projectTypes?.map(type => ({ 
        value: type.id, 
        label: type.name,
        color: type.color_code
      })) || []
    },
    {
      name: 'status',
      label: t('common:status'),
      type: 'select' as const,
      options: [
        { value: 'planned', label: projectStatusLabel('planned') },
        { value: 'active', label: projectStatusLabel('active') },
        { value: 'on_hold', label: projectStatusLabel('on_hold') },
        { value: 'completed', label: projectStatusLabel('completed') },
        { value: 'cancelled', label: projectStatusLabel('cancelled') }
      ]
    },
    {
      name: 'lifecycle_state',
      label: t('projects:lifecycle.filterLabel'),
      type: 'select' as const,
      options: [
        { value: 'none', label: t('projects:lifecycle.standingOption') },
        ...['pending_rat', 'nok', 'designing', 'backlog', 'scheduled', 'in_iteration', 'delivered', 'cancelled'].map(
          (s) => ({ value: s, label: t(`projects:lifecycle.state.${s}`) })
        )
      ]
    },
    {
      name: 'tag_id',
      label: t('projects:tags.filterLabel'),
      type: 'select' as const,
      options: tags?.map((tag: any) => ({ value: String(tag.id), label: tag.name })) || []
    }
  ];

  if (projectsLoading) {
    return <LoadingSpinner />;
  }

  if (projectsError) {
    return <ErrorMessage message={t('projects:loadFailed')} details={projectsError.message} />;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>{t('projects:title')}</h1>
          <p className="text-muted">{t('projects:subtitle')}</p>
        </div>
        <div className="header-actions">
          <button
            className="btn btn-outline"
            onClick={() => setTagManagerOpen(true)}
          >
            <Tag size={16} />
            {t('projects:tags.manageButton')}
          </button>
          <button
            className="btn btn-primary"
            onClick={addProjectModal.open}
          >
            <Plus size={16} />
            {t('projects:newProject')}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => navigate('/projects/demands')}
          >
            <Calendar size={16} />
            {t('projects:viewDemands')}
          </button>
        </div>
      </div>

      <FilterBar
        filters={filterConfig}
        values={filters}
        onChange={handleFilterChange}
        onReset={handleResetFilters}
      />

      <DataTable
        data={projects || []}
        columns={columns}
        onRowClick={(row) => navigate(`/projects/${row.id}`)}
        itemsPerPage={20}
      />

      {/* Add Project Modal */}
      <ProjectModal
        isOpen={addProjectModal.isOpen}
        onClose={addProjectModal.close}
        onSuccess={handleProjectSuccess}
      />

      {/* Edit Project Modal */}
      <ProjectModal
        isOpen={editProjectModal.isOpen}
        onClose={() => {
          editProjectModal.close();
          setEditingProject(null);
        }}
        onSuccess={handleProjectSuccess}
        editingProject={editingProject}
      />

      {/* Tag Management Dialog */}
      <TagManagerDialog isOpen={tagManagerOpen} onClose={() => setTagManagerOpen(false)} />

      {/* Project Allocations Modal */}
      {allocationModal.isOpen && selectedProjectForAllocations && (
        <div className="modal-overlay">
          <div className="modal-container large">
            <ProjectAllocations
              projectId={selectedProjectForAllocations.id}
              projectName={selectedProjectForAllocations.name}
              onClose={handleCloseAllocations}
            />
          </div>
        </div>
      )}
    </div>
  );
}