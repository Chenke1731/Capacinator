import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ChevronDown, ChevronRight, Plus, RefreshCw } from 'lucide-react';
import { api } from '../lib/api-client';
import { queryKeys } from '../lib/queryKeys';
import { INTAKE_SOURCE_CHANNELS, type DemandIntake, type IntakeConvertResult } from '../types';
import { IntakeTriageDialog } from '../components/intake/IntakeTriageDialog';
import { useIntakeCapture } from '../contexts/IntakeCaptureContext';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import { Alert, AlertDescription } from '../components/ui/alert';
import { ToastAction } from '../components/ui/toast';
import { useToast } from '../hooks/use-toast';
import { getLocale } from '../i18n';
import './IntakeInbox.css';

/**
 * IntakeInbox —— 收件箱页（I01 设计稿 §5.3，Projects 下 tab=intake）。
 *
 * 默认 status=new、按收件时间升序（等得最久在前）；空/加载/失败三态分离；
 * 行展开显示原文与元数据并支持待处理条目的轻量编辑（提出人/期望/备注）；
 * 操作：转为事项（TriageDialog）/ 拒绝（必填理由）/ 删除（仅 new，二次确认）。
 * 1366 以下隐藏提出人/期望列，由行详情承接。
 */

function formatAge(iso: string, t: (k: string, o?: any) => string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '—';
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return t('intake:inbox.justNow');
  if (hours < 24) return t('intake:inbox.waitingHours', { count: hours });
  return t('intake:inbox.waitingDays', { count: Math.floor(hours / 24) });
}

function isLink(ref: string | null): boolean {
  return !!ref && /^https?:\/\//i.test(ref);
}

