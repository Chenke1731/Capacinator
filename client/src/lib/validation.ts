/**
 * Form Validation Utilities
 *
 * Cross-field validation utilities for forms throughout the application.
 * These validators return either true (valid) or an error message string (invalid).
 * Messages are localized via i18n; in the English locale they are identical
 * to the historical English strings.
 */

import i18n from '../i18n';

/**
 * Validates email format
 * @param email - Email address to validate
 * @returns true if valid, error message if invalid
 */
export const validateEmail = (email: string): true | string => {
  if (!email) return i18n.t('validation:emailRequired');

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return i18n.t('validation:invalidEmailFormat');
  }

  return true;
};

/**
 * Validates a date range (start < end)
 * @param startDate - Start date string (ISO format or empty)
 * @param endDate - End date string (ISO format or empty)
 * @param allowEmpty - Whether to allow both dates to be empty (default: true)
 * @returns true if valid, error message if invalid
 */
export const validateDateRange = (
  startDate: string,
  endDate: string,
  allowEmpty = true
): true | string => {
  // If both are empty and allowed, it's valid
  if (!startDate && !endDate && allowEmpty) {
    return true;
  }

  // If only one is provided, it's invalid
  if ((!startDate && endDate) || (startDate && !endDate)) {
    return i18n.t('validation:bothDatesRequired');
  }

  // Parse and compare dates
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return i18n.t('validation:invalidDateFormat');
    }

    if (start >= end) {
      return i18n.t('validation:endAfterStart');
    }
  }

  return true;
};

/**
 * Validates allocation percentage (0-100)
 * @param percentage - Allocation percentage value
 * @returns true if valid, error message if invalid
 */
export const validateAllocationPercentage = (
  percentage: number | string
): true | string => {
  const value = typeof percentage === 'string' ? parseFloat(percentage) : percentage;

  if (isNaN(value)) {
    return i18n.t('validation:allocationMustBeNumber');
  }

  if (value <= 0 || value > 100) {
    return i18n.t('validation:allocationRange');
  }

  return true;
};

/**
 * Validates hours per day (1-24)
 * @param hours - Hours per day value
 * @returns true if valid, error message if invalid
 */
export const validateHoursPerDay = (hours: number | string): true | string => {
  const value = typeof hours === 'string' ? parseFloat(hours) : hours;

  if (isNaN(value)) {
    return i18n.t('validation:hoursMustBeNumber');
  }

  if (value <= 0 || value > 24) {
    return i18n.t('validation:hoursRange');
  }

  return true;
};

/**
 * Validates availability percentage (0-100)
 * @param percentage - Availability percentage value
 * @returns true if valid, error message if invalid
 */
export const validateAvailabilityPercentage = (
  percentage: number | string
): true | string => {
  const value = typeof percentage === 'string' ? parseFloat(percentage) : percentage;

  if (isNaN(value)) {
    return i18n.t('validation:availabilityMustBeNumber');
  }

  if (value < 0 || value > 100) {
    return i18n.t('validation:availabilityRange');
  }

  return true;
};

/**
 * Validates a name/text field (non-empty, not just whitespace)
 * @param name - Name/text to validate
 * @param fieldName - Display name of the field for error messages
 * @param maxLength - Maximum allowed length (optional)
 * @returns true if valid, error message if invalid
 */
export const validateName = (
  name: string,
  fieldName = 'Name',
  maxLength?: number
): true | string => {
  if (!name || !name.trim()) {
    return i18n.t('validation:fieldRequired', { field: fieldName });
  }

  if (maxLength && name.length > maxLength) {
    return i18n.t('validation:fieldTooLong', { field: fieldName, count: maxLength });
  }

  return true;
};

/**
 * Validates project type name
 * @param name - Project type name
 * @returns true if valid, error message if invalid
 */
export const validateProjectTypeName = (name: string): true | string => {
  return validateName(name, i18n.t('common:projectTypeName'), 100);
};

/**
 * Validates that a required field is selected
 * @param value - Selected value (should be non-empty)
 * @param fieldName - Display name of the field
 * @returns true if valid, error message if invalid
 */
export const validateRequired = (value: string, fieldName = 'Field'): true | string => {
  if (!value || !value.trim()) {
    return i18n.t('validation:fieldRequired', { field: fieldName });
  }
  return true;
};

/**
 * Combined validator for date range fields in forms
 * Returns object with field-level errors
 */
export const validateDateRangeFields = (
  startDate: string,
  endDate: string,
  fieldNameStart = 'Start date',
  fieldNameEnd = 'End date'
): Record<string, string> => {
  const errors: Record<string, string> = {};

  // Check for partial completion
  if ((startDate && !endDate) || (!startDate && endDate)) {
    errors.start_date = i18n.t('validation:bothFieldsRequired', {
      fieldA: fieldNameStart,
      fieldB: fieldNameEnd,
    });
    errors.end_date = i18n.t('validation:bothFieldsRequired', {
      fieldA: fieldNameStart,
      fieldB: fieldNameEnd,
    });
    return errors;
  }

  // If both provided, check range
  if (startDate && endDate) {
    const rangeError = validateDateRange(startDate, endDate, false);
    if (rangeError !== true) {
      errors.end_date = rangeError;
    }
  }

  return errors;
};
