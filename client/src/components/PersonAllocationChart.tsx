import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Area, AreaChart, Brush } from 'recharts';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api-client';
import { queryKeys } from '../lib/queryKeys';
import { getLocale } from '../i18n';

interface PersonAllocationChartProps {
  personId: string;
  personName: string;
  startDate?: string;
  endDate?: string;
}


export function PersonAllocationChart({ personId, personName, startDate, endDate }: PersonAllocationChartProps) {
  const { t } = useTranslation();
  const [brushStart, setBrushStart] = React.useState<number>(0);
  const [brushEnd, setBrushEnd] = React.useState<number>(0);
  const availableCapacityLabel = t('people:allocationChart.availableCapacity');
  const { data: timelineData, isLoading, error } = useQuery({
    queryKey: queryKeys.people.timeline(personId),
    queryFn: async () => {
      const response = await api.assignments.getTimeline(personId);
      // { success, data: { person_id, timeline } } — unwrap to the payload,
      // the chart reads .timeline directly (this used to read the envelope,
      // so the chart never rendered)
      const payload: any = response.data;
      return payload?.data ?? payload;
    }
  });

  // Fetch utilization timeline to get consistent date range
  const { data: utilizationData } = useQuery({
    queryKey: queryKeys.people.utilizationTimeline(personId, startDate, endDate),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      const response = await fetch(`/api/people/${personId}/utilization-timeline?${params}`);
      return response.json();
    },
    enabled: !!personId
  });

  // Determine appropriate granularity based on date range
  const getGranularity = (startMonth: string, endMonth: string) => {
    const start = new Date(startMonth + '-01');
    const end = new Date(endMonth + '-01');
    const monthsDiff = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
    
    if (monthsDiff <= 3) return 'daily';     // 3 months or less: daily
    if (monthsDiff <= 12) return 'weekly';   // 4-12 months: weekly
    if (monthsDiff <= 24) return 'monthly';  // 13-24 months: monthly
    return 'quarterly';                      // > 24 months: quarterly
  };

  // Generate date points based on granularity
  const generateDatePoints = (startMonth: string, endMonth: string, granularity: string) => {
    const start = new Date(startMonth + '-01');
    const end = new Date(endMonth + '-01');
    end.setMonth(end.getMonth() + 1, 0); // Last day of end month
    
    const points: string[] = [];
    const current = new Date(start);
    
    if (granularity === 'weekly') {
      // Start from the beginning of the week containing the start date
      const startOfWeek = new Date(current);
      startOfWeek.setDate(current.getDate() - current.getDay()); // Go to Sunday
      
      current.setTime(startOfWeek.getTime());
      
      while (current <= end) {
        points.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 7); // Add 7 days for weekly
      }
    } else if (granularity === 'daily') {
      while (current <= end) {
        points.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
      }
    } else { // monthly or quarterly
      while (current <= end) {
        const year = current.getFullYear();
        const month = (current.getMonth() + 1).toString().padStart(2, '0');
        points.push(`${year}-${month}`);
        
        if (granularity === 'quarterly') {
          current.setMonth(current.getMonth() + 3);
        } else {
          current.setMonth(current.getMonth() + 1);
        }
      }
    }
    
    return points.sort();
  };

  // Process timeline data for full range with base granularity
  const fullRangeData = React.useMemo(() => {
    if (!timelineData?.timeline || !utilizationData?.timeline) return [];

    const { assignments, availability_overrides } = timelineData.timeline;
    
    // Get date range from utilization data
    const utilizationMonths = utilizationData.timeline.map((item: any) => item.month);
    const sortedMonths = utilizationMonths.sort((a: string, b: string) => a.localeCompare(b));
    
    if (sortedMonths.length === 0) return [];
    
    const startMonth = sortedMonths[0];
    const endMonth = sortedMonths[sortedMonths.length - 1];
    
    // For full range, use monthly granularity as base
    const baseGranularity = 'monthly';
    const datePoints = generateDatePoints(startMonth, endMonth, baseGranularity);
    
    return datePoints.map(datePoint => {
      let periodStart: Date;
      let periodEnd: Date;
      let displayDate: string;
      
      if (baseGranularity === 'weekly' || baseGranularity === 'daily') {
        const pointDate = new Date(datePoint);
        if (baseGranularity === 'weekly') {
          // Week period: from this Sunday to next Saturday
          periodStart = new Date(pointDate);
          periodEnd = new Date(pointDate);
          periodEnd.setDate(periodEnd.getDate() + 6);
          displayDate = datePoint; // Use ISO date for weekly
        } else {
          // Daily period: just this day
          periodStart = new Date(pointDate);
          periodEnd = new Date(pointDate);
          displayDate = datePoint; // Use ISO date for daily
        }
      } else {
        // Monthly or quarterly
        const [year, monthNum] = datePoint.split('-').map(Number);
        periodStart = new Date(year, monthNum - 1, 1);
        if (baseGranularity === 'quarterly') {
          periodEnd = new Date(year, monthNum - 1 + 3, 0); // Last day of quarter
        } else {
          periodEnd = new Date(year, monthNum, 0); // Last day of month
        }
        displayDate = datePoint; // Use YYYY-MM format
      }
      
      let totalAllocation = 0;
      const projectBreakdown: { [projectName: string]: number } = {};

      // Calculate allocations for this period
      assignments.forEach((assignment: any) => {
        const assignmentStart = new Date(assignment.start_date);
        const assignmentEnd = new Date(assignment.end_date);
        
        // Check if assignment overlaps with this period
        if (assignmentStart <= periodEnd && assignmentEnd >= periodStart) {
          totalAllocation += assignment.allocation_percentage;
          projectBreakdown[assignment.project_name] = 
            (projectBreakdown[assignment.project_name] || 0) + assignment.allocation_percentage;
        }
      });

      // Calculate availability for this period
      let availability = 100; // Default availability
      availability_overrides.forEach((override: any) => {
        const overrideStart = new Date(override.start_date);
        const overrideEnd = new Date(override.end_date);
        
        // Check if override overlaps with this period
        if (overrideStart <= periodEnd && overrideEnd >= periodStart) {
          availability = override.availability_percentage;
        }
      });

      // Create individual project data keys for stacked areas
      const projectData: { [key: string]: number } = {};
      Object.entries(projectBreakdown).forEach(([project, allocation]) => {
        projectData[`project_${project}`] = allocation as number;
      });

      return {
        date: displayDate,
        granularity: 'monthly',
        totalAllocation,
        availability,
        capacity: availability,
        utilization: availability > 0 ? (totalAllocation / availability) * 100 : 0,
        projectBreakdown,
        ...projectData // Spread individual project allocations as separate keys
      };
    });
  }, [timelineData, utilizationData]);

  // Get unique projects from full range data
  const allProjects = React.useMemo(() => {
    if (!fullRangeData || fullRangeData.length === 0) return [];
    return [...new Set(fullRangeData.flatMap(d => Object.keys(d.projectBreakdown || {})))];
  }, [fullRangeData]);

  // Validate data structure and ensure all required fields for Brush
  const validData = React.useMemo(() => {
    if (!fullRangeData || fullRangeData.length === 0) return [];
    
    const filtered = fullRangeData.filter(d => {
      const isValid = d && 
                     d.date && 
                     typeof d.totalAllocation === 'number' &&
                     typeof d.availability === 'number' &&
                     !isNaN(d.totalAllocation) &&
                     !isNaN(d.availability);
      return isValid;
    });

    // Ensure all project data keys have valid numbers for stacked areas
    return filtered.map(d => {
      const cleanedData = { ...d };
      
      // Ensure all project allocation values are valid numbers
      allProjects.forEach(project => {
        const key = `project_${project}`;
        if (typeof cleanedData[key] !== 'number' || isNaN(cleanedData[key])) {
          cleanedData[key] = 0;
        }
      });
      
      return cleanedData;
    });
  }, [fullRangeData, allProjects]);

  // Initialize brush range when data loads
  React.useEffect(() => {
    if (validData.length > 0 && brushEnd === 0) {
      setBrushStart(Math.max(0, Math.floor(validData.length * 0.2)));
      setBrushEnd(validData.length - 1);
    }
  }, [validData, brushEnd]);

  // Process and display data with dynamic granularity based on zoom
  const displayData = React.useMemo(() => {
    if (!timelineData?.timeline || !utilizationData?.timeline || validData.length === 0) return [];
    
    const start = Math.max(0, Math.min(brushStart, brushEnd));
    const end = Math.min(validData.length - 1, Math.max(brushStart, brushEnd));
    
    if (start === 0 && end === validData.length - 1) {
      // Full range - use base data
      return validData;
    }
    
    // Get the visible date range
    const visibleMonthlyData = validData.slice(start, end + 1);
    if (visibleMonthlyData.length === 0) return [];
    
    const firstDate = visibleMonthlyData[0].date;
    const lastDate = visibleMonthlyData[visibleMonthlyData.length - 1].date;
    
    // Determine appropriate granularity for the visible range
    const newGranularity = getGranularity(firstDate, lastDate);
    
    // If monthly is still appropriate, use the sliced data
    if (newGranularity === 'monthly') {
      return visibleMonthlyData;
    }
    
    // Otherwise, recalculate with new granularity
    const { assignments, availability_overrides } = timelineData.timeline;
    const datePoints = generateDatePoints(firstDate, lastDate, newGranularity);
    
    return datePoints.map(datePoint => {
      let periodStart: Date;
      let periodEnd: Date;
      let displayDate: string;
      
      if (newGranularity === 'weekly' || newGranularity === 'daily') {
        const pointDate = new Date(datePoint);
        if (newGranularity === 'weekly') {
          periodStart = new Date(pointDate);
          periodEnd = new Date(pointDate);
          periodEnd.setDate(periodEnd.getDate() + 6);
          displayDate = datePoint;
        } else {
          periodStart = new Date(pointDate);
          periodEnd = new Date(pointDate);
          displayDate = datePoint;
        }
      } else {
        const [year, monthNum] = datePoint.split('-').map(Number);
        periodStart = new Date(year, monthNum - 1, 1);
        if (newGranularity === 'quarterly') {
          periodEnd = new Date(year, monthNum - 1 + 3, 0);
        } else {
          periodEnd = new Date(year, monthNum, 0);
        }
        displayDate = datePoint;
      }
      
      let totalAllocation = 0;
      const projectBreakdown: { [projectName: string]: number } = {};

      assignments.forEach((assignment: any) => {
        const assignmentStart = new Date(assignment.start_date);
        const assignmentEnd = new Date(assignment.end_date);
        
        if (assignmentStart <= periodEnd && assignmentEnd >= periodStart) {
          totalAllocation += assignment.allocation_percentage;
          projectBreakdown[assignment.project_name] = 
            (projectBreakdown[assignment.project_name] || 0) + assignment.allocation_percentage;
        }
      });

      let availability = 100;
      availability_overrides.forEach((override: any) => {
        const overrideStart = new Date(override.start_date);
        const overrideEnd = new Date(override.end_date);
        
        if (overrideStart <= periodEnd && overrideEnd >= periodStart) {
          availability = override.availability_percentage;
        }
      });

      const projectData: { [key: string]: number } = {};
      Object.entries(projectBreakdown).forEach(([project, allocation]) => {
        projectData[`project_${project}`] = allocation as number;
      });

      return {
        date: displayDate,
        granularity: newGranularity,
        totalAllocation,
        availability,
        capacity: availability,
        utilization: availability > 0 ? (totalAllocation / availability) * 100 : 0,
        projectBreakdown,
        ...projectData
      };
    });
  }, [timelineData, utilizationData, validData, brushStart, brushEnd]);

  if (isLoading) {
    return (
      <div className="chart-container">
        <div className="chart-loading">{t('people:allocationChart.loading')}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="chart-container">
        <div className="chart-error">{t('people:allocationChart.failedToLoad')}</div>
      </div>
    );
  }

  if (!fullRangeData || fullRangeData.length === 0) {
    return (
      <div className="chart-container">
        <div className="chart-empty">{t('people:allocationChart.noData')}</div>
      </div>
    );
  }

  if (validData.length === 0) {
    return (
      <div className="chart-container">
        <div className="chart-empty">{t('people:allocationChart.invalidFormat')}</div>
      </div>
    );
  }

  // NOTE: Using hex values for chart colors as Recharts may use them in contexts where CSS variables cannot be resolved
  const projectColors = [
    '#3b82f6', // Blue
    '#10b981', // Emerald 
    '#f59e0b', // Amber
    '#ef4444', // Red
    '#8b5cf6', // Violet
    '#06b6d4', // Cyan
    '#84cc16', // Lime
    '#f97316', // Orange
    '#ec4899', // Pink
    '#6b7280'  // Gray
  ];

  return (
    <div className="chart-container">
      <div className="chart-header">
        <h3>{t('people:allocationChart.title')}</h3>
        <p className="chart-subtitle">
          {t('people:allocationChart.subtitle', { name: personName })}
        </p>
      </div>
      
      
      <div className="chart-content">
        <ResponsiveContainer width="100%" height={450}>
          <AreaChart 
            data={displayData} 
            margin={{ top: 5, right: 30, left: 20, bottom: 60 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              angle={-45}
              textAnchor="end"
              height={80}
              interval="preserveStartEnd"
              tick={{ fontSize: 12 }}
              tickFormatter={(value, _index) => {
                // Find the data point by value instead of index for more reliability
                const dataPoint = displayData.find(d => d.date === value) || displayData[0];
                if (!dataPoint) return value;

                const granularity = dataPoint.granularity;

                if (granularity === 'weekly') {
                  const date = new Date(value);
                  return date.toLocaleDateString(getLocale(), { month: 'short', day: 'numeric' });
                } else if (granularity === 'daily') {
                  const date = new Date(value);
                  return date.toLocaleDateString(getLocale(), { month: 'short', day: 'numeric' });
                } else if (granularity === 'monthly') {
                  const date = new Date(value + '-01');
                  return date.toLocaleDateString(getLocale(), { month: 'short', year: '2-digit' });
                } else { // quarterly
                  const date = new Date(value + '-01');
                  return t('people:allocationChart.quarterShort', {
                    quarter: Math.ceil(date.getMonth() / 3 + 1),
                    year: date.getFullYear().toString().slice(-2)
                  });
                }
              }}
            />
            <YAxis
              label={{ value: t('people:allocationChart.percentageAxis'), angle: -90, position: 'insideLeft' }}
              domain={[0, 'dataMax']}
            />
            <Tooltip
              formatter={(value: number, name: string) => {
                if (name === availableCapacityLabel) {
                  return [`${value.toFixed(1)}%`, name];
                }
                return [`${value.toFixed(1)}%`, name];
              }}
              labelFormatter={(label) => {
                const dataPoint = displayData.find(d => d.date === label);
                if (!dataPoint) return label;

                const granularity = dataPoint.granularity;

                if (granularity === 'weekly') {
                  const startDate = new Date(label);
                  const endDate = new Date(startDate);
                  endDate.setDate(endDate.getDate() + 6);
                  return t('people:allocationChart.weekLabel', {
                    start: startDate.toLocaleDateString(getLocale(), { month: 'short', day: 'numeric' }),
                    end: endDate.toLocaleDateString(getLocale(), { month: 'short', day: 'numeric' })
                  });
                } else if (granularity === 'daily') {
                  const date = new Date(label);
                  return date.toLocaleDateString(getLocale(), { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
                } else if (granularity === 'monthly') {
                  const date = new Date(label + '-01');
                  return date.toLocaleDateString(getLocale(), { month: 'long', year: 'numeric' });
                } else { // quarterly
                  const date = new Date(label + '-01');
                  const quarter = Math.ceil((date.getMonth() + 1) / 3);
                  return t('people:allocationChart.quarterShort', { quarter, year: date.getFullYear() });
                }
              }}
              content={({ active, payload, label }) => {
                if (!active || !payload) return null;

                const data = payload[0]?.payload;
                if (!data) return null;

                const dataPoint = displayData.find(d => d.date === label);
                const granularity = dataPoint?.granularity || 'monthly';

                let formattedPeriod = '';
                if (granularity === 'weekly') {
                  const startDate = new Date(label);
                  const endDate = new Date(startDate);
                  endDate.setDate(endDate.getDate() + 6);
                  formattedPeriod = t('people:allocationChart.weekLabel', {
                    start: startDate.toLocaleDateString(getLocale(), { month: 'short', day: 'numeric' }),
                    end: endDate.toLocaleDateString(getLocale(), { month: 'short', day: 'numeric' })
                  });
                } else if (granularity === 'daily') {
                  formattedPeriod = t('people:allocationChart.dayLabel', {
                    date: new Date(label).toLocaleDateString(getLocale(), { month: 'short', day: 'numeric' })
                  });
                } else if (granularity === 'monthly') {
                  formattedPeriod = t('people:allocationChart.monthLabel', {
                    month: new Date(label + '-01').toLocaleDateString(getLocale(), { month: 'long', year: 'numeric' })
                  });
                } else {
                  const date = new Date(label + '-01');
                  const quarter = Math.ceil((date.getMonth() + 1) / 3);
                  formattedPeriod = t('people:allocationChart.quarterLabel', {
                    label: t('people:allocationChart.quarterShort', { quarter, year: date.getFullYear() })
                  });
                }

                return (
                  <div className="custom-tooltip">
                    <p className="tooltip-title">{formattedPeriod}</p>
                    <p className="tooltip-capacity">{t('people:allocationChart.available', { value: data.availability.toFixed(1) })}</p>
                    <p className="tooltip-total">{t('people:allocationChart.totalAllocation', { value: data.totalAllocation.toFixed(1) })}</p>
                    <div className="tooltip-projects">
                      {Object.entries(data.projectBreakdown).map(([project, allocation]: [string, any]) => (
                        <p key={project} className="tooltip-project">
                          {`${project}: ${allocation.toFixed(1)}%`}
                        </p>
                      ))}
                    </div>
                    {data.totalAllocation > data.availability && (
                      <p className="tooltip-warning">{t('people:allocationChart.overAllocated', { value: (data.totalAllocation - data.availability).toFixed(1) })}</p>
                    )}
                  </div>
                );
              }}
            />
            <Legend
              wrapperStyle={{ paddingTop: '20px' }}
              content={({ payload }) => {
                if (!payload) return null;

                return (
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                    gap: '20px',
                    fontSize: '14px'
                  }}>
                    {payload.map((entry, index) => {
                      const isCapacity = entry.value === availableCapacityLabel;
                      return (
                        <div key={index} style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '6px' 
                        }}>
                          {isCapacity ? (
                            <div style={{
                              width: '16px',
                              height: '3px',
                              backgroundColor: entry.color,
                              border: `2px dashed ${entry.color}`,
                              borderRadius: '1px'
                            }} />
                          ) : (
                            <div style={{
                              width: '12px',
                              height: '12px',
                              backgroundColor: entry.color,
                              borderRadius: '2px'
                            }} />
                          )}
                          <span style={{ 
                            color: 'var(--text-primary)', 
                            fontWeight: 500 
                          }}>
                            {entry.value}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              }}
            />
            
            {/* Available capacity area - shown at the back with distinct styling */}
            <Area
              type="monotone"
              dataKey="availability"
              stroke="#10b981"
              strokeWidth={2}
              strokeDasharray="5 5"
              fill="transparent"
              name={availableCapacityLabel}
              stackId="capacity"
            />
            
            {/* Stacked project allocations */}
            {allProjects.map((project, index) => (
              <Area
                key={project}
                type="monotone"
                dataKey={`project_${project}`}
                stackId="allocation"
                stroke={projectColors[index % projectColors.length]}
                fill={projectColors[index % projectColors.length]}
                fillOpacity={0.8}
                name={project}
              />
            ))}

          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Custom brush control using mini chart */}
      {validData.length > 2 && (
        <div style={{ marginTop: '20px', padding: '0 20px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>
            {t('people:allocationChart.zoomHint')}
          </div>
          <ResponsiveContainer width="100%" height={80}>
            <AreaChart 
              data={validData}
              margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
            >
              <XAxis 
                dataKey="date"
                tick={false}
                axisLine={false}
              />
              <YAxis hide />
              <Area
                type="monotone"
                dataKey="totalAllocation"
                stroke="#8884d8"
                fill="#8884d8"
                fillOpacity={0.3}
              />
              <Brush
                dataKey="date"
                height={30}
                startIndex={brushStart}
                endIndex={brushEnd}
                onChange={({ startIndex, endIndex }) => {
                  if (typeof startIndex === 'number') setBrushStart(startIndex);
                  if (typeof endIndex === 'number') setBrushEnd(endIndex);
                }}
                tickFormatter={() => ''} // Hide ticks to keep it clean
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      
      <div className="chart-summary">
        <div className="summary-cards">
          <div className="summary-card">
            <div className="summary-value">
              {displayData.length > 0 ? Math.max(...displayData.map(d => d.totalAllocation || 0)).toFixed(1) : '0.0'}%
            </div>
            <div className="summary-label">{t('people:allocationChart.peakAllocation')}</div>
          </div>
          <div className="summary-card">
            <div className="summary-value">
              {displayData.length > 0 ? (displayData.reduce((sum, d) => sum + (d.totalAllocation || 0), 0) / displayData.length).toFixed(1) : '0.0'}%
            </div>
            <div className="summary-label">{t('people:allocationChart.averageAllocation')}</div>
          </div>
          <div className="summary-card">
            <div className="summary-value">
              {displayData.length > 0 ? Math.max(...displayData.map(d => d.utilization || 0)).toFixed(1) : '0.0'}%
            </div>
            <div className="summary-label">{t('people:allocationChart.peakUtilization')}</div>
          </div>
          <div className="summary-card">
            <div className="summary-value">{allProjects.length}</div>
            <div className="summary-label">{t('people:allocationChart.activeProjects')}</div>
          </div>
        </div>
      </div>

      {/* Project breakdown */}
      {allProjects.length > 0 && (
        <div className="chart-breakdown">
          <h4>{t('people:allocationChart.projectBreakdown')}</h4>
          <div className="breakdown-legend">
            {allProjects.map((project, index) => (
              <div key={project} className="breakdown-item">
                <div 
                  className="breakdown-color" 
                  style={{ backgroundColor: projectColors[index % projectColors.length] }}
                />
                <span className="breakdown-label">{project}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}