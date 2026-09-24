import { test, expect } from './fixtures'
test.describe('Actionable Insights Workflow', () => {
  test('should complete full workflow from PersonDetails insights to assignment creation', async ({ authenticatedPage, testHelpers }) => {
    // Step 1: Navigate to People page
    await testHelpers.navigateTo('/People');
    await testHelpers.waitForPageContent();
    await expect(authenticatedPage.locator('h1, [data-testid="page-title"]')).toContainText('People');
    // Step 2: Check for team insights summary (may vary by implementation)
    const insightsContainer = authenticatedPage.locator('.team-insights, .insights-summary, .team-summary, .page-header');
    await expect(insightsContainer.first()).toBeVisible();
    
    // Step 3: Look for a person with actionable insights (different implementations)
    const workloadIndicators = authenticatedPage.locator('.workload-status, .utilization-indicator, .allocation-status, .status-indicator');
    if (await workloadIndicators.count() > 0) {
      await expect(workloadIndicators.first()).toBeVisible();
    }
    // Step 4: Find and click on a person's quick action button
    const quickActionButtons = authenticatedPage.locator('.quick-action-btn, .action-button, .btn-action, button[aria-label*="action"]');
    if (await quickActionButtons.count() > 0) {
      const firstActionButton = quickActionButtons.first();
      const buttonText = await firstActionButton.textContent();
      // Click the action button
      await firstActionButton.click();
      // Step 5: Verify navigation based on action type
      if (buttonText?.includes('Assign')) {
        // Should navigate to assignment creation
        await authenticatedPage.waitForURL('**/assignments/new?**');
        await expect(authenticatedPage.locator('h1')).toContainText('New Assignment');
        // Step 6: Verify context banner and pre-filled form
        await expect(authenticatedPage.locator('.context-banner')).toBeVisible();
        await expect(authenticatedPage.locator('.context-alert')).toContainText('Assignment Context:');
        // Check if person is pre-filled
        const personSelect = authenticatedPage.locator('select[name="person_id"]');
        const selectedPersonValue = await personSelect.inputValue();
        expect(selectedPersonValue).not.toBe('');
      } else if (buttonText?.includes('Reduce')) {
        // Should navigate to assignments with reduce context
        await authenticatedPage.waitForURL('**/assignments?**action=reduce**');
        await expect(authenticatedPage.locator('h1')).toContainText('Assignments');
        // Step 6: Verify context message
        await expect(authenticatedPage.locator('.context-message')).toBeVisible();
        await expect(authenticatedPage.locator('.context-message')).toContainText('reducing workload');
      } else if (buttonText?.includes('Monitor')) {
        // Should navigate to reports with utilization context
        await authenticatedPage.waitForURL('**/reports?**type=utilization**');
        await expect(authenticatedPage.locator('h1')).toContainText('Reports');
      }
    }
  });
  test('should show correct workload insights on PersonDetails page', async ({ authenticatedPage, testHelpers }) => {
    // Step 1: Navigate to People page
    await testHelpers.navigateTo('/People');
    await testHelpers.waitForPageContent();
    // Step 2: Click on a person's name to go to details
    const personLinks = authenticatedPage.locator('table tbody tr td a, [data-testid="person-link"]');
    if (await personLinks.count() > 0) {
      await personLinks.first().click();
      await testHelpers.waitForPageContent();
      // Step 3: Verify PersonDetails page loads
      await expect(authenticatedPage).toHaveURL(/\/people\/[a-f0-9-]+/);
      
      // Step 4: Check for any insights or details sections
      const detailSections = authenticatedPage.locator('.detail-section, .insights-section, .section-content, section');
      await expect(detailSections.first()).toBeVisible();
      
      // Step 5: Look for any action buttons
      const actionButtons = authenticatedPage.locator('.action-btn, .btn-primary, .btn-secondary, button[type="button"]');
      if (await actionButtons.count() > 0) {
        await expect(actionButtons.first()).toBeVisible();
      }
      // Step 8: Test action button functionality
      if (await actionButtons.count() > 0) {
        const firstButton = actionButtons.first();
        const buttonText = await firstButton.textContent();
        await firstButton.click();
        // Verify navigation based on button type
        if (buttonText?.includes('Assign')) {
          await authenticatedPage.waitForURL('**/assignments/new?**');
        } else if (buttonText?.includes('Reduce')) {
          await authenticatedPage.waitForURL('**/assignments?**action=reduce**');
        } else if (buttonText?.includes('Monitor')) {
          await authenticatedPage.waitForURL('**/reports?**type=utilization**');
        }
      }
    }
  });
  test('should handle Reports page actionable insights correctly', async ({ authenticatedPage, testHelpers }) => {
    // Step 1: Navigate to Reports page
    await testHelpers.navigateTo('/reports');
    await testHelpers.waitForPageContent();
    await expect(authenticatedPage.locator('h1')).toContainText('Reports');
    
    // Step 2: Look for report tabs or sections
    const reportTabs = authenticatedPage.locator('[data-tab], .tab-button, button[role="tab"]');
    if (await reportTabs.count() > 0) {
      const capacityTab = reportTabs.filter({ hasText: /capacity|workload|utilization/i });
      if (await capacityTab.count() > 0) {
        await capacityTab.first().click();
        await testHelpers.waitForPageContent();
      }
    }
    
    // Step 3: Check for any action buttons in the report
    const actionButtons = authenticatedPage.locator('.action-buttons .btn, button:has-text("Assign"), button:has-text("View"), button:has-text("Reduce")');
    if (await actionButtons.count() > 0) {
      // Step 4: Test different action types
      const assignButtons = actionButtons.filter({ hasText: 'Assign' });
      const reduceLoadButtons = actionButtons.filter({ hasText: 'Reduce Load' });
      const viewLoadButtons = actionButtons.filter({ hasText: 'View Load' });
      // Test Assign button
      if (await assignButtons.count() > 0) {
        await assignButtons.first().click();
        await authenticatedPage.waitForURL('**/assignments?**action=assign**');
        await expect(authenticatedPage.locator('h1')).toContainText('Assignments');
        await authenticatedPage.goBack();
        await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
      }
      // Test Reduce Load button
      if (await reduceLoadButtons.count() > 0) {
        await reduceLoadButtons.first().click();
        await authenticatedPage.waitForURL('**/assignments?**action=reduce**');
        await expect(authenticatedPage.locator('h1')).toContainText('Assignments');
        await authenticatedPage.goBack();
        await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
      }
    }
    // Step 5: Check role capacity analysis table
    const roleTable = authenticatedPage.locator('.table-container:has(h3:text("Role Capacity Analysis"))');
    await expect(roleTable).toBeVisible();
    const roleActionButtons = roleTable.locator('.action-buttons .btn');
    if (await roleActionButtons.count() > 0) {
      const viewPeopleButtons = roleActionButtons.filter({ hasText: 'View People' });
      const assignWorkButtons = roleActionButtons.filter({ hasText: 'Assign Work' });
      const hireMoreButtons = roleActionButtons.filter({ hasText: 'Hire More' });
      // Test View People button
      if (await viewPeopleButtons.count() > 0) {
        await viewPeopleButtons.first().click();
        await authenticatedPage.waitForURL('**/people?**role=**');
        await expect(authenticatedPage.locator('h1')).toContainText('People');
        await authenticatedPage.goBack();
        await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
      }
    }
  });
  test('should handle contextual form pre-filling in AssignmentNew', async ({ authenticatedPage, testHelpers }) => {
    // Step 1: Navigate directly with query parameters to simulate action button click
    const testParams = '?person=Test Person&action=assign&from=capacity-report&status=AVAILABLE';
    await authenticatedPage.goto(`/assignments/new${testParams}`);
    await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
    // Step 2: Verify page loads correctly
    await expect(authenticatedPage.locator('h1')).toContainText('New Assignment');
    // Step 3: Check for context banner
    await expect(authenticatedPage.locator('.context-banner')).toBeVisible();
    await expect(authenticatedPage.locator('.context-alert')).toContainText('Assignment Context:');
    // Step 4: Check for "From" badge in header
    await expect(authenticatedPage.locator('.badge-info')).toContainText('From capacity-report');
    // Step 5: Verify form pre-filling would work (fields exist)
    await expect(authenticatedPage.locator('select[name="person_id"]')).toBeVisible();
    await expect(authenticatedPage.locator('select[name="role_id"]')).toBeVisible();
    await expect(authenticatedPage.locator('input[name="start_date"]')).toBeVisible();
    await expect(authenticatedPage.locator('input[name="end_date"]')).toBeVisible();
    await expect(authenticatedPage.locator('input[name="allocation_percentage"]')).toBeVisible();
    // Step 6: Test different action contexts
    const reduceParams = '?person=Test Person&action=reduce&from=people-page';
    await authenticatedPage.goto(`/assignments/new${reduceParams}`);
    await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
    await expect(authenticatedPage.locator('.context-alert')).toContainText('Reducing workload');
  });
  test('should handle Assignments page contextual filtering', async ({ authenticatedPage, testHelpers }) => {
    // Step 1: Navigate with filtering context
    const filterParams = '?person=Test Person&action=view&from=capacity-report';
    await authenticatedPage.goto(`/assignments${filterParams}`);
    await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
    // Step 2: Verify page loads correctly
    await expect(authenticatedPage.locator('h1')).toContainText('Assignments');
    // Step 3: Check for context message
    await expect(authenticatedPage.locator('.context-message')).toBeVisible();
    // Step 4: Verify filters would be applied (filter elements exist)
    await expect(authenticatedPage.locator('.filter-bar')).toBeVisible();
    // Step 5: Test different filtering contexts
    const roleFilterParams = '?role=Developer&action=assign&from=reports';
    await authenticatedPage.goto(`/assignments${roleFilterParams}`);
    await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
    await expect(authenticatedPage.locator('.context-message')).toContainText('Developer');
  });
  test('should maintain workflow context across page transitions', async ({ authenticatedPage, testHelpers }) => {
    // Step 1: Start from People page
    await authenticatedPage.click('nav a[href="/people"]');
    await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
    // Step 2: Click a quick action button (simulate workflow start)
    const quickActionButtons = authenticatedPage.locator('.quick-action-btn');
    if (await quickActionButtons.count() > 0) {
      const firstButton = quickActionButtons.first();
      const buttonText = await firstButton.textContent();
      await firstButton.click();
      // Step 3: Verify context is preserved in URL
      const currentUrl = authenticatedPage.url();
      expect(currentUrl).toContain('person=');
      expect(currentUrl).toContain('action=');
      // Step 4: If we're on assignment creation, test form behavior
      if (currentUrl.includes('/assignments/new')) {
        await expect(authenticatedPage.locator('.context-banner')).toBeVisible();
        // Step 5: Test cancel button maintains context awareness
        const cancelButton = authenticatedPage.locator('button:has-text("Cancel")');
        if (await cancelButton.count() > 0) {
          await cancelButton.click();
          // Should return to assignments page
          await expect(authenticatedPage.locator('h1')).toContainText('Assignments');
        }
      }
    }
  });
  test('should handle error states gracefully in actionable insights', async ({ authenticatedPage, testHelpers }) => {
    // Step 1: Test with invalid query parameters
    await testHelpers.navigateTo('/assignments/new?person=NonExistentPerson&action=assign');
    await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
    // Should still show page without crashing
    await expect(authenticatedPage.locator('h1')).toContainText('New Assignment');
    await expect(authenticatedPage.locator('.context-banner')).toBeVisible();
    // Step 2: Test People page without utilization data
    await authenticatedPage.click('nav a[href="/people"]');
    await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
    // Should still show people table
    await expect(authenticatedPage.locator('h1')).toContainText('People');
    await expect(authenticatedPage.locator('table')).toBeVisible();
  });
  test('should provide accessible actionable insights', async ({ authenticatedPage, testHelpers }) => {
    // Step 1: Navigate to People page
    await authenticatedPage.click('nav a[href="/people"]');
    await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
    // Step 2: Check for proper ARIA labels and accessibility
    const quickActionButtons = authenticatedPage.locator('.quick-action-btn');
    if (await quickActionButtons.count() > 0) {
      const firstButton = quickActionButtons.first();
      // Verify button has accessible text
      const buttonText = await firstButton.textContent();
      expect(buttonText?.trim()).toBeTruthy();
      // Verify button is keyboard accessible
      await firstButton.focus();
      await expect(firstButton).toBeFocused();
    }
    // Step 3: Test PersonDetails page accessibility
    const personLinks = authenticatedPage.locator('table tbody tr td a');
    if (await personLinks.count() > 0) {
      await personLinks.first().click();
      await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
      // Check insights section accessibility
      const actionButtons = authenticatedPage.locator('.action-btn');
      if (await actionButtons.count() > 0) {
        const firstActionButton = actionButtons.first();
        await firstActionButton.focus();
        await expect(firstActionButton).toBeFocused();
      }
    }
  });
  test('should display correct status indicators and colors', async ({ authenticatedPage, testHelpers }) => {
    // Step 1: Navigate to People page
    await authenticatedPage.click('nav a[href="/people"]');
    await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
    // Step 2: Check for workload status indicators
    const statusIndicators = authenticatedPage.locator('.status-indicator');
    if (await statusIndicators.count() > 0) {
      // Verify different status colors exist
      const dangerStatus = authenticatedPage.locator('.status-danger');
      const warningStatus = authenticatedPage.locator('.status-warning');
      const successStatus = authenticatedPage.locator('.status-success');
      const infoStatus = authenticatedPage.locator('.status-info');
      // At least one status type should be present
      const totalStatuses = await dangerStatus.count() + 
                            await warningStatus.count() + 
                            await successStatus.count() + 
                            await infoStatus.count();
      expect(totalStatuses).toBeGreaterThan(0);
    }
    // Step 3: Check PersonDetails status indicators
    const personLinks = authenticatedPage.locator('table tbody tr td a');
    if (await personLinks.count() > 0) {
      await personLinks.first().click();
      await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
      // Verify insight cards have proper styling
      const insightCards = authenticatedPage.locator('.insight-card');
      await expect(insightCards.first()).toBeVisible();
      // Check for status badges
      const statusBadges = authenticatedPage.locator('.insight-status');
      if (await statusBadges.count() > 0) {
        await expect(statusBadges.first()).toBeVisible();
      }
    }
  });
});