/**
 * TestContextManager - Per-test data isolation manager for E2E tests
 *
 * Provides isolated data contexts for each test run to prevent:
 * - Test data interference between tests
 * - Order-dependent test failures
 * - Flaky tests due to shared database state
 * - Orphaned test data after test runs
 *
 * Each test gets its own unique context with tracked created entities
 * that are automatically cleaned up after the test completes.
 */

import { APIRequestContext, Page } from '@playwright/test';
import crypto from 'crypto';

/**
 * Represents a unique test context with all created entity IDs
 */
export interface TestContext {
  /** Unique identifier for this test context */
  id: string;
  /** Human-readable prefix for created entities */
  prefix: string;
  /** Timestamp when context was created */
  createdAt: number;
  /** Test file that created this context */
  testFile?: string;
  /** Test name that created this context */
  testName?: string;
  /** All entity IDs created in this context, grouped by type */
  createdIds: {
    people: string[];
    projects: string[];
    assignments: string[];
    scenarios: string[];
    projectPhases: string[];
    availabilityOverrides: string[];
    roles: string[];
    locations: string[];
    projectTypes: string[];
    projectSubTypes: string[];
  };
  /** Whether this context has been cleaned up */
  isCleanedUp: boolean;
}

/**
 * Options for creating a test context
 */
export interface CreateContextOptions {
  /** Custom prefix for entity names (default: auto-generated) */
  prefix?: string;
  /** Test file name for tracking */
  testFile?: string;
  /** Test name for tracking */
  testName?: string;
}

/**
 * Options for creating test entities
 */
export interface CreateEntityOptions {
  /** Override default entity properties */
  [key: string]: unknown;
}

/**
 * TestContextManager handles per-test data isolation
 */
export class TestContextManager {
  private apiContext: APIRequestContext;
  private baseURL: string;
  private context: TestContext | null = null;
  private page?: Page;

  constructor(apiContext: APIRequestContext, page?: Page, baseURL?: string) {
    this.apiContext = apiContext;
    this.page = page;
    this.baseURL = baseURL || process.env.API_BASE_URL || 'http://localhost:3111';
  }

  /**
   * Generate a unique test context ID
   */
  private generateContextId(): string {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    return `test_${timestamp}_${random}`;
  }

