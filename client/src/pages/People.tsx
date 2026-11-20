import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Plus, Edit2, Eye, Users, UserPlus, TrendingUp, AlertTriangle, CheckCircle, Trash2, Power, X } from 'lucide-react';
import { api } from '../lib/api-client';
import { queryKeys } from '../lib/queryKeys';
import { useScenario } from '../contexts/ScenarioContext';
import {
  PEOPLE_STATUS_PARAM,
  parsePeopleStatus,
  toUtilizationStatus,
  isPeopleStatusParam,
  type PeopleStatusParam,
} from '../lib/peopleStatusFilter';
import { fetchPersonUtilization, personUtilizationRowsFrom } from '../lib/personUtilizationData';
import i18n from '../i18n';
import { DataTable, Column } from '../components/ui/DataTable';
import { Alert, AlertDescription } from '../components/ui/alert';
import { FilterBar } from '../components/ui/FilterBar';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import PersonModal from '../components/modals/PersonModal';
import { useModal } from '../hooks/useModal';
import type { Person, Location } from '../types';
import './People.css';

export default function People() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentScenario } = useScenario();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState({
    search: '',
    primary_role_id: '', // API filter name still uses this for backwards compatibility
    worker_type: '',
    location: ''
  });
  
  const addPersonModal = useModal();
  const editPersonModal = useModal();
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);

  // Fetch people
  const { data: people, isLoading: peopleLoading, error: peopleError } = useQuery({
    queryKey: queryKeys.people.list(filters),
    queryFn: async () => {
      const params = Object.entries(filters)
        .filter(([_, value]) => value)
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
      const response = await api.people.list({ ...params, limit: 2000 });
      return response.data.data as Person[];
    }
  });

  // Fetch utilization data for actionable insights.
  // The endpoint returns a bare array; normalize to { personUtilization } so
  // downstream consumers always see one shape.
  // I02b/G3(P0)：场景维度进查询键——切场景后必须重新取数（后端按
  // X-Scenario-Id 切片返回），否则 staleTime 内旧数据造成"告警数≠名单"。
  const {
    data: utilizationData,
    isLoading: utilizationLoading,
    error: utilizationError,
    refetch: refetchUtilization
  } = useQuery({
    queryKey: queryKeys.people.utilization(currentScenario?.id),
    // I02b 复评#1：写侧统一形状（与 BoardCells 共用同一 helper，杜绝同键分叉）
    queryFn: fetchPersonUtilization,
    enabled: !!currentScenario
  });

  // Fetch roles for filter
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

  // Fetch locations for filter
  const { data: locations } = useQuery({
    queryKey: queryKeys.locations.list(),
    queryFn: async () => {
      const response = await api.locations.list();
      return response.data.data as Location[];
    }
  });

  // Delete person mutation — failure must stay visible: the server refuses
  // deletion when the person still has scenario assignments (FK restrict);
  // baseline assignments cascade away with the person
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deletePersonMutation = useMutation({
    mutationFn: async (personId: string) => {
      await api.people.delete(personId);
    },
    onSuccess: () => {
      setDeleteError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.people.all });
    },
    onError: (error: any) => {
      setDeleteError(
        error?.response?.data?.message ||
        error?.message ||
        t('people:deleteFailed')
      );
    }
  });

  const handleDeletePerson = (personId: string, personName: string) => {
    if (confirm(t('people:deleteConfirmation', { name: personName }))) {
      deletePersonMutation.mutate(personId);
    }
  };

  // 停用/启用(2026-10-13): 下线人员走停用而非删除——删除有 409 引用守卫
  // (CASCADE 会销毁排产历史);停用者保留历史,不再进入分配/负责人选择器
  const toggleActiveMutation = useMutation({
    mutationFn: async (person: Person) => {
      await api.people.update(person.id, { is_active: person.is_active === false } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.people.all });
    }
  });

  const handleEditPerson = (person: Person) => {
    setEditingPerson(person);
    editPersonModal.open();
  };

  const handlePersonSuccess = () => {
    // Both modals will close automatically via onClose
    setEditingPerson(null);
  };

  const handleFilterChange = (name: string, value: string) => {
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleResetFilters = () => {
    setFilters({
      search: '',
      primary_role_id: '', // API filter name still uses this for backwards compatibility
      worker_type: '',
      location: ''
    });
    // I02b/D1：重置同时清除 URL 状态筛选（含仅 URL 可达的 fully-allocated）
    setStatusParam(null);
  };

  const getWorkerTypeBadgeClass = (workerType: string) => {
    switch (workerType) {
      case 'FTE': return 'badge badge-success';
      case 'Contractor': return 'badge badge-warning';
      case 'Consultant': return 'badge badge-primary';
      default: return 'badge';
    }
  };

  // Localized display label for a worker type value, falling back to the raw value
  const workerTypeLabel = (workerType: string) => {
    const key = `people:workerTypes.${workerType}`;
    return i18n.exists(key) ? t(key) : workerType;
  };

  const getAvailabilityColor = (availability: number) => {
    if (availability >= 90) return 'text-success';
    if (availability >= 70) return 'text-warning';
    return 'text-danger';
  };

  // Enhanced logic for actionable insights
  const getPersonInsights = (personId: string) => {
    const utilization = utilizationData?.personUtilization?.find(
      (u: any) => u.person_id === personId
    );
    
    if (!utilization) {
      return {
        status: 'unknown',
        color: 'gray',
        icon: Eye,
        action: t('common:viewDetails'),
        actionType: 'view'
      };
    }

    // person_utilization_view 真身: current_availability_percentage 在视图里
    // (原 UtilizationItem 类型漏了它;total_allocation 是 mock 时代别名)
    const allocation = Number(utilization.total_allocation_percentage ?? 0);
    const availability = Number(utilization.current_availability_percentage ?? 100);
    const utilizationPercentage = availability > 0 ? (allocation / availability) * 100 : 0;

    // U01/IP-03b(2026-10-17):状态档位读视图 utilization_status 单一真相
    // (相对可用率口径,迁移 069)——旧 40 私设线退役;percentage 仍按相对
    // 可用率计算展示(与视图判档同分子分母)
    const status = String(utilization.utilization_status ?? 'Available');
    if (status === 'Unavailable') {
      return {
        status: 'unavailable',
        color: 'gray',
        icon: Eye,
        action: t('common:viewDetails'),
        actionType: 'view',
        percentage: 0
      };
    }
    if (status === 'Over-allocated') {
      return {
        status: 'over_allocated',
        color: 'danger',
        icon: AlertTriangle,
        action: t('people:quickActions.adjustAssignments'),
        actionType: 'adjust_assignments',
        percentage: utilizationPercentage
      };
    } else if (status === 'Fully-allocated') {
      return {
        status: 'fully_allocated',
        color: 'warning',
        icon: TrendingUp,
        action: t('people:quickActions.monitor'),
        actionType: 'monitor',
        percentage: utilizationPercentage
      };
    } else if (status === 'Partially-allocated') {
      return {
        status: 'under_allocated',
        color: 'info',
        icon: UserPlus,
        action: t('people:quickActions.adjustAssignments'),
        actionType: 'adjust_assignments',
        percentage: utilizationPercentage
      };
    } else {
      return {
        status: 'available',
        color: 'success',
        icon: CheckCircle,
        action: t('people:quickActions.adjustAssignments'),
        actionType: 'adjust_assignments',
        percentage: utilizationPercentage
      };
    }
  };

  const handleQuickAction = (actionType: string, personId: string) => {
    switch (actionType) {
      case 'adjust_assignments':
        // 所有利用率档位统一进入调整分配页；不再从超载/低载各开旧弹窗。
        navigate(`/people/${personId}/workload`);
        break;
      case 'monitor':
        // U03: ReportsUnified 的 tab 参数名是 ?tab=(旧 ?type= 被忽略落到默认需求报表)
        navigate(`/reports?tab=utilization&person=${personId}`);
        break;
      case 'view':
      default:
        navigate(`/people/${personId}`);
        break;
    }
  };

  // Summary insights for the page header。
  // U01/IP-03b(2026-10-17):汇总与明细共用 person_utilization_view 的
  // utilization_status 单一真相(相对可用率口径,迁移 069)——旧代码读不存在的
  // allocation_status 字段,"超负荷"恒 0 而明细却有 224%/362%
  const teamInsights = useMemo(() => {
    // I02b 复评#1：读取侧容忍旧缓存形状（裸数组/{data}/{personUtilization}）
    const rows = personUtilizationRowsFrom(utilizationData);
    if (!rows.length || !people) {
      return { overAllocated: 0, available: 0, total: people?.length || 0 };
    }

    const overAllocated = rows.filter(
      (u: any) => u.utilization_status === 'Over-allocated'
    ).length;

    const available = rows.filter(
      (u: any) => u.utilization_status === 'Available'
    ).length;

    return {
      overAllocated,
      available,
      total: people.length
    };
  }, [utilizationData, people]);

  // I02b/G1：status 只由 URL 派生（禁止 useState 镜像——Projects 全量写回是
  // 现成反例）；写回 clone 后只改 status 键并 replace；非法值从 URL 清理（N2）
  const rawStatusParam = searchParams.get(PEOPLE_STATUS_PARAM);
  const statusParam: PeopleStatusParam | null = parsePeopleStatus(rawStatusParam);
  const statusFilter = statusParam ? toUtilizationStatus(statusParam) : null;

  useEffect(() => {
    if (rawStatusParam && !isPeopleStatusParam(rawStatusParam)) {
      const next = new URLSearchParams(searchParams);
      next.delete(PEOPLE_STATUS_PARAM);
      setSearchParams(next, { replace: true });
    }
    // eslint 未装 react-hooks 插件,依赖数组按语义维护
  }, [rawStatusParam]);

  const setStatusParam = (value: PeopleStatusParam | null) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(PEOPLE_STATUS_PARAM, value);
    else next.delete(PEOPLE_STATUS_PARAM);
    setSearchParams(next, { replace: true });
  };

  const filteredPeople = useMemo(() => {
    if (!statusFilter || !people) return people || [];
    const byStatus = new Map(
      (personUtilizationRowsFrom(utilizationData)).map((u: any) => [u.person_id, u.utilization_status as string])
    );
    return people.filter((p: Person) => byStatus.get(p.id) === statusFilter);
    // eslint 未装 react-hooks 插件,依赖数组按语义维护
  }, [people, statusFilter, utilizationData]);

  // U01（I02b 起 URL 化）：点击汇总卡片 → status 筛选（可分享/返回恢复）
  const toggleStatusFilter = (target: PeopleStatusParam) => {
    setStatusParam(statusParam === target ? null : target);
  };

  const columns: Column<Person>[] = [
    {
      key: 'name',
      header: t('common:name'),
      sortable: true,
      render: (value, row) => (
        <div className="person-name">
          <Link to={`/people/${row.id}`} className="name">
            {value}
          </Link>
          {row.is_active === false && (
            <span className="email text-muted">{t('people:inactive')}</span>
          )}
          {row.email && <span className="email text-muted">{row.email}</span>}
        </div>
      )
    },
    {
      key: 'primary_role_name',
      header: t('people:columns.primaryRole'),
      sortable: true
    },
    {
      key: 'worker_type',
      header: t('people:columns.type'),
      sortable: true,
      render: (value) => (
        <span className={getWorkerTypeBadgeClass(value)}>
          {workerTypeLabel(value)}
        </span>
      )
    },
    {
      key: 'location_name',
      header: t('people:columns.location'),
      sortable: true,
      render: (value) => value || '-'
    },
    {
      key: 'default_availability_percentage',
      header: t('people:columns.availability'),
      sortable: true,
      render: (value) => (
        <span
          className={getAvailabilityColor(value)}
          title={`${value}% ${value >= 90 ? 'high' : value >= 70 ? 'medium' : 'low'} availability`}
        >
          {value}%
        </span>
      )
    },
    {
      key: 'default_hours_per_day',
      header: t('people:columns.hoursPerDay'),
      sortable: true,
      render: (value) => `${value}h`
    },
    {
      key: 'utilization',
      header: t('people:columns.workload'),
      width: '165px',
      render: (_, row) => {
        const insights = getPersonInsights(row.id);
        const IconComponent = insights.icon;

        return (
          <div className="people-workload-status">
            <div className={`people-status-indicator status-${insights.color}`}>
              <IconComponent size={20} />
              {insights.percentage !== undefined && (
                <span className="people-status-percentage">
                  {Math.round(insights.percentage)}%
                </span>
              )}
            </div>
            <span className={`people-status-label text-${insights.color}`}>
              {t(`people:workloadStatus.${insights.status}`)}
            </span>
          </div>
        );
      }
    },
    {
      key: 'actions',
      header: t('people:columns.quickActions'),
      width: '240px',
      render: (_, row) => {
        const insights = getPersonInsights(row.id);
        const ActionIcon = insights.icon;
        // rows without utilization data have no meaningful quick action
        const hasQuickAction = insights.status !== 'unknown';

        return (
          <div className="table-actions">
            {hasQuickAction && (
              <button
                className={`btn btn-sm btn-${insights.color} quick-action-btn`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleQuickAction(insights.actionType, row.id);
                }}
                title={insights.action}
              >
                <ActionIcon size={14} />
                {insights.action}
              </button>
            )}
            <button
              className="btn btn-outline btn-sm quick-action-icon"
              onClick={(e) => {
                e.stopPropagation();
                handleEditPerson(row);
              }}
              title={t('common:edit')}
              aria-label={t('common:edit')}
            >
              <Edit2 size={14} aria-hidden="true" />
            </button>
            <button
              className="btn btn-outline btn-sm quick-action-icon"
              onClick={(e) => {
                e.stopPropagation();
                toggleActiveMutation.mutate(row);
              }}
              disabled={toggleActiveMutation.isPending}
              title={row.is_active === false ? t('people:activate') : t('people:deactivate')}
              aria-label={row.is_active === false ? t('people:activate') : t('people:deactivate')}
            >
              <Power size={14} aria-hidden="true" />
            </button>
            <button
              className="btn btn-outline btn-sm quick-action-icon delete-person-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleDeletePerson(row.id, row.name);
              }}
              disabled={deletePersonMutation.isPending}
              title={t('common:delete')}
              aria-label={t('common:delete')}
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </div>
        );
      }
    }
  ];

  const filterConfig = [
    {
      name: 'search',
      label: t('common:search'),
      type: 'search' as const,
      placeholder: t('people:searchPlaceholder')
    },
    {
      name: 'primary_role_id',
      label: t('people:columns.primaryRole'),
      type: 'select' as const,
      options: Array.isArray(roles) ? roles.map(role => ({ value: role.id, label: role.name })) : []
    },
    {
      name: 'worker_type',
      label: t('people:workerType'),
      type: 'select' as const,
      options: [
        { value: 'FTE', label: t('people:workerTypeOptions.fullTimeEmployee') },
        { value: 'Contractor', label: t('people:workerTypeOptions.contractor') },
        { value: 'Consultant', label: t('people:workerTypeOptions.consultant') }
      ]
    },
    {
      name: 'location',
      label: t('people:columns.location'),
      type: 'select' as const,
      options: locations?.map(location => ({ value: location.id, label: location.name })) || []
    }
  ];

  if (peopleLoading) {
    return <LoadingSpinner />;
  }

  if (peopleError) {
    return <ErrorMessage message={t('people:failedToLoad')} details={peopleError.message} />;
  }

  return (
    <div className="page-container people-page">
      <div className="page-header">
        <div>
          <h1>{t('people:title')}</h1>
          <p className="text-muted">{t('people:subtitle')}</p>
          {teamInsights.total > 0 && (
            <div className="team-insights">
              <div className="insight-summary">
                {/* U01:卡片可点击 → 状态筛选;人数与明细同源视图状态。I02b：
                    URL 派生 + aria-pressed（切换态对读屏可见） */}
                <button
                  type="button"
                  className={`insight-item insight-toggle text-danger ${statusParam === 'over-allocated' ? 'active' : ''}`}
                  onClick={() => toggleStatusFilter('over-allocated')}
                  title={t('people:insights.clickToFilter')}
                  aria-pressed={statusParam === 'over-allocated'}
                >
                  <AlertTriangle size={16} />
                  {t('people:insights.overAllocated', { count: teamInsights.overAllocated })}
                </button>
                <button
                  type="button"
                  className={`insight-item insight-toggle text-success ${statusParam === 'available' ? 'active' : ''}`}
                  onClick={() => toggleStatusFilter('available')}
                  title={t('people:insights.clickToFilter')}
                  aria-pressed={statusParam === 'available'}
                >
                  <CheckCircle size={16} />
                  {t('people:insights.available', { count: teamInsights.available })}
                </button>
                <span className="insight-item text-muted">
                  {t('people:insights.totalPeople', { count: teamInsights.total })}
                </span>
              </div>
            </div>
          )}
        </div>
        <div className="header-actions">
          <button
            className="btn btn-primary"
            onClick={addPersonModal.open}
          >
            <Plus size={16} />
            {t('people:addPerson')}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => navigate('/assignments')}
          >
            <Users size={16} />
            {t('people:viewAssignments')}
          </button>
        </div>
      </div>

      <FilterBar
        filters={filterConfig}
        values={filters}
        onChange={handleFilterChange}
        onReset={handleResetFilters}
      />

      {/* I02b/D1：生效中的状态筛选必须有可见标识与清除入口——fully-allocated
          仅 URL 可达（无卡片），不能把筛选子集伪装成全量名册 */}
      {statusParam && (
        <Alert className="mb-3" role="status">
          <AlertDescription className="flex items-center gap-2">
            <span>
              {t('people:insights.activeFilter', {
                label: t(`people:statusLabels.${statusParam}`),
                count: filteredPeople.length
              })}
            </span>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => setStatusParam(null)}
              aria-label={t('people:insights.clearStatusFilter')}
            >
              <X size={14} aria-hidden="true" />
              {t('people:insights.clearStatusFilter')}
            </button>
          </AlertDescription>
        </Alert>
      )}

      {/* Delete failure must stay visible (E pillar: 失败可见) — the server
          refuses deletion while the person has scenario assignments */}
      {deleteError && (
        <Alert variant="destructive" role="alert" className="mb-3">
          <AlertDescription className="flex items-center gap-2">
            <span>{deleteError}</span>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => setDeleteError(null)}
              aria-label={t('common:close')}
            >
              {t('common:close')}
            </button>
          </AlertDescription>
        </Alert>
      )}

      {/* I02b/G2：状态筛选生效时，加载/失败不得冒充"0 人"或全局空态 */}
      {statusParam && utilizationLoading ? (
        <LoadingSpinner />
      ) : statusParam && utilizationError ? (
        <Alert variant="destructive" role="alert" className="mb-3">
          <AlertDescription className="flex items-center gap-2">
            <span>{t('people:utilizationFailed')}</span>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => refetchUtilization()}>
              {t('common:retry')}
            </button>
          </AlertDescription>
        </Alert>
      ) : (
        <DataTable
          data={filteredPeople}
          columns={columns}
          onRowClick={(row) => navigate(`/people/${row.id}`)}
          itemsPerPage={20}
          emptyMessage={statusParam ? t('people:noMatchesForStatus') : undefined}
        />
      )}

      {/* Add Person Modal */}
      <PersonModal
        isOpen={addPersonModal.isOpen}
        onClose={addPersonModal.close}
        onSuccess={handlePersonSuccess}
      />

      {/* Edit Person Modal */}
      <PersonModal
        isOpen={editPersonModal.isOpen}
        onClose={() => {
          editPersonModal.close();
          setEditingPerson(null);
        }}
        onSuccess={handlePersonSuccess}
        editingPerson={editingPerson ?? undefined}
      />
    </div>
  );
}