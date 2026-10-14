import React from 'react';
import type { DependencyPoints } from './utils';
import { getLineColor } from './utils';

interface DependencyLinesProps {
  dependencyLines: DependencyPoints[];
}

export function DependencyLines({ dependencyLines }: DependencyLinesProps) {
  return (
    <>
      {dependencyLines.map((line, index) => {
        const { startPoint, endPoint, dependency } = line;
        const pathData = `M ${startPoint.x} ${startPoint.y} L ${endPoint.x} ${endPoint.y}`;
        const lineColor = getLineColor(dependency.dependencyType);
        const label = `${dependency.dependencyType}${dependency.lagDays ? `+${dependency.lagDays}d` : ''}`;
        const labelWidth = Math.max(32, label.length * 7);
        const midX = (startPoint.x + endPoint.x) / 2;
        const midY = (startPoint.y + endPoint.y) / 2;

        return (
          <svg
            key={`dependency-${dependency.id || index}`}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              zIndex: 2
            }}
          >
            {/* Two inks identify the edge over every phase fill and both themes. */}
            <path d={pathData} stroke="var(--solid-shade)" strokeWidth="6" fill="none" />
            <path d={pathData} stroke="var(--solid-foreground)" strokeWidth="4" fill="none" />
            {/* Main dependency line */}
            <path
              d={pathData}
              stroke={lineColor}
              strokeWidth="2"
              fill="none"
              strokeDasharray={dependency.lagDays && dependency.lagDays > 0 ? "5,3" : undefined}
              opacity="1"
            />

            {/* Arrow head at end point */}
            <polygon
              points={`${endPoint.x - 6},${endPoint.y - 3} ${endPoint.x},${endPoint.y} ${endPoint.x - 6},${endPoint.y + 3}`}
              fill={lineColor}
              opacity="1"
            />

            {/* Keep the type text readable when the midpoint crosses a phase. */}
            <rect x={midX-labelWidth/2} y={midY-22} width={labelWidth} height="17" rx="3" fill="var(--bg-primary)" />
            <text
              x={midX}
              y={midY-9}
              fontSize="10"
              fill="var(--text-primary)"
              textAnchor="middle"
              fontWeight="600"
              style={{ userSelect: 'none' }}
            >
              {label}
            </text>
          </svg>
        );
      })}
    </>
  );
}

export default DependencyLines;
