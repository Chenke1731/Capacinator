import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle, X, Settings, Download, FileText, Database } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api-client';
import { useScenario } from '../contexts/ScenarioContext';
import { useBookmarkableTabs } from '../hooks/useBookmarkableTabs';
import { UnifiedTabComponent } from '../components/ui/UnifiedTabComponent';
import { OperationProgress, useOperationProgress } from '../components/ui/OperationProgress';
import './Import.css';

interface ImportResult {
  success: boolean;
  message: string;
  imported?: {
    locations: number;
    projectTypes: number;
    phases: number;
    roles: number;
    people: number;
    projects: number;
    standardAllocations: number;
    assignments: number;
    phaseTimelines?: number;
    demands?: number;
    availabilityOverrides?: number;
  };
  errors?: string[];
  warnings?: string[];
}

interface ImportSettings {
  clearExistingData: boolean;
  validateDuplicates: boolean;
  autoCreateMissingRoles: boolean;
  autoCreateMissingLocations: boolean;
  defaultProjectPriority: number;
  dateFormat: string;
}

function ImportUnified() {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [clearExisting, setClearExisting] = useState(false);
  const [useV2, setUseV2] = useState(true);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importSettings, setImportSettings] = useState<ImportSettings | null>(null);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [settingsOverrides, setSettingsOverrides] = useState<Partial<ImportSettings>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Export state
  const [exportScenarioId, setExportScenarioId] = useState<string>('');
  const [exportIncludeAssignments, setExportIncludeAssignments] = useState(true);
  const [exportIncludePhases, setExportIncludePhases] = useState(true);
  const [templateType, setTemplateType] = useState('complete');
  const [showExportOptions, setShowExportOptions] = useState(false);
  const [showTemplateOptions, setShowTemplateOptions] = useState(false);

  const { currentScenario, scenarios } = useScenario();

  // Operation progress hooks for import/export operations
  const importProgress = useOperationProgress({
    onSuccess: () => {
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
  });

  const exportScenarioProgress = useOperationProgress();
  const exportTemplateProgress = useOperationProgress();

  // Derived state for backward compatibility
  const uploading = importProgress.status === 'running';
  const exportingScenario = exportScenarioProgress.status === 'running';
  const exportingTemplate = exportTemplateProgress.status === 'running';

  // Use bookmarkable tabs for import/export
  // Define import/export tabs configuration
  const importExportTabs = useMemo(() => [
    { id: 'import', label: t('common:import'), icon: Upload },
    { id: 'export', label: t('common:export'), icon: Download }
  ], [t]);

  const { activeTab, setActiveTab } = useBookmarkableTabs({
    tabs: importExportTabs,
    defaultTab: 'import'
  });

  // Update document title based on active tab
  useEffect(() => {
    const title = activeTab === 'export' ? t('importExport:docTitle.export') : t('importExport:docTitle.import');
    document.title = `${title} - Capacinator`;

    // Also update the page on initial load to reflect both functions
    if (!activeTab) {
      document.title = t('importExport:docTitle.default');
    }
  }, [activeTab, t]);

  // Load import settings on component mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await api.import.getSettings();
        setImportSettings(response.data.data);
        // Set initial values based on saved settings
        setClearExisting(response.data.data.clearExistingData);
      } catch (error) {
        console.error('Failed to load import settings:', error);
      }
    };

    loadSettings();
  }, []);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls')) {
        setFile(selectedFile);
        setResult(null);
      } else {
        alert(t('importExport:errors.selectValidFile'));
      }
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const droppedFile = event.dataTransfer.files[0];
    if (droppedFile && (droppedFile.name.endsWith('.xlsx') || droppedFile.name.endsWith('.xls'))) {
      setFile(droppedFile);
      setResult(null);
    } else {
      alert(t('importExport:errors.dropValidFile'));
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleUpload = useCallback(async () => {
    if (!file) return;

    importProgress.start(t('importExport:progress.uploadingExcel'), 100);
    setResult(null);

    try {
      const uploadOptions = {
        clearExisting,
        useV2,
        ...settingsOverrides
      };

      // Update progress to show file upload started
      importProgress.updateProgress(10, t('importExport:progress.sendingFile'));

      const response = await api.import.uploadExcel(file, uploadOptions);

      // Update progress to show processing
      importProgress.updateProgress(50, t('importExport:progress.processingImport'));

      const importResult = response.data as ImportResult;
      setResult(importResult);

      // Add any warnings from the result
      if (importResult.warnings) {
        importResult.warnings.forEach(w => importProgress.addWarning(w));
      }

      // Add any errors from the result (even if success=true, there might be partial errors)
      if (importResult.errors) {
        importResult.errors.forEach(e => importProgress.addError(e));
      }

      if (importResult.success) {
        importProgress.updateProgress(100, t('importExport:progress.importComplete'));
        importProgress.complete(t('importExport:progress.importCompleted'));
      } else {
        importProgress.fail(importResult.message || t('importExport:progress.importFailed'));
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || t('importExport:errors.unknown');
      importProgress.fail(errorMessage);
      setResult({
        success: false,
        message: t('importExport:progress.importFailed'),
        errors: [errorMessage]
      });
    }
  }, [file, clearExisting, useV2, settingsOverrides, importProgress, t]);

  const handleRemoveFile = () => {
    setFile(null);
    setResult(null);
    importProgress.reset();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleExportScenario = useCallback(async () => {
    const scenarioToExport = exportScenarioId || currentScenario?.id;

    if (!scenarioToExport) {
      alert(t('importExport:errors.selectScenario'));
      return;
    }

    exportScenarioProgress.start(t('importExport:progress.preparingScenarioExport'), 100);
    try {
      exportScenarioProgress.updateProgress(20, t('importExport:progress.fetchingScenarioData'));

      const response = await api.import.exportScenario(scenarioToExport, {
        includeAssignments: exportIncludeAssignments,
        includePhases: exportIncludePhases,
      });

      exportScenarioProgress.updateProgress(70, t('importExport:progress.generatingExcel'));

      // Create blob and download link
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      // Extract filename from response headers or create default
      const contentDisposition = response.headers['content-disposition'];
      let filename = 'scenario_export.xlsx';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      exportScenarioProgress.updateProgress(90, t('importExport:progress.downloadingFile'));

      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up the blob URL
      window.URL.revokeObjectURL(url);

      exportScenarioProgress.complete(t('importExport:progress.exportCompleted'));
    } catch (error: any) {
      console.error('Export failed:', error);

      let message = t('importExport:errors.unknown');

      if (error.response) {
        if (error.response.status === 404) {
          message = t('importExport:errors.exportEndpointNotFound');
        } else if (error.response.status === 500) {
          message = t('importExport:errors.exportServerError');
        } else if (error.response.data?.message) {
          message = error.response.data.message;
        } else {
          message = t('importExport:errors.serverErrorStatus', { status: error.response.status, statusText: error.response.statusText });
        }
      } else if (error.request) {
        message = t('importExport:errors.noServerResponse');
      } else {
        message = error.message || t('importExport:errors.unknown');
      }

      exportScenarioProgress.fail(message);
    }
  }, [exportScenarioId, currentScenario?.id, exportIncludeAssignments, exportIncludePhases, exportScenarioProgress, t]);

  const handleExportTemplate = useCallback(async () => {
    exportTemplateProgress.start(t('importExport:progress.generatingTemplate'), 100);
    try {
      exportTemplateProgress.updateProgress(30, t('importExport:progress.creatingTemplateStructure'));

      const response = await api.import.exportTemplate({
        templateType,
        includeAssignments: exportIncludeAssignments,
        includePhases: exportIncludePhases,
      });

      exportTemplateProgress.updateProgress(70, t('importExport:progress.preparingDownload'));

      // Create blob and download link
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      // Extract filename from response headers or create default
      const contentDisposition = response.headers['content-disposition'];
      let filename = 'capacinator_template.xlsx';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      exportTemplateProgress.updateProgress(90, t('importExport:progress.downloading'));

      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up the blob URL
      window.URL.revokeObjectURL(url);

      exportTemplateProgress.complete(t('importExport:progress.templateDownloaded'));
    } catch (error: any) {
      console.error('Template export failed:', error);
      const message = error.response?.data?.message || error.message || t('importExport:errors.unknown');
      exportTemplateProgress.fail(message);
    }
  }, [templateType, exportIncludeAssignments, exportIncludePhases, exportTemplateProgress, t]);

  // Retry handlers for failed operations
  const handleRetryImport = useCallback(() => {
    importProgress.reset();
    handleUpload();
  }, [importProgress, handleUpload]);

  const handleRetryExportScenario = useCallback(() => {
    exportScenarioProgress.reset();
    handleExportScenario();
  }, [exportScenarioProgress, handleExportScenario]);

  const handleRetryExportTemplate = useCallback(() => {
    exportTemplateProgress.reset();
    handleExportTemplate();
  }, [exportTemplateProgress, handleExportTemplate]);

  // Set default export scenario when current scenario changes
  useEffect(() => {
    if (currentScenario && !exportScenarioId) {
      setExportScenarioId(currentScenario.id);
    }
  }, [currentScenario, exportScenarioId]);

  // Translate known import stat labels; fall back to the original
  // camelCase-to-spaced rendering for any future unknown stat keys
  const getStatLabel = (key: string): string => {
    const translationKey = `importExport:stats.${key}`;
    const translated = t(translationKey);
    if (translated !== translationKey) {
      return translated;
    }
    return `${key.replace(/([A-Z])/g, ' $1').trim()}:`;
  };

  const renderImportTab = () => (
    <div className="page-container">
      <div className="import-container">
        <div className="import-card">
          <div className="import-options">
            <div className="basic-options">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={clearExisting}
                  onChange={(e) => setClearExisting(e.target.checked)}
                  disabled={uploading}
                />
                <span>{t('importExport:import.clearExisting')}</span>
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={useV2}
                  onChange={(e) => setUseV2(e.target.checked)}
                  disabled={uploading}
                />
                <span>{t('importExport:import.useNewFormat')}</span>
              </label>
            </div>

            {importSettings && (
              <div className="settings-preview">
                <div className="settings-header">
                  <h4>{t('importExport:import.configuration')}</h4>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                    disabled={uploading}
                  >
                    <Settings size={16} />
                    {showAdvancedSettings ? t('importExport:import.hideAdvanced') : t('importExport:import.advancedSettings')}
                  </button>
                </div>

                <div className="settings-summary">
                  <span>{t('importExport:import.validateDuplicatesSummary', { value: importSettings.validateDuplicates ? t('common:yes') : t('common:no') })}</span>
                  <span>{t('importExport:import.autoCreateRolesSummary', { value: importSettings.autoCreateMissingRoles ? t('common:yes') : t('common:no') })}</span>
                  <span>{t('importExport:import.autoCreateLocationsSummary', { value: importSettings.autoCreateMissingLocations ? t('common:yes') : t('common:no') })}</span>
                  <span>{t('importExport:import.defaultPrioritySummary', { value: importSettings.defaultProjectPriority === 1 ? t('importExport:import.priorityHigh') : importSettings.defaultProjectPriority === 2 ? t('importExport:import.priorityMedium') : t('importExport:import.priorityLow') })}</span>
                  <span>{t('importExport:import.dateFormatSummary', { value: importSettings.dateFormat })}</span>
                </div>

                {showAdvancedSettings && (
                  <div className="advanced-settings">
                    <h5>{t('importExport:import.overrideTitle')}</h5>
                    <div className="settings-grid">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={settingsOverrides.validateDuplicates ?? importSettings.validateDuplicates}
                          onChange={(e) => setSettingsOverrides({
                            ...settingsOverrides,
                            validateDuplicates: e.target.checked
                          })}
                          disabled={uploading}
                        />
                        <span>{t('importExport:import.validateDuplicates')}</span>
                      </label>
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={settingsOverrides.autoCreateMissingRoles ?? importSettings.autoCreateMissingRoles}
                          onChange={(e) => setSettingsOverrides({
                            ...settingsOverrides,
                            autoCreateMissingRoles: e.target.checked
                          })}
                          disabled={uploading}
                        />
                        <span>{t('importExport:import.autoCreateRoles')}</span>
                      </label>
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={settingsOverrides.autoCreateMissingLocations ?? importSettings.autoCreateMissingLocations}
                          onChange={(e) => setSettingsOverrides({
                            ...settingsOverrides,
                            autoCreateMissingLocations: e.target.checked
                          })}
                          disabled={uploading}
                        />
                        <span>{t('importExport:import.autoCreateLocations')}</span>
                      </label>
                      <div className="form-group">
                        <label>{t('importExport:import.defaultPriorityLabel')}</label>
                        <select
                          value={settingsOverrides.defaultProjectPriority ?? importSettings.defaultProjectPriority}
                          onChange={(e) => setSettingsOverrides({
                            ...settingsOverrides,
                            defaultProjectPriority: parseInt(e.target.value, 10)
                          })}
                          disabled={uploading}
                          className="form-select"
                        >
                          <option value={1}>{t('importExport:import.priorityHigh')}</option>
                          <option value={2}>{t('importExport:import.priorityMedium')}</option>
                          <option value={3}>{t('importExport:import.priorityLow')}</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label>{t('importExport:import.dateFormatLabel')}</label>
                        <select
                          value={settingsOverrides.dateFormat ?? importSettings.dateFormat}
                          onChange={(e) => setSettingsOverrides({
                            ...settingsOverrides,
                            dateFormat: e.target.value
                          })}
                          disabled={uploading}
                          className="form-select"
                        >
                          <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                          <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                          <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {!file && (
            <div
              className="upload-area"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={48} />
              <h3>{t('importExport:import.dropHere')}</h3>
              <p>{t('importExport:import.orClick')}</p>
              <p className="text-sm text-muted">{t('importExport:import.supportsFormats')}</p>
            </div>
          )}

          {file && (
            <div className="file-selected">
              <FileSpreadsheet size={48} />
              <div className="file-info">
                <h3>{file.name}</h3>
                <p className="text-sm text-muted">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <button
                className="btn btn-icon btn-sm"
                onClick={handleRemoveFile}
                disabled={uploading}
              >
                <X size={16} />
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />

          {file && !uploading && importProgress.status === 'idle' && (
            <button
              className="btn btn-primary upload-btn"
              onClick={handleUpload}
              disabled={uploading}
            >
              {t('importExport:import.uploadAndImport')}
            </button>
          )}

          {/* Import operation progress */}
          {importProgress.status !== 'idle' && (
            <OperationProgress
              status={importProgress.status}
              current={importProgress.current}
              total={importProgress.total}
              message={importProgress.message}
              details={importProgress.details}
              estimatedTimeRemaining={importProgress.estimatedTimeRemaining}
              errors={importProgress.errors}
              warnings={importProgress.warnings}
              onRetry={handleRetryImport}
              canRetry={file !== null}
              className="mt-4"
            />
          )}
        </div>

        {result && importProgress.status !== 'running' && (
          <div className={`import-result ${result.success ? 'success' : 'error'}`}>
            <div className="result-header">
              {result.success ? (
                <CheckCircle size={24} className="result-icon" />
              ) : (
                <AlertCircle size={24} className="result-icon" />
              )}
              <h3>{result.message || (result.success ? t('importExport:results.success') : t('importExport:results.failed'))}</h3>
            </div>

            {result.imported && (
              <div className="import-stats">
                <h4>{t('importExport:results.importedRecords')}</h4>
                <div className="stats-grid">
                  {Object.entries(result.imported).map(([key, value]) => (
                    <div key={key} className="stat-item">
                      <span className="stat-label">{getStatLabel(key)}</span>
                      <span className="stat-value">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.errors && result.errors.length > 0 && (
              <div className="result-errors">
                <h4>{t('importExport:results.errors')}</h4>
                <ul>
                  {result.errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.warnings && result.warnings.length > 0 && (
              <div className="result-warnings">
                <h4>{t('importExport:results.warnings')}</h4>
                <ul>
                  {result.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="help-section" role="complementary" aria-labelledby="help-section-title">
          <div className="help-header">
            <h3 id="help-section-title">{t('importExport:help.title')}</h3>
            <p className="text-muted">{t('importExport:help.subtitle')}</p>
          </div>

          <div className="help-cards">
            <div className="help-card" role="article" aria-labelledby="template-structure-title">
              <div className="help-card-icon" aria-hidden="true">
                📄
              </div>
              <div className="help-card-content">
                <h4 id="template-structure-title">{t('importExport:help.templateStructure')}</h4>
                <p>{t('importExport:help.containSheets')}</p>
                <div className="sheet-list" role="list">
                  <div className="sheet-item essential" role="listitem">
                    <span className="sheet-badge" aria-label={t('importExport:help.requiredSheet')}>{t('importExport:help.required')}</span>
                    <strong>Projects</strong> - {t('importExport:help.projectsDesc')}
                  </div>
                  <div className="sheet-item essential" role="listitem">
                    <span className="sheet-badge" aria-label={t('importExport:help.requiredSheet')}>{t('importExport:help.required')}</span>
                    <strong>Roster</strong> - {t('importExport:help.rosterDesc')}
                  </div>
                  <div className="sheet-item" role="listitem">
                    <span className="sheet-badge" aria-label={t('importExport:help.optionalSheet')}>{t('importExport:help.optional')}</span>
                    <strong>Assignments</strong> - {t('importExport:help.assignmentsDesc')}
                  </div>
                  <div className="sheet-item" role="listitem">
                    <span className="sheet-badge" aria-label={t('importExport:help.optionalSheet')}>{t('importExport:help.optional')}</span>
                    <strong>Project Roadmap</strong> - {t('importExport:help.roadmapDesc')}
                  </div>
                </div>
              </div>
            </div>

            <div className="help-card" role="article" aria-labelledby="import-tips-title">
              <div className="help-card-icon" aria-hidden="true">
                ⚙️
              </div>
              <div className="help-card-content">
                <h4 id="import-tips-title">{t('importExport:help.tipsTitle')}</h4>
                <div className="tip-list" role="list">
                  <div className="tip-item" role="listitem">
                    <span aria-hidden="true">💡</span> {t('importExport:help.tipClear')}
                  </div>
                  <div className="tip-item" role="listitem">
                    <span aria-hidden="true">📅</span> {t('importExport:help.tipFiscal')}
                  </div>
                  <div className="tip-item" role="listitem">
                    <span aria-hidden="true">🔍</span> {t('importExport:help.tipReview')}
                  </div>
                  <div className="tip-item" role="listitem">
                    <span aria-hidden="true">💾</span> {t('importExport:help.tipBackup')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderExportTab = () => (
    <div className="page-container">
      <div className="import-container">
        <div className="import-card export-section">
          <div className="card-header">
            <h2>{t('importExport:export.title')}</h2>
            <p className="text-muted">{t('importExport:export.subtitle')}</p>
          </div>

          <div className="export-options">
            {/* Export Scenario Data Section */}
            <div className="export-type-card">
              <div className="export-option">
                <Database size={28} />
                <div className="export-option-content">
                  <h3>{t('importExport:export.scenarioTitle')}</h3>
                  <p>{t('importExport:export.scenarioDesc')}</p>
                </div>
              </div>

              <div className="export-controls">
                <div className="export-controls-grid">
                  <div className="controls-section">
                    <div className="controls-section-title">{t('importExport:export.scenarioSelection')}</div>
                    <div className="form-group">
                      <label>{t('importExport:export.chooseScenario')}</label>
                      <select
                        value={exportScenarioId}
                        onChange={(e) => setExportScenarioId(e.target.value)}
                        className="form-select"
                        disabled={exportingScenario || exportingTemplate}
                      >
                        <option value="">
                          {currentScenario ? t('importExport:export.currentOption', { name: currentScenario.name, type: currentScenario.scenario_type }) : t('common:loadingScenarios')}
                        </option>
                        {scenarios.map(scenario => (
                          <option key={scenario.id} value={scenario.id}>
                            {scenario.name} ({scenario.scenario_type})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="controls-section">
                    <div className="controls-section-header">
                      <div className="controls-section-title">{t('importExport:export.options')}</div>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => setShowExportOptions(!showExportOptions)}
                        disabled={exportingScenario}
                        aria-expanded={showExportOptions}
                        aria-controls="export-options-content"
                        aria-label={showExportOptions ? t('importExport:export.hideOptionsAria') : t('importExport:export.showOptionsAria')}
                      >
                        <Settings size={14} />
                        {showExportOptions ? t('importExport:export.hideOptions') : t('importExport:export.showOptions')}
                      </button>
                    </div>

                    {showExportOptions && (
                      <div
                        className="progressive-disclosure-content"
                        id="export-options-content"
                        role="region"
                        aria-labelledby="export-options-title"
                      >
                        <fieldset className="checkbox-group">
                          <legend className="sr-only">{t('importExport:export.optionsLegend')}</legend>
                          <label className="checkbox-label">
                            <input
                              type="checkbox"
                              checked={exportIncludeAssignments}
                              onChange={(e) => setExportIncludeAssignments(e.target.checked)}
                              disabled={exportingScenario}
                              aria-describedby="assignments-help"
                            />
                            <span>{t('importExport:export.includeAssignments')}</span>
                          </label>
                          <label className="checkbox-label">
                            <input
                              type="checkbox"
                              checked={exportIncludePhases}
                              onChange={(e) => setExportIncludePhases(e.target.checked)}
                              disabled={exportingScenario}
                              aria-describedby="phases-help"
                            />
                            <span>{t('importExport:export.includePhases')}</span>
                          </label>
                        </fieldset>
                        <div className="options-summary" role="note">
                          <small className="text-muted" id="assignments-help phases-help">
                            {t('importExport:export.bothRecommended')}
                          </small>
                        </div>
                      </div>
                    )}

                    {!showExportOptions && (
                      <div className="options-preview">
                        <small className="text-muted">
                          {t('importExport:export.defaultIncluding')}
                        </small>
                      </div>
                    )}
                  </div>
                </div>

                {exportScenarioProgress.status === 'idle' && (
                  <button
                    className="btn btn-primary export-action-button"
                    onClick={handleExportScenario}
                    disabled={exportingScenario || exportingTemplate || (!exportScenarioId && !currentScenario)}
                    aria-describedby="export-scenario-status"
                    aria-label={exportingScenario ? t('importExport:export.exportingAria') : t('importExport:export.exportScenarioAria')}
                  >
                    <Download size={18} aria-hidden="true" />
                    {t('importExport:export.scenarioTitle')}
                  </button>
                )}

                {/* Scenario export progress */}
                {exportScenarioProgress.status !== 'idle' && (
                  <OperationProgress
                    status={exportScenarioProgress.status}
                    current={exportScenarioProgress.current}
                    total={exportScenarioProgress.total}
                    message={exportScenarioProgress.message}
                    details={exportScenarioProgress.details}
                    errors={exportScenarioProgress.errors}
                    warnings={exportScenarioProgress.warnings}
                    onRetry={handleRetryExportScenario}
                    canRetry={true}
                    className="mt-4"
                  />
                )}

                <div id="export-scenario-status" className="sr-only">
                  {exportingScenario ? t('importExport:export.statusInProgress') :
                   (!exportScenarioId && !currentScenario) ? t('importExport:errors.selectScenario') :
                   t('importExport:export.statusReady')}
                </div>
              </div>
            </div>

            <div className="export-divider" data-text={t('importExport:export.or')}></div>

            {/* Download Template Section */}
            <div className="export-type-card">
              <div className="export-option">
                <FileText size={28} />
                <div className="export-option-content">
                  <h3>{t('importExport:export.templateTitle')}</h3>
                  <p>{t('importExport:export.templateDesc')}</p>
                </div>
              </div>

              <div className="export-controls">
                <div className="export-controls-grid">
                  <div className="controls-section">
                    <div className="controls-section-header">
                      <div className="controls-section-title">{t('importExport:export.templateConfig')}</div>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => setShowTemplateOptions(!showTemplateOptions)}
                        disabled={exportingTemplate}
                        aria-expanded={showTemplateOptions}
                        aria-controls="template-options-content"
                        aria-label={showTemplateOptions ? t('importExport:export.hideTemplateOptionsAria') : t('importExport:export.showTemplateOptionsAria')}
                      >
                        <Settings size={14} />
                        {showTemplateOptions ? t('importExport:export.hideOptions') : t('importExport:export.customize')}
                      </button>
                    </div>

                    {showTemplateOptions && (
                      <div
                        className="progressive-disclosure-content"
                        id="template-options-content"
                        role="region"
                        aria-labelledby="template-options-title"
                      >
                        <div className="form-group">
                          <label htmlFor="template-type-select">{t('importExport:export.templateType')}</label>
                          <select
                            id="template-type-select"
                            value={templateType}
                            onChange={(e) => setTemplateType(e.target.value)}
                            className="form-select"
                            disabled={exportingTemplate}
                            aria-describedby="template-type-help"
                          >
                            <option value="complete">{t('importExport:export.templateComplete')}</option>
                            <option value="basic">{t('importExport:export.templateBasic')}</option>
                            <option value="minimal">{t('importExport:export.templateMinimal')}</option>
                          </select>
                          <div className="form-help">
                            <small className="text-muted" id="template-type-help">
                              {templateType === 'complete' && t('importExport:export.helpComplete')}
                              {templateType === 'basic' && t('importExport:export.helpBasic')}
                              {templateType === 'minimal' && t('importExport:export.helpMinimal')}
                            </small>
                          </div>
                        </div>
                      </div>
                    )}

                    {!showTemplateOptions && (
                      <div className="options-preview">
                        <small className="text-muted">
                          {t('importExport:export.usingTemplate', { type: templateType === 'complete' ? t('importExport:export.templateNameComplete') : templateType === 'basic' ? t('importExport:export.templateNameBasic') : t('importExport:export.templateNameMinimal') })}
                        </small>
                      </div>
                    )}
                  </div>
                </div>

                {exportTemplateProgress.status === 'idle' && (
                  <button
                    className="btn btn-outline export-action-button"
                    onClick={handleExportTemplate}
                    disabled={exportingTemplate}
                    aria-describedby="export-template-status"
                    aria-label={exportingTemplate ? t('importExport:export.generatingAria') : t('importExport:export.downloadTemplateAria')}
                  >
                    <Download size={18} aria-hidden="true" />
                    {t('importExport:export.downloadButton')}
                  </button>
                )}

                {/* Template export progress */}
                {exportTemplateProgress.status !== 'idle' && (
                  <OperationProgress
                    status={exportTemplateProgress.status}
                    current={exportTemplateProgress.current}
                    total={exportTemplateProgress.total}
                    message={exportTemplateProgress.message}
                    details={exportTemplateProgress.details}
                    errors={exportTemplateProgress.errors}
                    warnings={exportTemplateProgress.warnings}
                    onRetry={handleRetryExportTemplate}
                    canRetry={true}
                    className="mt-4"
                  />
                )}

                <div id="export-template-status" className="sr-only">
                  {exportingTemplate ? t('importExport:export.statusTemplateInProgress') : t('importExport:export.statusTemplateReady')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <UnifiedTabComponent
      tabs={importExportTabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      variant="primary"
      size="md"
      orientation="horizontal"
      ariaLabel={t('importExport:tabsAria')}
    >
      {activeTab === 'import' && renderImportTab()}
      {activeTab === 'export' && renderExportTab()}
    </UnifiedTabComponent>
  );
}

export default ImportUnified;