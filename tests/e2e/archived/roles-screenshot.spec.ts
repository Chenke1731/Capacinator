import { test, expect } from './fixtures';

test('Capture roles table screenshot showing counts', async ({ authenticatedPage, testHelpers }) => {
  // Navigate to roles page
  await testHelpers.navigateTo('/roles');
  await testHelpers.waitForDataTable();

  // Wait for table to fully load
  await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

  // Take full page screenshot
  await authenticatedPage.screenshot({
    path: 'roles-table-with-counts-proof.png',
    fullPage: true
  });

  console.log('✅ Screenshot saved: roles-table-with-counts-proof.png');

  // Verify Project Manager row is visible
  const projectManagerRow = authenticatedPage.locator('tbody tr').filter({
    hasText: 'Project Manager'
  }).first();

  await expect(projectManagerRow).toBeVisible();

  // Take focused screenshot of Project Manager row
  await projectManagerRow.screenshot({
    path: 'project-manager-row-proof.png'
  });

  console.log('✅ Screenshot saved: project-manager-row-proof.png');
});
