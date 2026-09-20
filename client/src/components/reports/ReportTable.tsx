import React from 'react';
import { Link } from 'react-router-dom';
import { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Column {
  header: string;
  accessor: string | ((row: any) => any);
  className?: string;
  render?: (value: any, row: any) => React.ReactNode;
}

interface ActionButton {
  to?: string;
  onClick?: () => void;
  icon?: LucideIcon;
  text: string;
  className?: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'outline';
}

interface ReportTableProps {
  title: string;
  columns: Column[];
  data: any[];
  rowClassName?: (row: any) => string;
  actions?: (row: any) => ActionButton[];
  emptyMessage?: string;
  maxRows?: number;
  className?: string;
}

export const ReportTable: React.FC<ReportTableProps> = ({
  title,
  columns,
  data,
  rowClassName,
  actions,
  emptyMessage,
  maxRows,
  className = ''
}) => {
  const { t } = useTranslation();
  const resolvedEmptyMessage = emptyMessage ?? t('common:noData');
  const displayData = maxRows ? data.slice(0, maxRows) : data;
  
  const getValue = (row: any, accessor: string | ((row: any) => any)) => {
    if (typeof accessor === 'function') {
      return accessor(row);
    }
    return row[accessor];
  };

  const renderActionButton = (action: ActionButton, index: number) => {
    const btnClass = `btn btn-sm ${action.variant ? `btn-${action.variant}` : 'btn-outline'} ${action.className || ''}`;
    
    if (action.to) {
      return (
        <Link key={index} to={action.to} className={btnClass}>
          {action.icon && <action.icon size={14} />} {action.text}
        </Link>
      );
    }
    
    return (
      <button key={index} onClick={action.onClick} className={btnClass}>
        {action.icon && <action.icon size={14} />} {action.text}
      </button>
    );
  };

  return (
    <div className={`report-table-container ${className}`}>
      <h3>{title}</h3>
      {displayData.length === 0 ? (
        <div className="table-empty-state">{resolvedEmptyMessage}</div>
      ) : (
        <table className="report-table">
          <thead>
            <tr>
              {columns.map((column, index) => (
                <th key={index} className={column.className}>
                  {column.header}
                </th>
              ))}
              {actions && <th>{t('common:actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {displayData.map((row, rowIndex) => (
              <tr key={rowIndex} className={rowClassName ? rowClassName(row) : ''}>
                {columns.map((column, colIndex) => {
                  const value = getValue(row, column.accessor);
                  return (
                    <td key={colIndex} className={column.className}>
                      {column.render ? column.render(value, row) : value}
                    </td>
                  );
                })}
                {actions && (
                  <td className="actions-cell">
                    {actions(row).map(renderActionButton)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};