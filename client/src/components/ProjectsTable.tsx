import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Eye } from 'lucide-react';
import type { Project } from '../types';
import { getLocale } from '../i18n';
import { projectStatusLabel } from '../lib/enum-labels';
import './ProjectsTable.css';

interface ProjectsTableProps {
  projects: Project[];
  maxRows?: number;
}

export default function ProjectsTable({ projects, maxRows = 10 }: ProjectsTableProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'planned': return 'badge badge-primary';
      case 'active': return 'badge badge-success';
      case 'on_hold': return 'badge badge-warning';
      case 'completed': return 'badge badge-secondary';
      case 'cancelled': return 'badge badge-danger';
      default: return 'badge';
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString(getLocale(), {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const displayProjects = projects.slice(0, maxRows);
  const hasMore = projects.length > maxRows;

  if (projects.length === 0) {
    return (
      <div className="empty-state">
        <p>{t('projects:miniTable.emptyTitle')}</p>
        <p className="text-muted">{t('projects:miniTable.emptyHint')}</p>
        <button
          className="btn btn-primary"
          onClick={() => navigate('/projects/new')}
        >
          {t('projects:miniTable.createFirst')}
        </button>
      </div>
    );
  }

  return (
    <div className="projects-mini-table">
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>{t('projects:projectName')}</th>
              <th>{t('projects:location')}</th>
              <th>{t('common:status')}</th>
              <th>{t('projects:owner')}</th>
              <th>{t('common:startDate')}</th>
              <th>{t('common:actions')}</th>
            </tr>
          </thead>
          <tbody>
            {displayProjects.map((project: Project) => (
              <tr key={project.id}>
                <td>
                  <div className="project-name">
                    <strong>{project.name}</strong>
                    {project.description && (
                      <div className="project-description">
                        {project.description.substring(0, 80)}
                        {project.description.length > 80 && '...'}
                      </div>
                    )}
                  </div>
                </td>
                <td>{project.location_name || '-'}</td>
                <td>
                  <span className={getStatusBadgeClass(project.status || 'planned')}>
                    {projectStatusLabel(project.status ?? 'planned')}
                  </span>
                </td>
                <td>{project.owner_name || '-'}</td>
                <td>{formatDate(project.start_date)}</td>
                <td>
                  <button
                    className="btn btn-icon btn-sm"
                    onClick={() => navigate(`/projects/${project.id}`)}
                    title={t('projects:miniTable.viewProject')}
                  >
                    <Eye size={20} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="table-footer">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => navigate(`/projects?project_type_id=${projects[0]?.project_type_id}`)}
          >
            {t('projects:miniTable.viewAll', { count: projects.length })}
          </button>
        </div>
      )}
    </div>
  );
}
