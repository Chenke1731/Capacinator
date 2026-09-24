import { APIRequestContext } from '@playwright/test';

// Entity interfaces for type safety
interface FactoryPerson {
  id: string;
  name: string;
  email?: string;
  location_id?: string;
  primary_role_id?: string;
  worker_type?: 'FTE' | 'Contractor';
  default_availability_percentage?: number;
  default_hours_per_day?: number;
}

interface FactoryProject {
  id: string;
  name: string;
  project_type_id?: string;
  project_sub_type_id?: string;
  location_id?: string;
  priority?: number;
  description?: string;
}

interface FactoryAssignment {
  id: string;
  person_id: string;
  project_id: string;
  role_id: string;
  start_date?: string;
  end_date?: string;
  allocation_percentage?: number;
}

interface FactoryScenario {
  id: string;
  name: string;
  description?: string;
  scenario_type?: 'custom' | 'baseline' | 'optimistic' | 'pessimistic';
  parent_scenario_id?: string;
}

/**
 * @deprecated This class is deprecated. Use UnifiedTestDataFactory from './unified-test-data-factory' instead.
 *
 * The UnifiedTestDataFactory provides:
 * - Automatic cleanup tracking for all entity types
 * - Retry logic for API failures
 * - Pre-built test scenarios (utilization, conflicts, bulk, etc.)
 * - Type-safe entity creation
 *
 * Migration:
 * ```typescript
 * // Old (deprecated)
 * import { TestDataFactory } from './test-data-factory';
 * const factory = new TestDataFactory(apiContext);
 *
 * // New (recommended)
 * import { UnifiedTestDataFactory } from './unified-test-data-factory';
 * const factory = new UnifiedTestDataFactory(apiContext);
 * ```
 *
 * Test data factory for creating consistent test data
 */
export class TestDataFactory {
  private testId: string;
  // Runtime-resolved reference ids. The old placeholder defaults
  // ('default-location' / 'default-role' / 'default-type') match nothing in
  // the e2e database and FK-fail every create with a 500 — resolve the
  // first real rows once and use them as defaults (overrides still win).
  private refIds: {
    location?: string;
    role?: string;
    project_type?: string;
    project_sub_type?: string;
  } = {};
  private createdData: {
    people: string[];
    projects: string[];
    assignments: string[];
    scenarios: string[];
  } = {
    people: [],
    projects: [],
    assignments: [],
    scenarios: []
  };

