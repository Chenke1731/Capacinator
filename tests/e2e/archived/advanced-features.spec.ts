/**
 * Advanced Reporting Features Tests
 * Tests for custom report building, scheduling, delivery, and advanced analytics
 * Uses dynamic test data for proper isolation
 */
import { test, expect, tags } from '../../fixtures';
import { TestDataContext } from '../../utils/test-data-helpers';
test.describe('Advanced Reporting Features', () => {
  let testContext: TestDataContext;
  let testData: any;
  test.beforeEach(async ({ testDataHelpers, testHelpers, apiContext }) => {
    // Create isolated test context
    testContext = testDataHelpers.createTestContext('advreports');
    // Create test data for advanced reporting features
    testData = await testDataHelpers.createBulkTestData(testContext, {
      projects: 4,
      people: 6,
      assignments: 10
    });
  });
  test.afterEach(async ({ testDataHelpers }) => {
    // Clean up all test data
    await testDataHelpers.cleanupTestContext(testContext);
  });
  test.describe('Custom Report Builder', () => {
    test(`${tags.reports} should access custom report builder interface`, async ({ 
      authenticatedPage, 
      testHelpers,
      testDataHelpers 
    }) => {
      await testHelpers.navigateTo('/reports/builder');
      // Verify report builder UI elements
      await expect(authenticatedPage.locator('h1:has-text("Report Builder")')).toBeVisible();
      await expect(authenticatedPage.locator('[data-testid="field-selector"]')).toBeVisible();
      await expect(authenticatedPage.locator('[data-testid="report-preview"]')).toBeVisible();
    });
    test(`${tags.reports} should select custom fields for reports`, async ({ 
      authenticatedPage, 
      testHelpers,
      testDataHelpers 
    }) => {
      await testHelpers.navigateTo('/reports/builder');
      // Select fields
      const fieldSelector = authenticatedPage.locator('[data-testid="field-selector"]');
      await fieldSelector.locator('input[value="project_name"]').check();
      await fieldSelector.locator('input[value="person_name"]').check();
      await fieldSelector.locator('input[value="allocation_percentage"]').check();
      // Verify preview updates
      const preview = authenticatedPage.locator('[data-testid="report-preview"]');
      await expect(preview.locator('th:has-text("Project")')).toBeVisible();
      await expect(preview.locator('th:has-text("Person")')).toBeVisible();
      await expect(preview.locator('th:has-text("Allocation")')).toBeVisible();
    });
    test(`${tags.reports} should create custom calculations and formulas`, async ({ 
      authenticatedPage, 
      testHelpers,
      testDataHelpers 
    }) => {
      await testHelpers.navigateTo('/reports/builder');
      // Add custom calculation
      await authenticatedPage.click('button:has-text("Add Calculation")');
      const modal = authenticatedPage.locator('[role="dialog"]');
      await modal.locator('input[name="calculation_name"]').fill(`${testContext.prefix}_Utilization_Rate`);
      await modal.locator('select[name="calculation_type"]').selectOption('formula');
      await modal.locator('textarea[name="formula"]').fill('SUM(allocation_percentage) / COUNT(DISTINCT person_id)');
      await modal.locator('button:has-text("Save")').click();
      // Verify calculation appears
      await expect(authenticatedPage.locator('[data-testid="calculations-list"]')).toContainText(`${testContext.prefix}_Utilization_Rate`);
    });
  });
  test.describe('Report Scheduling and Delivery', () => {
    test(`${tags.reports} should schedule report generation`, async ({ 
      authenticatedPage, 
      testHelpers,
      testDataHelpers 
    }) => {
      await testHelpers.navigateTo('/reports/schedule');
      // Create schedule
      await authenticatedPage.click('button:has-text("New Schedule")');
      const modal = authenticatedPage.locator('[role="dialog"]');
      await modal.locator('input[name="schedule_name"]').fill(`${testContext.prefix}_Weekly_Capacity_Report`);
      await modal.locator('select[name="report_type"]').selectOption('capacity');
      await modal.locator('select[name="frequency"]').selectOption('weekly');
      await modal.locator('input[name="day_of_week"]').selectOption('monday');
      await modal.locator('input[name="time"]').fill('09:00');
      await modal.locator('button:has-text("Save Schedule")').click();
      // Verify schedule created
      await expect(authenticatedPage.locator('table')).toContainText(`${testContext.prefix}_Weekly_Capacity_Report`);
    });
    test(`${tags.reports} should configure report delivery methods`, async ({ 
      authenticatedPage, 
      testHelpers,
      testDataHelpers 
    }) => {
      await testHelpers.navigateTo('/reports/delivery');
      // Configure email delivery
      await authenticatedPage.click('button:has-text("Add Delivery Method")');
      const modal = authenticatedPage.locator('[role="dialog"]');
      await modal.locator('select[name="delivery_type"]').selectOption('email');
      await modal.locator('input[name="recipients"]').fill(`${testContext.prefix}_team@example.com, ${testContext.prefix}_manager@example.com`);
      await modal.locator('input[name="subject_template"]').fill('{{report_name}} - {{date}}');
      await modal.locator('textarea[name="body_template"]').fill('Please find attached the {{report_name}} for {{date}}.');
      await modal.locator('button:has-text("Save")').click();
      // Verify delivery method saved
      await expect(authenticatedPage.locator('[data-testid="delivery-methods"]')).toContainText('Email');
    });
  });
  test.describe('Analytics and Insights', () => {
    test(`${tags.reports} should show trend analysis and forecasting`, async ({ 
      authenticatedPage, 
      testHelpers,
      testDataHelpers 
    }) => {
      await testHelpers.navigateTo('/reports');
      await authenticatedPage.click('button:has-text("Capacity Report")');
      // Enable trend analysis
      await authenticatedPage.click('button:has-text("Show Trends")');
      // Verify trend elements
      await expect(authenticatedPage.locator('[data-testid="trend-chart"]')).toBeVisible();
      await expect(authenticatedPage.locator('[data-testid="forecast-line"]')).toBeVisible();
      await expect(authenticatedPage.locator('[data-testid="confidence-interval"]')).toBeVisible();
    });
    test(`${tags.reports} should provide actionable insights and recommendations`, async ({ 
      authenticatedPage, 
      testHelpers,
      testDataHelpers 
    }) => {
      await testHelpers.navigateTo('/reports');
      await authenticatedPage.click('button:has-text("Gaps Analysis")');
      // Check insights panel
      const insights = authenticatedPage.locator('[data-testid="insights-panel"]');
      await expect(insights).toBeVisible();
      // Verify recommendations
      await expect(insights.locator('.recommendation')).toHaveCount(3, { timeout: 10000 });
      await expect(insights).toContainText('Consider hiring');
      await expect(insights).toContainText('Optimize allocation');
    });
    test(`${tags.reports} should enable drill-down analysis`, async ({ 
      authenticatedPage, 
      testHelpers,
      testDataHelpers 
    }) => {
      await testHelpers.navigateTo('/reports');
      await authenticatedPage.click('button:has-text("Utilization Report")');
      // Click on a high-level metric
      await authenticatedPage.click('[data-testid="team-utilization-card"]');
      // Verify drill-down view
      await expect(authenticatedPage.locator('h2:has-text("Team Breakdown")')).toBeVisible();
      await expect(authenticatedPage.locator('table.person-details')).toBeVisible();
      // Further drill down to person - try to find one of our test people
      const personRow = authenticatedPage.locator('tr[data-person-id]').first();
      if (await personRow.count() > 0) {
        await personRow.locator('td:first-child').click();
        await expect(authenticatedPage.locator('h3:has-text("Individual Assignments")')).toBeVisible();
      }
    });
    test(`${tags.reports} should calculate and display KPIs`, async ({ 
      authenticatedPage, 
      testHelpers,
      testDataHelpers 
    }) => {
      await testHelpers.navigateTo('/reports/kpi');
      // Verify KPI cards
      const kpiCards = [
        'Average Utilization',
        'Resource Efficiency',
        'Project Delivery Rate',
        'Capacity vs Demand Ratio'
      ];
      for (const kpi of kpiCards) {
        const card = authenticatedPage.locator(`[data-testid="kpi-card"]:has-text("${kpi}")`);
        await expect(card).toBeVisible();
        await expect(card.locator('.kpi-value')).toHaveText(/\d+(\.\d+)?%?/);
        await expect(card.locator('.kpi-trend')).toBeVisible();
      }
    });
  });
  test.describe('Report Templates and Customization', () => {
    test(`${tags.reports} should create and save report templates`, async ({ 
      authenticatedPage, 
      testHelpers,
      testDataHelpers 
    }) => {
      await testHelpers.navigateTo('/reports/builder');
      // Configure report
      await authenticatedPage.click('input[value="project_name"]');
      await authenticatedPage.click('input[value="allocation_percentage"]');
      // Save as template
      await authenticatedPage.click('button:has-text("Save as Template")');
      const modal = authenticatedPage.locator('[role="dialog"]');
      await modal.locator('input[name="template_name"]').fill(`${testContext.prefix}_Monthly_Allocation_Summary`);
      await modal.locator('textarea[name="description"]').fill('Shows project allocations for the month');
      await modal.locator('button:has-text("Save Template")').click();
      // Verify template saved
      await testHelpers.navigateTo('/reports/templates');
      await expect(authenticatedPage.locator('table')).toContainText(`${testContext.prefix}_Monthly_Allocation_Summary`);
    });
    test(`${tags.reports} should customize report layout and styling`, async ({ 
      authenticatedPage, 
      testHelpers,
      testDataHelpers 
    }) => {
      await testHelpers.navigateTo('/reports/customize');
      // Change theme
      await authenticatedPage.selectOption('select[name="theme"]', 'professional');
      // Customize colors
      await authenticatedPage.click('button:has-text("Customize Colors")');
      await authenticatedPage.fill('input[name="primary_color"]', '#2563eb');
      await authenticatedPage.fill('input[name="accent_color"]', '#f59e0b');
      // Add logo
      await authenticatedPage.click('button:has-text("Upload Logo")');
      // Would need to handle file upload in real test
      // Preview changes
      await authenticatedPage.click('button:has-text("Preview")');
      await expect(authenticatedPage.locator('[data-testid="report-preview"]')).toBeVisible();
    });
  });
  test.describe('Collaboration and Permissions', () => {
    test(`${tags.reports} should share reports with team members`, async ({ 
      authenticatedPage, 
      testHelpers,
      testDataHelpers 
    }) => {
      await testHelpers.navigateTo('/reports');
      await authenticatedPage.click('button:has-text("Capacity Report")');
      // Share report
      await authenticatedPage.click('button:has-text("Share")');
      const modal = authenticatedPage.locator('[role="dialog"]');
      await modal.locator('input[name="email"]').fill(`${testContext.prefix}_colleague@example.com`);
      await modal.locator('select[name="permission"]').selectOption('view');
      await modal.locator('button:has-text("Send Invitation")').click();
      // Verify shared
      await expect(authenticatedPage.locator('.toast')).toContainText('Report shared');
    });
    test(`${tags.reports} should add comments and annotations to reports`, async ({ 
      authenticatedPage, 
      testHelpers,
      testDataHelpers 
    }) => {
      await testHelpers.navigateTo('/reports');
      await authenticatedPage.click('button:has-text("Demand Report")');
      // Add annotation
      const chart = authenticatedPage.locator('[data-testid="demand-chart"]');
      await chart.click({ position: { x: 200, y: 150 } });
      await authenticatedPage.fill('textarea[placeholder="Add annotation"]', `${testContext.prefix}: Peak demand period - consider additional resources`);
      await authenticatedPage.click('button:has-text("Save Annotation")');
      // Verify annotation appears
      await expect(authenticatedPage.locator('.chart-annotation')).toBeVisible();
    });
    test(`${tags.reports} should manage report access permissions`, async ({ 
      authenticatedPage, 
      testHelpers,
      testDataHelpers 
    }) => {
      await testHelpers.navigateTo('/reports/permissions');
      // Set role-based permissions
      const permissionGrid = authenticatedPage.locator('[data-testid="permission-grid"]');
      // Set manager permissions
      await permissionGrid.locator('tr:has-text("Manager") input[value="view_all"]').check();
      await permissionGrid.locator('tr:has-text("Manager") input[value="export"]').check();
      // Set team member permissions  
      await permissionGrid.locator('tr:has-text("Team Member") input[value="view_own"]').check();
      await authenticatedPage.click('button:has-text("Save Permissions")');
      // Verify saved
      await expect(authenticatedPage.locator('.toast')).toContainText('Permissions updated');
    });
  });
  test.describe('Advanced Filtering', () => {
    test(`${tags.reports} should apply multi-dimensional filters`, async ({ 
      authenticatedPage, 
      testHelpers,
      testDataHelpers 
    }) => {
      await testHelpers.navigateTo('/reports');
      await authenticatedPage.click('button:has-text("Capacity Report")');
      // Apply multiple filters
      await authenticatedPage.click('button:has-text("Filters")');
      const filterPanel = authenticatedPage.locator('[data-testid="filter-panel"]');
      // Location filter - use test data locations if available
      const locationSelect = filterPanel.locator('select[name="location"]');
      if (await locationSelect.count() > 0) {
        // Try to use locations from test data if available
        const testLocations = [...new Set(testData.projects.map((p: any) => p.location_id).filter(Boolean))];
        if (testLocations.length >= 2) {
          await locationSelect.selectOption(testLocations.slice(0, 2));
        } else {
          await locationSelect.selectOption(['nyc', 'sf']);
        }
      }
      // Role filter - use test data roles
      const testRoles = [...new Set(testData.people.map((p: any) => p.role))];
      if (testRoles.length >= 2) {
        for (const role of testRoles.slice(0, 2)) {
          const roleCheckbox = filterPanel.locator(`input[value="${role}"]`);
          if (await roleCheckbox.count() > 0) {
            await roleCheckbox.check();
          }
        }
      } else {
        await filterPanel.locator('input[value="developer"]').check();
        await filterPanel.locator('input[value="designer"]').check();
      }
      // Date range
      await filterPanel.locator('input[name="start_date"]').fill('2024-01-01');
      await filterPanel.locator('input[name="end_date"]').fill('2024-12-31');
      // Utilization range
      await filterPanel.locator('input[name="min_utilization"]').fill('50');
      await filterPanel.locator('input[name="max_utilization"]').fill('80');
      await filterPanel.locator('button:has-text("Apply Filters")').click();
      // Verify filters applied
      await expect(authenticatedPage.locator('[data-testid="active-filters"]')).toContainText('4 filters active');
    });
    test(`${tags.reports} should save and load filter combinations`, async ({ 
      authenticatedPage, 
      testHelpers,
      testDataHelpers 
    }) => {
      await testHelpers.navigateTo('/reports');
      await authenticatedPage.click('button:has-text("Utilization Report")');
      // Apply filters
      await authenticatedPage.click('button:has-text("Filters")');
      await authenticatedPage.selectOption('select[name="team"]', 'engineering');
      await authenticatedPage.selectOption('select[name="period"]', 'quarter');
      // Save filter set
      await authenticatedPage.click('button:has-text("Save Filter Set")');
      await authenticatedPage.fill('input[name="filter_set_name"]', `${testContext.prefix}_Engineering_Quarterly_Review`);
      await authenticatedPage.click('button:has-text("Save")');
      // Load saved filter
      await authenticatedPage.reload();
      await authenticatedPage.click('button:has-text("Load Filter Set")');
      await authenticatedPage.click(`text=${testContext.prefix}_Engineering_Quarterly_Review`);
      // Verify filters restored
      await expect(authenticatedPage.locator('select[name="team"]')).toHaveValue('engineering');
      await expect(authenticatedPage.locator('select[name="period"]')).toHaveValue('quarter');
    });
  });
  test.describe('Performance and Large Datasets', () => {
    test(`${tags.reports} ${tags.slow} should handle large datasets efficiently`, async ({ 
      authenticatedPage, 
      testHelpers,
      testDataHelpers,
      apiContext 
    }) => {
      // Skip if not performance testing
      if (!process.env.RUN_PERFORMANCE_TESTS) {
        test.skip();
        return;
      }
      // Create large dataset using test helpers if available
      // Note: This would need actual implementation of bulk data creation
      console.log('Performance test - would create large dataset here');
      await testHelpers.navigateTo('/reports');
      // Measure load time
      const startTime = Date.now();
      await authenticatedPage.click('button:has-text("Capacity Report")');
      await authenticatedPage.waitForSelector('[data-testid="report-loaded"]');
      const loadTime = Date.now() - startTime;
      // Should load within reasonable time
      expect(loadTime).toBeLessThan(10000); // Allow more time for CI environments
      // Verify pagination if available
      const pagination = authenticatedPage.locator('[data-testid="pagination"]');
      if (await pagination.count() > 0) {
        await expect(pagination).toBeVisible();
      }
    });
    test(`${tags.reports} should show progress indicators for long operations`, async ({ 
      authenticatedPage, 
      testHelpers,
      testDataHelpers 
    }) => {
      await testHelpers.navigateTo('/reports');
      // Trigger complex report generation
      await authenticatedPage.click('button:has-text("Generate Complex Report")');
      // Verify progress indicator
      const progress = authenticatedPage.locator('[data-testid="progress-indicator"]');
      await expect(progress).toBeVisible();
      await expect(progress).toContainText('Processing...');
      // Should show percentage
      await expect(progress.locator('.progress-bar')).toHaveAttribute('aria-valuenow', /\d+/);
      // Wait for completion
      await expect(progress).toContainText('Complete', { timeout: 30000 });
    });
  });
});