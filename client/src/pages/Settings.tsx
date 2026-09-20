import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Settings as SettingsIcon, Save, Database,
  Users, Palette, Github
} from 'lucide-react';
import { api } from '../lib/api-client';
import { queryKeys } from '../lib/queryKeys';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../hooks/useLanguage';
import { getLocale } from '../i18n';
import { useBookmarkableTabs } from '../hooks/useBookmarkableTabs';
import { UnifiedTabComponent } from '../components/ui/UnifiedTabComponent';
import { GitHubConnectionManager } from '../components/GitHubConnectionManager';

interface SystemSettings {
  defaultWorkHoursPerWeek: number;
  defaultVacationDaysPerYear: number;
  fiscalYearStartMonth: number;
  allowOverAllocation: boolean;
  maxAllocationPercentage: number;
  requireApprovalForOverrides: boolean;
}

interface ImportSettings {
  clearExistingData: boolean;
  validateDuplicates: boolean;
  autoCreateMissingRoles: boolean;
  autoCreateMissingLocations: boolean;
  defaultProjectPriority: number;
  dateFormat: string;
}

// Define settings tabs configuration (labels translated at render time)
const settingsTabDefs = [
  { id: 'system', labelKey: 'settings:tabs.system', icon: SettingsIcon },
  { id: 'import', labelKey: 'settings:tabs.import', icon: Database },
  { id: 'users', labelKey: 'settings:tabs.users', icon: Users },
  { id: 'github', labelKey: 'settings:tabs.github', icon: Github },
  { id: 'appearance', labelKey: 'settings:tabs.appearance', icon: Palette }
];