  constructor(
    private apiContext: APIRequestContext,
    testPrefix: string = 'e2e'
  ) {
    this.testId = `${testPrefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get unique name with test ID
   */
  private getUniqueName(base: string): string {
    return `${base}-${this.testId}`;
  }

  /**
   * Resolve first-row reference ids from the live API (cached per factory)
   */
  private async resolveRefIds(): Promise<void> {
    if (this.refIds.location && this.refIds.role && this.refIds.project_type) return;
    const get = async (url: string): Promise<any[]> => {
      try {
        const r = await this.apiContext.get(url);
        if (!r.ok()) return [];
        const body = await r.json();
        return body?.data || (Array.isArray(body) ? body : []);
      } catch {
        return [];
      }
    };
    const [locations, roles, subTypeGroups] = await Promise.all([
      get('/api/locations'),
      get('/api/roles'),
      get('/api/project-sub-types')
    ]);
    this.refIds.location ||= locations[0]?.id;
    this.refIds.role ||= roles[0]?.id;
    this.refIds.project_type ||= subTypeGroups[0]?.project_type_id;
    this.refIds.project_sub_type ||= subTypeGroups[0]?.sub_types?.[0]?.id;
  }

  /**
   * Create a person
   */
  async createPerson(overrides: Partial<{
    name: string;
    email: string;
    location_id: string;
    primary_role_id: string;
    worker_type: 'FTE' | 'Contractor';
    default_availability_percentage: number;
    default_hours_per_day: number;
  }> = {}): Promise<FactoryPerson> {
    const name = overrides.name || this.getUniqueName('Test Person');
    const email = overrides.email || `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`;
    await this.resolveRefIds();

    const response = await this.apiContext.post('/api/people', {
      data: {
        name,
        email,
        location_id: overrides.location_id || this.refIds.location,
        primary_role_id: overrides.primary_role_id || this.refIds.role,
        worker_type: overrides.worker_type || 'FTE',
        default_availability_percentage: overrides.default_availability_percentage || 100,
        default_hours_per_day: overrides.default_hours_per_day || 8,
        ...overrides
      }
    });

    if (!response.ok()) {
      throw new Error(`Failed to create person: ${response.status()} ${response.statusText()}`);
    }

    const person = await response.json();
    this.createdData.people.push(person.id);
    return person;
  }

  /**
   * Create a project
   */
  async createProject(overrides: Partial<{
    name: string;
    project_type_id: string;
    project_sub_type_id: string;
    location_id: string;
    priority: number;
    description: string;
    aspiration_start: string;
    aspiration_finish: string;
  }> = {}): Promise<FactoryProject> {
    const name = overrides.name || this.getUniqueName('Test Project');
    await this.resolveRefIds();

    const response = await this.apiContext.post('/api/projects', {
      data: {
        name,
        project_type_id: overrides.project_type_id || this.refIds.project_type,
        project_sub_type_id: overrides.project_sub_type_id || this.refIds.project_sub_type,
        location_id: overrides.location_id || this.refIds.location,
        priority: overrides.priority || 3,
        description: overrides.description || `Description for ${name}`,
        ...overrides
      }
    });

    if (!response.ok()) {
      throw new Error(`Failed to create project: ${response.status()} ${response.statusText()}`);
    }

    const project = await response.json();
    this.createdData.projects.push(project.id);
    return project;
  }

  /**
   * Create an assignment
   */
  async createAssignment(overrides: Partial<{
    person_id: string;
    project_id: string;
    role_id: string;
    start_date: string;
    end_date: string;
    allocation_percentage: number;
  }> = {}): Promise<FactoryAssignment> {
    const today = new Date();
    const nextMonth = new Date(today);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    const response = await this.apiContext.post('/api/assignments', {
      data: {
        person_id: overrides.person_id || this.createdData.people[0],
        project_id: overrides.project_id || this.createdData.projects[0],
        role_id: overrides.role_id || 'default-role',
        start_date: overrides.start_date || today.toISOString().split('T')[0],
        end_date: overrides.end_date || nextMonth.toISOString().split('T')[0],
        allocation_percentage: overrides.allocation_percentage || 100,
        ...overrides
      }
    });

    if (!response.ok()) {
      throw new Error(`Failed to create assignment: ${response.status()} ${response.statusText()}`);
    }

    const assignment = await response.json();
    this.createdData.assignments.push(assignment.id);
    return assignment;
  }

  /**
   * Create a scenario
   */
  async createScenario(overrides: Partial<{
    name: string;
    description: string;
    scenario_type: 'custom' | 'baseline' | 'optimistic' | 'pessimistic';
    parent_scenario_id: string;
  }> = {}): Promise<FactoryScenario> {
    const name = overrides.name || this.getUniqueName('Test Scenario');

    const response = await this.apiContext.post('/api/scenarios', {
      data: {
        name,
        description: overrides.description || `Description for ${name}`,
        scenario_type: overrides.scenario_type || 'custom',
        ...overrides
      }
    });

    if (!response.ok()) {
      throw new Error(`Failed to create scenario: ${response.status()} ${response.statusText()}`);
    }

    const scenario = await response.json();
    this.createdData.scenarios.push(scenario.id);
    return scenario;
  }

  /**
   * Create bulk test data
   */
  async createBulkTestData(config: {
    people?: number;
    projects?: number;
    assignments?: number;
    withUtilizationScenarios?: boolean;
  } = {}): Promise<{
    people: FactoryPerson[];
    projects: FactoryProject[];
    assignments: FactoryAssignment[];
  }> {
    const {
      people: peopleCount = 3,
      projects: projectCount = 2,
      assignments: assignmentCount = 5,
      withUtilizationScenarios = false
    } = config;

    const people: FactoryPerson[] = [];
    const projects: FactoryProject[] = [];
    const assignments: FactoryAssignment[] = [];

    // Create people
    for (let i = 0; i < peopleCount; i++) {
      const person = await this.createPerson({
        name: this.getUniqueName(`Person ${i + 1}`),
        default_availability_percentage: withUtilizationScenarios ? (100 - (i * 20)) : 100
      });
      people.push(person);
    }

    // Create projects
    for (let i = 0; i < projectCount; i++) {
      const project = await this.createProject({
        name: this.getUniqueName(`Project ${i + 1}`),
        priority: i + 1
      });
      projects.push(project);
    }

    // Create assignments
    if (withUtilizationScenarios) {
      // Create specific utilization scenarios
      if (people.length >= 3 && projects.length >= 2) {
        // Over-utilized person (120%)
        await this.createAssignment({
          person_id: people[0].id,
          project_id: projects[0].id,
          allocation_percentage: 80
        });
        await this.createAssignment({
          person_id: people[0].id,
          project_id: projects[1].id,
          allocation_percentage: 40
        });

        // Normal utilization (80%)
        const assignment1 = await this.createAssignment({
          person_id: people[1].id,
          project_id: projects[0].id,
          allocation_percentage: 80
        });
        assignments.push(assignment1);

        // Under-utilized (40%)
        const assignment2 = await this.createAssignment({
          person_id: people[2].id,
          project_id: projects[1].id,
          allocation_percentage: 40
        });
        assignments.push(assignment2);
      }
    } else {
      // Create random assignments
      for (let i = 0; i < assignmentCount; i++) {
        const assignment = await this.createAssignment({
          person_id: people[i % peopleCount].id,
          project_id: projects[i % projectCount].id,
          allocation_percentage: 20 + Math.floor(Math.random() * 80)
        });
        assignments.push(assignment);
      }
    }

    return { people, projects, assignments };
  }

  /**
   * Create test data for specific scenarios
   */
  async createScenarioTestData(scenario:
    | 'overUtilization'
    | 'underUtilization'
    | 'conflictingAssignments'
    | 'largeDataset'
  ): Promise<
    | { person: FactoryPerson; projects: FactoryProject[] }
    | { people: FactoryPerson[]; project: FactoryProject }
    | { people: FactoryPerson[]; projects: FactoryProject[]; assignments: FactoryAssignment[] }
  > {
    switch (scenario) {
      case 'overUtilization':
        const overUtilizedPerson = await this.createPerson({
          name: this.getUniqueName('Over Utilized Person')
        });
        const projects1 = await Promise.all([
          this.createProject({ name: this.getUniqueName('High Priority Project'), priority: 1 }),
          this.createProject({ name: this.getUniqueName('Medium Priority Project'), priority: 2 }),
          this.createProject({ name: this.getUniqueName('Low Priority Project'), priority: 3 })
        ]);
        
        // Create 150% allocation
        await Promise.all([
          this.createAssignment({
            person_id: overUtilizedPerson.id,
            project_id: projects1[0].id,
            allocation_percentage: 60
          }),
          this.createAssignment({
            person_id: overUtilizedPerson.id,
            project_id: projects1[1].id,
            allocation_percentage: 50
          }),
          this.createAssignment({
            person_id: overUtilizedPerson.id,
            project_id: projects1[2].id,
            allocation_percentage: 40
          })
        ]);
        
        return { person: overUtilizedPerson, projects: projects1 };

      case 'underUtilization':
        const underUtilizedPeople = await Promise.all([
          this.createPerson({ name: this.getUniqueName('Under Utilized 1') }),
          this.createPerson({ name: this.getUniqueName('Under Utilized 2') }),
          this.createPerson({ name: this.getUniqueName('Zero Utilized') })
        ]);
        const project = await this.createProject();
        
        // Create low allocations
        await this.createAssignment({
          person_id: underUtilizedPeople[0].id,
          project_id: project.id,
          allocation_percentage: 20
        });
        await this.createAssignment({
          person_id: underUtilizedPeople[1].id,
          project_id: project.id,
          allocation_percentage: 10
        });
        // Third person has no assignments
        
        return { people: underUtilizedPeople, project };

      case 'conflictingAssignments':
        const person = await this.createPerson();
        const conflictingProjects = await Promise.all([
          this.createProject({ name: this.getUniqueName('Project A') }),
          this.createProject({ name: this.getUniqueName('Project B') })
        ]);
        
        // Create overlapping assignments
        const sameStart = new Date().toISOString().split('T')[0];
        const sameEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        await Promise.all([
          this.createAssignment({
            person_id: person.id,
            project_id: conflictingProjects[0].id,
            start_date: sameStart,
            end_date: sameEnd,
            allocation_percentage: 60
          }),
          this.createAssignment({
            person_id: person.id,
            project_id: conflictingProjects[1].id,
            start_date: sameStart,
            end_date: sameEnd,
            allocation_percentage: 60
          })
        ]);
        
        return { person, projects: conflictingProjects };

      case 'largeDataset':
        return this.createBulkTestData({
          people: 50,
          projects: 20,
          assignments: 100
        });

      default:
        throw new Error(`Unknown scenario: ${scenario}`);
    }
  }

  /**
   * Clean up all created test data
   */
  async cleanup(): Promise<void> {
    const errors: string[] = [];

    // Delete in reverse order of dependencies
    for (const assignmentId of this.createdData.assignments) {
      try {
        await this.apiContext.delete(`/api/assignments/${assignmentId}`);
      } catch (error) {
        errors.push(`Failed to delete assignment ${assignmentId}: ${error}`);
      }
    }

    for (const scenarioId of this.createdData.scenarios) {
      try {
        await this.apiContext.delete(`/api/scenarios/${scenarioId}`);
      } catch (error) {
        errors.push(`Failed to delete scenario ${scenarioId}: ${error}`);
      }
    }

    for (const projectId of this.createdData.projects) {
      try {
        await this.apiContext.delete(`/api/projects/${projectId}`);
      } catch (error) {
        errors.push(`Failed to delete project ${projectId}: ${error}`);
      }
    }

    for (const personId of this.createdData.people) {
      try {
        await this.apiContext.delete(`/api/people/${personId}`);
      } catch (error) {
        errors.push(`Failed to delete person ${personId}: ${error}`);
      }
    }

    if (errors.length > 0) {
      console.warn('Cleanup errors:', errors);
    }

    // Clear the arrays
    this.createdData = {
      people: [],
      projects: [],
      assignments: [],
      scenarios: []
    };
  }

  /**
   * Get test ID for reference
   */
  getTestId(): string {
    return this.testId;
  }
}