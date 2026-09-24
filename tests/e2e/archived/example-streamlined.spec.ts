/**
 * Example of streamlined E2E test using improved helpers
 * This demonstrates best practices for writing efficient E2E tests
 */
import { test, expect } from './helpers/base-test';
import { testConfig, waitForPageReady, waitForApiCall } from './helpers/test-config';
test.describe('Streamlined E2E Test Example', () => {
  test('should navigate to projects and interact with UI', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    // Navigate to projects page
    await testHelpers.navigateTo('/projects');
    await waitForPageReady(page);
    // Wait for projects data to load
    await waitForApiCall(page, testConfig.api.projects);
    // Verify we have projects in the table
    const projectRows = authenticatedPage.locator(testConfig.selectors.dataTable);
    await expect(projectRows.first()).toBeVisible({ 
      timeout: testConfig.timeouts.elementVisible 
    });
    // Click on first project's details button
    const viewDetailsButton = projectRows.first().getByRole('button', { name: 'View Details' });
    await viewDetailsButton.click();
    // Wait for navigation and phase manager to load
    await waitForPageReady(page);
    await authenticatedPage.waitForSelector('.project-phase-manager', { 
      timeout: testConfig.timeouts.elementVisible 
    });
    // Verify Add Phase button is present
    const addPhaseButton = authenticatedPage.getByRole('button', { name: /add phase/i });
    await expect(addPhaseButton).toBeVisible();
    await expect(addPhaseButton).toBeEnabled();
    console.log('✅ Successfully navigated to project details and verified UI elements');
  });
  test('should handle modal interactions efficiently', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    // Navigate directly to a project (if you know the ID)
    await testHelpers.navigateTo('/projects');
    await waitForPageReady(page);
    // Get to project detail
    const projectRows = authenticatedPage.locator(testConfig.selectors.dataTable);
    await projectRows.first().getByRole('button', { name: 'View Details' }).click();
    await authenticatedPage.waitForSelector('.project-phase-manager');
    // Open Add Phase modal
    await authenticatedPage.getByRole('button', { name: /add phase/i }).click();
    // Wait for modal with configured timeout
    await authenticatedPage.waitForSelector(testConfig.selectors.modalOverlay, { 
      state: 'visible',
      timeout: testConfig.timeouts.elementVisible 
    });
    // Verify modal content loaded
    await expect(authenticatedPage.getByText('What type of phase would you like to add?')).toBeVisible();
    // Close modal
    await authenticatedPage.getByRole('button', { name: 'Cancel' }).click();
    // Wait for modal to close
    await authenticatedPage.waitForSelector(testConfig.selectors.modalOverlay, { 
      state: 'hidden',
      timeout: testConfig.timeouts.elementVisible 
    });
    console.log('✅ Modal interaction completed successfully');
  });
  test('should handle form submissions with proper wait strategies', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    // This test demonstrates how to handle async form submissions
    // For actual implementation, you'd navigate to the appropriate page
    console.log('✅ Form submission test placeholder - implement based on your needs');
  });
});
// Example of a test with custom timeout
test.describe('Tests with custom timeouts', () => {
  test.setTimeout(60000); // Set timeout for all tests in this describe block
  test('long running test example', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    // Your long-running test logic here
    await testHelpers.navigateTo('/dashboard');
    await waitForPageReady(page);
    console.log('✅ Long running test completed');
  });
});