  /**
   * Generate a unique entity ID prefix
   */
  private generatePrefix(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 6);
    return `t${timestamp}${random}`;
  }

  /**
   * Create a new isolated test context
   */
  async createContext(options: CreateContextOptions = {}): Promise<TestContext> {
    if (this.context && !this.context.isCleanedUp) {
      console.warn('Previous context not cleaned up, cleaning up now...');
      await this.cleanup();
    }

    this.context = {
      id: this.generateContextId(),
      prefix: options.prefix || this.generatePrefix(),
      createdAt: Date.now(),
      testFile: options.testFile,
      testName: options.testName,
      createdIds: {
        people: [],
        projects: [],
        assignments: [],
        scenarios: [],
        projectPhases: [],
        availabilityOverrides: [],
        roles: [],
        locations: [],
        projectTypes: [],
        projectSubTypes: [],
      },
      isCleanedUp: false,
    };

    // Register context with server for tracking (optional API endpoint)
    try {
      await this.apiContext.post(`${this.baseURL}/api/test-context/create`, {
        data: {
          contextId: this.context.id,
          prefix: this.context.prefix,
          testFile: this.context.testFile,
          testName: this.context.testName,
        },
      });
    } catch {
      // Server endpoint may not exist, which is fine
    }

    console.log(`Created test context: ${this.context.id} (prefix: ${this.context.prefix})`);
    return this.context;
  }

  /**
   * Get the current test context
   */
  getContext(): TestContext | null {
    return this.context;
  }

  /**
   * Ensure we have an active context
   */
  private ensureContext(): TestContext {
    if (!this.context) {
      throw new Error('No test context created. Call createContext() first.');
    }
    return this.context;
  }

  /**
   * Track a created entity ID
   */
  trackEntity(type: keyof TestContext['createdIds'], id: string): void {
    const context = this.ensureContext();
    if (!context.createdIds[type].includes(id)) {
      context.createdIds[type].push(id);
    }
  }

  /**
   * Generate a unique name for an entity
   */
  generateName(baseName: string): string {
    const context = this.ensureContext();
    return `${context.prefix}_${baseName}`;
  }

  /**
   * Generate a unique email for an entity
   */
  generateEmail(baseName: string): string {
    const context = this.ensureContext();
    const uniqueId = Math.random().toString(36).substring(2, 8);
    return `${context.prefix}_${baseName}_${uniqueId}@test.local`;
  }

  // ============================================
  // Entity Creation Methods
  // ============================================

  /**
   * Create a test person with isolation
   */
  async createPerson(options: CreateEntityOptions = {}): Promise<Record<string, unknown>> {
    const context = this.ensureContext();
    const uniqueId = Math.random().toString(36).substring(2, 8);

    const personData = {
      name: options.name || this.generateName(`Person_${uniqueId}`),
      email: options.email || this.generateEmail('person'),
      worker_type: options.worker_type || 'FTE',
      default_availability_percentage: options.default_availability_percentage ?? 100,
      default_hours_per_day: options.default_hours_per_day ?? 8,
      location_id: options.location_id,
      primary_role_id: options.primary_role_id,
      ...options,
    };

    const response = await this.apiContext.post(`${this.baseURL}/api/people`, {
      data: personData,
    });

    if (!response.ok()) {
      const errorText = await response.text();
      throw new Error(`Failed to create person: ${response.status()} - ${errorText}`);
    }

    const result = await response.json();
    const person = result.data || result;

    if (person.id) {
      this.trackEntity('people', person.id);
    }

    console.log(`Created test person: ${person.name} (id: ${person.id})`);
    return person;
  }

  /**
   * Create a test project with isolation
   */
  async createProject(options: CreateEntityOptions = {}): Promise<Record<string, unknown>> {
    const context = this.ensureContext();
    const uniqueId = Math.random().toString(36).substring(2, 8);

    // Ensure we have required reference data
    const [projectType, location, owner] = await Promise.all([
      options.project_type_id ? null : this.ensureProjectType(),
      options.location_id ? null : this.ensureLocation(),
      options.owner_id ? null : this.createPerson({ name: this.generateName(`ProjectOwner_${uniqueId}`) }),
    ]);

    // Get a subtype for the project type
    let projectSubType = null;
    const projectTypeId = options.project_type_id || projectType?.id;
    if (projectTypeId && !options.project_sub_type_id) {
      projectSubType = await this.ensureProjectSubType(projectTypeId as string);
    }

    const today = new Date();
    const threeMonthsLater = new Date(today);
    threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

    const projectData = {
      name: options.name || this.generateName(`Project_${uniqueId}`),
      project_type_id: projectTypeId,
      project_sub_type_id: options.project_sub_type_id || projectSubType?.id,
      location_id: options.location_id || location?.id,
      owner_id: options.owner_id || owner?.id,
      priority: options.priority ?? 3,
      description: options.description || `Test project created by ${context.id}`,
      include_in_demand: options.include_in_demand ?? true,
      aspiration_start: options.aspiration_start || today.toISOString().split('T')[0],
      aspiration_finish: options.aspiration_finish || threeMonthsLater.toISOString().split('T')[0],
      ...options,
    };

    const response = await this.apiContext.post(`${this.baseURL}/api/projects`, {
      data: projectData,
    });

    if (!response.ok()) {
      const errorText = await response.text();
      throw new Error(`Failed to create project: ${response.status()} - ${errorText}`);
    }

    const result = await response.json();
    const project = result.data || result;

    if (project.id) {
      this.trackEntity('projects', project.id);
    }

    console.log(`Created test project: ${project.name} (id: ${project.id})`);
    return project;
  }

  /**
   * Create a test assignment with isolation
   */
  async createAssignment(options: CreateEntityOptions = {}): Promise<Record<string, unknown>> {
    const context = this.ensureContext();

    // Ensure we have required entities
    const [project, person, role] = await Promise.all([
      options.project_id ? null : this.createProject(),
      options.person_id ? null : this.createPerson(),
      options.role_id ? null : this.ensureRole(),
    ]);

    const today = new Date();
    const oneMonthLater = new Date(today);
    oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

    const assignmentData = {
      project_id: options.project_id || project?.id,
      person_id: options.person_id || person?.id,
      role_id: options.role_id || role?.id,
      allocation_percentage: options.allocation_percentage ?? 50,
      start_date: options.start_date || today.toISOString().split('T')[0],
      end_date: options.end_date || oneMonthLater.toISOString().split('T')[0],
      assignment_date_mode: options.assignment_date_mode || 'fixed',
      notes: options.notes || `Test assignment created by ${context.id}`,
      ...options,
    };

    const response = await this.apiContext.post(`${this.baseURL}/api/assignments`, {
      data: assignmentData,
    });

    if (!response.ok()) {
      const errorText = await response.text();
      throw new Error(`Failed to create assignment: ${response.status()} - ${errorText}`);
    }

    const result = await response.json();
    const assignment = result.data || result;

    if (assignment.id) {
      this.trackEntity('assignments', assignment.id);
    }

    console.log(`Created test assignment (id: ${assignment.id})`);
    return assignment;
  }

  /**
   * Create a test scenario with isolation
   */
  async createScenario(options: CreateEntityOptions = {}): Promise<Record<string, unknown>> {
    const context = this.ensureContext();
    const uniqueId = Math.random().toString(36).substring(2, 8);

    const scenarioData = {
      name: options.name || this.generateName(`Scenario_${uniqueId}`),
      type: options.type || 'sandbox',
      description: options.description || `Test scenario created by ${context.id}`,
      status: options.status || 'draft',
      ...options,
    };

    const response = await this.apiContext.post(`${this.baseURL}/api/scenarios`, {
      data: scenarioData,
    });

    if (!response.ok()) {
      const errorText = await response.text();
      throw new Error(`Failed to create scenario: ${response.status()} - ${errorText}`);
    }

    const result = await response.json();
    const scenario = result.data || result;

    if (scenario.id) {
      this.trackEntity('scenarios', scenario.id);
    }

    console.log(`Created test scenario: ${scenario.name} (id: ${scenario.id})`);
    return scenario;
  }

  /**
   * Create a test project phase with isolation
   */
  async createProjectPhase(options: CreateEntityOptions = {}): Promise<Record<string, unknown>> {
    const context = this.ensureContext();

    // Ensure we have required entities
    const project = options.project_id ? null : await this.createProject();
    const phase = options.phase_id ? null : await this.ensurePhase();

    const today = new Date();
    const oneMonthLater = new Date(today);
    oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

    const projectPhaseData = {
      project_id: options.project_id || project?.id,
      phase_id: options.phase_id || phase?.id,
      start_date: options.start_date || today.toISOString().split('T')[0],
      end_date: options.end_date || oneMonthLater.toISOString().split('T')[0],
      ...options,
    };

    const response = await this.apiContext.post(`${this.baseURL}/api/project-phases`, {
      data: projectPhaseData,
    });

    if (!response.ok()) {
      const errorText = await response.text();
      throw new Error(`Failed to create project phase: ${response.status()} - ${errorText}`);
    }

    const result = await response.json();
    const projectPhase = result.data || result;

    if (projectPhase.id) {
      this.trackEntity('projectPhases', projectPhase.id);
    }

    console.log(`Created test project phase (id: ${projectPhase.id})`);
    return projectPhase;
  }

  // ============================================
  // Reference Data Methods (ensure existing or create)
  // ============================================

  /**
   * Ensure a role exists (use existing or create)
   */
  async ensureRole(name?: string): Promise<Record<string, unknown>> {
    const response = await this.apiContext.get(`${this.baseURL}/api/roles`);

    if (response.ok()) {
      const roles = await response.json();
      const rolesArray = roles.data || roles;

      if (Array.isArray(rolesArray) && rolesArray.length > 0) {
        if (name) {
          const found = rolesArray.find((r: Record<string, unknown>) => r.name === name);
          if (found) return found;
        }
        return rolesArray[0];
      }
    }

    // Create a default role
    const roleData = { name: name || 'Developer' };
    const createResponse = await this.apiContext.post(`${this.baseURL}/api/roles`, {
      data: roleData,
    });

    if (!createResponse.ok()) {
      throw new Error(`Failed to create role: ${createResponse.status()}`);
    }

    const result = await createResponse.json();
    const role = result.data || result;
    this.trackEntity('roles', role.id);
    return role;
  }

  /**
   * Ensure a location exists (use existing or create)
   */
  async ensureLocation(name?: string): Promise<Record<string, unknown>> {
    const response = await this.apiContext.get(`${this.baseURL}/api/locations`);

    if (response.ok()) {
      const locations = await response.json();
      const locationsArray = locations.data || locations;

      if (Array.isArray(locationsArray) && locationsArray.length > 0) {
        if (name) {
          const found = locationsArray.find((l: Record<string, unknown>) => l.name === name);
          if (found) return found;
        }
        return locationsArray[0];
      }
    }

    // Create a default location
    const context = this.ensureContext();
    const locationData = {
      name: name || this.generateName('Location'),
      description: `Test location for ${context.id}`,
    };
    const createResponse = await this.apiContext.post(`${this.baseURL}/api/locations`, {
      data: locationData,
    });

    if (!createResponse.ok()) {
      throw new Error(`Failed to create location: ${createResponse.status()}`);
    }

    const result = await createResponse.json();
    const location = result.data || result;
    this.trackEntity('locations', location.id);
    return location;
  }

  /**
   * Ensure a project type exists (use existing or create)
   */
  async ensureProjectType(name?: string): Promise<Record<string, unknown>> {
    const response = await this.apiContext.get(`${this.baseURL}/api/project-types`);

    if (response.ok()) {
      const types = await response.json();
      const typesArray = types.data || types;

      if (Array.isArray(typesArray) && typesArray.length > 0) {
        if (name) {
          const found = typesArray.find((t: Record<string, unknown>) => t.name === name);
          if (found) return found;
        }
        return typesArray[0];
      }
    }

    // Create a default project type
    const context = this.ensureContext();
    const typeData = {
      name: name || this.generateName('ProjectType'),
      color_code: '#3B82F6',
      description: `Test project type for ${context.id}`,
    };
    const createResponse = await this.apiContext.post(`${this.baseURL}/api/project-types`, {
      data: typeData,
    });

    if (!createResponse.ok()) {
      throw new Error(`Failed to create project type: ${createResponse.status()}`);
    }

    const result = await createResponse.json();
    const projectType = result.data || result;
    this.trackEntity('projectTypes', projectType.id);
    return projectType;
  }

  /**
   * Ensure a project sub-type exists for a given project type
   */
  async ensureProjectSubType(projectTypeId: string): Promise<Record<string, unknown>> {
    const response = await this.apiContext.get(`${this.baseURL}/api/project-sub-types`);

    if (response.ok()) {
      const result = await response.json();
      const subTypes = result.data || result;

      // Handle grouped data structure
      if (Array.isArray(subTypes)) {
        let flatSubTypes: Record<string, unknown>[] = [];

        if (subTypes[0]?.sub_types) {
          // Grouped structure
          flatSubTypes = subTypes.flatMap((group: Record<string, unknown>) =>
            (group.sub_types as Record<string, unknown>[]) || []
          );
        } else {
          flatSubTypes = subTypes;
        }

        const matching = flatSubTypes.find(
          (st: Record<string, unknown>) => st.project_type_id === projectTypeId
        );
        if (matching) return matching;

        // Return any subtype if no matching one found
        if (flatSubTypes.length > 0) return flatSubTypes[0];
      }
    }

    // Create a default sub-type
    const context = this.ensureContext();
    const subTypeData = {
      name: this.generateName('SubType'),
      project_type_id: projectTypeId,
      description: `Test sub-type for ${context.id}`,
    };
    const createResponse = await this.apiContext.post(`${this.baseURL}/api/project-sub-types`, {
      data: subTypeData,
    });

    if (!createResponse.ok()) {
      throw new Error(`Failed to create project sub-type: ${createResponse.status()}`);
    }

    const result = await createResponse.json();
    const subType = result.data || result;
    this.trackEntity('projectSubTypes', subType.id);
    return subType;
  }

  /**
   * Ensure a phase exists (use existing or create)
   */
  async ensurePhase(name?: string): Promise<Record<string, unknown>> {
    const response = await this.apiContext.get(`${this.baseURL}/api/phases`);

    if (response.ok()) {
      const phases = await response.json();
      const phasesArray = phases.data || phases;

      if (Array.isArray(phasesArray) && phasesArray.length > 0) {
        if (name) {
          const found = phasesArray.find((p: Record<string, unknown>) => p.name === name);
          if (found) return found;
        }
        return phasesArray[0];
      }
    }

    // Create a default phase
    const phaseData = {
      name: name || 'Development',
      description: 'Development phase',
      order_index: 1,
    };
    const createResponse = await this.apiContext.post(`${this.baseURL}/api/phases`, {
      data: phaseData,
    });

    if (!createResponse.ok()) {
      throw new Error(`Failed to create phase: ${createResponse.status()}`);
    }

    const result = await createResponse.json();
    return result.data || result;
  }

  // ============================================
  // Bulk Creation Methods
  // ============================================

  /**
   * Create bulk test data with a single call
   */
  async createBulkData(config: {
    people?: number;
    projects?: number;
    assignments?: number;
    scenarios?: number;
  }): Promise<{
    people: Record<string, unknown>[];
    projects: Record<string, unknown>[];
    assignments: Record<string, unknown>[];
    scenarios: Record<string, unknown>[];
  }> {
    const result = {
      people: [] as Record<string, unknown>[],
      projects: [] as Record<string, unknown>[],
      assignments: [] as Record<string, unknown>[],
      scenarios: [] as Record<string, unknown>[],
    };

    // Create people first
    for (let i = 0; i < (config.people || 0); i++) {
      const person = await this.createPerson({
        name: this.generateName(`Person_${i + 1}`),
      });
      result.people.push(person);
    }

    // Create projects
    for (let i = 0; i < (config.projects || 0); i++) {
      const project = await this.createProject({
        name: this.generateName(`Project_${i + 1}`),
        owner_id: result.people[i % Math.max(1, result.people.length)]?.id,
      });
      result.projects.push(project);
    }

    // Create scenarios
    for (let i = 0; i < (config.scenarios || 0); i++) {
      const scenario = await this.createScenario({
        name: this.generateName(`Scenario_${i + 1}`),
        type: ['branch', 'baseline', 'sandbox'][i % 3],
      });
      result.scenarios.push(scenario);
    }

    // Create assignments
    const role = await this.ensureRole();
    for (let i = 0; i < (config.assignments || 0); i++) {
      const assignment = await this.createAssignment({
        project_id: result.projects[i % Math.max(1, result.projects.length)]?.id,
        person_id: result.people[i % Math.max(1, result.people.length)]?.id,
        role_id: role.id,
        allocation_percentage: 20 + (i * 10) % 60,
      });
      result.assignments.push(assignment);
    }

    return result;
  }

  // ============================================
  // Cleanup Methods
  // ============================================

  /**
   * Clean up all entities created in this context
   */
  async cleanup(): Promise<void> {
    if (!this.context) {
      console.log('No context to clean up');
      return;
    }

    if (this.context.isCleanedUp) {
      console.log(`Context ${this.context.id} already cleaned up`);
      return;
    }

    console.log(`Cleaning up test context: ${this.context.id}`);

    // Delete in reverse dependency order
    const deletionOrder: Array<{ endpoint: string; type: keyof TestContext['createdIds'] }> = [
      { endpoint: '/api/assignments', type: 'assignments' },
      { endpoint: '/api/availability-overrides', type: 'availabilityOverrides' },
      { endpoint: '/api/project-phases', type: 'projectPhases' },
      { endpoint: '/api/scenarios', type: 'scenarios' },
      { endpoint: '/api/projects', type: 'projects' },
      { endpoint: '/api/people', type: 'people' },
      { endpoint: '/api/project-sub-types', type: 'projectSubTypes' },
      { endpoint: '/api/project-types', type: 'projectTypes' },
      { endpoint: '/api/locations', type: 'locations' },
      { endpoint: '/api/roles', type: 'roles' },
    ];

    for (const { endpoint, type } of deletionOrder) {
      const ids = this.context.createdIds[type];
      for (const id of ids) {
        try {
          await this.apiContext.delete(`${this.baseURL}${endpoint}/${id}`);
          console.log(`Deleted ${type}: ${id}`);
        } catch (error) {
          console.warn(`Failed to delete ${type} ${id}:`, error);
        }
      }
    }

    // Notify server of cleanup completion
    try {
      await this.apiContext.post(`${this.baseURL}/api/test-context/cleanup`, {
        data: { contextId: this.context.id },
      });
    } catch {
      // Server endpoint may not exist, which is fine
    }

    this.context.isCleanedUp = true;
    console.log(`Cleanup completed for context: ${this.context.id}`);
  }

  /**
   * Force cleanup of orphaned test data (for maintenance)
   */
  async cleanupOrphanedData(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<void> {
    try {
      const response = await this.apiContext.post(`${this.baseURL}/api/test-context/cleanup-orphaned`, {
        data: { maxAgeMs },
      });

      if (response.ok()) {
        const result = await response.json();
        console.log('Orphaned data cleanup result:', result);
      }
    } catch (error) {
      console.warn('Failed to cleanup orphaned data:', error);
    }
  }
}

/**
 * Factory function to create a TestContextManager
 */
export function createTestContextManager(
  apiContext: APIRequestContext,
  page?: Page,
  baseURL?: string
): TestContextManager {
  return new TestContextManager(apiContext, page, baseURL);
}
