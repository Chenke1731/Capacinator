import { useState, useCallback, useEffect, RefObject } from 'react';
import { TimelineItem, TimelineViewport } from '../components/InteractiveTimeline';

/**
 * Drag state for timeline interactions
 */
export interface TimelineDragState {
  type: 'move' | 'resize-start' | 'resize-end' | 'brush' | 'boundary' | null;
  itemId?: string;
  startX?: number;
  currentX?: number;
  originalStart?: Date;
  originalEnd?: Date;
  previewStart?: Date;
  previewEnd?: Date;
  adjacentPhases?: {
    previous?: {
      id: string;
      newEndDate: Date;
    };
    next?: {
      id: string;
      newStartDate: Date;
    };
    updates?: {
      previous?: { id: string; newEndDate: Date };
      next?: { id: string; newStartDate: Date };
    };
    shiftedPhases?: Array<{
      id: string;
      newStartDate: Date;
      newEndDate: Date;
    }>;
    previousPhase?: {
      id: string;
      originalEndDate: Date;
      gap: number;
    };
    nextPhase?: {
      id: string;
      originalStartDate: Date;
      gap: number;
    };
  };
  boundaryData?: {
    leftPhaseId: string;
    rightPhaseId: string;
    originalLeftEnd: Date;
    originalRightStart: Date;
  };
}

/**
 * Tooltip state
 */
export interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  content: React.ReactNode;
}

/**
 * Hovered handle state for phase boundaries
 */
export interface HoveredHandleState {
  phaseId: string;
  handleType: 'resize-left' | 'resize-right' | 'extend-left' | 'extend-right' | 'adjust-both';
  position: number;
}

/**
 * Phase handle information
 */
export interface PhaseHandle {
  id: string;
  phaseId: string;
  handleType: 'resize-left' | 'resize-right' | 'extend-left' | 'extend-right' | 'adjust-both';
  position: number;
  x: number;
  adjacentPhaseId?: string;
}

/**
 * Props for useTimelineEvents hook
 */
export interface UseTimelineEventsProps {
  timelineRef: RefObject<HTMLDivElement | null>;
  items: TimelineItem[];
  viewport: TimelineViewport;
  mode: 'brush' | 'phase-manager' | 'roadmap';
  phaseHandles: PhaseHandle[];
  minItemDuration?: number;
  allowOverlap?: boolean;

  // Callbacks
  onBrushChange?: (start: number, end: number) => void;
  onItemAdd?: (afterItemId?: string, position?: { x: number; date: Date }) => void;
  onItemEdit?: (itemId: string) => void;
  onItemDelete?: (itemId: string) => void;
  onItemMove?: (itemId: string, newStartDate: Date, newEndDate: Date) => void;
  onItemResize?: (itemId: string, newStartDate: Date, newEndDate: Date) => void;
}

/**
 * Return type for useTimelineEvents hook
 */
export interface UseTimelineEventsReturn {
  // State
  dragState: TimelineDragState;
  hoverItemId: string | null;
  tooltip: TooltipState;
  hoveredHandle: HoveredHandleState | null;

  // State setters (for external control if needed)
  setHoverItemId: (id: string | null) => void;
  setTooltip: (tooltip: TooltipState) => void;
  setHoveredHandle: (handle: HoveredHandleState | null) => void;

  // Event handlers
  handleMouseDown: (e: React.MouseEvent, itemId?: string, action?: 'move' | 'resize-start' | 'resize-end') => void;
  handleMouseMove: (e: React.MouseEvent) => void;
  handleMouseUp: () => void;
  handleDoubleClick: (e: React.MouseEvent, itemId?: string) => void;
  handleRightClick: (e: React.MouseEvent, itemId: string) => void;
  handlePhaseAction: (handle: PhaseHandle) => void;
  handlePhaseHandleMouseDown: (e: React.MouseEvent, handle: PhaseHandle) => void;
  handleKeyDown: (e: KeyboardEvent) => void;
}

