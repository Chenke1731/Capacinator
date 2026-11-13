import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Users, UserCog, Calendar } from 'lucide-react';

// Import existing page components
import People from './People';
import Roles from './Roles';
import Availability from './Availability';

// Import the new unified tab component
import { UnifiedTabComponent, type UnifiedTabConfig } from '../components/ui/UnifiedTabComponent';
import { PEOPLE_STATUS_PARAM } from '../lib/peopleStatusFilter';

// CSS imports
import './People.css';
import './Roles.css';

// PeopleTab type intentionally not exported, used internally for tab configuration

export default function PeopleUnified() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  // I02e：修复前告警链接/书签是 /people?tab=utilization；统一页没有该 tab，
  // 旧行为会静默删参落到全量列表（"点进去没筛选"）。一次性映射到人员页的
  // 超载筛选；已有显式 status 时保留用户选择。
  const legacyUtilizationTab = searchParams.get('tab') === 'utilization';
  useEffect(() => {
    if (!legacyUtilizationTab) return;
    const next = new URLSearchParams(searchParams);
    next.delete('tab');
    if (!next.get(PEOPLE_STATUS_PARAM)) {
      next.set(PEOPLE_STATUS_PARAM, 'over-allocated');
    }
    setSearchParams(next, { replace: true });
  }, [legacyUtilizationTab, searchParams, setSearchParams]);

  // 归一完成前不渲染 tab 组件：否则 UnifiedTabComponent 会先把非法 tab 删掉
  if (legacyUtilizationTab) return null;

  // Tab labels are localized, so the config must live inside the component —
  // a module-level constant would freeze the labels at import time.
  const tabs: UnifiedTabConfig[] = [
    {
      id: 'people',
      label: t('people:title'),
      icon: Users,
      component: People
    },
    {
      id: 'roles',
      label: t('people:tabs.roles'),
      icon: UserCog,
      component: Roles
    },
    {
      id: 'availability',
      label: t('people:tabs.availability'),
      icon: Calendar,
      component: Availability
    }
  ];

  return (
    <UnifiedTabComponent
      tabs={tabs}
      defaultTab="people"
      paramName="tab"
      orientation="horizontal"
      variant="primary"
      size="md"
      ariaLabel={t('people:unifiedAriaLabel')}
      className="people-unified-container"
    />
  );
}
