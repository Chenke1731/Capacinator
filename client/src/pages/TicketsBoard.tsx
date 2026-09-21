import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import { api } from '../lib/api-client';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { useScenario } from '../contexts/ScenarioContext';
import { categoryOfTypeName } from '../lib/projectCategories';

/**
 * 问题单台 (2026-09-21 分流) — v1 轻量: 缓冲概览 + 当前分配。
 * 月度量台账→滚动平均→建议缓冲率: 用户裁决暂缓, 留占位说明。
 */
export function TicketsBoard() {
  const { t } = useTranslation();
  const { currentScenario } = useScenario();

  const { data: boards, isLoading } = useQuery({
    queryKey: ['tickets-board', currentScenario?.id],
    queryFn: async () => {
      const list = (await api.projects.list({ limit: 100 })).data.data as any[];
      const ticketProjects = list.filter((p) => categoryOfTypeName(p.project_type_name) === 'tickets');
      const details = await Promise.all(
        ticketProjects.map(async (p) => {
          const detail = (await api.projects.get(p.id)).data.data ?? (await api.projects.get(p.id)).data;
          return { summary: p, detail };
        })
      );
      return details;
    },
    enabled: !!currentScenario
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="tickets-board">
      <div className="tickets-ledger-note">
        <Inbox size={14} className="inline mr-1" />
        {t('projects:ticketsBoard.ledgerNote')}
      </div>

      {(boards ?? []).length === 0 && (
        <div className="requirements-empty">{t('projects:ticketsBoard.empty')}</div>
      )}

      {(boards ?? []).map(({ summary, detail }) => {
        const assignments = (detail?.assignments ?? []).filter((a: any) => a.status !== 'paused');
        const totalFte = assignments.reduce((s: number, a: any) => s + (a.allocation_percentage ?? 0) / 100, 0);
        const avgPct = assignments.length
          ? Math.round(assignments.reduce((s: number, a: any) => s + a.allocation_percentage, 0) / assignments.length)
          : 0;

        return (
          <div key={summary.id} className="tickets-card">
            <div className="tickets-card-header">
              <Link to={`/projects/${summary.id}`} className="text-primary hover:underline font-semibold">
                {summary.name}
              </Link>
              <span className="tickets-stat">
                {t('projects:ticketsBoard.stat', { people: assignments.length, avgPct, fte: Math.round(totalFte * 100) / 100 })}
              </span>
            </div>

            <table className="staffing-table">
              <thead>
                <tr>
                  <th>{t('projects:staffing.colPerson')}</th>
                  <th>{t('common:role')}</th>
                  <th>{t('projects:staffing.colFte')}</th>
                  <th>{t('projects:staffing.colPeriod')}</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a: any) => (
                  <tr key={a.id}>
                    <td>
                      <Link to={`/people/${a.person_id}`} className="text-primary hover:underline">{a.person_name}</Link>
                    </td>
                    <td>{a.role_name}</td>
                    <td>{a.allocation_percentage}%</td>
                    <td>
                      {(a.computed_start_date ?? a.start_date ?? '').toString().slice(0, 10)} ~{' '}
                      {(a.computed_end_date ?? a.end_date ?? '').toString().slice(0, 10) || '—'}
                    </td>
                  </tr>
                ))}
                {assignments.length === 0 && (
                  <tr>
                    <td colSpan={4} className="staffing-empty">{t('people:details.noAssignments')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
