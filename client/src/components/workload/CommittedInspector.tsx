/**
 * CommittedInspector（交互优化设计 S2/§5.1，Phase A）——已提交分配的就地面板：
 * 身份列（角色/阶段/来源/版本）只读，比例与 fixed 日期可改，影响预览走
 * "该行新窗口 vs 现值"（InspectorImpact committed 变体）。
 *
 * 控制逻辑与 ghost 面板分离（评审要求）：本面板为受控表单，保存由页面
 * 统一走编辑会话（快照版本 + Saving 锁 + 409 显式刷新）；不含拖拽草稿逻辑。
 */
import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, LocateFixed, Save, X } from 'lucide-react';
import { InspectorImpact, InspectorShell } from './AssignmentInspector';
import { isImeComposing } from '../../lib/ime';
import { api } from '../../lib/api-client';
import { queryKeys } from '../../lib/queryKeys';
import type { AvailabilityOverrideInput } from '../../lib/workloadTimeline';
import type { WorkloadAssignment } from '../../lib/personWorkload';

export interface CommittedInspectorRow {
  id: string;
  projectId: string;
  projectName: string;
  roleId: string | null;
  roleName: string | null;
  phaseId: string | null;
  phaseName: string | null;
  source: 'scenario' | 'direct' | string | null;
  version: number | null;
  dateMode: string | null;
  derivedStartDate: string | null;
  derivedEndDate: string | null;
}

export interface CommittedInspectorForm {
  allocation: string;
  startDate: string;
  endDate: string;
}

export interface CommittedConvertPayload {
  role_id?: string;
  phase_id?: string | null;
  allocation_percentage?: number;
  start_date?: string;
  end_date?: string;
}

interface PhaseOption {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
}

export interface CommittedInspectorProps {
  row: CommittedInspectorRow;
  form: CommittedInspectorForm;
  baseline: { allocation: number; startDate: string; endDate: string };
  saving: boolean;
  converting: boolean;
  error: string | null;
  /** 409 版本冲突：展示"使用最新值刷新" */
  conflict: boolean;
  disabled?: boolean;
  roleOptions: Array<{ role_id: string; role_name: string }>;
  onChange: (patch: Partial<CommittedInspectorForm>) => void;
  onSave: () => void;
  onConvert: (payload: CommittedConvertPayload) => void;
  onRefreshLatest: () => void;
  onLocateInTable: () => void;
  onRequestClose: () => void;
  assignments: WorkloadAssignment[];
  availability: number | null;
  availabilityOverrides: AvailabilityOverrideInput[];
  asOf: string;
  rangeStart: string;
  rangeEnd: string;
}

