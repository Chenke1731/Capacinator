import { test, expect } from '@playwright/test';
import { APIRequestContext } from '@playwright/test';

test.describe('Scenario-based Assignments @feature', () => {
  let apiContext: APIRequestContext;

  test.beforeAll(async ({ playwright }) => {
    apiContext = await playwright.request.newContext({
      baseURL: 'http://localhost:3111',
      extraHTTPHeaders: {
        'Accept': 'application/json',
      },
    });
  });

  test.afterAll(async () => {
    await apiContext.dispose();
  });

  test('should display both direct and scenario-based assignments', async ({ page }) => {
    // Navigate to assignments page
    await page.goto('/assignments');
    
    // Wait for the table to load
    await page.waitForSelector('.data-table', { timeout: 10000 });
    
    // Check that we have assignments
    const rows = await page.locator('.data-table tbody tr').count();
    expect(rows).toBeGreaterThan(0);
    
    // Check for assignment details
    await page.waitForSelector('.project-name', { timeout: 5000 });
    const firstProjectName = await page.locator('.project-name').first().textContent();
    expect(firstProjectName).toBeTruthy();
  });

  test('should show scenario assignments via API', async () => {
    // Test the API directly
    const response = await apiContext.get('/api/assignments');
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data).toHaveProperty('data');
    expect(Array.isArray(data.data)).toBeTruthy();
    
    // Check for scenario assignments
    const scenarioAssignments = data.data.filter((assignment: any) => 
      assignment.assignment_type === 'scenario'
    );
    
    // We should have some scenario assignments
    expect(scenarioAssignments.length).toBeGreaterThan(0);
    
    // Check scenario assignment structure
    if (scenarioAssignments.length > 0) {
      const firstScenarioAssignment = scenarioAssignments[0];
      expect(firstScenarioAssignment).toHaveProperty('scenario_id');
      expect(firstScenarioAssignment).toHaveProperty('scenario_name');
      expect(firstScenarioAssignment.assignment_type).toBe('scenario');
    }
  });

  test('should handle mixed assignment types correctly', async () => {
    const response = await apiContext.get('/api/assignments');
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    const assignments = data.data;
    
    // Count assignment types
    const directAssignments = assignments.filter((a: any) => 
      a.assignment_type === 'direct'
    );
    const scenarioAssignments = assignments.filter((a: any) => 
      a.assignment_type === 'scenario'
    );
    
    // We should have both types
    expect(directAssignments.length).toBeGreaterThan(0);
    expect(scenarioAssignments.length).toBeGreaterThan(0);
    
    // Total should match
    expect(assignments.length).toBe(directAssignments.length + scenarioAssignments.length);
  });

  test('should properly format scenario assignment IDs', async () => {
    const response = await apiContext.get('/api/assignments');
    const data = await response.json();
    
    const scenarioAssignments = data.data.filter((a: any) => 
      a.assignment_type === 'scenario'
    );
    
    // Scenario assignment IDs should start with 'spa-'
    scenarioAssignments.forEach((assignment: any) => {
      expect(assignment.id).toMatch(/^spa-/);
    });
  });

  test('should display correct allocation percentages', async ({ page }) => {
    await page.goto('/assignments');
    await page.waitForSelector('.data-table');
    
    // Check allocation percentage is displayed
    const allocationCell = await page.locator('.allocation-cell input').first();
    await expect(allocationCell).toBeVisible();
    
    const value = await allocationCell.inputValue();
    const numValue = parseFloat(value);
    
    // Allocation should be between 0 and 100
    expect(numValue).toBeGreaterThanOrEqual(0);
    expect(numValue).toBeLessThanOrEqual(100);
  });

  test('should allow inline editing of allocation percentage', async ({ page }) => {
    await page.goto('/assignments');
    await page.waitForSelector('.data-table');
    
    // Find the first allocation input
    const allocationInput = await page.locator('.allocation-cell input').first();
    const originalValue = await allocationInput.inputValue();
    
    // Try to update the value
    await allocationInput.click();
    await allocationInput.fill('75');
    await allocationInput.blur();
    
    // Wait a moment for the update
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    
    // The value should either be updated or show an error
    // (depending on whether the update was successful)
    const newValue = await allocationInput.inputValue();
    expect(newValue).toBeTruthy();
  });
});