import React from 'react';
import { useTranslation } from 'react-i18next';
import { Users, UserCog, Calendar } from 'lucide-react';

// Import existing page components
import People from './People';
import Roles from './Roles';
import Availability from './Availability';

// Import the new unified tab component
import { UnifiedTabComponent, type UnifiedTabConfig } from '../components/ui/UnifiedTabComponent';

// CSS imports
import './People.css';
import './Roles.css';

// PeopleTab type intentionally not exported, used internally for tab configuration

export default function PeopleUnified() {
  const { t } = useTranslation();

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
