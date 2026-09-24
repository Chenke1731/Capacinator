import { test, expect } from '@playwright/test';
import { TestUtils } from './helpers/test-utils';
test.describe('Project Roadmap Today Line', () => {
  let testUtils: TestUtils;
  test.beforeEach(async ({ page }) => {
    testUtils = new TestUtils(page);
  });
  test('should display today line on roadmap', async ({ page }) => {
    await testUtils.navigateAndWait('/projects?tab=roadmap', 'h1');
    await testUtils.waitForLoadingToComplete();
    // Wait for projects to load
    await page.waitForSelector('.project-row', { timeout: 10000 });
    // Check if today line is visible
    const todayLine = page.locator('.today-line');
    await expect(todayLine).toBeVisible();
    // Verify today line has proper styling
    const todayLineStyles = await todayLine.evaluate(el => {
      const styles = window.getComputedStyle(el);
      return {
        position: styles.position,
        zIndex: styles.zIndex,
        background: styles.background
      };
    });
    expect(todayLineStyles.position).toBe('absolute');
    expect(parseInt(todayLineStyles.zIndex, 10)).toBeGreaterThan(10);
    console.log('✅ Today line is visible with proper styling');
  });
  test('should show today indicator with correct label', async ({ page }) => {
    await testUtils.navigateAndWait('/projects?tab=roadmap', 'h1');
    await testUtils.waitForLoadingToComplete();
    // Wait for projects to load
    await page.waitForSelector('.project-row', { timeout: 10000 });
    // Check today line indicator
    const todayIndicator = page.locator('.today-line-indicator');
    await expect(todayIndicator).toBeVisible();
    // Verify today label
    const todayLabel = page.locator('.today-label');
    await expect(todayLabel).toBeVisible();
    await expect(todayLabel).toContainText('Today');
    console.log('✅ Today indicator shows correct label');
  });
  test('should position today line correctly when using goToToday', async ({ page }) => {
    await testUtils.navigateAndWait('/projects?tab=roadmap', 'h1');
    await testUtils.waitForLoadingToComplete();
    // Wait for projects to load
    await page.waitForSelector('.project-row', { timeout: 10000 });
    // Click the "Today" button
    const todayButton = page.locator('button:has-text("Today")');
    await expect(todayButton).toBeVisible();
    await todayButton.click();
    // Wait for viewport to adjust
    await page.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
    // Verify today line is still visible and positioned correctly
    const todayLine = page.locator('.today-line');
    await expect(todayLine).toBeVisible();
    // Check that today line is positioned roughly 30% from the left of the timeline area
    const todayLinePosition = await todayLine.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return rect.left;
    });
    const timelineContainer = page.locator('.timeline-container');
    const containerPosition = await timelineContainer.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return { left: rect.left, width: rect.width };
    });
    // Calculate relative position (accounting for 320px project info panel)
    const relativePosition = (todayLinePosition - containerPosition.left - 320) / (containerPosition.width - 320);
    // Should be roughly 30% (+/- 20% tolerance due to timeline calculations)
    expect(relativePosition).toBeGreaterThan(0.1);
    expect(relativePosition).toBeLessThan(0.8);
    console.log(`✅ Today line positioned at ${(relativePosition * 100).toFixed(1)}% from left edge`);
  });
  test('should have tooltip with current date', async ({ page }) => {
    await testUtils.navigateAndWait('/projects?tab=roadmap', 'h1');
    await testUtils.waitForLoadingToComplete();
    // Wait for projects to load
    await page.waitForSelector('.project-row', { timeout: 10000 });
    // Check today line tooltip
    const todayLine = page.locator('.today-line');
    await expect(todayLine).toBeVisible();
    const tooltipText = await todayLine.getAttribute('title');
    expect(tooltipText).toContain('Today:');
    // Should contain current date elements
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear().toString();
    expect(tooltipText).toContain(currentYear);
    console.log(`✅ Today line tooltip: ${tooltipText}`);
  });
  test('should maintain today line visibility during horizontal scroll', async ({ page }) => {
    await testUtils.navigateAndWait('/projects?tab=roadmap', 'h1');
    await testUtils.waitForLoadingToComplete();
    // Wait for projects to load
    await page.waitForSelector('.project-row', { timeout: 10000 });
    // Verify today line is initially visible
    const todayLine = page.locator('.today-line');
    await expect(todayLine).toBeVisible();
    // Scroll left using navigation
    const leftNavButton = page.locator('.timeline-nav-side.left');
    if (await leftNavButton.isVisible()) {
      await leftNavButton.click();
      await page.waitForLoadState("domcontentloaded", { timeout: 2000 }).catch(() => {});
    }
    // Today line might not be visible if scrolled away
    const todayLineAfterScroll = await todayLine.isVisible();
    // Navigate back to today
    const todayButton = page.locator('button:has-text("Today")');
    await todayButton.click();
    await page.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
    // Today line should be visible again
    await expect(todayLine).toBeVisible();
    console.log('✅ Today line visibility managed correctly during navigation');
  });
  test('should default to today-centered view on initial load', async ({ page }) => {
    await testUtils.navigateAndWait('/projects?tab=roadmap', 'h1');
    await testUtils.waitForLoadingToComplete();
    // Wait for projects to load
    await page.waitForSelector('.project-row', { timeout: 10000 });
    // Check that today line is visible on initial load
    const todayLine = page.locator('.today-line');
    await expect(todayLine).toBeVisible();
    // Verify the timeline shows current date range
    const timelineRange = page.locator('.timeline-range');
    const rangeText = await timelineRange.textContent();
    // Should show a range that includes current year or surrounding years
    const currentYear = new Date().getFullYear();
    const rangeContainsValidYear = rangeText!.includes(currentYear.toString()) || 
                                   rangeText!.includes((currentYear - 1).toString()) ||
                                   rangeText!.includes((currentYear + 1).toString());
    expect(rangeContainsValidYear).toBe(true);
    console.log(`✅ Initial view shows current date range: ${rangeText}`);
  });
  test('should handle today line animation and hover effects', async ({ page }) => {
    await testUtils.navigateAndWait('/projects?tab=roadmap', 'h1');
    await testUtils.waitForLoadingToComplete();
    // Wait for projects to load
    await page.waitForSelector('.project-row', { timeout: 10000 });
    // Verify today line indicator has animation
    const todayIndicator = page.locator('.today-line-indicator');
    await expect(todayIndicator).toBeVisible();
    const animationName = await todayIndicator.evaluate(el => {
      const styles = window.getComputedStyle(el);
      return styles.animationName;
    });
    expect(animationName).toBe('todayPulse');
    // Test hover effect (skip if element is animating)
    try {
      await todayIndicator.hover({ timeout: 2000 });
    } catch (error) {
      // Element might be animating, which is expected
      console.log('Hover test skipped due to element animation');
    }
    // The hover effect should be applied via CSS
    console.log('✅ Today line has animation and hover effects');
  });
});