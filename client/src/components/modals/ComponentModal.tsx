import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Component } from '../../types';
import { api } from '../../lib/api-client';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import {
  ModalFormLayout,
  FormSection,
  FormActions,
  FormValidationErrors,
} from '../forms';

interface ComponentModalProps {
  component?: Component | null;
  onSave: () => void;
  onCancel: () => void;
}

interface FormData {
  name: string;
  code: string;
  description: string;
}

interface FormErrors {
  name?: string;
  general?: string;
}

export function ComponentModal({ component, onSave, onCancel }: ComponentModalProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(true);
  const [formData, setFormData] = useState<FormData>({
    name: '',
    code: '',
    description: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEditing = !!component;

  useEffect(() => {
    if (component) {
      setFormData({
        name: component.name || '',
        code: component.code || '',
        description: component.description || '',
      });
    } else {
      setFormData({ name: '', code: '', description: '' });
    }
    setErrors({});
  }, [component]);

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    if (!formData.name.trim()) {
      newErrors.name = t('components:modal.nameRequired');
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

      if (component) {
        await api.components.update(component.id, formData);
      } else {
        await api.components.create(formData);
      }

      onSave();
    } catch (err) {
      setErrors({ general: t('components:modal.saveFailed') });
      console.error('Error saving component:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    if (errors[field as keyof FormErrors]) {
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
      title={isEditing ? t('components:modal.editTitle') : t('components:modal.createTitle')}
      description={
        isEditing
          ? t('components:modal.editDescription')
          : t('components:modal.createDescription')
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
          createText={t('components:modal.save')}
          updateText={t('components:modal.save')}
        />
      }
    >
      {errors.general && (
        <FormValidationErrors hasErrors={true} message={errors.general} />
      )}

      <FormSection label={t('common:name')} required error={errors.name} htmlFor="component-name">
        <Input
          id="component-name"
          type="text"
          value={formData.name}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder={t('components:modal.namePlaceholder')}
          className={errors.name ? 'border-destructive' : ''}
          aria-required="true"
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? 'component-name-error' : undefined}
        />
      </FormSection>

      <FormSection label={t('components:modal.codeLabel')} htmlFor="component-code">
        <Input
          id="component-code"
          type="text"
          value={formData.code}
          onChange={(e) => handleChange('code', e.target.value)}
          placeholder={t('components:modal.codePlaceholder')}
        />
      </FormSection>

      <FormSection label={t('common:description')} htmlFor="component-description">
        <Textarea
          id="component-description"
          value={formData.description}
          onChange={(e) => handleChange('description', e.target.value)}
          placeholder={t('components:modal.descriptionPlaceholder')}
          rows={3}
        />
      </FormSection>
    </ModalFormLayout>
  );
}
