/**
 * @deprecated This class is deprecated. Use UnifiedTestDataFactory from './unified-test-data-factory' instead.
 *
 * The UnifiedTestDataFactory provides the same test scenarios plus:
 * - Automatic cleanup tracking for all entity types
 * - Retry logic for API failures
 * - Consistent API across all entity types
 *
 * Migration:
 * ```typescript
 * // Old (deprecated)
 * import { E2ETestDataBuilder } from './e2e-test-data-builder';
 * const builder = new E2ETestDataBuilder(apiContext, 'e2e');
 * const data = await builder.createUtilizationTestScenario();
 *
 * // New (recommended)
 * import { UnifiedTestDataFactory } from './unified-test-data-factory';
 * const factory = new UnifiedTestDataFactory(apiContext);
 * const data = await factory.scenarios.utilization();
 * ```
 *
 * E2E Test Data Builder
 *
 * Creates consistent test data scenarios to ensure all E2E tests
 * have the required data conditions, eliminating conditional skips.
 */

import { APIRequestContext } from '@playwright/test';

interface Assignment {
  project_id?: string;
  person_id?: string;
  role_id?: string;
  allocation_percentage: number;
  start_date?: string;
  end_date?: string;
  notes?: string;
  assignment_date_mode?: 'fixed' | 'project' | 'phase';
}

interface Person {
  id?: string;
  name: string;
  email?: string;
  location_id?: string;
  availability_percentage?: number;
}

interface Project {
  id?: string;
  name: string;
  aspiration_start?: string;
  aspiration_finish?: string;
}

export class E2ETestDataBuilder {
  private apiContext: APIRequestContext;
  private testPrefix: string;
  private createdIds: {
    people: string[];
    projects: string[];
    assignments: string[];
    scenarios: string[];
    roles: string[];
  };

  constructor(apiContext: APIRequestContext, testPrefix: string) {
    this.apiContext = apiContext;
    this.testPrefix = testPrefix;
    this.createdIds = {
      people: [],
      projects: [],
      assignments: [],
      scenarios: [],
      roles: []
    };
  }

  /**
   * Creates a comprehensive utilization test scenario with:
   * - Over-utilized person (>100%)
   * - Under-utilized person (<100%)
   * - Available person (0%)
   * - Person with removable assignments
   * - Unassigned projects
   */
  async createUtilizationTestScenario() {
    // Ensure we have roles
    const roles = await this.ensureRoles();
    const developerRole = roles.find(r => r.name === 'Developer') || roles[0];

    // Create projects first
    const projects = await this.createProjects([
      { name: `${this.testPrefix}_Project_A_Active` },
      { name: `${this.testPrefix}_Project_B_Active` },
      { name: `${this.testPrefix}_Project_C_Active` },
      { name: `${this.testPrefix}_Unassigned_Project_1` },
      { name: `${this.testPrefix}_Unassigned_Project_2` },
      { name: `${this.testPrefix}_Unassigned_Project_3` }
    ]);

    // Create over-utilized person with reduced availability to simulate over-utilization
    const overUtilized = await this.createPerson({
      name: `${this.testPrefix}_Over_Utilized_Person`,
      email: `${this.testPrefix}_over@test.com`,
      availability_percentage: 50  // Set availability to 50% so 60% allocation = 120% utilization
    });

    await this.createAssignment({
      person_id: overUtilized.id,
      project_id: projects[0].id,
      role_id: developerRole.id,
      allocation_percentage: 60,
      notes: 'Primary project'
    });

    // Create second over-utilized person with multiple assignments that total > 100%
    // We'll use different date ranges to avoid conflicts
    const overUtilized2 = await this.createPerson({
      name: `${this.testPrefix}_Multi_Assignment_Person`,
      email: `${this.testPrefix}_multi@test.com`
    });
    
    // Add assignments with different dates to avoid conflicts
    await this.createAssignment({
      person_id: overUtilized2.id,
      project_id: projects[0].id,
      role_id: developerRole.id,
      allocation_percentage: 60,
      start_date: new Date().toISOString().split('T')[0],
      end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      notes: 'First month project'
    });

    await this.createAssignment({
      person_id: overUtilized2.id,
      project_id: projects[1].id,
      role_id: developerRole.id,
      allocation_percentage: 50,
      start_date: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      notes: 'Following months project'
    });

    // Create under-utilized person (60% total)
    const underUtilized = await this.createPerson({
      name: `${this.testPrefix}_Under_Utilized_Person`,
      email: `${this.testPrefix}_under@test.com`
    });

    await this.createAssignment({
      person_id: underUtilized.id,
      project_id: projects[2].id,
      role_id: developerRole.id,
      allocation_percentage: 60,
      notes: 'Part-time project'
    });

    // Create available person (0%)
    const available = await this.createPerson({
      name: `${this.testPrefix}_Available_Person`,
      email: `${this.testPrefix}_available@test.com`
    });

    // Create person with multiple removable assignments
    const withAssignments = await this.createPerson({
      name: `${this.testPrefix}_Person_With_Assignments`,
      email: `${this.testPrefix}_assigned@test.com`
    });

    await this.createAssignment({
      person_id: withAssignments.id,
      project_id: projects[0].id,
      role_id: developerRole.id,
      allocation_percentage: 40,
      notes: 'Removable assignment 1'
    });

    await this.createAssignment({
      person_id: withAssignments.id,
      project_id: projects[1].id,
      role_id: developerRole.id,
      allocation_percentage: 30,
      notes: 'Removable assignment 2'
    });

    await this.createAssignment({
      person_id: withAssignments.id,
      project_id: projects[2].id,
      role_id: developerRole.id,
      allocation_percentage: 20,
      notes: 'Removable assignment 3'
    });

    return {
      overUtilized,
      overUtilized2,
      underUtilized,
      available,
      withAssignments,
      projects: {
        assigned: projects.slice(0, 3),
        unassigned: projects.slice(3)
      },
      roles
    };
  }

