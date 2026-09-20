import React, { useMemo } from 'react';
import { BarChart3, TrendingUp, Users, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { UnifiedTabComponent, type UnifiedTabConfig } from '../components/ui/UnifiedTabComponent';
import { ReportsTabContent } from './ReportsTabContent';

// Custom component to render the active tab content
const ReportsContentRenderer: React.FC<{ activeTab: string }> = ({ activeTab }) => {
  return <ReportsTabContent activeReport={activeTab} />;
};

export default function ReportsUnified() {
  const { t } = useTranslation();

  // Define report tabs configuration with icons (inside the component so labels
  // re-resolve when the UI language changes)
  const reportTabs = useMemo<UnifiedTabConfig[]>(() => [
    { id: 'demand', label: t('reports:tabs.demand'), icon: TrendingUp },
    { id: 'capacity', label: t('reports:tabs.capacity'), icon: Users },
    { id: 'utilization', label: t('reports:tabs.utilization'), icon: BarChart3 },
    { id: 'gaps', label: t('reports:tabs.gaps'), icon: AlertTriangle }
  ], [t]);

  return (
    <UnifiedTabComponent
      tabs={reportTabs}
      defaultTab="demand"
      paramName="tab"
      orientation="horizontal"
      variant="primary"
      size="md"
      ariaLabel={t('reports:aria.navigation')}
      className="reports-unified-container"
      renderContent={true}
    >
      {(activeTab: string) => <ReportsContentRenderer activeTab={activeTab} />}
    </UnifiedTabComponent>
  );
}