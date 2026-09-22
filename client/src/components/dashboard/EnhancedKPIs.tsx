import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Target,
  Gauge,
  AlertCircle,
  CheckCircle,
  Clock
} from 'lucide-react';
import { Card } from '../ui/CustomCard';
import { DashboardSummary } from '../../types';

interface EnhancedKPIsProps {
  dashboard: DashboardSummary;
  className?: string;
}

interface KPIMetric {
  id: string;
  title: string;
  value: number;
  displayValue: string;
  target?: number;
  unit: string;
  trend?: 'up' | 'down' | 'stable';
  status: 'excellent' | 'good' | 'warning' | 'critical';
  description: string;
  actionText: string;
  navigationPath: string;
  icon: React.ComponentType<{ className?: string }>;
}

const STATUS_CONFIG = {
  excellent: {
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    icon: CheckCircle
  },
  good: {
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    icon: TrendingUp
  },
  warning: {
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
    icon: AlertCircle
  },
  critical: {
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    icon: TrendingDown
  }
};

const TREND_ICONS = {
  up: TrendingUp,
  down: TrendingDown,
  stable: Activity
};

function calculateResourceEfficiency(dashboard: DashboardSummary): number {
  const totalPeople = dashboard.summary?.people || 0;

  // If no people, return 0
  if (totalPeople === 0) return 0;

  // utilization keys come straight from person_utilization_view's
  // utilization_status ('Over-allocated', 'Fully-allocated', ...);
  // UPPER_SNAKE kept as fallback for older payload shapes
  const overAllocated = dashboard.utilization?.OVER_ALLOCATED ?? dashboard.utilization?.['Over-allocated'] ?? 0;
  const fullyAllocated = dashboard.utilization?.FULLY_ALLOCATED ?? dashboard.utilization?.['Fully-allocated'] ?? 0;
  const allocated = fullyAllocated + overAllocated;

  // If no allocations yet, return 0 (not 100, as nothing is allocated)
  if (allocated === 0) return 0;

  // Efficiency = (properly allocated) / total people
  // Over-allocation reduces efficiency
  const efficiency = Math.max(0, Math.min(100,
    ((fullyAllocated - overAllocated * 0.5) / totalPeople) * 100
  ));

  return Math.round(efficiency);
}

