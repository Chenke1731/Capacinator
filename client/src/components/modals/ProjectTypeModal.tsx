import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api-client';
import { queryKeys } from '../../lib/queryKeys';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Alert, AlertDescription } from '../ui/alert';
import { Spinner } from '../ui/spinner';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';

interface ProjectTypeFormData {
  name: string;
  description: string;
  color_code: string;
}

interface ProjectTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (projectType: any) => void;
  editingProjectType?: any;
}

const DEFAULT_COLORS = [
  '#4f46e5', // indigo
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#f97316', // orange
  '#ec4899', // pink
  '#6b7280', // gray
];

export const ProjectTypeModal: React.FC<ProjectTypeModalProps> = ({ 
  isOpen, 
  onClose, 
  onSuccess,
  editingProjectType 
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isEditing = !!editingProjectType;
  
  const [formData, setFormData] = useState<ProjectTypeFormData>({
    name: '',
    description: '',
    color_code: DEFAULT_COLORS[0]
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Update form data when editingProjectType changes
  useEffect(() => {
    if (editingProjectType) {
      setFormData({
        name: editingProjectType.name || '',
        description: editingProjectType.description || '',
        color_code: editingProjectType.color_code || DEFAULT_COLORS[0]
      });
    } else {
      setFormData({
        name: '',
        description: '',
        color_code: DEFAULT_COLORS[0]
      });
    }
    // Clear errors when switching between add/edit
    setErrors({});
  }, [editingProjectType]);

  // Mutations
  const createProjectTypeMutation = useMutation({
    mutationFn: async (data: ProjectTypeFormData) => {
      const response = await api.projectTypes.create(data);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectTypes.all });
      if (onSuccess) {
        onSuccess(data);
      }
      onClose();
    }
  });

  const updateProjectTypeMutation = useMutation({
    mutationFn: async (data: ProjectTypeFormData) => {
      const response = await api.projectTypes.update(editingProjectType.id, data);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectTypes.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.projectTypes.detail(editingProjectType.id) });
      if (onSuccess) {
        onSuccess(data);
      }
      onClose();
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = t('projects:projectTypes.validation.nameRequired');
    if (formData.name.length > 100) newErrors.name = t('projects:projectTypes.validation.nameTooLong');

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    if (isEditing) {
      updateProjectTypeMutation.mutate(formData);
    } else {
      createProjectTypeMutation.mutate(formData);
    }
  };

  const handleChange = (field: keyof ProjectTypeFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const isLoading = createProjectTypeMutation.isPending || updateProjectTypeMutation.isPending;

  const hasErrors = Object.keys(errors).length > 0;

  const handleClose = () => {
    // Give time for animation before calling onClose
    setTimeout(() => onClose(), 200);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? t('projects:projectTypes.editTitle') : t('projects:projectTypes.createTitle')}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? t('projects:projectTypes.editDescription')
              : t('projects:projectTypes.createDescription')}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">

          {hasErrors && (
            <Alert variant="destructive" className="mb-6" role="alert" aria-live="assertive">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <AlertDescription>
                {t('projects:fixErrors')}
              </AlertDescription>
            </Alert>
          )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">{t('common:name')} <span aria-hidden="true">*</span><span className="sr-only">{t('projects:a11yRequired')}</span></Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder={t('projects:projectTypes.placeholderName')}
              maxLength={100}
              className={errors.name ? 'border-destructive' : ''}
              aria-required="true"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'name-error' : undefined}
            />
            {errors.name && <p id="name-error" className="text-sm text-destructive" role="alert">{errors.name}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t('common:description')}</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder={t('projects:projectTypes.placeholderDescriptionOptional')}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="color_code">{t('projects:projectTypes.color')}</Label>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Input
                  type="color"
                  id="color_code"
                  value={formData.color_code}
                  onChange={(e) => handleChange('color_code', e.target.value)}
                  className="h-10 w-20 cursor-pointer"
                />
                <span className="text-sm text-muted-foreground">{formData.color_code}</span>
              </div>
              
              <div className="flex flex-wrap gap-2" role="group" aria-label={t('projects:projectTypes.colorSelectionAria')}>
                {DEFAULT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={cn(
                      "h-8 w-8 rounded-md border-2 transition-all",
                      formData.color_code === color
                        ? "border-primary scale-110"
                        : "border-transparent hover:scale-105"
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => handleChange('color_code', color)}
                    aria-label={t('projects:projectTypes.selectColorAria', { color })}
                    aria-pressed={formData.color_code === color}
                  />
                ))}
              </div>
            </div>
          </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                {t('common:cancel')}
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Spinner className="mr-2" size="sm" />}
                {isEditing ? t('projects:projectTypes.updateButton') : t('projects:projectTypes.createTitle')}
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ProjectTypeModal;