  /**
   * Creates a scenario with draft status for scenario tests
   */
  async createScenarioWithDrafts() {
    const scenario = await this.createScenario({
      name: `${this.testPrefix}_Draft_Test_Scenario`,
      status: 'draft',
      description: 'Test scenario in draft status'
    });

    // Add some test data to the scenario
    const scenarioData = await this.createUtilizationTestScenario();
    
    // Create scenario-specific assignments if needed
    // Note: This depends on your scenario implementation
    
    return {
      scenario,
      ...scenarioData
    };
  }

  /**
   * Creates test data for assignment inline editing tests
   */
  async createAssignmentEditingScenario() {
    const roles = await this.ensureRoles();
    const developerRole = roles.find(r => r.name === 'Developer') || roles[0];

    // Create projects with phases for phase-related tests
    const projects = await this.createProjects([
      { name: `${this.testPrefix}_Project_With_Phases` },
      { name: `${this.testPrefix}_Project_For_Editing` }
    ]);

    // Create people with various assignment states
    const people = [];
    
    // Person with editable assignments
    const editablePerson = await this.createPerson({
      name: `${this.testPrefix}_Editable_Assignments_Person`
    });
    
    // Create assignments with different allocation percentages
    await this.createAssignment({
      person_id: editablePerson.id,
      project_id: projects[0].id,
      role_id: developerRole.id,
      allocation_percentage: 50,
      notes: 'Initial notes for editing'
    });

    await this.createAssignment({
      person_id: editablePerson.id,
      project_id: projects[1].id,
      role_id: developerRole.id,
      allocation_percentage: 25,
      notes: 'Secondary assignment'
    });

    people.push(editablePerson);

    return {
      people,
      projects,
      roles
    };
  }

  /**
   * Creates locations for location filter tests
   */
  async createLocationsTestData() {
    const locations = await this.createLocations([
      { name: `${this.testPrefix}_Location_NYC`, description: 'New York office' },
      { name: `${this.testPrefix}_Location_SF`, description: 'San Francisco office' },
      { name: `${this.testPrefix}_Location_Remote`, description: 'Remote location' }
    ]);

    // Create people in different locations
    const peopleByLocation = [];
    
    for (const location of locations) {
      const person = await this.createPerson({
        name: `${this.testPrefix}_Person_${location.name}`,
        location_id: location.id
      });
      peopleByLocation.push({ person, location });
    }

    return {
      locations,
      peopleByLocation
    };
  }

