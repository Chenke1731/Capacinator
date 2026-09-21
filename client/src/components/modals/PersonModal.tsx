import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import { queryKeys } from '../../lib/queryKeys';
import i18n from '../../i18n';
import { useModalForm } from '../../hooks/useModalForm';
import {
  validateName,
  validateEmail,
  validateDateRange,
  validateAvailabilityPercentage,
  validateHoursPerDay,
} from '../../lib/validation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Alert, AlertDescription } from '../ui/alert';
import { AlertCircle } from 'lucide-react';
import { Spinner } from '../ui/spinner';
import type { Role } from '../../types';

// Person with roles for supervisor filtering
interface PersonWithRoles {
  id: string;
  name: string;
  title?: string;
  location_id?: string;
  is_supervisor?: boolean;
  roles?: Array<{ role_name?: string }>;
}

// Person type for editing
interface EditablePerson {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  title?: string;
  department?: string;
  location_id?: string;
  primary_person_role_id?: string;
  supervisor_id?: string;
  worker_type?: string;
  default_availability_percentage?: number;
  default_hours_per_day?: number;
  start_date?: string;
  end_date?: string;
  status?: string;
}

interface PersonFormData {
  name: string;
  email: string;
  phone: string;
  title: string;
  department: string;
  location_id: string;
  primary_person_role_id: string;
  supervisor_id: string;
  worker_type: string;
  default_availability_percentage: number;
  default_hours_per_day: number;
  start_date: string;
  end_date: string;
  status: string;
}

interface PersonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (person: EditablePerson) => void;
  editingPerson?: EditablePerson;
}

const initialValues: PersonFormData = {
  name: '',
  email: '',
  phone: '',
  title: '',
  department: '',
  location_id: '',
  primary_person_role_id: '',
  supervisor_id: '',
  worker_type: 'FTE',
  default_availability_percentage: 100,
  default_hours_per_day: 8,
  start_date: '',
  end_date: '',
  status: 'active'
};

// Runs at submit time, so i18n.t() resolves against the active language on each validation
const validatePerson = (values: PersonFormData): Partial<Record<keyof PersonFormData, string>> => {
  const errors: Partial<Record<keyof PersonFormData, string>> = {};

  const nameValidation = validateName(values.name, i18n.t('people:fields.name'));
  if (nameValidation !== true) errors.name = nameValidation;

  // Email validation using utility
  const emailValidation = validateEmail(values.email);
  if (emailValidation !== true) errors.email = emailValidation;

  if (!values.primary_person_role_id) errors.primary_person_role_id = i18n.t('people:validation.primaryRoleRequired');

  // Availability percentage validation
  if (values.default_availability_percentage) {
    const availValidation = validateAvailabilityPercentage(values.default_availability_percentage);
    if (availValidation !== true) errors.default_availability_percentage = availValidation;
  }

  // Hours per day validation
  if (values.default_hours_per_day) {
    const hoursValidation = validateHoursPerDay(values.default_hours_per_day);
    if (hoursValidation !== true) errors.default_hours_per_day = hoursValidation;
  }

  // Date range validation (optional but must be consistent if provided)
  if (values.start_date || values.end_date) {
    const dateValidation = validateDateRange(values.start_date, values.end_date);
    if (dateValidation !== true) {
      errors.end_date = dateValidation;
    }
  }

  return errors;
};

