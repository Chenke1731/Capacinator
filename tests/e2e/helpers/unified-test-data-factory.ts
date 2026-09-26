/**
 * Unified Test Data Factory
 *
 * Consolidates all test data generation into a single, consistent API.
 * Features:
 * - Automatic cleanup tracking for all created entities
 * - Retry logic for API failures
 * - Consistent naming with test prefixes
 * - Pre-built test scenarios for common use cases
 * - Type-safe entity creation
 *
 * @example
 * ```typescript
 * const factory = new UnifiedTestDataFactory(apiContext, 'my-test');
 *
 * // Create individual entities
 * const person = await factory.createPerson({ name: 'John Doe' });
 * const project = await factory.createProject({ name: 'My Project' });
 *
 * // Or use pre-built scenarios
 * const data = await factory.scenarios.utilization();
 *
 * // Cleanup is automatic when using fixtures, or call manually:
 * await factory.cleanup();
 * ```
 */

import { APIRequestContext } from '@playwright/test';

// ============================================================================
// Types
// ============================================================================

export interface Person {
  id?: string;
  name: string;
  email?: string;
  location_id?: string;
  primary_role_id?: string;
  worker_type?: 'FTE' | 'Contractor' | 'Consultant';
  default_availability_percentage?: number;
  default_hours_per_day?: number;
  start_date?: string;
}

export interface Project {
  id?: string;
  name: string;
  project_type_id?: string;
  project_sub_type_id?: string;
  location_id?: string;
  priority?: number;
  description?: string;
  include_in_demand?: boolean;
  aspiration_start?: string;
  aspiration_finish?: string;
  owner_id?: string;
}

export interface Assignment {
  id?: string;
  person_id: string;
  project_id: string;
  role_id: string;
  start_date?: string;
  end_date?: string;
  allocation_percentage?: number;
  notes?: string;
  scenario_id?: string;
  assignment_date_mode?: 'fixed' | 'project' | 'phase';
}

export interface Role {
  id?: string;
  name: string;
  description?: string;
}

export interface Location {
  id?: string;
  name: string;
  description?: string;
}

export interface Scenario {
  id?: string;
  name: string;
  description?: string;
  scenario_type?: 'custom' | 'baseline' | 'optimistic' | 'pessimistic' | 'what-if' | 'forecast';
  status?: 'draft' | 'active' | 'archived';
  parent_scenario_id?: string;
}

export interface ProjectType {
  id?: string;
  name: string;
  color_code?: string;
  description?: string;
  parent_id?: string;
}

export interface AvailabilityOverride {
  id?: string;
  person_id: string;
  start_date: string;
  end_date: string;
  availability_percentage: number;
  hours_per_day?: number;
  reason?: string;
  override_type?: 'VACATION' | 'SICK' | 'TRAINING' | 'CONFERENCE' | 'PERSONAL';
}

// Cleanup tracking
interface CreatedEntities {
  people: string[];
  projects: string[];
  assignments: string[];
  scenarios: string[];
  roles: string[];
  locations: string[];
  projectTypes: string[];
  availabilityOverrides: string[];
}

// Retry configuration
interface RetryConfig {
  maxRetries: number;
  delayMs: number;
  backoffMultiplier: number;
}

// ============================================================================
// Unified Test Data Factory
// ============================================================================

export class UnifiedTestDataFactory {
  private apiContext: APIRequestContext;
  private testPrefix: string;
  private createdEntities: CreatedEntities;
  private retryConfig: RetryConfig;
  private cachedRoles: Role[] | null = null;
  private cachedLocations: Location[] | null = null;
  private cachedProjectTypes: ProjectType[] | null = null;

