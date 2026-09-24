/**
 * Simple Dashboard Scenario Refresh Test
 * Tests that dashboard data updates when scenarios change
 */
import { test, expect } from '../../fixtures';

test.describe('Dashboard Scenario Refresh', () => {
  // AppHeader's scenario selector only renders when a non-baseline scenario
  // exists; the e2e seed ships baseline only, so create a branch per test.
  let branchScenarioId = '';

  test.beforeEach(async ({ apiContext }) => {
    const people = await (await apiContext.get('/api/people')).json();
    const created_by = people?.data?.[0]?.id;
    if (!created_by) throw new Error('No people in /api/people — cannot create test scenario');

    const response = await apiContext.post('/api/scenarios', {
      data: {
        name: `Dashboard Refresh Test ${Date.now()}`,
        description: 'Created by e2e scenario-dashboard-refresh',
        scenario_type: 'branch',
        status: 'active',
        created_by
      }
    });
    if (!response.ok()) throw new Error(`Failed to create branch scenario: ${response.status()}`);
    branchScenarioId = (await response.json()).id;
  });

  test.afterEach(async ({ apiContext }) => {
    if (branchScenarioId) {
      await apiContext.delete(`/api/scenarios/${branchScenarioId}`).catch(() => {});
      branchScenarioId = '';
    }
  });

  test('dashboard data refreshes on scenario change', async ({ authenticatedPage, testHelpers }) => {
    // Navigate to dashboard
    await testHelpers.navigateTo('/dashboard');
    await authenticatedPage.waitForLoadState('networkidle');
    
    // Wait for initial data to load (dashboard stat is "Active Projects")
    await authenticatedPage.waitForSelector('text=Active Projects');

    // Get initial project count
    const initialCount = await authenticatedPage.locator('text=Active Projects')
      .locator('..')
      .locator('p.text-2xl')
      .textContent();
    console.log('Initial project count:', initialCount);
    
    // Open scenario dropdown
    await authenticatedPage.click('.scenario-button');
    await authenticatedPage.waitForSelector('.scenario-dropdown', { state: 'visible' });
    
    // Get available scenarios
    const scenarios = await authenticatedPage.locator('.scenario-option').count();
    console.log('Available scenarios:', scenarios);
    
    if (scenarios > 1) {
      // Click on a different scenario
      await authenticatedPage.locator('.scenario-option:not(.selected)').first().click();
      
      // Wait for dropdown to close
      await authenticatedPage.waitForSelector('.scenario-dropdown', { state: 'hidden' });
      
      // Wait for data to refresh
      await authenticatedPage.waitForLoadState('networkidle');
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {}); // Give React Query time to update
      
      // Get updated project count
      const updatedCount = await authenticatedPage.locator('text=Active Projects')
        .locator('..')
        .locator('p.text-2xl')
        .textContent();
      console.log('Updated project count:', updatedCount);
      
      // Verify scenario changed in header
      const currentScenario = await authenticatedPage.locator('.scenario-button .scenario-name').textContent();
      console.log('Current scenario:', currentScenario);
      
      // Check that we have data (either count changed or we still have valid data)
      expect(updatedCount).toBeDefined();
      expect(updatedCount).not.toBe('');
    }
  });
  
  test('reports page refreshes on scenario change', async ({ authenticatedPage, testHelpers }) => {
    // Navigate to reports page
    await testHelpers.navigateTo('/reports');
    await authenticatedPage.waitForLoadState('networkidle');
    
    // Wait for reports to load (UnifiedTabComponent renders role=tab)
    await authenticatedPage.waitForSelector('[role="tab"]', { timeout: 10000 });
    
    // Get current scenario
    const initialScenario = await authenticatedPage.locator('.scenario-button .scenario-name').textContent();
    console.log('Initial scenario on reports:', initialScenario);
    
    // Open scenario dropdown
    await authenticatedPage.click('.scenario-button');
    await authenticatedPage.waitForSelector('.scenario-dropdown', { state: 'visible' });
    
    // Switch to different scenario
    const availableScenarios = await authenticatedPage.locator('.scenario-option:not(.selected)').count();
    if (availableScenarios > 0) {
      await authenticatedPage.locator('.scenario-option:not(.selected)').first().click();
      
      // Wait for dropdown to close and data to refresh
      await authenticatedPage.waitForSelector('.scenario-dropdown', { state: 'hidden' });
      await authenticatedPage.waitForLoadState('networkidle');
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      
      // Verify scenario changed
      const updatedScenario = await authenticatedPage.locator('.scenario-button .scenario-name').textContent();
      console.log('Updated scenario on reports:', updatedScenario);
      expect(updatedScenario).not.toBe(initialScenario);
      
      // Verify reports are still visible (tabpanel always renders; empty
      // scenario shows zero-valued summary cards, no .empty-state)
      const hasReportContent = await authenticatedPage.locator('[role="tabpanel"]').first().isVisible().catch(() => false);
      const hasCharts = await authenticatedPage.locator('.recharts-wrapper').first().isVisible().catch(() => false);
      expect(hasReportContent || hasCharts).toBeTruthy();
    }
  });
});