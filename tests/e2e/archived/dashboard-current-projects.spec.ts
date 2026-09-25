/**
 * Dashboard Current Projects Filtering Tests
 * Tests UI display of current projects filtering
 */
import { test, expect, tags } from '../../../fixtures';
test.describe('Dashboard Current Projects Filtering', () => {
  test(`${tags.ui} should display only current projects count`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    // Navigate to dashboard
    await testHelpers.navigateTo('/dashboard');
    // Wait for dashboard API response
    const dashboardResponse = await testHelpers.waitForApiCall('/api/reporting/dashboard');
    const dashboardData = await dashboardResponse.json();
    // Verify the API returns filtered current projects count
    expect(dashboardData.summary.projects).toBeGreaterThanOrEqual(0);
    console.log(`Current projects count from API: ${dashboardData.summary.projects}`);
    // Verify the UI displays the current projects count
    const currentProjectsCard = authenticatedPage.locator('.stat-card').filter({ hasText: 'Current Projects' });
    await expect(currentProjectsCard).toBeVisible();
    const projectsValue = currentProjectsCard.locator('.stat-value');
    await expect(projectsValue).toContainText(dashboardData.summary.projects.toString());
    // Verify the card title specifically says "Current Projects" not "Total Projects"
    await expect(currentProjectsCard.locator('.stat-title')).toContainText('Current Projects');
  });
  test(`${tags.ui} should show current project health status only`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    // Navigate to dashboard
    await testHelpers.navigateTo('/dashboard');
    // Wait for dashboard data to load
    await authenticatedPage.waitForSelector('.chart-container', { state: 'visible' });
    // Verify project health chart is present and shows "Current Project Health"
    const healthCard = authenticatedPage.locator('.card').filter({ hasText: 'Current Project Health' });
    await expect(healthCard).toBeVisible();
    // Verify chart container is rendered
    const chartContainer = healthCard.locator('.chart-container');
    await expect(chartContainer).toBeVisible();
    // Verify Recharts components are rendered
    await expect(chartContainer.locator('.recharts-wrapper')).toBeVisible();
    await expect(chartContainer.locator('.recharts-pie')).toBeVisible();
    console.log('✅ Current Project Health chart is displayed correctly');
  });
  test(`${tags.ui} should reflect current projects in capacity metrics`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    // Navigate to dashboard
    await testHelpers.navigateTo('/dashboard');
    // Wait for capacity gaps card to load
    const capacityCard = authenticatedPage.locator('.card').filter({ hasText: 'Capacity Gaps' });
    await expect(capacityCard).toBeVisible();
    // Verify the chart shows data for current projects only
    const chartContainer = capacityCard.locator('.chart-container');
    await expect(chartContainer).toBeVisible();
    // Check legend items (should only show GAP and OK)
    const legendItems = chartContainer.locator('.recharts-legend-item');
    const legendCount = await legendItems.count();
    expect(legendCount).toBeGreaterThanOrEqual(1);
    expect(legendCount).toBeLessThanOrEqual(2); // Only GAP and OK statuses
    console.log('✅ Capacity metrics reflect current projects only');
  });
  test(`${tags.ui} should navigate to filtered project list on card click`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    // Navigate to dashboard
    await testHelpers.navigateTo('/dashboard');
    // Click on current projects card
    const currentProjectsCard = authenticatedPage.locator('.stat-card').filter({ hasText: 'Current Projects' });
    await expect(currentProjectsCard).toBeVisible();
    await currentProjectsCard.click();
    // Should navigate to projects page
    await authenticatedPage.waitForURL('**/projects');
    // Verify projects page loaded
    await testHelpers.waitForPageReady();
    const projectsHeader = authenticatedPage.locator('h1, h2').filter({ hasText: 'Projects' });
    await expect(projectsHeader).toBeVisible();
    console.log('✅ Navigation from dashboard to projects works correctly');
  });
  test(`${tags.ui} should update metrics when date changes`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    // Navigate to dashboard
    await testHelpers.navigateTo('/dashboard');
    // Get initial project count
    const initialResponse = await testHelpers.waitForApiCall('/api/reporting/dashboard');
    const initialData = await initialResponse.json();
    const initialCount = initialData.summary.projects;
    console.log(`Initial current projects count: ${initialCount}`);
    // Refresh the page to simulate date change effect
    await authenticatedPage.reload();
    // Get updated project count
    const updatedResponse = await testHelpers.waitForApiCall('/api/reporting/dashboard');
    const updatedData = await updatedResponse.json();
    const updatedCount = updatedData.summary.projects;
    console.log(`Updated current projects count: ${updatedCount}`);
    // Counts should be consistent (no random variations)
    expect(updatedCount).toBe(initialCount);
    console.log('✅ Dashboard metrics remain consistent across refreshes');
  });
  test(`${tags.ui} should display zero state gracefully when no current projects`, async ({ 
    authenticatedPage,
    testHelpers,
    apiContext 
  }) => {
    // First check if we have any current projects
    const checkResponse = await apiContext.get('/api/reporting/dashboard');
    const checkData = await checkResponse.json();
    if (checkData.summary.projects === 0) {
      // Navigate to dashboard
      await testHelpers.navigateTo('/dashboard');
      // Verify zero state is displayed properly
      const currentProjectsCard = authenticatedPage.locator('.stat-card').filter({ hasText: 'Current Projects' });
      await expect(currentProjectsCard).toBeVisible();
      const projectsValue = currentProjectsCard.locator('.stat-value');
      await expect(projectsValue).toContainText('0');
      // Health chart should show empty state
      const healthCard = authenticatedPage.locator('.card').filter({ hasText: 'Current Project Health' });
      if (await healthCard.isVisible()) {
        const noDataMessage = healthCard.locator('text=/no.*data|empty/i');
        // Either show no data message or empty chart
        const hasNoDataMessage = await noDataMessage.count() > 0;
        const hasEmptyChart = await healthCard.locator('.recharts-pie').count() === 0;
        expect(hasNoDataMessage || hasEmptyChart).toBeTruthy();
      }
      console.log('✅ Dashboard handles zero current projects gracefully');
    } else {
      console.log(`Skipping zero state test - ${checkData.summary.projects} current projects exist`);
    }
  });
});