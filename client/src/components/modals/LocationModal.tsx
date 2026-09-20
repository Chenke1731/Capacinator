import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Location } from '../../types';
import { api } from '../../lib/api-client';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import {
  ModalFormLayout,
  FormSection,
  FormActions,
  FormValidationErrors,
} from '../forms';

interface LocationModalProps {
  location?: Location | null;
  onSave: () => void;
  onCancel: () => void;
}

interface FormData {
  name: string;
  description: string;
}

interface FormErrors {
  name?: string;
  general?: string;
}

export function LocationModal({ location, onSave, onCancel }: LocationModalProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(true);
  const [formData, setFormData] = useState<FormData>({
    name: '',
    description: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEditing = !!location;

  useEffect(() => {
    if (location) {
      setFormData({
        name: location.name || '',
        description: location.description || '',
      });
    } else {
      setFormData({
        name: '',
        description: '',
      });
    }
    setErrors({});
  }, [location]);

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = t('locations:modal.nameRequired');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    try {
      setIsSubmitting(true);
      setErrors({});

      if (location) {
        await api.locations.update(location.id, formData);
      } else {
        await api.locations.create(formData);
      }

      onSave();
    } catch (err) {
      setErrors({ general: t('locations:modal.saveFailed') });
      console.error('Error saving location:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    // Clear field error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({
        ...prev,
        [field]: undefined,
      }));
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setTimeout(() => onCancel(), 200);
  };

  const hasErrors = Object.values(errors).some(Boolean);

  return (
    <ModalFormLayout
      title={isEditing ? t('locations:modal.editTitle') : t('locations:modal.createTitle')}
      description={
        isEditing
          ? t('locations:modal.editDescription')
          : t('locations:modal.createDescription')
      }
      isOpen={isOpen}
      onClose={handleClose}
      hasErrors={hasErrors}
      onSubmit={handleSubmit}
      maxWidth="max-w-md"
      footer={
        <FormActions
          isSubmitting={isSubmitting}
          isEditing={isEditing}
          onCancel={handleClose}
          createText={t('locations:modal.save')}
          updateText={t('locations:modal.save')}
        />
      }
    >
      {errors.general && (
        <FormValidationErrors hasErrors={true} message={errors.general} />
      )}

      <FormSection label={t('common:name')} required error={errors.name} htmlFor="name">
        <Input
          id="name"
          type="text"
          value={formData.name}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder={t('locations:modal.namePlaceholder')}
          className={errors.name ? 'border-destructive' : ''}
          aria-required="true"
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? 'name-error' : undefined}
        />
      </FormSection>

      <FormSection label={t('common:description')} htmlFor="description">
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => handleChange('description', e.target.value)}
          placeholder={t('locations:modal.descriptionPlaceholder')}
          rows={3}
        />
      </FormSection>
    </ModalFormLayout>
  );
}
