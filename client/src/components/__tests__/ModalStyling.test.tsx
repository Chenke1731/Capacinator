import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import { PhaseAddModal } from '../phase-manager/PhaseAddModal';
import { PhaseEditModal } from '../phase-manager/PhaseEditModal';
import { DependencyModal } from '../phase-manager/DependencyModal';

import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n';

// D-04 Stage 2（2026-11-11）：玩具级类名渲染测试升级为 Radix 结构断言——
// 旧 .modal-* 家族已全站退役，迁移后的 phase modal 必须挂真实 dialog 语义
// （aria-modal/关闭钮/Esc 通道由 ui/dialog 原语承接）。
const wrap = (node: React.ReactNode) => (
  <I18nextProvider i18n={i18n}>{node}</I18nextProvider>
);

const addForm = { phase_id: '', phase_order: 1, start_date: '2026-01-01', end_date: '2026-01-05' };
const editForm = { phase_name: '设计', phase_order: 1, start_date: '2026-01-01', end_date: '2026-01-05' };
const depForm = {
  predecessor_phase_timeline_id: '',
  successor_phase_timeline_id: '',
  dependency_type: 'FS' as const,
  lag_days: 0,
};

describe('Radix modal structure (D-04 Stage 2)', () => {
  it('PhaseAddModal renders a real dialog with modal semantics and close button', () => {
    render(wrap(
      <PhaseAddModal
        isOpen
        formData={addForm}
        phaseTemplates={[]}
        onFormChange={() => {}}
        onSubmit={() => {}}
        onClose={() => {}}
      />
    ));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.querySelector('.dialog-close-btn')).not.toBeNull();
    // 表单字段沿用全局 owner 类（消费方合法），不再依赖手写 modal 样式
    expect(dialog.querySelectorAll('.form-group').length).toBeGreaterThan(0);
    expect(document.querySelector('.modal-overlay')).toBeNull();
  });

  it('PhaseEditModal keeps dialog semantics for the edit form', () => {
    render(wrap(
      <PhaseEditModal
        isOpen
        editingPhase={{ id: 'p1', phase_name: '设计' } as never}
        formData={editForm}
        onFormChange={() => {}}
        onSubmit={() => {}}
        onClose={() => {}}
      />
    ));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.querySelector('.dialog-close-btn')).not.toBeNull();
  });

  it('DependencyModal renders selects with owner form-select class inside the dialog', () => {
    render(wrap(
      <DependencyModal
        isOpen
        editingDependency={null}
        formData={depForm}
        timelineItems={[]}
        onFormChange={() => {}}
        onSubmit={() => {}}
        onClose={() => {}}
      />
    ));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.querySelectorAll('select.form-select').length).toBeGreaterThanOrEqual(3);
  });
});
