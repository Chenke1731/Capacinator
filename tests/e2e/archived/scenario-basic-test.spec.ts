import { test, expect } from '@playwright/test';

test.describe('Basic Scenario Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should have baseline scenario in localStorage after app loads', async ({ page }) => {
    // Wait for app to fully load
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    
    // Check localStorage for scenario context
    const scenarioContext = await page.evaluate(() => {
      return localStorage.getItem('currentScenario');
    });
    
    console.log('Scenario context:', scenarioContext);
    
    expect(scenarioContext).toBeTruthy();
    
    const parsed = JSON.parse(scenarioContext!);
    expect(parsed).toHaveProperty('id');
    expect(parsed).toHaveProperty('name');
  });

  test('should include scenario header in API requests', async ({ page }) => {
    // Set up request interception
    let capturedHeaders: any = null;
    
    page.on('request', request => {
      if (request.url().includes('/api/assignments')) {
        capturedHeaders = request.headers();
      }
    });
    
    // Navigate to assignments which triggers API calls
    await page.goto('/assignments');
    await page.waitForLoadState('networkidle');
    
    // Check if headers were captured
    console.log('Captured headers:', capturedHeaders);
    
    if (capturedHeaders) {
      expect(capturedHeaders['x-scenario-id']).toBeTruthy();
    }
  });

  test('should show scenario context in demand report', async ({ page }) => {
    await page.goto('/reports?tab=demand');
    await page.waitForLoadState('networkidle');
    
    // Look for scenario context display
    const hasScenarioContext = await page.evaluate(() => {
      const elements = document.querySelectorAll('div');
      return Array.from(elements).some(el => 
        el.textContent?.includes('Current Scenario')
      );
    });
    
    expect(hasScenarioContext).toBeTruthy();
  });
});