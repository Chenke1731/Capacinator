import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Palette, ExternalLink } from 'lucide-react';
import { ProjectType } from '../types';
import { api } from '../lib/api-client';
import { getLocale } from '../i18n';
import { InlineDataTable } from '../components/ui/InlineDataTable';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Column } from '../components/ui/DataTable';
import '../components/ui/InlineDataTable.css';

export default function ProjectTypesTable() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Fetch project types
  const { data: projectTypes, isLoading, error } = useQuery({
    queryKey: ['projectTypes'],
    queryFn: async () => {
      const response = await api.projectTypes.list();
      const data = response.data?.data || response.data || [];
      return data as ProjectType[];
    }
  });

  // Create project type mutation
  const createMutation = useMutation({
    mutationFn: async (data: Partial<ProjectType>) => {
      await api.projectTypes.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectTypes'] });
      queryClient.invalidateQueries({ queryKey: ['project-types'] });
    }
  });

  // Update project type mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ProjectType> }) => {
      await api.projectTypes.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectTypes'] });
      queryClient.invalidateQueries({ queryKey: ['project-types'] });
    }
  });

  // Delete project type mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.projectTypes.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectTypes'] });
      queryClient.invalidateQueries({ queryKey: ['project-types'] });
    }
  });

  const columns: Column<ProjectType>[] = [
    {
      key: 'name',
      header: t('projects:projectTypes.typeName'),
      sortable: true,
      render: (value, row) => (
        <div className="project-type-name">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: row.color_code || '#6b7280',
                flexShrink: 0
              }}
            />
            <a
              href={`/project-types/${row.id}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                navigate(`/project-types/${row.id}`);
              }}
              className="project-type-name-link"
              style={{ 
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                color: 'var(--primary)', 
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              {value}
              <ExternalLink size={12} style={{ opacity: 0.6 }} />
            </a>
          </div>
        </div>
      )
    },
    {
      key: 'description',
      header: t('common:description'),
      render: (value) => (
        <span className="text-muted">
          {value || t('projects:projectTypes.noDescription')}
        </span>
      )
    },
    {
      key: 'color_code',
      header: t('projects:projectTypes.color'),
      render: (value, row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="color"
            value={value || '#6b7280'}
            onChange={(e) => {
              e.stopPropagation();
              updateMutation.mutate({
                id: row.id,
                data: { ...row, color_code: e.target.value }
              });
            }}
            style={{
              width: '32px',
              height: '24px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
            title={t('projects:projectTypes.clickToChangeColor')}
          />
          <span className="text-muted">{value}</span>
        </div>
      )
    },
    {
      key: 'created_at',
      header: t('common:created'),
      render: (value) => value ? new Date(value).toLocaleDateString(getLocale()) : '-',
    }
  ];

  const inlineFields = [
    {
      key: 'name' as keyof ProjectType,
      type: 'text' as const,
      required: true,
      placeholder: t('projects:projectTypes.typeNamePlaceholder'),
    },
    {
      key: 'description' as keyof ProjectType,
      type: 'text' as const,
      placeholder: t('projects:projectTypes.descriptionPlaceholder'),
    },
    {
      key: 'color_code' as keyof ProjectType,
      type: 'color' as const,
      placeholder: '#6b7280',
    }
  ];

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return <ErrorMessage message={t('projects:projectTypes.loadFailed')} />;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="header-content">
          <div className="flex items-center gap-3">
            <Palette size={24} />
            <h1>{t('projects:projectTypes.title')}</h1>
          </div>
          <p className="text-muted">{t('projects:projectTypes.subtitle')}</p>
        </div>
      </div>
      
      <InlineDataTable
        data={projectTypes || []}
        columns={columns}
        inlineFields={inlineFields}
        onAdd={async (data) => await createMutation.mutateAsync(data)}
        onUpdate={async (id, data) => await updateMutation.mutateAsync({ id, data })}
        onDelete={async (id) => {
          const projectType = projectTypes?.find(pt => pt.id === id);
          if (projectType && confirm(t('projects:projectTypes.deleteConfirmation', { name: projectType.name }))) {
            await deleteMutation.mutateAsync(id);
          }
        }}
        addButtonText={t('projects:projectTypes.addProjectType')}
        emptyNewRow={{
          name: '',
          description: '',
          color_code: '#6b7280',
        }}
        itemsPerPage={20}
        onRowClick={(row) => navigate(`/project-types/${row.id}`)}
      />
    </div>
  );
}