// Utility function to calculate item position
const calculateItemPosition = (item: TimelineItem, viewport: TimelineViewport) => {
  const startDays = (item.startDate.getTime() - viewport.startDate.getTime()) / (1000 * 60 * 60 * 24);
  const endDays = (item.endDate.getTime() - viewport.startDate.getTime()) / (1000 * 60 * 60 * 24);

  return {
    left: startDays * viewport.pixelsPerDay,
    width: Math.max((endDays - startDays) * viewport.pixelsPerDay, 20),
    startDays,
    endDays
  };
};

// Utility function to convert pixel position to date
const dateFromPixelPosition = (pixelX: number, viewport: TimelineViewport): Date => {
  const days = Math.round(pixelX / viewport.pixelsPerDay);
  const result = new Date(viewport.startDate);
  result.setDate(result.getDate() + days);
  result.setHours(0, 0, 0, 0);
  return result;
};

// Timezone-safe date formatting
const formatDateSafe = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Timezone-safe date parsing
const parseDateSafe = (dateStr: string): Date => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

// Timezone-safe add days
const addDaysSafe = (dateStr: string, days: number): string => {
  const date = parseDateSafe(dateStr);
  date.setDate(date.getDate() + days);
  return formatDateSafe(date);
};

/**
 * Hook for managing timeline event handlers
 *
 * Extracts mouse, keyboard, and touch event handling logic from InteractiveTimeline.tsx
 * to reduce component size and improve reusability.
 */
