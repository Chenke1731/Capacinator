import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Edit2, Trash2, Eye, Users, Settings } from 'lucide-react';
import { api } from '../lib/api-client';
import { queryKeys } from '../lib/queryKeys';
import { DataTable, Column } from '../components/ui/DataTable';
import { FilterBar } from '../components/ui/FilterBar';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import type { Role } from '../types';
import './Roles.css';

export default function Roles() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({
    search: '',
    has_planners: '',
    has_people: ''
  });

  // Fetch roles
  const { data: roles, isLoading: rolesLoading, error: rolesError } = useQuery({
    queryKey: queryKeys.roles.list(filters),
    queryFn: async () => {
      const params = Object.entries(filters)
        .filter(([_, value]) => value)
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
      const response = await api.roles.list(params);
      // Handle nested response structure: response.data.data
      const rolesData = response.data?.data || response.data || [];
      return Array.isArray(rolesData) ? rolesData : [];
    }
  });

  // Delete role mutation
  const deleteRoleMutation = useMutation({
    mutationFn: async (roleId: string) => {
      await api.roles.delete(roleId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.roles.all });
    }
  });

  const handleDeleteRole = (roleId: string, roleName: string) => {
    if (confirm(t('roles:deleteConfirm', { name: roleName }))) {
      deleteRoleMutation.mutate(roleId);
    }
  };

  const handleFilterChange = (name: string, value: string) => {
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleResetFilters = () => {
    setFilters({
      search: '',
      has_planners: '',
      has_people: ''
    });
  };

  const columns: Column<Role>[] = [
    {
      key: 'name',
      header: t('roles:columns.name'),
      sortable: true,
      render: (value, row) => (
        <div className="role-name">
          <span className="name">{value}</span>
          {row.description && <span className="description text-muted">{row.description}</span>}
        </div>
      )
    },
    {
      key: 'external_id',
      header: t('roles:columns.externalId'),
      sortable: true,
      render: (value) => value || '-'
    },
    {
      key: 'people_count',
      header: t('roles:columns.people'),
      sortable: true,
      render: (value) => (
        <div className="count-badge">
          <Users size={14} />
          <span>{value || 0}</span>
        </div>
      )
    },
    {
      key: 'planners_count',
      header: t('roles:columns.planners'),
      sortable: true,
      render: (value) => (
        <div className="count-badge">
          <Settings size={14} />
          <span>{value || 0}</span>
        </div>
      )
    },
    {
      key: 'standard_allocations_count',
      header: t('roles:columns.allocations'),
      sortable: true,
      render: (value) => value || 0
    },
    {
      key: 'actions',
      header: t('common:actions'),
      width: '290px',
      render: (_, row) => (
        <div className="table-actions">
          <button
            className="btn table-action-btn"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/roles/${row.id}`);
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
              // role editing lives on the details page (inline) — there is
              // no /roles/:id/edit route
              navigate(`/roles/${row.id}`);
            }}
            title={t('common:edit')}
          >
            <Edit2 size={14} />
            {t('common:edit')}
          </button>
          <button
            className="btn table-action-btn btn-danger"
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteRole(row.id, row.name);
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
      placeholder: t('roles:searchPlaceholder')
    },
    {
      name: 'has_planners',
      label: t('roles:hasPlanners'),
      type: 'select' as const,
      options: [
        { value: 'true', label: t('common:yes') },
        { value: 'false', label: t('common:no') }
      ]
    },
    {
      name: 'has_people',
      label: t('roles:hasPeople'),
      type: 'select' as const,
      options: [
        { value: 'true', label: t('common:yes') },
        { value: 'false', label: t('common:no') }
      ]
    }
  ];

  if (rolesLoading) {
    return <LoadingSpinner />;
  }

  if (rolesError) {
    return <ErrorMessage message={t('roles:loadFailed')} details={rolesError.message} />;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>{t('roles:title')}</h1>
          <p className="text-muted">{t('roles:subtitle')}</p>
        </div>
        <div className="header-actions">
          <button
            className="btn btn-primary"
            onClick={() => navigate('/roles/new')}
          >
            <Plus size={16} />
            {t('roles:addRole')}
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
        data={roles || []}
        columns={columns}
        onRowClick={(row) => navigate(`/roles/${row.id}`)}
        itemsPerPage={20}
      />
    </div>
  );
}