  constructor(
    apiContext: APIRequestContext,
    testPrefix: string = 'e2e',
    retryConfig: Partial<RetryConfig> = {}
  ) {
    this.apiContext = apiContext;
    this.testPrefix = `${testPrefix}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    this.createdEntities = {
      people: [],
      projects: [],
      assignments: [],
      scenarios: [],
      roles: [],
      locations: [],
      projectTypes: [],
      availabilityOverrides: []
    };
    this.retryConfig = {
      maxRetries: 3,
      delayMs: 500,
      backoffMultiplier: 2,
      ...retryConfig
    };
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Generate unique name with test prefix
   */
  private uniqueName(base: string): string {
    return `${this.testPrefix}_${base}`;
  }

  /**
   * Execute API call with retry logic
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: Error | null = null;
    let delay = this.retryConfig.delayMs;

    for (let attempt = 1; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        console.warn(
          `${operationName} failed (attempt ${attempt}/${this.retryConfig.maxRetries}):`,
          lastError.message
        );

        if (attempt < this.retryConfig.maxRetries) {
          await this.sleep(delay);
          delay *= this.retryConfig.backoffMultiplier;
        }
      }
    }

    throw new Error(`${operationName} failed after ${this.retryConfig.maxRetries} attempts: ${lastError?.message}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get default dates for entities
   */
  private getDefaultDates(): { start: string; end: string } {
    const start = new Date();
    const end = new Date();
    end.setMonth(end.getMonth() + 3);
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    };
  }

  // ==========================================================================
  // Entity Creation Methods
  // ==========================================================================

  /**
   * Create a person with automatic cleanup tracking
   */
  async createPerson(data: Partial<Person> = {}): Promise<Person> {
    return this.withRetry(async () => {
      const name = data.name || this.uniqueName('Person');
      const email = data.email || `${name.toLowerCase().replace(/\s+/g, '_')}@test.com`;

      const response = await this.apiContext.post('/api/people', {
        data: {
          name,
          email,
          worker_type: data.worker_type || 'FTE',
          default_availability_percentage: data.default_availability_percentage ?? 100,
          default_hours_per_day: data.default_hours_per_day ?? 8,
          start_date: data.start_date || new Date().toISOString().split('T')[0],
          location_id: data.location_id,
          primary_role_id: data.primary_role_id
        }
      });

      if (!response.ok()) {
        const errorText = await response.text();
        throw new Error(`Failed to create person: ${response.status()} - ${errorText}`);
      }

      const person = await response.json();
      this.createdEntities.people.push(person.id);
      return person;
    }, 'createPerson');
  }

  /**
   * Create a project with automatic cleanup tracking
   */
  async createProject(data: Partial<Project> = {}): Promise<Project> {
    return this.withRetry(async () => {
      // Ensure required dependencies exist
      const projectTypes = await this.ensureProjectTypes();
      const locations = await this.ensureLocations();
      const owner = data.owner_id ? null : await this.ensureOwner();

      const { start, end } = this.getDefaultDates();
      const name = data.name || this.uniqueName('Project');

      // Find project type and subtype
      let projectTypeId = data.project_type_id || projectTypes[0]?.id;
      let projectSubTypeId = data.project_sub_type_id;

      // If no subtype specified, try to find one for the project type
      if (!projectSubTypeId && projectTypeId) {
        const subTypesResponse = await this.apiContext.get('/api/project-sub-types');
        if (subTypesResponse.ok()) {
          const subTypesResult = await subTypesResponse.json();
          const subTypes = subTypesResult.data || subTypesResult;

          // Define interface for subtype with optional grouping
          interface SubTypeWithGroup {
            id?: string;
            project_type_id?: string;
            sub_types?: SubTypeWithGroup[];
          }

          // Handle grouped data
          let flatSubTypes: SubTypeWithGroup[] = [];
          if (Array.isArray(subTypes) && subTypes[0]?.sub_types) {
            flatSubTypes = subTypes.flatMap((g: SubTypeWithGroup) => g.sub_types || []);
          } else if (Array.isArray(subTypes)) {
            flatSubTypes = subTypes;
          }

          const matchingSubType = flatSubTypes.find((st: SubTypeWithGroup) => st.project_type_id === projectTypeId);
          if (matchingSubType) {
            projectSubTypeId = matchingSubType.id;
          }
        }
      }

      const response = await this.apiContext.post('/api/projects', {
        data: {
          name,
          description: data.description || `Test project: ${name}`,
          project_type_id: projectTypeId,
          project_sub_type_id: projectSubTypeId || projectTypeId,
          location_id: data.location_id || locations[0]?.id,
          priority: data.priority ?? 3,
          include_in_demand: data.include_in_demand ?? true,
          aspiration_start: data.aspiration_start || start,
          aspiration_finish: data.aspiration_finish || end,
          owner_id: data.owner_id || owner?.id
        }
      });

      if (!response.ok()) {
        const errorText = await response.text();
        throw new Error(`Failed to create project: ${response.status()} - ${errorText}`);
      }

      const project = await response.json();
      this.createdEntities.projects.push(project.id);
      return project;
    }, 'createProject');
  }