export function CommittedInspector({
  row,
  form,
  baseline,
  saving,
  converting,
  error,
  conflict,
  disabled = false,
  roleOptions,
  onChange,
  onSave,
  onConvert,
  onRefreshLatest,
  onLocateInTable,
  onRequestClose,
  assignments,
  availability,
  availabilityOverrides,
  asOf,
  rangeStart,
  rangeEnd,
}: CommittedInspectorProps) {
  const { t } = useTranslation(['assignments']);
  const mode = (row.dateMode ?? 'fixed') as 'fixed' | 'phase' | 'project';
  const locked = disabled || saving || converting;
  const dirty =
    Number(form.allocation) !== baseline.allocation ||
    (mode === 'fixed' && (form.startDate !== baseline.startDate || form.endDate !== baseline.endDate));

  // S4：转换表单（角色/阶段），角色选项来自人员角色 + 当前角色兜底
  const [convertMode, setConvertMode] = useState(false);
  const [convertRoleId, setConvertRoleId] = useState(row.roleId ?? '');
  const [convertPhaseId, setConvertPhaseId] = useState(row.phaseId ?? '');
  useEffect(() => {
    setConvertMode(false);
    setConvertRoleId(row.roleId ?? '');
    setConvertPhaseId(row.phaseId ?? '');
  }, [row.id, row.roleId, row.phaseId]);

  const [convertValidationError, setConvertValidationError] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const roleSelectRef = useRef<HTMLSelectElement | null>(null);

  // G-10：打开面板/进入转换时把焦点带入面板并把面板滚入视口
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const first = grid.querySelector<HTMLElement>('select, input');
    first?.focus();
    grid.closest('.pw-inspector')?.scrollIntoView?.({ block: 'nearest' });
  }, [row.id, convertMode]);
  // N-04：转换失败后焦点回到角色选择，错误可被读屏关联
  useEffect(() => {
    if (convertMode && error) roleSelectRef.current?.focus();
  }, [error, convertMode]);
  useEffect(() => {
    setConvertValidationError(null);
  }, [convertMode, convertRoleId, convertPhaseId]);

  const phasesQuery = useQuery<PhaseOption[]>({
    queryKey: queryKeys.projects.phases(row.projectId),
    queryFn: async () => {
      const response = await api.projectPhases.list({ project_id: row.projectId, limit: 200 });
      const payload = response.data as unknown as { data?: Array<Record<string, any>> };
      return (payload.data ?? []).map((phase) => ({
        id: String(phase.phase_id ?? phase.id),
        name: String(phase.phase_name ?? phase.name ?? phase.phase_id ?? ''),
        start_date: phase.start_date ?? null,
        end_date: phase.end_date ?? null,
      }));
    },
    enabled: convertMode && Boolean(row.projectId),
    staleTime: 60_000,
  });
  const phaseOptions = phasesQuery.data ?? [];
  const roleChoices = roleOptions.some((option) => option.role_id === row.roleId)
    ? roleOptions
    : [
        ...(row.roleId
          ? [{ role_id: row.roleId, role_name: row.roleName ?? row.roleId }]
          : []),
        ...roleOptions,
      ];
  const convertChanged =
    convertRoleId !== (row.roleId ?? '') ||
    (convertPhaseId || null) !== (row.phaseId ?? null);
  const selectedConvertPhase = phaseOptions.find((phase) => phase.id === convertPhaseId);
  // G-05：转换模式下的派生窗口/影响预览用目标 phase 的窗口，而不是原窗口
  const derivedStart =
    convertMode && mode === 'phase'
      ? (selectedConvertPhase?.start_date ?? row.derivedStartDate)
      : row.derivedStartDate;
  const derivedEnd =
    convertMode && mode === 'phase'
      ? (selectedConvertPhase?.end_date ?? row.derivedEndDate)
      : row.derivedEndDate;
  const impactStart = mode === 'fixed' ? (form.startDate || null) : derivedStart;
  const impactEnd = mode === 'fixed' ? (form.endDate || null) : derivedEnd;

  /** §15：面板内 Enter=保存（输入法组合中不抢 Enter；转换模式不误触保存）。 */
  const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || isImeComposing(event) || convertMode) return;
    event.preventDefault();
    if (!locked && dirty) onSave();
  };

  const handleShellClose = () => {
    if (convertMode) {
      setConvertMode(false);
      return;
    }
    onRequestClose();
  };

  const submitConvert = () => {
    if (locked) return;
    const allocation = Number(form.allocation);
    let validationError: string | null = null;
    if (!convertChanged) {
      validationError = t('assignments:workbench.committed.convertNoChange');
    } else if (!Number.isFinite(allocation) || allocation <= 0 || allocation > 200) {
      validationError = t('assignments:workload.edit.invalidAllocation');
    } else if (mode === 'fixed' && (!form.startDate || !form.endDate)) {
      validationError = t('assignments:workload.edit.invalidDates');
    } else if (mode === 'fixed' && form.startDate > form.endDate) {
      validationError = t('assignments:workload.edit.invalidDateOrder');
    } else if (mode === 'phase' && !convertPhaseId) {
      validationError = t('assignments:workbench.committed.convertPhaseRequired');
    }
    if (validationError) {
      setConvertValidationError(validationError);
      return;
    }
    setConvertValidationError(null);
    // G-03：提交值与预览一致；空值不再回落 undefined 让服务端继承
    onConvert({
      role_id: convertRoleId,
      phase_id: convertPhaseId || null,
      allocation_percentage: allocation,
      ...(mode === 'fixed'
        ? { start_date: form.startDate, end_date: form.endDate }
        : {}),
    });
  };

  return (
    <InspectorShell
      title={row.projectName}
      testId="pw-committed-inspector"
      ariaLabel={t('assignments:workbench.committed.title', { name: row.projectName })}
      onClose={handleShellClose}
      closeDisabled={saving || converting}
      badge={
        <span className="pw-inspector-kind">
          {row.source === 'direct'
            ? t('assignments:workload.source.direct')
            : t('assignments:workload.source.scenario')}
          {row.version !== null ? ` · v${row.version}` : ''}
        </span>
      }
      impact={
        <InspectorImpact
          projection={{
            mode: 'committed',
            row: {
              id: row.id,
              allocationPercentage: Number(form.allocation) || 0,
              startDate: impactStart,
              endDate: impactEnd,
              status: null,
              originalStartDate:
                mode === 'fixed' ? (baseline.startDate || null) : row.derivedStartDate,
              originalEndDate:
                mode === 'fixed' ? (baseline.endDate || null) : row.derivedEndDate,
            },
          }}
          assignments={assignments}
          availability={availability}
          availabilityOverrides={availabilityOverrides}
          asOf={asOf}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          testId="pw-committed-impact"
        />
      }
      actions={
        <div className="pw-inspector-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onLocateInTable}>
            <LocateFixed size={14} /> {t('assignments:workbench.committed.locateInTable')}
          </button>
          {convertMode ? (
            <>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={locked}
                onClick={() => setConvertMode(false)}
              >
                <X size={14} /> {t('assignments:workbench.committed.convertCancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={locked}
                onClick={submitConvert}
                data-testid="pw-committed-convert-submit"
              >
                <Save size={14} />{' '}
                {converting
                  ? t('assignments:workbench.committed.convertConverting')
                  : t('assignments:workbench.committed.convertSubmit')}
              </button>
            </>
          ) : (
            <>
              {row.source !== 'direct' ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={locked}
                  onClick={() => setConvertMode(true)}
                  data-testid="pw-committed-convert-entry"
                >
                  {t('assignments:workbench.committed.convertEntry')}
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={saving}
                onClick={onRequestClose}
              >
                <X size={14} /> {t('assignments:workbench.inspector.done')}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={locked || !dirty}
                onClick={onSave}
                data-testid="pw-committed-save"
              >
                <Save size={14} />{' '}
                {saving
                  ? t('assignments:workbench.committed.saving')
                  : t('assignments:workbench.committed.save')}
              </button>
            </>
          )}
        </div>
      }
    >
      <div className="pw-inspector-grid" onKeyDown={onGridKeyDown} ref={gridRef}>
        {convertMode ? (
          <>
            <label>
              <span>{t('assignments:workload.picker.role')}</span>
              <select
                ref={roleSelectRef}
                value={convertRoleId}
                disabled={locked}
                aria-label={t('assignments:workbench.committed.convertEntry')}
                aria-invalid={Boolean(convertValidationError || error)}
                onChange={(event) => setConvertRoleId(event.target.value)}
                data-testid="pw-committed-convert-role"
              >
                {roleChoices.map((option) => (
                  <option key={option.role_id} value={option.role_id}>
                    {option.role_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{t('assignments:workload.columns.phase')}</span>
              <select
                value={convertPhaseId}
                disabled={locked || phasesQuery.isLoading || phasesQuery.isError}
                aria-label={t('assignments:workload.columns.phase')}
                aria-invalid={Boolean(convertValidationError || error)}
                onChange={(event) => setConvertPhaseId(event.target.value)}
                data-testid="pw-committed-convert-phase"
              >
                {phasesQuery.isLoading ? (
                  <option value="">{t('assignments:workbench.staffing.loading')}</option>
                ) : null}
                {phasesQuery.isError ? (
                  <option value="">{t('assignments:workbench.staffing.error')}</option>
                ) : null}
                {mode !== 'phase' ? (
                  <option value="">{t('assignments:workbench.committed.convertPhaseNone')}</option>
                ) : null}
                {phaseOptions.map((phase) => (
                  <option key={phase.id} value={phase.id}>
                    {phase.name}
                  </option>
                ))}
                {row.phaseId && !phaseOptions.some((phase) => phase.id === row.phaseId) ? (
                  <option value={row.phaseId}>{row.phaseName ?? row.phaseId}</option>
                ) : null}
              </select>
            </label>
          </>
        ) : (
          <>
            <div className="pw-inspector-readonly">
              <span>{t('assignments:workload.picker.role')}</span>
              <strong>{row.roleName ?? t('common:na')}</strong>
            </div>
            <div className="pw-inspector-readonly">
              <span>{t('assignments:workload.columns.phase')}</span>
              <strong>{row.phaseName ?? t('common:na')}</strong>
            </div>
          </>
        )}
        <div className="pw-inspector-readonly">
          <span>{t('assignments:workload.picker.dateMode')}</span>
          <strong>{t(`assignments:workload.dateMode.${mode}`)}</strong>
        </div>

        <label>
          <span>{t('assignments:workload.edit.allocation')}</span>
          <input
            type="number"
            min={1}
            max={200}
            value={form.allocation}
            disabled={locked}
            aria-invalid={Boolean(convertValidationError || error)}
            aria-label={t('assignments:workload.edit.allocation')}
            onChange={(event) => onChange({ allocation: event.target.value })}
          />
        </label>

        {mode === 'fixed' ? (
          <>
            <label>
              <span>{t('assignments:workload.edit.startDate')}</span>
              <input
                type="date"
                value={form.startDate}
                disabled={locked}
                aria-invalid={Boolean(convertValidationError || error)}
                aria-label={t('assignments:workload.edit.startDate')}
                onChange={(event) => onChange({ startDate: event.target.value })}
              />
            </label>
            <label>
              <span>{t('assignments:workload.edit.endDate')}</span>
              <input
                type="date"
                value={form.endDate}
                disabled={locked}
                aria-invalid={Boolean(convertValidationError || error)}
                aria-label={t('assignments:workload.edit.endDate')}
                onChange={(event) => onChange({ endDate: event.target.value })}
              />
            </label>
          </>
        ) : (
          <div className="pw-inspector-derived-box">
            <span>
              {t(
                mode === 'phase'
                  ? 'assignments:workload.picker.selectPhase'
                  : 'assignments:workbench.inspector.projectWindow'
              )}
            </span>
            <strong>
              {derivedStart ?? '—'} → {derivedEnd ?? '—'}
            </strong>
            <em>
              {convertMode
                ? t('assignments:workbench.committed.convertWindowHint')
                : t('assignments:workload.edit.derivedDatesReadonly')}
            </em>
          </div>
        )}
      </div>

      {convertMode && phasesQuery.isError ? (
        <div className="pw-inspector-submit-error" role="alert">
          <AlertTriangle size={13} aria-hidden="true" /> {t('assignments:workbench.staffing.error')}{' '}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void phasesQuery.refetch()}
          >
            {t('assignments:workload.states.retry')}
          </button>
        </div>
      ) : null}
      {convertValidationError ? (
        <p className="pw-inspector-submit-error" role="alert" data-testid="pw-committed-convert-error">
          {convertValidationError}
        </p>
      ) : null}

      {error ? (
        <div className="pw-inspector-submit-error" role="alert" data-testid="pw-committed-error">
          <AlertTriangle size={13} aria-hidden="true" /> {error}
          {conflict ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={saving}
              onClick={onRefreshLatest}
              data-testid="pw-committed-refresh"
            >
              {t('assignments:workbench.committed.refreshLatest')}
            </button>
          ) : null}
        </div>
      ) : null}
    </InspectorShell>
  );
}
