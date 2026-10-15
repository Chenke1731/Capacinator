// Unified chart configuration for all reports
import '../chart-colors.css';

export const CHART_COLORS = {
  capacity: ['var(--series-indigo)', 'var(--series-green)', 'var(--series-amber)', 'var(--series-red)'],
  utilization: ['var(--series-indigo)', 'var(--series-green)', 'var(--series-red)', 'var(--series-purple)'],
  demand: ['var(--series-indigo)', 'var(--series-green)', 'var(--series-purple)', 'var(--series-amber)'],
  gaps: ['var(--series-red)', 'var(--series-amber)', 'var(--series-green)', 'var(--series-indigo)']
};

export const CHART_AXIS_CONFIG = {
  standard: {
    tick: { fontSize: 12 },
    style: { fill: 'var(--text-secondary)' }
  },
  angled: {
    angle: -45,
    textAnchor: 'end' as const,
    height: 120,
    interval: 'preserveStartEnd' as const,
    tick: { fontSize: 11 }
  }
};

export const getChartColor = (reportType: keyof typeof CHART_COLORS, index: number) => {
  const colors = CHART_COLORS[reportType];
  return colors[index % colors.length];
};
