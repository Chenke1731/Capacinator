import React, { useRef, useCallback, useEffect, useState } from 'react';
import { format, startOfWeek, startOfMonth } from 'date-fns';
import { useTimelineEvents } from '../hooks/useTimelineEvents';
import { getLocale, getDateFnsLocale } from '../i18n';
import {
  TimelineGrid,
  DependencyLines,
  TimelineItemTooltip,
  PhaseHandles,
  calculateItemPosition,
  calculateDependencyPoints
} from './interactive-timeline';
import type { PhaseHandle } from './interactive-timeline';
import './InteractiveTimeline.css';

export interface TimelineItem {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  color?: string;
  data?: unknown;
}

export interface TimelineViewport {
  startDate: Date;
  endDate: Date;
  pixelsPerDay: number;
}

export interface DependencyLine {
  id: string;
  predecessorId: string;
  successorId: string;
  dependencyType: 'FS' | 'SS' | 'FF' | 'SF';
  lagDays?: number;
}

export interface InteractiveTimelineProps {
  items: TimelineItem[];
  viewport: TimelineViewport;
  height?: number;
  width?: number;
  mode: 'brush' | 'phase-manager' | 'roadmap';
  brushRange?: { start: number; end: number };
  onBrushChange?: (start: number, end: number) => void;
  onItemAdd?: (afterItemId?: string, position?: { x: number; date: Date }) => void;
  onItemEdit?: (itemId: string) => void;
  onItemDelete?: (itemId: string) => void;
  onItemMove?: (itemId: string, newStartDate: Date, newEndDate: Date) => void;
  onItemResize?: (itemId: string, newStartDate: Date, newEndDate: Date) => void;
  dependencies?: DependencyLine[];
  onDependencyCreate?: (predecessorId: string, successorId: string, dependencyType: 'FS' | 'SS' | 'FF' | 'SF') => void;
  showGrid?: boolean;
  showToday?: boolean;
  allowOverlap?: boolean;
  minItemDuration?: number;
  chartTimeData?: Array<{ date: string; [key: string]: unknown }>;
  className?: string;
  style?: React.CSSProperties;
}

