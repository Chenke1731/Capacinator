import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Boxes } from 'lucide-react';
import { Component } from '../types';
import { api } from '../lib/api-client';
import { queryKeys } from '../lib/queryKeys';
import { DataTable, Column } from '../components/ui/DataTable';
import { InlineEdit } from '../components/ui/InlineEdit';
import { ComponentModal } from '../components/modals/ComponentModal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorMessage } from '../components/ui/ErrorMessage';

// Software component management (066) — the Locations page pattern: a
// controlled CRUD table so components cannot be free-typed; demand
// analytics group by this dimension.
export function Components() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; component: Component | null }>({
    isOpen: false,
    component: null
  });

  const { data: components, isLoading, error } = useQuery({
    queryKey: queryKeys.components.list(),
    queryFn: async () => {
      const response = await api.components.list();
      const data = response.data?.data || response.data || [];
      return Array.isArray(data) ? data : [];
    }
  });

  const updateComponentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Component> }) => {
      await api.components.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.components.all });
    },
    onError: (error) => {
      console.error('Failed to update component:', error);
      alert(t('components:updateFailed'));
    }
  });

  const deleteComponentMutation = useMutation({
    mutationFn: async (componentId: string) => {
      await api.components.delete(componentId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.components.all });
      setDeleteConfirm({ isOpen: false, component: null });
    },
    onError: (error) => {
      console.error('Failed to delete component:', error);
      // RESTRICT: component still referenced by projects
      setDeleteConfirm({ isOpen: false, component: null });
      alert(t('components:deleteFailedInUse'));
    }
  });

  const handleDelete = (component: Component) => {
    setDeleteConfirm({ isOpen: true, component });
  };

  const confirmDelete = () => {
    if (deleteConfirm.component) {
      deleteComponentMutation.mutate(deleteConfirm.component.id);
    }
  };

  const handleSave = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.components.all });
    setIsModalOpen(false);
  };

  const columns: Column<Component>[] = [
    {
      key: 'name',
      header: t('components:columns.name'),
      sortable: true,
      render: (value, row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Boxes size={18} style={{ color: 'var(--primary)' }} />
          <InlineEdit
            value={row.name}
            onSave={(newValue) => {
              updateComponentMutation.mutate({
                id: row.id,
                data: { name: newValue as string }
              });
            }}
            type="text"
            placeholder={t('components:placeholders.name')}
          />
        </div>
      )
    },
    {
      key: 'code',
      header: t('components:columns.code'),
      render: (value, row) => (
        <InlineEdit
          value={row.code || ''}
          onSave={(newValue) => {
            updateComponentMutation.mutate({
              id: row.id,
              data: { code: newValue as string }
            });
          }}
          type="text"
          placeholder={t('components:placeholders.code')}
        />
      )
    },
    {
      key: 'description',
      header: t('components:columns.description'),
      render: (value, row) => (
        <InlineEdit
          value={row.description || ''}
          onSave={(newValue) => {
            updateComponentMutation.mutate({
              id: row.id,
              data: { description: newValue as string }
            });
          }}
          type="textarea"
          placeholder={t('components:placeholders.description')}
          rows={2}
        />
      )
    },
    {
      key: 'actions',
      header: t('common:actions'),
      width: '120px',
      render: (_, row) => (
        <div className="table-actions">
          <button
            className="btn table-action-btn btn-danger"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(row);
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

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return <ErrorMessage message={t('components:loadFailed')} details={(error as Error).message} />;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>
            <Boxes size={24} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
            {t('components:title')}
          </h1>
          <p className="text-muted">{t('components:subtitle')}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
          <Plus size={16} />
          {t('components:addComponent')}
        </button>
      </div>

      <DataTable
        data={components || []}
        columns={columns}
        emptyMessage={t('components:emptyMessage')}
        itemsPerPage={20}
      />

      {isModalOpen && (
        <ComponentModal
          component={null}
          onSave={handleSave}
          onCancel={() => setIsModalOpen(false)}
        />
      )}

      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title={t('components:deleteTitle')}
        message={t('components:deleteMessage', { name: deleteConfirm.component?.name ?? '' })}
        confirmText={t('common:delete')}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, component: null })}
        variant="danger"
      />
    </div>
  );
}
