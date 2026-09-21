import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '../lib/api-client';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { useScenario } from '../contexts/ScenarioContext';
import { categoryOfTypeName } from '../lib/projectCategories';

/**
 * 事项台 (2026-09-21 分流) — 关注"哪个事项吃了多少":
 * 每个事项一行卡: 类型 | 当前 N 人 × % | 本月消耗人月 | 展开看分配明细。
 * 月度量趋势暂缓。
 */

/** Fraction of the current calendar month the assignment window covers */
function monthOverlapFraction(startISO?: string | null, endISO?: string | null): number {
  const now = new Date();
  const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const mEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const s = startISO ? new Date(startISO) : null;
  const e = endISO ? new Date(endISO) : null;
  // Undated assignments are treated as ongoing through the window
  const effS = s && s > mStart ? s : mStart;
  const effE = e && e < mEnd ? e : mEnd;
  if (effE <= effS) return 0;
  return (effE.getTime() - effS.getTime()) / (mEnd.getTime() - mStart.getTime());
}

export function AffairsBoard() {
  const { t } = useTranslation();
  const { currentScenario } = useScenario();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: affairs, isLoading } = useQuery({
    queryKey: ['affairs-board', currentScenario?.id],
    queryFn: async () => {
      const list = (await api.projects.list({ limit: 100 })).data.data as any[];
      const rows = list.filter((p) => categoryOfTypeName(p.project_type_name) === 'affairs');
      const details = await Promise.all(
        rows.map(async (p) => {
          const resp = await api.projects.get(p.id);
          const detail = resp.data.data ?? resp.data;
          return { summary: p, detail };
        })
      );
      return details;
    },
    enabled: !!currentScenario
  });

  if (isLoading) return <LoadingSpinner />;

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="affairs-board">
      {(affairs ?? []).length === 0 && (
        <div className="requirements-empty">{t('projects:affairsBoard.empty')}</div>
      )}

      {(affairs ?? []).map(({ summary, detail }) => {
        const all = detail?.assignments ?? [];
        const active = all.filter((a: any) => a.status !== 'paused');
        const isOpen = expanded.has(summary.id);
        const totalFte = active.reduce((s: number, a: any) => s + (a.allocation_percentage ?? 0) / 100, 0);
        const monthPm = active.reduce(
          (s: number, a: any) =>
            s +
            ((a.allocation_percentage ?? 0) / 100) *
              monthOverlapFraction(
                (a.computed_start_date ?? a.start_date ?? '').toString().slice(0, 10) || null,
                (a.computed_end_date ?? a.end_date ?? '').toString().slice(0, 10) || null
              ),
          0
        );
        const round1 = (n: number) => Math.round(n * 10) / 10;

        return (
          <Fragment key={summary.id}>
            <div className="affairs-row" onClick={() => toggle(summary.id)}>
              <span className="affairs-toggle">{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span>
              <Link
                to={`/projects/${summary.id}`}
                className="text-primary hover:underline font-semibold"
                onClick={(e) => e.stopPropagation()}
              >
                {summary.name}
              </Link>
              <span className="affairs-type">{summary.project_type_name}</span>
              <span className="affairs-stat">
                {t('projects:affairsBoard.peopleStat', { people: active.length, fte: Math.round(totalFte * 100) / 100 })}
              </span>
              <span className="affairs-stat affairs-stat--month">
                {t('projects:affairsBoard.monthStat', { pm: round1(monthPm) })}
              </span>
            </div>

            {isOpen && (
              <table className="staffing-table affairs-detail">
                <thead>
                  <tr>
                    <th>{t('projects:staffing.colPerson')}</th>
                    <th>{t('common:role')}</th>
                    <th>{t('projects:staffing.colFte')}</th>
                    <th>{t('projects:staffing.colPeriod')}</th>
                  </tr>
                </thead>
                <tbody>
                  {all.map((a: any) => (
                    <tr key={a.id} className={a.status === 'paused' ? 'staffing-row--paused' : ''}>
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
                  {all.length === 0 && (
                    <tr>
                      <td colSpan={4} className="staffing-empty">{t('people:details.noAssignments')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