  /**
   * Creates a complex scenario hierarchy with parent and child scenarios
   */
  async createComplexScenarioHierarchy() {
    // Create parent scenario
    const parentScenario = await this.createScenario({
      name: `${this.testPrefix}_Parent_Scenario`,
      description: 'Parent scenario for testing hierarchy',
      type: 'baseline',
      status: 'active'
    });

    // Create child scenarios
    const childScenarios = [];
    const childTypes = ['sandbox', 'branch'];
    
    for (let i = 0; i < 2; i++) {
      const child = await this.createScenario({
        name: `${this.testPrefix}_Child_Scenario_${i + 1}`,
        description: `Child scenario ${i + 1}`,
        type: childTypes[i],
        status: 'draft',
        parent_scenario_id: parentScenario.id
      });
      childScenarios.push(child);
    }

    // Create comparison scenario
    const comparisonScenario = await this.createScenario({
      name: `${this.testPrefix}_Comparison_Scenario`,
      description: 'Scenario for comparison tests',
      type: 'sandbox',
      status: 'active'
    });

    // Create test data for scenarios
    const testData = await this.createUtilizationTestScenario();

    return {
      parentScenario,
      childScenarios,
      comparisonScenario,
      ...testData
    };
  }

  /**
   * Creates scenarios with various modifications for testing
   */
  async createScenarioWithModifications() {
    const baseScenario = await this.createScenario({
      name: `${this.testPrefix}_Base_Modification_Scenario`,
      description: 'Base scenario for modification tests',
      type: 'baseline',
      status: 'active'
    });

    // Create projects and people
    const projects = await this.createProjects([
      { name: `${this.testPrefix}_Modified_Project_1` },
      { name: `${this.testPrefix}_Modified_Project_2` }
    ]);

    const people = [];
    for (let i = 0; i < 3; i++) {
      const person = await this.createPerson({
        name: `${this.testPrefix}_Modified_Person_${i + 1}`
      });
      people.push(person);
    }

    // Create assignments with different modifications
    const modifications = [];
    const roles = await this.ensureRoles();
    const developerRole = roles.find(r => r.name === 'Developer') || roles[0];

    // Assignment to be modified
    const originalAssignment = await this.createAssignment({
      scenario_id: baseScenario.id,
      person_id: people[0].id,
      project_id: projects[0].id,
      role_id: developerRole.id,
      allocation_percentage: 50,
      notes: 'Original assignment'
    });

    // Assignment to be deleted
    const deletedAssignment = await this.createAssignment({
      scenario_id: baseScenario.id,
      person_id: people[1].id,
      project_id: projects[0].id,
      role_id: developerRole.id,
      allocation_percentage: 30,
      notes: 'To be deleted'
    });

    // New assignment (will be marked as added)
    const newAssignment = {
      person_id: people[2].id,
      project_id: projects[1].id,
      role_id: developerRole.id,
      allocation_percentage: 40,
      notes: 'New assignment'
    };

    modifications.push({
      type: 'modified',
      assignment: originalAssignment,
      changes: { allocation_percentage: 75, notes: 'Modified assignment' }
    });

    modifications.push({
      type: 'deleted',
      assignment: deletedAssignment
    });

    modifications.push({
      type: 'added',
      assignment: newAssignment
    });

    return {
      scenario: baseScenario,
      projects,
      people,
      modifications,
      originalAssignment,
      deletedAssignment,
      newAssignment
    };
  }