  /**
   * Create an assignment with automatic cleanup tracking
   */
  async createAssignment(data: Assignment): Promise<Assignment> {
    return this.withRetry(async () => {
      const { start, end } = this.getDefaultDates();

      const response = await this.apiContext.post('/api/assignments', {
        data: {
          person_id: data.person_id,
          project_id: data.project_id,
          role_id: data.role_id,
          start_date: data.start_date || start,
          end_date: data.end_date || end,
          allocation_percentage: data.allocation_percentage ?? 100,
          notes: data.notes || '',
          assignment_date_mode: data.assignment_date_mode || 'fixed',
          scenario_id: data.scenario_id
        }
      });

      if (!response.ok()) {
        const errorText = await response.text();
        throw new Error(`Failed to create assignment: ${response.status()} - ${errorText}`);
      }

      const assignment = await response.json();
      this.createdEntities.assignments.push(assignment.id);
      return assignment;
    }, 'createAssignment');
  }

  /**
   * Create a role with automatic cleanup tracking
   */
  async createRole(data: Partial<Role> = {}): Promise<Role> {
    return this.withRetry(async () => {
      const name = data.name || this.uniqueName('Role');

      const response = await this.apiContext.post('/api/roles', {
        data: {
          name,
          description: data.description || `Test role: ${name}`
        }
      });

      if (!response.ok()) {
        const errorText = await response.text();
        throw new Error(`Failed to create role: ${response.status()} - ${errorText}`);
      }

      const role = await response.json();
      this.createdEntities.roles.push(role.id);
      return role;
    }, 'createRole');
  }

  /**
   * Create a location with automatic cleanup tracking
   */
  async createLocation(data: Partial<Location> = {}): Promise<Location> {
    return this.withRetry(async () => {
      const name = data.name || this.uniqueName('Location');

      const response = await this.apiContext.post('/api/locations', {
        data: {
          name,
          description: data.description || `Test location: ${name}`
        }
      });

      if (!response.ok()) {
        const errorText = await response.text();
        throw new Error(`Failed to create location: ${response.status()} - ${errorText}`);
      }

      const location = await response.json();
      this.createdEntities.locations.push(location.id);
      return location;
    }, 'createLocation');
  }

  /**
   * Create a scenario with automatic cleanup tracking
   */
  async createScenario(data: Partial<Scenario> = {}): Promise<Scenario> {
    return this.withRetry(async () => {
      const name = data.name || this.uniqueName('Scenario');

      const response = await this.apiContext.post('/api/scenarios', {
        data: {
          name,
          description: data.description || `Test scenario: ${name}`,
          scenario_type: data.scenario_type || 'custom',
          status: data.status || 'draft',
          parent_scenario_id: data.parent_scenario_id
        }
      });

      if (!response.ok()) {
        const errorText = await response.text();
        throw new Error(`Failed to create scenario: ${response.status()} - ${errorText}`);
      }

      const scenario = await response.json();
      this.createdEntities.scenarios.push(scenario.id);
      return scenario;
    }, 'createScenario');
  }

