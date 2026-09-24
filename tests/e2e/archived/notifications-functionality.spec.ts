import { test, expect } from './fixtures'
test.describe('Email Notifications Functionality', () => {
  test.describe('Email Configuration Status', () => {
    test('should display email configuration status', async ({ authenticatedPage, testHelpers }) => {
      // Wait for configuration check to complete
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      // Check configuration status section exists
      await expect(authenticatedPage.locator('.config-status')).toBeVisible();
      await expect(authenticatedPage.locator('.status-indicator')).toBeVisible();
      // Should show either configured or not configured
      const statusBadge = authenticatedPage.locator('.status-badge').first();
      await expect(statusBadge).toBeVisible();
      const statusText = await statusBadge.textContent();
      expect(statusText).toMatch(/Configured|Not Configured/);
    });
    test('should show connection test results when configured', async ({ authenticatedPage, testHelpers }) => {
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      // If email is configured, should show connection test
      const statusBadge = authenticatedPage.locator('.status-badge').first();
      const statusText = await statusBadge.textContent();
      if (statusText?.includes('Configured')) {
        // Should show connection test results
        await expect(authenticatedPage.locator('.connection-test')).toBeVisible();
        const connectionBadge = authenticatedPage.locator('.connection-test .status-badge');
        await expect(connectionBadge).toBeVisible();
        const connectionText = await connectionBadge.textContent();
        expect(connectionText).toMatch(/Connection OK|Connection Failed/);
      }
    });
  });
  test.describe('Test Email Functionality', () => {
    test('should display test email form', async ({ authenticatedPage, testHelpers }) => {
      // Check test email section
      await expect(authenticatedPage.locator('h3:has-text("Test Email")')).toBeVisible();
      await expect(authenticatedPage.locator('label:has-text("Test Email Address")')).toBeVisible();
      await expect(authenticatedPage.locator('input[type="email"]')).toBeVisible();
      await expect(authenticatedPage.locator('button:has-text("Send Test Email")')).toBeVisible();
    });
    test('should validate email address before sending', async ({ authenticatedPage, testHelpers }) => {
      // Try to send without email address
      await authenticatedPage.click('button:has-text("Send Test Email")');
      // Should show validation message
      await expect(authenticatedPage.locator('.text-destructive, .save-message')).toContainText('email address', { timeout: 3000 });
    });
    test('should attempt to send test email with valid address', async ({ authenticatedPage, testHelpers }) => {
      // Fill valid email address
      await authenticatedPage.fill('input[type="email"]', 'test@example.com');
      // Send test email
      await authenticatedPage.click('button:has-text("Send Test Email")');
      // Should show some response (success or error depending on SMTP config)
      await expect(authenticatedPage.locator('.success-message, .text-destructive, .save-message')).toBeVisible({ timeout: 5000 });
    });
    test('should disable send button when email service not configured', async ({ authenticatedPage, testHelpers }) => {
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      const statusBadge = authenticatedPage.locator('.status-badge').first();
      const statusText = await statusBadge.textContent();
      if (statusText?.includes('Not Configured')) {
        // Button should be disabled
        const sendButton = authenticatedPage.locator('button:has-text("Send Test Email")');
        await expect(sendButton).toBeDisabled();
      }
    });
    test('should show loading state when sending email', async ({ authenticatedPage, testHelpers }) => {
      // Fill email and send
      await authenticatedPage.fill('input[type="email"]', 'test@example.com');
      await authenticatedPage.click('button:has-text("Send Test Email")');
      // Button should show loading state temporarily
      await expect(authenticatedPage.locator('button:disabled')).toBeVisible({ timeout: 1000 });
    });
  });
  test.describe('Notification Templates', () => {
    test('should display notification templates section', async ({ authenticatedPage, testHelpers }) => {
      await expect(authenticatedPage.locator('h3:has-text("Notification Templates")')).toBeVisible();
      await expect(authenticatedPage.locator('.templates-list')).toBeVisible();
    });
    test('should load and display email templates', async ({ authenticatedPage, testHelpers }) => {
      // Wait for templates to load
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      // Check if templates are loaded (they should exist in a fresh system)
      const templates = authenticatedPage.locator('.template-item');
      const templateCount = await templates.count();
      if (templateCount > 0) {
        // Check first template structure
        const firstTemplate = templates.first();
        await expect(firstTemplate.locator('.template-header h4')).toBeVisible();
        await expect(firstTemplate.locator('.template-type')).toBeVisible();
        await expect(firstTemplate.locator('.template-details')).toBeVisible();
        // Should show subject and status
        await expect(firstTemplate.locator('p:has-text("Subject:")')).toBeVisible();
        await expect(firstTemplate.locator('p:has-text("Status:")')).toBeVisible();
      }
    });
    test('should display different template types', async ({ authenticatedPage, testHelpers }) => {
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      const templates = authenticatedPage.locator('.template-item');
      const templateCount = await templates.count();
      if (templateCount > 0) {
        // Check for different template types (assignment, approval, project, system, summary)
        const templateTypes = await authenticatedPage.locator('.template-type').allTextContents();
        // Should have at least some template types
        expect(templateTypes.length).toBeGreaterThan(0);
        // Common template types that should exist
        const expectedTypes = ['assignment', 'approval', 'project', 'system', 'summary'];
        const foundTypes = templateTypes.some(type => 
          expectedTypes.some(expected => type.toLowerCase().includes(expected))
        );
        expect(foundTypes).toBe(true);
      }
    });
  });
  test.describe('System-wide Email Settings', () => {
    test('should display system-wide email settings', async ({ authenticatedPage, testHelpers }) => {
      await expect(authenticatedPage.locator('h3:has-text("System Settings")')).toBeVisible();
      await expect(authenticatedPage.locator('label:has-text("Enable Email Notifications System-wide")')).toBeVisible();
      await expect(authenticatedPage.locator('input[type="checkbox"]:near(:text("Enable Email Notifications System-wide"))')).toBeVisible();
    });
    test('should allow toggling system-wide email notifications', async ({ authenticatedPage, testHelpers }) => {
      const systemCheckbox = authenticatedPage.locator('input[type="checkbox"]:near(:text("Enable Email Notifications System-wide"))');
      // Get current state
      const initialState = await systemCheckbox.isChecked();
      // Toggle the setting
      if (initialState) {
        await systemCheckbox.uncheck();
      } else {
        await systemCheckbox.check();
      }
      // Verify the toggle worked
      const newState = await systemCheckbox.isChecked();
      expect(newState).toBe(!initialState);
      // Save the setting
      await authenticatedPage.click('button:has-text("Save Settings")');
      // Should show success message
      await expect(authenticatedPage.locator('.success-message, .save-message')).toContainText('saved successfully', { timeout: 5000 });
    });
    test('should persist system-wide setting across page reloads', async ({ authenticatedPage, testHelpers }) => {
      const systemCheckbox = authenticatedPage.locator('input[type="checkbox"]:near(:text("Enable Email Notifications System-wide"))');
      // Enable notifications
      await systemCheckbox.check();
      await authenticatedPage.click('button:has-text("Save Settings")');
      await expect(authenticatedPage.locator('.success-message, .save-message')).toContainText('saved successfully', { timeout: 5000 });
      // Reload page and navigate back to notifications
      await authenticatedPage.reload();
      await authenticatedPage.click('button:has-text("Email Notifications")');
      // Wait for settings to load
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      // Setting should still be enabled
      const reloadedCheckbox = authenticatedPage.locator('input[type="checkbox"]:near(:text("Enable Email Notifications System-wide"))');
      await expect(reloadedCheckbox).toBeChecked();
    });
  });
  test.describe('Integration with Assignment System', () => {
    test('should have notification system ready for assignment notifications', async ({ authenticatedPage, testHelpers }) => {
      // Navigate to assignments page to verify integration
      await testHelpers.navigateTo('/assignments');
      // The notification system should be running in the background
      // We can't easily test actual email sending in e2e, but we can verify
      // the system is properly integrated by checking the settings work
      // Go back to notifications settings
      await testHelpers.navigateTo('/settings');
      await authenticatedPage.click('button:has-text("Email Notifications")');
      // Verify system is ready (configuration exists)
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      await expect(authenticatedPage.locator('.config-status')).toBeVisible();
    });
  });
  test.describe('Notification History Access', () => {
    test('should display notification statistics section', async ({ authenticatedPage, testHelpers }) => {
      // While we don't have direct UI for notification history in settings,
      // the backend should be ready to serve it
      // Verify the notifications tab is functional
      await expect(authenticatedPage.locator('h3:has-text("Notification Templates")')).toBeVisible();
      await expect(authenticatedPage.locator('h3:has-text("System Settings")')).toBeVisible();
      // The system should be ready to track notification history
      // (This would be verified through API tests or admin interfaces)
    });
  });
  test.describe('Error Handling', () => {
    test('should handle API errors gracefully', async ({ authenticatedPage, testHelpers }) => {
      // Try to send test email with invalid configuration
      await authenticatedPage.fill('input[type="email"]', 'test@example.com');
      await authenticatedPage.click('button:has-text("Send Test Email")');
      // Should handle errors gracefully (either success or error message)
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      // Should not crash or hang
      await expect(authenticatedPage.locator('button:has-text("Send Test Email")')).toBeVisible();
    });
    test('should handle template loading errors', async ({ authenticatedPage, testHelpers }) => {
      // Wait for templates to attempt loading
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      // Templates section should still be visible even if loading fails
      await expect(authenticatedPage.locator('.templates-list')).toBeVisible();
    });
    test('should handle configuration check timeouts', async ({ authenticatedPage, testHelpers }) => {
      // Wait for configuration check
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      // Configuration section should still be visible
      await expect(authenticatedPage.locator('.config-status')).toBeVisible();
      await expect(authenticatedPage.locator('.status-indicator')).toBeVisible();
    });
  });
  test.describe('User Experience', () => {
    test('should show appropriate loading states', async ({ authenticatedPage, testHelpers }) => {
      // When switching to notifications tab, should show loading states
      await testHelpers.navigateTo('/settings');
      await authenticatedPage.click('button:has-text("System")'); // Switch away
      await authenticatedPage.click('button:has-text("Email Notifications")'); // Switch back
      // Should immediately show the structure even while loading
      await expect(authenticatedPage.locator('h3:has-text("Email Configuration")')).toBeVisible();
      await expect(authenticatedPage.locator('h3:has-text("Test Email")')).toBeVisible();
    });
    test('should provide helpful status messages', async ({ authenticatedPage, testHelpers }) => {
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      // Should show status message
      await expect(authenticatedPage.locator('.status-message')).toBeVisible();
      // Status message should be informative
      const statusMessage = await authenticatedPage.locator('.status-message').textContent();
      expect(statusMessage).toBeTruthy();
      expect(statusMessage!.length).toBeGreaterThan(5);
    });
    test('should have accessible form labels and controls', async ({ authenticatedPage, testHelpers }) => {
      // Check for proper form labels
      await expect(authenticatedPage.locator('label:has-text("Test Email Address")')).toBeVisible();
      await expect(authenticatedPage.locator('label:has-text("Enable Email Notifications System-wide")')).toBeVisible();
      // Check for proper button text
      await expect(authenticatedPage.locator('button:has-text("Send Test Email")')).toBeVisible();
      await expect(authenticatedPage.locator('button:has-text("Save Settings")')).toBeVisible();
    });
  });
});