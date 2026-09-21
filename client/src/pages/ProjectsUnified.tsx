import React from 'react';
import { FolderKanban, GanttChart, Palette, Inbox, ListTodo } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// Import existing page components
import { Projects } from './Projects';
import { TicketsBoard } from './TicketsBoard';
import { AffairsBoard } from './AffairsBoard';
import ProjectRoadmap from './ProjectRoadmap';
import ProjectTypes from './ProjectTypes';

// Import the new unified tab component
import { UnifiedTabComponent, type UnifiedTabConfig } from '../components/ui/UnifiedTabComponent';

// CSS imports
import './Projects.css';
import './ProjectRoadmap.css';
import './ProjectTypes.css';

/**
 * 项目导航分流 (2026-09-21 裁决: 计算同权, 呈现分流)。
 * tab 注册表驱动——新类别在 lib/projectCategories.ts 加一行, 这里加一个 tab。
 */
export default function ProjectsUnified() {
  const { t } = useTranslation();

  // Tab labels are defined inside the component so they re-evaluate on language switch
  const tabs: UnifiedTabConfig[] = [
    {
      id: 'demand',
      label: t('projects:tabs.demand'),
      icon: FolderKanban,
      component: Projects
    },
    {
      id: 'tickets',
      label: t('projects:tabs.tickets'),
      icon: Inbox,
      component: TicketsBoard
    },
    {
      id: 'affairs',
      label: t('projects:tabs.affairs'),
      icon: ListTodo,
      component: AffairsBoard
    },
    {
      id: 'roadmap',
      label: t('projects:tabs.roadmap'),
      icon: GanttChart,
      component: ProjectRoadmap
    },
    {
      id: 'types',
      label: t('projects:tabs.projectTypes'),
      icon: Palette,
      component: ProjectTypes
    }
  ];

  return (
    <UnifiedTabComponent
      tabs={tabs}
      defaultTab="demand"
      paramName="tab"
      orientation="horizontal"
      variant="primary"
      size="md"
      ariaLabel={t('projects:tabs.ariaLabel')}
      className="projects-unified-container"
    />
  );
}