export function useTimelineEvents({
  timelineRef,
  items,
  viewport,
  mode,
  phaseHandles,
  minItemDuration = 1,
  // allowOverlap reserved for future overlap prevention feature
  allowOverlap: _allowOverlap = false,
  onBrushChange,
  onItemAdd,
  onItemEdit,
  onItemDelete,
  onItemMove,
  onItemResize
}: UseTimelineEventsProps): UseTimelineEventsReturn {

  // State
  const [dragState, setDragState] = useState<TimelineDragState>({ type: null });
  const [hoverItemId, setHoverItemId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    content: null
  });
  const [hoveredHandle, setHoveredHandle] = useState<HoveredHandleState | null>(null);

  // Handle mouse down - starts drag operations
  const handleMouseDown = useCallback((
    e: React.MouseEvent,
    itemId?: string,
    action?: 'move' | 'resize-start' | 'resize-end'
  ) => {
    e.preventDefault();
    e.stopPropagation();

    if (!timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const startX = e.clientX - rect.left;

    if (mode === 'brush' && !itemId) {
      // Start brush selection
      setDragState({
        type: 'brush',
        startX
      });
    } else if (itemId && (mode === 'phase-manager' || mode === 'roadmap')) {
      // Start item manipulation
      const item = items.find(i => i.id === itemId);
      if (item) {
        // Initialize adjacent phases for gap maintenance
        const adjacentPhases: TimelineDragState['adjacentPhases'] = {};
        if (action === 'resize-start' || action === 'resize-end') {
          const sortedItems = [...items].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
          const currentIndex = sortedItems.findIndex(i => i.id === itemId);

          if (action === 'resize-start' && currentIndex > 0) {
            const prevPhase = sortedItems[currentIndex - 1];
            adjacentPhases.previousPhase = {
              id: prevPhase.id,
              originalEndDate: new Date(prevPhase.endDate),
              gap: Math.round((item.startDate.getTime() - prevPhase.endDate.getTime()) / (1000 * 60 * 60 * 24))
            };
          }

          if (action === 'resize-end' && currentIndex < sortedItems.length - 1) {
            const nextPhase = sortedItems[currentIndex + 1];
            adjacentPhases.nextPhase = {
              id: nextPhase.id,
              originalStartDate: new Date(nextPhase.startDate),
              gap: Math.round((nextPhase.startDate.getTime() - item.endDate.getTime()) / (1000 * 60 * 60 * 24))
            };
          }
        }

        setDragState({
          type: action || 'move',
          itemId,
          startX,
          originalStart: new Date(item.startDate),
          originalEnd: new Date(item.endDate),
          adjacentPhases
        });
      }
    }
  }, [mode, items, timelineRef]);

  // Handle mouse move - updates drag preview and hover state
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!timelineRef.current) return;

    // Check for handle hover when not dragging
    if (!dragState.type && (mode === 'phase-manager' || mode === 'roadmap')) {
      const rect = timelineRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Check if mouse is over a phase handle (±12px horizontal, and in handle vertical area)
      const foundHandle = phaseHandles.find(handle => {
        const horizontalMatch = Math.abs(mouseX - handle.x) <= 12;
        const verticalMatch = mouseY >= 5 && mouseY <= 25;
        return horizontalMatch && verticalMatch;
      });

      if (foundHandle) {
        setHoveredHandle({
          phaseId: foundHandle.phaseId,
          handleType: foundHandle.handleType,
          position: foundHandle.x
        });
      } else {
        setHoveredHandle(null);
      }
    }

    if (!dragState.type) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const deltaX = currentX - (dragState.startX || 0);
    const deltaDays = deltaX / viewport.pixelsPerDay;

    if (dragState.type === 'brush' && onBrushChange) {
      // Update brush selection
      const startDate = dateFromPixelPosition(Math.min(dragState.startX || 0, currentX), viewport);
      const endDate = dateFromPixelPosition(Math.max(dragState.startX || 0, currentX), viewport);

      const startIndex = Math.max(0, Math.floor((startDate.getTime() - viewport.startDate.getTime()) / (1000 * 60 * 60 * 24)));
      const endIndex = Math.min(
        Math.floor((viewport.endDate.getTime() - viewport.startDate.getTime()) / (1000 * 60 * 60 * 24)),
        Math.floor((endDate.getTime() - viewport.startDate.getTime()) / (1000 * 60 * 60 * 24))
      );

      onBrushChange(startIndex, endIndex);
    } else if (dragState.itemId && dragState.originalStart && dragState.originalEnd) {
      // Update item position/size
      let newStartDate = new Date(dragState.originalStart);
      let newEndDate = new Date(dragState.originalEnd);

      if (dragState.type === 'move') {
        const item = items.find(i => i.id === dragState.itemId);
        if (item) {
          newStartDate = dateFromPixelPosition(
            currentX - (dragState.startX || 0) +
            calculateItemPosition({ ...item, startDate: dragState.originalStart, endDate: dragState.originalEnd }, viewport).left,
            viewport
          );
          const duration = dragState.originalEnd.getTime() - dragState.originalStart.getTime();
          newEndDate = new Date(newStartDate.getTime() + duration);
        }
      } else if (dragState.type === 'resize-start') {
        const deltaDaysRounded = Math.round(deltaDays);
        newStartDate = new Date(dragState.originalStart);
        newStartDate.setDate(newStartDate.getDate() + deltaDaysRounded);
        newStartDate.setHours(0, 0, 0, 0);
        newEndDate = new Date(dragState.originalEnd);
        newEndDate.setHours(0, 0, 0, 0);

        // Ensure minimum duration
        const durationDays = Math.round((newEndDate.getTime() - newStartDate.getTime()) / (1000 * 60 * 60 * 24));
        if (durationDays < minItemDuration) {
          newStartDate = new Date(newEndDate);
          newStartDate.setDate(newStartDate.getDate() - minItemDuration);
          newStartDate.setHours(0, 0, 0, 0);
        }

        // Calculate shifted phases for cascading updates
        const shiftAmount = deltaDaysRounded;
        if (shiftAmount !== 0 && dragState.adjacentPhases) {
          const sortedItems = [...items].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
          const currentIndex = sortedItems.findIndex(item => item.id === dragState.itemId);

          if (!dragState.adjacentPhases.updates) {
            dragState.adjacentPhases.updates = {};
          }
          dragState.adjacentPhases.shiftedPhases = [];

          for (let i = 0; i < currentIndex; i++) {
            const phase = sortedItems[i];
            const newPhaseStartDate = new Date(phase.startDate);
            newPhaseStartDate.setDate(newPhaseStartDate.getDate() + shiftAmount);
            newPhaseStartDate.setHours(0, 0, 0, 0);

            const newPhaseEndDate = new Date(phase.endDate);
            newPhaseEndDate.setDate(newPhaseEndDate.getDate() + shiftAmount);
            newPhaseEndDate.setHours(0, 0, 0, 0);

            dragState.adjacentPhases.shiftedPhases.push({
              id: phase.id,
              newStartDate: newPhaseStartDate,
              newEndDate: newPhaseEndDate
            });
          }
        }
      } else if (dragState.type === 'resize-end') {
        const deltaDaysRounded = Math.round(deltaDays);
        newStartDate = new Date(dragState.originalStart);
        newStartDate.setHours(0, 0, 0, 0);
        newEndDate = new Date(dragState.originalEnd);
        newEndDate.setDate(newEndDate.getDate() + deltaDaysRounded);
        newEndDate.setHours(0, 0, 0, 0);

        // Ensure minimum duration
        const durationDays = Math.round((newEndDate.getTime() - newStartDate.getTime()) / (1000 * 60 * 60 * 24));
        if (durationDays < minItemDuration) {
          newEndDate = new Date(newStartDate);
          newEndDate.setDate(newEndDate.getDate() + minItemDuration);
          newEndDate.setHours(0, 0, 0, 0);
        }

        // Calculate shifted phases for cascading updates
        const shiftAmount = deltaDaysRounded;
        if (shiftAmount !== 0 && dragState.adjacentPhases) {
          const sortedItems = [...items].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
          const currentIndex = sortedItems.findIndex(item => item.id === dragState.itemId);

          if (!dragState.adjacentPhases.updates) {
            dragState.adjacentPhases.updates = {};
          }
          dragState.adjacentPhases.shiftedPhases = [];

          for (let i = currentIndex + 1; i < sortedItems.length; i++) {
            const phase = sortedItems[i];
            const newPhaseStartDate = new Date(phase.startDate);
            newPhaseStartDate.setDate(newPhaseStartDate.getDate() + shiftAmount);
            newPhaseStartDate.setHours(0, 0, 0, 0);

            const newPhaseEndDate = new Date(phase.endDate);
            newPhaseEndDate.setDate(newPhaseEndDate.getDate() + shiftAmount);
            newPhaseEndDate.setHours(0, 0, 0, 0);

            dragState.adjacentPhases.shiftedPhases.push({
              id: phase.id,
              newStartDate: newPhaseStartDate,
              newEndDate: newPhaseEndDate
            });
          }
        }
      }

      // Update preview dates for visual feedback
      setDragState(prev => ({
        ...prev,
        currentX: currentX,
        previewStart: newStartDate,
        previewEnd: newEndDate
      }));
    } else if (dragState.type === 'boundary' && dragState.boundaryData) {
      // Handle boundary drag - just update the drag state for visual feedback
      setDragState(prev => ({
        ...prev,
        currentX: currentX
      }));
    }
  }, [dragState, viewport, onBrushChange, minItemDuration, mode, phaseHandles, items, timelineRef]);

  // Handle mouse up - commits drag operations
  const handleMouseUp = useCallback(() => {
    // Trigger callbacks with final positions before clearing drag state
    if (dragState.type && dragState.itemId && dragState.previewStart && dragState.previewEnd) {
      if (dragState.type === 'move' && onItemMove) {
        onItemMove(dragState.itemId, dragState.previewStart, dragState.previewEnd);
      } else if ((dragState.type === 'resize-start' || dragState.type === 'resize-end') && onItemResize) {
        // Update the main phase
        onItemResize(dragState.itemId, dragState.previewStart, dragState.previewEnd);

        // Update adjacent phases to maintain gaps
        if (dragState.adjacentPhases?.updates) {
          if (dragState.adjacentPhases.updates.previous) {
            const { id, newEndDate } = dragState.adjacentPhases.updates.previous;
            const prevPhase = items.find(item => item.id === id);
            if (prevPhase) {
              onItemResize(id, prevPhase.startDate, newEndDate);
            }
          }
          if (dragState.adjacentPhases.updates.next) {
            const { id, newStartDate } = dragState.adjacentPhases.updates.next;
            const nextPhase = items.find(item => item.id === id);
            if (nextPhase) {
              const duration = nextPhase.endDate.getTime() - nextPhase.startDate.getTime();
              const newEndDate = new Date(newStartDate.getTime() + duration);
              onItemResize(id, newStartDate, newEndDate);
            }
          }
        }

        // Apply cascading updates to all shifted phases
        if (dragState.adjacentPhases?.shiftedPhases) {
          const sortedShiftedPhases = [...dragState.adjacentPhases.shiftedPhases].sort((a, b) => {
            const phaseA = items.find(item => item.id === a.id);
            const phaseB = items.find(item => item.id === b.id);
            if (!phaseA || !phaseB) return 0;
            return phaseA.startDate.getTime() - phaseB.startDate.getTime();
          });

          sortedShiftedPhases.forEach(shiftedPhase => {
            onItemResize(shiftedPhase.id, shiftedPhase.newStartDate, shiftedPhase.newEndDate);
          });
        }
      }
    } else if (dragState.type === 'boundary' && dragState.boundaryData && onItemResize) {
      // For boundary drag, trigger the final resize callbacks
      const currentX = dragState.currentX || dragState.startX || 0;
      const newBoundaryDate = dateFromPixelPosition(currentX, viewport);

      const { leftPhaseId, rightPhaseId } = dragState.boundaryData;
      const leftPhase = items.find(item => item.id === leftPhaseId);
      const rightPhase = items.find(item => item.id === rightPhaseId);

      if (leftPhase) {
        onItemResize(leftPhaseId, leftPhase.startDate, newBoundaryDate);
      }
      if (rightPhase) {
        onItemResize(rightPhaseId, newBoundaryDate, rightPhase.endDate);
      }
    }

    setDragState({ type: null });
  }, [dragState, onItemMove, onItemResize, viewport, items]);

  // Handle double click - opens edit dialog or creates new item
  const handleDoubleClick = useCallback((e: React.MouseEvent, itemId?: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (itemId && onItemEdit) {
      onItemEdit(itemId);
    } else if (!itemId && onItemAdd) {
      const rect = timelineRef.current?.getBoundingClientRect();
      if (rect) {
        const clickX = e.clientX - rect.left;
        const clickDate = dateFromPixelPosition(clickX, viewport);
        onItemAdd(undefined, { x: clickX, date: clickDate });
      }
    }
  }, [onItemEdit, onItemAdd, viewport, timelineRef]);

  // Handle right click - delete item
  const handleRightClick = useCallback((e: React.MouseEvent, itemId: string) => {
    e.preventDefault();
    if (onItemDelete) {
      onItemDelete(itemId);
    }
  }, [onItemDelete]);

  // Handle direct phase boundary actions with visual handles
  const handlePhaseAction = useCallback((handle: PhaseHandle) => {
    const phase = items.find(item => item.id === handle.phaseId);
    const adjacentPhase = handle.adjacentPhaseId ? items.find(item => item.id === handle.adjacentPhaseId) : null;

    if (!phase) {
      return;
    }

    switch (handle.handleType) {
      case 'extend-left':
        if (adjacentPhase) {
          const newStartDate = adjacentPhase.endDate;
          if (onItemResize) {
            onItemResize(phase.id, newStartDate, phase.endDate);
          }
        }
        break;

      case 'extend-right':
        if (adjacentPhase) {
          const newEndDate = adjacentPhase.startDate;
          if (onItemResize) {
            onItemResize(phase.id, phase.startDate, newEndDate);
          }
        }
        break;

      case 'adjust-both':
        if (adjacentPhase) {
          const phaseEndStr = formatDateSafe(phase.endDate);

          const daysBetween = Math.round((adjacentPhase.startDate.getTime() - phase.endDate.getTime()) / (1000 * 60 * 60 * 24));

          if (daysBetween <= 0) {
            return;
          }

          const midpointOffset = Math.floor(daysBetween / 2);
          const newBoundaryStr = addDaysSafe(phaseEndStr, midpointOffset);
          const newBoundaryDate = parseDateSafe(newBoundaryStr);

          if (onItemResize) {
            const predecessorEndsStr = formatDateSafe(newBoundaryDate);
            const successorStartsStr = formatDateSafe(newBoundaryDate);

            if (predecessorEndsStr <= successorStartsStr) {
              onItemResize(phase.id, phase.startDate, newBoundaryDate);
              onItemResize(adjacentPhase.id, newBoundaryDate, adjacentPhase.endDate);
            } else {
              console.error('FS dependency violation prevented:', {
                predecessorEnds: predecessorEndsStr,
                successorStarts: successorStartsStr
              });
            }
          }
        }
        break;
    }

    // Clear hover state after action
    setHoveredHandle(null);
  }, [items, onItemResize]);

  // Handle drag start for phase boundary adjustments
  const handlePhaseHandleMouseDown = useCallback((e: React.MouseEvent, handle: PhaseHandle) => {
    e.preventDefault();
    e.stopPropagation();

    if (!timelineRef.current) return;

    const phase = items.find(item => item.id === handle.phaseId);
    const adjacentPhase = handle.adjacentPhaseId ? items.find(item => item.id === handle.adjacentPhaseId) : null;

    if (!phase) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const startX = e.clientX - rect.left;

    if (handle.handleType === 'adjust-both' && adjacentPhase) {
      setDragState({
        type: 'boundary',
        startX,
        boundaryData: {
          leftPhaseId: handle.phaseId,
          rightPhaseId: adjacentPhase.id,
          originalLeftEnd: new Date(phase.endDate),
          originalRightStart: new Date(adjacentPhase.startDate)
        }
      });
    } else {
      // For extend handles, use regular resize behavior
      const resizeType = handle.handleType === 'extend-left' ? 'resize-start' : 'resize-end';
      setDragState({
        type: resizeType,
        itemId: phase.id,
        startX,
        originalStart: new Date(phase.startDate),
        originalEnd: new Date(phase.endDate)
      });
    }
  }, [items, timelineRef]);

  // Handle keyboard shortcuts for quick actions
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (hoveredHandle && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      const phase = items.find(item => item.id === hoveredHandle.phaseId);
      if (phase) {
        const handle = phaseHandles.find(h =>
          h.phaseId === hoveredHandle.phaseId &&
          h.handleType === hoveredHandle.handleType
        );
        if (handle) {
          handlePhaseAction(handle);
        }
      }
    }
  }, [hoveredHandle, items, phaseHandles, handlePhaseAction]);

  // Add keyboard event listeners for shortcuts
  useEffect(() => {
    if (hoveredHandle) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [hoveredHandle, handleKeyDown]);

  // Add global mouse events for drag operations
  useEffect(() => {
    if (dragState.type) {
      const handleGlobalMouseMove = (e: MouseEvent) => {
        handleMouseMove(e as unknown as React.MouseEvent);
      };
      const handleGlobalMouseUp = () => {
        handleMouseUp();
      };

      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleGlobalMouseMove);
        document.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }
  }, [dragState.type, handleMouseMove, handleMouseUp]);

  return {
    // State
    dragState,
    hoverItemId,
    tooltip,
    hoveredHandle,

    // State setters
    setHoverItemId,
    setTooltip,
    setHoveredHandle,

    // Event handlers
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleDoubleClick,
    handleRightClick,
    handlePhaseAction,
    handlePhaseHandleMouseDown,
    handleKeyDown
  };
}

export default useTimelineEvents;