export default function Settings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, languages } = useLanguage();
  
  // Use bookmarkable tabs for settings
  const settingsTabs = settingsTabDefs.map((tab) => ({ ...tab, label: t(tab.labelKey) }));
  const { activeTab, setActiveTab } = useBookmarkableTabs({
    tabs: settingsTabs,
    defaultTab: 'system'
  });
  const [systemSettings, setSystemSettings] = useState<SystemSettings>({
    defaultWorkHoursPerWeek: 40,
    defaultVacationDaysPerYear: 15,
    fiscalYearStartMonth: 1,
    allowOverAllocation: true,
    maxAllocationPercentage: 120,
    requireApprovalForOverrides: true,
  });

  const [importSettings, setImportSettings] = useState<ImportSettings>({
    clearExistingData: false,
    validateDuplicates: true,
    autoCreateMissingRoles: false,
    autoCreateMissingLocations: false,
    defaultProjectPriority: 2,
    dateFormat: 'MM/DD/YYYY'
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [isSaveError, setIsSaveError] = useState(false);


  // Fetch system settings
  const { data: systemSettingsData } = useQuery({
    queryKey: queryKeys.settings.system(),
    queryFn: async () => {
      const response = await api.settings.getSystemSettings();
      return response.data.data;
    },
    enabled: activeTab === 'system'
  });

  // Fetch import settings
  const { data: importSettingsData } = useQuery({
    queryKey: queryKeys.settings.import(),
    queryFn: async () => {
      const response = await api.settings.getImportSettings();
      return response.data.data;
    },
    enabled: activeTab === 'import'
  });

  // Fetch user permissions
  const { data: users } = useQuery({
    queryKey: queryKeys.userPermissions.users(),
    queryFn: async () => {
      const response = await api.userPermissions.getUsersList();
      return response.data.data;
    },
    enabled: activeTab === 'users'
  });

  // Fetch user roles
  const { data: userRoles } = useQuery({
    queryKey: queryKeys.userPermissions.roles(),
    queryFn: async () => {
      const response = await api.userPermissions.getUserRoles();
      return response.data.data;
    },
    enabled: activeTab === 'users'
  });

  // Fetch system permissions
  const { data: systemPermissions } = useQuery({
    queryKey: queryKeys.userPermissions.systemPermissions(),
    queryFn: async () => {
      const response = await api.userPermissions.getSystemPermissions();
      return response.data.data;
    },
    enabled: activeTab === 'users'
  });


  // Update local state when API data loads
  useEffect(() => {
    if (systemSettingsData) {
      setSystemSettings(systemSettingsData);
    }
  }, [systemSettingsData]);

  useEffect(() => {
    if (importSettingsData) {
      setImportSettings(importSettingsData);
    }
  }, [importSettingsData]);

  const handleSaveSystemSettings = async () => {
    setIsSaving(true);
    setSaveMessage('');

    try {
      await api.settings.saveSystemSettings(systemSettings);
      setSaveMessage(t('settings:system.savedSuccessfully'));
      setIsSaveError(false);

      // Invalidate and refetch settings
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.system() });
    } catch (error: any) {
      console.error('Error saving system settings:', error);
      setSaveMessage(error.response?.data?.error || t('settings:system.saveFailed'));
      setIsSaveError(true);
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveMessage(''), 3000);
    }
  };

  const handleSaveImportSettings = async () => {
    setIsSaving(true);
    setSaveMessage('');

    try {
      await api.settings.saveImportSettings(importSettings);
      setSaveMessage(t('settings:import.savedSuccessfully'));
      setIsSaveError(false);

      // Invalidate and refetch settings
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.import() });
    } catch (err: any) {
      console.error('Error saving import settings:', err);
      setSaveMessage(err.response?.data?.error || t('settings:system.saveFailed'));
      setIsSaveError(true);
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveMessage(''), 3000);
    }
  };


  const renderSystemSettings = () => (
    <div className="settings-section">
      <h2>{t('settings:system.title')}</h2>

      <div className="settings-grid">
        <div className="settings-group">
          <h3>{t('settings:system.workHoursTitle')}</h3>
          <div className="form-grid two-column">
            <div className="setting-item">
              <label>{t('settings:system.defaultWorkHoursPerWeek')}</label>
              <input
                type="number"
                value={systemSettings.defaultWorkHoursPerWeek}
                onChange={(e) => setSystemSettings({...systemSettings, defaultWorkHoursPerWeek: parseInt(e.target.value, 10) || 40})}
                className="form-input"
                min="1"
                max="80"
              />
            </div>
            
            <div className="setting-item">
              <label>{t('settings:system.defaultVacationDaysPerYear')}</label>
              <input
                type="number"
                value={systemSettings.defaultVacationDaysPerYear}
                onChange={(e) => setSystemSettings({...systemSettings, defaultVacationDaysPerYear: parseInt(e.target.value, 10) || 0})}
                className="form-input"
                min="0"
                max="365"
              />
            </div>
          </div>
          
          <div className="setting-item">
            <label>{t('settings:system.fiscalYearStartMonth')}</label>
            <select
              value={systemSettings.fiscalYearStartMonth}
              onChange={(e) => setSystemSettings({...systemSettings, fiscalYearStartMonth: parseInt(e.target.value, 10)})}
              className="form-select"
            >
              {Array.from({ length: 12 }, (_, index) =>
                new Date(2024, index, 1).toLocaleDateString(getLocale(), { month: 'long' })
              ).map((month, index) => (
                <option key={index} value={index + 1}>{month}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="settings-group">
          <h3>{t('settings:system.allocationRulesTitle')}</h3>
          <div className="setting-item">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={systemSettings.allowOverAllocation}
                onChange={(e) => setSystemSettings({...systemSettings, allowOverAllocation: e.target.checked})}
              />
              {t('settings:system.allowOverAllocation')}
            </label>
          </div>

          {systemSettings.allowOverAllocation && (
            <div className="setting-item">
              <label>{t('settings:system.maxAllocationPercentage')}</label>
              <input
                type="number"
                value={systemSettings.maxAllocationPercentage}
                onChange={(e) => setSystemSettings({...systemSettings, maxAllocationPercentage: parseInt(e.target.value, 10) || 100})}
                className="form-input"
                min="100"
                max="200"
              />
              <div className="settings-alert info">
                <span>{t('settings:system.overAllocationHint')}</span>
              </div>
            </div>
          )}
          
          <div className="setting-item">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={systemSettings.requireApprovalForOverrides}
                onChange={(e) => setSystemSettings({...systemSettings, requireApprovalForOverrides: e.target.checked})}
              />
              {t('settings:system.requireApprovalForOverrides')}
            </label>
          </div>
        </div>
      </div>

      <div className="settings-grid">

      </div>

      <div className="settings-actions">
        <button 
          className="btn btn-primary"
          onClick={handleSaveSystemSettings}
          disabled={isSaving}
        >
          <Save size={20} />
          {isSaving ? t('common:saving') : t('settings:system.saveSystemSettings')}
        </button>
        {saveMessage && (
          <div className={`save-message ${isSaveError ? 'error' : 'success'}`}>
            {saveMessage}
          </div>
        )}
      </div>
    </div>
  );

  const renderImportSettings = () => (
    <div className="settings-section">
      <h2>{t('settings:import.title')}</h2>

      <div className="settings-grid">
        <div className="settings-group">
          <h3>{t('settings:import.importBehaviorTitle')}</h3>
          <div className="setting-item">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={importSettings.clearExistingData}
                onChange={(e) => setImportSettings({...importSettings, clearExistingData: e.target.checked})}
              />
              {t('settings:import.clearExistingData')}
            </label>
            {importSettings.clearExistingData && (
              <div className="settings-alert warning">
                <span>{t('settings:import.clearExistingWarning')}</span>
              </div>
            )}
          </div>

          <div className="setting-item">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={importSettings.validateDuplicates}
                onChange={(e) => setImportSettings({...importSettings, validateDuplicates: e.target.checked})}
              />
              {t('settings:import.validateDuplicates')}
            </label>
            <div className="settings-alert info">
              <span>{t('settings:import.validateDuplicatesHint')}</span>
            </div>
          </div>
        </div>

        <div className="settings-group">
          <h3>{t('settings:import.autoCreateTitle')}</h3>
          <div className="setting-item">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={importSettings.autoCreateMissingRoles}
                onChange={(e) => setImportSettings({...importSettings, autoCreateMissingRoles: e.target.checked})}
              />
              {t('settings:import.autoCreateRoles')}
            </label>
            <div className="settings-alert info">
              <span>{t('settings:import.autoCreateRolesHint')}</span>
            </div>
          </div>

          <div className="setting-item">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={importSettings.autoCreateMissingLocations}
                onChange={(e) => setImportSettings({...importSettings, autoCreateMissingLocations: e.target.checked})}
              />
              {t('settings:import.autoCreateLocations')}
            </label>
            <div className="settings-alert info">
              <span>{t('settings:import.autoCreateLocationsHint')}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="settings-grid single-column">
        <div className="settings-group">
          <h3>{t('settings:import.defaultValuesTitle')}</h3>
          <div className="form-grid two-column">
            <div className="setting-item">
              <label>{t('settings:import.defaultProjectPriority')}</label>
              <select
                value={importSettings.defaultProjectPriority}
                onChange={(e) => setImportSettings({...importSettings, defaultProjectPriority: parseInt(e.target.value, 10)})}
                className="form-select"
              >
                <option value={1}>{t('settings:import.priorityHigh')}</option>
                <option value={2}>{t('settings:import.priorityMedium')}</option>
                <option value={3}>{t('settings:import.priorityLow')}</option>
              </select>
            </div>

            <div className="setting-item">
              <label>{t('settings:import.dateFormat')}</label>
              <select
                value={importSettings.dateFormat}
                onChange={(e) => setImportSettings({...importSettings, dateFormat: e.target.value})}
                className="form-select"
              >
                <option value="MM/DD/YYYY">{t('settings:import.dateFormatUS')}</option>
                <option value="DD/MM/YYYY">{t('settings:import.dateFormatUK')}</option>
                <option value="YYYY-MM-DD">{t('settings:import.dateFormatISO')}</option>
              </select>
            </div>
          </div>
          <div className="settings-alert info">
            <span>{t('settings:import.dateFormatHint')}</span>
          </div>
        </div>
      </div>

      <div className="settings-actions">
        <button
          className="btn btn-primary"
          onClick={handleSaveImportSettings}
          disabled={isSaving}
        >
          <Save size={20} />
          {isSaving ? t('common:saving') : t('settings:import.saveImportSettings')}
        </button>
        {saveMessage && (
          <div className={`save-message ${isSaveError ? 'error' : 'success'}`}>
            {saveMessage}
          </div>
        )}
      </div>
    </div>
  );

  const renderUserPermissions = () => (
    <div className="settings-section">
      <h2>{t('settings:users.title')}</h2>

      <div className="settings-alert info">
        <span>{t('settings:users.intro')}</span>
      </div>

      <div className="settings-grid single-column">
        <div className="settings-group">
          <h3>{t('settings:users.userRolesTitle')}</h3>
          {userRoles && userRoles.length > 0 ? (
            <div className="roles-grid">
              {userRoles.map((role: any) => (
                <div key={role.id} className="role-card">
                  <h4>🎭 {role.name}</h4>
                  <p>{role.description}</p>
                  <div className="role-info">
                    <span className="priority">{t('settings:users.priority', { priority: role.priority })}</span>
                    {role.is_system_admin && <span className="admin-badge">{t('settings:users.systemAdmin')}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="settings-alert warning">
              <span>{t('settings:users.noUserRolesWarning')}</span>
            </div>
          )}
        </div>

        <div className="settings-group">
          <h3>{t('settings:users.systemPermissionsTitle')}</h3>
          {systemPermissions?.permissionsByCategory && Object.keys(systemPermissions.permissionsByCategory).length > 0 ? (
            <div className="permissions-grid">
              {Object.entries(systemPermissions.permissionsByCategory).map(([category, permissions]: [string, any]) => (
                <div key={category} className="permission-category">
                  <h4>📋 {category.charAt(0).toUpperCase() + category.slice(1)}</h4>
                  <div className="permissions-list">
                    {permissions.map((permission: any) => (
                      <div key={permission.id} className="permission-item">
                        <strong>{permission.name}</strong>
                        <span>{permission.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="settings-alert info">
              <span>{t('settings:users.permissionsLoading')}</span>
            </div>
          )}
        </div>
      </div>

      <div className="settings-group">
        <h3>{t('settings:users.userManagementTitle')}</h3>
        {users && users.length > 0 ? (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('settings:users.colName')}</th>
                  <th>{t('settings:users.colEmail')}</th>
                  <th>{t('settings:users.colUserRole')}</th>
                  <th>{t('settings:users.colPrimaryRole')}</th>
                  <th>{t('settings:users.colSystemAdmin')}</th>
                  <th>{t('settings:users.colOverrides')}</th>
                  <th>{t('settings:users.colLastLogin')}</th>
                  <th>{t('settings:users.colStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user: any) => (
                  <tr key={user.id}>
                    <td>
                      <div className="person-name">
                        <span className="name">{user.name}</span>
                      </div>
                    </td>
                    <td>{user.email}</td>
                    <td>{user.role_name || <span style={{color: 'var(--text-secondary)'}}>{t('common:none')}</span>}</td>
                    <td>{user.primary_role_name || <span style={{color: 'var(--text-secondary)'}}>{t('common:none')}</span>}</td>
                    <td>
                      <span className={`status-badge ${user.is_system_admin ? 'success' : 'warning'}`}>
                        {user.is_system_admin ? t('settings:users.adminYes') : t('settings:users.adminNo')}
                      </span>
                    </td>
                    <td>
                      <span className="badge-blue">{user.permission_overrides || 0}</span>
                    </td>
                    <td>{user.last_login ? new Date(user.last_login).toLocaleDateString(getLocale()) : <span style={{color: 'var(--text-secondary)'}}>{t('settings:users.never')}</span>}</td>
                    <td>
                      <span className={`status-badge ${user.is_active ? 'success' : 'error'}`}>
                        {user.is_active ? t('settings:users.active') : t('settings:users.inactive')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="settings-alert warning">
            <span>{t('settings:users.noUsersFound')}</span>
          </div>
        )}
      </div>
    </div>
  );

  const renderAppearanceSettings = () => (
    <div className="settings-section">
      <h2>{t('settings:appearance.title')}</h2>
      
      <div className="settings-grid">
        <div className="settings-group">
          <h3>🌐 {t('common:language')}</h3>
          <div className="setting-item">
            <label>{t('settings:appearance.languageLabel')}</label>
            <div className="theme-selector">
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  className={`btn btn-outline theme-option ${language === lang.code ? 'active' : ''}`}
                  onClick={() => setLanguage(lang.code)}
                >
                  {lang.label}
                </button>
              ))}
            </div>
            <div className="settings-alert info">
              <span>🎯 {t('settings:appearance.languageHint')}</span>
            </div>
          </div>
        </div>

        <div className="settings-group">
          <h3>{t('settings:appearance.colorTheme')}</h3>
          <div className="setting-item">
            <label>{t('settings:appearance.themeMode')}</label>
            <div className="theme-selector">
              <button
                className={`btn btn-outline theme-option ${theme === 'light' ? 'active' : ''}`}
                onClick={() => theme !== 'light' && toggleTheme()}
              >
                {t('settings:appearance.light')}
              </button>
              <button
                className={`btn btn-outline theme-option ${theme === 'dark' ? 'active' : ''}`}
                onClick={() => theme !== 'dark' && toggleTheme()}
              >
                {t('settings:appearance.dark')}
              </button>
            </div>
            <div className="settings-alert info">
              <span>{t('settings:appearance.themeHint')}</span>
            </div>
          </div>
        </div>

      </div>

      <div className="settings-alert warning">
        <span>{t('settings:appearance.comingSoon')}</span>
      </div>

    </div>
  );


  return (
    <UnifiedTabComponent
      tabs={settingsTabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      variant="primary"
      size="md"
      orientation="horizontal"
      ariaLabel={t('settings:nav.ariaLabel')}
    >
      {activeTab === 'system' && renderSystemSettings()}
      {activeTab === 'import' && renderImportSettings()}
      {activeTab === 'users' && renderUserPermissions()}
      {activeTab === 'github' && <GitHubConnectionManager />}
      {activeTab === 'appearance' && renderAppearanceSettings()}
    </UnifiedTabComponent>
  );
}