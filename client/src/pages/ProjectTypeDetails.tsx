import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Edit2 } from 'lucide-react';
import { api } from '../lib/api-client';
import { queryKeys } from '../lib/queryKeys';
import type { ProjectType, Role, ProjectPhase } from '../types';
import PhaseTemplateDesigner from '../components/PhaseTemplateDesigner';
import ProjectsTable from '../components/ProjectsTable';
import '../components/PhaseTemplateDesigner.css';
import './ProjectTypeDetails.css';

interface ResourceTemplate {
  id?: string;
  role_id: string;
  project_type_id: string;
  phase_id: string;
  allocation_percentage: number;
}

export default function ProjectTypeDetails() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [localTemplates, setLocalTemplates] = useState<ResourceTemplate[]>([]);

  // Fetch project type details
  const { data: projectType, isLoading: projectTypeLoading, error: projectTypeError } = useQuery({
    queryKey: queryKeys.projectTypes.detail(id!),
    queryFn: async () => {
      if (!id) throw new Error('Project Type ID is required');
      const response = await api.projectTypes.get(id);
      return response.data as ProjectType;
    },
    enabled: !!id,
    retry: false, // Don't retry on 404
    refetchOnWindowFocus: false // Don't refetch when window gains focus
  });

  // Fetch roles for resource templates
  const { data: roles } = useQuery({
    queryKey: queryKeys.roles.list(),
    queryFn: async () => {
      const response = await api.roles.list();
      const payload = response.data as any;
      // Shared ['roles'] cache must always hold an array — raw envelopes here
      // have crashed other consumers (roles?.find is not a function)
      return Array.isArray(payload) ? payload : payload?.data || [];
    }
  });

  // Fetch phases for resource templates
  const { data: phases } = useQuery({
    queryKey: queryKeys.phases.list(),
    queryFn: async () => {
      const response = await api.phases.list();
      // Handle the case where the response might be wrapped in a data property
      const phasesArray = response.data?.data || response.data;

      if (!Array.isArray(phasesArray)) {
        console.error('Phases response is not an array:', phasesArray);
        return [];
      }

      const sortedPhases = (phasesArray as ProjectPhase[]).sort((a, b) => a.order_index - b.order_index);
      return sortedPhases;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1
  });

  // Fetch resource templates for this project type
  const { data: resourceTemplates, isLoading: resourceTemplatesLoading } = useQuery({
    queryKey: queryKeys.resourceTemplates.byProjectType(id!),
    queryFn: async () => {
      if (!id) return [];
      const response = await api.resourceTemplates.list({ project_type_id: id });
      return response.data as ResourceTemplate[];
    },
    enabled: !!id && !!projectType && !projectTypeError
  });


  // Fetch project type phases (including inherited)
  const { data: projectTypePhases } = useQuery({
    queryKey: queryKeys.projectTypes.phases(id!),
    queryFn: async () => {
      if (!id) return [];
      const response = await api.projectTypes.getPhases(id);
      return response.data.data as ProjectPhase[];
    },
    enabled: !!id && !!projectType && !projectTypeError
  });

  // Fetch projects of this type
  const { data: projectsOfType } = useQuery({
    queryKey: queryKeys.projectTypes.projects(id!),
    queryFn: async () => {
      if (!id) return [];
      const response = await api.projects.list({
        project_type_id: id,
        limit: 15
      });
      return response.data.data;
    },
    enabled: !!id && !!projectType && !projectTypeError
  });

  // Update local templates when resource templates data changes
  React.useEffect(() => {
    if (resourceTemplates) {
      // Filter out templates with 0 or null allocation percentages
      const filteredTemplates = resourceTemplates.filter(
        template => template.allocation_percentage != null && template.allocation_percentage > 0
      );
      setLocalTemplates(filteredTemplates);
    }
  }, [resourceTemplates]);

  // Individual field update mutations
  const updateProjectTypeFieldMutation = useMutation({
    mutationFn: async ({ field, value }: { field: string; value: any }) => {
      if (!id) throw new Error('Project Type ID is required');
      return api.projectTypes.update(id, { [field]: value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectTypes.detail(id!) });
    }
  });


  // Handle individual field updates
  const handleFieldUpdate = (field: string, value: any) => {
    updateProjectTypeFieldMutation.mutate({ field, value });
  };

  // Inline editing component
  const InlineEdit = ({ 
    field, 
    value, 
    type = 'text', 
    placeholder = ''
  }: {
    field: string;
    value: any;
    type?: 'text' | 'textarea' | 'color';
    placeholder?: string;
  }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(value);

    const handleSave = () => {
      if (editValue !== value) {
        handleFieldUpdate(field, editValue);
      }
      setIsEditing(false);
    };

    const handleCancel = () => {
      setEditValue(value);
      setIsEditing(false);
    };

    if (isEditing) {
      return (
        <div className="inline-edit-container">
          {type === 'textarea' ? (
            <textarea
              value={editValue || ''}
              onChange={(e) => setEditValue(e.target.value)}
              className="form-input"
              onBlur={handleSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey) handleSave();
                if (e.key === 'Escape') handleCancel();
              }}
              placeholder={placeholder}
              rows={3}
              autoFocus
            />
          ) : type === 'color' ? (
            <input
              type="color"
              value={editValue || '#6b7280'}
              onChange={(e) => setEditValue(e.target.value)}
              className="form-input"
              onBlur={handleSave}
              autoFocus
            />
          ) : (
            <input
              type={type}
              value={editValue || ''}
              onChange={(e) => setEditValue(e.target.value)}
              className="form-input"
              onBlur={handleSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') handleCancel();
              }}
              placeholder={placeholder}
              autoFocus
            />
          )}
        </div>
      );
    }

    const displayValue = value || placeholder || t('projects:projectTypes.notSpecified');

    return (
      <div className="info-value inline-editable" onClick={() => setIsEditing(true)} style={{ cursor: 'pointer' }}>
        {type === 'color' && value && (
          <div 
            style={{ 
              width: '20px', 
              height: '20px', 
              backgroundColor: value, 
              borderRadius: '4px',
              marginRight: '8px',
              border: '1px solid #ddd'
            }} 
          />
        )}
        <span>{displayValue}</span>
        <Edit2 size={14} className="edit-icon" style={{ marginLeft: '8px', opacity: 0.5 }} />
      </div>
    );
  };


  // Handler for allocation changes
  const handleAllocationChange = (roleId: string, phaseId: string, newValue: number) => {
    setLocalTemplates(prev => {
      const updated = [...prev];
      const existingIndex = updated.findIndex(
        t => t.role_id === String(roleId) && t.phase_id === String(phaseId)
      );
      
      if (newValue === 0 || !newValue) {
        // Remove template if value is 0 or falsy
        if (existingIndex >= 0) {
          updated.splice(existingIndex, 1);
        }
      } else {
        if (existingIndex >= 0) {
          // Update existing template
          updated[existingIndex] = {
            ...updated[existingIndex],
            allocation_percentage: newValue
          };
        } else {
          // Create new template
          updated.push({
            role_id: roleId,
            project_type_id: id!,
            phase_id: phaseId,
            allocation_percentage: newValue
          });
        }
      }
      
      return updated;
    });
  };

  if (projectTypeLoading) {
    return <div className="loading">{t('projects:projectTypes.loadingDetails')}</div>;
  }

  if (projectTypeError || !projectType) {
    return (
      <div className="error-page">
        <h1>{t('projects:projectTypes.notFoundTitle')}</h1>
        <p>{t('projects:projectTypes.notFoundDetail')}</p>
        <button className="btn btn-primary" onClick={() => navigate('/projects?tab=types')}>
          {t('projects:projectTypes.backToProjectTypes')}
        </button>
      </div>
    );
  }

  return (
    <div className="role-details-page">
      {/* Navigation Header */}
      <div className="navigation-header">
        <button
          className="btn page-back-btn"
          onClick={() => navigate('/projects?tab=types')}
          title={t('projects:projectTypes.backToProjectTypes')}
          aria-label={t('projects:projectTypes.backToProjectTypes')}
        >
          <ArrowLeft size={22} />
        </button>
      </div>

      {/* Project Type Header */}
      <div className="project-type-header">
        <div className="header-main">
          <div className="header-content">
            <div className="title-section">
              <div className="title-with-color">
                <h1 className="project-type-title">
                  <InlineEdit
                    field="name"
                    value={projectType.name}
                    placeholder={t('projects:projectTypes.placeholderName')}
                  />
                </h1>
                <div className="color-indicator">
                  <InlineEdit
                    field="color_code"
                    value={projectType.color_code}
                    type="color"
                    placeholder="#6b7280"
                  />
                </div>
              </div>
              <div className="description-section">
                <InlineEdit
                  field="description"
                  value={projectType.description}
                  type="textarea"
                  placeholder={t('projects:projectTypes.placeholderDescription')}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="role-content">



        {/* Parent Type Information Section */}
        {projectType.parent_id && (
          <section className="parent-info-section">
            <div className="section-header">
              <h2>{t('projects:projectTypes.parentProjectType')}</h2>
              <p className="text-muted">
                {t('projects:projectTypes.parentInfoDescription')}
              </p>
            </div>
            <div className="parent-info-card">
              <p>{t('projects:projectTypes.parentLabel')} <strong>{projectType.parent_name || t('projects:projectTypes.unknown')}</strong></p>
              <p>{t('projects:projectTypes.inheritedPhasesLabel')} {projectTypePhases?.length || 0}</p>
              <p>{t('projects:projectTypes.inheritanceNote')}</p>
            </div>
          </section>
        )}

        {/* Phase Template Designer Section */}
        {!projectType.parent_id && (
          <section className="phase-template-section">
            <PhaseTemplateDesigner 
              projectTypeId={id!} 
              phases={phases || []} 
            />
          </section>
        )}

        {/* Projects of this Type Section */}
        <section className="role-info-section">
          <div className="section-header">
            <h2>{t('projects:projectTypes.projectsOfType', { count: projectsOfType?.length || 0 })}</h2>
            <p className="text-muted">
              {t('projects:projectTypes.projectsOfTypeDescription')}
            </p>
          </div>
          <ProjectsTable projects={projectsOfType || []} maxRows={10} />
        </section>

        {/* Resource Templates Section */}
        <section className="resource-templates-section">
          <div className="section-header">
            <h2>{t('projects:projectTypes.roleAllocations')}</h2>
            <p className="text-muted">
              {projectType.parent_id
                ? projectType.is_default
                  ? t('projects:projectTypes.allocationsDefaultDescription')
                  : t('projects:projectTypes.allocationsInheritedDescription')
                : t('projects:projectTypes.allocationsDescription')
              }
            </p>
            {projectType.is_default && (
              <div className="read-only-warning">
                <strong>⚠️ {t('projects:projectTypes.readOnlyTitle')}:</strong> {t('projects:projectTypes.readOnlyDetail')}
              </div>
            )}
          </div>

          {roles && phases && Array.isArray(phases) && !resourceTemplatesLoading && resourceTemplates !== undefined ? (() => {
            // Create ordered phases array based on project type phases order
            const orderedPhases = projectTypePhases && Array.isArray(projectTypePhases) 
              ? projectTypePhases
                  .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
                  .map(ptp => phases.find(p => p.id === ptp.phase_id))
                  .filter(Boolean)
              : Array.isArray(phases) ? phases : [];
            
            return (
            <div className="templates-grid">
              {projectType.parent_id && (
                <div className="inheritance-legend">
                  <span className="legend-item">
                    <span className="legend-color inherited"></span>
                    <span>{t('projects:projectTypes.inheritedFromParent')}</span>
                  </span>
                  <span className="legend-item">
                    <span className="legend-color custom"></span>
                    <span>{t('projects:projectTypes.customAllocation')}</span>
                  </span>
                </div>
              )}
              <table className="resource-templates-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: '200px' }}>{t('common:role')}</th>
                    {Array.isArray(orderedPhases) ? orderedPhases.map(phase => (
                      <th key={phase.id} style={{ minWidth: '120px', textAlign: 'center' }}>
                        {phase.name}
                      </th>
                    )) : null}
                  </tr>
                </thead>
                <tbody>
                  {Array.isArray(roles) ? roles.map(role => (
                    <tr key={role.id}>
                      <td style={{ verticalAlign: 'top', padding: '12px' }}>
                        <div>
                          <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                            {role.name}
                          </div>
                          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                            {role.description}
                          </div>
                        </div>
                      </td>
                      {Array.isArray(orderedPhases) ? orderedPhases.map(phase => {
                        const template = localTemplates.find(
                          t => String(t.role_id) === String(role.id) && 
                               String(t.phase_id) === String(phase.id)
                        );
                        const allocation = template?.allocation_percentage;
                        
                        // Only show template if allocation is greater than 0
                        const shouldShowTemplate = template && allocation && allocation > 0;
                        
                        // For display purposes, only show non-zero allocations
                        const displayValue = (allocation && allocation > 0) ? allocation : '';
                        
                        
                        return (
                          <td key={`${role.id}-${phase.id}`} style={{ textAlign: 'center', padding: '12px' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <input
                                type="number"
                                value={displayValue}
                                min="0"
                                max="100"
                                step="5"
                                placeholder=""
                                style={{
                                  width: '60px',
                                  padding: '6px 8px',
                                  border: (shouldShowTemplate && template?.is_inherited) ? '1px solid #93c5fd' : '1px solid #d1d5db',
                                  borderRadius: '4px',
                                  textAlign: 'center',
                                  fontSize: '0.875rem',
                                  backgroundColor: (shouldShowTemplate && template?.is_inherited) ? '#dbeafe' : 'white'
                                }}
                                onChange={(e) => {
                                  const inputValue = e.target.value;
                                  if (inputValue === '' || inputValue === '0') {
                                    handleAllocationChange(
                                      String(role.id),
                                      String(phase.id),
                                      0
                                    );
                                  } else {
                                    const newValue = parseFloat(inputValue);
                                    if (!isNaN(newValue)) {
                                      handleAllocationChange(
                                        String(role.id),
                                        String(phase.id),
                                        newValue
                                      );
                                    }
                                  }
                                }}
                              />
                              <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>%</span>
                            </div>
                            {(() => {
                              if (shouldShowTemplate && template?.is_inherited) {
                                return (
                                  <div style={{ marginTop: '4px' }}>
                                    <span style={{ 
                                      fontSize: '0.75rem', 
                                      color: '#3b82f6', 
                                      fontWeight: '500',
                                      backgroundColor: '#dbeafe',
                                      padding: '2px 6px',
                                      borderRadius: '8px'
                                    }}>
                                      {t('projects:projectTypes.inherited')}
                                    </span>
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </td>
                        );
                      }) : null}
                    </tr>
                  )) : null}
                </tbody>
              </table>
            </div>
            );
          })() : (
            <div className="empty-state">
              <p>{t('projects:projectTypes.loadingAllocations')}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}