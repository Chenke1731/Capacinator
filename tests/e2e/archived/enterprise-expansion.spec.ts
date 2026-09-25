import { test, expect } from './fixtures'
import { TestDataGenerator } from './helpers/test-data-generator';
test.describe('Enterprise Expansion Scenario', () => {
  let testDataGenerator: TestDataGenerator;
  let testData: any;
  test.beforeEach(async ({ request }) => {
    testDataGenerator = new TestDataGenerator(request);
    // Generate comprehensive test data for enterprise expansion
    testData = await testDataGenerator.generateEnterpriseExpansionData();
  });
  test('should handle complex enterprise expansion with multi-location resource allocation', async ({ authenticatedPage, testHelpers }) => {
    // Navigate to the main dashboard
    await testHelpers.navigateTo('/');
    // Verify dashboard loads with enterprise data
    await expect(authenticatedPage.locator('h1')).toContainText('Dashboard');
    // Test 1: Verify locations are properly set up
    await authenticatedPage.click('nav [href="/locations"]');
    await expect(authenticatedPage.locator('.location-card')).toHaveCount(4); // SF, NYC, London, Berlin
    // Verify each location shows correct employee count
    const sfLocation = authenticatedPage.locator('.location-card:has-text("San Francisco")');
    await expect(sfLocation.locator('.employee-count')).toContainText('employees');
    // Test 2: Verify organizational hierarchy in people page
    await authenticatedPage.click('nav [href="/people"]');
    await expect(authenticatedPage.locator('.person-card')).toHaveCount(testData.employees.length);
    // Check that VPs, Directors, and Managers are displayed correctly
    const vpCard = authenticatedPage.locator('.person-card:has-text("VP")').first();
    await expect(vpCard).toBeVisible();
    await expect(vpCard.locator('.person-title')).toContainText('VP');
    // Test 3: Verify project portfolio management
    await authenticatedPage.click('nav [href="/projects"]');
    await expect(authenticatedPage.locator('.project-card')).toHaveCount(testData.projects.length);
    // Check AI/ML Platform project
    const aiProject = authenticatedPage.locator('.project-card:has-text("AI/ML Platform")').first();
    await expect(aiProject).toBeVisible();
    await expect(aiProject.locator('.project-priority')).toContainText('HIGH');
    // Test 4: Navigate to project details and verify demand curve
    await aiProject.click();
    await expect(authenticatedPage.locator('h1')).toContainText('AI/ML Platform');
    // Verify demand curve section is present
    await expect(authenticatedPage.locator('.demand-curve-section')).toBeVisible();
    await expect(authenticatedPage.locator('.demand-chart')).toBeVisible();
    // Check that demand curve shows resource requirements over time
    const demandChart = authenticatedPage.locator('.demand-chart');
    await expect(demandChart.locator('.recharts-line')).toBeVisible();
    await expect(demandChart.locator('.recharts-tooltip')).toBeVisible();
    // Test 5: Verify assignments and resource allocation
    await authenticatedPage.click('nav [href="/assignments"]');
    await expect(authenticatedPage.locator('.assignment-row')).toHaveCount(testData.assignments.length);
    // Check for over-allocation warnings
    const overAllocated = authenticatedPage.locator('.assignment-row.over-allocated');
    if (await overAllocated.count() > 0) {
      await expect(overAllocated.first().locator('.allocation-warning')).toBeVisible();
    }
    // Test 6: Verify capacity planning and reporting
    await authenticatedPage.click('nav [href="/reports"]');
    await expect(authenticatedPage.locator('.report-section')).toBeVisible();
    // Generate capacity report
    await authenticatedPage.click('button:has-text("Generate Capacity Report")');
    await expect(authenticatedPage.locator('.capacity-report')).toBeVisible();
    // Verify report shows capacity gaps by location
    const capacityByLocation = authenticatedPage.locator('.capacity-by-location');
    await expect(capacityByLocation).toBeVisible();
    await expect(capacityByLocation.locator('.location-capacity')).toHaveCount(4);
    // Test 7: Verify person allocation charts
    await authenticatedPage.click('nav [href="/people"]');
    const firstPerson = authenticatedPage.locator('.person-card').first();
    await firstPerson.click();
    // Check person details page has allocation chart
    await expect(authenticatedPage.locator('.allocation-chart-section')).toBeVisible();
    const allocationChart = authenticatedPage.locator('.allocation-chart');
    await expect(allocationChart.locator('.recharts-area')).toBeVisible();
    // Verify utilization trends are displayed
    await expect(allocationChart.locator('.utilization-trend')).toBeVisible();
    // Test 8: Test availability overrides impact
    await authenticatedPage.click('button:has-text("Edit")');
    await authenticatedPage.click('button:has-text("Add Time Off")');
    // Add vacation override
    await authenticatedPage.fill('input[name="start_date"]', '2025-08-01');
    await authenticatedPage.fill('input[name="end_date"]', '2025-08-15');
    await authenticatedPage.selectOption('select[name="override_type"]', 'VACATION');
    await authenticatedPage.fill('input[name="availability_percentage"]', '0');
    await authenticatedPage.fill('textarea[name="reason"]', 'Annual vacation');
    await authenticatedPage.click('button:has-text("Save Override")');
    // Verify override appears in the list
    await expect(authenticatedPage.locator('.override-item:has-text("VACATION")')).toBeVisible();
    // Test 9: Verify project phase management
    await authenticatedPage.click('nav [href="/projects"]');
    await authenticatedPage.locator('.project-card').first().click();
    // Check project phases
    await expect(authenticatedPage.locator('.project-phases')).toBeVisible();
    await expect(authenticatedPage.locator('.phase-item')).toHaveCount(testData.projectPhases.filter(p => p.project_id === testData.projects[0].id).length);
    // Test 10: Emergency project scenario
    await authenticatedPage.click('nav [href="/projects"]');
    await authenticatedPage.click('button:has-text("New Project")');
    // Create emergency project
    await authenticatedPage.fill('input[name="name"]', 'EMERGENCY: Security Breach Response');
    await authenticatedPage.selectOption('select[name="project_type_id"]', testData.projectTypes[0].id);
    await authenticatedPage.selectOption('select[name="location_id"]', testData.locations[0].id);
    await authenticatedPage.selectOption('select[name="priority"]', '1'); // Highest priority
    await authenticatedPage.fill('textarea[name="description"]', 'Critical security incident response');
    await authenticatedPage.check('input[name="include_in_demand"]');
    await authenticatedPage.fill('input[name="aspiration_start"]', '2025-07-10');
    await authenticatedPage.fill('input[name="aspiration_finish"]', '2025-07-24');
    await authenticatedPage.click('button:has-text("Create Project")');
    // Verify emergency project was created
    await expect(authenticatedPage.locator('.project-card:has-text("EMERGENCY")')).toBeVisible();
    // Test 11: Resource conflict detection
    await authenticatedPage.click('nav [href="/assignments"]');
    await authenticatedPage.click('button:has-text("Bulk Assign")');
    // Try to assign key person to emergency project (should create conflict)
    const keyPerson = testData.employees.find(e => e.title?.includes('Senior'));
    if (keyPerson) {
      await authenticatedPage.selectOption('select[name="person_id"]', keyPerson.id);
      await authenticatedPage.selectOption('select[name="project_id"]', testData.projects[0].id);
      await authenticatedPage.fill('input[name="allocation_percentage"]', '80');
      await authenticatedPage.fill('input[name="start_date"]', '2025-07-10');
      await authenticatedPage.fill('input[name="end_date"]', '2025-07-24');
      await authenticatedPage.click('button:has-text("Check Conflicts")');
      // Should show conflict warning
      await expect(authenticatedPage.locator('.conflict-warning')).toBeVisible();
      await expect(authenticatedPage.locator('.conflict-message')).toContainText('over-allocated');
    }
    // Test 12: Executive reporting dashboard
    await authenticatedPage.click('nav [href="/reports"]');
    await authenticatedPage.click('button:has-text("Executive Dashboard")');
    // Verify executive dashboard components
    await expect(authenticatedPage.locator('.executive-summary')).toBeVisible();
    await expect(authenticatedPage.locator('.portfolio-health')).toBeVisible();
    await expect(authenticatedPage.locator('.resource-utilization')).toBeVisible();
    await expect(authenticatedPage.locator('.risk-indicators')).toBeVisible();
    // Check portfolio health metrics
    const portfolioHealth = authenticatedPage.locator('.portfolio-health');
    await expect(portfolioHealth.locator('.health-metric')).toHaveCount(4); // One per location
    await expect(portfolioHealth.locator('.health-score')).toBeVisible();
    // Test 13: Multi-timezone handling
    await authenticatedPage.click('nav [href="/assignments"]');
    // Create assignment spanning multiple timezones
    await authenticatedPage.click('button:has-text("New Assignment")');
    const londonPerson = testData.employees.find(e => e.location_id === testData.locations.find(l => l.name === 'London')?.id);
    const sfProject = testData.projects.find(p => p.location_id === testData.locations.find(l => l.name === 'San Francisco')?.id);
    if (londonPerson && sfProject) {
      await authenticatedPage.selectOption('select[name="person_id"]', londonPerson.id);
      await authenticatedPage.selectOption('select[name="project_id"]', sfProject.id);
      await authenticatedPage.fill('input[name="allocation_percentage"]', '40');
      await authenticatedPage.fill('input[name="start_date"]', '2025-07-15');
      await authenticatedPage.fill('input[name="end_date"]', '2025-09-15');
      await authenticatedPage.click('button:has-text("Create Assignment")');
      // Verify assignment was created with timezone considerations
      await expect(authenticatedPage.locator('.assignment-row:has-text("London")')).toBeVisible();
      await expect(authenticatedPage.locator('.assignment-row:has-text("San Francisco")')).toBeVisible();
    }
    // Test 14: Demand vs capacity reconciliation
    await authenticatedPage.click('nav [href="/reports"]');
    await authenticatedPage.click('button:has-text("Demand vs Capacity")');
    // Verify demand vs capacity report
    await expect(authenticatedPage.locator('.demand-capacity-report')).toBeVisible();
    await expect(authenticatedPage.locator('.demand-chart')).toBeVisible();
    await expect(authenticatedPage.locator('.capacity-chart')).toBeVisible();
    // Check for capacity gaps
    const capacityGaps = authenticatedPage.locator('.capacity-gap');
    if (await capacityGaps.count() > 0) {
      await expect(capacityGaps.first().locator('.gap-details')).toBeVisible();
      await expect(capacityGaps.first().locator('.gap-recommendations')).toBeVisible();
    }
    // Test 15: Skills gap analysis
    await authenticatedPage.click('button:has-text("Skills Analysis")');
    await expect(authenticatedPage.locator('.skills-gap-analysis')).toBeVisible();
    // Verify skills demand vs supply
    const skillsChart = authenticatedPage.locator('.skills-demand-chart');
    await expect(skillsChart.locator('.recharts-bar')).toBeVisible();
    await expect(skillsChart.locator('.skill-gap')).toBeVisible();
  });
  test('should handle complex resource reallocation scenarios', async ({ authenticatedPage, testHelpers }) => {
    await testHelpers.navigateTo('/assignments');
    // Test resource reallocation when project priorities change
    await authenticatedPage.click('nav [href="/projects"]');
    // Change project priority
    const project = authenticatedPage.locator('.project-card').first();
    await project.click();
    await authenticatedPage.click('button:has-text("Edit")');
    await authenticatedPage.selectOption('select[name="priority"]', '1'); // Increase priority
    await authenticatedPage.click('button:has-text("Save")');
    // Verify assignments are suggested for reallocation
    await authenticatedPage.click('nav [href="/assignments"]');
    await expect(authenticatedPage.locator('.reallocation-suggestion')).toBeVisible();
    // Test bulk reallocation
    await authenticatedPage.click('button:has-text("Bulk Reallocation")');
    await authenticatedPage.check('input[name="auto_resolve_conflicts"]');
    await authenticatedPage.click('button:has-text("Apply Reallocation")');
    // Verify reallocation was successful
    await expect(authenticatedPage.locator('.reallocation-success')).toBeVisible();
  });
  test('should validate data integrity across all operations', async ({ authenticatedPage, testHelpers }) => {
    await testHelpers.navigateTo('/');
    // Test data consistency across different views
    await authenticatedPage.click('nav [href="/people"]');
    const peopleCount = await authenticatedPage.locator('.person-card').count();
    await authenticatedPage.click('nav [href="/assignments"]');
    const assignmentsCount = await authenticatedPage.locator('.assignment-row').count();
    await authenticatedPage.click('nav [href="/reports"]');
    await authenticatedPage.click('button:has-text("Data Integrity Report")');
    // Verify data integrity metrics
    await expect(authenticatedPage.locator('.integrity-metric:has-text("People")')).toContainText(peopleCount.toString());
    await expect(authenticatedPage.locator('.integrity-metric:has-text("Assignments")')).toContainText(assignmentsCount.toString());
    // Test constraint validation
    await expect(authenticatedPage.locator('.constraint-violations')).toHaveCount(0);
    await expect(authenticatedPage.locator('.data-inconsistencies')).toHaveCount(0);
  });
  test.afterEach(async ({ request }) => {
    // Clean up test data
    await testDataGenerator.cleanup();
  });
});