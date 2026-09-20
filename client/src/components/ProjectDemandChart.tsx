import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { api } from '../lib/api-client';
import { queryKeys } from '../lib/queryKeys';
import { formatDate } from '../utils/date';
import { getLocale } from '../i18n';
import { VisualPhaseManager } from './VisualPhaseManager';
import { TimelineViewport } from './InteractiveTimeline';
import { useBookmarkableTabs } from '../hooks/useBookmarkableTabs';
import { useProjectDemandData, ChartDataPoint, DemandApiResponse, AssignmentData } from '../hooks/useProjectDemandData';
import { useChartGranularity, ChartView } from '../hooks/useChartGranularity';
import { useChartDisplayData } from '../hooks/useChartDisplayData';

interface ProjectDemandChartProps {
  projectId: string;
  projectName: string;
}

// Simple Brush Control Component for timeline selection
const SimpleBrushControl = ({
  data: _data,
  dailyData,
  brushStart,
  brushEnd,
  onBrushChange
}: {
  data: ChartDataPoint[];
  dailyData: ChartDataPoint[];
  brushStart: number;
  brushEnd: number;
  onBrushChange: (start: number, end: number) => void;
}) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{
    type: 'start' | 'end' | 'range' | null;
    startX: number;
    originalStart: number;
    originalEnd: number;
  }>({ type: null, startX: 0, originalStart: 0, originalEnd: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent, type: 'start' | 'end' | 'range') => {
    e.preventDefault();
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const startX = e.clientX - rect.left;
    
    setDragging({
      type,
      startX,
      originalStart: brushStart,
      originalEnd: brushEnd
    });
  }, [brushStart, brushEnd]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.type || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const deltaX = currentX - dragging.startX;
    const containerWidth = rect.width;
    
    // Use daily data for fine-grained control
    const totalDailyPoints = dailyData.length;
    const deltaPercent = (deltaX / containerWidth) * 100;
    const deltaIndex = Math.round((deltaPercent / 100) * (totalDailyPoints - 1));
    
    let newStart = dragging.originalStart;
    let newEnd = dragging.originalEnd;
    
    if (dragging.type === 'start') {
      newStart = Math.max(0, Math.min(dragging.originalStart + deltaIndex, dragging.originalEnd - 1));
    } else if (dragging.type === 'end') {
      newEnd = Math.min(totalDailyPoints - 1, Math.max(dragging.originalEnd + deltaIndex, dragging.originalStart + 1));
    } else if (dragging.type === 'range') {
      const rangeSize = dragging.originalEnd - dragging.originalStart;
      newStart = Math.max(0, Math.min(dragging.originalStart + deltaIndex, totalDailyPoints - 1 - rangeSize));
      newEnd = newStart + rangeSize;
    }
    
    onBrushChange(newStart, newEnd);
  }, [dragging, dailyData.length, onBrushChange])

  const handleMouseUp = useCallback(() => {
    setDragging({ type: null, startX: 0, originalStart: 0, originalEnd: 0 });
  }, []);

  // Add global mouse events
  useEffect(() => {
    if (dragging.type) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragging.type, handleMouseMove, handleMouseUp]);

  if (dailyData.length === 0) return null;

  // Use daily data for percentage calculations to get smooth positioning
  const startPercent = (brushStart / Math.max(1, dailyData.length - 1)) * 100;
  const endPercent = (brushEnd / Math.max(1, dailyData.length - 1)) * 100;
  const rangeWidth = endPercent - startPercent;

  return (
    <div style={{ position: 'relative', height: '60px' }}>
      <div 
        ref={containerRef}
        style={{
          position: 'relative',
          height: '40px',
          backgroundColor: 'hsl(var(--card))',
          border: '1px solid hsl(var(--border))',
          borderRadius: '6px',
          margin: '0 20px', // Space for handles that extend beyond
          cursor: 'default',
          overflow: 'visible'
        }}
      >
        {/* Background timeline */}
        <div style={{
          position: 'absolute',
          top: '16px',
          left: '0',
          right: '0',
          height: '8px',
          backgroundColor: 'hsl(var(--muted))',
          borderRadius: '4px'
        }} />
        
        {/* Selected range */}
        <div 
          style={{
            position: 'absolute',
            top: '16px',
            left: `${startPercent}%`,
            width: `${rangeWidth}%`,
            height: '8px',
            backgroundColor: 'hsl(var(--primary))',
            borderRadius: '4px',
            cursor: 'grab'
          }}
          onMouseDown={(e) => handleMouseDown(e, 'range')}
        />
        
        {/* Start handle */}
        <div 
          style={{
            position: 'absolute',
            top: '6px',
            left: `calc(${startPercent}% - 8px)`,
            width: '16px',
            height: '28px',
            backgroundColor: 'hsl(var(--primary))',
            borderRadius: '8px',
            cursor: 'ew-resize',
            border: '2px solid white',
            boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '12px',
            fontWeight: 'bold',
            zIndex: 10
          }}
          onMouseDown={(e) => handleMouseDown(e, 'start')}
        >
          ‖
        </div>
        
        {/* End handle */}
        <div 
          style={{
            position: 'absolute',
            top: '6px',
            left: `calc(${endPercent}% - 8px)`,
            width: '16px',
            height: '28px',
            backgroundColor: 'hsl(var(--primary))',
            borderRadius: '8px',
            cursor: 'ew-resize',
            border: '2px solid white',
            boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '12px',
            fontWeight: 'bold',
            zIndex: 10
          }}
          onMouseDown={(e) => handleMouseDown(e, 'end')}
        >
          ‖
        </div>
      </div>
      
      {/* Date labels */}
      <div style={{
        position: 'relative',
        height: '20px',
        margin: '0 20px'
      }}>
        <div style={{
          position: 'absolute',
          top: '5px',
          left: `${startPercent}%`,
          fontSize: '11px',
          color: 'var(--text-tertiary)',
          transform: 'translateX(-50%)',
          whiteSpace: 'nowrap'
        }}>
          {dailyData[brushStart]?.date ? formatDate(dailyData[brushStart].date) : t('common:na')}
        </div>

        <div style={{
          position: 'absolute',
          top: '5px',
          left: `${endPercent}%`,
          fontSize: '11px',
          color: 'var(--text-tertiary)',
          transform: 'translateX(-50%)',
          whiteSpace: 'nowrap'
        }}>
          {dailyData[brushEnd]?.date ? formatDate(dailyData[brushEnd].date) : t('common:na')}
        </div>
      </div>
    </div>
  );
};