  /**
   * Create an availability override with automatic cleanup tracking
   */
  async createAvailabilityOverride(data: AvailabilityOverride): Promise<AvailabilityOverride> {
    return this.withRetry(async () => {
      const response = await this.apiContext.post('/api/availability-overrides', {
        data: {
          person_id: data.person_id,
          start_date: data.start_date,
          end_date: data.end_date,
          availability_percentage: data.availability_percentage,
          hours_per_day: data.hours_per_day,
          reason: data.reason || 'Test override',
          override_type: data.override_type || 'PERSONAL'
        }
      });

      if (!response.ok()) {
        const errorText = await response.text();
        throw new Error(`Failed to create availability override: ${response.status()} - ${errorText}`);
      }

      const override = await response.json();
      this.createdEntities.availabilityOverrides.push(override.id);
      return override;
    }, 'createAvailabilityOverride');
  }

  // ==========================================================================
  // Ensure Methods (get or create dependencies)
  // ==========================================================================

  /**
   * Ensure roles exist (get existing or create defaults)
   */
  async ensureRoles(): Promise<Role[]> {
    if (this.cachedRoles) return this.cachedRoles;

    const response = await this.apiContext.get('/api/roles');
    if (response.ok()) {
      const roles = await response.json();
      if (roles && roles.length > 0) {
        this.cachedRoles = roles;
        return roles;
      }
    }

    // Create default roles
    const defaultRoles = ['Developer', 'Designer', 'Product Manager', 'QA Engineer'];
    const createdRoles: Role[] = [];

    for (const name of defaultRoles) {
      const role = await this.createRole({ name });
      createdRoles.push(role);
    }

    this.cachedRoles = createdRoles;
    return createdRoles;
  }

  /**
   * Ensure locations exist (get existing or create defaults)
   */
  async ensureLocations(): Promise<Location[]> {
    if (this.cachedLocations) return this.cachedLocations;

    const response = await this.apiContext.get('/api/locations');
    if (response.ok()) {
      const locations = await response.json();
      if (locations && locations.length > 0) {
        this.cachedLocations = locations;
        return locations;
      }
    }

    // Create default locations
    const createdLocations: Location[] = [];
    for (const name of ['New York', 'San Francisco', 'Remote']) {
      const location = await this.createLocation({ name: this.uniqueName(name) });
      createdLocations.push(location);
    }

    this.cachedLocations = createdLocations;
    return createdLocations;
  }

  /**
   * Ensure project types exist
   */
  async ensureProjectTypes(): Promise<ProjectType[]> {
    if (this.cachedProjectTypes) return this.cachedProjectTypes;

    const response = await this.apiContext.get('/api/project-types');
    if (response.ok()) {
      const result = await response.json();
      const types = result.data || result;
      if (types && types.length > 0) {
        this.cachedProjectTypes = types;
        return types;
      }
    }

    // Return empty array - most tests expect seeded project types
    this.cachedProjectTypes = [];
    return [];
  }

  /**
   * Ensure an owner exists for projects
   */
  async ensureOwner(): Promise<Person> {
    const response = await this.apiContext.get('/api/people');
    if (response.ok()) {
      const people = await response.json();
      if (people && people.length > 0) {
        return people[0];
      }
    }

    return this.createPerson({ name: this.uniqueName('Project_Owner') });
  }

  // ==========================================================================
  // Pre-built Test Scenarios
  // ==========================================================================

