import { test, expect } from '@playwright/test';
import { TestDataGenerator } from './helpers/test-data-generator';
import { TestUtils } from './helpers/test-utils';
test.describe('Agile Product Development Scenario', () => {
  let testDataGenerator: TestDataGenerator;
  let testUtils: TestUtils;
  let testData: any;
  test.beforeEach(async ({ page, request }) => {
    testDataGenerator = new TestDataGenerator(request);
    testUtils = new TestUtils(page);
    // Generate agile product development test data
    testData = await testDataGenerator.generateAgileProductData();
  });
  test('should handle sprint-based resource allocation across multiple product teams', async ({ page }) => {
    testUtils = new TestUtils(page);
    // Navigate to main dashboard
    await testUtils.navigateAndWait('/');
    // Test 1: Verify product teams are set up correctly
    await testUtils.navigateAndWait('/projects');
    // Check for main products
    await expect(page.locator('.project-card:has-text("Web App")')).toBeVisible();
    await expect(page.locator('.project-card:has-text("Mobile App")')).toBeVisible();
    await expect(page.locator('.project-card:has-text("API Platform")')).toBeVisible();
    // Test 2: Verify sprint-based project phases
    const webAppProject = page.locator('.project-card:has-text("Web App")').first();
    await webAppProject.click();
    // Check sprint phases
    await expect(page.locator('.project-phases')).toBeVisible();
    const sprintPhases = page.locator('.phase-item:has-text("Sprint")');
    await expect(sprintPhases).toHaveCount(8); // 2-week sprints over 4 months
    // Test 3: Verify cross-functional team composition
    await testUtils.navigateAndWait('/assignments');
    // Check that teams have all required roles
    const webAppAssignments = page.locator('.assignment-row:has-text("Web App")');
    await expect(webAppAssignments).toHaveCount(6); // Full cross-functional team
    // Verify roles are present
    await expect(page.locator('.assignment-row:has-text("Product Owner")')).toBeVisible();
    await expect(page.locator('.assignment-row:has-text("Scrum Master")')).toBeVisible();
    await expect(page.locator('.assignment-row:has-text("Frontend Developer")')).toBeVisible();
    await expect(page.locator('.assignment-row:has-text("Backend Developer")')).toBeVisible();
    await expect(page.locator('.assignment-row:has-text("QA Engineer")')).toBeVisible();
    await expect(page.locator('.assignment-row:has-text("UX Designer")')).toBeVisible();
    // Test 4: Verify shared resources across teams
    await testUtils.navigateAndWait('/people');
    // Check DevOps engineer assignments
    const devOpsEngineer = page.locator('.person-card:has-text("DevOps Engineer")').first();
    await devOpsEngineer.click();
    // Verify DevOps engineer is assigned to multiple products
    const assignments = page.locator('.assignment-card');
    await expect(assignments).toHaveCount(3); // Shared across all products
    // Test 5: Verify allocation vs availability for shared resources
    await testUtils.verifyPersonAllocationChart(testData.employees.find(e => e.title?.includes('DevOps'))?.id);
    // Check utilization is optimized but not over-allocated
    const utilizationChart = page.locator('.utilization-chart');
    await expect(utilizationChart).toBeVisible();
    // Test 6: Sprint planning and capacity management
    await testUtils.navigateAndWait('/projects');
    await page.locator('.project-card:has-text("Web App")').first().click();
    // Check sprint capacity planning
    await expect(page.locator('.sprint-capacity')).toBeVisible();
    const sprintCapacity = page.locator('.sprint-capacity-item');
    await expect(sprintCapacity).toHaveCount(8); // 8 sprints planned
    // Test 7: Verify ceremony time allocation
    await testUtils.navigateAndWait('/assignments');
    // Check that sprint ceremonies are accounted for
    const ceremonyAllocations = page.locator('.assignment-row:has-text("Sprint Planning"), .assignment-row:has-text("Daily Standup"), .assignment-row:has-text("Sprint Review"), .assignment-row:has-text("Retrospective")');
    await expect(ceremonyAllocations).toHaveCount(4); // All ceremonies covered
    // Test 8: Test technical debt sprint handling
    await testUtils.createProject({
      name: 'Technical Debt Sprint - Web App',
      projectTypeId: testData.projectTypes.find(pt => pt.name === 'Technical Debt')?.id,
      locationId: testData.locations[0].id,
      priority: 3,
      description: 'Dedicated sprint for technical debt reduction',
      includeInDemand: true,
      aspirationStart: '2025-08-01',
      aspirationFinish: '2025-08-15',
      ownerId: testData.employees.find(e => e.title?.includes('Tech Lead'))?.id
    });
    // Verify technical debt sprint has different resource allocation
    await testUtils.navigateAndWait('/projects');
    const techDebtProject = page.locator('.project-card:has-text("Technical Debt Sprint")');
    await expect(techDebtProject).toBeVisible();
    // Test 9: Production support impact on development capacity
    await testUtils.navigateAndWait('/people');
    const seniorDev = page.locator('.person-card:has-text("Senior Developer")').first();
    await seniorDev.click();
    // Add production support availability override
    await testUtils.addAvailabilityOverride({
      personId: testData.employees.find(e => e.title?.includes('Senior Developer'))?.id,
      startDate: '2025-07-15',
      endDate: '2025-07-22',
      availabilityPercentage: 70, // 30% for production support
      overrideType: 'PRODUCTION_SUPPORT',
      reason: 'On-call rotation for production support'
    });
    // Verify production support reduces development capacity
    await testUtils.verifyPersonAllocationChart(testData.employees.find(e => e.title?.includes('Senior Developer'))?.id);
    // Test 10: Cross-team resource sharing for high-demand periods
    await testUtils.navigateAndWait('/assignments');
    // Simulate high-demand period requiring resource sharing
    const mobileDev = testData.employees.find(e => e.title?.includes('Mobile Developer'));
    if (mobileDev) {
      await testUtils.createAssignment({
        personId: mobileDev.id,
        projectId: testData.projects.find(p => p.name.includes('Web App'))?.id,
        roleId: testData.roles.find(r => r.name === 'Frontend Developer')?.id,
        startDate: '2025-08-01',
        endDate: '2025-08-15',
        allocationPercentage: 30
      });
    }
    // Verify cross-team assignment was created
    await expect(page.locator('.assignment-row:has-text("Mobile Developer"):has-text("Web App")')).toBeVisible();
    // Test 11: Feature flag impact on development timelines
    await testUtils.navigateAndWait('/projects');
    const webAppProject2 = page.locator('.project-card:has-text("Web App")').first();
    await webAppProject2.click();
    // Add feature flag milestone
    await page.click('button:has-text("Add Milestone")');
    await page.fill('input[name="milestone_name"]', 'Feature Flag Implementation');
    await page.fill('input[name="milestone_date"]', '2025-08-15');
    await page.fill('textarea[name="milestone_description"]', 'Deploy feature behind flag');
    await page.click('button:has-text("Add Milestone")');
    // Verify milestone impacts project timeline
    await expect(page.locator('.milestone-item:has-text("Feature Flag")')).toBeVisible();
    // Test 12: New team member onboarding impact
    await testUtils.navigateAndWait('/people');
    await page.click('button:has-text("New Person")');
    // Create new junior developer
    await page.fill('input[name="name"]', 'Junior Developer - New Hire');
    await page.fill('input[name="email"]', 'junior.new@company.com');
    await page.fill('input[name="title"]', 'Junior Frontend Developer');
    await page.selectOption('select[name="location_id"]', testData.locations[0].id);
    await page.selectOption('select[name="primary_role_id"]', testData.roles.find(r => r.name === 'Frontend Developer')?.id);
    await page.fill('input[name="default_hours_per_day"]', '8');
    await page.fill('input[name="default_availability_percentage"]', '60'); // Reduced during onboarding
    await page.selectOption('select[name="worker_type"]', 'FTE');
    await page.click('button:has-text("Create Person")');
    // Verify new hire has reduced initial capacity
    const newHire = page.locator('.person-card:has-text("Junior Developer - New Hire")');
    await expect(newHire).toBeVisible();
    await newHire.click();
    await expect(page.locator('.info-value:has-text("60%")')).toBeVisible();
    // Test 13: Contractor integration during high-demand periods
    await testUtils.navigateAndWait('/people');
    await page.click('button:has-text("New Person")');
    // Create contractor
    await page.fill('input[name="name"]', 'React Contractor - High Demand');
    await page.fill('input[name="email"]', 'contractor@consulting.com');
    await page.fill('input[name="title"]', 'Senior React Developer');
    await page.selectOption('select[name="location_id"]', testData.locations[0].id);
    await page.selectOption('select[name="primary_role_id"]', testData.roles.find(r => r.name === 'Frontend Developer')?.id);
    await page.fill('input[name="default_hours_per_day"]', '8');
    await page.fill('input[name="default_availability_percentage"]', '100');
    await page.selectOption('select[name="worker_type"]', 'CONTRACT');
    await page.fill('input[name="start_date"]', '2025-08-01');
    await page.fill('input[name="end_date"]', '2025-10-31');
    await page.click('button:has-text("Create Person")');
    // Verify contractor has limited duration
    const contractor = page.locator('.person-card:has-text("React Contractor")');
    await expect(contractor).toBeVisible();
    // Test 14: Knowledge transfer between teams
    await testUtils.navigateAndWait('/assignments');
    // Create knowledge transfer assignment
    const techLead = testData.employees.find(e => e.title?.includes('Tech Lead'));
    if (techLead) {
      await testUtils.createAssignment({
        personId: techLead.id,
        projectId: testData.projects.find(p => p.name.includes('Mobile App'))?.id,
        roleId: testData.roles.find(r => r.name === 'Tech Lead')?.id,
        startDate: '2025-08-01',
        endDate: '2025-08-08',
        allocationPercentage: 25
      });
    }
    // Verify knowledge transfer assignment
    await expect(page.locator('.assignment-row:has-text("Tech Lead"):has-text("Mobile App")')).toBeVisible();
    // Test 15: Validate agile metrics and reporting
    await testUtils.navigateAndWait('/reports');
    await page.click('button:has-text("Agile Metrics")');
    // Verify agile-specific metrics
    await expect(page.locator('.velocity-chart')).toBeVisible();
    await expect(page.locator('.sprint-burndown')).toBeVisible();
    await expect(page.locator('.team-capacity')).toBeVisible();
    // Check sprint capacity vs velocity
    const velocityChart = page.locator('.velocity-chart');
    await testUtils.verifyChartRendered('.velocity-chart');
    // Verify team utilization across sprints
    await expect(page.locator('.sprint-utilization')).toBeVisible();
    const utilizationData = page.locator('.utilization-metric');
    await expect(utilizationData).toHaveCount(3); // One per product team
  });
  test('should handle production emergencies affecting sprint capacity', async ({ page }) => {
    testUtils = new TestUtils(page);
    // Navigate to assignments
    await testUtils.navigateAndWait('/assignments');
    // Simulate production emergency
    await testUtils.createProject({
      name: 'PRODUCTION EMERGENCY: Critical Bug Fix',
      projectTypeId: testData.projectTypes.find(pt => pt.name === 'Bug Fix')?.id,
      locationId: testData.locations[0].id,
      priority: 1,
      description: 'Critical production issue requiring immediate attention',
      includeInDemand: true,
      aspirationStart: '2025-07-10',
      aspirationFinish: '2025-07-11',
      ownerId: testData.employees.find(e => e.title?.includes('Tech Lead'))?.id
    });
    // Assign developers to emergency
    const seniorDevs = testData.employees.filter(e => e.title?.includes('Senior Developer'));
    for (const dev of seniorDevs.slice(0, 2)) {
      await testUtils.createAssignment({
        personId: dev.id,
        projectId: testData.projects.find(p => p.name.includes('PRODUCTION EMERGENCY'))?.id,
        roleId: testData.roles.find(r => r.name === 'Backend Developer')?.id,
        startDate: '2025-07-10',
        endDate: '2025-07-11',
        allocationPercentage: 100
      });
    }
    // Verify emergency assignments created conflicts
    await testUtils.verifyAssignmentConflicts(2);
    // Test demand override for critical projects
    await testUtils.navigateAndWait('/projects');
    const emergencyProject = page.locator('.project-card:has-text("PRODUCTION EMERGENCY")');
    await emergencyProject.click();
    // Apply demand override
    await page.click('button:has-text("Apply Demand Override")');
    await page.selectOption('select[name="override_type"]', 'CRITICAL');
    await page.fill('textarea[name="justification"]', 'Production system down');
    await page.click('button:has-text("Apply Override")');
    // Verify override affects resource allocation
    await expect(page.locator('.demand-override-active')).toBeVisible();
  });
  test.afterEach(async ({ request }) => {
    // Clean up test data
    await testDataGenerator.cleanup();
  });
});