export function IntakeInbox() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // 捕捉是收件箱的页面级动作（顶栏不放：全局 chrome 不承载域动作；Alt+N 仍在）
  const { openCapture } = useIntakeCapture();

  const [status, setStatus] = useState('new');
  const [sourceFilter, setSourceFilter] = useState('');
  const [q, setQ] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<DemandIntake | null>(null);
  const [rejecting, setRejecting] = useState<DemandIntake | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [deleting, setDeleting] = useState<DemandIntake | null>(null);
  const [triaging, setTriaging] = useState<DemandIntake | null>(null);

  const listQuery = useQuery({
    queryKey: queryKeys.intake.list({
      status,
      source: sourceFilter,
      q,
    }),
    queryFn: async () => {
      const response = await api.intake.list({
        status,
        source_channel: sourceFilter || undefined,
        q: q || undefined,
        limit: 200,
      });
      return response.data;
    },
  });

  const countsQuery = useQuery({
    queryKey: queryKeys.intake.counts(),
    queryFn: async () => (await api.intake.counts()).data.data,
  });

  const rows: DemandIntake[] = useMemo(() => {
    const data = (listQuery.data as any)?.data;
    return Array.isArray(data) ? data : [];
  }, [listQuery.data]);

  const counts = countsQuery.data ?? { new: 0, converted: 0, rejected: 0, by_source: {} as Record<string, number> };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const editMutation = useMutation({
    mutationFn: async (vars: { id: string; patch: Record<string, unknown> }) =>
      (await api.intake.update(vars.id, vars.patch as any)).data.data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.intake.all });
      toast({ title: t('intake:inbox.editSaved') });
      setEditing(null);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (vars: { id: string; reason: string }) =>
      (await api.intake.reject(vars.id, vars.reason)).data.data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.intake.all });
      toast({ title: t('intake:inbox.rejectToast') });
      setRejecting(null);
      setRejectReason('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.intake.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.intake.all });
      setDeleting(null);
    },
  });

  const handleConverted = (result: IntakeConvertResult) => {
    const project = result.project as { id: string; name: string };
    const descriptionParts: string[] = [];
    if (result.baseline === 'set') {
      descriptionParts.push(t('intake:triage.baselineSet', { count: result.phase_count }));
      if (result.baseline_warnings.includes('phase_extends_beyond_expected_finish')) {
        descriptionParts.push(t('intake:triage.phaseExtends'));
      }
    } else {
      descriptionParts.push(t('intake:triage.baselineUnset'));
    }
    toast({
      title: t('intake:triage.convertedToast', { name: project.name }),
      description: descriptionParts.join('；'),
      action: (
        <ToastAction
          altText={t('intake:triage.openProject')}
          onClick={() => navigate(`/projects/${project.id}`)}
        >
          {t('intake:triage.openProject')}
        </ToastAction>
      ),
    });
    setTriaging(null);
  };

  const renderStatus = (value: string) => t(`intake:status.${value}`);
  const renderSource = (value: string) => t(`intake:sources.${value}`);

  return (
    <div className="intake-inbox" data-testid="intake-inbox">
      <div className="intake-toolbar">
        <h2 className="sr-only">{t('intake:title')}</h2>
        <span className="intake-counts" data-testid="intake-counts">
          {t('intake:inbox.counts.new')}: {counts.new} · {t('intake:inbox.counts.converted')}: {counts.converted} ·{' '}
          {t('intake:inbox.counts.rejected')}: {counts.rejected}
        </span>
        <div className="intake-filters">
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setExpanded(new Set());
            }}
          >
            <SelectTrigger
              id="intake-status-filter"
              className="intake-filter"
              aria-label={t('intake:inbox.filters.status')}
              data-testid="intake-status-filter"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['new', 'converted', 'rejected'].map((s) => (
                <SelectItem key={s} value={s}>
                  {renderStatus(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sourceFilter || 'all'} onValueChange={(v) => setSourceFilter(v === 'all' ? '' : v)}>
            <SelectTrigger
              id="intake-source-filter"
              className="intake-filter"
              aria-label={t('intake:inbox.filters.source')}
              data-testid="intake-source-filter"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('intake:inbox.filters.all')}</SelectItem>
              {INTAKE_SOURCE_CHANNELS.map((channel) => (
                <SelectItem key={channel} value={channel}>
                  {renderSource(channel)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            aria-label={t('intake:inbox.filters.search')}
            className="intake-filter intake-search"
            placeholder={t('intake:inbox.filters.searchPlaceholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid="intake-search"
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={openCapture}
            title={`${t('intake:capture.headerButton')} (Alt+N)`}
            data-testid="inbox-capture-btn"
          >
            <Plus size={14} />
            {t('intake:capture.headerButton')}
          </button>
        </div>
      </div>

      {listQuery.isLoading && (
        <div className="intake-state" role="status" aria-busy="true">
          {t('common:loading')}
        </div>
      )}

      {/* U05 契约：失败≠空态——独立呈现可重试 */}
      {listQuery.isError && (
        <div className="intake-state intake-state--error" role="alert" data-testid="intake-error">
          <span>{t('intake:inbox.loadError')}</span>
          <Button variant="outline" size="sm" onClick={() => listQuery.refetch()}>
            {t('intake:inbox.retry')}
          </Button>
        </div>
      )}

      {listQuery.isSuccess && rows.length === 0 && (
        <div className="intake-empty" data-testid="intake-empty">
          <div className="intake-empty-title">{t('intake:inbox.empty')}</div>
          <div className="intake-empty-hint">{t('intake:inbox.emptyHint')}</div>
        </div>
      )}

      {rows.length > 0 && (
        <table className="intake-table">
          <thead>
            <tr>
              <th className="intake-col-toggle" aria-label="" />
              <th>{t('intake:inbox.columns.title')}</th>
              <th>{t('intake:inbox.columns.source')}</th>
              <th>{t('intake:inbox.columns.ref')}</th>
              <th className="intake-col-requester">{t('intake:inbox.columns.requester')}</th>
              <th className="intake-col-expected">{t('intake:inbox.columns.expected')}</th>
              <th>{t('intake:inbox.columns.age')}</th>
              <th>{t('intake:inbox.columns.status')}</th>
              <th className="intake-col-actions">{t('intake:inbox.columns.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isOpen = expanded.has(row.id);
              return (
                <React.Fragment key={row.id}>
                  <tr
                    className={`intake-row ${row.status !== 'new' ? 'intake-row--closed' : ''}`}
                    data-testid={`intake-row-${row.id}`}
                  >
                    <td className="intake-col-toggle">
                      <button
                        type="button"
                        className="intake-toggle"
                        onClick={() => toggleExpand(row.id)}
                        aria-expanded={isOpen}
                        aria-label={row.title}
                        data-testid={`intake-toggle-${row.id}`}
                      >
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    </td>
                    <td className="intake-cell-title" title={row.title}>{row.title}</td>
                    <td>{renderSource(row.source_channel)}</td>
                    <td className="intake-cell-ref">
                      {isLink(row.source_ref) ? (
                        <a href={row.source_ref!} target="_blank" rel="noreferrer" className="intake-link" title={row.source_ref!}>
                          {row.source_ref!.length > 24 ? `${row.source_ref!.slice(0, 22)}…` : row.source_ref}
                        </a>
                      ) : (
                        row.source_ref ?? '—'
                      )}
                    </td>
                    <td className="intake-col-requester">{row.requester ?? '—'}</td>
                    <td className="intake-col-expected">
                      {row.expected_start || row.expected_finish
                        ? `${row.expected_start ?? '—'} ~ ${row.expected_finish ?? '—'}`
                        : '—'}
                    </td>
                    <td>{formatAge(row.created_at, t)}</td>
                    <td>
                      <span className={`intake-badge intake-badge--${row.status}`}>{renderStatus(row.status)}</span>
                    </td>
                    <td className="intake-col-actions">
                      {row.status === 'new' ? (
                        <div className="intake-actions">
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => setTriaging(row)}
                            data-testid={`intake-convert-${row.id}`}
                          >
                            {t('intake:inbox.actions.convert')}
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => setRejecting(row)}
                            data-testid={`intake-reject-${row.id}`}
                          >
                            {t('intake:inbox.actions.reject')}
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm intake-delete-btn"
                            onClick={() => setDeleting(row)}
                            data-testid={`intake-delete-${row.id}`}
                          >
                            {t('intake:inbox.actions.delete')}
                          </button>
                        </div>
                      ) : row.converted_project_id ? (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => navigate(`/projects/${row.converted_project_id}`)}
                        >
                          {t('intake:detail.convertedProject')}
                        </button>
                      ) : (
                        <span title={row.reject_reason ?? undefined} className="intake-rejected-hint">
                          {renderStatus(row.status)}
                        </span>
                      )}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="intake-detail-row" data-testid={`intake-detail-${row.id}`}>
                      <td colSpan={9}>
                        {editing?.id === row.id ? (
                          <div className="intake-edit">
                            <div className="grid grid-cols-3 gap-3">
                              <div className="space-y-1">
                                <Label htmlFor={`edit-requester-${row.id}`}>{t('intake:capture.requester')}</Label>
                                <Input
                                  id={`edit-requester-${row.id}`}
                                  value={editing.requester ?? ''}
                                  onChange={(e) => setEditing({ ...editing, requester: e.target.value })}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor={`edit-start-${row.id}`}>{t('intake:triage.expectedStart')}</Label>
                                <Input
                                  id={`edit-start-${row.id}`}
                                  type="date"
                                  value={editing.expected_start ?? ''}
                                  onChange={(e) => setEditing({ ...editing, expected_start: e.target.value || null })}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor={`edit-finish-${row.id}`}>{t('intake:triage.expectedFinish')}</Label>
                                <Input
                                  id={`edit-finish-${row.id}`}
                                  type="date"
                                  value={editing.expected_finish ?? ''}
                                  onChange={(e) => setEditing({ ...editing, expected_finish: e.target.value || null })}
                                />
                              </div>
                            </div>
                            <div className="space-y-1 mt-2">
                              <Label htmlFor={`edit-note-${row.id}`}>{t('intake:inbox.detail.note')}</Label>
                              <Textarea
                                id={`edit-note-${row.id}`}
                                rows={2}
                                value={editing.note ?? ''}
                                onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                              />
                            </div>
                            <div className="flex gap-2 mt-2">
                              <Button
                                size="sm"
                                disabled={editMutation.isPending}
                                onClick={() =>
                                  editMutation.mutate({
                                    id: row.id,
                                    patch: {
                                      requester: editing.requester || null,
                                      expected_start: editing.expected_start || null,
                                      expected_finish: editing.expected_finish || null,
                                      note: editing.note || null,
                                    },
                                  })
                                }
                              >
                                {t('intake:inbox.actions.save')}
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                                {t('intake:inbox.actions.cancel')}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="intake-detail">
                            <div className="intake-detail-field">
                              <span className="intake-detail-label">{t('intake:inbox.detail.raw')}</span>
                              <span className="intake-detail-value intake-detail-raw">
                                {row.raw_text ?? '—'}
                              </span>
                            </div>
                            {row.note && (
                              <div className="intake-detail-field">
                                <span className="intake-detail-label">{t('intake:inbox.detail.note')}</span>
                                <span className="intake-detail-value">{row.note}</span>
                              </div>
                            )}
                            <div className="intake-detail-field">
                              <span className="intake-detail-label">{t('intake:inbox.detail.createdAt')}</span>
                              <span className="intake-detail-value">
                                {new Date(row.created_at).toLocaleString(getLocale())}
                              </span>
                            </div>
                            {row.status === 'rejected' && row.reject_reason && (
                              <div className="intake-detail-field">
                                <span className="intake-detail-label">{t('intake:inbox.detail.rejectReason')}</span>
                                <span className="intake-detail-value">{row.reject_reason}</span>
                              </div>
                            )}
                            {row.status === 'new' && (
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                onClick={() => setEditing(row)}
                                data-testid={`intake-edit-${row.id}`}
                              >
                                {t('intake:inbox.detail.editHint')}
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      )}

      <IntakeTriageDialog
        open={triaging !== null}
        intake={triaging}
        onClose={() => setTriaging(null)}
        onConverted={handleConverted}
      />

      <Dialog open={rejecting !== null} onOpenChange={(next) => { if (!next) setRejecting(null); }}>
        <DialogContent
          className="max-w-md"
          style={{
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            borderColor: 'var(--border-color)',
          }}
          data-testid="intake-reject-dialog"
        >
          <DialogHeader>
            <DialogTitle>{t('intake:inbox.rejectTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="intake-reject-reason">{t('intake:inbox.rejectReason')}</Label>
            <Textarea
              id="intake-reject-reason"
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={t('intake:inbox.rejectPlaceholder')}
              data-testid="intake-reject-reason"
            />
          </div>
          {rejectMutation.isError && (
            <Alert variant="destructive">
              <AlertCircle size={16} />
              <AlertDescription>
                {((rejectMutation.error as any)?.response?.data?.message as string) || t('intake:errors.generic')}
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" className="dialog-secondary-btn" onClick={() => setRejecting(null)} disabled={rejectMutation.isPending}>
              {t('intake:inbox.actions.cancel')}
            </Button>
            <Button
              className="dialog-primary-btn"
              disabled={!rejectReason.trim() || rejectMutation.isPending}
              onClick={() => rejecting && rejectMutation.mutate({ id: rejecting.id, reason: rejectReason.trim() })}
              data-testid="intake-reject-submit"
            >
              {rejectMutation.isPending && <RefreshCw size={14} className="mr-2 animate-spin" />}
              {t('intake:inbox.rejectSubmit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={deleting !== null}
        title={t('intake:inbox.deleteTitle')}
        message={t('intake:inbox.deleteMessage', { title: deleting?.title ?? '' })}
        confirmText={t('intake:inbox.deleteConfirm')}
        variant="danger"
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
