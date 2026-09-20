import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Clock,
  Users,
  TrendingDown,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '../ui/alert';
import { Card } from '../ui/CustomCard';
import { getLocale } from '../../i18n';
import './Dashboard.css';

interface CriticalAlert {
  id: string;
  type: 'capacity_gap' | 'project_risk' | 'deadline_warning' | 'over_allocation';
  severity: 'critical' | 'high' | 'medium';
  title: string;
  description: string;
  actionText: string;
  navigationPath: string;
  count?: number;
  dueDate?: string;
}

interface CriticalAlertsPanelProps {
  alerts: CriticalAlert[];
  className?: string;
}

const ALERT_CONFIG = {
  capacity_gap: {
    icon: Users,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200'
  },
  project_risk: {
    icon: AlertTriangle,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200'
  },
  deadline_warning: {
    icon: Clock,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200'
  },
  over_allocation: {
    icon: TrendingDown,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200'
  }
};

const SEVERITY_CONFIG = {
  critical: {
    variant: 'destructive' as const,
    priority: 1
  },
  high: {
    variant: 'destructive' as const,
    priority: 2
  },
  medium: {
    variant: 'default' as const,
    priority: 3
  }
};

export function CriticalAlertsPanel({ alerts, className = '' }: CriticalAlertsPanelProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Sort alerts by severity (critical first)
  const sortedAlerts = [...alerts].sort((a, b) => 
    SEVERITY_CONFIG[a.severity].priority - SEVERITY_CONFIG[b.severity].priority
  );

  const handleAlertClick = (alert: CriticalAlert) => {
    navigate(alert.navigationPath);
  };

  const handleKeyDown = (e: React.KeyboardEvent, alert: CriticalAlert) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleAlertClick(alert);
    }
  };

  if (alerts.length === 0) {
    return (
      <Card title={t('dashboard:alerts.systemStatus')} className={`dashboard-alerts-panel ${className}`}>
        <div className="dashboard-healthy-state">
          <div className="dashboard-healthy-icon">
            <Users className="w-6 h-6" />
          </div>
          <p className="text-sm font-medium">{t('dashboard:alerts.allHealthy')}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {t('dashboard:alerts.noIssues')}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title={t('dashboard:alerts.title')}
      className={`dashboard-alerts-panel ${className}`}
      actions={
        <span className="text-xs text-muted-foreground">
          {t('dashboard:alerts.issueCount', { count: alerts.length })}
        </span>
      }
    >
      <div className="space-y-3" role="list" aria-label={t('dashboard:alerts.listAria')}>
        {sortedAlerts.map((alert) => {
          const config = ALERT_CONFIG[alert.type];
          const severityConfig = SEVERITY_CONFIG[alert.severity];
          const IconComponent = config.icon;

          return (
            <Alert
              key={alert.id}
              variant={severityConfig.variant}
              className={`dashboard-alert-item ${config.borderColor}`}
              onClick={() => handleAlertClick(alert)}
              tabIndex={0}
              onKeyDown={(e) => handleKeyDown(e, alert)}
              role="listitem"
              aria-label={t('dashboard:alerts.itemAria', {
                severity: t(`dashboard:alerts.severity.${alert.severity}`),
                title: alert.title,
                description: alert.description,
                action: alert.actionText.toLowerCase(),
              })}
            >
              <div className="flex items-start gap-3">
                <div className={`dashboard-alert-icon p-2 rounded-full ${config.bgColor}`}>
                  <IconComponent className={`w-4 h-4 ${config.color}`} aria-hidden="true" />
                </div>
                <div className="dashboard-alert-content">
                  <AlertTitle className="flex items-center justify-between">
                    <span className="truncate">
                      {alert.title}
                      {alert.count && (
                        <span className={`dashboard-alert-badge ml-2 bg-white/50 ${config.color}`}>
                          {alert.count}
                        </span>
                      )}
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
                  </AlertTitle>
                  <AlertDescription className="mt-1">
                    <p className="text-sm text-muted-foreground">{alert.description}</p>
                    {alert.dueDate && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('dashboard:alerts.due')} {new Date(alert.dueDate).toLocaleDateString(getLocale())}
                      </p>
                    )}
                    <div className="flex items-center gap-1 mt-2 text-xs font-medium">
                      <ExternalLink className="w-3 h-3" aria-hidden="true" />
                      {alert.actionText}
                    </div>
                  </AlertDescription>
                </div>
              </div>
            </Alert>
          );
        })}
      </div>
    </Card>
  );
}