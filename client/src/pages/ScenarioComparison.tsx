import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api-client';
import { useBookmarkableTabs } from '../hooks/useBookmarkableTabs';
import { getLocale } from '../i18n';
import { scenarioTypeLabel, scenarioStatusLabel } from '../lib/enum-labels';
import './ScenarioComparison.css';

interface Scenario {
  id: string;
  name: string;
  description: string;
  scenario_type: string;
  status: string;
  created_at: string;
  parent_scenario_name?: string;
}

interface Assignment {
  person_name: string;
  project_name: string;
  role_name?: string;
  allocation_percentage?: number;
  computed_start_date?: string;
  computed_end_date?: string;
  old_allocation?: number;
  new_allocation?: number;
  old_role?: string;
  new_role?: string;
  old_dates?: string;
  new_dates?: string;
  allocation_change?: boolean;
  role_change?: boolean;
  date_change?: boolean;
}

interface ComparisonData {
  scenario1: Scenario;
  scenario2: Scenario;
  differences: {
    assignments: {
      added: Assignment[];
      modified: Assignment[];
      removed: Assignment[];
    };
    phases: {
      added: any[];
      modified: any[];
      removed: any[];
    };
    projects: {
      added: any[];
      modified: any[];
      removed: any[];
    };
  };
  metrics: {
    utilization_impact: {
      team_utilization_change?: string;
      over_allocated_people?: string;
      available_capacity?: string;
    };
    capacity_impact: {
      additional_resource_needs?: string;
      skills_gap?: string;
    };
    timeline_impact: {
      projects_affected?: number;
      average_timeline_change?: string;
      projects_at_risk?: number;
    };
  };
}

