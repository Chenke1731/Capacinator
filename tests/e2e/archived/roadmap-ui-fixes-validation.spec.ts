import { test, expect } from '@playwright/test';

test.describe('Project Roadmap UI Fixes Validation', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the project roadmap
    await page.goto('http://localhost:3120/projects');
    
    // Wait for the page to load and click on Roadmap tab
    await page.waitForSelector('[data-testid="projects-tabs"]', { timeout: 10000 });
    await page.click('text=Roadmap');
    
    // Wait for roadmap to load
    await page.waitForSelector('.project-roadmap', { timeout: 10000 });
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {}); // Allow content to settle
  });

  test('should validate UI consolidation fixes are applied', async ({ page }) => {
    // Take a screenshot of the current state
    await page.screenshot({ 
      path: '/home/tony/Pictures/Screenshots/roadmap-ui-fixes-validation.png',
      fullPage: true 
    });
    
    // Check that quarter markers are removed (should not exist)
    const quarterMarkers = await page.locator('.quarter-marker').count();
    expect(quarterMarkers).toBe(0);
    
    // Check timeline header height is reduced (should be 60px)
    const timelineHeader = page.locator('.timeline-header');
    await expect(timelineHeader).toHaveCSS('height', '60px');
    
    // Check year header height is reduced (should be 20px)
    const timelineYears = page.locator('.timeline-years');
    await expect(timelineYears).toHaveCSS('height', '20px');
    
    // Check month header height is reduced (should be 40px)
    const timelineMonths = page.locator('.timeline-months');
    await expect(timelineMonths).toHaveCSS('height', '40px');
    
    // Verify project panel styling improvements
    const projectInfo = page.locator('.project-info').first();
    await expect(projectInfo).toBeVisible();
    
    // Check that priority badges are aligned (should have margin-left: auto)
    const priorityBadge = page.locator('.priority-badge').first();
    if (await priorityBadge.count() > 0) {
      await expect(priorityBadge).toHaveCSS('margin-left', 'auto');
    }
    
    // Verify cleaner header background
    await expect(timelineHeader).toHaveCSS('background-color', 'rgb(255, 255, 255)'); // Should be plain background
    
    console.log('✅ All UI consolidation fixes validated successfully');
  });

  test('should capture detailed roadmap screenshot for comparison', async ({ page }) => {
    // Wait for all content to load
    await page.waitForSelector('.projects-timeline', { timeout: 10000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {}); // Extra time for all phase bars to render
    
    // Take a detailed screenshot
    await page.screenshot({ 
      path: '/home/tony/Pictures/Screenshots/roadmap-detailed-after-fixes.png',
      fullPage: true 
    });
    
    // Also take a screenshot of just the timeline header area
    const timelineHeader = page.locator('.timeline-header');
    await timelineHeader.screenshot({ 
      path: '/home/tony/Pictures/Screenshots/timeline-header-after-fixes.png' 
    });
    
    // Take screenshot of project panel area
    const projectInfo = page.locator('.project-info').first();
    await projectInfo.screenshot({ 
      path: '/home/tony/Pictures/Screenshots/project-panel-after-fixes.png' 
    });
    
    console.log('📸 Screenshots captured for validation');
  });
});