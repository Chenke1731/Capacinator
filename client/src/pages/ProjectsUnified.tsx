import React from 'react';
import { FolderKanban, GanttChart, Palette } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// Import existing page components
import { Projects } from './Projects';
import ProjectRoadmap from './ProjectRoadmap';
import ProjectTypes from './ProjectTypes';

// Import the new unified tab component
import { UnifiedTabComponent, type UnifiedTabConfig } from '../components/ui/UnifiedTabComponent';

// CSS imports
import './Projects.css';
import './ProjectRoadmap.css';
import './ProjectTypes.css';

// ProjectsTab type intentionally not exported, used internally for tab configuration

export default function ProjectsUnified() {
  const { t } = useTranslation();

  // Tab labels are defined inside the component so they re-evaluate on language switch
  const tabs: UnifiedTabConfig[] = [
    {
      id: 'list',
      label: t('projects:title'),
      icon: FolderKanban,
      component: Projects
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
      defaultTab="list"
      paramName="tab"
      orientation="horizontal"
      variant="primary"
      size="md"
      ariaLabel={t('projects:tabs.ariaLabel')}
      className="projects-unified-container"
    />
  );
}
