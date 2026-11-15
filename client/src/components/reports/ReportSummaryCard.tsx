import React from 'react';
import { Link } from 'react-router-dom';
import { LucideIcon } from 'lucide-react';

interface ReportSummaryCardProps {
  title: string;
  metric: string | number;
  metricType?: 'default' | 'danger' | 'warning' | 'success';
  unit?: string;
  actionLink?: {
    to: string;
    icon: LucideIcon;
    text: string;
  };
  className?: string;
}

export const ReportSummaryCard: React.FC<ReportSummaryCardProps> = ({
  title,
  metric,
  metricType = 'default',
  unit = '',
  actionLink,
  className = ''
}) => {
  const metricClass = metricType !== 'default' ? `text-${metricType}` : '';
  
  return (
    <div className={`summary-card ${className}`}>
      <h4>{title}</h4>
      <div className={`metric ${metricClass}`}>
        {metric}{unit}
      </div>
      {actionLink && (
        <Link to={actionLink.to} className="card-action-link">
          <actionLink.icon size={14} /> {actionLink.text}
        </Link>
      )}
    </div>
  );
};