export function ProjectDemandChart({ projectId, projectName }: ProjectDemandChartProps) {
  // ALL HOOKS MUST BE CALLED FIRST - before any conditional logic or early returns
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // Chart view tab labels are language-dependent, so build them per render
  const chartViewTabs = useMemo(
    () => [
      { id: 'demand', label: t('projects:demandChart.demand') },
      { id: 'capacity', label: t('projects:demandChart.capacity') },
      { id: 'gaps', label: t('projects:demandChart.gaps') }
    ],
    [t]
  );
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartDimensions, setChartDimensions] = useState<{ width: number; left: number; right: number } | null>(null);
  // Use bookmarkable tabs for chart view selection
  const { activeTab, setActiveTab, isActiveTab } = useBookmarkableTabs({
    tabs: chartViewTabs,
    defaultTab: 'demand',
    paramName: 'view'
  });
  const currentView = activeTab as ChartView;
  const [brushStart, setBrushStart] = useState<number>(0);
  const [brushEnd, setBrushEnd] = useState<number>(0);
  const [brushInitialized, setBrushInitialized] = useState<boolean>(false);
  const [sharedViewport, setSharedViewport] = useState<TimelineViewport | null>(null);
  
  const { data: apiResponse, isLoading, error } = useQuery({
    queryKey: queryKeys.demands.project(projectId),
    queryFn: async () => {
      const response = await api.demands.getProjectDemands(projectId);
      return response.data;
    },
    enabled: !!projectId
  });

  // Get project assignments for capacity calculation
  const { data: assignmentsResponse } = useQuery({
    queryKey: queryKeys.projects.assignments(projectId),
    queryFn: async () => {
      const response = await api.assignments.list({ project_id: projectId });
      return response.data;
    },
    enabled: !!projectId
  });

  // Callback to refetch demand data when phases change
  const handlePhasesChange = useCallback(() => {
    // Invalidate demand data to trigger refetch
    queryClient.invalidateQueries({ queryKey: queryKeys.demands.project(projectId) });
    // Also invalidate assignments as they might be affected
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.assignments(projectId) });
  }, [queryClient, projectId]);

  // Get project phases for integrated visualization (used by VisualPhaseManager child component)
  useQuery({
    queryKey: queryKeys.projectPhases.byProject(projectId),
    queryFn: async () => {
      const response = await api.projectPhases.list({ project_id: projectId });
      return response.data;
    },
    enabled: !!projectId
  });

  // Process data for all three views using extracted hook
  const { demandData, capacityData, gapsData, phases, dateRange, allRoles } = useProjectDemandData({
    apiResponse: apiResponse as DemandApiResponse | null,
    assignmentsResponse: assignmentsResponse as { data: AssignmentData[] } | null
  });

  // Process data with variable granularity - using useChartGranularity hook
  const { processedData: processedDataWithGranularity } = useChartGranularity({
    demandData,
    capacityData,
    gapsData,
    currentView,
    allRoles
  });

  // Handle brush changes
  const handleBrushChange = React.useCallback((start: number, end: number) => {
    setBrushStart(start);
    setBrushEnd(end);

    // Update the shared viewport to sync with phase diagram
    const currentDailyData = (
      currentView === 'demand' ? demandData :
      currentView === 'capacity' ? capacityData :
      gapsData
    );

    if (currentDailyData.length > 0 && start >= 0 && end < currentDailyData.length) {
      const startDataPoint = currentDailyData[start];
      const endDataPoint = currentDailyData[end];

      console.log('🔄 Brush change - creating dates from:', {
        start, end,
        startDataPoint: startDataPoint?.date,
        endDataPoint: endDataPoint?.date,
        startIsString: typeof startDataPoint?.date === 'string',
        endIsString: typeof endDataPoint?.date === 'string'
      });

      const startDate = new Date(startDataPoint.date);
      const endDate = new Date(endDataPoint.date);

      console.log('🔄 Created Date objects:', {
        startDate,
        endDate,
        startDateIsDate: startDate instanceof Date,
        endDateIsDate: endDate instanceof Date,
        startDateValid: !isNaN(startDate.getTime()),
        endDateValid: !isNaN(endDate.getTime()),
        startDateISO: startDate.toISOString?.(),
        endDateISO: endDate.toISOString?.()
      });

      // Calculate pixels per day based on the selected range
      const totalDays = Math.max(1, (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const availableWidth = chartDimensions?.width || 800;
      const pixelsPerDay = Math.max(0.5, Math.min(10, availableWidth / totalDays));

      const newViewport: TimelineViewport = {
        startDate,
        endDate,
        pixelsPerDay
      };

      console.log('🔄 Brush change updating viewport:', {
        brushIndices: { start, end },
        viewport: newViewport,
        startDateType: typeof newViewport.startDate,
        endDateType: typeof newViewport.endDate,
        pixelsPerDay
      });

      setSharedViewport(newViewport);
    }
  }, [currentView, demandData, capacityData, gapsData, chartDimensions]);

  // Handle viewport changes from phase diagram
  const handleViewportChange = React.useCallback((viewport: TimelineViewport) => {
    setSharedViewport(viewport);
    
    // Convert viewport to brush indices for synchronization
    const currentDailyData = (
      currentView === 'demand' ? demandData :
      currentView === 'capacity' ? capacityData :
      gapsData
    );

    if (currentDailyData.length > 0) {
      const startDateStr = viewport.startDate.toISOString().split('T')[0];
      const endDateStr = viewport.endDate.toISOString().split('T')[0];
      
      const startIndex = currentDailyData.findIndex(d => d.date >= startDateStr);
      const endIndex = currentDailyData.findIndex(d => d.date > endDateStr) - 1;
      
      const validStartIndex = Math.max(0, startIndex !== -1 ? startIndex : 0);
      const validEndIndex = Math.min(currentDailyData.length - 1, endIndex !== -1 ? endIndex : currentDailyData.length - 1);
      
      console.log('🔄 Viewport synchronization:', {
        viewport: { start: startDateStr, end: endDateStr },
        dailyDataRange: { start: currentDailyData[0]?.date, end: currentDailyData[currentDailyData.length - 1]?.date },
        brushIndices: { start: validStartIndex, end: validEndIndex }
      });
      
      setBrushStart(validStartIndex);
      setBrushEnd(validEndIndex);
    }
  }, [currentView, demandData, capacityData, gapsData]);

  // Create initial viewport based on current chart data range
  // IMPORTANT: This should match the brush selection when initialized
  const initialViewport = React.useMemo((): TimelineViewport => {
    const currentDailyData = (
      currentView === 'demand' ? demandData :
      currentView === 'capacity' ? capacityData :
      gapsData
    );

    if (currentDailyData.length === 0) {
      const today = new Date();
      return {
        startDate: new Date(today.getFullYear(), 0, 1),
        endDate: new Date(today.getFullYear() + 1, 11, 31),
        pixelsPerDay: 2
      };
    }

    // If brush is initialized, use the brush selection for viewport
    // Otherwise use the full range (but brush will initialize soon)
    let startIndex = 0;
    let endIndex = currentDailyData.length - 1;

    if (brushInitialized && brushStart >= 0 && brushEnd < currentDailyData.length) {
      startIndex = brushStart;
      endIndex = brushEnd;
    }

    const startDate = new Date(currentDailyData[startIndex].date);
    const endDate = new Date(currentDailyData[endIndex].date);

    // Calculate pixels per day based on available width
    const totalDays = Math.max(1, (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const availableWidth = chartDimensions?.width || 800;
    const pixelsPerDay = Math.max(1, Math.min(10, availableWidth / totalDays));

    console.log('📐 Initial viewport calculation:', {
      brushInitialized,
      brushStart,
      brushEnd,
      startIndex,
      endIndex,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      pixelsPerDay
    });

    return {
      startDate,
      endDate,
      pixelsPerDay
    };
  }, [currentView, demandData, capacityData, gapsData, chartDimensions, brushInitialized, brushStart, brushEnd]);


  // Synchronize sharedViewport with initialViewport when brush initializes
  React.useEffect(() => {
    if (brushInitialized && (!sharedViewport || !sharedViewport.startDate || Object.keys(sharedViewport.startDate).length === 0)) {
      console.log('🔄 Synchronizing sharedViewport with initialViewport after brush initialization');
      setSharedViewport(initialViewport);
    }
  }, [brushInitialized, initialViewport, sharedViewport]);

  // Reset brush when project changes
  React.useEffect(() => {
    setBrushInitialized(false);
    setSharedViewport(null); // Also reset shared viewport
  }, [projectId]);

  // Initialize brush range when data loads - smart zoom to project duration
  React.useEffect(() => {
    if (processedDataWithGranularity.length > 0 && !brushInitialized) {
      // Get current daily data for initialization
      const currentDailyData = (
        currentView === 'demand' ? demandData :
        currentView === 'capacity' ? capacityData :
        gapsData
      );

      if (currentDailyData.length === 0) return;

      // Calculate smart initial range based on actual phase dates (not assignment dates)
      // Add minimal padding (7 days before and after) for context
      const paddingDays = 7;

      // Get min/max dates directly from phases, not from dateRange (which includes assignments)
      const phaseDates = phases.flatMap(p => [new Date(p.start_date), new Date(p.end_date)]);
      const phaseMinDate = phaseDates.length > 0 ? new Date(Math.min(...phaseDates.map(d => d.getTime()))) : dateRange.start;
      const phaseMaxDate = phaseDates.length > 0 ? new Date(Math.max(...phaseDates.map(d => d.getTime()))) : dateRange.end;

      const targetStartDate = new Date(phaseMinDate);
      const targetEndDate = new Date(phaseMaxDate);

      // Add padding
      targetStartDate.setDate(targetStartDate.getDate() - paddingDays);
      targetEndDate.setDate(targetEndDate.getDate() + paddingDays);

      // Convert dates to indices in the daily data array
      const targetStartStr = targetStartDate.toISOString().split('T')[0];
      const targetEndStr = targetEndDate.toISOString().split('T')[0];

      // Find indices that correspond to these dates
      let initialStart = currentDailyData.findIndex(d => d.date >= targetStartStr);
      let initialEnd = currentDailyData.findIndex(d => d.date > targetEndStr);

      // Fallback to boundaries if not found
      if (initialStart === -1) initialStart = 0;
      if (initialEnd === -1 || initialEnd === 0) initialEnd = currentDailyData.length - 1;
      else initialEnd = initialEnd - 1; // findIndex returns first item AFTER, so subtract 1

      // Ensure we don't exceed array bounds
      initialStart = Math.max(0, initialStart);
      initialEnd = Math.min(currentDailyData.length - 1, initialEnd);

      console.log('🎯 Smart brush initialization:', {
        phaseDateRange: {
          start: phaseMinDate.toISOString().split('T')[0],
          end: phaseMaxDate.toISOString().split('T')[0]
        },
        fullProjectDateRange: {
          start: dateRange.start.toISOString().split('T')[0],
          end: dateRange.end.toISOString().split('T')[0]
        },
        withPadding: {
          start: targetStartStr,
          end: targetEndStr
        },
        brushIndices: { start: initialStart, end: initialEnd },
        dailyDataRange: {
          start: currentDailyData[0]?.date,
          end: currentDailyData[currentDailyData.length - 1]?.date,
          length: currentDailyData.length
        },
        actualBrushRange: {
          start: currentDailyData[initialStart]?.date,
          end: currentDailyData[initialEnd]?.date
        }
      });

      setBrushStart(initialStart);
      setBrushEnd(initialEnd);
      setBrushInitialized(true);

      // Update the viewport to match the brush selection
      handleBrushChange(initialStart, initialEnd);
    }
  }, [processedDataWithGranularity, brushInitialized, currentView, demandData, capacityData, gapsData, dateRange, phases, handleBrushChange]);

  // Measure chart dimensions for phase diagram alignment
  React.useEffect(() => {
    const measureChart = () => {
      if (chartContainerRef.current) {
        const container = chartContainerRef.current;
        const containerRect = container.getBoundingClientRect();
        
        // Look for the actual chart area within the ResponsiveContainer
        const rechartWrapper = container.querySelector('.recharts-wrapper');
        const rechartSurface = container.querySelector('.recharts-surface');
        
        if (rechartSurface && rechartWrapper) {
          const surfaceRect = rechartSurface.getBoundingClientRect();
          const wrapperRect = rechartWrapper.getBoundingClientRect();
          
          // Find the actual chart plotting area (CartesianGrid or first Area element)
          const cartesianGrid = container.querySelector('.recharts-cartesian-grid') || container.querySelector('.recharts-area');
          const yAxisElement = container.querySelector('.recharts-yAxis');
          
          let actualChartLeft = wrapperRect.left - containerRect.left;
          let actualChartWidth = wrapperRect.width;
          
          if (cartesianGrid) {
            const gridRect = cartesianGrid.getBoundingClientRect();
            actualChartLeft = gridRect.left - containerRect.left;
            actualChartWidth = gridRect.width;
          } else if (yAxisElement) {
            // If no grid found, estimate based on Y-axis position
            const yAxisRect = yAxisElement.getBoundingClientRect();
            actualChartLeft = yAxisRect.right - containerRect.left;
            actualChartWidth = wrapperRect.right - yAxisRect.right;
          }
          
          const dimensions = {
            left: actualChartLeft,
            width: Math.max(200, actualChartWidth),
            right: actualChartLeft + actualChartWidth
          };
          
          console.log('📏 Chart dimensions measured (EXACT chart area):', dimensions);
          console.log('📏 Raw measurements:', { 
            surfaceRect: surfaceRect.width, 
            wrapperRect: wrapperRect.width,
            containerRect: containerRect.width,
            actualChartLeft,
            actualChartWidth,
            cartesianGridFound: !!cartesianGrid,
            yAxisFound: !!yAxisElement
          });
          setChartDimensions(dimensions);
        } else {
          // Fallback to container-based calculation
          const fallbackDimensions = {
            left: 20,
            width: Math.max(200, containerRect.width - 50),
            right: containerRect.width - 30
          };
          
          console.log('📏 Using fallback dimensions:', fallbackDimensions);
          setChartDimensions(fallbackDimensions);
        }
      }
    };

    // Measure after data loads and chart renders
    if (processedDataWithGranularity.length > 0) {
      // Wait for chart to render
      const timer = setTimeout(measureChart, 100);
      return () => clearTimeout(timer);
    }
  }, [processedDataWithGranularity]);

  // Create filtered data based on brush selection - now using useChartDisplayData hook
  const { displayData } = useChartDisplayData({
    processedDataWithGranularity,
    demandData,
    capacityData,
    gapsData,
    currentView,
    allRoles,
    brushStart,
    brushEnd
  });


  // Get current dataset for display
  const currentData = displayData;
  
  // Log what data is actually being sent to the chart
  React.useEffect(() => {
    if (currentData.length > 0) {
      console.log('📊 Chart currentData (what X-axis sees):', {
        length: currentData.length,
        start: currentData[0]?.date,
        end: currentData[currentData.length - 1]?.date,
        ALL_DATES: currentData.map(d => d.date),
        context: 'This is what the AreaChart component receives'
      });
    }
  }, [currentData]);



  // Bold colors for each role (cycled if more than 8) - matching phase diagram style
  const roleColors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#ef4444', '#06b6d4', '#84cc16'];


  // Calculate summary stats based on current view
  const { totalRoles, peakValue, avgValue, summaryLabels } = React.useMemo(() => {
    const totalRoles = allRoles.length;
    const peakValue = Math.max(...currentData.map(d => 
      allRoles.reduce((sum, role) => sum + (d[role] || 0), 0)
    ));
    const avgValue = currentData.length > 0 ? 
      currentData.reduce((sum, d) => 
        sum + allRoles.reduce((roleSum, role) => roleSum + (d[role] || 0), 0), 0
      ) / currentData.length : 0;

    // Dynamic labels based on current view
    const summaryLabels = {
      demand: { peak: 'Peak Daily Demand (FTE)', avg: 'Average Daily Demand (FTE)', title: 'Resource Demand Over Time' },
      capacity: { peak: 'Peak Available Capacity (FTE)', avg: 'Average Available Capacity (FTE)', title: 'Available Resource Capacity by Role' },
      gaps: { peak: 'Peak Resource Shortfall (FTE)', avg: 'Average Resource Shortfall (FTE)', title: 'Resource Capacity Gaps (Shortfalls)' }
    };

    return { totalRoles, peakValue, avgValue, summaryLabels: summaryLabels[currentView] };
  }, [currentData, allRoles, currentView]);

  // Loading state
  if (isLoading) {
    return <div>Loading demand data...</div>;
  }

  // Error state
  if (error) {
    return <div>Error loading demand data: {error.message}</div>;
  }

  // No data state
  if (!apiResponse) {
    return <div>No demand data available for this project.</div>;
  }

  return (
    <div className="chart-container">
      <div className="chart-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
          <div>
            <h3>{summaryLabels.title}</h3>
            <p className="chart-subtitle">
              Showing {currentView} by role stacked over project timeline for {projectName}
            </p>
          </div>
          
          {/* View Toggle Buttons */}
          <div className="view-toggle" style={{
            display: 'flex',
            gap: '4px',
            border: '1px solid var(--border-primary)',
            borderRadius: '6px',
            padding: '2px',
            backgroundColor: 'hsl(var(--card))'
          }}>
            {chartViewTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '6px 12px',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  backgroundColor: isActiveTab(tab.id) ? 'hsl(var(--primary))' : 'transparent',
                  color: isActiveTab(tab.id) ? 'white' : 'hsl(var(--muted-foreground))',
                  transition: 'all 0.2s ease'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Phase Timeline Diagram - Integrated above resource chart */}
      <div style={{ marginBottom: '20px' }}>
        <VisualPhaseManager 
          projectId={projectId}
          projectName={projectName}
          compact={true}
          externalViewport={sharedViewport || initialViewport}
          onViewportChange={handleViewportChange}
          alignmentDimensions={chartDimensions || undefined}
          chartTimeData={displayData}
          onPhasesChange={handlePhasesChange}
        />
      </div>

      <div className="chart-content" ref={chartContainerRef}>
        <ResponsiveContainer width="100%" height={400}>
          <AreaChart 
            data={currentData} 
            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="date"
              type="category"
              scale="point"
              interval="preserveStartEnd"
              domain={[
                () => currentData[0]?.date || 'dataMin',
                () => currentData[currentData.length - 1]?.date || 'dataMax'
              ]}
              tickFormatter={(value) => {
                // Find the data point by value to get granularity
                const dataPoint = currentData.find(d => d.date === value) || currentData[0];
                if (!dataPoint) return value;
                
                const granularity = dataPoint.granularity || 'daily';
                
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
                  return 'Q' + Math.ceil(date.getMonth() / 3 + 1) + ' ' + date.getFullYear().toString().slice(-2);
                }
              }}
              angle={-45}
              textAnchor="end"
              height={80}
              fontSize={11}
            />
            <YAxis 
              label={{ value: t('projects:demandChart.fteAxis'), angle: -90, position: 'insideLeft' }}
            />
            <Tooltip 
              formatter={(value: number, name: string) => [`${value?.toFixed(1)} FTE`, name]}
              labelFormatter={(label) => {
                const dataPoint = currentData.find(d => d.date === label);
                if (!dataPoint) return t('projects:demandChart.dateLabel', { date: formatDate(label as string) });
                
                const granularity = dataPoint.granularity || 'daily';
                
                if (granularity === 'weekly') {
                  const startDate = new Date(label);
                  const endDate = new Date(startDate);
                  endDate.setDate(endDate.getDate() + 6);
                  return t('projects:demandChart.weekRange', {
                    start: startDate.toLocaleDateString(getLocale(), { month: 'short', day: 'numeric' }),
                    end: endDate.toLocaleDateString(getLocale(), { month: 'short', day: 'numeric' }),
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
                  return `Q${quarter} ${date.getFullYear()}`;
                }
              }}
              contentStyle={{ 
                backgroundColor: 'hsl(var(--background))', 
                border: '1px solid hsl(var(--border))', 
                borderRadius: '4px' 
              }}
            />
            <Legend />
            
            {/* Stacked areas for each role */}
            {allRoles.map((role, index) => (
              <Area 
                key={role}
                dataKey={role}
                stackId="demand"
                stroke={roleColors[index % roleColors.length]}
                fill={roleColors[index % roleColors.length]}
                name={role}
                connectNulls={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Simple Brush Control with drag handles */}
      {processedDataWithGranularity.length > 2 && (
        <div style={{ 
          marginTop: '20px', 
          marginLeft: '20px',
          width: 'calc(100% - 40px)',
          position: 'relative'
        }}>
          <div style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', marginBottom: '8px' }}>
            Drag the timeline range selectors to focus on specific time periods
          </div>
          <SimpleBrushControl
            data={processedDataWithGranularity}
            dailyData={currentView === 'demand' ? demandData : currentView === 'capacity' ? capacityData : gapsData}
            brushStart={brushStart}
            brushEnd={brushEnd}
            onBrushChange={handleBrushChange}
            // Add some debug info via a comment for the brush component
            // Brush uses: dailyData (Sep 25 - Dec 30, 97 days), indices 0-96
            // Chart uses: processedDataWithGranularity (should also be Sep 25 - Dec 30 with weekly granularity)
          />
        </div>
      )}
      
      <div className="chart-summary">
        <div className="summary-cards">
          <div className="summary-card">
            <div className="summary-value">
              {peakValue.toFixed(1)} FTE
            </div>
            <div className="summary-label">{summaryLabels.peak}</div>
          </div>
          <div className="summary-card">
            <div className="summary-value">
              {avgValue.toFixed(1)} FTE
            </div>
            <div className="summary-label">{summaryLabels.avg}</div>
          </div>
          <div className="summary-card">
            <div className="summary-value">{totalRoles}</div>
            <div className="summary-label">Roles Involved</div>
          </div>
        </div>
      </div>
    </div>
  );
}