  /**
   * Creates multiple scenarios for comparison features
   */
  async createScenariosForComparison() {
    const scenarios = [];
    const scenarioTypes = [
      { name: 'Current State', type: 'baseline', status: 'active' },
      { name: 'Q1 Plan', type: 'branch', status: 'active' },
      { name: 'Q2 Plan', type: 'branch', status: 'draft' },
      { name: 'Cost Optimization', type: 'sandbox', status: 'active' },
      { name: 'Growth Scenario', type: 'sandbox', status: 'draft' }
    ];

    // Create scenarios
    for (const config of scenarioTypes) {
      const scenario = await this.createScenario({
        name: `${this.testPrefix}_${config.name}`,
        description: `${config.name} scenario for comparison`,
        type: config.type,
        status: config.status
      });
      scenarios.push(scenario);
    }

    // Create consistent test data across scenarios
    const projects = await this.createProjects([
      { name: `${this.testPrefix}_Comparison_Project_A` },
      { name: `${this.testPrefix}_Comparison_Project_B` }
    ]);

    const people = [];
    for (let i = 0; i < 4; i++) {
      const person = await this.createPerson({
        name: `${this.testPrefix}_Comparison_Person_${i + 1}`
      });
      people.push(person);
    }

    const roles = await this.ensureRoles();
    const developerRole = roles.find(r => r.name === 'Developer') || roles[0];

    // Create different assignment patterns for each scenario
    const assignmentsByScenario = new Map();

    // Baseline scenario - current allocations
    const baselineAssignments = [];
    baselineAssignments.push(await this.createAssignment({
      scenario_id: scenarios[0].id,
      person_id: people[0].id,
      project_id: projects[0].id,
      role_id: developerRole.id,
      allocation_percentage: 80
    }));
    baselineAssignments.push(await this.createAssignment({
      scenario_id: scenarios[0].id,
      person_id: people[1].id,
      project_id: projects[1].id,
      role_id: developerRole.id,
      allocation_percentage: 60
    }));
    assignmentsByScenario.set(scenarios[0].id, baselineAssignments);

    // Q1 Plan - increased allocations
    const q1Assignments = [];
    q1Assignments.push(await this.createAssignment({
      scenario_id: scenarios[1].id,
      person_id: people[0].id,
      project_id: projects[0].id,
      role_id: developerRole.id,
      allocation_percentage: 100
    }));
    q1Assignments.push(await this.createAssignment({
      scenario_id: scenarios[1].id,
      person_id: people[1].id,
      project_id: projects[1].id,
      role_id: developerRole.id,
      allocation_percentage: 80
    }));
    q1Assignments.push(await this.createAssignment({
      scenario_id: scenarios[1].id,
      person_id: people[2].id,
      project_id: projects[0].id,
      role_id: developerRole.id,
      allocation_percentage: 50
    }));
    assignmentsByScenario.set(scenarios[1].id, q1Assignments);

    // Cost optimization - reduced allocations
    const costOptAssignments = [];
    costOptAssignments.push(await this.createAssignment({
      scenario_id: scenarios[3].id,
      person_id: people[0].id,
      project_id: projects[0].id,
      role_id: developerRole.id,
      allocation_percentage: 60
    }));
    costOptAssignments.push(await this.createAssignment({
      scenario_id: scenarios[3].id,
      person_id: people[1].id,
      project_id: projects[1].id,
      role_id: developerRole.id,
      allocation_percentage: 40
    }));
    assignmentsByScenario.set(scenarios[3].id, costOptAssignments);

    return {
      scenarios,
      projects,
      people,
      assignmentsByScenario,
      roles
    };
  }

  /**
   * Creates test data for scenario duplication features
   */
  async createScenarioForDuplication() {
    const sourceScenario = await this.createScenario({
      name: `${this.testPrefix}_Source_Scenario`,
      description: 'Scenario to be duplicated',
      type: 'sandbox',
      status: 'active'
    });

    // Create comprehensive test data
    const projects = await this.createProjects([
      { name: `${this.testPrefix}_Duplication_Project_1` },
      { name: `${this.testPrefix}_Duplication_Project_2` },
      { name: `${this.testPrefix}_Duplication_Project_3` }
    ]);

    const people = [];
    for (let i = 0; i < 5; i++) {
      const person = await this.createPerson({
        name: `${this.testPrefix}_Duplication_Person_${i + 1}`,
        availability_percentage: 80 + i * 5  // Varying availability
      });
      people.push(person);
    }

    const roles = await this.ensureRoles();

    // Create diverse assignments
    const assignments = [];
    const assignmentConfigs = [
      { person: 0, project: 0, allocation: 80, role: 'Developer' },
      { person: 0, project: 1, allocation: 20, role: 'Developer' },
      { person: 1, project: 0, allocation: 60, role: 'Designer' },
      { person: 2, project: 1, allocation: 100, role: 'Product Manager' },
      { person: 3, project: 2, allocation: 50, role: 'QA Engineer' },
      { person: 4, project: 2, allocation: 40, role: 'Developer' }
    ];

    for (const config of assignmentConfigs) {
      const role = roles.find(r => r.name === config.role) || roles[0];
      const assignment = await this.createAssignment({
        scenario_id: sourceScenario.id,
        person_id: people[config.person].id,
        project_id: projects[config.project].id,
        role_id: role.id,
        allocation_percentage: config.allocation,
        notes: `Assignment for ${config.role} on project`
      });
      assignments.push(assignment);
    }

    return {
      sourceScenario,
      projects,
      people,
      assignments,
      roles
    };
  }

  // Helper methods