export function InteractiveTimeline({
  items,
  viewport,
  height = 60,
  width,
  mode,
  brushRange,
  onBrushChange,
  onItemAdd,
  onItemEdit,
  onItemDelete,
  onItemMove,
  onItemResize,
  dependencies = [],
  onDependencyCreate: _onDependencyCreate,
  showGrid = true,
  showToday = true,
  allowOverlap = false,
  minItemDuration = 1,
  chartTimeData,
  className = '',
  style = {}
}: InteractiveTimelineProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [timelineWidth, setTimelineWidth] = useState(400);

  // Calculate timeline width
  const calculateTimelineWidth = useCallback(() => {
    if (width !== undefined && width > 0) return width;
    if (timelineRef.current?.parentElement) {
      const containerWidth = timelineRef.current.parentElement.getBoundingClientRect().width;
      if (containerWidth > 0) return containerWidth;
    }
    const naturalWidth = (viewport.endDate.getTime() - viewport.startDate.getTime()) / (1000 * 60 * 60 * 24) * viewport.pixelsPerDay;
    return Math.max(naturalWidth, 200);
  }, [viewport, width]);

  useEffect(() => {
    const updateWidth = () => {
      const newWidth = calculateTimelineWidth();
      setTimelineWidth(prevWidth => Math.abs(newWidth - prevWidth) > 1 ? newWidth : prevWidth);
    };
    updateWidth();

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      try {
        resizeObserver = new ResizeObserver(updateWidth);
        if (timelineRef.current?.parentElement) {
          resizeObserver.observe(timelineRef.current.parentElement);
        }
      } catch {
        resizeObserver = null;
      }
    }

    window.addEventListener('resize', updateWidth);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateWidth);
    };
  }, [calculateTimelineWidth]);

  // Generate grid lines
  const generateGridLines = useCallback(() => {
    const lines: Array<{ date: Date; label: string; type: 'major' | 'minor' }> = [];

    if (chartTimeData && chartTimeData.length > 0) {
      const sampleInterval = Math.max(1, Math.floor(chartTimeData.length / 6));
      chartTimeData.forEach((dataPoint, index) => {
        if (index % sampleInterval === 0) {
          const date = new Date(dataPoint.date as string);
          const isFirstOrLast = index === 0 || index === chartTimeData.length - 1;
          const isMonthStart = date.getDate() <= 7;
          const label = isFirstOrLast || isMonthStart
            ? date.toLocaleDateString(getLocale(), { month: 'short', day: 'numeric' })
            : date.toLocaleDateString(getLocale(), { day: 'numeric' });
          lines.push({ date, label, type: (isFirstOrLast || isMonthStart) ? 'major' : 'minor' });
        }
      });
      return lines;
    }

    const current = new Date(viewport.startDate);
    const totalDays = (viewport.endDate.getTime() - viewport.startDate.getTime()) / (1000 * 60 * 60 * 24);

    if (totalDays <= 60) {
      while (current <= viewport.endDate) {
        const isWeekStart = current.getDay() === 0;
        lines.push({
          date: new Date(current),
          label: format(current, isWeekStart ? 'MMM d' : 'd', { locale: getDateFnsLocale() }),
          type: isWeekStart ? 'major' : 'minor'
        });
        current.setDate(current.getDate() + 1);
      }
    } else if (totalDays <= 365) {
      while (current <= viewport.endDate) {
        const weekStart = startOfWeek(current);
        const isMonthStart = weekStart.getDate() <= 7;
        lines.push({
          date: new Date(weekStart),
          label: format(weekStart, isMonthStart ? 'MMM' : 'd', { locale: getDateFnsLocale() }),
          type: isMonthStart ? 'major' : 'minor'
        });
        current.setDate(current.getDate() + 7);
      }
    } else {
      while (current <= viewport.endDate) {
        const monthStart = startOfMonth(current);
        const isYearStart = monthStart.getMonth() === 0;
        lines.push({
          date: new Date(monthStart),
          label: format(monthStart, isYearStart ? 'yyyy' : 'MMM', { locale: getDateFnsLocale() }),
          type: isYearStart ? 'major' : 'minor'
        });
        current.setMonth(current.getMonth() + 1);
      }
    }
    return lines;
  }, [viewport, chartTimeData]);

  const gridLines = showGrid ? generateGridLines() : [];

  // Generate phase handles
  const generatePhaseHandles = useCallback((): PhaseHandle[] => {
    if (mode !== 'phase-manager' && mode !== 'roadmap') return [];
    if (!items.length) return [];

    const handles: PhaseHandle[] = [];
    const sortedItems = [...items].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

    for (let i = 0; i < sortedItems.length; i++) {
      const currentItem = sortedItems[i];
      const prevItem = i > 0 ? sortedItems[i - 1] : null;
      const nextItem = i < sortedItems.length - 1 ? sortedItems[i + 1] : null;
      const currentPosition = calculateItemPosition(currentItem, viewport);

      if (prevItem) {
        const daysDiff = (currentItem.startDate.getTime() - prevItem.endDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysDiff > 0.001) {
          const gapStartX = calculateItemPosition(prevItem, viewport).left + calculateItemPosition(prevItem, viewport).width;
          const handleX = gapStartX + (currentPosition.left - gapStartX) / 2;
          if (handleX >= 340 && handleX <= timelineWidth) {
            handles.push({
              id: `extend-left-${currentItem.id}`,
              phaseId: currentItem.id,
              handleType: 'extend-left',
              position: currentItem.startDate.getTime(),
              x: handleX,
              adjacentPhaseId: prevItem.id
            });
          }
        }
      }

      if (nextItem) {
        const daysDiff = (nextItem.startDate.getTime() - currentItem.endDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysDiff > 0.001) {
          const currentEndX = currentPosition.left + currentPosition.width;
          const nextStartX = calculateItemPosition(nextItem, viewport).left;
          const handleX = currentEndX + (nextStartX - currentEndX) / 2;
          if (handleX >= 340 && handleX <= timelineWidth) {
            handles.push({
              id: `extend-right-${currentItem.id}`,
              phaseId: currentItem.id,
              handleType: 'extend-right',
              position: currentItem.endDate.getTime(),
              x: handleX,
              adjacentPhaseId: nextItem.id
            });
          }
        } else if (Math.abs(daysDiff) <= 7) {
          const boundaryX = currentPosition.left + currentPosition.width;
          if (boundaryX >= 340 && boundaryX <= timelineWidth) {
            handles.push({
              id: `adjust-both-${currentItem.id}-${nextItem.id}`,
              phaseId: currentItem.id,
              handleType: 'adjust-both',
              position: currentItem.endDate.getTime(),
              x: boundaryX,
              adjacentPhaseId: nextItem.id
            });
          }
        }
      }
    }
    return handles;
  }, [items, viewport, mode, timelineWidth]);

  const phaseHandles = generatePhaseHandles();

  // Use event handlers hook
  const {
    dragState,
    hoverItemId,
    tooltip,
    hoveredHandle,
    setHoverItemId,
    setTooltip,
    handleMouseDown,
    handleDoubleClick,
    handleRightClick,
    handlePhaseAction,
    handlePhaseHandleMouseDown
  } = useTimelineEvents({
    timelineRef,
    items,
    viewport,
    mode,
    phaseHandles,
    minItemDuration,
    allowOverlap,
    onBrushChange,
    onItemAdd,
    onItemEdit,
    onItemDelete,
    onItemMove,
    onItemResize
  });

  // Calculate dependency lines
  const dependencyLines = React.useMemo(() => {
    if (!dependencies || dependencies.length === 0) return [];
    return dependencies
      .map(dependency => {
        const predecessor = items.find(item => item.id === dependency.predecessorId);
        const successor = items.find(item => item.id === dependency.successorId);
        if (predecessor && successor) {
          return calculateDependencyPoints(predecessor, successor, dependency, viewport, height);
        }
        return null;
      })
      .filter(Boolean) as ReturnType<typeof calculateDependencyPoints>[];
  }, [dependencies, items, viewport, height]);

  // Render item with position calculation
  const renderTimelineItem = (item: TimelineItem) => {
    const basePosition = calculateItemPosition(item, viewport);
    const isHovered = hoverItemId === item.id;
    const isBeingDragged = dragState.itemId === item.id;
    const isAdjacentPhase = dragState.adjacentPhases?.updates && (
      dragState.adjacentPhases.updates.previous?.id === item.id ||
      dragState.adjacentPhases.updates.next?.id === item.id
    );
    const shiftedPhaseInfo = dragState.adjacentPhases?.shiftedPhases?.find(sp => sp.id === item.id);
    const isShiftedPhase = !!shiftedPhaseInfo;

    let position = basePosition;

    if (isBeingDragged && dragState.currentX !== undefined && dragState.startX !== undefined) {
      if (dragState.type === 'move') {
        const deltaX = dragState.currentX - dragState.startX;
        position = { ...basePosition, left: basePosition.left + deltaX, width: basePosition.width };
      } else if ((dragState.type === 'resize-start' || dragState.type === 'resize-end') && dragState.previewStart && dragState.previewEnd) {
        position = calculateItemPosition({ ...item, startDate: dragState.previewStart, endDate: dragState.previewEnd }, viewport);
      }
    } else if (isAdjacentPhase && dragState.adjacentPhases?.updates) {
      if (dragState.adjacentPhases.updates.previous?.id === item.id) {
        position = calculateItemPosition({ ...item, endDate: dragState.adjacentPhases.updates.previous.newEndDate }, viewport);
      } else if (dragState.adjacentPhases.updates.next?.id === item.id) {
        const { newStartDate } = dragState.adjacentPhases.updates.next;
        const duration = item.endDate.getTime() - item.startDate.getTime();
        position = calculateItemPosition({ ...item, startDate: newStartDate, endDate: new Date(newStartDate.getTime() + duration) }, viewport);
      }
    } else if (isShiftedPhase && shiftedPhaseInfo) {
      position = calculateItemPosition({ ...item, startDate: shiftedPhaseInfo.newStartDate, endDate: shiftedPhaseInfo.newEndDate }, viewport);
    }

    const handleItemMouseEnter = (e: React.MouseEvent) => {
      setHoverItemId(item.id);
      if ((mode === 'phase-manager' || mode === 'roadmap') && item.data) {
        const tooltipWidth = 280;
        const tooltipHeight = 250;
        let finalX = e.clientX + 10;
        let finalY = e.clientY - 10;

        if (finalX + tooltipWidth > window.innerWidth) finalX = e.clientX - tooltipWidth - 10;
        if (finalY + tooltipHeight > window.innerHeight) finalY = e.clientY - tooltipHeight - 10;

        finalX = Math.max(5, Math.min(finalX, window.innerWidth - tooltipWidth - 5));
        finalY = Math.max(5, Math.min(finalY, window.innerHeight - tooltipHeight - 5));

        setTooltip({
          visible: true,
          x: finalX,
          y: finalY,
          content: <TimelineItemTooltip phase={item.data as Parameters<typeof TimelineItemTooltip>[0]['phase']} mode={mode} />
        });
      }
    };

    return (
      <div
        key={item.id}
        style={{
          position: 'absolute',
          left: position.left,
          width: position.width,
          top: 8,
          height: height - 16,
          backgroundColor: item.color || 'hsl(var(--primary))',
          border: (isAdjacentPhase || isShiftedPhase) ? '2px dashed rgba(0,0,0,0.3)' : '1px solid rgba(0,0,0,0.1)',
          borderRadius: '4px',
          cursor: mode === 'brush' ? 'crosshair' : 'pointer',
          opacity: isBeingDragged ? 0.9 : ((isAdjacentPhase || isShiftedPhase) ? 0.7 : 1),
          transform: isBeingDragged ? 'translateY(-2px) scale(1.02)' : (isHovered ? 'translateY(-1px)' : 'none'),
          boxShadow: isBeingDragged ? '0 8px 24px rgba(0,0,0,0.2)' : (isHovered ? '0 4px 8px rgba(0,0,0,0.15)' : '0 2px 4px rgba(0,0,0,0.1)'),
          transition: (isBeingDragged || isAdjacentPhase || isShiftedPhase) ? 'none' : 'all 0.2s ease',
          zIndex: isHovered || isBeingDragged || isAdjacentPhase || isShiftedPhase ? 5 : 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: '12px',
          fontWeight: 500,
          overflow: 'hidden',
          userSelect: 'none'
        }}
        onMouseDown={(e) => handleMouseDown(e, item.id, 'move')}
        onDoubleClick={(e) => handleDoubleClick(e, item.id)}
        onContextMenu={(e) => handleRightClick(e, item.id)}
        onMouseEnter={handleItemMouseEnter}
        onMouseLeave={() => {
          setHoverItemId(null);
          setTooltip({ visible: false, x: 0, y: 0, content: null });
        }}
      >
        <span style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{item.name}</span>

        {/* Resize handles */}
        {(mode === 'phase-manager' || mode === 'roadmap') && position.width > 40 && (
          <>
            <div
              style={{
                position: 'absolute', left: -2, top: 0, bottom: 0, width: '6px',
                cursor: 'ew-resize', backgroundColor: 'rgba(255,255,255,0.3)',
                opacity: isHovered ? 1 : 0, transition: 'opacity 0.2s ease'
              }}
              onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, item.id, 'resize-start'); }}
            />
            <div
              style={{
                position: 'absolute', right: -2, top: 0, bottom: 0, width: '6px',
                cursor: 'ew-resize', backgroundColor: 'rgba(255,255,255,0.3)',
                opacity: isHovered ? 1 : 0, transition: 'opacity 0.2s ease'
              }}
              onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, item.id, 'resize-end'); }}
            />
          </>
        )}
      </div>
    );
  };

  return (
    <div
      className={`interactive-timeline ${className}`}
      style={{
        position: 'relative',
        width: '100%',
        height: mode === 'roadmap' ? height : height + 40,
        overflow: 'visible',
        cursor: mode === 'brush' ? 'crosshair' : 'default',
        ...style
      }}
    >
      <div
        ref={timelineRef}
        className="timeline-container"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '100%',
          height: height,
          backgroundColor: 'transparent',
          border: '1px solid #e2e8f0',
          borderRadius: '6px',
          overflow: 'visible',
          paddingTop: mode === 'phase-manager' ? '30px' : '0px'
        }}
        onMouseDown={(e) => handleMouseDown(e)}
        onDoubleClick={(e) => handleDoubleClick(e)}
      >
        <TimelineGrid gridLines={gridLines} viewport={viewport} showToday={showToday} timelineWidth={timelineWidth} />
        <DependencyLines dependencyLines={dependencyLines} />
        {items.map(renderTimelineItem)}

        {(mode === 'phase-manager' || mode === 'roadmap') && (
          <PhaseHandles
            handles={phaseHandles}
            hoveredHandle={hoveredHandle}
            isDragging={!!dragState.type}
            onHandleClick={handlePhaseAction}
            onHandleMouseDown={handlePhaseHandleMouseDown}
          />
        )}

        {/* Brush overlay */}
        {mode === 'brush' && brushRange && (
          <div
            style={{
              position: 'absolute',
              left: brushRange.start * viewport.pixelsPerDay,
              width: (brushRange.end - brushRange.start) * viewport.pixelsPerDay,
              top: 0, bottom: 0,
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
              border: '2px solid #3b82f6',
              borderRadius: '4px',
              pointerEvents: 'none'
            }}
          />
        )}
      </div>

      {/* Tooltip */}
      {tooltip.visible && (
        <div style={{ position: 'fixed', left: tooltip.x, top: tooltip.y, zIndex: 9999, pointerEvents: 'none', overflow: 'visible' }}>
          {tooltip.content}
        </div>
      )}
    </div>
  );
}

export default InteractiveTimeline;
