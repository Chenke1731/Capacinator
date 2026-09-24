import { test, expect } from '@playwright/test';
test('basic connection test', async ({ page }) => {
  console.log('Starting connection test');
  // Try to connect to the server
  const response = await page.goto('http://localhost:3121', {
    waitUntil: 'domcontentloaded',
    timeout: 10000
  });
  console.log('Response status:', response?.status());
  // Take a screenshot
  await page.screenshot({ path: 'connection-test.png' });
  // Get page content
  const content = await page.content();
  console.log('Page content length:', content.length);
  console.log('Page title:', await page.title());
  // Check if we have any content
  expect(content.length).toBeGreaterThan(0);
});