  private async createPerson(data: Partial<Person>): Promise<Person> {
    const response = await this.apiContext.post('/api/people', {
      data: {
        name: data.name,
        email: data.email || `${data.name.toLowerCase().replace(/\s+/g, '_')}@test.com`,
        location_id: data.location_id,
        availability_percentage: data.availability_percentage || 100,
        start_date: new Date().toISOString().split('T')[0]
      }
    });

    if (!response.ok()) {
      throw new Error(`Failed to create person: ${response.status()}`);
    }

    const person = await response.json();
    this.createdIds.people.push(person.id);
    return person;
  }

  private async createProjects(projectData: Partial<Project>[]): Promise<Project[]> {
    const projects = [];
    
    // First ensure we have required data
    const projectTypes = await this.ensureProjectTypes();
    const projectSubTypes = await this.ensureProjectSubTypes(projectTypes);
    const locations = await this.ensureLocations();
    const owner = await this.ensureOwner();
    
    // Find a matching project type and subtype
    let projectTypeId = projectTypes[0]?.id;
    let projectSubTypeId = null;
    
    // Find a subtype that belongs to our project type
    for (const subType of projectSubTypes) {
      if (subType.project_type_id === projectTypeId) {
        projectSubTypeId = subType.id;
        break;
      }
    }
    
    // If no matching subtype found, try to find any matching pair
    if (!projectSubTypeId && projectSubTypes.length > 0) {
      projectSubTypeId = projectSubTypes[0].id;
      projectTypeId = projectSubTypes[0].project_type_id;
    }
    
    // If still no subtype, we need to create one
    if (!projectSubTypeId) {
      throw new Error('No project subtypes available. Database may need seeding.');
    }
    
    for (const data of projectData) {
      const response = await this.apiContext.post('/api/projects', {
        data: {
          name: data.name,
          aspiration_start: data.aspiration_start || new Date().toISOString().split('T')[0],
          aspiration_finish: data.aspiration_finish || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          project_type_id: projectTypeId,
          project_sub_type_id: projectSubTypeId,
          location_id: locations[0]?.id,
          priority: 1,
          description: `Test project: ${data.name}`,
          include_in_demand: true,
          owner_id: owner.id
        }
      });

      if (!response.ok()) {
        const errorText = await response.text();
        console.error('Project creation failed:', errorText);
        throw new Error(`Failed to create project: ${response.status()} - ${errorText}`);
      }

      const project = await response.json();
      this.createdIds.projects.push(project.id);
      projects.push(project);
    }

    return projects;
  }

  private async createAssignment(data: Assignment, force: boolean = false): Promise<any> {
    const url = force ? '/api/assignments?force=true' : '/api/assignments';
    const response = await this.apiContext.post(url, {
      data: {
        ...data,
        assignment_date_mode: data.assignment_date_mode || 'fixed',
        start_date: data.start_date || new Date().toISOString().split('T')[0],
        end_date: data.end_date || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      }
    });

    if (!response.ok()) {
      const errorText = await response.text();
      console.error('Assignment creation failed:', errorText);
      throw new Error(`Failed to create assignment: ${response.status()} - ${errorText}`);
    }

    const assignment = await response.json();
    this.createdIds.assignments.push(assignment.id);
    return assignment;
  }

  private async createScenario(data: any): Promise<any> {
    const response = await this.apiContext.post('/api/scenarios', {
      data
    });

    if (!response.ok()) {
      throw new Error(`Failed to create scenario: ${response.status()}`);
    }

    const scenario = await response.json();
    this.createdIds.scenarios.push(scenario.id);
    return scenario;
  }

  private async createLocations(locationData: any[]): Promise<any[]> {
    const locations = [];
    
    for (const data of locationData) {
      const locationPayload = {
        name: data.name,
        description: data.description || `${data.name} location`
      };
      
      const response = await this.apiContext.post('/api/locations', {
        data: locationPayload
      });

      if (!response.ok()) {
        const errorText = await response.text();
        console.warn(`Failed to create location: ${response.status()} - ${errorText}`);
        continue;
      }

      const location = await response.json();
      locations.push(location.data || location);
    }

    return locations;
  }

  private async ensureRoles(): Promise<any[]> {
    // First, try to get existing roles
    const response = await this.apiContext.get('/api/roles');
    
    if (response.ok()) {
      const roles = await response.json();
      if (roles && roles.length > 0) {
        return roles;
      }
    }

    // Create default roles if none exist
    const defaultRoles = ['Developer', 'Designer', 'Product Manager', 'QA Engineer'];
    const createdRoles = [];

    for (const roleName of defaultRoles) {
      const roleResponse = await this.apiContext.post('/api/roles', {
        data: { name: roleName }
      });

      if (roleResponse.ok()) {
        const role = await roleResponse.json();
        this.createdIds.roles.push(role.id);
        createdRoles.push(role);
      }
    }

    return createdRoles;
  }

  private async ensureProjectTypes(): Promise<any[]> {
    // First, try to get existing project types
    const response = await this.apiContext.get('/api/project-types');
    
    if (response.ok()) {
      const result = await response.json();
      const types = result.data || result;
      if (types && types.length > 0) {
        return types;
      }
    }

    // Create default project types if none exist
    const defaultTypes = [
      { name: `${this.testPrefix}_Software_Development`, color_code: '#3B82F6' },
      { name: `${this.testPrefix}_Infrastructure`, color_code: '#10B981' },
      { name: `${this.testPrefix}_Research`, color_code: '#F59E0B' }
    ];
    const createdTypes = [];

    for (const typeData of defaultTypes) {
      const typeResponse = await this.apiContext.post('/api/project-types', {
        data: typeData
      });

      if (typeResponse.ok()) {
        createdTypes.push(await typeResponse.json());
      }
    }

    return createdTypes;
  }

  private async ensureProjectSubTypes(projectTypes: any[]): Promise<any[]> {
    // First, try to get existing sub types
    const response = await this.apiContext.get('/api/project-sub-types');
    
    if (response.ok()) {
      const result = await response.json();
      const subTypes = result.data || result;
      
      // If we have subtypes, extract them from grouped data
      if (Array.isArray(subTypes) && subTypes.length > 0) {
        if (subTypes[0].sub_types) {
          // It's grouped data
          return subTypes.flatMap((group: any) => group.sub_types || []);
        }
        return subTypes;
      }
    }

    // Create default sub types for each project type
    const createdSubTypes = [];
    
    for (const projectType of projectTypes) {
      const subTypes = [
        { name: `${projectType.name} - Standard`, project_type_id: projectType.id },
        { name: `${projectType.name} - Advanced`, project_type_id: projectType.id }
      ];
      
      for (const subTypeData of subTypes) {
        const subTypeResponse = await this.apiContext.post('/api/project-sub-types', {
          data: subTypeData
        });

        if (subTypeResponse.ok()) {
          createdSubTypes.push(await subTypeResponse.json());
        }
      }
    }

    return createdSubTypes;
  }

  private async ensureLocations(): Promise<any[]> {
    // First, try to get existing locations
    const response = await this.apiContext.get('/api/locations');
    
    if (response.ok()) {
      const locations = await response.json();
      if (locations && locations.length > 0) {
        return locations;
      }
    }

    // Create default locations if none exist
    return this.createLocations([
      { name: `${this.testPrefix}_New_York`, description: 'New York office location' },
      { name: `${this.testPrefix}_San_Francisco`, description: 'San Francisco office location' },
      { name: `${this.testPrefix}_Remote`, description: 'Remote work location' }
    ]);
  }

  private async ensureOwner(): Promise<any> {
    // Create a default owner for projects
    const owners = await this.apiContext.get('/api/people');
    
    if (owners.ok()) {
      const people = await owners.json();
      if (people && people.length > 0) {
        return people[0];
      }
    }

    // Create a default owner
    return this.createPerson({
      name: `${this.testPrefix}_Project_Owner`,
      email: `${this.testPrefix}_owner@test.com`
    });
  }

  /**
   * Cleanup all created test data
   */
  async cleanup() {
    // Delete in reverse order of dependencies
    const endpoints = [
      { path: '/api/project-assignments', ids: this.createdIds.assignments },
      { path: '/api/scenarios', ids: this.createdIds.scenarios },
      { path: '/api/projects', ids: this.createdIds.projects },
      { path: '/api/people', ids: this.createdIds.people },
      { path: '/api/roles', ids: this.createdIds.roles }
    ];

    for (const { path, ids } of endpoints) {
      for (const id of ids) {
        try {
          await this.apiContext.delete(`${path}/${id}`);
        } catch (error) {
          console.warn(`Failed to delete ${path}/${id}:`, error);
        }
      }
    }

    // Reset created IDs
    this.createdIds = {
      people: [],
      projects: [],
      assignments: [],
      scenarios: [],
      roles: []
    };
  }
}