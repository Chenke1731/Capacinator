import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Plus, Edit2, Trash2, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api-client';
import { queryKeys } from '../lib/queryKeys';
import { useBookmarkableTabs } from '../hooks/useBookmarkableTabs';
import { getLocale } from '../i18n';
import type { Person, PersonAvailabilityOverride } from '../types';

interface OverrideForm {
  person_id: string;
  start_date: string;
  end_date: string;
  override_type: 'vacation' | 'training' | 'partial' | 'medical' | 'other';
  hours_per_day: number;
  reason: string;
  is_approved: boolean;
}

export default function Availability() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [selectedPerson, setSelectedPerson] = useState<string>('');

  // Define availability view tabs configuration (inside the component so labels
  // re-resolve when the UI language changes)
  const availabilityViewTabs = useMemo(() => [
    { id: 'calendar', label: t('people:availability.calendar') },
    { id: 'list', label: t('people:availability.listView') }
  ], [t]);
  
  // Use bookmarkable tabs for view mode selection
  const { activeTab, setActiveTab, isActiveTab } = useBookmarkableTabs({
    tabs: availabilityViewTabs,
    defaultTab: 'calendar',
    paramName: 'view'
  });
  const viewMode = activeTab as 'calendar' | 'list';
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<OverrideForm>({
    person_id: '',
    start_date: '',
    end_date: '',
    override_type: 'vacation',
    hours_per_day: 0,
    reason: '',
    is_approved: false
  });

  // Fetch data
  const { data: people } = useQuery({
    queryKey: queryKeys.people.list(),
    queryFn: async () => {
      const response = await api.people.list();
      return response.data.data as Person[];
    }
  });

  const { data: overrides, isLoading } = useQuery({
    queryKey: queryKeys.availability.overrides(selectedPerson, currentMonth.toISOString()),
    queryFn: async () => {
      const response = await api.availability.list({
        person_id: selectedPerson || undefined,
        start_date: new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toISOString(),
        end_date: new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).toISOString()
      });
      return response.data.data as PersonAvailabilityOverride[];
    }
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: OverrideForm) => api.availability.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.availability.all });
      setShowAddForm(false);
      resetForm();
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ _id, data }: { _id: string; data: Partial<OverrideForm> }) => {
      // For now, we'll use create as update is not available
      return api.availability.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.availability.all });
      setEditingId(null);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (_id: string) => {
      // Delete functionality would need to be implemented in the API
      console.warn('Delete availability override not yet implemented');
      return Promise.resolve();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.availability.all });
    }
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.availability.approve(id, { approved: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.availability.all });
    }
  });

  const resetForm = () => {
    setFormData({
      person_id: '',
      start_date: '',
      end_date: '',
      override_type: 'vacation',
      hours_per_day: 0,
      reason: '',
      is_approved: false
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (override: PersonAvailabilityOverride) => {
    setEditingId(override.id);
    setFormData({
      person_id: override.person_id,
      start_date: override.start_date.split('T')[0],
      end_date: override.end_date.split('T')[0],
      override_type: override.override_type,
      hours_per_day: override.hours_per_day || 0,
      reason: override.reason || '',
      is_approved: override.is_approved
    });
    setShowAddForm(true);
  };

  const getOverrideTypeColor = (type: string) => {
    switch (type) {
      case 'vacation': return 'blue';
      case 'training': return 'green';
      case 'partial': return 'purple';
      case 'medical': return 'orange';
      default: return 'gray';
    }
  };

  const renderCalendarView = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    const days = [];
    const current = new Date(startDate);

    while (current <= lastDay || current.getDay() !== 0) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }

    return (
      <div className="calendar-view">
        <div className="calendar-header">
          <button
            className="btn-icon"
            onClick={() => setCurrentMonth(new Date(year, month - 1))}
          >
            <ChevronLeft size={20} />
          </button>
          <h3>{currentMonth.toLocaleDateString(getLocale(), { month: 'long', year: 'numeric' })}</h3>
          <button
            className="btn-icon"
            onClick={() => setCurrentMonth(new Date(year, month + 1))}
          >
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="calendar-grid">
          <div className="calendar-weekdays">
            {/* 2023-01-01 is a Sunday; derive localized weekday abbreviations from the locale */}
            {[0, 1, 2, 3, 4, 5, 6].map(i => {
              const day = new Date(2023, 0, 1 + i).toLocaleDateString(getLocale(), { weekday: 'short' });
              return <div key={day} className="weekday">{day}</div>;
            })}
          </div>
          <div className="calendar-days">
            {days.map((day, index) => {
              const dayOverrides = overrides?.filter(o => {
                const overrideDate = new Date(o.start_date);
                return overrideDate.toDateString() === day.toDateString();
              }) || [];

              return (
                <div 
                  key={index} 
                  className={`calendar-day ${day.getMonth() !== month ? 'other-month' : ''}`}
                >
                  <div className="day-number">{day.getDate()}</div>
                  {dayOverrides.map(override => (
                    <div 
                      key={override.id}
                      className="calendar-override"
                      style={{ backgroundColor: `var(--color-${getOverrideTypeColor(override.override_type)})` }}
                      title={`${override.override_type}: ${override.reason}`}
                    >
                      {people?.find(p => p.id === override.person_id)?.name}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderListView = () => (
    <div className="list-view">
      <table className="table">
        <thead>
          <tr>
            <th>{t('people:availability.person')}</th>
            <th>{t('people:columns.type')}</th>
            <th>{t('common:startDate')}</th>
            <th>{t('common:endDate')}</th>
            <th>{t('people:columns.hoursPerDay')}</th>
            <th>{t('people:details.reason')}</th>
            <th>{t('common:status')}</th>
            <th>{t('common:actions')}</th>
          </tr>
        </thead>
        <tbody>
          {overrides?.map(override => (
            <tr key={override.id}>
              <td>{people?.find(p => p.id === override.person_id)?.name}</td>
              <td>
                <span className={`badge badge-${getOverrideTypeColor(override.override_type)}`}>
                  {override.override_type}
                </span>
              </td>
              <td>{new Date(override.start_date).toLocaleDateString(getLocale())}</td>
              <td>{new Date(override.end_date).toLocaleDateString(getLocale())}</td>
              <td>{override.hours_per_day}</td>
              <td>{override.reason}</td>
              <td>
                {override.is_approved ? (
                  <span className="badge badge-success">{t('people:availability.approved')}</span>
                ) : (
                  <span className="badge badge-warning">{t('people:availability.pending')}</span>
                )}
              </td>
              <td>
                <div className="table-actions">
                  {!override.is_approved && (
                    <button
                      className="btn table-action-btn"
                      onClick={() => approveMutation.mutate(override.id)}
                      title={t('people:availability.approve')}
                    >
                      <Check size={14} />
                      {t('people:availability.approve')}
                    </button>
                  )}
                  <button
                    className="btn table-action-btn"
                    onClick={() => handleEdit(override)}
                    title={t('common:edit')}
                  >
                    <Edit2 size={14} />
                    {t('common:edit')}
                  </button>
                  <button
                    className="btn table-action-btn btn-danger"
                    onClick={() => {
                      if (confirm(t('people:availability.deleteConfirm'))) {
                        deleteMutation.mutate(override.id);
                      }
                    }}
                    title={t('common:delete')}
                  >
                    <Trash2 size={14} />
                    {t('common:delete')}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (isLoading) {
    return <div className="loading">{t('people:availability.loading')}</div>;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>{t('people:availability.title')}</h1>
        <div className="header-actions">
          <div className="view-toggle">
            {availabilityViewTabs.map((tab) => (
              <button
                key={tab.id}
                className={`btn ${isActiveTab(tab.id) ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.id === 'calendar' && <Calendar size={20} />}
                {tab.label}
              </button>
            ))}
          </div>
          <button
            className="btn btn-primary"
            onClick={() => setShowAddForm(true)}
          >
            <Plus size={20} />
            {t('people:availability.addOverride')}
          </button>
        </div>
      </div>

      <div className="filter-section">
        <div className="filter-group">
          <label>{t('people:availability.person')}</label>
          <select
            value={selectedPerson}
            onChange={(e) => setSelectedPerson(e.target.value)}
            className="form-select"
          >
            <option value="">{t('people:availability.allPeople')}</option>
            {people?.map(person => (
              <option key={person.id} value={person.id}>{person.name}</option>
            ))}
          </select>
        </div>
      </div>

      {showAddForm && (
        <div className="modal">
          <div className="modal-content">
            <h2>{editingId ? t('people:availability.editTitle') : t('people:availability.addTitle')}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <div className="form-group">
                  <label>{t('people:availability.person')}</label>
                  <select
                    value={formData.person_id}
                    onChange={(e) => setFormData({...formData, person_id: e.target.value})}
                    className="form-select"
                    required
                  >
                    <option value="">{t('people:availability.selectPerson')}</option>
                    {people?.map(person => (
                      <option key={person.id} value={person.id}>{person.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>{t('people:columns.type')}</label>
                  <select
                    value={formData.override_type}
                    onChange={(e) => setFormData({...formData, override_type: e.target.value as any})}
                    className="form-select"
                    required
                  >
                    <option value="vacation">{t('people:availability.overrideType.vacation')}</option>
                    <option value="training">{t('people:availability.overrideType.training')}</option>
                    <option value="partial">{t('people:availability.overrideType.partial')}</option>
                    <option value="medical">{t('people:availability.overrideType.medical')}</option>
                    <option value="other">{t('people:availability.overrideType.other')}</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>{t('common:startDate')}</label>
                  <input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({...formData, start_date: e.target.value})}
                    className="form-input"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>{t('common:endDate')}</label>
                  <input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({...formData, end_date: e.target.value})}
                    className="form-input"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>{t('people:details.hoursPerDay')}</label>
                  <input
                    type="number"
                    value={formData.hours_per_day}
                    onChange={(e) => setFormData({...formData, hours_per_day: parseInt(e.target.value, 10) || 0})}
                    className="form-input"
                    min="0"
                    max="8"
                    required
                  />
                </div>
                <div className="form-group full-width">
                  <label>{t('people:details.reason')}</label>
                  <textarea
                    value={formData.reason}
                    onChange={(e) => setFormData({...formData, reason: e.target.value})}
                    className="form-input"
                    rows={3}
                  />
                </div>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary">
                  {editingId ? t('common:update') : t('common:create')}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingId(null);
                    resetForm();
                  }}
                >
                  {t('common:cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewMode === 'calendar' ? renderCalendarView() : renderListView()}
    </div>
  );
}