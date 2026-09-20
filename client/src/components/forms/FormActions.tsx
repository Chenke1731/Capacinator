/**
 * FormActions Component
 *
 * Save/Cancel button group for modal forms with loading state support.
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import type { FormActionsProps } from './types';

/**
 * FormActions provides consistent save/cancel buttons for forms.
 *
 * @example
 * ```tsx
 * <FormActions
 *   isSubmitting={isSubmitting}
 *   isEditing={!!editingPerson}
 *   onCancel={handleClose}
 *   createText="Add Person"
 *   updateText="Save Changes"
 * />
 * ```
 */
export const FormActions = React.forwardRef<HTMLDivElement, FormActionsProps>(
  (
    {
      isSubmitting,
      isEditing,
      onCancel,
      createText,
      updateText,
      cancelText,
      className,
    },
    ref
  ) => {
    const { t } = useTranslation();
    const submitText = isEditing ? (updateText ?? t('common:update')) : (createText ?? t('common:create'));
    const loadingText = isEditing ? t('common:updating') : t('common:creating');

    return (
      <div ref={ref} className={cn('flex justify-end gap-2', className)}>
        <Button type="button" variant="outline" onClick={onCancel}>
          {cancelText ?? t('common:cancel')}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Spinner size="sm" className="mr-2" />
              {loadingText}
            </>
          ) : (
            submitText
          )}
        </Button>
      </div>
    );
  }
);

FormActions.displayName = 'FormActions';
