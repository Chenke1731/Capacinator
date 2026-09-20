import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './FilterBar.css';

interface FilterOption {
  value: string;
  label: string;
}

interface Filter {
  name: string;
  label: string;
  type: 'select' | 'search';
  options?: FilterOption[];
  placeholder?: string;
}

interface FilterBarProps {
  filters: Filter[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  onReset?: () => void;
}

export function FilterBar({ filters, values, onChange, onReset }: FilterBarProps) {
  const { t } = useTranslation();
  const hasActiveFilters = Object.values(values).some(v => v !== '');

  return (
    <div className="filter-bar" data-testid="filter-panel">
      <div className="filter-bar-content">
        {filters.map((filter) => (
          <div key={filter.name} className="filter-item">
            <label className="filter-label">{filter.label}</label>
            {filter.type === 'search' ? (
              <div className="search-input-wrapper">
                <Search size={16} className="search-icon" />
                <input
                  type="text"
                  className="form-control search-input"
                  placeholder={filter.placeholder || `Search ${filter.label.toLowerCase()}...`}
                  value={values[filter.name] || ''}
                  onChange={(e) => onChange(filter.name, e.target.value)}
                />
              </div>
            ) : (
              <select
                className="form-control form-select"
                value={values[filter.name] || ''}
                onChange={(e) => onChange(filter.name, e.target.value)}
              >
                <option value="">{t('common:filterAll', { label: filter.label })}</option>
                {filter.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        ))}
      </div>
      {hasActiveFilters && onReset && (
        <button className="btn btn-secondary btn-sm" onClick={onReset}>
          Reset Filters
        </button>
      )}
    </div>
  );
}