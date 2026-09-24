import { test, expect } from '@playwright/test';
import { setupTestUser } from './helpers/test-setup';
test('profile selection and navigation', async ({ page }) => {
  await setupTestUser(page);
  // Take screenshot after setup
  await page.screenshot({ path: 'after-profile-selection.png' });
  // Check for navigation elements
  const peopleLink = await page.locator('text=People').first();
  expect(peopleLink).toBeVisible();
  // Click on People
  await peopleLink.click();
  // Wait for people page to load
  await page.waitForSelector('h1:has-text("People")', { timeout: 10000 });
  // Take screenshot of people page
  await page.screenshot({ path: 'people-page.png' });
  console.log('Successfully navigated to People page');
});