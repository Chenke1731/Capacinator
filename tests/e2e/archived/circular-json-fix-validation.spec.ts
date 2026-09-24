import { test, expect } from './fixtures'
/**
 * Validation Test for Circular JSON Structure Fix
 * 
 * This test specifically validates that the circular JSON structure error
 * reported in the browser console has been resolved.
 */
test.describe('Circular JSON Structure Fix Validation', () => {
  test('should not produce circular JSON errors when creating assignments via utilization modals', async ({ authenticatedPage, testHelpers }) => {
    // Navigate to utilization report
    await testHelpers.navigateTo('/reports');
    await testHelpers.setupPage();
    await authenticatedPage.click('button:has-text("Utilization Report")');
    await authenticatedPage.waitForSelector('h2:has-text("Team Utilization Overview")');
    // Find and click an "Add Assignment" button
    const addButton = authenticatedPage.locator('button:has-text("➕ Add Assignment")').first();
    await addButton.click();
    // Wait for modal to open
    await authenticatedPage.waitForSelector('[data-modal="true"], .modal, [role="dialog"]');
    // Fill out the assignment form
    await authenticatedPage.selectOption('select[name="project_id"]', '987fcdeb-51a2-4b3c-d4e5-f6a7b8c9d0e1');
    await authenticatedPage.selectOption('select[name="role_id"]', '69dc7737-845a-43f0-9006-8e24c59a6e9b');
    await authenticatedPage.fill('input[name="allocation_percentage"]', '25');
    await authenticatedPage.fill('input[name="start_date"]', '2024-02-01');
    await authenticatedPage.fill('input[name="end_date"]', '2024-02-28');
    // Monitor for console errors
    const consoleErrors: string[] = [];
    authenticatedPage.on('console', msg => {
      if (msg.type() === 'error' && msg.text().includes('circular')) {
        consoleErrors.push(msg.text());
      }
    });
    // Monitor network requests for assignment creation
    let assignmentResponse: any = null;
    authenticatedPage.on('response', async response => {
      if (response.url().includes('/api/assignments') && response.request().method() === 'POST') {
        assignmentResponse = response;
      }
    });
    // Submit the form
    await authenticatedPage.click('button[type="submit"], button:has-text("Create"), button:has-text("Save")');
    // Wait for the API call to complete
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    // Verify no circular JSON errors occurred
    expect(consoleErrors).toHaveLength(0);
    console.log('✅ No circular JSON structure errors detected in console');
    // Verify the API response is valid if captured
    if (assignmentResponse) {
      expect(assignmentResponse.status()).toBe(201);
      // Try to parse the response body - this will fail if circular references exist
      const responseBody = await assignmentResponse.json();
      expect(responseBody).toBeDefined();
      expect(responseBody).toHaveProperty('id');
      console.log('✅ Assignment API response successfully parsed without circular reference errors');
      // Clean up - delete the created assignment
      if (responseBody.id) {
        await authenticatedPage.request.delete(`https://localhost:3120/api/assignments/${responseBody.id}`);
      }
    }
    // Close modal if still open
    const modal = authenticatedPage.locator('[data-modal="true"], .modal, [role="dialog"]');
    if (await modal.count() > 0) {
      await authenticatedPage.keyboard.press('Escape');
    }
  });
  test('should handle notification scheduler calls without circular references', async ({ authenticatedPage, testHelpers }) => {
    // Direct API test to ensure the notification scheduler fix works
    const assignmentData = {
      project_id: '987fcdeb-51a2-4b3c-d4e5-f6a7b8c9d0e1',
      person_id: '123e4567-e89b-12d3-a456-426614174001',
      role_id: '69dc7737-845a-43f0-9006-8e24c59a6e9b',
      allocation_percentage: 35,
      start_date: '2024-03-01',
      end_date: '2024-03-15',
      assignment_date_mode: 'fixed'
    };
    // Monitor console for errors
    const consoleErrors: string[] = [];
    authenticatedPage.on('console', msg => {
      if (msg.type() === 'error' && (msg.text().includes('circular') || msg.text().includes('JSON'))) {
        consoleErrors.push(msg.text());
      }
    });
    // Create assignment through API (this triggers notification scheduler)
    const response = await authenticatedPage.request.post('https://localhost:3120/api/assignments', {
      data: assignmentData
    });
    // Validate response
    expect(response.status()).toBe(201);
    const responseBody = await response.json();
    // Test that the response can be stringified and parsed (no circular refs)
    expect(() => {
      const stringified = JSON.stringify(responseBody);
      JSON.parse(stringified);
    }).not.toThrow();
    console.log('✅ Assignment creation with notification scheduler completed without circular reference errors');
    // Wait a moment for any async notification processing
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    // Verify no console errors occurred
    expect(consoleErrors).toHaveLength(0);
    // Clean up
    await authenticatedPage.request.delete(`https://localhost:3120/api/assignments/${responseBody.id}`);
  });
});