export const PersonModal: React.FC<PersonModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  editingPerson
}) => {
  const { t } = useTranslation();
  const {
    values: formData,
    errors,
    hasErrors,
    isEditing,
    isSubmitting,
    handleChange,
    handleSubmit,
    handleClose,
  } = useModalForm<PersonFormData>({
    initialValues,
    validate: validatePerson,
    onCreate: async (data) => {
      const response = await api.people.create(data);
      return response.data;
    },
    onUpdate: async (id, data) => {
      const response = await api.people.update(id, data);
      return response.data;
    },
    queryKeysToInvalidate: [queryKeys.people.all],
    additionalUpdateQueryKeys: (item) => [queryKeys.people.detail(item.id)],
    onSuccess: (data) => {
      if (onSuccess) onSuccess(data);
    },
    onClose,
    editingItem: editingPerson,
    getValuesFromItem: (item) => ({
      name: item.name || '',
      email: item.email || '',
      phone: item.phone || '',
      title: item.title || '',
      department: item.department || '',
      location_id: item.location_id || '',
      primary_person_role_id: item.primary_person_role_id || '',
      supervisor_id: item.supervisor_id || '',
      worker_type: item.worker_type || 'FTE',
      default_availability_percentage: item.default_availability_percentage || 100,
      default_hours_per_day: item.default_hours_per_day || 8,
      start_date: item.start_date || '',
      end_date: item.end_date || '',
      status: item.status || 'active'
    }),
  });

  // Fetch data for dropdowns
  const { data: roles } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const response = await api.roles.list();
      return response.data.data;
    }
  });

  

  const { data: people } = useQuery({
    queryKey: ['people'],
    queryFn: async () => {
      const response = await api.people.list();
      return response.data?.data || response.data || [];
    }
  });

  // Filtered data based on selections
  const filteredSupervisors = useMemo(() => {
    if (!people || !Array.isArray(people)) return [];

    return people.filter((person: PersonWithRoles) => {
      if (person.id === formData.supervisor_id) return false;

      if (formData.location_id) {
        return person.location_id === formData.location_id ||
               person.is_supervisor === true;
      }

      return person.is_supervisor === true ||
             person.roles?.some((role) => role.role_name?.toLowerCase().includes('manager'));
    });
  }, [people, formData.location_id, formData.supervisor_id]);

  const filteredRoles = useMemo(() => {
    if (!roles) return [];

    if (formData.location_id) {
      return (roles as Role[]).sort((a, b) => a.name.localeCompare(b.name));
    }

    return roles;
  }, [roles, formData.location_id]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? t('people:editPerson') : t('people:addNewPerson')}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? t('people:editDescription')
              : t('people:createDescription')}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">

          {hasErrors && (
            <Alert variant="destructive" className="mb-6" role="alert" aria-live="assertive">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <AlertDescription>
                {t('people:fixErrorsBeforeSubmitting')}
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('people:fields.name')} <span aria-hidden="true">*</span><span className="sr-only">{t('people:requiredSrOnly')}</span></Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder={t('people:placeholders.fullName')}
                className={errors.name ? 'border-destructive' : ''}
                aria-required="true"
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? 'name-error' : undefined}
              />
              {errors.name && <p id="name-error" className="text-sm text-destructive" role="alert">{errors.name}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">{t('people:fields.email')} <span aria-hidden="true">*</span><span className="sr-only">{t('people:requiredSrOnly')}</span></Label>
              <Input
                type="email"
                id="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                placeholder={t('people:placeholders.email')}
                className={errors.email ? 'border-destructive' : ''}
                aria-required="true"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'email-error' : undefined}
              />
              {errors.email && <p id="email-error" className="text-sm text-destructive" role="alert">{errors.email}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">{t('people:fields.phone')}</Label>
              <Input
                type="tel"
                id="phone"
                value={formData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                placeholder={t('people:placeholders.phone')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">{t('people:fields.title')}</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => handleChange('title', e.target.value)}
                placeholder={t('people:placeholders.title')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="department">{t('people:fields.department')}</Label>
              <Input
                id="department"
                value={formData.department}
                onChange={(e) => handleChange('department', e.target.value)}
                placeholder={t('people:placeholders.department')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="primary_person_role_id">{t('people:fields.primaryRole')} <span aria-hidden="true">*</span><span className="sr-only">{t('people:requiredSrOnly')}</span></Label>
              <Select
                value={formData.primary_person_role_id}
                onValueChange={(value) => handleChange('primary_person_role_id', value)}
              >
                <SelectTrigger
                  id="primary_person_role_id"
                  className={errors.primary_person_role_id ? 'border-destructive' : ''}
                  aria-required="true"
                  aria-invalid={!!errors.primary_person_role_id}
                  aria-describedby={errors.primary_person_role_id ? 'primary_person_role_id-error' : undefined}
                >
                  <SelectValue placeholder={t('people:placeholders.selectPrimaryRole')} />
                </SelectTrigger>
                <SelectContent>
                  {Array.isArray(filteredRoles) ? filteredRoles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                    </SelectItem>
                  )) : []}
                </SelectContent>
              </Select>
              {errors.primary_person_role_id && <p id="primary_person_role_id-error" className="text-sm text-destructive" role="alert">{errors.primary_person_role_id}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="supervisor_id">{t('people:fields.supervisor')}</Label>
              <Select value={formData.supervisor_id || 'none'} onValueChange={(value) => handleChange('supervisor_id', value === 'none' ? '' : value)}>
                <SelectTrigger id="supervisor_id">
                  <SelectValue placeholder={t('people:placeholders.selectSupervisor')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('common:none')}</SelectItem>
                  {filteredSupervisors?.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.name} ({person.title || t('people:select.noTitle')})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="worker_type">{t('people:fields.workerType')}</Label>
              <Select value={formData.worker_type} onValueChange={(value) => handleChange('worker_type', value)}>
                <SelectTrigger id="worker_type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FTE">{t('people:workerTypeOptions.fullTimeEmployee')}</SelectItem>
                  <SelectItem value="contractor">{t('people:workerTypeOptions.contractor')}</SelectItem>
                  <SelectItem value="intern">{t('people:workerTypeOptions.intern')}</SelectItem>
                  <SelectItem value="consultant">{t('people:workerTypeOptions.consultant')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="default_availability_percentage">{t('people:fields.defaultAvailability')}</Label>
              <Input
                type="number"
                id="default_availability_percentage"
                value={formData.default_availability_percentage}
                onChange={(e) => handleChange('default_availability_percentage', Number(e.target.value))}
                min="0"
                max="100"
                placeholder="100"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="default_hours_per_day">{t('people:fields.defaultHoursPerDay')}</Label>
              <Input
                type="number"
                id="default_hours_per_day"
                value={formData.default_hours_per_day}
                onChange={(e) => handleChange('default_hours_per_day', Number(e.target.value))}
                min="1"
                max="24"
                step="0.5"
                placeholder="8"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="start_date">{t('common:startDate')}</Label>
              <Input
                type="date"
                id="start_date"
                value={formData.start_date}
                onChange={(e) => handleChange('start_date', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="end_date">{t('common:endDate')}</Label>
              <Input
                type="date"
                id="end_date"
                value={formData.end_date}
                onChange={(e) => handleChange('end_date', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">{t('common:status')}</Label>
              <Select value={formData.status} onValueChange={(value) => handleChange('status', value)}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t('people:personStatus.active')}</SelectItem>
                  <SelectItem value="inactive">{t('people:personStatus.inactive')}</SelectItem>
                  <SelectItem value="pending">{t('people:personStatus.pending')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                {t('common:cancel')}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Spinner className="mr-2" size="sm" />}
                {isEditing ? t('people:updatePerson') : t('people:createPerson')}
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PersonModal;
