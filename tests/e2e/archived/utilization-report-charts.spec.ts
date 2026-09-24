import { test, expect } from './fixtures';

test.describe('Utilization Report Charts E2E Tests', () => {
  test.beforeEach(async ({ authenticatedPage, testHelpers }) => {
    // Navigate to utilization report
    await testHelpers.navigateTo('/reports');
    
    // The test data is already set up by the E2E global setup
    // We have the following test users with allocations:
    // - E2E Over Utilized: 120% (80% + 40%)
    // - E2E Normal Utilized: 80%
    // - E2E Under Utilized: 40%
    // - E2E Zero Utilized: 0%
    
    // Click on utilization report tab
    await authenticatedPage.click('text=Utilization Report');
    await authenticatedPage.waitForSelector('.utilization-report, [data-testid="utilization-report"]');
  });

  // No cleanup needed - test data is managed by E2E global setup

  test('should display utilization charts with data', async ({ authenticatedPage }) => {
    // Wait for charts to load
    await authenticatedPage.waitForSelector('[data-testid="utilization-by-person-chart"]');
    await authenticatedPage.waitForSelector('[data-testid="utilization-by-role-chart"]');
    await authenticatedPage.waitForSelector('[data-testid="utilization-distribution-chart"]');
    
    // Verify summary cards show correct values
    const utilizationPercentage = await authenticatedPage.textContent('[data-testid="overall-utilization-percentage"]');
    expect(parseInt(utilizationPercentage, 10)).toBeGreaterThan(0);
    expect(parseInt(utilizationPercentage, 10)).toBeLessThan(200); // Reasonable range
    
    const overutilizedCount = await authenticatedPage.textContent('[data-testid="people-overutilized-count"]');
    expect(parseInt(overutilizedCount, 10)).toBe(1); // E2E Over Utilized
    
    const underutilizedCount = await authenticatedPage.textContent('[data-testid="people-underutilized-count"]');
    expect(parseInt(underutilizedCount, 10)).toBeGreaterThan(0);
  });

  test('should update charts when date range changes', async ({ authenticatedPage }) => {
    // Set initial date range
    await authenticatedPage.fill('[data-testid="start-date-input"]', '2025-09-01');
    await authenticatedPage.fill('[data-testid="end-date-input"]', '2025-09-30');
    await authenticatedPage.click('[data-testid="apply-filters-button"]');
    
    // Wait for charts to update
    await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
    
    // Get initial utilization value
    const initialUtilization = await authenticatedPage.textContent('[data-testid="overall-utilization-percentage"]');
    
    // Change date range to include more assignments
    await authenticatedPage.fill('[data-testid="end-date-input"]', '2025-12-31');
    await authenticatedPage.click('[data-testid="apply-filters-button"]');
    
    // Wait for charts to update
    await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
    
    // Verify utilization changed
    const updatedUtilization = await authenticatedPage.textContent('[data-testid="overall-utilization-percentage"]');
    expect(parseInt(updatedUtilization, 10)).not.toBe(parseInt(initialUtilization, 10));
  });

  test('should display person utilization table with correct data', async ({ authenticatedPage }) => {
    // Wait for table to load
    await authenticatedPage.waitForSelector('[data-testid="utilization-table"]');
    
    // Verify table headers
    await expect(authenticatedPage.locator('th:text("Name")')).toBeVisible();
    await expect(authenticatedPage.locator('th:text("Role")')).toBeVisible();
    await expect(authenticatedPage.locator('th:text("Utilization (%)")')).toBeVisible();
    await expect(authenticatedPage.locator('th:text("Available Capacity (%)")')).toBeVisible();
    await expect(authenticatedPage.locator('th:text("Available Hours (Daily)")')).toBeVisible();
    
    // Verify E2E Normal Utilized row
    const normalRow = authenticatedPage.locator('tr', { has: authenticatedPage.locator('text="E2E Normal Utilized"') });
    await expect(normalRow).toBeVisible();
    
    const normalUtilization = await normalRow.locator('[data-testid="utilization-percentage"]').textContent();
    expect(parseInt(normalUtilization, 10)).toBe(80); // 80% allocation
    
    // Verify E2E Over Utilized overallocation is highlighted
    const overRow = authenticatedPage.locator('tr', { has: authenticatedPage.locator('text="E2E Over Utilized"') });
    await expect(overRow).toBeVisible();
    await expect(overRow.locator('[data-testid="overallocation-indicator"]')).toBeVisible();
    
    const overUtilization = await overRow.locator('[data-testid="utilization-percentage"]').textContent();
    expect(parseInt(overUtilization, 10)).toBe(120); // 80% + 40% = 120%
  });

  test('should handle edge cases gracefully', async ({ authenticatedPage }) => {
    // Test with no date range (should use defaults)
    await authenticatedPage.fill('[data-testid="start-date-input"]', '');
    await authenticatedPage.fill('[data-testid="end-date-input"]', '');
    await authenticatedPage.click('[data-testid="apply-filters-button"]');
    
    // Should still display charts
    await expect(authenticatedPage.locator('[data-testid="utilization-by-person-chart"]')).toBeVisible();
    
    // Test with date range that has no assignments
    await authenticatedPage.fill('[data-testid="start-date-input"]', '2024-01-01');
    await authenticatedPage.fill('[data-testid="end-date-input"]', '2024-01-31');
    await authenticatedPage.click('[data-testid="apply-filters-button"]');
    
    // Should show "No assignments found" message
    await expect(authenticatedPage.locator('text=No Project Assignments Found')).toBeVisible();
    await expect(authenticatedPage.locator('text=Utilization is 0%')).toBeVisible();
  });

  test('should display charts properly with high utilization values', async ({ authenticatedPage }) => {
    // Add assignments with very high percentages
    // Additional test setup would go here if needed
    /*await setupTestData({
      assignments: [
        {
          personName: 'Frank Test',
          projectName: 'Project 1',
          allocation: 150,
          startDate: '2025-09-01',
          endDate: '2025-12-31'
        },
        {
          personName: 'Frank Test',
          projectName: 'Project 2',
          allocation: 100,
          startDate: '2025-09-01',
          endDate: '2025-12-31'
        }
      ]
    });*/
    
    await authenticatedPage.reload();
    await authenticatedPage.waitForSelector('[data-testid="utilization-report-page"]');
    
    // Verify charts still render (not blank)
    const chartCanvas = authenticatedPage.locator('[data-testid="utilization-by-person-chart"] canvas');
    await expect(chartCanvas).toBeVisible();
    
    // Get canvas dimensions to ensure it's rendered
    const canvasBox = await chartCanvas.boundingBox();
    expect(canvasBox.width).toBeGreaterThan(0);
    expect(canvasBox.height).toBeGreaterThan(0);
    
    // Verify Frank Test appears in the table with high utilization
    const frankRow = authenticatedPage.locator('tr', { has: authenticatedPage.locator('text="Frank Test"') });
    await expect(frankRow).toBeVisible();
    
    const frankUtilization = await frankRow.locator('[data-testid="utilization-percentage"]').textContent();
    expect(parseInt(frankUtilization, 10)).toBe(250); // 150% + 100%
    
    // Verify the chart Y-axis can accommodate high values
    // This would depend on your chart implementation
    await expect(authenticatedPage.locator('[data-testid="chart-y-axis-max"]')).toHaveText(/[2-3][0-9][0-9]/); // Should show 200-399 range
  });

  test('should export utilization data correctly', async ({ authenticatedPage }) => {
    // Click export button
    await authenticatedPage.click('[data-testid="export-utilization-button"]');
    
    // Wait for download
    const [download] = await Promise.all([
      authenticatedPage.waitForEvent('download'),
      authenticatedPage.click('text=Export to Excel')
    ]);
    
    // Verify download
    expect(download.suggestedFilename()).toContain('utilization-report');
    expect(download.suggestedFilename()).toContain('.xlsx');
  });

  test('should filter by location and project type', async ({ authenticatedPage }) => {
    // Apply location filter
    await authenticatedPage.selectOption('[data-testid="location-filter"]', 'New York');
    await authenticatedPage.click('[data-testid="apply-filters-button"]');
    
    // Wait for update
    await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
    
    // Verify only people from New York are shown
    const tableRows = await authenticatedPage.locator('[data-testid="utilization-table"] tbody tr').count();
    expect(tableRows).toBeGreaterThan(0);
    
    // Apply project type filter
    await authenticatedPage.selectOption('[data-testid="project-type-filter"]', 'Development');
    await authenticatedPage.click('[data-testid="apply-filters-button"]');
    
    // Verify filtered results
    await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
    const filteredRows = await authenticatedPage.locator('[data-testid="utilization-table"] tbody tr').count();
    expect(filteredRows).toBeLessThanOrEqual(tableRows);
  });

  test('should navigate to person details from utilization table', async ({ authenticatedPage }) => {
    // Click on a person's name
    await authenticatedPage.click('text=E2E Normal Utilized');
    
    // Should navigate to person details page
    await authenticatedPage.waitForURL(/\/people\/[a-f0-9-]+$/);
    await expect(authenticatedPage.locator('h1:text("E2E Normal Utilized")')).toBeVisible();
    
    // Verify assignment details are shown
    await expect(authenticatedPage.locator('text=E2E Critical Project')).toBeVisible();
    await expect(authenticatedPage.locator('text=80%')).toBeVisible();
  });

  test('should show tooltips on chart hover', async ({ authenticatedPage }) => {
    // Hover over a bar in the utilization chart
    const chart = authenticatedPage.locator('[data-testid="utilization-by-person-chart"]');
    await chart.hover({ position: { x: 100, y: 100 } });
    
    // Wait for tooltip
    await authenticatedPage.waitForSelector('[data-testid="chart-tooltip"]', { timeout: 2000 });
    
    // Verify tooltip content
    const tooltipText = await authenticatedPage.textContent('[data-testid="chart-tooltip"]');
    expect(tooltipText).toContain('%');
    expect(tooltipText).toMatch(/\d+ hours/);
  });
});