import React, { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api-client';
import { queryKeys } from '../../lib/queryKeys';
import { useModalForm } from '../../hooks/useModalForm';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Alert, AlertDescription } from '../ui/alert';
import { Textarea } from '../ui/textarea';
import { Checkbox } from '../ui/checkbox';
import { Spinner } from '../ui/spinner';
import { AlertCircle } from 'lucide-react';
import i18n from '../../i18n';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import type { ProjectType, ProjectPhase } from '../../types';

// Local interface for person with roles (from people API)
interface PersonWithRoles {
  id: string;
  name: string;
  title?: string;
  location_id?: string;
  roles?: Array<{ role_name?: string }>;
}

// Project type for editing
interface EditableProject {
  id: string;
  name?: string;
  project_type_id?: string;
  location_id?: string;
  priority?: number;
  description?: string;
  data_restrictions?: string;
  include_in_demand?: boolean;
  external_id?: string;
  owner_id?: string;
  current_phase_id?: string;
}

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
  current_phase_id: string;
}

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (project: EditableProject) => void;
  editingProject?: EditableProject;
}

const initialValues: ProjectFormData = {
  name: '',
  project_type_id: '',
  location_id: '',
  priority: 3,
  description: '',
  data_restrictions: '',
  include_in_demand: true,
  external_id: '',
  owner_id: '',
  current_phase_id: '',
  tag_ids: []
};

const validateProject = (values: ProjectFormData): Partial<Record<keyof ProjectFormData, string>> => {
  const errors: Partial<Record<keyof ProjectFormData, string>> = {};

  if (!values.name.trim()) errors.name = i18n.t('projects:validation.nameRequired');
  if (!values.project_type_id) errors.project_type_id = i18n.t('projects:validation.typeRequired');
  // location/owner are optional — the data model allows NULL and existing
  // projects (e.g. reservation pools) carry no location; requiring them made
  // every edit save (including tag changes) silently fail validation

  // Note: ProjectModal currently doesn't have date range fields
  // but this validation function is extensible for future date fields

  return errors;
};

