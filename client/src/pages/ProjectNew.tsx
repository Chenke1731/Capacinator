import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation, Trans } from 'react-i18next';
import { ArrowLeft, Save, X } from 'lucide-react';
import { api } from '../lib/api-client';
import { queryKeys } from '../lib/queryKeys';
import './PersonDetails.css'; // Reuse existing styles

interface ProjectFormData {
  name: string;
  project_type_id: string;
  location_id: string;
  priority: number;
  description: string;
  data_restrictions: string;
  include_in_demand: boolean;
  external_id: string;
  owner_id: string;
}

export function ProjectNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  
  const [formData, setFormData] = useState<ProjectFormData>({
    name: '',
    project_type_id: '',
    location_id: '',
    priority: 3,
    description: '',
    data_restrictions: '',
    include_in_demand: true,
    external_id: '',
    owner_id: ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch project types for dropdown
  const { data: projectTypes } = useQuery({
    queryKey: queryKeys.projectTypes.list(),
    queryFn: async () => {
      const response = await api.projectTypes.list();
      const payload = response.data;
      return Array.isArray(payload) ? payload : payload?.data || [];
    }
  });

  // Fetch locations for dropdown
  const { data: locations } = useQuery({
    queryKey: queryKeys.locations.list(),
    queryFn: async () => {
      const response = await api.locations.list();
      const payload = response.data;
      return Array.isArray(payload) ? payload : payload?.data || [];
    }
  });

  // Fetch people for owner dropdown
  const { data: people } = useQuery({
    queryKey: queryKeys.people.list(),
    queryFn: async () => {
      const response = await api.people.list();
      return response.data.data;
    }
  });


  // Create project mutation
  const createProjectMutation = useMutation({
    mutationFn: async (data: ProjectFormData) => {
      const response = await api.projects.create({
        ...data,
        include_in_demand: data.include_in_demand ? 1 : 0,
        owner_id: data.owner_id || null,
        external_id: data.external_id || null,
        description: data.description || null,
        data_restrictions: data.data_restrictions || null
      });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      navigate(`/projects/${data.id}`);
    },
    onError: (error: any) => {
      if (error.response?.data?.errors) {
        setErrors(error.response.data.errors);
      }
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = t('projects:validation.nameRequired');
    if (!formData.project_type_id) newErrors.project_type_id = t('projects:validation.typeRequired');

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    createProjectMutation.mutate(formData);
  };

  const handleCancel = () => {
    navigate('/projects');
  };

  const handleChange = (field: keyof ProjectFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };


  // Filtered data based on selections
  const filteredProjectTypes = useMemo(() => {
    if (!projectTypes) return [];
    
    // Filter project types based on selected location
    if (formData.location_id) {
      return projectTypes.filter((type: any) => {
        // Check if this project type is available at the selected location
        return type.available_locations?.includes(formData.location_id) || 
               !type.available_locations; // Include types with no location restrictions
      });
    }
    
    return projectTypes;
  }, [projectTypes, formData.location_id]);

  const filteredOwners = useMemo(() => {
    if (!people) return [];
    
    let filtered = people;
    
    // Filter owners based on selected location (prefer same location)
    if (formData.location_id) {
      const sameLocationOwners = people.filter((person: any) => 
        person.location_id === formData.location_id
      );
      
      // If we have people in the same location, prefer them
      if (sameLocationOwners.length > 0) {
        filtered = sameLocationOwners;
      }
    }
    
    // Further filter by project type expertise if project type is selected
    if (formData.project_type_id) {
      filtered = filtered.filter((person: any) => {
        // Check if person has roles suitable for this project type
        return person.roles?.some((role: any) => 
          role.suitable_project_types?.includes(formData.project_type_id) ||
          role.role_name?.toLowerCase().includes('manager') ||
          role.role_name?.toLowerCase().includes('lead')
        ) || !person.roles; // Include people with no specific role restrictions
      });
    }
    
    // Only show people who can be project owners (managers, leads, seniors)
    return filtered.filter((person: any) => 
      person.can_own_projects === true ||
      person.roles?.some((role: any) => 
        role.role_name?.toLowerCase().includes('manager') ||
        role.role_name?.toLowerCase().includes('lead') ||
        role.role_name?.toLowerCase().includes('senior')
      )
    );
  }, [people, formData.location_id, formData.project_type_id]);

  return (
    <div className="page-container person-details">
      <div className="page-header">
        <div className="header-left">
          <button
            className="btn page-back-btn"
            onClick={handleCancel}
            title={t('common:back')}
            aria-label={t('common:back')}
          >
            <ArrowLeft size={22} />
          </button>
          <h1>{t('projects:newProject')}</h1>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={handleCancel}>
            <X size={20} />
            {t('common:cancel')}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={createProjectMutation.isPending}
          >
            <Save size={20} />
            {createProjectMutation.isPending ? t('projects:creating') : t('projects:createProject')}
          </button>
        </div>
      </div>

      <div className="person-details-content">
        <form onSubmit={handleSubmit}>
          {/* Basic Information Section */}
          <div className="detail-section">
            <div className="section-header">
              <h2>{t('projects:projectInformation')}</h2>
            </div>

            <div className="section-content">
              <div className="info-grid">
                <div className="info-item">
                  <label>{t('projects:projectName')} *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    className={`form-input ${errors.name ? 'error' : ''}`}
                    placeholder={t('projects:placeholder.enterName')}
                  />
                  {errors.name && <span className="error-text">{errors.name}</span>}
                </div>

                <div className="info-item">
                  <label>{t('projects:projectType')} *</label>
                  <select
                    name="project_type_id"
                    value={formData.project_type_id}
                    onChange={(e) => handleChange('project_type_id', e.target.value)}
                    className={`form-select ${errors.project_type_id ? 'error' : ''}`}
                  >
                    <option value="">{t('projects:placeholder.selectProjectType')}</option>
                    {filteredProjectTypes?.map((type: any) => (
                      <option key={type.id} value={type.id}>{type.name}</option>
                    ))}
                  </select>
                  {errors.project_type_id && <span className="error-text">{errors.project_type_id}</span>}
                  {formData.location_id && filteredProjectTypes.length === 0 && (
                    <span className="warning-text">{t('projects:noTypesForLocation')}</span>
                  )}
                </div>

                <div className="info-item">
                  <label>{t('projects:location')} *</label>
                  <select
                    name="location_id"
                    value={formData.location_id}
                    onChange={(e) => handleChange('location_id', e.target.value)}
                    className={`form-select ${errors.location_id ? 'error' : ''}`}
                  >
                    <option value="">{t('projects:placeholder.selectLocation')}</option>
                    {locations?.map((loc: any) => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                  {errors.location_id && <span className="error-text">{errors.location_id}</span>}
                </div>

                <div className="info-item">
                  <label>{t('projects:priority')}</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => handleChange('priority', parseInt(e.target.value, 10))}
                    className="form-select"
                  >
                    <option value={1}>{t('projects:priorityLevel.critical')}</option>
                    <option value={2}>{t('projects:priorityLevel.high')}</option>
                    <option value={3}>{t('projects:priorityLevel.medium')}</option>
                    <option value={4}>{t('projects:priorityLevel.low')}</option>
                  </select>
                </div>

                <div className="info-item">
                  <label>{t('projects:owner')}</label>
                  <select
                    name="owner_id"
                    value={formData.owner_id}
                    onChange={(e) => handleChange('owner_id', e.target.value)}
                    className="form-select"
                  >
                    <option value="">{t('projects:noOwner')}</option>
                    {filteredOwners?.map((person: any) => (
                      <option key={person.id} value={person.id}>
                        {person.name} {person.location_id === formData.location_id ? t('projects:sameLocation') : ''}
                      </option>
                    ))}
                  </select>
                  {(formData.location_id || formData.project_type_id) && filteredOwners.length === 0 && (
                    <span className="info-text">{t('projects:noSuitableOwners')}</span>
                  )}
                </div>

                <div className="info-item">
                  <label>{t('projects:externalId')}</label>
                  <input
                    type="text"
                    value={formData.external_id}
                    onChange={(e) => handleChange('external_id', e.target.value)}
                    className="form-input"
                    placeholder={t('projects:placeholder.externalReferenceId')}
                  />
                </div>

                <div className="info-item">
                  <label>{t('projects:includeInDemand')}</label>
                  <input
                    type="checkbox"
                    checked={formData.include_in_demand}
                    onChange={(e) => handleChange('include_in_demand', e.target.checked)}
                    className="form-checkbox"
                  />
                </div>

                <div className="info-item info-item-full">
                  <label>{t('common:description')}</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleChange('description', e.target.value)}
                    className="form-textarea"
                    rows={3}
                    placeholder={t('projects:placeholder.projectDescription')}
                  />
                </div>

                <div className="info-item info-item-full">
                  <label>{t('projects:dataRestrictions')}</label>
                  <textarea
                    value={formData.data_restrictions}
                    onChange={(e) => handleChange('data_restrictions', e.target.value)}
                    className="form-textarea"
                    rows={2}
                    placeholder={t('projects:placeholder.dataRestrictionsHint')}
                  />
                </div>
              </div>

              {/* Project Preview */}
              {formData.name && formData.location_id && formData.project_type_id && (
                <div className="project-preview">
                  <h4>{t('projects:preview.title')}</h4>
                  <p>
                    <Trans
                      i18nKey="projects:preview.sentence"
                      t={t}
                      values={{
                        name: formData.name,
                        type: projectTypes?.find((t: any) => t.id === formData.project_type_id)?.name,
                        location: locations?.find((l: any) => l.id === formData.location_id)?.name
                      }}
                      components={{ strong: <strong /> }}
                    />
                    {formData.owner_id && (
                      <Trans
                        i18nKey="projects:preview.ownerSuffix"
                        t={t}
                        values={{ owner: people?.find((p: any) => p.id === formData.owner_id)?.name }}
                        components={{ strong: <strong /> }}
                      />
                    )}
                  </p>
                </div>
              )}

              {/* Filtering Information */}
              {(formData.location_id || formData.project_type_id) && (
                <div className="filtering-info">
                  <h4>{t('projects:activeFilters')}</h4>
                  <ul>
                    {formData.location_id && (
                      <li>{t('projects:filterInfo.typesByLocation')} <strong>{locations?.find((l: any) => l.id === formData.location_id)?.name}</strong></li>
                    )}
                    {formData.location_id && (
                      <li>{t('projects:filterInfo.ownersByLocation')} <strong>{locations?.find((l: any) => l.id === formData.location_id)?.name}</strong></li>
                    )}
                    {formData.project_type_id && (
                      <li>{t('projects:filterInfo.ownersByExpertise')} <strong>{projectTypes?.find((t: any) => t.id === formData.project_type_id)?.name}</strong></li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Error display */}
          {createProjectMutation.isError && (
            <div className="error-message">
              {t('projects:createFailed')}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}