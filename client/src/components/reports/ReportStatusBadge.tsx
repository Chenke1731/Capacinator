import React from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'default';

interface ReportStatusBadgeProps {
  status: string;
  variant?: BadgeVariant;
  className?: string;
}

export const ReportStatusBadge: React.FC<ReportStatusBadgeProps> = ({
  status,
  variant = 'default',
  className = ''
}) => {
  const { t } = useTranslation();

  // Localized display label for a status value, falling back to the raw status
  const statusKey = `reports:status.${status.toLowerCase().replace(/\s+/g, '_')}`;
  const label = i18n.exists(statusKey) ? t(statusKey) : status;

  return (
    <span className={`report-status-badge badge-${variant} ${className}`}>
      {label}
    </span>
  );
};