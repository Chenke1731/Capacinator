/**
 * SearchableSelect Component
 *
 * A select dropdown with search/filter capability that wraps
 * the Radix UI Select component with additional functionality.
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { SearchableSelectProps } from './types';

/**
 * SearchableSelect provides a select dropdown with optional "None" option.
 *
 * @example
 * ```tsx
 * <SearchableSelect
 *   id="project"
 *   label="Project"
 *   value={formData.project_id}
 *   onChange={(value) => handleChange('project_id', value)}
 *   options={projects.map(p => ({ value: p.id, label: p.name }))}
 *   placeholder="Select a project"
 *   required
 *   error={errors.project_id}
 *   showNone
 * />
 * ```
 */
export const SearchableSelect = React.forwardRef<HTMLDivElement, SearchableSelectProps>(
  (
    {
      id,
      label,
      value,
      onChange,
      options,
      placeholder,
      required = false,
      error,
      disabled = false,
      className,
      description,
      showNone = false,
      noneLabel,
    },
    ref
  ) => {
    const { t } = useTranslation();
    const resolvedPlaceholder = placeholder ?? t('common:forms.selectAnOption');
    const resolvedNoneLabel = noneLabel ?? t('common:none');
    const errorId = `${id}-error`;
    const descriptionId = description ? `${id}-description` : undefined;

    // Handle the "none" value conversion
    const handleValueChange = (newValue: string) => {
      onChange(newValue === '__none__' ? '' : newValue);
    };

    // Convert empty string to "__none__" for internal select state
    const selectValue = value === '' && showNone ? '__none__' : value;

    return (
      <div ref={ref} className={cn('space-y-2', className)}>
        <Label htmlFor={id}>
          {label}
          {required && (
            <>
              <span aria-hidden="true" className="text-destructive ml-1">
                *
              </span>
              <span className="sr-only">{t('common:forms.requiredSrOnly')}</span>
            </>
          )}
        </Label>

        {description && (
          <p id={descriptionId} className="text-sm text-muted-foreground">
            {description}
          </p>
        )}

        <Select
          value={selectValue}
          onValueChange={handleValueChange}
          disabled={disabled}
        >
          <SelectTrigger
            id={id}
            className={cn(error && 'border-destructive')}
            aria-required={required}
            aria-invalid={!!error}
            aria-describedby={
              [error && errorId, descriptionId].filter(Boolean).join(' ') ||
              undefined
            }
          >
            <SelectValue placeholder={resolvedPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {showNone && (
              <SelectItem value="__none__">{resolvedNoneLabel}</SelectItem>
            )}
            {options.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {error && (
          <p
            id={errorId}
            className="text-sm text-destructive"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>
    );
  }
);

SearchableSelect.displayName = 'SearchableSelect';
