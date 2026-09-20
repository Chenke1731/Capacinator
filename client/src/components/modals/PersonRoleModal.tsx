import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api-client';
import { queryKeys } from '../../lib/queryKeys';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import { Spinner } from '../ui/spinner';

interface PersonRoleFormData {
  role_id: string;
  proficiency_level: string;
  is_primary: boolean;
  start_date: string;
  end_date: string;
}

interface PersonRoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (roleData: any) => void;
  personId: string;
  editingRole?: {
    id: string;
    role_id: string;
    proficiency_level: string;
    is_primary: boolean;
    start_date?: string;
    end_date?: string;
  } | null;
}

const initialValues: PersonRoleFormData = {
  role_id: '',
  proficiency_level: '3',
  is_primary: false,
  start_date: '',
  end_date: ''
};

export default function PersonRoleModal({
  isOpen,
  onClose,
  onSuccess,
  personId,
  editingRole
}: PersonRoleModalProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<PersonRoleFormData>(initialValues);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = !!editingRole;

  // Defined inside the component so labels re-resolve when the UI language changes
  const PROFICIENCY_LEVELS = [
    { value: '1', label: t('people:roleModal.proficiency.1') },
    { value: '2', label: t('people:roleModal.proficiency.2') },
    { value: '3', label: t('people:roleModal.proficiency.3') },
    { value: '4', label: t('people:roleModal.proficiency.4') },
    { value: '5', label: t('people:roleModal.proficiency.5') }
  ];

  // Fetch available roles
  const { data: roles, isLoading: rolesLoading } = useQuery({
    queryKey: queryKeys.roles.all,
    queryFn: async () => {
      const response = await api.roles.list();
      const rolesData = response.data?.data || response.data || [];
      return Array.isArray(rolesData) ? rolesData : [];
    }
  });

  // Reset form when modal opens/closes or when editing role changes
  useEffect(() => {
    if (isOpen) {
      if (editingRole) {
        setFormData({
          role_id: editingRole.role_id,
          proficiency_level: editingRole.proficiency_level,
          is_primary: editingRole.is_primary,
          start_date: editingRole.start_date || '',
          end_date: editingRole.end_date || ''
        });
      } else {
        setFormData(initialValues);
      }
    }
  }, [isOpen, editingRole]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const submitData = {
        role_id: formData.role_id,
        proficiency_level: parseInt(formData.proficiency_level, 10),
        is_primary: formData.is_primary,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null
      };

      if (editingRole) {
        await api.people.updateRole(personId, editingRole.role_id, submitData);
      } else {
        await api.people.addRole(personId, submitData);
      }

      onSuccess(submitData);
      onClose();
    } catch (error) {
      console.error('Error saving role:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = <K extends keyof PersonRoleFormData>(field: K, value: PersonRoleFormData[K]) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleClose = () => {
    setTimeout(() => onClose(), 200);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? t('people:roleModal.editTitle') : t('people:roleModal.addTitle')}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? t('people:roleModal.editDescription')
              : t('people:roleModal.addDescription')}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">

          <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="role_id">{t('common:role')} <span aria-hidden="true">*</span><span className="sr-only">{t('people:requiredSrOnly')}</span></Label>
            <Select
              value={formData.role_id}
              onValueChange={(value) => handleChange('role_id', value)}
              disabled={isSubmitting || rolesLoading}
            >
              <SelectTrigger id="role_id" aria-required="true">
                <SelectValue placeholder={t('people:roleModal.selectRole')} />
              </SelectTrigger>
              <SelectContent>
                {Array.isArray(roles) && roles.map((role: any) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="proficiency_level">{t('people:roleModal.proficiencyLevel')} <span aria-hidden="true">*</span><span className="sr-only">{t('people:requiredSrOnly')}</span></Label>
            <Select
              value={formData.proficiency_level}
              onValueChange={(value) => handleChange('proficiency_level', value)}
              disabled={isSubmitting}
            >
              <SelectTrigger id="proficiency_level" aria-required="true">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROFICIENCY_LEVELS.map(level => (
                  <SelectItem key={level.value} value={level.value}>
                    {level.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="is_primary"
                checked={formData.is_primary}
                onCheckedChange={(checked) => handleChange('is_primary', checked === true)}
                disabled={isSubmitting}
                aria-describedby="is_primary-description"
              />
              <Label htmlFor="is_primary" className="cursor-pointer">
                {t('people:roleModal.setAsPrimary')}
              </Label>
            </div>
            <p id="is_primary-description" className="text-sm text-muted-foreground">
              {t('people:roleModal.primaryDescription')}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_date">{t('common:startDate')}</Label>
              <Input
                type="date"
                id="start_date"
                value={formData.start_date}
                onChange={(e) => handleChange('start_date', e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="end_date">{t('common:endDate')}</Label>
              <Input
                type="date"
                id="end_date"
                value={formData.end_date}
                onChange={(e) => handleChange('end_date', e.target.value)}
                disabled={isSubmitting}
              />
            </div>
          </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
                {t('common:cancel')}
              </Button>
              <Button type="submit" disabled={isSubmitting || !formData.role_id}>
                {isSubmitting && <Spinner className="mr-2" size="sm" />}
                {isEditing ? t('people:roleModal.updateRole') : t('people:roleModal.addTitle')}
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