  /**
   * Pre-built test scenarios for common use cases
   */
  scenarios = {
    /**
     * Create utilization test scenario with:
     * - Over-utilized person (>100%)
     * - Under-utilized person (<100%)
     * - Available person (0%)
     * - Person with multiple assignments
     * - Unassigned projects
     */
    utilization: async () => {
      const roles = await this.ensureRoles();
      const developerRole = roles.find(r => r.name === 'Developer') || roles[0];

      // Create projects
      const projects = await Promise.all([
        this.createProject({ name: this.uniqueName('Project_A_Active') }),
        this.createProject({ name: this.uniqueName('Project_B_Active') }),
        this.createProject({ name: this.uniqueName('Project_C_Active') }),
        this.createProject({ name: this.uniqueName('Unassigned_Project_1') }),
        this.createProject({ name: this.uniqueName('Unassigned_Project_2') })
      ]);

      // Over-utilized person (availability 50%, allocation 60% = 120% utilization)
      const overUtilized = await this.createPerson({
        name: this.uniqueName('Over_Utilized'),
        default_availability_percentage: 50
      });
      await this.createAssignment({
        person_id: overUtilized.id!,
        project_id: projects[0].id!,
        role_id: developerRole.id!,
        allocation_percentage: 60
      });

      // Under-utilized person (60% allocation)
      const underUtilized = await this.createPerson({
        name: this.uniqueName('Under_Utilized')
      });
      await this.createAssignment({
        person_id: underUtilized.id!,
        project_id: projects[1].id!,
        role_id: developerRole.id!,
        allocation_percentage: 60
      });

      // Available person (no assignments)
      const available = await this.createPerson({
        name: this.uniqueName('Available')
      });

      // Person with multiple assignments
      const multiAssignment = await this.createPerson({
        name: this.uniqueName('Multi_Assignment')
      });
      await this.createAssignment({
        person_id: multiAssignment.id!,
        project_id: projects[0].id!,
        role_id: developerRole.id!,
        allocation_percentage: 40
      });
      await this.createAssignment({
        person_id: multiAssignment.id!,
        project_id: projects[1].id!,
        role_id: developerRole.id!,
        allocation_percentage: 30
      });
      await this.createAssignment({
        person_id: multiAssignment.id!,
        project_id: projects[2].id!,
        role_id: developerRole.id!,
        allocation_percentage: 20
      });

      return {
        overUtilized,
        underUtilized,
        available,
        withAssignments: multiAssignment,
        projects: {
          assigned: projects.slice(0, 3),
          unassigned: projects.slice(3)
        },
        roles
      };
    },

    /**
     * Create conflict scenario with overlapping assignments
     */
    conflicts: async () => {
      const roles = await this.ensureRoles();
      const developerRole = roles.find(r => r.name === 'Developer') || roles[0];

      const person = await this.createPerson({
        name: this.uniqueName('Conflict_Person')
      });

      const projects = await Promise.all([
        this.createProject({ name: this.uniqueName('Conflict_Project_A') }),
        this.createProject({ name: this.uniqueName('Conflict_Project_B') })
      ]);

      const { start, end } = this.getDefaultDates();

      // Create overlapping assignments totaling 120%
      await this.createAssignment({
        person_id: person.id!,
        project_id: projects[0].id!,
        role_id: developerRole.id!,
        start_date: start,
        end_date: end,
        allocation_percentage: 60
      });
      await this.createAssignment({
        person_id: person.id!,
        project_id: projects[1].id!,
        role_id: developerRole.id!,
        start_date: start,
        end_date: end,
        allocation_percentage: 60
      });

      return { person, projects, roles };
    },

    /**
     * Create bulk test data for load testing
     */
    bulk: async (config: { people?: number; projects?: number; assignments?: number } = {}) => {
      const { people: peopleCount = 10, projects: projectCount = 5, assignments: assignmentCount = 20 } = config;
      const roles = await this.ensureRoles();
      const developerRole = roles.find(r => r.name === 'Developer') || roles[0];

      const people: Person[] = [];
      const projects: Project[] = [];
      const assignments: Assignment[] = [];

      // Create people
      for (let i = 0; i < peopleCount; i++) {
        people.push(await this.createPerson({ name: this.uniqueName(`Bulk_Person_${i + 1}`) }));
      }

      // Create projects
      for (let i = 0; i < projectCount; i++) {
        projects.push(await this.createProject({ name: this.uniqueName(`Bulk_Project_${i + 1}`) }));
      }

      // Create assignments
      for (let i = 0; i < assignmentCount; i++) {
        const person = people[i % peopleCount];
        const project = projects[i % projectCount];
        assignments.push(await this.createAssignment({
          person_id: person.id!,
          project_id: project.id!,
          role_id: developerRole.id!,
          allocation_percentage: 20 + Math.floor(Math.random() * 60)
        }));
      }

      return { people, projects, assignments, roles };
    },

    /**
     * Create scenario hierarchy for scenario testing
     */
    scenarioHierarchy: async () => {
      const parentScenario = await this.createScenario({
        name: this.uniqueName('Parent_Scenario'),
        scenario_type: 'baseline',
        status: 'active'
      });

      const childScenarios = await Promise.all([
        this.createScenario({
          name: this.uniqueName('Child_WhatIf'),
          scenario_type: 'sandbox',
          status: 'draft',
          parent_scenario_id: parentScenario.id
        }),
        this.createScenario({
          name: this.uniqueName('Child_Forecast'),
          scenario_type: 'branch',
          status: 'draft',
          parent_scenario_id: parentScenario.id
        })
      ]);

      return { parentScenario, childScenarios };
    }
  };

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  /**
   * Clean up all created test data
   * Deletes entities in reverse order of dependencies
   */
  async cleanup(): Promise<void> {
    const deleteEndpoints = [
      { path: '/api/availability-overrides', ids: this.createdEntities.availabilityOverrides },
      { path: '/api/assignments', ids: this.createdEntities.assignments },
      { path: '/api/scenarios', ids: this.createdEntities.scenarios },
      { path: '/api/projects', ids: this.createdEntities.projects },
      { path: '/api/people', ids: this.createdEntities.people },
      { path: '/api/roles', ids: this.createdEntities.roles },
      { path: '/api/locations', ids: this.createdEntities.locations },
      { path: '/api/project-types', ids: this.createdEntities.projectTypes }
    ];

    const errors: string[] = [];

    for (const { path, ids } of deleteEndpoints) {
      for (const id of ids) {
        try {
          const response = await this.apiContext.delete(`${path}/${id}`);
          if (!response.ok() && response.status() !== 404) {
            errors.push(`Failed to delete ${path}/${id}: ${response.status()}`);
          }
        } catch (error) {
          errors.push(`Error deleting ${path}/${id}: ${error}`);
        }
      }
    }

    if (errors.length > 0) {
      console.warn('Cleanup encountered errors:', errors);
    }

    // Reset tracking
    this.createdEntities = {
      people: [],
      projects: [],
      assignments: [],
      scenarios: [],
      roles: [],
      locations: [],
      projectTypes: [],
      availabilityOverrides: []
    };

    // Clear caches
    this.cachedRoles = null;
    this.cachedLocations = null;
    this.cachedProjectTypes = null;
  }

  /**
   * Get the test prefix used for this factory instance
   */
  getTestPrefix(): string {
    return this.testPrefix;
  }

  /**
   * Get count of created entities
   */
  getCreatedCounts(): Record<string, number> {
    return {
      people: this.createdEntities.people.length,
      projects: this.createdEntities.projects.length,
      assignments: this.createdEntities.assignments.length,
      scenarios: this.createdEntities.scenarios.length,
      roles: this.createdEntities.roles.length,
      locations: this.createdEntities.locations.length,
      projectTypes: this.createdEntities.projectTypes.length,
      availabilityOverrides: this.createdEntities.availabilityOverrides.length
    };
  }
}

// ============================================================================
// Factory Function for Fixtures
// ============================================================================

/**
 * Create a new UnifiedTestDataFactory instance
 * Convenience function for use in test fixtures
 */
export function createUnifiedTestDataFactory(
  apiContext: APIRequestContext,
  testPrefix?: string
): UnifiedTestDataFactory {
  return new UnifiedTestDataFactory(apiContext, testPrefix);
}