function calculateProjectHealthScore(dashboard: DashboardSummary): number {
  const active = dashboard.projectHealth?.ACTIVE || 0;
  const overdue = dashboard.projectHealth?.OVERDUE || 0;
  const planning = dashboard.projectHealth?.PLANNING || 0;
  const total = active + overdue + planning;
  
  if (total === 0) return 100;
  
  // Health score: active projects are good, overdue are bad, planning is neutral
  const score = ((active * 1.0 + planning * 0.7 - overdue * 0.5) / total) * 100;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function calculateCapacityBurnRate(dashboard: DashboardSummary): number {
  const gaps = dashboard.capacityGaps?.GAP || 0;
  const tight = dashboard.capacityGaps?.TIGHT || 0;
  const ok = dashboard.capacityGaps?.OK || 0;
  const total = gaps + tight + ok;
  
  if (total === 0) return 0;
  
  // Burn rate: how quickly we're consuming available capacity
  const burnRate = ((gaps + tight * 0.8) / total) * 100;
  return Math.round(burnRate);
}

function calculateAllocationAccuracy(dashboard: DashboardSummary): number {
  const totalPeople = dashboard.summary?.people || 1;
  const overAllocated = dashboard.utilization?.OVER_ALLOCATED ?? dashboard.utilization?.['Over-allocated'] ?? 0;

  // Accuracy = people allocated correctly / total people
  const accuracy = ((totalPeople - overAllocated) / totalPeople) * 100;
  return Math.max(0, Math.min(100, Math.round(accuracy)));
}

export function EnhancedKPIs({ dashboard, className = '' }: EnhancedKPIsProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const kpis: KPIMetric[] = React.useMemo(() => {
    const resourceEfficiency = calculateResourceEfficiency(dashboard);
    const projectHealthScore = calculateProjectHealthScore(dashboard);
    const capacityBurnRate = calculateCapacityBurnRate(dashboard);
    const allocationAccuracy = calculateAllocationAccuracy(dashboard);

    return [
      {
        id: 'resource-efficiency',
        title: t('dashboard:kpis.resourceEfficiency.title'),
        value: resourceEfficiency,
        displayValue: `${resourceEfficiency}%`,
        target: 85,
        unit: '%',
        trend: resourceEfficiency >= 85 ? 'up' : resourceEfficiency >= 70 ? 'stable' : 'down',
        status: resourceEfficiency >= 90 ? 'excellent' :
                resourceEfficiency >= 75 ? 'good' :
                resourceEfficiency >= 60 ? 'warning' : 'critical',
        description: t('dashboard:kpis.resourceEfficiency.description'),
        actionText: t('dashboard:kpis.resourceEfficiency.action'),
        navigationPath: '/people?tab=utilization',
        icon: Gauge
      },
      {
        id: 'project-health',
        title: t('dashboard:kpis.projectHealth.title'),
        value: projectHealthScore,
        displayValue: `${projectHealthScore}%`,
        target: 80,
        unit: '%',
        trend: projectHealthScore >= 80 ? 'up' : projectHealthScore >= 60 ? 'stable' : 'down',
        status: projectHealthScore >= 85 ? 'excellent' :
                projectHealthScore >= 70 ? 'good' :
                projectHealthScore >= 50 ? 'warning' : 'critical',
        description: t('dashboard:kpis.projectHealth.description'),
        actionText: t('dashboard:kpis.projectHealth.action'),
        navigationPath: '/projects',
        icon: Target
      },
      {
        id: 'capacity-burn-rate',
        title: t('dashboard:kpis.capacityBurnRate.title'),
        value: capacityBurnRate,
        displayValue: `${capacityBurnRate}%`,
        target: 70,
        unit: '%',
        trend: capacityBurnRate <= 60 ? 'up' : capacityBurnRate <= 80 ? 'stable' : 'down',
        status: capacityBurnRate <= 50 ? 'excellent' :
                capacityBurnRate <= 70 ? 'good' :
                capacityBurnRate <= 85 ? 'warning' : 'critical',
        description: t('dashboard:kpis.capacityBurnRate.description'),
        actionText: t('dashboard:kpis.capacityBurnRate.action'),
        navigationPath: '/reports?tab=capacity',
        icon: Activity
      },
      {
        id: 'allocation-accuracy',
        title: t('dashboard:kpis.allocationAccuracy.title'),
        value: allocationAccuracy,
        displayValue: `${allocationAccuracy}%`,
        target: 95,
        unit: '%',
        trend: allocationAccuracy >= 95 ? 'up' : allocationAccuracy >= 85 ? 'stable' : 'down',
        status: allocationAccuracy >= 95 ? 'excellent' :
                allocationAccuracy >= 85 ? 'good' :
                allocationAccuracy >= 70 ? 'warning' : 'critical',
        description: t('dashboard:kpis.allocationAccuracy.description'),
        actionText: t('dashboard:kpis.allocationAccuracy.action'),
        navigationPath: '/people?filter=overallocated',
        icon: Clock
      }
    ];
  }, [dashboard, t]);

  const handleKPIClick = (kpi: KPIMetric) => {
    navigate(kpi.navigationPath);
  };

  const handleKeyDown = (e: React.KeyboardEvent, kpi: KPIMetric) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleKPIClick(kpi);
    }
  };

  return (
    <section className={`enhanced-kpis ${className}`} role="region" aria-labelledby="kpis-heading">
      <h2 id="kpis-heading" className="sr-only">{t('dashboard:kpis.srHeading')}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => {
          const statusConfig = STATUS_CONFIG[kpi.status];
          const TrendIcon = TREND_ICONS[kpi.trend || 'stable'];
          const StatusIcon = statusConfig.icon;
          const KPIIcon = kpi.icon;

          return (
            <Card
              key={kpi.id}
              className={`kpi-card cursor-pointer transition-all hover:shadow-lg focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500 ${statusConfig.borderColor}`}
              onClick={() => handleKPIClick(kpi)}
            >
              <div
                className="p-4"
                tabIndex={0}
                onKeyDown={(e) => handleKeyDown(e, kpi)}
                role="button"
                aria-label={t('dashboard:kpis.itemAria', {
                  title: kpi.title,
                  value: kpi.displayValue,
                  description: kpi.description,
                  action: kpi.actionText.toLowerCase(),
                })}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className={`p-2 rounded-lg ${statusConfig.bgColor}`}>
                    <KPIIcon className={`w-5 h-5 ${statusConfig.color}`} aria-hidden="true" />
                  </div>
                  <div className="flex items-center gap-1">
                    <StatusIcon className={`w-4 h-4 ${statusConfig.color}`} aria-hidden="true" />
                    <TrendIcon className={`w-3 h-3 ${statusConfig.color}`} aria-hidden="true" />
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">{kpi.title}</h3>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold">{kpi.displayValue}</span>
                    {kpi.target && (
                      <span className="text-xs text-muted-foreground">
                        / {kpi.target}{kpi.unit} {t('dashboard:kpis.target')}
                      </span>
                    )}
                  </div>
                  
                  {kpi.target && (
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          kpi.value >= kpi.target 
                            ? 'bg-green-500 dark:bg-green-400' 
                            : kpi.value >= kpi.target * 0.8 
                            ? 'bg-yellow-500 dark:bg-yellow-400' 
                            : 'bg-red-500'
                        }`}
                        style={{ width: `${Math.min(100, (kpi.value / kpi.target) * 100)}%` }}
                        role="progressbar"
                        aria-valuenow={kpi.value}
                        aria-valuemin={0}
                        aria-valuemax={kpi.target}
                        aria-label={t('dashboard:kpis.progressAria', { target: kpi.target, unit: kpi.unit })}
                      />
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">{kpi.description}</p>

                  {kpi.value === 0 && kpi.id === 'resource-efficiency' ? (
                    <div className="text-xs text-yellow-600 mt-2 p-2 bg-yellow-50 rounded">
                      {t('dashboard:kpis.noAllocations')}
                    </div>
                  ) : (
                    <div className="text-xs font-medium text-blue-600 dark:text-blue-400 mt-2">
                      {kpi.actionText} →
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}