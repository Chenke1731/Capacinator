import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, X, Edit2 } from 'lucide-react';
import { cn } from '../../lib/utils';

interface InlineEditProps {
  value: string | number | boolean;
  onSave: (value: string | number | boolean) => void;
  type?: 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'textarea' | 'email' | 'tel';
  options?: Array<{ value: any; label: string }>;
  min?: number;
  max?: number;
  rows?: number;
  placeholder?: string;
  icon?: React.ComponentType<{ size?: number }>;
  disabled?: boolean;
  className?: string;
  renderValue?: (value: string | number | boolean) => React.ReactNode;
}

export function InlineEdit({
  value,
  onSave,
  type = 'text',
  options,
  min,
  max,
  rows = 3,
  placeholder = '',
  icon,
  disabled = false,
  className,
  renderValue
}: InlineEditProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [error, setError] = useState('');
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current instanceof HTMLInputElement || inputRef.current instanceof HTMLTextAreaElement) {
        inputRef.current.select();
      }
    }
  }, [isEditing]);

  const handleSave = () => {
    // Validation
    if (type === 'number') {
      const numValue = Number(editValue);
      if (isNaN(numValue)) {
        setError('Invalid number');
        return;
      }
      if (min !== undefined && numValue < min) {
        setError(`Minimum value is ${min}`);
        return;
      }
      if (max !== undefined && numValue > max) {
        setError(`Maximum value is ${max}`);
        return;
      }
    }

    onSave(editValue);
    setIsEditing(false);
    setError('');
  };

  const handleCancel = () => {
    setEditValue(value);
    setIsEditing(false);
    setError('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (type !== 'textarea' || e.ctrlKey)) {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  // Default display value rendering
  const getDisplayValue = () => {
    if (renderValue) {
      return renderValue(value);
    }
    
    if (type === 'select' && options) {
      return options.find(opt => opt.value === value)?.label || placeholder || 'Not specified';
    } else if (type === 'checkbox') {
      return (
        <span className={`badge ${value ? 'badge-success' : 'badge-gray'}`}>
          {value ? 'Yes' : 'No'}
        </span>
      );
    } else {
      return value || placeholder || 'Not specified';
    }
  };

  if (!isEditing) {
    return (
      <div
        className={cn(
          "info-value inline-editable inline-flex items-center gap-1 px-2 py-1 rounded transition-colors",
          !disabled && "cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800",
          disabled && "opacity-50 cursor-not-allowed",
          className
        )}
        onClick={() => !disabled && setIsEditing(true)}
      >
        {icon && React.createElement(icon, { size: 16 })}
        <span>{getDisplayValue()}</span>
        {!disabled && <Edit2 size={14} className="edit-icon ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />}
      </div>
    );
  }

  return (
    <div className="inline-edit-container inline-flex items-center gap-1">
      {type === 'select' && options ? (
        <select
          ref={inputRef as React.RefObject<HTMLSelectElement>}
          value={editValue || ''}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          className="form-select px-2 py-1 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          autoFocus
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : type === 'checkbox' ? (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="checkbox"
          checked={Boolean(editValue)}
          onChange={(e) => setEditValue(e.target.checked)}
          onKeyDown={handleKeyDown}
          className="form-checkbox"
          autoFocus
        />
      ) : type === 'textarea' ? (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={editValue || ''}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={rows}
          className="form-textarea px-2 py-1 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-vertical"
          autoFocus
        />
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type={type}
          value={editValue || ''}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          min={min}
          max={max}
          className={cn(
            "form-input px-2 py-1 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100",
            type === 'number' && "w-20",
            type === 'date' && "w-36",
            error && "border-red-500"
          )}
          autoFocus
        />
      )}
      <button
        onClick={handleSave}
        className="p-1 text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
        title={t('common:save')}
      >
        <Check size={16} />
      </button>
      <button
        onClick={handleCancel}
        className="p-1 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
        title={t('common:cancel')}
      >
        <X size={16} />
      </button>
      {error && (
        <span className="text-xs text-red-500 ml-2">{error}</span>
      )}
    </div>
  );
}