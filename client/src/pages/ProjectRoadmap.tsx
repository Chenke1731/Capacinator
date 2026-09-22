import React, { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Calendar, X, ZoomIn, ZoomOut, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../lib/api-client';
import { queryKeys } from '../lib/queryKeys';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import InteractiveTimeline, { TimelineItem, TimelineViewport } from '../components/InteractiveTimeline';
import { getLocale } from '../i18n';
import type { Project } from '../types';
import { parseDate, toISODateString } from '../utils/dateUtils';
import './ProjectRoadmap.css';

interface ProjectWithPhases extends Project {
  phases: ProjectPhaseTimeline[];
}

interface ProjectPhaseTimeline {
  id: string;
  project_id: string;
  phase_id: string;
  phase_name: string;
  phase_order: number;
  start_date: string | number; // Support both date strings and timestamps
  end_date: string | number;   // Support both date strings and timestamps
  color_code?: string;
  created_at: string;
  updated_at: string;
}


interface EditingPhase {
  projectId: string;
  phaseId: string;
  startDate: string;
  endDate: string;
}

// Phase colors matching the existing system
const PHASE_COLORS: Record<string, string> = {
  'business planning': '#3b82f6',
  'development': '#10b981',
  'system integration testing': '#f59e0b',
  'user acceptance testing': '#8b5cf6',
  'validation': '#ec4899',
  'cutover': '#ef4444',
  'hypercare': '#06b6d4',
  'support': '#84cc16',
  'custom': '#6b7280'
};

const getPhaseColor = (phaseName: string): string => {
  const normalizedName = phaseName.toLowerCase();
  return PHASE_COLORS[normalizedName] || PHASE_COLORS['custom'];
};

export default function ProjectRoadmap() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const timelineRef = useRef<HTMLDivElement>(null);
  // Calculate initial viewport with Today at 30% from left
  const calculateInitialViewport = () => {
    const today = new Date();
    const totalDaysToShow = 365 * 2; // Show 2 years total
    const daysBeforeToday = Math.floor(totalDaysToShow * 0.3); // 30% before today
    const daysAfterToday = totalDaysToShow - daysBeforeToday;
    
    const startDate = new Date(today.getTime() - (daysBeforeToday * 24 * 60 * 60 * 1000));
    const endDate = new Date(today.getTime() + (daysAfterToday * 24 * 60 * 60 * 1000));
    
    return {
      startDate,
      endDate,
      pixelsPerDay: 2 // Reduced zoom for wider date range visibility
    };
  };

  const [viewport, setViewport] = useState<TimelineViewport>(calculateInitialViewport());

  // Scroll timeline horizontally
  const scrollTimeline = (direction: 'left' | 'right') => {
    const monthsToShift = 3; // Scroll by 3 months at a time
    const currentSpan = viewport.endDate.getTime() - viewport.startDate.getTime();
    
    if (direction === 'right') {
      // Move forward in time
      const newStartDate = new Date(viewport.startDate);
      newStartDate.setMonth(newStartDate.getMonth() + monthsToShift);
      const newEndDate = new Date(newStartDate.getTime() + currentSpan);
      
      setViewport({
        ...viewport,
        startDate: newStartDate,
        endDate: newEndDate
      });
    } else {
      // Move backward in time
      const newStartDate = new Date(viewport.startDate);
      newStartDate.setMonth(newStartDate.getMonth() - monthsToShift);
      const newEndDate = new Date(newStartDate.getTime() + currentSpan);
      
      setViewport({
        ...viewport,
        startDate: newStartDate,
        endDate: newEndDate
      });
    }
  };

  // Go to today - position Today at 30% from left edge
  const goToToday = () => {
    const today = new Date();
    const currentSpanDays = Math.round((viewport.endDate.getTime() - viewport.startDate.getTime()) / (1000 * 60 * 60 * 24));
    const daysBeforeToday = Math.floor(currentSpanDays * 0.3); // 30% before today
    const daysAfterToday = currentSpanDays - daysBeforeToday;
    
    const newStartDate = new Date(today.getTime() - (daysBeforeToday * 24 * 60 * 60 * 1000));
    const newEndDate = new Date(today.getTime() + (daysAfterToday * 24 * 60 * 60 * 1000));
    
    setViewport({
      ...viewport,
      startDate: newStartDate,
      endDate: newEndDate
    });
  };

  // Handle keyboard navigation
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle navigation when timeline is focused or no input is focused
      if (event.target && (event.target as HTMLElement).tagName === 'INPUT') {
        return;
      }

      switch (event.key) {
        case 'ArrowLeft':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            scrollTimeline('left');
          }
          break;
        case 'ArrowRight':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            scrollTimeline('right');
          }
          break;
        case 'Home':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            goToToday();
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);
  
  const [editingPhase, setEditingPhase] = useState<EditingPhase | null>(null);
  
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    projectType: '',
    owner: ''
  });

  // Convert project phases to timeline items for InteractiveTimeline
  const convertPhasesToTimelineItems = useCallback((project: ProjectWithPhases): TimelineItem[] => {
    return project.phases.map(phase => ({
      id: phase.id,
      name: phase.phase_name,
      startDate: parseDate(phase.start_date),
      endDate: parseDate(phase.end_date),
      color: getPhaseColor(phase.phase_name),
      data: { ...phase, projectId: project.id } // Include project context
    }));
  }, []);
  
  // Debounced filters to prevent excessive API calls
  const [debouncedFilters, setDebouncedFilters] = useState(filters);
  
  // Debounce filter changes to reduce API calls
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilters(filters);
    }, 500); // 500ms debounce delay
    
    return () => clearTimeout(timer);
  }, [filters]);
  

  // Update phase dates mutation for drag operations
  const updatePhaseDragMutation = useMutation({
    mutationFn: async ({ _projectId, phaseId, startDate, endDate }: {
      _projectId: string;
      phaseId: string;
      startDate: string;
      endDate: string;
    }) => {
      return api.projectPhases.update(phaseId, {
        start_date: startDate,
        end_date: endDate
      });
    },
    onError: () => {
      // Revert optimistic update on error
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.roadmap() });
    }
  });

  // Update phase dates mutation for manual editing
  const updatePhaseManualMutation = useMutation({
    mutationFn: async ({ _projectId, phaseId, startDate, endDate }: {
      _projectId: string;
      phaseId: string;
      startDate: string;
      endDate: string;
    }) => {
      return api.projectPhases.update(phaseId, {
        start_date: startDate,
        end_date: endDate
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.roadmap() });
      setEditingPhase(null);
    }
  });

  // Fetch projects with phases
  const { data: projects, isLoading, error } = useQuery({
    queryKey: queryKeys.projects.roadmap(debouncedFilters),
    queryFn: async () => {
      const params = Object.entries(debouncedFilters)
        .filter(([_, value]) => value)
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});

      const response = await api.projects.list(params);
      const projectsData = response.data.data as Project[];

      // Fetch phases for each project
      const projectsWithPhases: ProjectWithPhases[] = await Promise.all(
        projectsData.map(async (project) => {
          const phasesResponse = await api.projectPhases.list({ project_id: project.id });
          const phases = (phasesResponse.data.data || []) as ProjectPhaseTimeline[];

          return {
            ...project,
            phases: phases.sort((a, b) => a.phase_order - b.phase_order)
          };
        })
      );

      return projectsWithPhases;
    }
  });

  // Debounced phase move state to prevent excessive API calls
  const [pendingPhaseUpdates, setPendingPhaseUpdates] = useState<Map<string, {
    projectId: string;
    phaseId: string;
    newStartDate: Date;
    newEndDate: Date;
    timestamp: number;
  }>>(new Map());

  // Process debounced phase updates
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (pendingPhaseUpdates.size === 0) return;

      // Get the most recent update for each phase
      const updatesToProcess = Array.from(pendingPhaseUpdates.values());
      
      updatesToProcess.forEach(update => {
        // Update in backend
        updatePhaseDragMutation.mutate({
          projectId: update.projectId,
          phaseId: update.phaseId,
          startDate: toISODateString(update.newStartDate),
          endDate: toISODateString(update.newEndDate)
        });
      });

      // Clear pending updates
      setPendingPhaseUpdates(new Map());
    }, 150); // 150ms debounce delay for phase moves

    return () => clearTimeout(timer);
  }, [pendingPhaseUpdates, updatePhaseDragMutation]);

  // Handle phase move/resize from InteractiveTimeline
  const handlePhaseMove = useCallback((itemId: string, newStartDate: Date, newEndDate: Date) => {
    
    // Find which project this phase belongs to
    const projectWithPhase = projects?.find(p => p.phases.some(ph => ph.id === itemId));
    if (!projectWithPhase) {
      return;
    }
    

    // Update in-memory state optimistically (immediate UI feedback)
    queryClient.setQueryData(queryKeys.projects.roadmap(debouncedFilters), (oldData: ProjectWithPhases[] | undefined) => {
      if (!oldData) return oldData;

      return oldData.map(project => {
        if (project.id === projectWithPhase.id) {
          return {
            ...project,
            phases: project.phases.map(phase => {
              if (phase.id === itemId) {
                return {
                  ...phase,
                  start_date: toISODateString(newStartDate),
                  end_date: toISODateString(newEndDate)
                };
              }
              return phase;
            })
          };
        }
        return project;
      });
    });

    // Store the update to be processed after debounce delay
    setPendingPhaseUpdates(prev => {
      const newMap = new Map(prev);
      newMap.set(itemId, {
        projectId: projectWithPhase.id,
        phaseId: itemId,
        newStartDate,
        newEndDate,
        timestamp: Date.now()
      });
      return newMap;
    });
  }, [projects, queryClient, debouncedFilters]);

  // Handle phase edit from InteractiveTimeline
  const handlePhaseEdit = useCallback((itemId: string) => {
    const projectWithPhase = projects?.find(p => p.phases.some(ph => ph.id === itemId));
    const phase = projectWithPhase?.phases.find(ph => ph.id === itemId);
    
    if (phase && projectWithPhase) {
      setEditingPhase({
        projectId: projectWithPhase.id,
        phaseId: phase.id,
        startDate: typeof phase.start_date === 'string' ? phase.start_date : toISODateString(new Date(phase.start_date)),
        endDate: typeof phase.end_date === 'string' ? phase.end_date : toISODateString(new Date(phase.end_date))
      });
    }
  }, [projects]);


  // Calculate date position on timeline
  const getDatePosition = useCallback((date: Date) => {
    const diffInMs = date.getTime() - viewport.startDate.getTime();
    const diffInDays = diffInMs / (1000 * 60 * 60 * 24);
    return Math.max(0, diffInDays * viewport.pixelsPerDay);
  }, [viewport]);


  // Handle zoom
  const handleZoom = (direction: 'in' | 'out') => {
    setViewport(prev => ({
      ...prev,
      pixelsPerDay: direction === 'in' 
        ? Math.min(prev.pixelsPerDay * 1.5, 10)
        : Math.max(prev.pixelsPerDay / 1.5, 0.5)
    }));
  };

  // Determine header tier based on zoom level
  const getHeaderTierType = useCallback(() => {
    const pixelsPerDay = viewport.pixelsPerDay;
    
    if (pixelsPerDay <= 1.5) {
      return 'year-quarter'; // Wide view: Year/Quarter
    } else if (pixelsPerDay <= 4) {
      return 'year-month'; // Medium view: Year/Month (current)
    } else {
      return 'month-week'; // Detail view: Month/Week
    }
  }, [viewport.pixelsPerDay]);



  // Save manual edit
  const savePhaseEdit = () => {
    if (editingPhase) {
      updatePhaseManualMutation.mutate(editingPhase);
    }
  };



  // Generate year/quarter headers for wide view
  const generateYearQuarterHeaders = () => {
    const headers = { years: [], quarters: [] };
    const startYear = viewport.startDate.getFullYear();
    const endYear = viewport.endDate.getFullYear();
    
    // Generate year headers
    for (let year = startYear; year <= endYear; year++) {
      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year + 1, 0, 0);
      
      const actualStart = new Date(Math.max(yearStart.getTime(), viewport.startDate.getTime()));
      const actualEnd = new Date(Math.min(yearEnd.getTime(), viewport.endDate.getTime()));
      
      const startPosition = getDatePosition(actualStart);
      const endPosition = getDatePosition(actualEnd);
      const width = endPosition - startPosition;
      
      if (width > 30) { // Minimum width for year label
        headers.years.push(
          <div 
            key={`year-${year}`} 
            className="timeline-header-year"
            style={{ 
              left: startPosition,
              width: width
            }}
          >
            <div className="year-label">{year}</div>
          </div>
        );
      }
    }
    
    // Generate quarter headers
    for (let year = startYear; year <= endYear; year++) {
      for (let quarter = 0; quarter < 4; quarter++) {
        const quarterStart = new Date(year, quarter * 3, 1);
        const quarterEnd = new Date(year, (quarter + 1) * 3, 0);
        
        const actualStart = new Date(Math.max(quarterStart.getTime(), viewport.startDate.getTime()));
        const actualEnd = new Date(Math.min(quarterEnd.getTime(), viewport.endDate.getTime()));
        
        if (actualStart < actualEnd) {
          const startPosition = getDatePosition(actualStart);
          const endPosition = getDatePosition(actualEnd);
          const width = endPosition - startPosition;
          
          if (width > 25) { // Minimum width for quarter label
            headers.quarters.push(
              <div 
                key={`quarter-${year}-${quarter}`} 
                className="timeline-header-quarter"
                style={{ 
                  left: startPosition,
                  width: width
                }}
              >
                <div className="quarter-label">Q{quarter + 1}</div>
              </div>
            );
          }
        }
      }
    }
    
    return headers;
  };

  // Generate year headers
  const generateYearHeaders = () => {
    const yearHeaders = [];
    const startYear = viewport.startDate.getFullYear();
    const endYear = viewport.endDate.getFullYear();
    
    for (let year = startYear; year <= endYear; year++) {
      // Calculate the actual start and end dates for this year within our viewport
      const yearStart = new Date(year, year === startYear ? viewport.startDate.getMonth() : 0, 1);
      const yearEnd = new Date(year, year === endYear ? viewport.endDate.getMonth() + 1 : 12, 0); // Last day of month
      
      // Clamp to viewport bounds
      const actualStart = new Date(Math.max(yearStart.getTime(), viewport.startDate.getTime()));
      const actualEnd = new Date(Math.min(yearEnd.getTime(), viewport.endDate.getTime()));
      
      const startPosition = getDatePosition(actualStart);
      const endPosition = getDatePosition(actualEnd);
      const width = endPosition - startPosition;
      
      if (width > 10) { // Reduced minimum width for debugging
        yearHeaders.push(
          <div 
            key={year} 
            className="timeline-header-year"
            style={{ 
              left: startPosition,
              width: width
            }}
          >
            <div className="year-label">{year}</div>
          </div>
        );
      }
    }
    
    return yearHeaders;
  };

  // Generate timeline header with dates
  const generateTimelineHeader = () => {
    const headers = [];
    const totalDays = (viewport.endDate.getTime() - viewport.startDate.getTime()) / (1000 * 60 * 60 * 24);
    const monthsToShow = Math.ceil(totalDays / 30);
    
    for (let i = 0; i < monthsToShow; i++) {
      const date = new Date(viewport.startDate.getFullYear(), viewport.startDate.getMonth() + i, 1);
      const position = getDatePosition(date);
      const nextDate = new Date(date.getFullYear(), date.getMonth() + 1, 1);
      const width = getDatePosition(nextDate) - position;
      
      headers.push(
        <div 
          key={i} 
          className="timeline-header-month"
          style={{ 
            left: position,
            width: Math.max(width, 60) // Ensure minimum width
          }}
        >
          <div className="month-label">
            {date.toLocaleDateString(getLocale(), { month: 'short' })}
          </div>
        </div>
      );
    }
    
    return headers;
  };

  // Generate month/week headers for detail view
  const generateMonthWeekHeaders = () => {
    const headers = { months: [], weeks: [] };
    const startDate = new Date(viewport.startDate);
    const endDate = new Date(viewport.endDate);
    
    // Generate month headers
    const currentMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    while (currentMonth <= endDate) {
      const nextMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
      
      const actualStart = new Date(Math.max(currentMonth.getTime(), viewport.startDate.getTime()));
      const actualEnd = new Date(Math.min(nextMonth.getTime(), viewport.endDate.getTime()));
      
      if (actualStart < actualEnd) {
        const startPosition = getDatePosition(actualStart);
        const endPosition = getDatePosition(actualEnd);
        const width = endPosition - startPosition;
        
        if (width > 50) { // Minimum width for month label
          headers.months.push(
            <div 
              key={`month-${currentMonth.getFullYear()}-${currentMonth.getMonth()}`} 
              className="timeline-header-month-detail"
              style={{ 
                left: startPosition,
                width: width
              }}
            >
              <div className="month-detail-label">
                {currentMonth.toLocaleDateString(getLocale(), { month: 'long', year: 'numeric' })}
              </div>
            </div>
          );
        }
      }
      
      currentMonth.setMonth(currentMonth.getMonth() + 1);
    }
    
    // Generate week headers
    const currentWeek = new Date(startDate);
    // Move to start of week (Sunday)
    currentWeek.setDate(currentWeek.getDate() - currentWeek.getDay());
    
    while (currentWeek <= endDate) {
      const nextWeek = new Date(currentWeek);
      nextWeek.setDate(nextWeek.getDate() + 7);
      
      const actualStart = new Date(Math.max(currentWeek.getTime(), viewport.startDate.getTime()));
      const actualEnd = new Date(Math.min(nextWeek.getTime(), viewport.endDate.getTime()));
      
      if (actualStart < actualEnd) {
        const startPosition = getDatePosition(actualStart);
        const endPosition = getDatePosition(actualEnd);
        const width = endPosition - startPosition;
        
        if (width > 25) { // Minimum width for week label
          const weekStart = new Date(currentWeek);
          const weekEnd = new Date(currentWeek);
          weekEnd.setDate(weekEnd.getDate() + 6);
          
          headers.weeks.push(
            <div 
              key={`week-${currentWeek.getTime()}`} 
              className="timeline-header-week"
              style={{ 
                left: startPosition,
                width: width
              }}
            >
              <div className="week-label">
                {weekStart.getDate()}-{weekEnd.getDate()}
              </div>
            </div>
          );
        }
      }
      
      currentWeek.setDate(currentWeek.getDate() + 7);
    }
    
    return headers;
  };

  // Generate grid lines aligned to header tiers
  const generateGridLines = () => {
    const gridLines = { major: [], minor: [] };
    const tierType = getHeaderTierType();
    
    if (tierType === 'year-quarter') {
      // Major lines: Year boundaries (match generateYearQuarterHeaders logic)
      const startYear = viewport.startDate.getFullYear();
      const endYear = viewport.endDate.getFullYear();
      
      for (let year = startYear; year <= endYear; year++) {
        // Use same logic as generateYearQuarterHeaders for year positioning
        const yearStart = new Date(year, year === startYear ? viewport.startDate.getMonth() : 0, 1);
        const yearEnd = new Date(year, year === endYear ? viewport.endDate.getMonth() + 1 : 12, 0);
        
        const actualStart = new Date(Math.max(yearStart.getTime(), viewport.startDate.getTime()));
        const actualEnd = new Date(Math.min(yearEnd.getTime(), viewport.endDate.getTime()));
        
        if (actualStart <= actualEnd) {
          const position = getDatePosition(actualStart);
          gridLines.major.push(
            <div
              key={`major-year-${year}`}
              className="timeline-grid-line major"
              style={{ left: position }}
            />
          );
        }
      }
      
      // Minor lines: Quarter boundaries (match generateYearQuarterHeaders logic)
      for (let year = startYear; year <= endYear; year++) {
        for (let quarter = 0; quarter < 4; quarter++) {
          const quarterStart = new Date(year, quarter * 3, 1);
          if (quarterStart >= viewport.startDate && quarterStart <= viewport.endDate) {
            const position = getDatePosition(quarterStart);
            gridLines.minor.push(
              <div
                key={`minor-quarter-${year}-${quarter}`}
                className="timeline-grid-line minor"
                style={{ left: position }}
              />
            );
          }
        }
      }
    } else if (tierType === 'month-week') {
      // Major lines: Month boundaries (match generateMonthWeekHeaders logic)
      const totalDays = (viewport.endDate.getTime() - viewport.startDate.getTime()) / (1000 * 60 * 60 * 24);
      const monthsToShow = Math.ceil(totalDays / 30);
      
      for (let i = 0; i < monthsToShow; i++) {
        const date = new Date(viewport.startDate.getFullYear(), viewport.startDate.getMonth() + i, 1);
        if (date <= viewport.endDate) {
          const position = getDatePosition(date);
          gridLines.major.push(
            <div
              key={`major-month-${i}`}
              className="timeline-grid-line major"
              style={{ left: position }}
            />
          );
        }
      }
      
      // Minor lines: Week boundaries
      const currentWeek = new Date(viewport.startDate);
      currentWeek.setDate(currentWeek.getDate() - currentWeek.getDay()); // Start of week
      
      while (currentWeek <= viewport.endDate) {
        if (currentWeek >= viewport.startDate) {
          const position = getDatePosition(currentWeek);
          gridLines.minor.push(
            <div
              key={`minor-week-${currentWeek.getTime()}`}
              className="timeline-grid-line minor"
              style={{ left: position }}
            />
          );
        }
        currentWeek.setDate(currentWeek.getDate() + 7);
      }
    } else {
      // Default year-month: Major = years, Minor = months (match existing header logic)
      
      // Major lines: Year boundaries (match generateYearHeaders logic)
      const startYear = viewport.startDate.getFullYear();
      const endYear = viewport.endDate.getFullYear();
      
      for (let year = startYear; year <= endYear; year++) {
        // Use same logic as generateYearHeaders
        const yearStart = new Date(year, year === startYear ? viewport.startDate.getMonth() : 0, 1);
        const yearEnd = new Date(year, year === endYear ? viewport.endDate.getMonth() + 1 : 12, 0);
        
        const actualStart = new Date(Math.max(yearStart.getTime(), viewport.startDate.getTime()));
        const actualEnd = new Date(Math.min(yearEnd.getTime(), viewport.endDate.getTime()));
        
        if (actualEnd > actualStart) {
          const position = getDatePosition(actualStart);
          gridLines.major.push(
            <div
              key={`major-year-${year}`}
              className="timeline-grid-line major"
              style={{ left: position }}
            />
          );
        }
      }
      
      // Minor lines: Month boundaries (match generateTimelineHeader logic)
      const totalDays = (viewport.endDate.getTime() - viewport.startDate.getTime()) / (1000 * 60 * 60 * 24);
      const monthsToShow = Math.ceil(totalDays / 30);
      
      for (let i = 0; i < monthsToShow; i++) {
        const date = new Date(viewport.startDate.getFullYear(), viewport.startDate.getMonth() + i, 1);
        if (date <= viewport.endDate) {
          const position = getDatePosition(date);
          gridLines.minor.push(
            <div
              key={`minor-month-${i}`}
              className="timeline-grid-line minor"
              style={{ left: position }}
            />
          );
        }
      }
    }
    
    return gridLines;
  };

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={t('phases:roadmap.loadError')} />;

  // Calculate total timeline width
  const totalDays = (viewport.endDate.getTime() - viewport.startDate.getTime()) / (1000 * 60 * 60 * 24);
  const timelineWidth = totalDays * viewport.pixelsPerDay;

  return (
    <div 
      className="project-roadmap"
      style={{
        '--grid-spacing': `${30 * viewport.pixelsPerDay}px`,
        '--timeline-width': `${timelineWidth}px`
      } as React.CSSProperties}
    >
      <div className="roadmap-header">
        <div className="header-content">
          <h1>
            <Calendar size={24} />
            {t('phases:roadmap.title')}
          </h1>
          <p className="subtitle">
            {t('phases:roadmap.subtitle')}
          </p>
        </div>
        
        <div className="roadmap-controls">
          <div className="search-filters">
            <div className="search-box">
              <Search size={16} />
              <input
                type="text"
                placeholder={t('phases:roadmap.searchProjects')}
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              />
            </div>

            <select
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
            >
              <option value="">{t('phases:roadmap.allStatuses')}</option>
              <option value="planned">{t('enums:projectStatus.planned')}</option>
              <option value="active">{t('enums:projectStatus.active')}</option>
              <option value="on_hold">{t('enums:projectStatus.on_hold')}</option>
              <option value="completed">{t('enums:projectStatus.completed')}</option>
            </select>
          </div>

          <div className="timeline-controls-group">
            <div className="timeline-info">
              <span className="timeline-range">
                {viewport.startDate.toLocaleDateString(getLocale(), { month: 'short', year: 'numeric' })} - {viewport.endDate.toLocaleDateString(getLocale(), { month: 'short', year: 'numeric' })}
              </span>
            </div>

            <div className="navigation-controls">
              <button
                onClick={() => scrollTimeline('left')}
                className="btn btn-sm nav-btn"
                title={t('phases:roadmap.prevMonths')}
              >
                <ChevronLeft size={16} />
              </button>

              <button
                className="btn btn-sm today-btn"
                onClick={goToToday}
                title={t('phases:roadmap.goToToday')}
              >
                {t('phases:timeline.today')}
              </button>

              <button
                onClick={() => scrollTimeline('right')}
                className="btn btn-sm nav-btn"
                title={t('phases:roadmap.nextMonths')}
              >
                <ChevronRight size={16} />
              </button>

              <input
                type="date"
                className="header-date-picker"
                onChange={(e) => {
                  if (e.target.value) {
                    const selectedDate = new Date(e.target.value);
                    const monthsToShow = Math.round((viewport.endDate.getTime() - viewport.startDate.getTime()) / (1000 * 60 * 60 * 24 * 30));
                    const newStartDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth() - Math.floor(monthsToShow / 2), 1);
                    const newEndDate = new Date(newStartDate);
                    newEndDate.setMonth(newEndDate.getMonth() + monthsToShow);
                    
                    setViewport({
                      ...viewport,
                      startDate: newStartDate,
                      endDate: newEndDate
                    });
                  }
                }}
                title={t('phases:roadmap.jumpToDate')}
              />
            </div>

            <div className="view-controls">
              
              <div className="zoom-controls">
                <button onClick={() => handleZoom('out')} className="btn btn-sm" title={t('phases:timeline.zoomOut')}>
                  <ZoomOut size={16} />
                </button>
                <span className="zoom-level">{Math.round(viewport.pixelsPerDay * 50)}%</span>
                <button onClick={() => handleZoom('in')} className="btn btn-sm" title={t('phases:timeline.zoomIn')}>
                  <ZoomIn size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="roadmap-content" style={{ position: 'relative' }}>

        {/* Today Line - Full Height */}
        {(() => {
          const today = new Date();
          const todayPosition = getDatePosition(today);
          
          // Only show today line if it's within the current viewport
          if (todayPosition >= 0 && todayPosition <= timelineWidth) {
            // Calculate proper offset based on actual project info panel
            const projectInfoPanelWidth = 400; // This should match the actual panel width
            const adjustedPosition = projectInfoPanelWidth + todayPosition;
            
            return (
              <div 
                className="today-line-full"
                style={{ 
                  position: 'absolute',
                  left: adjustedPosition,
                  top: 0,
                  bottom: 0,
                  width: '2px',
                  backgroundColor: '#ef4444',
                  zIndex: 999,
                  pointerEvents: 'none'
                }}
                title={t('phases:roadmap.todayTitle', {
                  date: today.toLocaleDateString(getLocale(), {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })
                })}
              >
                <div className="today-line-indicator" style={{
                  position: 'absolute',
                  top: '80px', // Position below the header
                  left: '4px',
                  backgroundColor: '#b91c1c', // 白字 ≥4.5:1(#ef4444 仅 3.9)
                  color: 'white',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  fontSize: '10px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap'
                }}>
                  <span className="today-label">{t('phases:timeline.today')}</span>
                </div>
              </div>
            );
          }
          return null;
        })()}

        <div className="timeline-container" ref={timelineRef}>
          {/* Timeline Header */}
          <div className="timeline-header">
            {(() => {
              const tierType = getHeaderTierType();
              
              if (tierType === 'year-quarter') {
                const headers = generateYearQuarterHeaders();
                return (
                  <>
                    <div className="timeline-years" style={{ width: timelineWidth }}>
                      {headers.years}
                    </div>
                    <div className="timeline-months" style={{ width: timelineWidth }}>
                      {headers.quarters}
                    </div>
                  </>
                );
              } else if (tierType === 'month-week') {
                const headers = generateMonthWeekHeaders();
                return (
                  <>
                    <div className="timeline-years" style={{ width: timelineWidth }}>
                      {headers.months}
                    </div>
                    <div className="timeline-months" style={{ width: timelineWidth }}>
                      {headers.weeks}
                    </div>
                  </>
                );
              } else {
                // Default year-month view
                return (
                  <>
                    <div className="timeline-years" style={{ width: timelineWidth }}>
                      {generateYearHeaders()}
                    </div>
                    <div className="timeline-months" style={{ width: timelineWidth }}>
                      {generateTimelineHeader()}
                    </div>
                  </>
                );
              }
            })()}
          </div>
          
          {/* Grid Lines */}
          {(() => {
            const gridLines = generateGridLines();
            return (
              <>
                {gridLines.major}
                {gridLines.minor}
              </>
            );
          })()}
          
          {/* Project Rows */}
          <div className="projects-timeline">
            {projects?.map((project) => {
              return (
                <div key={project.id} className="project-row">
                  <div className="project-info">
                    <div className="project-header">
                      <div className="project-name-row">
                        <button
                          className="project-name-link"
                          onClick={() => navigate(`/projects/${project.id}`)}
                          title={t('phases:roadmap.projectLinkTitle', { name: project.name })}
                        >
                          {project.name}
                        </button>
                      </div>
                      <div className="project-badges-row">
                        <span
                          className={`priority-badge priority-${project.priority <= 1 ? 'high' : project.priority <= 3 ? 'medium' : 'low'}`}
                          title={t('phases:roadmap.priorityTitle', {
                            level: project.priority <= 1 ? t('phases:roadmap.priorityHigh') : project.priority <= 3 ? t('phases:roadmap.priorityMedium') : t('phases:roadmap.priorityLow'),
                            priority: project.priority
                          })}
                        >
                          {project.priority <= 1 ? 'H' : project.priority <= 3 ? 'M' : 'L'}
                        </span>
                        <span
                          className="project-type-compact"
                          title={t('phases:roadmap.projectTypeTitle', { name: project.project_type?.name || project.project_type_name || t('phases:common.unknown') })}
                          style={{
                            backgroundColor: project.project_type?.color_code ? `${project.project_type.color_code}15` : '#eff6ff',
                            color: project.project_type?.color_code || '#1d4ed8',
                            borderLeft: `2px solid ${project.project_type?.color_code || '#1d4ed8'}`
                          }}
                        >
                          {project.project_type?.name || project.project_type_name || t('phases:common.unknown')}
                        </span>
                        <span
                          className={`project-status-compact status-${(project.status || 'planned').toLowerCase()}`}
                          title={t('phases:roadmap.statusTitle', { status: project.status || t('enums:projectStatus.planned') })}
                        >
                          {project.status || t('enums:projectStatus.planned')}
                        </span>
                        <span
                          className="project-phase-count-inline"
                          title={t('phases:roadmap.phaseCountTitle', { count: project.phases.length })}
                        >
                          {project.phases.length}p
                        </span>
                      </div>
                    </div>
                  </div>
                
                  <div className="project-timeline" style={{ width: timelineWidth }}>
                  {/* Use InteractiveTimeline in roadmap mode for consistent phase visualization */}
                  <InteractiveTimeline
                    items={convertPhasesToTimelineItems(project)}
                    viewport={viewport}
                    mode="roadmap"
                    height={52}
                    onItemMove={handlePhaseMove}
                    onItemResize={handlePhaseMove}
                    onItemEdit={handlePhaseEdit}
                    onItemAdd={(afterItemId, position) => {
                      // Handle phase insertion - for now just log
                      // TODO: Implement phase insertion functionality
                    }}
                    showGrid={false} // Grid is handled by the parent timeline
                    showToday={false} // Today line is handled by the parent
                    allowOverlap={false}
                    minItemDuration={1}
                    style={{
                      border: 'none',
                      backgroundColor: 'transparent'
                    }}
                  />
                </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Edit Phase Modal */}
      {editingPhase && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div className="modal-header">
              <h3>{t('phases:roadmap.editPhaseDates')}</h3>
              <button onClick={() => setEditingPhase(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-content">
              <div className="form-group">
                <label>{t('common:startDate')}</label>
                <input
                  type="date"
                  value={editingPhase.startDate}
                  onChange={(e) => setEditingPhase(prev => prev ? { ...prev, startDate: e.target.value } : null)}
                />
              </div>

              <div className="form-group">
                <label>{t('common:endDate')}</label>
                <input
                  type="date"
                  value={editingPhase.endDate}
                  onChange={(e) => setEditingPhase(prev => prev ? { ...prev, endDate: e.target.value } : null)}
                />
              </div>
            </div>

            <div className="modal-actions">
              <button onClick={() => setEditingPhase(null)} className="btn btn-secondary">
                {t('common:cancel')}
              </button>
              <button onClick={savePhaseEdit} className="btn btn-primary">
                {t('phases:common.saveChanges')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}