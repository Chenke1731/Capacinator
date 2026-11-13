import { renderHook } from '@testing-library/react';
import {
  useAssignmentRecommendations,
  PersonWithAssignments,
  Project,
  Role,
  ProjectAllocation,
} from '../useAssignmentRecommendations';

describe('useAssignmentRecommendations', () => {
  // Mock data factories
  const createMockPerson = (
    overrides: Partial<PersonWithAssignments> = {}
  ): PersonWithAssignments => ({
    id: 'person-1',
    name: 'Test Person',
    default_availability_percentage: 100,
    assignments: [],
    roles: [{ role_id: 'role-1', is_primary: true }],
    ...overrides,
  });

  const createMockProject = (overrides: Partial<Project> = {}): Project => ({
    id: 'project-1',
    name: 'Test Project',
    priority: 1,
    ...overrides,
  });

  const createMockRole = (overrides: Partial<Role> = {}): Role => ({
    id: 'role-1',
    name: 'Developer',
    ...overrides,
  });

  const createMockAllocation = (
    overrides: Partial<ProjectAllocation> = {}
  ): ProjectAllocation => ({
    projectId: 'project-1',
    allocations: [
      {
        role_id: 'role-1',
        allocation_percentage: 50,
      },
    ],
    ...overrides,
  });

  describe('utilizationData calculation', () => {
    it('returns default utilization when person is null', () => {
      const { result } = renderHook(() =>
        useAssignmentRecommendations({
          person: null,
          projects: [],
          roles: [],
          allProjectAllocations: [],
          isLoadingAllocations: false,
        })
      );

      expect(result.current.utilizationData).toEqual({
        currentUtilization: 0,
        availability: 100,
        remainingCapacity: 100,
        totalAllocation: 0,
      });
    });

    it('calculates utilization from active assignments', () => {
      const today = new Date().toISOString().split('T')[0];
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      const pastDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      const person = createMockPerson({
        default_availability_percentage: 100,
        assignments: [
          {
            id: 'a1',
            project_id: 'p1',
            role_id: 'r1',
            allocation_percentage: 40,
            start_date: pastDate,
            end_date: futureDate,
          },
          {
            id: 'a2',
            project_id: 'p2',
            role_id: 'r2',
            allocation_percentage: 30,
            start_date: pastDate,
            end_date: futureDate,
          },
        ],
      });

      const { result } = renderHook(() =>
        useAssignmentRecommendations({
          person,
          projects: [],
          roles: [],
          allProjectAllocations: [],
          isLoadingAllocations: false,
        })
      );

      expect(result.current.utilizationData.currentUtilization).toBe(70);
      expect(result.current.utilizationData.remainingCapacity).toBe(30);
    });

    it('uses computed dates if available', () => {
      const today = new Date().toISOString().split('T')[0];
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      const pastDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      const person = createMockPerson({
        assignments: [
          {
            id: 'a1',
            project_id: 'p1',
            role_id: 'r1',
            allocation_percentage: 50,
            start_date: '2099-01-01', // Far future, would not be active
            end_date: '2099-12-31',
            computed_start_date: pastDate, // Override with active dates
            computed_end_date: futureDate,
          },
        ],
      });

      const { result } = renderHook(() =>
        useAssignmentRecommendations({
          person,
          projects: [],
          roles: [],
          allProjectAllocations: [],
          isLoadingAllocations: false,
        })
      );

      expect(result.current.utilizationData.currentUtilization).toBe(50);
    });

    it('counts assignments without dates as ongoing (controller/view semantics)', () => {
      const person = createMockPerson({
        assignments: [
          {
            id: 'a1',
            project_id: 'p1',
            role_id: 'r1',
            allocation_percentage: 50,
            // No dates set
          },
        ],
      });

      const { result } = renderHook(() =>
        useAssignmentRecommendations({
          person,
          projects: [],
          roles: [],
          allProjectAllocations: [],
          isLoadingAllocations: false,
        })
      );

      expect(result.current.utilizationData.currentUtilization).toBe(50);
      expect(result.current.utilizationData.totalAllocation).toBe(50);
    });

    it('excludes paused assignments and computes utilization relative to availability', () => {
      const past = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const future = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      const person = createMockPerson({
        default_availability_percentage: 50,
        assignments: [
          {
            id: 'a1',
            project_id: 'p1',
            role_id: 'r1',
            allocation_percentage: 40,
            status: 'active',
            computed_start_date: past,
            computed_end_date: future,
          },
          {
            id: 'a2',
            project_id: 'p2',
            role_id: 'r1',
            allocation_percentage: 30,
            status: 'paused',
            computed_start_date: past,
            computed_end_date: future,
          },
        ],
      });

      const { result } = renderHook(() =>
        useAssignmentRecommendations({
          person,
          projects: [],
          roles: [],
          allProjectAllocations: [],
          isLoadingAllocations: false,
        })
      );

      // active 40 / availability 50 = 80%；paused 30 不参与
      expect(result.current.utilizationData.totalAllocation).toBe(40);
      expect(result.current.utilizationData.currentUtilization).toBe(80);
      expect(result.current.utilizationData.activeAssignments?.map((a) => a.id)).toEqual(['a1']);
    });

    it('does not fall back to 100 when availability is explicit 0', () => {
      const past = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const future = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      const person = createMockPerson({
        default_availability_percentage: 0,
        assignments: [
          {
            id: 'a1',
            project_id: 'p1',
            role_id: 'r1',
            allocation_percentage: 40,
            status: 'active',
            computed_start_date: past,
            computed_end_date: future,
          },
        ],
      });

      const { result } = renderHook(() =>
        useAssignmentRecommendations({
          person,
          projects: [],
          roles: [],
          allProjectAllocations: [],
          isLoadingAllocations: false,
        })
      );

      expect(result.current.utilizationData.availability).toBe(0);
      expect(result.current.utilizationData.totalAllocation).toBe(40);
    });

    it('uses default availability when not specified', () => {
      const person = createMockPerson({
        default_availability_percentage: undefined,
      });

      const { result } = renderHook(() =>
        useAssignmentRecommendations({
          person,
          projects: [],
          roles: [],
          allProjectAllocations: [],
          isLoadingAllocations: false,
        })
      );

      expect(result.current.utilizationData.availability).toBe(100);
    });
  });

  describe('projectsWithDemand filtering', () => {
    it('returns all projects when allocations are loading', () => {
      const projects = [
        createMockProject({ id: 'p1', name: 'Project 1' }),
        createMockProject({ id: 'p2', name: 'Project 2' }),
      ];

      const { result } = renderHook(() =>
        useAssignmentRecommendations({
          person: createMockPerson(),
          projects,
          roles: [],
          allProjectAllocations: null,
          isLoadingAllocations: true,
        })
      );

      expect(result.current.projectsWithDemand).toHaveLength(2);
    });

    it('filters to only projects with positive allocations', () => {
      const projects = [
        createMockProject({ id: 'p1', name: 'Project With Demand' }),
        createMockProject({ id: 'p2', name: 'Project Without Demand' }),
      ];

      const allocations: ProjectAllocation[] = [
        {
          projectId: 'p1',
          allocations: [{ role_id: 'r1', allocation_percentage: 50 }],
        },
        {
          projectId: 'p2',
          allocations: [{ role_id: 'r1', allocation_percentage: 0 }],
        },
      ];

      const { result } = renderHook(() =>
        useAssignmentRecommendations({
          person: createMockPerson(),
          projects,
          roles: [],
          allProjectAllocations: allocations,
          isLoadingAllocations: false,
        })
      );

      expect(result.current.projectsWithDemand).toHaveLength(1);
      expect(result.current.projectsWithDemand[0].id).toBe('p1');
    });

    it('adds required_roles to projects with demand', () => {
      const projects = [createMockProject({ id: 'p1' })];
      const allocations: ProjectAllocation[] = [
        {
          projectId: 'p1',
          allocations: [
            { role_id: 'role-1', allocation_percentage: 30 },
            { role_id: 'role-2', allocation_percentage: 20 },
            { role_id: 'role-3', allocation_percentage: 0 },
          ],
        },
      ];

      const { result } = renderHook(() =>
        useAssignmentRecommendations({
          person: createMockPerson(),
          projects,
          roles: [],
          allProjectAllocations: allocations,
          isLoadingAllocations: false,
        })
      );

      expect(result.current.projectsWithDemand[0].required_roles).toEqual([
        'role-1',
        'role-2',
      ]);
    });
  });

  describe('recommendations generation', () => {
    it('returns empty array when no person', () => {
      const { result } = renderHook(() =>
        useAssignmentRecommendations({
          person: null,
          projects: [createMockProject()],
          roles: [createMockRole()],
          allProjectAllocations: [createMockAllocation()],
          isLoadingAllocations: false,
        })
      );

      expect(result.current.recommendations).toEqual([]);
    });

    it('returns empty array when no projects with demand', () => {
      const { result } = renderHook(() =>
        useAssignmentRecommendations({
          person: createMockPerson(),
          projects: [],
          roles: [createMockRole()],
          allProjectAllocations: [],
          isLoadingAllocations: false,
        })
      );

      expect(result.current.recommendations).toEqual([]);
    });

    it('skips projects already assigned to the person', () => {
      const pastDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      const person = createMockPerson({
        assignments: [
          {
            id: 'a1',
            project_id: 'p1',
            role_id: 'role-1',
            allocation_percentage: 50,
            start_date: pastDate,
            end_date: futureDate,
          },
        ],
      });

      const projects = [createMockProject({ id: 'p1', name: 'Already Assigned' })];
      const allocations = [createMockAllocation({ projectId: 'p1' })];

      const { result } = renderHook(() =>
        useAssignmentRecommendations({
          person,
          projects,
          roles: [createMockRole()],
          allProjectAllocations: allocations,
          isLoadingAllocations: false,
        })
      );

      expect(result.current.recommendations).toHaveLength(0);
    });

    it('generates recommendations with matching roles', () => {
      const person = createMockPerson({
        roles: [{ role_id: 'role-1', is_primary: true }],
      });

      const projects = [createMockProject({ id: 'p1' })];
      const roles = [createMockRole({ id: 'role-1', name: 'Developer' })];
      const allocations: ProjectAllocation[] = [
        {
          projectId: 'p1',
          allocations: [{ role_id: 'role-1', allocation_percentage: 50 }],
        },
      ];

      const { result } = renderHook(() =>
        useAssignmentRecommendations({
          person,
          projects,
          roles,
          allProjectAllocations: allocations,
          isLoadingAllocations: false,
        })
      );

      expect(result.current.recommendations).toHaveLength(1);
      expect(result.current.recommendations[0].project.id).toBe('p1');
      expect(result.current.recommendations[0].suggestedRole.id).toBe('role-1');
    });

    it('prefers primary role when matching', () => {
      const person = createMockPerson({
        roles: [
          { role_id: 'role-1', is_primary: false },
          { role_id: 'role-2', is_primary: true },
        ],
      });

      const projects = [createMockProject({ id: 'p1' })];
      const roles = [
        createMockRole({ id: 'role-1', name: 'Junior Dev' }),
        createMockRole({ id: 'role-2', name: 'Senior Dev' }),
      ];
      const allocations: ProjectAllocation[] = [
        {
          projectId: 'p1',
          allocations: [
            { role_id: 'role-1', allocation_percentage: 30 },
            { role_id: 'role-2', allocation_percentage: 30 },
          ],
        },
      ];

      const { result } = renderHook(() =>
        useAssignmentRecommendations({
          person,
          projects,
          roles,
          allProjectAllocations: allocations,
          isLoadingAllocations: false,
        })
      );

      expect(result.current.recommendations[0].suggestedRole.id).toBe('role-2');
    });

    it('calculates fit levels correctly', () => {
      const person = createMockPerson({
        roles: [
          { role_id: 'role-1', is_primary: true },
          { role_id: 'role-2', is_primary: false },
        ],
      });

      const projects = [createMockProject({ id: 'p1' })];
      const roles = [
        createMockRole({ id: 'role-1', name: 'Dev 1' }),
        createMockRole({ id: 'role-2', name: 'Dev 2' }),
      ];
      const allocations: ProjectAllocation[] = [
        {
          projectId: 'p1',
          allocations: [
            { role_id: 'role-1', allocation_percentage: 30 },
            { role_id: 'role-2', allocation_percentage: 30 },
          ],
        },
      ];

      const { result } = renderHook(() =>
        useAssignmentRecommendations({
          person,
          projects,
          roles,
          allProjectAllocations: allocations,
          isLoadingAllocations: false,
        })
      );

      // Person has both roles project needs = 100% match = excellent fit
      expect(result.current.recommendations[0].fitLevel).toBe('excellent');
    });

    it('limits recommendations to top 5', () => {
      const person = createMockPerson({
        roles: [{ role_id: 'role-1', is_primary: true }],
      });

      const projects = Array.from({ length: 10 }, (_, i) =>
        createMockProject({ id: `p${i}`, name: `Project ${i}`, priority: i + 1 })
      );
      const roles = [createMockRole({ id: 'role-1', name: 'Developer' })];
      const allocations = projects.map((p) => ({
        projectId: p.id,
        allocations: [{ role_id: 'role-1', allocation_percentage: 50 }],
      }));

      const { result } = renderHook(() =>
        useAssignmentRecommendations({
          person,
          projects,
          roles,
          allProjectAllocations: allocations,
          isLoadingAllocations: false,
        })
      );

      expect(result.current.recommendations).toHaveLength(5);
    });

    it('sorts recommendations by score then priority', () => {
      const person = createMockPerson({
        roles: [{ role_id: 'role-1', is_primary: true }],
      });

      const projects = [
        createMockProject({ id: 'p1', name: 'Low Priority', priority: 3 }),
        createMockProject({ id: 'p2', name: 'High Priority', priority: 1 }),
      ];
      const roles = [createMockRole({ id: 'role-1', name: 'Developer' })];
      const allocations = projects.map((p) => ({
        projectId: p.id,
        allocations: [{ role_id: 'role-1', allocation_percentage: 50 }],
      }));

      const { result } = renderHook(() =>
        useAssignmentRecommendations({
          person,
          projects,
          roles,
          allProjectAllocations: allocations,
          isLoadingAllocations: false,
        })
      );

      // Both have same score, so priority should decide order
      expect(result.current.recommendations[0].project.priority).toBe(1);
      expect(result.current.recommendations[1].project.priority).toBe(3);
    });

    it('uses priority-based scoring for projects without role requirements', () => {
      const person = createMockPerson({
        roles: [{ role_id: 'role-1', is_primary: true }],
      });

      const projects = [
        createMockProject({ id: 'p1', priority: 1 }), // High priority
      ];
      const roles = [createMockRole({ id: 'role-1', name: 'Developer' })];
      // No role requirements in allocations - just allocations with different role
      const allocations: ProjectAllocation[] = [
        {
          projectId: 'p1',
          allocations: [{ role_id: 'other-role', allocation_percentage: 50 }],
        },
      ];

      const { result } = renderHook(() =>
        useAssignmentRecommendations({
          person,
          projects,
          roles,
          allProjectAllocations: allocations,
          isLoadingAllocations: false,
          actionType: 'assign_project', // This allows assignment even without role match
        })
      );

      expect(result.current.recommendations).toHaveLength(1);
    });

    it('calculates suggested allocation based on remaining capacity', () => {
      const today = new Date().toISOString().split('T')[0];
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      const pastDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      const person = createMockPerson({
        default_availability_percentage: 100,
        assignments: [
          {
            id: 'a1',
            project_id: 'existing-project',
            role_id: 'role-1',
            allocation_percentage: 80,
            start_date: pastDate,
            end_date: futureDate,
          },
        ],
        roles: [{ role_id: 'role-1', is_primary: true }],
      });

      const projects = [createMockProject({ id: 'p1', priority: 1 })];
      const roles = [createMockRole({ id: 'role-1', name: 'Developer' })];
      const allocations: ProjectAllocation[] = [
        {
          projectId: 'p1',
          allocations: [{ role_id: 'role-1', allocation_percentage: 50 }],
        },
      ];

      const { result } = renderHook(() =>
        useAssignmentRecommendations({
          person,
          projects,
          roles,
          allProjectAllocations: allocations,
          isLoadingAllocations: false,
        })
      );

      // Person has 20% remaining capacity, high priority project would suggest 60%
      // But it's capped at 20%
      expect(result.current.recommendations[0].suggestedAllocation).toBe(20);
    });
  });

  describe('edge cases', () => {
    it('handles null/undefined inputs gracefully', () => {
      const { result } = renderHook(() =>
        useAssignmentRecommendations({
          person: undefined,
          projects: undefined,
          roles: undefined,
          allProjectAllocations: undefined,
          isLoadingAllocations: false,
        })
      );

      expect(result.current.recommendations).toEqual([]);
      expect(result.current.projectsWithDemand).toEqual([]);
      expect(result.current.utilizationData).toEqual({
        currentUtilization: 0,
        availability: 100,
        remainingCapacity: 100,
        totalAllocation: 0,
      });
    });

    it('handles empty arrays', () => {
      const { result } = renderHook(() =>
        useAssignmentRecommendations({
          person: createMockPerson({ assignments: [], roles: [] }),
          projects: [],
          roles: [],
          allProjectAllocations: [],
          isLoadingAllocations: false,
        })
      );

      expect(result.current.recommendations).toEqual([]);
      expect(result.current.projectsWithDemand).toEqual([]);
    });

    it('handles person with no roles', () => {
      const person = createMockPerson({
        roles: undefined,
      });

      const projects = [createMockProject({ id: 'p1' })];
      const roles = [createMockRole({ id: 'role-1', name: 'Developer' })];
      const allocations: ProjectAllocation[] = [
        {
          projectId: 'p1',
          allocations: [{ role_id: 'role-1', allocation_percentage: 50 }],
        },
      ];

      const { result } = renderHook(() =>
        useAssignmentRecommendations({
          person,
          projects,
          roles,
          allProjectAllocations: allocations,
          isLoadingAllocations: false,
          actionType: 'assign_project',
        })
      );

      // Should still work, just with fallback role
      expect(result.current.recommendations).toHaveLength(1);
      expect(result.current.recommendations[0].suggestedRole.id).toBe('role-1');
    });
  });
});
