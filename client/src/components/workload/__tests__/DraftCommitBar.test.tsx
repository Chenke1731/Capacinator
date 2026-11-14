/**
 * F5 结构性守卫（三步法第 3 步：全量断言，单点不得充当覆盖证明）：
 * 每个"提交栏锁定态"都必须存在至少一个用户可用的出口。
 *
 * 类枚举（全部会禁用 Confirm 的状态）：
 * - UNKNOWN      → 出口：[重新核对]（回读重试）
 * - CONFLICT     → 出口：[清空]（或去 inspector 修）
 * - INVALID      → 出口：[清空]（或去 inspector 补参数）
 * - 场景失配      → 出口：[清空] / 横幅回原场景（继续选择被禁）
 * - SUBMITTING   → 设计上无出口（请求在途，完成即解锁）——断言"提交中"文案在位
 * 不变式：confirm 禁用且非提交中时，栏内必须至少有一个可用按钮。
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DraftCommitBar, type DraftCommitBarProps } from '../DraftCommitBar';
import type { AssignmentDraft } from '../../../lib/assignmentDrafts';

function baseProps(overrides: Partial<DraftCommitBarProps>): DraftCommitBarProps {
  return {
    total: 1,
    submittable: 0,
    invalid: 0,
    conflict: 0,
    unknown: 0,
    submitting: false,
    confirmDisabled: false,
    overload: false,
    onContinueSelect: jest.fn(),
    onConfirm: jest.fn(),
    onClear: jest.fn(),
    ...overrides,
  };
}

const enabledButtons = () =>
  screen
    .getAllByRole('button')
    .filter((button) => !(button as HTMLButtonElement).disabled);

function assertHasExit() {
  // 结构性断言：锁定态（Confirm 禁用）必须至少有一个可用按钮
  expect((screen.getByTestId('pw-confirm-assign') as HTMLButtonElement).disabled).toBe(true);
  expect(enabledButtons().length).toBeGreaterThan(0);
}

describe('DraftCommitBar 锁定态出口矩阵（F5 结构不变量）', () => {
  test('IDLE：Confirm 可用（非锁定态）', () => {
    render(<DraftCommitBar {...baseProps({ submittable: 1 })} />);
    expect(screen.getByTestId('pw-confirm-assign')).toBeEnabled();
  });

  test('FAILED：Confirm 可用 + [重试失败] 出口', () => {
    render(
      <DraftCommitBar
        {...baseProps({
          submittable: 1,
          lastSummary: { succeeded: 0, failed: 1, unknown: 0 },
          onRetryFailed: jest.fn(),
        })}
      />
    );
    expect(screen.getByTestId('pw-confirm-assign')).toBeEnabled();
    expect(screen.getByTestId('pw-retry-failed')).toBeEnabled();
  });

  test('UNKNOWN：Confirm 禁用，[重新核对] 是出口', () => {
    render(
      <DraftCommitBar
        {...baseProps({ unknown: 1, onReconcile: jest.fn() })}
      />
    );
    assertHasExit();
    expect(screen.getByTestId('pw-reconcile')).toBeEnabled();
  });

  test('CONFLICT：Confirm 禁用，[清空] 是出口', () => {
    render(<DraftCommitBar {...baseProps({ conflict: 1 })} />);
    assertHasExit();
  });

  test('INVALID：Confirm 禁用，[清空] 是出口', () => {
    render(<DraftCommitBar {...baseProps({ invalid: 1 })} />);
    assertHasExit();
  });

  test('场景失配（confirmDisabled + continueDisabled）：Confirm/继续选择禁用，[清空] 是出口', () => {
    render(
      <DraftCommitBar
        {...baseProps({ submittable: 1, confirmDisabled: true, continueDisabled: true })}
      />
    );
    expect(screen.getByTestId('pw-confirm-assign')).toBeDisabled();
    // 继续选择也被禁（D-02a），但清空仍可用
    expect(enabledButtons().length).toBeGreaterThan(0);
  });

  test('SUBMITTING：请求在途无用户出口（设计例外），文案在位且全部禁用', () => {
    render(<DraftCommitBar {...baseProps({ submittable: 1, submitting: true })} />);
    expect(screen.getByTestId('pw-confirm-assign')).toBeDisabled();
    expect(screen.getByTestId('pw-confirm-assign').textContent).toMatch(/submitting|提交中/i);
    expect(enabledButtons()).toHaveLength(0);
  });

  test('UNDO 条含失败错误：撤销按钮保留可用（可重试），错误可见', () => {
    render(
      <DraftCommitBar
        {...baseProps({ total: 0, lastCreatedCount: 1, onUndoCreate: jest.fn(), undoError: 'key occupied' })}
      />
    );
    expect(screen.getByTestId('pw-undo-create')).toBeEnabled();
    expect(screen.getByTestId('pw-undo-error')).toBeInTheDocument();
  });

  test('UNDO 条不可恢复时禁用撤销并给出原因', () => {
    render(
      <DraftCommitBar
        {...baseProps({
          total: 0,
          lastCreatedCount: 1,
          onUndoCreate: jest.fn(),
          undoDisabled: true,
          undoDisabledReason: 'incomplete incumbent snapshot',
        })}
      />
    );
    expect(screen.getByTestId('pw-undo-create')).toBeDisabled();
  });
});
