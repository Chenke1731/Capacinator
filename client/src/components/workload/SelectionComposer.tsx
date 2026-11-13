/**
 * SelectionComposer（工作台 v2 §6.5）——多选统一参数：
 * 角色 / 比例 / 日期模式 / 起止日期；允许加入泳道后在 ghost inspector 里
 * 逐条覆盖。phase/project 不强行统一日期——fixed 统一设置起止，派生模式按
 * 任务自身窗口只读展示。
 */
import { useTranslation } from 'react-i18next';
import type { SelectionTask } from '../../lib/assignmentDrafts';

export interface ComposerValue {
  roleId: string | null;
  allocation: string;
  dateMode: 'fixed' | 'phase' | 'project' | '';
  startDate: string;
  endDate: string;
}

export interface SelectionComposerProps {
  value: ComposerValue;
  onChange: (value: ComposerValue) => void;
  /** 角色候选：全部已选任务的角色需求并集 + 人员主角色 */
  roleOptions: Array<{ role_id: string; role_name: string; required_headcount: number | null }>;
  selectedTasks: SelectionTask[];
  disabled?: boolean;
}

export function SelectionComposer({ value, onChange, roleOptions, selectedTasks, disabled = false }: SelectionComposerProps) {
  const { t } = useTranslation(['assignments']);
  const hasSelection = selectedTasks.length > 0;
  // 统一日期模式只在所有已选任务可用时给出：任一任务 phase/project 不可用即提示
  const mixedModes = hasSelection && selectedTasks.some((task) => !task.has_phase_timeline);

  return (
    <div className="pw-composer" data-testid="pw-selection-composer">
      <label className="pw-composer-field">
        <span>{t('assignments:workbench.composer.role')}</span>
        <select
          value={value.roleId ?? ''}
          disabled={disabled || !hasSelection}
          aria-label={t('assignments:workbench.composer.role')}
          onChange={(event) => onChange({ ...value, roleId: event.target.value || null })}
        >
          <option value="">{t('assignments:workbench.composer.rolePerTask')}</option>
          {roleOptions.map((option) => (
            <option key={option.role_id} value={option.role_id}>
              {option.role_name}
              {option.required_headcount !== null ? ` ×${option.required_headcount}` : ''}
            </option>
          ))}
        </select>
      </label>
      <label className="pw-composer-field pw-composer-field--num">
        <span>{t('assignments:workbench.composer.allocation')}</span>
        <input
          type="number"
          min={1}
          max={200}
          value={value.allocation}
          disabled={disabled || !hasSelection}
          aria-label={t('assignments:workbench.composer.allocation')}
          onChange={(event) => onChange({ ...value, allocation: event.target.value })}
        />
      </label>
      <label className="pw-composer-field">
        <span>{t('assignments:workbench.composer.dateMode')}</span>
        <select
          value={value.dateMode}
          disabled={disabled || !hasSelection}
          aria-label={t('assignments:workbench.composer.dateMode')}
          onChange={(event) =>
            onChange({ ...value, dateMode: event.target.value as ComposerValue['dateMode'] })
          }
        >
          <option value="">{t('assignments:workbench.composer.modePerTask')}</option>
          <option value="phase">{t('assignments:workload.dateMode.phase')}</option>
          <option value="project">{t('assignments:workload.dateMode.project')}</option>
          <option value="fixed">{t('assignments:workload.dateMode.fixed')}</option>
        </select>
      </label>
      {value.dateMode === 'fixed' ? (
        <>
          <label className="pw-composer-field">
            <span>{t('assignments:workload.edit.startDate')}</span>
            <input
              type="date"
              value={value.startDate}
              disabled={disabled || !hasSelection}
              aria-label={t('assignments:workload.edit.startDate')}
              onChange={(event) => onChange({ ...value, startDate: event.target.value })}
            />
          </label>
          <label className="pw-composer-field">
            <span>{t('assignments:workload.edit.endDate')}</span>
            <input
              type="date"
              value={value.endDate}
              disabled={disabled || !hasSelection}
              aria-label={t('assignments:workload.edit.endDate')}
              onChange={(event) => onChange({ ...value, endDate: event.target.value })}
            />
          </label>
        </>
      ) : null}
      {mixedModes && value.dateMode === 'phase' ? (
        <span className="pw-composer-hint">{t('assignments:workbench.composer.phaseFallbackHint')}</span>
      ) : null}
    </div>
  );
}
