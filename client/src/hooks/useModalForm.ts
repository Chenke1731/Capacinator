import { useState, useCallback, useEffect } from 'react';
import { useMutation, useQueryClient, UseMutationResult } from '@tanstack/react-query';

/**
 * Validation function type - takes form values and returns an object with field-level errors
 */
export type ValidateFn<T> = (values: T) => Partial<Record<keyof T, string>>;

/**
 * Configuration for the useModalForm hook
 */
export interface UseModalFormConfig<T extends Record<string, any>, TResponse = any> {
  /** Initial values for the form */
  initialValues: T;
  /** Validation function that returns field-level errors */
  validate?: ValidateFn<T>;
  /** API function to create a new record */
  onCreate: (values: T) => Promise<TResponse>;
  /** API function to update an existing record */
  onUpdate: (id: string, values: T) => Promise<TResponse>;
  /** Query keys to invalidate on success */
  queryKeysToInvalidate: readonly (readonly string[])[];
  /** Additional query keys to invalidate on update (e.g., for the specific entity) */
  additionalUpdateQueryKeys?: (editingItem: any) => readonly (readonly string[])[];
  /** Callback called on successful create/update */
  onSuccess?: (data: TResponse, isEditing: boolean) => void;
  /** Callback called on error */
  onError?: (error: unknown, isEditing: boolean) => void;
  /** Callback to close the modal */
  onClose: () => void;
  /** The item being edited (if editing mode) */
  editingItem?: any;
  /** Custom function to extract form values from editing item */
  getValuesFromItem?: (item: any) => T;
}

/**
 * Return type for useModalForm hook
 */
export interface UseModalFormReturn<T extends Record<string, any>> {
  /** Current form values */
  values: T;
  /** Current field-level errors */
  errors: Partial<Record<keyof T, string>>;
  /** Whether the form has any errors */
  hasErrors: boolean;
  /** Whether we're in editing mode */
  isEditing: boolean;
  /** Whether a mutation is pending */
  isSubmitting: boolean;
  /** Handle input change for a single field */
  handleChange: <K extends keyof T>(field: K, value: T[K]) => void;
  /** Handle form submission */
  handleSubmit: (e: React.FormEvent) => void;
  /** Set multiple values at once */
  setValues: React.Dispatch<React.SetStateAction<T>>;
  /** Set errors manually */
  setErrors: React.Dispatch<React.SetStateAction<Partial<Record<keyof T, string>>>>;
  /** Reset form to initial values */
  reset: () => void;
  /** Handle close with animation delay */
  handleClose: () => void;
  /** Create mutation object for advanced usage */
  createMutation: UseMutationResult<any, unknown, T, unknown>;
  /** Update mutation object for advanced usage */
  updateMutation: UseMutationResult<any, unknown, T, unknown>;
}

/**
 * useModalForm - A reusable hook for modal form state, validation, and submission.
 *
 * Consolidates common patterns across modal components:
 * - Form state management with useState
 * - Validation with field-level errors
 * - Create/update mutations with React Query
 * - Automatic query invalidation on success
 * - Form reset when editing item changes
 *
 * @example
 * ```tsx
 * const { values, errors, handleChange, handleSubmit, isSubmitting } = useModalForm({
 *   initialValues: { name: '', email: '' },
 *   validate: (values) => {
 *     const errors = {};
 *     if (!values.name) errors.name = 'Name is required';
 *     if (!values.email) errors.email = 'Email is required';
 *     return errors;
 *   },
 *   onCreate: (values) => api.users.create(values),
 *   onUpdate: (id, values) => api.users.update(id, values),
 *   queryKeysToInvalidate: [['users']],
 *   onClose,
 *   editingItem,
 * });
 * ```
 */
export function useModalForm<T extends Record<string, any>, TResponse = any>(
  config: UseModalFormConfig<T, TResponse>
): UseModalFormReturn<T> {
  const {
    initialValues,
    validate,
    onCreate,
    onUpdate,
    queryKeysToInvalidate,
    additionalUpdateQueryKeys,
    onSuccess,
    onError,
    onClose,
    editingItem,
    getValuesFromItem,
  } = config;

  const queryClient = useQueryClient();
  const isEditing = !!editingItem;

  // Form state
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});

  // Reset form when editingItem changes
  useEffect(() => {
    if (editingItem && getValuesFromItem) {
      setValues(getValuesFromItem(editingItem));
    } else if (editingItem) {
      // Default behavior: extract matching keys from editingItem
      const newValues = { ...initialValues };
      for (const key of Object.keys(initialValues) as (keyof T)[]) {
        if (editingItem[key] !== undefined) {
          newValues[key] = editingItem[key];
        }
      }
      setValues(newValues);
    } else {
      setValues(initialValues);
    }
    setErrors({});
  }, [editingItem]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: T) => onCreate(data),
    onSuccess: (data) => {
      for (const queryKey of queryKeysToInvalidate) {
        queryClient.invalidateQueries({ queryKey });
      }
      onSuccess?.(data, false);
      onClose();
    },
    onError: (error) => {
      console.error('Failed to create:', error);
      onError?.(error, false);
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: T) => onUpdate(editingItem?.id, data),
    onSuccess: (data) => {
      for (const queryKey of queryKeysToInvalidate) {
        queryClient.invalidateQueries({ queryKey });
      }
      // Also invalidate additional query keys (e.g., for specific entity)
      if (editingItem && additionalUpdateQueryKeys) {
        for (const queryKey of additionalUpdateQueryKeys(editingItem)) {
          queryClient.invalidateQueries({ queryKey });
        }
      }
      onSuccess?.(data, true);
      onClose();
    },
    onError: (error) => {
      console.error('Failed to update:', error);
      onError?.(error, true);
    },
  });

  // Handle field change
  const handleChange = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    // Clear error for this field when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  }, [errors]);

  // Handle form submission
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();

    // Run validation if provided
    const newErrors = validate ? validate(values) : {};

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    if (isEditing) {
      updateMutation.mutate(values);
    } else {
      createMutation.mutate(values);
    }
  }, [values, validate, isEditing, createMutation, updateMutation]);

  // Reset form to initial values
  const reset = useCallback(() => {
    setValues(initialValues);
    setErrors({});
  }, [initialValues]);

  // Handle close with animation delay
  const handleClose = useCallback(() => {
    setTimeout(() => onClose(), 200);
  }, [onClose]);

  const hasErrors = Object.keys(errors).filter((key) => !!errors[key as keyof T]).length > 0;
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return {
    values,
    errors,
    hasErrors,
    isEditing,
    isSubmitting,
    handleChange,
    handleSubmit,
    setValues,
    setErrors,
    reset,
    handleClose,
    createMutation,
    updateMutation,
  };
}

export default useModalForm;
