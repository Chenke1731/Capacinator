import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TimelineViewport } from '../InteractiveTimeline';

interface GridLine {
  date: Date;
  label: string;
  type: 'major' | 'minor';
}

interface TimelineGridProps {
  gridLines: GridLine[];
  viewport: TimelineViewport;
  showToday: boolean;
  timelineWidth: number;
}

export function TimelineGrid({ gridLines, viewport, showToday, timelineWidth }: TimelineGridProps) {
  const { t } = useTranslation();

  return (
    <>
      {/* Grid lines */}
      {gridLines.map((line, index) => {
        const position = ((line.date.getTime() - viewport.startDate.getTime()) / (1000 * 60 * 60 * 24)) * viewport.pixelsPerDay;
        return (
          <div
            key={index}
            style={{
              position: 'absolute',
              left: position,
              top: 0,
              bottom: 0,
              width: '1px',
              backgroundColor: line.type === 'major' ? 'hsl(var(--muted))' : 'hsl(var(--muted) / 0.8)',
              opacity: line.type === 'major' ? 0.8 : 0.5
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: -25,
                left: 2,
                fontSize: '10px',
                color: line.type === 'major' ? 'var(--text-secondary)' : 'var(--text-tertiary)',
                fontWeight: line.type === 'major' ? 500 : 400,
                whiteSpace: 'nowrap',
                maxWidth: '60px',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {line.label}
            </div>
          </div>
        );
      })}

      {/* Today line */}
      {showToday && (
        <TodayLine viewport={viewport} timelineWidth={timelineWidth} label={t('phases:timeline.today')} />
      )}
    </>
  );
}

function TodayLine({ viewport, timelineWidth, label }: { viewport: TimelineViewport; timelineWidth: number; label: string }) {
  const today = new Date();
  const todayPosition = ((today.getTime() - viewport.startDate.getTime()) / (1000 * 60 * 60 * 24)) * viewport.pixelsPerDay;

  if (todayPosition < 0 || todayPosition > timelineWidth) {
    return null;
  }

  return (
    <div
      data-timeline-today
      style={{
        position: 'absolute',
        left: todayPosition,
        top: 0,
        bottom: 0,
        width: '2px',
        backgroundColor: 'var(--status-danger-border)',
        opacity: 1,
        // A marker crosses arbitrary data colors. Both inks remain identifiable
        // on light/dark surfaces and bright phase fills without recoloring data.
        boxShadow: '0 0 0 1px var(--solid-foreground), 0 0 0 2px var(--solid-shade)',
        zIndex: 10
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: -20,
          left: -15,
          fontSize: '10px',
          color: 'var(--status-danger-text)',
          fontWeight: 600,
          whiteSpace: 'nowrap'
        }}
      >
        {label}
      </div>
    </div>
  );
}

export default TimelineGrid;
