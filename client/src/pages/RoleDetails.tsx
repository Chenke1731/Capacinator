import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Edit2 } from 'lucide-react';
import { api } from '../lib/api-client';
import type { Role, ProjectPhase } from '../types';

interface ResourceTemplate {
  id?: string;
  role_id: string;
  project_type_id: string;
  phase_id: string;
  allocation_percentage: number;
}

export default function RoleDetails() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [localTemplates, setLocalTemplates] = useState<ResourceTemplate[]>([]);

  // Fetch role details
  const { data: role, isLoading: roleLoading, error: roleError } = useQuery({
    queryKey: ['role', id],
    queryFn: async () => {
      if (!id) throw new Error('Role ID is required');
      const response = await api.roles.get(id);
      return response.data as Role;
    },
    enabled: !!id
  });

  // Fetch project types for resource templates
  const { data: projectTypes } = useQuery({
    queryKey: ['projectTypes'],
    queryFn: async () => {
      const response = await api.projectTypes.list();
      const typesData = response.data?.data || response.data || [];
      return Array.isArray(typesData) ? typesData : [];
    }
  });

  // Fetch phases for resource templates
  const { data: phases } = useQuery({
    queryKey: ['phases'],
    queryFn: async () => {
      const response = await api.phases.list();
      const phasesData = response.data?.data || response.data || [];
      const phasesArray = Array.isArray(phasesData) ? phasesData : [];
      return phasesArray.sort((a: ProjectPhase, b: ProjectPhase) => a.order_index - b.order_index);
    }
  });

  // Fetch resource templates for this role
  const { data: resourceTemplates } = useQuery({
    queryKey: ['resourceTemplates', id],
    queryFn: async () => {
      if (!id) return [];
      const response = await api.resourceTemplates.list({ role_id: id });
      // Handle nested response structure and ensure we always return an array
      const templatesData = response.data?.data || response.data || [];
      return Array.isArray(templatesData) ? templatesData : [];
    },
    enabled: !!id
  });

  // Update local templates when resource templates data changes
  React.useEffect(() => {
    if (resourceTemplates) {
      setLocalTemplates(resourceTemplates);
    }
  }, [resourceTemplates]);

  // Individual field update mutations
  const updateRoleFieldMutation = useMutation({
    mutationFn: async ({ field, value }: { field: string; value: any }) => {
      if (!id) throw new Error('Role ID is required');
      return api.roles.update(id, { [field]: value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['role', id] });
    }
  });

  // Handle individual field updates
  const handleFieldUpdate = (field: string, value: any) => {
    updateRoleFieldMutation.mutate({ field, value });
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
    type?: 'text' | 'textarea';
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

    const displayValue = value || placeholder || t('roles:details.notSpecified');

    return (
      <div className="info-value inline-editable" onClick={() => setIsEditing(true)} style={{ cursor: 'pointer' }}>
        <span>{displayValue}</span>
        <Edit2 size={14} className="edit-icon" style={{ marginLeft: '8px', opacity: 0.5 }} />
      </div>
    );
  };

  // Create resource template matrix for display
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const templateMatrix = React.useMemo(() => {
    if (!projectTypes || !phases || !localTemplates) return [];
    if (!Array.isArray(projectTypes) || !Array.isArray(phases)) return [];

    return projectTypes.map(projectType => ({
      projectType,
      allocations: phases.map(phase => {
        const template = localTemplates.find(
          t => t.project_type_id === String(projectType.id) && t.phase_id === String(phase.id)
        );
        return {
          phase,
          allocation: template?.allocation_percentage || 0
        };
      })
    }));
  }, [projectTypes, phases, localTemplates]);

  // Handler for allocation changes - FINAL TEST
  const handleAllocationChange = (projectTypeId: string, phaseId: string, newValue: number) => {
    setLocalTemplates(prev => {
      const updated = [...prev];
      const existingIndex = updated.findIndex(
        t => t.project_type_id === String(projectTypeId) && t.phase_id === String(phaseId)
      );
      
      if (existingIndex >= 0) {
        // Update existing template
        updated[existingIndex] = {
          ...updated[existingIndex],
          allocation_percentage: newValue
        };
      } else {
        // Create new template
        updated.push({
          role_id: id!,
          project_type_id: projectTypeId,
          phase_id: phaseId,
          allocation_percentage: newValue
        });
      }
      
      return updated;
    });
  };

  if (roleLoading) {
    return <div className="loading">{t('roles:details.loading')}</div>;
  }

  if (roleError || !role) {
    return (
      <div className="error-page">
        <h1>{t('roles:details.notFoundTitle')}</h1>
        <p>{t('roles:details.notFoundText')}</p>
        <button className="btn btn-primary" onClick={() => navigate('/people?tab=roles')}>
          {t('roles:details.backToRoles')}
        </button>
      </div>
    );
  }

  return (
    <div className="role-details-page">
      <div className="page-header">
        <div className="header-left">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => navigate('/people?tab=roles')}
          >
            <ArrowLeft size={16} />
            {t('roles:details.backToRoles')}
          </button>
          <div>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <InlineEdit
                field="name"
                value={role.name}
                placeholder={t('roles:details.namePlaceholder')}
              />
            </h1>
            <div style={{ marginTop: '8px' }}>
              <InlineEdit
                field="description"
                value={role.description}
                type="textarea"
                placeholder={t('roles:details.descriptionPlaceholder')}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="role-content">
        {/* Role Information Section */}
        <section className="role-info-section">
          <h2>{t('roles:details.infoTitle')}</h2>
          <div className="info-grid">
            <div className="info-item">
              <label>{t('roles:columns.externalId')}</label>
              <InlineEdit
                field="external_id"
                value={role.external_id}
                placeholder={t('roles:details.externalIdPlaceholder')}
              />
            </div>
          </div>
        </section>

        {/* Resource Templates Section */}
        <section className="resource-templates-section">
          <div className="section-header">
            <h2>{t('roles:details.templatesTitle')}</h2>
            <p className="text-muted">
              {t('roles:details.templatesSubtitle')}
            </p>
          </div>

          {projectTypes && phases && localTemplates !== undefined && Array.isArray(projectTypes) && Array.isArray(phases) ? (
            <div className="templates-grid">
              <table className="resource-templates-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: '200px' }}>{t('roles:details.projectType')}</th>
                    {phases.map(phase => (
                      <th key={phase.id} style={{ minWidth: '120px', textAlign: 'center' }}>
                        {phase.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {projectTypes.map(projectType => (
                    <tr key={projectType.id}>
                      <td style={{ verticalAlign: 'top', padding: '12px' }}>
                        <div>
                          <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                            {projectType.name}
                          </div>
                          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                            {projectType.description}
                          </div>
                        </div>
                      </td>
                      {phases.map(phase => {
                        const template = localTemplates.find(
                          t => String(t.project_type_id) === String(projectType.id) && 
                               String(t.phase_id) === String(phase.id)
                        );
                        const allocation = template?.allocation_percentage || 0;
                        
                        return (
                          <td key={`${projectType.id}-${phase.id}`} style={{ textAlign: 'center', padding: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                              <input
                                type="number"
                                value={allocation}
                                min="0"
                                max="100"
                                step="5"
                                style={{
                                  width: '60px',
                                  padding: '6px 8px',
                                  border: '1px solid #d1d5db',
                                  borderRadius: '4px',
                                  textAlign: 'center',
                                  fontSize: '0.875rem'
                                }}
                                onChange={(e) => {
                                  const newValue = parseFloat(e.target.value) || 0;
                                  handleAllocationChange(
                                    String(projectType.id),
                                    String(phase.id),
                                    newValue
                                  );
                                }}
                              />
                              <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>%</span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <p>{t('roles:details.templatesLoading')}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
