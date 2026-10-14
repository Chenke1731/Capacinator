import type { TimelineItem, TimelineViewport, DependencyLine } from '../InteractiveTimeline';

export interface ItemPosition {
  left: number;
  width: number;
  startDays: number;
  endDays: number;
}

export interface DependencyPoints {
  startPoint: { x: number; y: number };
  endPoint: { x: number; y: number };
  dependency: DependencyLine;
}

export const calculateItemPosition = (item: TimelineItem, viewport: TimelineViewport): ItemPosition => {
  const startDays = (item.startDate.getTime() - viewport.startDate.getTime()) / (1000 * 60 * 60 * 24);
  const endDays = (item.endDate.getTime() - viewport.startDate.getTime()) / (1000 * 60 * 60 * 24);

  return {
    left: startDays * viewport.pixelsPerDay,
    width: Math.max((endDays - startDays) * viewport.pixelsPerDay, 20), // Minimum width
    startDays,
    endDays
  };
};

export const calculateDependencyPoints = (
  predecessor: TimelineItem,
  successor: TimelineItem,
  dependency: DependencyLine,
  viewport: TimelineViewport,
  itemHeight: number
): DependencyPoints => {
  const predPosition = calculateItemPosition(predecessor, viewport);
  const succPosition = calculateItemPosition(successor, viewport);

  const predCenter = predPosition.left + predPosition.width / 2;
  const succCenter = succPosition.left + succPosition.width / 2;

  let startPoint: { x: number; y: number };
  let endPoint: { x: number; y: number };

  const verticalOffset = 8;
  const predTop = verticalOffset;
  const succTop = verticalOffset;

  switch (dependency.dependencyType) {
    case 'FS': // Finish-to-Start
      startPoint = { x: predPosition.left + predPosition.width, y: predTop + (itemHeight - 16) / 2 };
      endPoint = { x: succPosition.left, y: succTop + (itemHeight - 16) / 2 };
      break;
    case 'SS': // Start-to-Start
      startPoint = { x: predPosition.left, y: predTop + (itemHeight - 16) / 2 };
      endPoint = { x: succPosition.left, y: succTop + (itemHeight - 16) / 2 };
      break;
    case 'FF': // Finish-to-Finish
      startPoint = { x: predPosition.left + predPosition.width, y: predTop + (itemHeight - 16) / 2 };
      endPoint = { x: succPosition.left + succPosition.width, y: succTop + (itemHeight - 16) / 2 };
      break;
    case 'SF': // Start-to-Finish
      startPoint = { x: predPosition.left, y: predTop + (itemHeight - 16) / 2 };
      endPoint = { x: succPosition.left + succPosition.width, y: succTop + (itemHeight - 16) / 2 };
      break;
    default:
      startPoint = { x: predCenter, y: predTop + (itemHeight - 16) / 2 };
      endPoint = { x: succCenter, y: succTop + (itemHeight - 16) / 2 };
  }

  return { startPoint, endPoint, dependency };
};

export const getLineColor = (type: string): string => {
  switch (type) {
    case 'FS': return 'var(--dependency-finish-start)';
    case 'SS': return 'var(--dependency-start-start)';
    case 'FF': return 'var(--dependency-finish-finish)';
    case 'SF': return 'var(--dependency-start-finish)';
    default: return 'var(--dependency-unknown)';
  }
};
