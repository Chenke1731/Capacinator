/**
 * FormSection Component
 *
 * A labeled form section wrapper that provides consistent styling
 * and accessibility attributes for form fields.
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { FormSectionProps } from './types';

/**
 * FormSection wraps a form field with its label and error display.
 *
 * @example
 * ```tsx
 * <FormSection
 *   label="Name"
 *   required
 *   error={errors.name}
 *   htmlFor="name"
 * >
 *   <Input
 *     id="name"
 *     value={formData.name}
 *     onChange={(e) => handleChange('name', e.target.value)}
 *   />
 * </FormSection>
 * ```
 */
export const FormSection = React.forwardRef<HTMLDivElement, FormSectionProps>(
  (
    {
      label,
      required = false,
      error,
      htmlFor,
      description,
      className,
      children,
    },
    ref
  ) => {
    const { t } = useTranslation();
    const errorId = htmlFor ? `${htmlFor}-error` : undefined;
    const descriptionId = htmlFor && description ? `${htmlFor}-description` : undefined;

    return (
      <div ref={ref} className={cn('space-y-2', className)}>
        <Label htmlFor={htmlFor}>
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
          <p
            id={descriptionId}
            className="text-sm text-muted-foreground"
          >
            {description}
          </p>
        )}

        {children}

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

FormSection.displayName = 'FormSection';
