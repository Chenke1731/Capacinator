/**
 * Simple Scenario Switching Test
 * Verifies that the scenario dropdown works and data refreshes
 */
import { test, expect } from '../../fixtures';

test.describe('Scenario Switching', () => {
  // AppHeader's scenario selector only renders when a non-baseline scenario
  // exists; the e2e seed ships baseline only, so create a branch per test.
  let branchScenarioId = '';

  test.beforeEach(async ({ apiContext }) => {
    const people = await (await apiContext.get('/api/people')).json();
    const created_by = people?.data?.[0]?.id;
    if (!created_by) throw new Error('No people in /api/people — cannot create test scenario');

    const response = await apiContext.post('/api/scenarios', {
      data: {
        name: `Switch Test ${Date.now()}`,
        description: 'Created by e2e scenario-switching-simple',
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

  test('should switch scenarios and refresh data', async ({ authenticatedPage, testHelpers }) => {
    // Navigate to dashboard
    await testHelpers.navigateTo('/dashboard');
    await authenticatedPage.waitForLoadState('networkidle');
    
    // Wait for initial data to load (dashboard stat is "Active Projects")
    await authenticatedPage.waitForSelector('text=Active Projects');
    
    // Get the current scenario name
    const initialScenario = await authenticatedPage.locator('.scenario-button .scenario-name').textContent();
    console.log('Initial scenario:', initialScenario);
    
    // Click on scenario selector
    await authenticatedPage.click('.scenario-button');
    await authenticatedPage.waitForSelector('.scenario-dropdown', { state: 'visible' });
    
    // Get available scenarios
    const scenarioOptions = await authenticatedPage.locator('.scenario-option').count();
    console.log('Available scenarios:', scenarioOptions);
    
    // If there are multiple scenarios, switch to a different one
    if (scenarioOptions > 1) {
      // Click on a different scenario (not the currently selected one)
      await authenticatedPage.locator('.scenario-option:not(.selected)').first().click();
      
      // Wait for the dropdown to close
      await authenticatedPage.waitForSelector('.scenario-selector-dropdown', { state: 'hidden' });
      
      // Wait for data to refresh
      await authenticatedPage.waitForLoadState('networkidle');
      
      // Verify scenario has changed
      const newScenario = await authenticatedPage.locator('.scenario-button .scenario-name').textContent();
      console.log('New scenario:', newScenario);
      
      expect(newScenario).not.toBe(initialScenario);
    } else {
      console.log('Only one scenario available, skipping switch test');
    }
  });
  
  test('should persist scenario across navigation', async ({ authenticatedPage, testHelpers }) => {
    // Navigate to projects page
    await testHelpers.navigateTo('/projects');
    await authenticatedPage.waitForLoadState('networkidle');
    
    // Get current scenario
    const projectsScenario = await authenticatedPage.locator('.scenario-button .scenario-name').textContent();
    
    // Navigate to assignments
    await testHelpers.navigateTo('/assignments');
    await authenticatedPage.waitForLoadState('networkidle');
    
    // Get scenario on assignments page
    const assignmentsScenario = await authenticatedPage.locator('.scenario-button .scenario-name').textContent();
    
    // Should be the same scenario
    expect(assignmentsScenario).toBe(projectsScenario);
  });
});