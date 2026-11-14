/**
 * S1 守卫：已提交 fixed bar 的拖拽/缩放（阈值、边界、click 抑制）。
 * 评审 B2 的高风险回归点：
 * - 3px 阈值内的 pointermove 不得进入拖动（桌面上"点一下"仍是点击）；
 * - 已开始行向左移动必须停在下限（不把历史窗口往前扩）；
 * - 右端缩放不得连带修改开始日；
 * - 已结束 / paused / 派生行不出现缩放手柄且不可拖；
 * - 拖动成立后吞掉随后 click（否则面板会被再次打开并覆盖预填）。
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  WorkloadGantt,
  type GanttAssignmentMeta,
} from '../WorkloadGantt';
import type { WorkloadTimelineResult } from '../../../lib/workloadTimeline';

const RANGE_START = '2026-01-01';
const RANGE_END = '2026-12-31';
const AS_OF = '2026-06-01';
const TRACK_WIDTH = 365; // 1px = 1 day，便于断言

function timeline(): WorkloadTimelineResult {
  return {
    rangeStart: RANGE_START,
    rangeEnd: RANGE_END,
    asOf: AS_OF,
    segments: [],
    buckets: [],
    currentLoad: 20,
    projectedLoad: 20,
    currentAvailability: 100,
    currentRelativeUtilization: 20,
    projectedRelativeUtilization: 20,
    overloadSegments: [],
    contributions: [],
  };
}

function committedRow(overrides: Partial<GanttAssignmentMeta> = {}): GanttAssignmentMeta {
  return {
    id: 'a1',
    project_id: 'p1',
    project_name: 'Alpha',
    role_name: 'SE',
    allocation_percentage: 20,
    start_date: '2026-01-01',
    end_date: '2026-09-30',
    assignment_date_mode: 'fixed',
    status: 'active',
    ...overrides,
  };
}

function pointer(type: 'pointerdown' | 'pointermove' | 'pointerup', clientX: number, target: EventTarget) {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX }));
}

function renderGantt(props: {
  rows?: GanttAssignmentMeta[];
  dragEnabled?: boolean;
  onPreview?: jest.Mock;
  onDragEnd?: jest.Mock;
  onBarClick?: jest.Mock;
}) {
  const onPreview = props.onPreview ?? jest.fn();
  const onDragEnd = props.onDragEnd ?? jest.fn();
  const onBarClick = props.onBarClick ?? jest.fn();
  render(
    <WorkloadGantt
      timeline={timeline()}
      committedRows={props.rows ?? [committedRow()]}
      drafts={[]}
      collapsed={false}
      onToggleCollapse={jest.fn()}
      onGhostClick={jest.fn()}
      onBarClick={onBarClick}
      committedDragEnabled={props.dragEnabled ?? true}
      onCommittedDragPreview={onPreview}
      onCommittedDragEnd={onDragEnd}
    />
  );
  return { onPreview, onDragEnd, onBarClick };
}

beforeAll(() => {
  jest
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue({ width: TRACK_WIDTH, height: 40, top: 0, left: 0, right: TRACK_WIDTH, bottom: 40, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe('WorkloadGantt 已提交 bar 拖拽（S1）', () => {
  test('阈值内（<3px）不进入拖动，click 仍按 S2 打开面板', () => {
    const { onPreview, onDragEnd, onBarClick } = renderGantt({});
    const bar = screen.getByTestId('pw-gantt-bar');

    pointer('pointerdown', 100, bar);
    pointer('pointermove', 102, document);
    expect(onPreview).not.toHaveBeenCalled();

    pointer('pointerup', 102, document);
    expect(onDragEnd).not.toHaveBeenCalled();

    fireEvent.click(bar);
    expect(onBarClick).toHaveBeenCalledWith('a1');
  });

  test('越过阈值后整段移动：预览/落点一致，且吞掉随后 click', async () => {
    const { onPreview, onDragEnd, onBarClick } = renderGantt({});
    const bar = screen.getByTestId('pw-gantt-bar');

    pointer('pointerdown', 100, bar);
    pointer('pointermove', 115, document);
    expect(onPreview).toHaveBeenCalledWith({
      assignmentId: 'a1',
      startDate: '2026-01-16',
      endDate: '2026-10-15',
    });
    // 拖动中即时反馈：精确日期提示 + 原窗口虚框（不必等松手/面板）
    expect(await screen.findByTestId('pw-gantt-drag-tip')).toHaveTextContent(
      '2026-01-16 → 2026-10-15'
    );
    await waitFor(() => {
      expect(document.querySelectorAll('.pw-gantt-orig-window')).toHaveLength(1);
      expect(document.querySelector('.pw-gantt-bar--dragging')).toBeTruthy();
    });

    pointer('pointerup', 115, document);
    expect(onDragEnd).toHaveBeenCalledWith({
      assignmentId: 'a1',
      startDate: '2026-01-16',
      endDate: '2026-10-15',
    });

    // 松手后的合成 click 不得重开面板/覆盖预填
    fireEvent.click(bar);
    expect(onBarClick).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByTestId('pw-gantt-drag-tip')).not.toBeInTheDocument();
      expect(document.querySelector('.pw-gantt-orig-window')).toBeNull();
    });
  });

  test('拖动中 Esc 取消：回原位、不打开面板', async () => {
    const { onDragEnd, onBarClick } = renderGantt({});
    const bar = screen.getByTestId('pw-gantt-bar');
    pointer('pointerdown', 100, bar);
    pointer('pointermove', 120, document);
    expect(await screen.findByTestId('pw-gantt-drag-tip')).toBeInTheDocument();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await waitFor(() => {
      expect(screen.queryByTestId('pw-gantt-drag-tip')).not.toBeInTheDocument();
    });
    pointer('pointerup', 120, document);
    expect(onDragEnd).not.toHaveBeenCalled();
    fireEvent.click(bar);
    expect(onBarClick).toHaveBeenCalledWith('a1');
  });

  test('同一像素位移不重复触发预览（节流/去抖）', () => {
    const { onPreview } = renderGantt({});
    const bar = screen.getByTestId('pw-gantt-bar');
    pointer('pointerdown', 100, bar);
    pointer('pointermove', 115, document);
    pointer('pointermove', 115, document);
    expect(onPreview).toHaveBeenCalledTimes(1);
  });

  test('已开始行向左移动停在下限：窗口不前移、不截断历史', () => {
    const { onPreview } = renderGantt({});
    const bar = screen.getByTestId('pw-gantt-bar');

    pointer('pointerdown', 100, bar);
    pointer('pointermove', 50, document);
    expect(onPreview).toHaveBeenCalledWith({
      assignmentId: 'a1',
      startDate: '2026-01-01',
      endDate: '2026-09-30',
    });
  });

  test('右端缩放只改结束日，开始日保持不变', () => {
    const { onPreview } = renderGantt({});
    const bar = screen.getByTestId('pw-gantt-bar');
    const handle = bar.querySelector('.pw-gantt-resize--end')!;
    expect(handle).toBeTruthy();

    pointer('pointerdown', 100, handle);
    pointer('pointermove', 110, document);
    expect(onPreview).toHaveBeenCalledWith({
      assignmentId: 'a1',
      startDate: '2026-01-01',
      endDate: '2026-10-10',
    });
  });

  test('已结束行不可拖：无手柄、无回调，click 正常打开面板', () => {
    const { onPreview, onDragEnd, onBarClick } = renderGantt({
      rows: [committedRow({ start_date: '2025-10-01', end_date: '2025-12-31' })],
    });
    const bar = screen.getByTestId('pw-gantt-bar');
    expect(bar.querySelector('.pw-gantt-resize')).toBeNull();

    pointer('pointerdown', 100, bar);
    pointer('pointermove', 130, document);
    pointer('pointerup', 130, document);
    expect(onPreview).not.toHaveBeenCalled();
    expect(onDragEnd).not.toHaveBeenCalled();

    fireEvent.click(bar);
    expect(onBarClick).toHaveBeenCalledWith('a1');
  });

  test('拖拽总开关关闭（提交中/失配）时不进入拖动', () => {
    const { onPreview, onBarClick } = renderGantt({ dragEnabled: false });
    const bar = screen.getByTestId('pw-gantt-bar');
    expect(bar.querySelector('.pw-gantt-resize')).toBeNull();

    pointer('pointerdown', 100, bar);
    pointer('pointermove', 130, document);
    expect(onPreview).not.toHaveBeenCalled();

    fireEvent.click(bar);
    expect(onBarClick).toHaveBeenCalledWith('a1');
  });

  test('paused 行不可拖（即便 fixed 且未结束）', () => {
    const { onPreview } = renderGantt({
      rows: [committedRow({ status: 'paused' })],
    });
    const bar = screen.getByTestId('pw-gantt-bar');
    expect(bar.querySelector('.pw-gantt-resize')).toBeNull();

    pointer('pointerdown', 100, bar);
    pointer('pointermove', 130, document);
    expect(onPreview).not.toHaveBeenCalled();
  });
});

describe('S1 手柄命中策略（Claude R4）', () => {
  test('过窄 bar 降级为仅移动：无手柄，拖动仍可用（缩放走面板日期输入）', () => {
    const { onPreview } = renderGantt({
      rows: [committedRow({ start_date: '2026-06-10', end_date: '2026-06-12' })],
    });
    const bar = screen.getByTestId('pw-gantt-bar');
    expect(bar.querySelector('.pw-gantt-resize')).toBeNull();

    pointer('pointerdown', 100, bar);
    pointer('pointermove', 110, document);
    expect(onPreview).toHaveBeenCalledWith({
      assignmentId: 'a1',
      startDate: '2026-06-20',
      endDate: '2026-06-22',
    });
  });
});
