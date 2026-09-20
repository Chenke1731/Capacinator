/**
 * AllocationSlider Component
 *
 * A percentage slider for allocation inputs with visual feedback
 * and optional available capacity indicator.
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { AllocationSliderProps } from './types';

/**
 * AllocationSlider provides a slider for percentage-based allocation inputs.
 *
 * @example
 * ```tsx
 * <AllocationSlider
 *   value={formData.allocation_percentage}
 *   onChange={(value) => handleChange('allocation_percentage', value)}
 *   label="Allocation"
 *   required
 *   error={errors.allocation_percentage}
 *   availableCapacity={50}
 * />
 * ```
 */
export const AllocationSlider = React.forwardRef<HTMLDivElement, AllocationSliderProps>(
  (
    {
      value,
      onChange,
      label,
      required = false,
      error,
      disabled = false,
      min = 0,
      max = 100,
      step = 5,
      availableCapacity,
      className,
    },
    ref
  ) => {
    const { t } = useTranslation();
    const resolvedLabel = label ?? t('common:allocation');

    // Calculate the percentage fill for the visual indicator
    const fillPercentage = ((value - min) / (max - min)) * 100;

    // Determine if allocation exceeds available capacity
    const isOverAllocated = availableCapacity !== undefined && value > availableCapacity;

    return (
      <div ref={ref} className={cn('space-y-2', className)}>
        <Label htmlFor="allocation-slider">
          {resolvedLabel}: {value}%
          {required && (
            <>
              <span aria-hidden="true" className="text-destructive ml-1">
                *
              </span>
              <span className="sr-only">{t('common:forms.requiredSrOnly')}</span>
            </>
          )}
        </Label>

        <div className="relative">
          <input
            id="allocation-slider"
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(parseInt(e.target.value, 10))}
            disabled={disabled}
            className={cn(
              'w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer',
              'dark:bg-slate-700',
              '[&::-webkit-slider-thumb]:appearance-none',
              '[&::-webkit-slider-thumb]:w-4',
              '[&::-webkit-slider-thumb]:h-4',
              '[&::-webkit-slider-thumb]:bg-blue-600',
              '[&::-webkit-slider-thumb]:rounded-full',
              '[&::-webkit-slider-thumb]:cursor-pointer',
              '[&::-webkit-slider-thumb]:transition-transform',
              '[&::-webkit-slider-thumb]:hover:scale-110',
              '[&::-moz-range-thumb]:w-4',
              '[&::-moz-range-thumb]:h-4',
              '[&::-moz-range-thumb]:bg-blue-600',
              '[&::-moz-range-thumb]:border-0',
              '[&::-moz-range-thumb]:rounded-full',
              '[&::-moz-range-thumb]:cursor-pointer',
              disabled && 'opacity-50 cursor-not-allowed',
              error && 'border-destructive'
            )}
            aria-required={required}
            aria-invalid={!!error}
            aria-describedby={error ? 'allocation-slider-error' : undefined}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={value}
            aria-valuetext={`${value} percent`}
          />

          {/* Visual fill indicator */}
          <div
            className="absolute top-0 left-0 h-2 bg-blue-600 rounded-l-lg pointer-events-none"
            style={{ width: `${fillPercentage}%` }}
            aria-hidden="true"
          />
        </div>

        {/* Guide markers */}
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{min}%</span>
          <span>{max}%</span>
        </div>

        {/* Available capacity indicator */}
        {availableCapacity !== undefined && (
          <div
            className={cn(
              'text-xs',
              isOverAllocated ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
            )}
          >
            {isOverAllocated ? (
              <span>
                {t('common:forms.overAllocatedBy', { amount: value - availableCapacity, available: availableCapacity })}
              </span>
            ) : (
              <span>{t('common:forms.percentAvailable', { available: availableCapacity })}</span>
            )}
          </div>
        )}

        {error && (
          <p
            id="allocation-slider-error"
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

AllocationSlider.displayName = 'AllocationSlider';
