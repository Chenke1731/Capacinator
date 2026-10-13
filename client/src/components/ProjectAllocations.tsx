import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import { queryKeys } from '../lib/queryKeys';
import { Edit2, RotateCcw, Save, X } from 'lucide-react';
import { getProjectTypeIndicatorStyle } from '../lib/project-colors';
import type { ProjectAllocationItem } from '../types';
import type { Project } from '../types';
import './ProjectAllocations.css';

interface ProjectAllocation {
  id: string;
  project_id: string;
  phase_id: string;
  role_id: string;
  allocation_percentage: number;
  is_inherited: boolean;
  template_id?: string;
  notes?: string;
  phase_name: string;
  role_name: string;
  phase_order: number;
  original_percentage?: number;
}

interface ProjectAllocationsProps {
  projectId: string;
  projectName: string;
  onClose?: () => void;
}

export const ProjectAllocations: React.FC<ProjectAllocationsProps> = ({ 
  projectId, 
  projectName, 
  onClose 
}) => {
  const queryClient = useQueryClient();
  const [editingAllocation, setEditingAllocation] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<number>(0);
  const [editNotes, setEditNotes] = useState<string>('');

  // Fetch project data for type color
  const { data: project } = useQuery({
    queryKey: queryKeys.projects.detail(projectId),
    queryFn: async () => {
      const response = await api.projects.get(projectId);
      // sendSuccess 信封(2026-10-13 批清): 原先单层解包拿到的是信封壳,
      // project_type_name 等字段从未真正读到
      const rawProject = (response.data as any).data as Project;
      
      // Transform flat response to include project_type object
      return {
        ...rawProject,
        project_type: rawProject.project_type_name ? {
          id: rawProject.project_type_id,
          name: rawProject.project_type_name,
          color_code: rawProject.project_type_color_code
        } : undefined
      } as Project;
    },
    enabled: !!projectId
  });

  // Fetch project allocations
  const { data: allocationData, isLoading, error } = useQuery({
    queryKey: queryKeys.projectAllocations.byProject(projectId),
    queryFn: async () => {
      const response = await api.projectAllocations.get(projectId);
      return response.data.data;
      // 信封 {success,data:{allocations,summary}}(2026-10-13 批清):
    },
    enabled: !!projectId
  });

  // Override allocation mutation
  const overrideAllocationMutation = useMutation({
    mutationFn: async (data: { phase_id: string; role_id: string; allocation_percentage: number; notes?: string }) => {
      return api.projectAllocations.override(projectId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectAllocations.byProject(projectId) });
      setEditingAllocation(null);
      setEditValue(0);
      setEditNotes('');
    }
  });

  // Reset allocation mutation
  const resetAllocationMutation = useMutation({
    mutationFn: async (data: { phaseId: string; roleId: string }) => {
      return api.projectAllocations.reset(projectId, data.phaseId, data.roleId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectAllocations.byProject(projectId) });
    }
  });

  const handleEdit = (allocation: ProjectAllocation) => {
    setEditingAllocation(`${allocation.phase_id}-${allocation.role_id}`);
    setEditValue(allocation.allocation_percentage);
    setEditNotes(allocation.notes || '');
  };

  const handleSave = (allocation: ProjectAllocation) => {
    overrideAllocationMutation.mutate({
      phase_id: allocation.phase_id,
      role_id: allocation.role_id,
      allocation_percentage: editValue,
      notes: editNotes
    });
  };

  const handleCancel = () => {
    setEditingAllocation(null);
    setEditValue(0);
    setEditNotes('');
  };

  const handleReset = (allocation: ProjectAllocation) => {
    if (confirm(`Reset "${allocation.role_name}" in "${allocation.phase_name}" back to inherited value?`)) {
      resetAllocationMutation.mutate({
        phaseId: allocation.phase_id,
        roleId: allocation.role_id
      });
    }
  };

  if (isLoading) {
    return (
      <div className="project-allocations-loading">
        <p>Loading project allocations...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="project-allocations-error">
        <p>Error loading project allocations: {error.message}</p>
      </div>
    );
  }

  const allocations = allocationData?.allocations || [];
  const summary = allocationData?.summary || {};

  // Group allocations by phase
  const allocationsByPhase = allocations.reduce((acc: any, allocation: ProjectAllocation | ProjectAllocationItem) => {
    if (!acc[allocation.phase_id]) {
      acc[allocation.phase_id] = {
        phase_name: allocation.phase_name,
        phase_order: allocation.phase_order,
        allocations: []
      };
    }
    acc[allocation.phase_id].allocations.push(allocation);
    return acc;
  }, {});

  const sortedPhases = Object.values(allocationsByPhase).sort((a: any, b: any) => a.phase_order - b.phase_order);

  return (
    <div className="project-allocations">
      <div className="project-allocations-header">
        <h2 style={{ display: 'flex', alignItems: 'center' }}>
          {project && <div style={getProjectTypeIndicatorStyle(project)} />}
          Project Allocations: {projectName}
        </h2>
        <p className="allocation-summary">
          {summary.total_allocations} allocations 
          ({summary.inherited_count} inherited, {summary.overridden_count} overridden)
        </p>
        {onClose && (
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            <X size={16} />
            Close
          </button>
        )}
      </div>

      <div className="allocation-legend">
        <span className="legend-item">
          <span className="legend-color inherited"></span>
          <span>Inherited from project type</span>
        </span>
        <span className="legend-item">
          <span className="legend-color overridden"></span>
          <span>Overridden for this project</span>
        </span>
      </div>

      <div className="allocations-by-phase">
        {sortedPhases.map((phase: any) => (
          <div key={phase.phase_name} className="phase-section">
            <h3 className="phase-title">{phase.phase_name}</h3>
            <div className="allocations-grid">
              {phase.allocations.map((allocation: ProjectAllocation) => {
                const isEditing = editingAllocation === `${allocation.phase_id}-${allocation.role_id}`;
                const hasChanged = allocation.original_percentage && 
                  allocation.allocation_percentage !== allocation.original_percentage;

                return (
                  <div 
                    key={`${allocation.phase_id}-${allocation.role_id}`}
                    className={`allocation-card ${allocation.is_inherited ? 'inherited' : 'overridden'}`}
                  >
                    <div className="allocation-header">
                      <h4>{allocation.role_name}</h4>
                      <div className="allocation-actions">
                        {!isEditing && (
                          <>
                            <button
                              className="btn btn-icon btn-sm"
                              onClick={() => handleEdit(allocation)}
                              title="Edit allocation"
                            >
                              <Edit2 size={14} />
                            </button>
                            {!allocation.is_inherited && (
                              <button
                                className="btn btn-icon btn-sm"
                                onClick={() => handleReset(allocation)}
                                title="Reset to inherited value"
                              >
                                <RotateCcw size={14} />
                              </button>
                            )}
                          </>
                        )}
                        {isEditing && (
                          <>
                            <button
                              className="btn btn-icon btn-sm btn-primary"
                              onClick={() => handleSave(allocation)}
                              disabled={overrideAllocationMutation.isPending}
                            >
                              <Save size={14} />
                            </button>
                            <button
                              className="btn btn-icon btn-sm btn-secondary"
                              onClick={handleCancel}
                            >
                              <X size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    
                    <div className="allocation-content">
                      {isEditing ? (
                        <div className="allocation-edit">
                          <div className="form-group">
                            <label>Allocation Percentage</label>
                            <div className="percentage-input">
                              <input
                                type="number"
                                value={editValue}
                                onChange={(e) => setEditValue(parseFloat(e.target.value) || 0)}
                                min="0"
                                max="100"
                                step="5"
                                className="form-input"
                              />
                              <span>%</span>
                            </div>
                          </div>
                          <div className="form-group">
                            <label>Notes</label>
                            <textarea
                              value={editNotes}
                              onChange={(e) => setEditNotes(e.target.value)}
                              className="form-input"
                              rows={2}
                              placeholder="Optional notes about this override"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="allocation-display">
                          <div className="allocation-percentage">
                            {allocation.allocation_percentage}%
                          </div>
                          {hasChanged && (
                            <div className="original-percentage">
                              (was {allocation.original_percentage}%)
                            </div>
                          )}
                          {allocation.notes && (
                            <div className="allocation-notes">
                              {allocation.notes}
                            </div>
                          )}
                          <div className="allocation-status">
                            {allocation.is_inherited ? 'Inherited' : 'Overridden'}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProjectAllocations;