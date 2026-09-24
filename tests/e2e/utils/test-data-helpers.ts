/**
 * Test Data Helpers
 * Provides methods for creating and managing test data with proper isolation
 */

import { Page, APIRequestContext } from '@playwright/test';
import { TestDataGenerator } from '../helpers/test-data-generator';

export interface TestDataContext {
  prefix: string;
  createdIds: {
    projects: string[];
    people: string[];
    assignments: string[];
    scenarios: string[];
    projectPhases: string[];
    availabilityOverrides: string[];
  };
}

export class TestDataHelpers {
  private testData: TestDataGenerator;
  private baseURL: string;
  
  constructor(
    private page: Page,
    private apiContext: APIRequestContext
  ) {
    this.baseURL = process.env.API_BASE_URL || 'http://localhost:3111';
    this.testData = new TestDataGenerator(apiContext, this.baseURL);
  }

  /**
   * Generate unique test identifier
   */
  generateUniqueId(prefix: string = 'test'): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}-${timestamp}-${random}`;
  }

  /**
   * Create a test data context for isolated testing
   */
  createTestContext(prefix?: string): TestDataContext {
    return {
      prefix: prefix || this.generateUniqueId(),
      createdIds: {
        projects: [],
        people: [],
        assignments: [],
        scenarios: [],
        projectPhases: [],
        availabilityOverrides: []
      }
    };
  }

  /**
   * Create a test user dynamically
   */
  async createTestUser(context: TestDataContext, options?: {
    name?: string;
    email?: string;
    role?: string;
    location?: string;
  }): Promise<any> {
    const uniqueName = options?.name || `${context.prefix}-User`;
    const uniqueId = this.generateUniqueId('');
    
    try {
      const response = await this.apiContext.post(`${this.baseURL}/api/people`, {
        data: {
          name: uniqueName,
          email: options?.email || `${context.prefix}-${uniqueId}@test.com`,
          worker_type: 'FTE',
          default_availability_percentage: 100,
          default_hours_per_day: 8
        }
      });
      
      const user = await response.json();
      
      if (user.id) {
        context.createdIds.people.push(user.id);
      }
      
      console.log(`✅ Created test user: ${uniqueName} (id: ${user.id})`);
      return user;
    } catch (error) {
      console.error(`❌ Failed to create test user: ${error}`);
      throw error;
    }
  }

  /**
   * Create a test project dynamically
   */
  async createTestProject(context: TestDataContext, options?: {
    name?: string;
    type?: string;
    location?: string;
    priority?: number;
    owner?: any;
  }): Promise<any> {
    const uniqueName = options?.name || `${context.prefix}-Project`;
    
    try {
      // Get available project types, sub-types, and locations
      const [typesResponse, subTypesResponse, locationsResponse] = await Promise.all([
        this.apiContext.get(`${this.baseURL}/api/project-types`),
        this.apiContext.get(`${this.baseURL}/api/project-sub-types`),
        this.apiContext.get(`${this.baseURL}/api/locations`)
      ]);
      
      const types = await typesResponse.json();
      const subTypes = await subTypesResponse.json();
      const locations = await locationsResponse.json();
      
      // Find or use first available
      const typesArray = types.data || types;
      const locationsArray = locations.data || locations;
      
      // Handle the sub-types response which may be grouped by project type
      let subTypesArray = [];
      if (subTypes.data && Array.isArray(subTypes.data)) {
        // If it's grouped data, flatten it
        subTypesArray = subTypes.data.flatMap(group => group.sub_types || []);
      } else if (Array.isArray(subTypes)) {
        // If it's already a flat array
        subTypesArray = subTypes;
      } else if (subTypes.success === false) {
        console.error('SubTypes request failed:', subTypes);
        throw new Error('Failed to fetch project sub-types');
      }
      
      // Ensure we have sub-types
      if (!Array.isArray(subTypesArray) || subTypesArray.length === 0) {
        console.error('SubTypes response is not valid:', subTypes);
        throw new Error('Invalid subtypes response format or no subtypes available');
      }
      
      // Find a project type that has subtypes
      let projectType = null;
      let projectSubType = null;
      
      for (const type of typesArray) {
        const matchingSubTypes = subTypesArray.filter(st => st.project_type_id === type.id);
        if (matchingSubTypes.length > 0) {
          projectType = type;
          projectSubType = matchingSubTypes[0];
          break;
        }
      }
      
      // If no matching type/subtype pair found, throw error
      if (!projectType || !projectSubType) {
        console.error('Available types:', typesArray.map(t => ({ id: t.id, name: t.name })));
        console.error('Available subtypes:', subTypesArray.map(st => ({ id: st.id, name: st.name, project_type_id: st.project_type_id })));
        throw new Error('No valid project type/subtype combination found');
      }
      
      const location = locationsArray[0];
      
      if (!projectType || !location || !projectSubType) {
        throw new Error('No project types, subtypes, or locations available');
      }
      
      console.log('Using project type:', projectType.id, projectType.name);
      console.log('Using project sub-type:', projectSubType.id, projectSubType.name);
      console.log('Using location:', location.id, location.name);
      
      // Create owner if not provided
      const owner = options?.owner || await this.createTestUser(context, {
        name: `${uniqueName}-Owner`
      });
      
      const requestData = {
        name: uniqueName,
        project_type_id: projectType.id,
        project_sub_type_id: projectSubType.id,
        location_id: location.id,
        priority: options?.priority || 3,
        description: `Test project for ${context.prefix}`,
        include_in_demand: true,
        owner_id: owner.id
      };
      
      console.log('Project creation request:', JSON.stringify(requestData, null, 2));
      
      const response = await this.apiContext.post(`${this.baseURL}/api/projects`, {
        data: requestData
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create project: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      const responseData = await response.json();
      console.log('Project creation response:', JSON.stringify(responseData, null, 2));
      
      // Handle both old format (direct project data) and new format ({success: true, data: project})
      const project = responseData.data || responseData;
      
      if (!project || !project.id) {
        console.error('Project response structure:', responseData);
        throw new Error('Project creation did not return a valid project with ID');
      }
      
      context.createdIds.projects.push(project.id);
      console.log(`✅ Created test project: ${uniqueName} (id: ${project.id})`);
      return project;
    } catch (error) {
      console.error(`❌ Failed to create test project: ${error}`);
      throw error;
    }
  }

  /**
   * Create a test scenario dynamically
   */
  async createTestScenario(context: TestDataContext, options?: {
    name?: string;
    type?: 'what-if' | 'baseline' | 'forecast';
    description?: string;
    status?: 'draft' | 'active' | 'archived';
  }): Promise<any> {
    const uniqueName = options?.name || `${context.prefix}-Scenario`;
    
    try {
      const response = await this.apiContext.post(`${this.baseURL}/api/scenarios`, {
        data: {
          name: uniqueName,
          type: options?.type || 'what-if',
          description: options?.description || `Test scenario for ${context.prefix}`,
          status: options?.status || 'draft'
        }
      });
      
      const scenario = await response.json();
      
      if (scenario.id) {
        context.createdIds.scenarios.push(scenario.id);
      }
      
      console.log(`✅ Created test scenario: ${uniqueName} (id: ${scenario.id})`);
      return scenario;
    } catch (error) {
      console.error(`❌ Failed to create test scenario: ${error}`);
      throw error;
    }
  }

  /**
   * Create a test assignment dynamically
   */
  async createTestAssignment(context: TestDataContext, options?: {
    project?: any;
    person?: any;
    role?: any;
    allocation?: number;
    startDate?: string;
    endDate?: string;
  }): Promise<any> {
    try {
      // Create project and person if not provided
      const project = options?.project || await this.createTestProject(context);
      const person = options?.person || await this.createTestUser(context);
      
      // Get available roles
      const rolesResponse = await this.apiContext.get(`${this.baseURL}/api/roles`);
      const roles = await rolesResponse.json();
      const role = options?.role || roles.data?.[0] || roles[0];
      
      if (!role) {
        throw new Error('No roles available');
      }
      
      const today = new Date();
      const nextMonth = new Date(today);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      
      const response = await this.apiContext.post(`${this.baseURL}/api/assignments`, {
        data: {
          project_id: project.id,
          person_id: person.id,
          role_id: role.id,
          allocation_percentage: options?.allocation || 50,
          start_date: options?.startDate || today.toISOString().split('T')[0],
          end_date: options?.endDate || nextMonth.toISOString().split('T')[0]
        }
      });
      
      const assignment = await response.json();
      
      if (assignment.id) {
        context.createdIds.assignments.push(assignment.id);
      }
      
      console.log(`✅ Created test assignment (id: ${assignment.id})`);
      return assignment;
    } catch (error) {
      console.error(`❌ Failed to create test assignment: ${error}`);
      throw error;
    }
  }

  /**
   * Find element by unique identifier instead of using .first()
   */
  async findByTestData(selector: string, identifier: string): Promise<any> {
    return this.page.locator(`${selector}:has-text("${identifier}")`);
  }

  /**
   * Click a specific element instead of .first()
   */
  async clickSpecific(baseSelector: string, identifier: string): Promise<void> {
    const element = await this.findByTestData(baseSelector, identifier);
    await element.click();
  }

  /**
   * Clean up all test data created in a context
   */
  async cleanupTestContext(context: TestDataContext): Promise<void> {
    console.log(`🧹 Cleaning up test data for context: ${context.prefix}`);
    
    // Delete in reverse dependency order
    const deletions = [
      { type: 'assignments', ids: context.createdIds.assignments },
      { type: 'project-phases', ids: context.createdIds.projectPhases },
      { type: 'availability-overrides', ids: context.createdIds.availabilityOverrides },
      { type: 'projects', ids: context.createdIds.projects },
      { type: 'people', ids: context.createdIds.people },
      { type: 'scenarios', ids: context.createdIds.scenarios }
    ];
    
    for (const { type, ids } of deletions) {
      for (const id of ids) {
        try {
          await this.apiContext.delete(`${this.baseURL}/api/${type}/${id}`);
          console.log(`✅ Deleted ${type} with id: ${id}`);
        } catch (error) {
          console.warn(`⚠️ Failed to delete ${type} with id ${id}: ${error}`);
        }
      }
    }
    
    console.log(`✅ Cleanup completed for context: ${context.prefix}`);
  }

  /**
   * Wait for element with specific text instead of using .first()
   */
  async waitForElementWithText(selector: string, text: string, timeout: number = 10000): Promise<void> {
    await this.page.waitForSelector(`${selector}:has-text("${text}")`, { timeout });
  }

  /**
   * Get element count with specific criteria
   */
  async getSpecificElementCount(selector: string, filterText?: string): Promise<number> {
    if (filterText) {
      return await this.page.locator(`${selector}:has-text("${filterText}")`).count();
    }
    return await this.page.locator(selector).count();
  }

  /**
   * Select from dropdown using specific criteria
   */
  async selectSpecificOption(selectSelector: string, optionText: string): Promise<void> {
    const select = this.page.locator(selectSelector);
    
    // Try different selection methods
    try {
      // Method 1: Direct selection by label
      await select.selectOption({ label: optionText });
    } catch {
      try {
        // Method 2: Selection by partial text match
        const options = await select.locator('option').all();
        for (const option of options) {
          const text = await option.textContent();
          if (text?.includes(optionText)) {
            const value = await option.getAttribute('value');
            if (value) {
              await select.selectOption(value);
              return;
            }
          }
        }
      } catch {
        // Method 3: Click-based selection for custom dropdowns
        await select.click();
        await this.page.click(`[role="option"]:has-text("${optionText}")`);
      }
    }
  }

  /**
   * Create project phases for a test project
   */
  async createProjectPhases(context: TestDataContext, projectId: string, phaseCount: number = 2): Promise<any[]> {
    const phases = [];
    
    try {
      // Get available phases
      const phasesResponse = await this.apiContext.get(`${this.baseURL}/api/phases`);
      const availablePhases = await phasesResponse.json();
      const phasesArray = availablePhases.data || availablePhases || [];
      
      if (phasesArray.length === 0) {
        // Create a custom phase if no standard phases exist
        const startDate = new Date();
        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + 1);
        
        const customPhaseResponse = await this.apiContext.post(`${this.baseURL}/api/project-phases/custom`, {
          data: {
            project_id: projectId,
            phase_name: `${context.prefix}-Custom-Phase-1`,
            description: 'Test custom phase',
            start_date: startDate.toISOString().split('T')[0],
            end_date: endDate.toISOString().split('T')[0],
            order_index: 1
          }
        });
        
        const customPhase = await customPhaseResponse.json();
        if (customPhase.id) {
          context.createdIds.projectPhases.push(customPhase.id);
          phases.push(customPhase);
        }
      } else {
        // Use standard phases
        const startDate = new Date();
        
        for (let i = 0; i < Math.min(phaseCount, phasesArray.length); i++) {
          const phase = phasesArray[i];
          const phaseStartDate = new Date(startDate);
          phaseStartDate.setMonth(phaseStartDate.getMonth() + i * 2);
          const phaseEndDate = new Date(phaseStartDate);
          phaseEndDate.setMonth(phaseEndDate.getMonth() + 1);
          
          const response = await this.apiContext.post(`${this.baseURL}/api/project-phases`, {
            data: {
              project_id: projectId,
              phase_id: phase.id,
              start_date: phaseStartDate.toISOString().split('T')[0],
              end_date: phaseEndDate.toISOString().split('T')[0]
            }
          });
          
          const projectPhase = await response.json();
          if (projectPhase.id) {
            context.createdIds.projectPhases.push(projectPhase.id);
            phases.push(projectPhase);
          }
        }
      }
    } catch (error) {
      console.error('Error creating project phases:', error);
    }
    
    return phases;
  }

  /**
   * Create test data in bulk
   */
  async createBulkTestData(context: TestDataContext, options: {
    projects?: number;
    people?: number;
    assignments?: number;
    scenarios?: number;
    includePhases?: boolean;
  }): Promise<{
    projects: any[];
    people: any[];
    assignments: any[];
    scenarios: any[];
  }> {
    const result = {
      projects: [] as any[],
      people: [] as any[],
      assignments: [] as any[],
      scenarios: [] as any[]
    };
    
    // Create people
    for (let i = 0; i < (options.people || 0); i++) {
      const person = await this.createTestUser(context, {
        name: `${context.prefix}-Person-${i + 1}`
      });
      result.people.push(person);
    }
    
    // Create projects
    for (let i = 0; i < (options.projects || 0); i++) {
      const project = await this.createTestProject(context, {
        name: `${context.prefix}-Project-${i + 1}`,
        owner: result.people[i % result.people.length]
      });
      result.projects.push(project);
      
      // Create phases for each project if requested
      if (options.includePhases) {
        await this.createProjectPhases(context, project.id, 2);
      }
    }
    
    // Create scenarios
    for (let i = 0; i < (options.scenarios || 0); i++) {
      const scenario = await this.createTestScenario(context, {
        name: `${context.prefix}-Scenario-${i + 1}`,
        type: ['what-if', 'baseline', 'forecast'][i % 3] as any
      });
      result.scenarios.push(scenario);
    }
    
    // Create assignments
    for (let i = 0; i < (options.assignments || 0); i++) {
      const assignment = await this.createTestAssignment(context, {
        project: result.projects[i % result.projects.length],
        person: result.people[i % result.people.length],
        allocation: 20 + (i * 10) % 60
      });
      result.assignments.push(assignment);
    }
    
    return result;
  }

  /**
   * Verify element exists with specific text
   */
  async verifyElementExists(selector: string, text: string): Promise<boolean> {
    const count = await this.page.locator(`${selector}:has-text("${text}")`).count();
    return count > 0;
  }

  /**
   * Get text from specific element (not .first())
   */
  async getSpecificElementText(selector: string, identifier: string): Promise<string> {
    const element = await this.findByTestData(selector, identifier);
    return await element.textContent() || '';
  }

  /**
   * Fill form with test data
   */
  async fillTestForm(formData: Record<string, any>, context: TestDataContext): Promise<void> {
    for (const [field, value] of Object.entries(formData)) {
      const fieldValue = typeof value === 'string' && value.includes('{{prefix}}') 
        ? value.replace('{{prefix}}', context.prefix)
        : value;
        
      // Try different input methods
      try {
        // Method 1: Fill by name attribute
        await this.page.fill(`[name="${field}"]`, fieldValue);
      } catch {
        try {
          // Method 2: Fill by label
          await this.page.fill(`label:has-text("${field}") + input`, fieldValue);
        } catch {
          // Method 3: Fill by placeholder
          await this.page.fill(`[placeholder*="${field}"]`, fieldValue);
        }
      }
    }
  }

  /**
   * Perform action and wait for response
   */
  async performActionWithResponse(
    action: () => Promise<void>,
    urlPattern: string,
    method: string = 'POST'
  ): Promise<any> {
    const responsePromise = this.page.waitForResponse(response =>
      response.url().includes(urlPattern) &&
      response.request().method() === method
    );
    
    await action();
    
    const response = await responsePromise;
    return await response.json();
  }

  /**
   * Navigate to specific item instead of using .first()
   */
  async navigateToSpecificItem(listSelector: string, itemIdentifier: string): Promise<void> {
    const item = await this.findByTestData(listSelector, itemIdentifier);
    await item.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Verify no hardcoded IDs are used
   */
  validateNoHardcodedIds(testCode: string): boolean {
    // Check for common hardcoded ID patterns
    const hardcodedIdPatterns = [
      /123e4567-e89b-12d3-a456-426614174000/g,  // Specific UUID
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,  // Any UUID
      /id:\s*['"][0-9]+['"]]/g,  // Numeric IDs
      /\.first\(\)/g,  // Using .first()
      /\.nth\(0\)/g,  // Using .nth(0)
    ];
    
    for (const pattern of hardcodedIdPatterns) {
      if (pattern.test(testCode)) {
        console.warn(`⚠️ Hardcoded ID or .first() usage detected: ${pattern}`);
        return false;
      }
    }
    
    return true;
  }
}