export const ProjectModal: React.FC<ProjectModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  editingProject
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const {
    values: formData,
    errors,
    hasErrors,
    isEditing,
    isSubmitting,
    handleChange,
    handleSubmit,
    reset,
  } = useModalForm<ProjectFormData>({
    initialValues,
    validate: validateProject,
    onCreate: async (data) => {
      const response = await api.projects.create(data);
      return response.data;
    },
    onUpdate: async (id, data) => {
      const response = await api.projects.update(id, data);
      return response.data;
    },
    queryKeysToInvalidate: [queryKeys.projects.all],
    additionalUpdateQueryKeys: (item) => [queryKeys.projects.detail(item.id)],
    onSuccess: (data) => {
      if (onSuccess) onSuccess(data);
    },
    onClose,
    editingItem: editingProject,
    getValuesFromItem: (item) => ({
      name: item.name || '',
      project_type_id: item.project_type_id || '',
      location_id: item.location_id || '',
      priority: item.priority || 3,
      description: item.description || '',
      data_restrictions: item.data_restrictions || '',
      include_in_demand: item.include_in_demand ?? true,
      external_id: item.external_id || '',
      owner_id: item.owner_id || '',
      current_phase_id: item.current_phase_id || '',
      tag_ids: (item.tags || []).map((tag) => tag.id)
    }),
  });

  // Fetch data for dropdowns
  const { data: projectTypes } = useQuery({
    queryKey: ['project-types'],
    queryFn: async () => {
      const response = await api.projectTypes.list();
      return response.data?.data || response.data || [];
    }
  });

  

  const { data: people } = useQuery({
    queryKey: ['people'],
    queryFn: async () => {
      const response = await api.people.list();
      return response.data?.data || response.data || [];
    }
  });

  const { data: tagsData } = useQuery({
    queryKey: queryKeys.tags.list(),
    queryFn: async () => {
      const response = await api.tags.list();
      return response.data;
    }
  });
  const allTags: Array<{ id: number; name: string; color: string | null }> = (tagsData?.data as any) || [];

  const [newTagName, setNewTagName] = React.useState('');
  const createTagMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await api.tags.create({ name });
      return response.data;
    },
    onSuccess: (data: any) => {
      const tag = data?.data;
      if (tag) {
        handleChange('tag_ids', [...formData.tag_ids, tag.id]);
      }
      setNewTagName('');
      queryClient.invalidateQueries({ queryKey: queryKeys.tags.all });
    }
  });

  const { data: phases } = useQuery({
    queryKey: ['phases'],
    queryFn: async () => {
      const response = await api.phases.list();
      return response.data;
    }
  });

  // Filter project types to only show project sub-types (not main project types)
  const filteredProjectTypes = useMemo(() => {
    if (!projectTypes || !Array.isArray(projectTypes)) return [];
    return projectTypes.filter((type: ProjectType) => type.parent_id !== null);
  }, [projectTypes]);

  // Filter potential owners based on location
  const filteredOwners = useMemo(() => {
    if (!people || !Array.isArray(people)) return [];

    return people.filter((person: PersonWithRoles) => {
      if (formData.location_id) {
        return person.location_id === formData.location_id ||
               person.roles?.some((role) => role.role_name?.toLowerCase().includes('manager')) ||
               person.roles?.some((role) => role.role_name?.toLowerCase().includes('owner'));
      }

      return person.roles?.some((role) =>
        role.role_name?.toLowerCase().includes('manager') ||
        role.role_name?.toLowerCase().includes('owner') ||
        role.role_name?.toLowerCase().includes('lead')
      );
    });
  }, [people, formData.location_id]);

  // Custom close handler that also resets form
  const onCloseWithReset = () => {
    reset();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCloseWithReset()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? t('projects:editProject') : t('projects:addNewProject')}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? t('projects:editDescription')
              : t('projects:createDescription')}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">

          {hasErrors && (
            <Alert variant="destructive" className="mb-6" role="alert" aria-live="assertive">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <AlertDescription>
                {t('projects:fixErrors')}
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('projects:projectName')} <span aria-hidden="true">*</span><span className="sr-only">{t('projects:a11yRequired')}</span></Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder={t('projects:placeholder.enterName')}
                className={errors.name ? 'border-destructive' : ''}
                aria-required="true"
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? 'name-error' : undefined}
              />
              {errors.name && <p id="name-error" className="text-sm text-destructive" role="alert">{errors.name}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="project_type_id">{t('projects:projectType')} <span aria-hidden="true">*</span><span className="sr-only">{t('projects:a11yRequired')}</span></Label>
              <Select value={formData.project_type_id} onValueChange={(value) => handleChange('project_type_id', value)}>
                <SelectTrigger
                  id="project_type_id"
                  className={errors.project_type_id ? 'border-destructive' : ''}
                  aria-required="true"
                  aria-invalid={!!errors.project_type_id}
                  aria-describedby={errors.project_type_id ? 'project_type_id-error' : undefined}
                >
                  <SelectValue placeholder={t('projects:placeholder.selectProjectType')} />
                </SelectTrigger>
                <SelectContent>
                  {filteredProjectTypes?.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.project_type_id && <p id="project_type_id-error" className="text-sm text-destructive" role="alert">{errors.project_type_id}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="owner_id">{t('projects:projectOwner')}</Label>
              <Select value={formData.owner_id} onValueChange={(value) => handleChange('owner_id', value)}>
                <SelectTrigger
                  id="owner_id"
                  className={errors.owner_id ? 'border-destructive' : ''}
                  aria-required="true"
                  aria-invalid={!!errors.owner_id}
                  aria-describedby={errors.owner_id ? 'owner_id-error' : undefined}
                >
                  <SelectValue placeholder={t('projects:placeholder.selectOwner')} />
                </SelectTrigger>
                <SelectContent>
                  {filteredOwners?.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.name} ({person.title || t('projects:noTitle')})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.owner_id && <p id="owner_id-error" className="text-sm text-destructive" role="alert">{errors.owner_id}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">{t('projects:priority')}</Label>
              <Select value={formData.priority.toString()} onValueChange={(value) => handleChange('priority', Number(value))}>
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">{`1 - ${t('projects:priorityLevel.highest')}`}</SelectItem>
                  <SelectItem value="2">{`2 - ${t('projects:priorityLevel.high')}`}</SelectItem>
                  <SelectItem value="3">{`3 - ${t('projects:priorityLevel.medium')}`}</SelectItem>
                  <SelectItem value="4">{`4 - ${t('projects:priorityLevel.low')}`}</SelectItem>
                  <SelectItem value="5">{`5 - ${t('projects:priorityLevel.lowest')}`}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="external_id">{t('projects:externalId')}</Label>
              <Input
                id="external_id"
                value={formData.external_id}
                onChange={(e) => handleChange('external_id', e.target.value)}
                placeholder={t('projects:placeholder.externalSystemId')}
              />
            </div>

            <div className="space-y-2 col-span-2">
              <Label htmlFor="project-tags">{t('projects:tags.label')}</Label>
              <div id="project-tags" className="flex flex-wrap items-center gap-2" data-testid="project-tags">
                {allTags.map((tag) => {
                  const selected = formData.tag_ids.includes(tag.id);
                  return (
                    <button
                      type="button"
                      key={tag.id}
                      className={`tag-chip ${selected ? 'tag-chip-selected' : ''}`}
                      style={selected && tag.color ? { backgroundColor: tag.color, borderColor: tag.color } : undefined}
                      onClick={() =>
                        handleChange(
                          'tag_ids',
                          selected
                            ? formData.tag_ids.filter((id) => id !== tag.id)
                            : [...formData.tag_ids, tag.id]
                        )
                      }
                    >
                      {tag.name}
                    </button>
                  );
                })}
                <span className="tag-new">
                  <input
                    className="tag-new-input"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder={t('projects:tags.newPlaceholder')}
                    data-testid="new-tag-input"
                  />
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={!newTagName.trim() || createTagMutation.isPending}
                    onClick={() => createTagMutation.mutate(newTagName.trim())}
                    data-testid="add-tag-button"
                  >
                    {t('projects:tags.add')}
                  </button>
                </span>
              </div>
            </div>

            <div className="space-y-2 col-span-2">
              <Label htmlFor="current_phase_id">{t('projects:currentPhase')}</Label>
              <Select value={formData.current_phase_id || 'none'} onValueChange={(value) => handleChange('current_phase_id', value === 'none' ? '' : value)}>
                <SelectTrigger id="current_phase_id">
                  <SelectValue placeholder={t('projects:placeholder.selectCurrentPhase')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('common:none')}</SelectItem>
                  {(phases?.data as ProjectPhase[])?.map((phase) => (
                    <SelectItem key={phase.id} value={phase.id}>
                      {phase.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t('common:description')}</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder={t('projects:placeholder.enterProjectDescription')}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="data_restrictions">{t('projects:dataRestrictions')}</Label>
            <Textarea
              id="data_restrictions"
              value={formData.data_restrictions}
              onChange={(e) => handleChange('data_restrictions', e.target.value)}
              placeholder={t('projects:placeholder.dataRestrictionsSecurity')}
              rows={2}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="include_in_demand"
              checked={formData.include_in_demand}
              onCheckedChange={(checked) => handleChange('include_in_demand', checked)}
              aria-describedby="include_in_demand-description"
            />
            <Label htmlFor="include_in_demand" className="cursor-pointer">
              {t('projects:includeInDemandPlanning')}
            </Label>
            <span id="include_in_demand-description" className="sr-only">{t('projects:includeInDemandSrOnly')}</span>
          </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onCloseWithReset}>
                {t('common:cancel')}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Spinner className="mr-2" size="sm" />}
                {isEditing ? t('projects:updateProject') : t('projects:createProject')}
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ProjectModal;