export const ScenarioComparison: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [comparisonData, setComparisonData] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tab labels are localized, so the config must live inside the component —
  // a module-level constant would freeze the labels at import time.
  const comparisonTabs = [
    { id: 'summary', label: t('scenarios:comparison.tabs.summary') },
    { id: 'assignments', label: t('scenarios:comparison.tabs.assignments') },
    { id: 'phases', label: t('scenarios:comparison.tabs.phases') },
    { id: 'projects', label: t('scenarios:comparison.tabs.projects') },
    { id: 'metrics', label: t('scenarios:comparison.tabs.metrics') }
  ];

  // Use bookmarkable tabs for scenario comparison
  const { setActiveTab, isActiveTab } = useBookmarkableTabs({
    tabs: comparisonTabs,
    defaultTab: 'summary'
  });

  const sourceId = searchParams.get('source');
  const targetId = searchParams.get('target');

  useEffect(() => {
    if (sourceId && targetId) {
      loadComparison();
    }
  }, [sourceId, targetId]);

  const loadComparison = async () => {
    if (!sourceId || !targetId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await api.scenarios.compare(sourceId, targetId);
      setComparisonData(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || t('scenarios:comparison.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    navigate('/scenarios');
  };

  const getTotalChanges = () => {
    if (!comparisonData) return 0;
    const { assignments, phases, projects } = comparisonData.differences;
    return (
      assignments.added.length + assignments.modified.length + assignments.removed.length +
      phases.added.length + phases.modified.length + phases.removed.length +
      projects.added.length + projects.modified.length + projects.removed.length
    );
  };

  const renderScenarioHeader = (scenario: Scenario, label: string) => (
    <div className="scenario-header">
      <div className="scenario-label">{label}</div>
      <h2 className="scenario-name">{scenario.name}</h2>
      <p className="scenario-description">{scenario.description}</p>
      <div className="scenario-badges">
        <span className={`badge scenario-type ${scenario.scenario_type}`}>
          {scenarioTypeLabel(scenario.scenario_type).toUpperCase()}
        </span>
        <span className={`badge scenario-status ${scenario.status}`}>
          {scenarioStatusLabel(scenario.status).toUpperCase()}
        </span>
        <span className="badge scenario-date">
          {new Date(scenario.created_at).toLocaleDateString(getLocale())}
        </span>
      </div>
    </div>
  );

  const renderSummaryTab = () => {
    if (!comparisonData) return null;

    const totalChanges = getTotalChanges();
    const { assignments, phases, projects } = comparisonData.differences;

    return (
      <div className="summary-tab">
        <div className="summary-cards">
          <div className="summary-card">
            <h3>{t('scenarios:comparison.totalChanges')}</h3>
            <div className="summary-number">{totalChanges}</div>
            <div className="summary-breakdown">
              <div>{t('scenarios:comparison.assignmentsCount', { count: assignments.added.length + assignments.modified.length + assignments.removed.length })}</div>
              <div>{t('scenarios:comparison.phasesCount', { count: phases.added.length + phases.modified.length + phases.removed.length })}</div>
              <div>{t('scenarios:comparison.projectsCount', { count: projects.added.length + projects.modified.length + projects.removed.length })}</div>
            </div>
          </div>

          <div className="summary-card">
            <h3>{t('scenarios:comparison.assignmentChanges')}</h3>
            <div className="change-breakdown">
              <div className="change-item added">
                <span className="change-count">{assignments.added.length}</span>
                <span className="change-label">{t('scenarios:comparison.added')}</span>
              </div>
              <div className="change-item modified">
                <span className="change-count">{assignments.modified.length}</span>
                <span className="change-label">{t('scenarios:comparison.modified')}</span>
              </div>
              <div className="change-item removed">
                <span className="change-count">{assignments.removed.length}</span>
                <span className="change-label">{t('scenarios:comparison.removed')}</span>
              </div>
            </div>
          </div>

          <div className="summary-card">
            <h3>{t('scenarios:comparison.impactMetrics')}</h3>
            <div className="metrics-preview">
              {comparisonData.metrics.utilization_impact.team_utilization_change && (
                <div>{t('scenarios:comparison.utilization', { value: comparisonData.metrics.utilization_impact.team_utilization_change })}</div>
              )}
              {comparisonData.metrics.timeline_impact.projects_affected !== undefined && (
                <div>{t('scenarios:comparison.projectsAffectedCount', { count: comparisonData.metrics.timeline_impact.projects_affected })}</div>
              )}
              {comparisonData.metrics.timeline_impact.projects_at_risk !== undefined && (
                <div>{t('scenarios:comparison.projectsAtRiskCount', { count: comparisonData.metrics.timeline_impact.projects_at_risk })}</div>
              )}
            </div>
          </div>
        </div>

        {totalChanges === 0 && (
          <div className="no-changes-message">
            <h3>{t('scenarios:comparison.noDifferencesTitle')}</h3>
            <p>{t('scenarios:comparison.noDifferencesDetail')}</p>
          </div>
        )}
      </div>
    );
  };

  const renderAssignmentChanges = () => {
    if (!comparisonData) return null;

    const { assignments } = comparisonData.differences;
    const totalChanges = assignments.added.length + assignments.modified.length + assignments.removed.length;

    if (totalChanges === 0) {
      return <div className="no-changes">{t('scenarios:compare.noDifferences')}</div>;
    }

    return (
      <div className="assignment-changes">
        {assignments.added.length > 0 && (
          <div className="change-section added">
            <h3 className="change-header">
              <span className="change-icon">+</span>
              {t('scenarios:comparison.addedAssignments', { count: assignments.added.length })}
            </h3>
            <div className="assignment-list">
              {assignments.added.map((assignment, index) => (
                <div key={index} className="assignment-item added">
                  <div className="assignment-main">
                    <strong>{assignment.person_name}</strong> → <strong>{assignment.project_name}</strong>
                  </div>
                  <div className="assignment-details">
                    <span className="role">{assignment.role_name}</span>
                    <span className="allocation">{assignment.allocation_percentage}%</span>
                    {assignment.computed_start_date && assignment.computed_end_date && (
                      <span className="dates">
                        {t('scenarios:comparison.dateRange', { start: assignment.computed_start_date, end: assignment.computed_end_date })}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {assignments.modified.length > 0 && (
          <div className="change-section modified">
            <h3 className="change-header">
              <span className="change-icon">~</span>
              {t('scenarios:comparison.modifiedAssignments', { count: assignments.modified.length })}
            </h3>
            <div className="assignment-list">
              {assignments.modified.map((assignment, index) => (
                <div key={index} className="assignment-item modified">
                  <div className="assignment-main">
                    <strong>{assignment.person_name}</strong> → <strong>{assignment.project_name}</strong>
                  </div>
                  <div className="assignment-changes">
                    {assignment.allocation_change && (
                      <div className="change-detail">
                        <span className="change-type">{t('scenarios:comparison.allocationLabel')}</span>
                        <span className="old-value">{assignment.old_allocation}%</span>
                        <span className="arrow">→</span>
                        <span className="new-value">{assignment.new_allocation}%</span>
                      </div>
                    )}
                    {assignment.role_change && (
                      <div className="change-detail">
                        <span className="change-type">{t('scenarios:comparison.roleLabel')}</span>
                        <span className="old-value">{assignment.old_role}</span>
                        <span className="arrow">→</span>
                        <span className="new-value">{assignment.new_role}</span>
                      </div>
                    )}
                    {assignment.date_change && (
                      <div className="change-detail">
                        <span className="change-type">{t('scenarios:comparison.datesLabel')}</span>
                        <span className="old-value">{assignment.old_dates}</span>
                        <span className="arrow">→</span>
                        <span className="new-value">{assignment.new_dates}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {assignments.removed.length > 0 && (
          <div className="change-section removed">
            <h3 className="change-header">
              <span className="change-icon">-</span>
              {t('scenarios:comparison.removedAssignments', { count: assignments.removed.length })}
            </h3>
            <div className="assignment-list">
              {assignments.removed.map((assignment, index) => (
                <div key={index} className="assignment-item removed">
                  <div className="assignment-main">
                    <strong>{assignment.person_name}</strong> → <strong>{assignment.project_name}</strong>
                  </div>
                  <div className="assignment-details">
                    <span className="role">{assignment.role_name}</span>
                    <span className="allocation">{assignment.allocation_percentage}%</span>
                    {assignment.computed_start_date && assignment.computed_end_date && (
                      <span className="dates">
                        {t('scenarios:comparison.dateRange', { start: assignment.computed_start_date, end: assignment.computed_end_date })}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderMetricsTab = () => {
    if (!comparisonData) return null;

    const { metrics } = comparisonData;

    return (
      <div className="metrics-tab">
        <div className="metrics-grid">
          <div className="metric-section">
            <h3>{t('scenarios:comparison.utilizationImpact')}</h3>
            <div className="metric-items">
              {metrics.utilization_impact.team_utilization_change && (
                <div className="metric-item">
                  <span className="metric-label">{t('scenarios:comparison.teamUtilizationChange')}</span>
                  <span className="metric-value">{metrics.utilization_impact.team_utilization_change}</span>
                </div>
              )}
              {metrics.utilization_impact.over_allocated_people && (
                <div className="metric-item">
                  <span className="metric-label">{t('scenarios:comparison.overAllocatedPeople')}</span>
                  <span className="metric-value">{metrics.utilization_impact.over_allocated_people}</span>
                </div>
              )}
              {metrics.utilization_impact.available_capacity && (
                <div className="metric-item">
                  <span className="metric-label">{t('scenarios:comparison.availableCapacity')}</span>
                  <span className="metric-value">{metrics.utilization_impact.available_capacity}</span>
                </div>
              )}
            </div>
          </div>

          <div className="metric-section">
            <h3>{t('scenarios:comparison.capacityImpact')}</h3>
            <div className="metric-items">
              {metrics.capacity_impact.additional_resource_needs && (
                <div className="metric-item">
                  <span className="metric-label">{t('scenarios:comparison.additionalResourceNeeds')}</span>
                  <span className="metric-value">{metrics.capacity_impact.additional_resource_needs}</span>
                </div>
              )}
              {metrics.capacity_impact.skills_gap && (
                <div className="metric-item">
                  <span className="metric-label">{t('scenarios:comparison.skillsGap')}</span>
                  <span className="metric-value">{metrics.capacity_impact.skills_gap}</span>
                </div>
              )}
            </div>
          </div>

          <div className="metric-section">
            <h3>{t('scenarios:comparison.timelineImpact')}</h3>
            <div className="metric-items">
              {metrics.timeline_impact.projects_affected !== undefined && (
                <div className="metric-item">
                  <span className="metric-label">{t('scenarios:compare.projectsAffected')}</span>
                  <span className="metric-value">{metrics.timeline_impact.projects_affected}</span>
                </div>
              )}
              {metrics.timeline_impact.average_timeline_change && (
                <div className="metric-item">
                  <span className="metric-label">{t('scenarios:comparison.averageTimelineChange')}</span>
                  <span className="metric-value">{metrics.timeline_impact.average_timeline_change}</span>
                </div>
              )}
              {metrics.timeline_impact.projects_at_risk !== undefined && (
                <div className="metric-item">
                  <span className="metric-label">{t('scenarios:comparison.projectsAtRisk')}</span>
                  <span className="metric-value">{metrics.timeline_impact.projects_at_risk}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) return <div className="loading">{t('scenarios:comparison.loading')}</div>;
  if (error) return <div className="error">{t('common:error')}: {error}</div>;
  if (!comparisonData) return <div className="error">{t('scenarios:comparison.noData')}</div>;

  return (
    <div className="scenario-comparison">
      <div className="comparison-header">
        <button className="back-button" onClick={goBack}>
          {t('scenarios:comparison.backToScenarios')}
        </button>
        <h1>{t('scenarios:comparison.title')}</h1>
      </div>

      <div className="scenario-headers">
        {renderScenarioHeader(comparisonData.scenario1, t('scenarios:sourceScenario'))}
        <div className="vs-divider">VS</div>
        {renderScenarioHeader(comparisonData.scenario2, t('scenarios:targetScenario'))}
      </div>

      <div className="comparison-tabs">
        <button
          className={`tab ${isActiveTab('summary') ? 'active' : ''}`}
          onClick={() => setActiveTab('summary')}
        >
          {t('scenarios:comparison.tabs.summary')}
        </button>
        <button
          className={`tab ${isActiveTab('assignments') ? 'active' : ''}`}
          onClick={() => setActiveTab('assignments')}
        >
          {t('scenarios:comparison.assignmentsTab', { count: comparisonData.differences.assignments.added.length + comparisonData.differences.assignments.modified.length + comparisonData.differences.assignments.removed.length })}
        </button>
        <button
          className={`tab ${isActiveTab('phases') ? 'active' : ''}`}
          onClick={() => setActiveTab('phases')}
        >
          {t('scenarios:comparison.phasesTab', { count: comparisonData.differences.phases.added.length + comparisonData.differences.phases.modified.length + comparisonData.differences.phases.removed.length })}
        </button>
        <button
          className={`tab ${isActiveTab('projects') ? 'active' : ''}`}
          onClick={() => setActiveTab('projects')}
        >
          {t('scenarios:comparison.projectsTab', { count: comparisonData.differences.projects.added.length + comparisonData.differences.projects.modified.length + comparisonData.differences.projects.removed.length })}
        </button>
        <button
          className={`tab ${isActiveTab('metrics') ? 'active' : ''}`}
          onClick={() => setActiveTab('metrics')}
        >
          {t('scenarios:comparison.impactMetricsTab')}
        </button>
      </div>

      <div className="comparison-content">
        {isActiveTab('summary') && renderSummaryTab()}
        {isActiveTab('assignments') && renderAssignmentChanges()}
        {isActiveTab('phases') && <div className="coming-soon">{t('scenarios:comparison.phasesComingSoon')}</div>}
        {isActiveTab('projects') && <div className="coming-soon">{t('scenarios:comparison.projectsComingSoon')}</div>}
        {isActiveTab('metrics') && renderMetricsTab()}
      </div>
    </div>
  );
};