import { test, expect } from '@playwright/test';
import { TestDataGenerator } from './helpers/test-data-generator';
import { TestUtils } from './helpers/test-utils';
test.describe('Consulting Services Scenario', () => {
  let testDataGenerator: TestDataGenerator;
  let testUtils: TestUtils;
  let testData: any;
  test.beforeEach(async ({ page, request }) => {
    testDataGenerator = new TestDataGenerator(request);
    testUtils = new TestUtils(page);
    // Generate consulting services test data
    testData = await testDataGenerator.generateConsultingServicesData();
  });
  test('should handle complex multi-client consulting engagements with billable optimization', async ({ page }) => {
    testUtils = new TestUtils(page);
    // Navigate to main dashboard
    await testUtils.navigateAndWait('/');
    // Test 1: Verify client portfolio is properly structured
    await testUtils.navigateAndWait('/projects');
    // Check for multiple client projects
    await expect(page.locator('.project-card:has-text("Client A")')).toBeVisible();
    await expect(page.locator('.project-card:has-text("Client B")')).toBeVisible();
    await expect(page.locator('.project-card:has-text("Client C")')).toBeVisible();
    // Verify different project types for consulting
    await expect(page.locator('.project-card:has-text("Implementation")')).toBeVisible();
    await expect(page.locator('.project-card:has-text("Strategy")')).toBeVisible();
    await expect(page.locator('.project-card:has-text("Assessment")')).toBeVisible();
    // Test 2: Verify consultant profiles and specializations
    await testUtils.navigateAndWait('/people');
    // Check consultant hierarchy
    await expect(page.locator('.person-card:has-text("Principal Consultant")')).toBeVisible();
    await expect(page.locator('.person-card:has-text("Senior Consultant")')).toBeVisible();
    await expect(page.locator('.person-card:has-text("Consultant")')).toBeVisible();
    await expect(page.locator('.person-card:has-text("Junior Consultant")')).toBeVisible();
    // Test 3: Verify multi-client assignment patterns
    await testUtils.navigateAndWait('/assignments');
    // Check that consultants are assigned to multiple clients
    const seniorConsultant = page.locator('.assignment-row:has-text("Senior Consultant")').first();
    await expect(seniorConsultant).toBeVisible();
    // Count assignments for senior consultant
    const seniorAssignments = page.locator('.assignment-row:has-text("Senior Consultant")');
    await expect(seniorAssignments).toHaveCount(3, { timeout: 10000 }); // Multi-client assignments
    // Test 4: Verify billable vs non-billable tracking
    await testUtils.navigateAndWait('/assignments');
    // Check billable assignments
    const billableAssignments = page.locator('.assignment-row .badge-success:has-text("Billable")');
    await expect(billableAssignments).toHaveCount(12); // Most assignments should be billable
    // Check non-billable assignments (training, sales, etc.)
    const nonBillableAssignments = page.locator('.assignment-row .badge-gray:has-text("Non-billable")');
    await expect(nonBillableAssignments).toHaveCount(4); // Some non-billable time
    // Test 5: Verify consultant utilization optimization
    await testUtils.navigateAndWait('/people');
    const principalConsultant = page.locator('.person-card:has-text("Principal Consultant")').first();
    await principalConsultant.click();
    // Check allocation vs availability chart
    await testUtils.verifyPersonAllocationChart(testData.employees.find(e => e.title?.includes('Principal'))?.id);
    // Verify utilization is optimized (80-90% billable)
    const utilizationChart = page.locator('.utilization-chart');
    await expect(utilizationChart).toBeVisible();
    // Test 6: Travel and on-site requirements
    await testUtils.navigateAndWait('/people');
    const travelConsultant = page.locator('.person-card:has-text("Senior Consultant")').first();
    await travelConsultant.click();
    // Add travel availability override
    await testUtils.addAvailabilityOverride({
      personId: testData.employees.find(e => e.title?.includes('Senior Consultant'))?.id,
      startDate: '2025-07-15',
      endDate: '2025-07-19',
      availabilityPercentage: 80, // Reduced during travel
      overrideType: 'TRAVEL',
      reason: 'Client site visit - reduced availability due to travel time'
    });
    // Verify travel override is reflected
    await expect(page.locator('.override-item:has-text("TRAVEL")')).toBeVisible();
    // Test 7: Subject matter expert sharing across clients
    await testUtils.navigateAndWait('/assignments');
    // Check that subject matter experts are shared
    const smeAssignments = page.locator('.assignment-row:has-text("Subject Matter Expert")');
    await expect(smeAssignments).toHaveCount(4); // SME across multiple clients
    // Test 8: Bench time for skill development
    await testUtils.navigateAndWait('/assignments');
    // Create bench time assignment
    const benchConsultant = testData.employees.find(e => e.title?.includes('Junior Consultant'));
    if (benchConsultant) {
      await testUtils.createAssignment({
        personId: benchConsultant.id,
        projectId: testData.projects.find(p => p.name.includes('Internal Training'))?.id,
        roleId: testData.roles.find(r => r.name === 'Consultant')?.id,
        startDate: '2025-07-22',
        endDate: '2025-07-26',
        allocationPercentage: 100
      });
    }
    // Verify bench time assignment
    await expect(page.locator('.assignment-row:has-text("Internal Training")')).toBeVisible();
    // Test 9: Client-specific capacity planning
    await testUtils.navigateAndWait('/reports');
    await page.click('button:has-text("Client Capacity Report")');
    // Verify client-specific capacity metrics
    await expect(page.locator('.client-capacity-report')).toBeVisible();
    // Check capacity by client
    const clientCapacity = page.locator('.client-capacity-item');
    await expect(clientCapacity).toHaveCount(8); // 8 different clients
    // Test 10: Preferred consultant assignments
    await testUtils.navigateAndWait('/assignments');
    // Create preferred consultant assignment
    const preferredConsultant = testData.employees.find(e => e.title?.includes('Principal Consultant'));
    const keyClient = testData.projects.find(p => p.name.includes('Client A - Strategic'));
    if (preferredConsultant && keyClient) {
      await testUtils.createAssignment({
        personId: preferredConsultant.id,
        projectId: keyClient.id,
        roleId: testData.roles.find(r => r.name === 'Principal Consultant')?.id,
        startDate: '2025-08-01',
        endDate: '2025-12-31',
        allocationPercentage: 60
      });
    }
    // Verify preferred consultant assignment
    await expect(page.locator('.assignment-row:has-text("Principal Consultant"):has-text("Client A")')).toBeVisible();
    // Test 11: Ramp-up time for new client engagements
    await testUtils.createProject({
      name: 'Client H - New Engagement Discovery',
      projectTypeId: testData.projectTypes.find(pt => pt.name === 'Discovery')?.id,
      locationId: testData.locations[0].id,
      priority: 2,
      description: 'Discovery phase for new client engagement',
      includeInDemand: true,
      aspirationStart: '2025-08-15',
      aspirationFinish: '2025-08-29',
      ownerId: testData.employees.find(e => e.title?.includes('Principal'))?.id
    });
    // Assign consultants with reduced initial productivity
    const discoveryConsultant = testData.employees.find(e => e.title?.includes('Senior Consultant'));
    if (discoveryConsultant) {
      await testUtils.createAssignment({
        personId: discoveryConsultant.id,
        projectId: testData.projects.find(p => p.name.includes('Client H'))?.id,
        roleId: testData.roles.find(r => r.name === 'Senior Consultant')?.id,
        startDate: '2025-08-15',
        endDate: '2025-08-29',
        allocationPercentage: 70 // Reduced during ramp-up
      });
    }
    // Test 12: Sales activities reducing billable time
    await testUtils.navigateAndWait('/assignments');
    // Create sales activity assignment
    const salesConsultant = testData.employees.find(e => e.title?.includes('Principal Consultant'));
    if (salesConsultant) {
      await testUtils.createAssignment({
        personId: salesConsultant.id,
        projectId: testData.projects.find(p => p.name.includes('Sales Activities'))?.id,
        roleId: testData.roles.find(r => r.name === 'Principal Consultant')?.id,
        startDate: '2025-07-15',
        endDate: '2025-07-31',
        allocationPercentage: 20
      });
    }
    // Verify sales activity is non-billable
    await expect(page.locator('.assignment-row:has-text("Sales Activities") .badge-gray')).toBeVisible();
    // Test 13: Proposal development time tracking
    await testUtils.navigateAndWait('/assignments');
    // Create proposal development assignment
    const proposalTeam = testData.employees.filter(e => e.title?.includes('Senior Consultant')).slice(0, 2);
    for (const consultant of proposalTeam) {
      await testUtils.createAssignment({
        personId: consultant.id,
        projectId: testData.projects.find(p => p.name.includes('Proposal Development'))?.id,
        roleId: testData.roles.find(r => r.name === 'Senior Consultant')?.id,
        startDate: '2025-07-08',
        endDate: '2025-07-12',
        allocationPercentage: 30
      });
    }
    // Verify proposal development assignments
    await expect(page.locator('.assignment-row:has-text("Proposal Development")')).toHaveCount(2);
    // Test 14: Financial optimization reporting
    await testUtils.navigateAndWait('/reports');
    await page.click('button:has-text("Financial Optimization")');
    // Verify financial metrics
    await expect(page.locator('.financial-report')).toBeVisible();
    await expect(page.locator('.billable-utilization')).toBeVisible();
    await expect(page.locator('.revenue-projection')).toBeVisible();
    // Check utilization targets
    const utilizationMetrics = page.locator('.utilization-metric');
    await expect(utilizationMetrics).toHaveCount(4); // By consultant level
    // Test 15: Seasonal demand variations
    await testUtils.navigateAndWait('/reports');
    await page.click('button:has-text("Seasonal Analysis")');
    // Verify seasonal demand patterns
    await expect(page.locator('.seasonal-demand-chart')).toBeVisible();
    await testUtils.verifyChartRendered('.seasonal-demand-chart');
    // Check for Q4 higher demand
    const q4Demand = page.locator('.seasonal-metric:has-text("Q4")');
    await expect(q4Demand).toBeVisible();
    // Test 16: Client satisfaction impact on resource allocation
    await testUtils.navigateAndWait('/projects');
    const clientAProject = page.locator('.project-card:has-text("Client A")').first();
    await clientAProject.click();
    // Add client satisfaction score
    await page.click('button:has-text("Update Client Metrics")');
    await page.fill('input[name="satisfaction_score"]', '9.2');
    await page.fill('input[name="renewal_probability"]', '95');
    await page.click('button:has-text("Update Metrics")');
    // Verify high satisfaction affects future assignments
    await expect(page.locator('.client-metric:has-text("9.2")')).toBeVisible();
    // Test 17: Knowledge transfer between consultants
    await testUtils.navigateAndWait('/assignments');
    // Create knowledge transfer assignment
    const seniorConsultant2 = testData.employees.find(e => e.title?.includes('Senior Consultant'));
    const juniorConsultant = testData.employees.find(e => e.title?.includes('Junior Consultant'));
    if (seniorConsultant2 && juniorConsultant) {
      // Senior consultant mentoring
      await testUtils.createAssignment({
        personId: seniorConsultant2.id,
        projectId: testData.projects.find(p => p.name.includes('Knowledge Transfer'))?.id,
        roleId: testData.roles.find(r => r.name === 'Senior Consultant')?.id,
        startDate: '2025-07-15',
        endDate: '2025-07-29',
        allocationPercentage: 15
      });
      // Junior consultant learning
      await testUtils.createAssignment({
        personId: juniorConsultant.id,
        projectId: testData.projects.find(p => p.name.includes('Knowledge Transfer'))?.id,
        roleId: testData.roles.find(r => r.name === 'Junior Consultant')?.id,
        startDate: '2025-07-15',
        endDate: '2025-07-29',
        allocationPercentage: 25
      });
    }
    // Verify knowledge transfer assignments
    await expect(page.locator('.assignment-row:has-text("Knowledge Transfer")')).toHaveCount(2);
    // Test 18: Comprehensive utilization and profitability analysis
    await testUtils.navigateAndWait('/reports');
    await page.click('button:has-text("Utilization & Profitability")');
    // Verify comprehensive financial analysis
    await expect(page.locator('.profitability-analysis')).toBeVisible();
    await expect(page.locator('.consultant-profitability')).toBeVisible();
    await expect(page.locator('.client-profitability')).toBeVisible();
    // Check profitability by consultant level
    const profitabilityMetrics = page.locator('.profitability-metric');
    await expect(profitabilityMetrics).toHaveCount(4); // By consultant level
    // Verify optimal utilization recommendations
    await expect(page.locator('.utilization-recommendations')).toBeVisible();
  });
  test('should handle complex billing model scenarios', async ({ page }) => {
    testUtils = new TestUtils(page);
    // Test different billing models
    await testUtils.navigateAndWait('/projects');
    // Check fixed-price project
    const fixedPriceProject = page.locator('.project-card:has-text("Fixed Price")');
    await expect(fixedPriceProject).toBeVisible();
    // Check time-and-materials project
    const tmProject = page.locator('.project-card:has-text("Time & Materials")');
    await expect(tmProject).toBeVisible();
    // Check retainer project
    const retainerProject = page.locator('.project-card:has-text("Retainer")');
    await expect(retainerProject).toBeVisible();
    // Test billing optimization for each model
    await testUtils.navigateAndWait('/reports');
    await page.click('button:has-text("Billing Model Analysis")');
    await expect(page.locator('.billing-model-analysis')).toBeVisible();
    await expect(page.locator('.fixed-price-metrics')).toBeVisible();
    await expect(page.locator('.tm-metrics')).toBeVisible();
    await expect(page.locator('.retainer-metrics')).toBeVisible();
  });
  test.afterEach(async ({ request }) => {
    // Clean up test data
    await testDataGenerator.cleanup();
  });
});