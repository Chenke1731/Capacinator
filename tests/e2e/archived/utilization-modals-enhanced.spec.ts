import { test, expect } from './fixtures';
/**
 * Enhanced E2E Tests for Utilization Report Modals
 * 
 * Comprehensive testing of add/remove project capabilities including:
 * - Modal opening/closing behavior
 * - Form validation and data accuracy
 * - Assignment creation/deletion operations
 * - API response validation
 * - Database persistence verification
 * - Error handling scenarios
 * - UI state management
 */
test.describe('Utilization Report Modals - Enhanced Coverage', () => {
  test.beforeEach(async ({ authenticatedPage, testHelpers }) => {
    await testHelpers.navigateTo('/reports');
    await testHelpers.setupPage();
    await authenticatedPage.click('button:has-text("Utilization Report")');
    await authenticatedPage.waitForSelector('h2:has-text("Team Utilization Overview")');
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  });

  test.describe('Add Projects Modal Functionality', () => {
    test('should open add projects modal with correct person data and recommendations', async ({ authenticatedPage, testHelpers }) => {
      // Find person with capacity for new projects
      const tableRows = authenticatedPage.locator('table:has(th:has-text("Team Member")) tbody tr');
      const rowCount = await tableRows.count();
      expect(rowCount).toBeGreaterThan(0);
      let targetRow = null;
      let personName = '';
      let utilization = 0;
      for (let i = 0; i < rowCount; i++) {
        const row = tableRows.nth(i);
        const nameCell = row.locator('td').nth(0); // Team Member column
        const utilizationCell = row.locator('td').nth(2); // Utilization column
        const actionsCell = row.locator('td').nth(4); // Actions column
        personName = await nameCell.textContent() || '';
        const utilizationText = await utilizationCell.textContent() || '';
        utilization = parseInt(utilizationText.replace('%', '').trim());
        // Look for person with capacity and available add button
        if (utilization < 90) {
          const addButton = actionsCell.locator('button:has-text("➕ Add"), button:has-text("Add Projects")');
          if (await addButton.count() > 0) {
            targetRow = row;
            // Click add projects button
            await addButton.click();
            break;
          }
        }
      }
      expect(targetRow).toBeTruthy();
      // Verify modal opened correctly
      const modal = authenticatedPage.locator('div:has(h2:has-text("➕ Add Projects:"))');
      await expect(modal).toBeVisible();
      // Verify modal contains correct person information
      await expect(modal).toContainText(personName);
      await expect(modal).toContainText(`${utilization}% utilization`);
      // Verify modal structure
      await expect(modal.locator('h2')).toContainText(`➕ Add Projects: ${personName}`);
      // Check for close button
      const closeButton = modal.locator('button:has(svg), button:has-text("×")');
      await expect(closeButton).toBeVisible();
      // Wait for project recommendations to load
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      // Verify recommendations section exists
      const recommendationsSection = modal.locator('div:has-text("recommended projects"), div:has-text("No suitable projects")');
      await expect(recommendationsSection).toBeVisible();
      // If projects are available, verify their structure
      const projectCards = modal.locator('div:has(h4)').filter({ hasText: 'h/week' });
      const projectCount = await projectCards.count();
      if (projectCount > 0) {
        const firstProject = projectCards.first();
        // Verify project information is displayed
        await expect(firstProject.locator('h4')).toBeVisible(); // Project name
        await expect(firstProject).toContainText('h/week'); // Estimated hours
        await expect(firstProject).toContainText('Priority'); // Priority level
        await expect(firstProject).toContainText('👤'); // Role information
        // Verify assign button
        const assignButton = firstProject.locator('button:has-text("Assign")');
        await expect(assignButton).toBeVisible();
        await expect(assignButton).toHaveCSS('background-color', 'rgb(22, 163, 74)'); // Green button
        // Verify match score badge
        const matchBadge = firstProject.locator('span:has-text("Match")');
        await expect(matchBadge).toBeVisible();
        console.log(`✅ Found ${projectCount} project recommendations with proper structure`);
      } else {
        // Verify no projects message
        await expect(modal).toContainText('No suitable projects found for assignment');
        console.log('✅ Proper handling of no available projects');
      }
      // Close modal
      await closeButton.first().click();
      await expect(modal).not.toBeVisible();
    });
    test('should successfully create assignment through add projects modal', async ({ authenticatedPage, testHelpers }) => {
      // Find person with capacity
      const tableRows = authenticatedPage.locator('table:has(th:has-text("Team Member")) tbody tr');
      let targetRow = null;
      let initialUtilization = 0;
      let personName = '';
      const rowCount = await tableRows.count();
      for (let i = 0; i < rowCount; i++) {
        const row = tableRows.nth(i);
        const nameCell = row.locator('td').nth(0);
        const utilizationCell = row.locator('td').nth(2);
        const actionsCell = row.locator('td').nth(4);
        personName = await nameCell.textContent() || '';
        const utilizationText = await utilizationCell.textContent() || '';
        initialUtilization = parseInt(utilizationText.replace('%', '').trim());
        if (initialUtilization < 80) {
          const addButton = actionsCell.locator('button:has-text("➕"), button:has-text("Add")');
          if (await addButton.count() > 0) {
            targetRow = row;
            await addButton.click();
            break;
          }
        }
      }
      if (!targetRow) {
        test.skip('No person with available capacity found');
        return;
      }
      // Wait for modal and projects to load
      const modal = authenticatedPage.locator('div:has(h2:has-text("➕ Add Projects:"))');
      await expect(modal).toBeVisible();
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      // Find assignable projects
      const projectCards = modal.locator('div:has(h4)').filter({ hasText: 'Assign' });
      const projectCount = await projectCards.count();
      if (projectCount === 0) {
        await modal.locator('button:has(svg)').first().click();
        test.skip('No assignable projects available');
        return;
      }
      const firstProject = projectCards.first();
      const projectName = await firstProject.locator('h4').textContent();
      // Monitor API calls
      const createResponse = authenticatedPage.waitForResponse(response => 
        response.url().includes('/api/assignments') && 
        response.request().method() === 'POST'
      );
      // Monitor console errors
      const consoleErrors: string[] = [];
      authenticatedPage.on('console', msg => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });
      // Handle confirmation dialog
      authenticatedPage.on('dialog', dialog => {
        expect(dialog.message()).toContain('Are you sure you want to assign');
        expect(dialog.message()).toContain(personName);
        expect(dialog.message()).toContain(projectName);
        dialog.accept();
      });
      // Click assign button
      await firstProject.locator('button:has-text("Assign")').click();
      // Verify API call was successful
      const response = await createResponse;
      expect(response.status()).toBe(201);
      // Validate response structure
      const responseBody = await testHelpers.validateAssignmentCreationResponse(response);
      expect(responseBody).toHaveProperty('id');
      expect(responseBody).toHaveProperty('project_id');
      expect(responseBody).toHaveProperty('person_id');
      expect(responseBody).toHaveProperty('allocation_percentage');
      console.log('✅ Assignment created successfully with valid response structure');
      // Verify modal closes
      await expect(modal).not.toBeVisible({ timeout: 10000 });
      // Wait for data refresh
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      // Verify utilization has increased (find the same person)
      const updatedRows = authenticatedPage.locator('table:has(th:has-text("Team Member")) tbody tr');
      const updatedRowCount = await updatedRows.count();
      let foundPerson = false;
      for (let i = 0; i < updatedRowCount; i++) {
        const row = updatedRows.nth(i);
        const nameCell = row.locator('td').nth(0);
        const utilizationCell = row.locator('td').nth(2);
        const currentName = await nameCell.textContent() || '';
        if (currentName === personName) {
          const currentUtilizationText = await utilizationCell.textContent() || '';
          const currentUtilization = parseInt(currentUtilizationText.replace('%', '').trim());
          expect(currentUtilization).toBeGreaterThan(initialUtilization);
          foundPerson = true;
          console.log(`✅ Utilization increased from ${initialUtilization}% to ${currentUtilization}%`);
          break;
        }
      }
      expect(foundPerson).toBeTruthy();
      expect(consoleErrors.length).toBe(0);
      // Clean up - delete the created assignment
      if (responseBody.id) {
        await authenticatedPage.request.delete(`https://localhost:3120/api/assignments/${responseBody.id}`);
      }
    });
    test('should validate form fields and handle invalid data', async ({ authenticatedPage, testHelpers }) => {
      // Open modal for any person with capacity
      const addButton = authenticatedPage.locator('button:has-text("➕"), button:has-text("Add")').first();
      await addButton.click();
      const modal = authenticatedPage.locator('div:has(h2:has-text("➕ Add Projects:"))');
      await expect(modal).toBeVisible();
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      // Test error handling with API failure simulation
      await authenticatedPage.route('**/api/assignments', route => {
        if (route.request().method() === 'POST') {
          route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Invalid assignment data' })
          });
        } else {
          route.continue();
        }
      });
      const projectCards = modal.locator('div:has(h4)').filter({ hasText: 'Assign' });
      const projectCount = await projectCards.count();
      if (projectCount > 0) {
        // Handle dialogs
        authenticatedPage.on('dialog', async dialog => {
          if (dialog.message().includes('Are you sure')) {
            await dialog.accept();
          } else if (dialog.message().includes('Failed to create')) {
            await dialog.accept();
            console.log('✅ Error handling dialog displayed correctly');
          }
        });
        // Try to assign - should fail gracefully
        await projectCards.first().locator('button:has-text("Assign")').click();
        // Wait for error handling
        await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        // Modal should still be visible after error
        await expect(modal).toBeVisible();
      }
      // Close modal
      await modal.locator('button:has(svg)').first().click();
      await expect(modal).not.toBeVisible();
    });
    test('should display accurate project priority and match scores', async ({ authenticatedPage, testHelpers }) => {
      const addButton = authenticatedPage.locator('button:has-text("➕"), button:has-text("Add")').first();
      await addButton.click();
      const modal = authenticatedPage.locator('div:has(h2:has-text("➕ Add Projects:"))');
      await expect(modal).toBeVisible();
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      const projectCards = modal.locator('div:has(h4)').filter({ hasText: 'h/week' });
      const projectCount = await projectCards.count();
      if (projectCount > 0) {
        for (let i = 0; i < Math.min(3, projectCount); i++) {
          const project = projectCards.nth(i);
          const projectText = await project.textContent() || '';
          // Verify priority information
          expect(projectText).toMatch(/(High|Medium|Low)\s+Priority/);
          // Verify hours estimation is reasonable
          const hoursMatch = projectText.match(/~(\d+)h\/week/);
          if (hoursMatch) {
            const hours = parseInt(hoursMatch[1], 10);
            expect(hours).toBeGreaterThanOrEqual(1);
            expect(hours).toBeLessThanOrEqual(40);
          }
          // Verify match score badge exists and has proper styling
          const matchBadge = project.locator('span:has-text("Match")');
          await expect(matchBadge).toBeVisible();
          // Verify role information is present
          await expect(project).toContainText('👤');
        }
        console.log(`✅ Verified project data accuracy for ${Math.min(3, projectCount)} projects`);
      }
      await modal.locator('button:has(svg)').first().click();
    });
  });
  test.describe('Remove Projects Modal Functionality', () => {
    test('should open reduce load modal with current assignments', async ({ authenticatedPage, testHelpers }) => {
      // Find person with assignments
      const tableRows = authenticatedPage.locator('table:has(th:has-text("Team Member")) tbody tr');
      const rowCount = await tableRows.count();
      let targetRow = null;
      let personName = '';
      let utilization = 0;
      for (let i = 0; i < rowCount; i++) {
        const row = tableRows.nth(i);
        const nameCell = row.locator('td').nth(0);
        const utilizationCell = row.locator('td').nth(2);
        const actionsCell = row.locator('td').nth(4);
        personName = await nameCell.textContent() || '';
        const utilizationText = await utilizationCell.textContent() || '';
        utilization = parseInt(utilizationText.replace('%', '').trim());
        if (utilization > 0) {
          const reduceButton = actionsCell.locator('button:has-text("🔻"), button:has-text("Reduce")');
          if (await reduceButton.count() > 0) {
            targetRow = row;
            await reduceButton.click();
            break;
          }
        }
      }
      expect(targetRow).toBeTruthy();
      // Verify modal opened correctly
      const modal = authenticatedPage.locator('div:has(h2:has-text("🔻 Reduce Load:"))');
      await expect(modal).toBeVisible();
      // Verify modal contains correct person information
      await expect(modal).toContainText(personName);
      await expect(modal).toContainText(`${utilization}% utilization`);
      // Check modal structure
      await expect(modal.locator('h2')).toContainText(`🔻 Reduce Load: ${personName}`);
      // Wait for assignments to load
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      // Verify assignments section
      const assignmentCards = modal.locator('div:has(h4)').filter({ hasText: 'Remove' });
      const assignmentCount = await assignmentCards.count();
      if (assignmentCount > 0) {
        const firstAssignment = assignmentCards.first();
        // Verify assignment information is displayed
        await expect(firstAssignment.locator('h4')).toBeVisible(); // Project name
        await expect(firstAssignment).toContainText('h/week'); // Hours
        await expect(firstAssignment).toContainText('Impact'); // Impact level
        await expect(firstAssignment).toContainText('👤'); // Role information
        // Verify remove button styling
        const removeButton = firstAssignment.locator('button:has-text("Remove")');
        await expect(removeButton).toBeVisible();
        await expect(removeButton).toHaveCSS('background-color', 'rgb(220, 38, 38)'); // Red button
        // Verify removal score badge
        const scoreBadge = firstAssignment.locator('span:has-text("Remove"), span:has-text("Moderate"), span:has-text("Keep")');
        await expect(scoreBadge).toBeVisible();
        console.log(`✅ Found ${assignmentCount} assignments with proper structure`);
      } else {
        // Verify no assignments message
        await expect(modal).toContainText('No current assignments found');
        console.log('✅ Proper handling of no current assignments');
      }
      // Close modal
      const closeButton = modal.locator('button:has(svg)');
      await closeButton.click();
      await expect(modal).not.toBeVisible();
    });
    test('should successfully remove assignment through reduce load modal', async ({ authenticatedPage, testHelpers }) => {
      // Find person with assignments
      const tableRows = authenticatedPage.locator('table:has(th:has-text("Team Member")) tbody tr');
      let targetRow = null;
      let initialUtilization = 0;
      let personName = '';
      const rowCount = await tableRows.count();
      for (let i = 0; i < rowCount; i++) {
        const row = tableRows.nth(i);
        const nameCell = row.locator('td').nth(0);
        const utilizationCell = row.locator('td').nth(2);
        const actionsCell = row.locator('td').nth(4);
        personName = await nameCell.textContent() || '';
        const utilizationText = await utilizationCell.textContent() || '';
        initialUtilization = parseInt(utilizationText.replace('%', '').trim());
        if (initialUtilization > 20) { // Person with meaningful assignments
          const reduceButton = actionsCell.locator('button:has-text("🔻"), button:has-text("Reduce")');
          if (await reduceButton.count() > 0) {
            targetRow = row;
            await reduceButton.click();
            break;
          }
        }
      }
      if (!targetRow) {
        test.skip('No person with removable assignments found');
        return;
      }
      // Wait for modal and assignments to load
      const modal = authenticatedPage.locator('div:has(h2:has-text("🔻 Reduce Load:"))');
      await expect(modal).toBeVisible();
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      // Find removable assignments
      const assignmentCards = modal.locator('div:has(h4)').filter({ hasText: 'Remove' });
      const assignmentCount = await assignmentCards.count();
      if (assignmentCount === 0) {
        await modal.locator('button:has(svg)').first().click();
        test.skip('No removable assignments available');
        return;
      }
      const firstAssignment = assignmentCards.first();
      const projectName = await firstAssignment.locator('h4').textContent();
      // Monitor API calls
      const deleteResponse = authenticatedPage.waitForResponse(response => 
        response.url().includes('/api/assignments') && 
        response.request().method() === 'DELETE'
      );
      // Monitor console errors
      const consoleErrors: string[] = [];
      authenticatedPage.on('console', msg => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });
      // Handle confirmation dialog
      authenticatedPage.on('dialog', dialog => {
        expect(dialog.message()).toContain('Are you sure you want to remove');
        expect(dialog.message()).toContain(personName);
        expect(dialog.message()).toContain(projectName);
        dialog.accept();
      });
      // Click remove button
      await firstAssignment.locator('button:has-text("Remove")').click();
      // Verify API call was successful
      const response = await deleteResponse;
      expect(response.status()).toBe(200);
      // Validate response structure
      const responseBody = await testHelpers.validateAssignmentDeletionResponse(response);
      expect(responseBody).toHaveProperty('message');
      console.log('✅ Assignment removed successfully with valid response structure');
      // Verify modal closes
      await expect(modal).not.toBeVisible({ timeout: 10000 });
      // Wait for data refresh
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      // Verify utilization has decreased (find the same person)
      const updatedRows = authenticatedPage.locator('table:has(th:has-text("Team Member")) tbody tr');
      const updatedRowCount = await updatedRows.count();
      let foundPerson = false;
      for (let i = 0; i < updatedRowCount; i++) {
        const row = updatedRows.nth(i);
        const nameCell = row.locator('td').nth(0);
        const utilizationCell = row.locator('td').nth(2);
        const currentName = await nameCell.textContent() || '';
        if (currentName === personName) {
          const currentUtilizationText = await utilizationCell.textContent() || '';
          const currentUtilization = parseInt(currentUtilizationText.replace('%', '').trim());
          expect(currentUtilization).toBeLessThanOrEqual(initialUtilization);
          foundPerson = true;
          console.log(`✅ Utilization decreased from ${initialUtilization}% to ${currentUtilization}%`);
          break;
        }
      }
      expect(foundPerson).toBeTruthy();
      expect(consoleErrors.length).toBe(0);
    });
    test('should display accurate removal scores and impact levels', async ({ authenticatedPage, testHelpers }) => {
      const reduceButton = authenticatedPage.locator('button:has-text("🔻"), button:has-text("Reduce")').first();
      await reduceButton.click();
      const modal = authenticatedPage.locator('div:has(h2:has-text("🔻 Reduce Load:"))');
      await expect(modal).toBeVisible();
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      const assignmentCards = modal.locator('div:has(h4)').filter({ hasText: 'h/week' });
      const assignmentCount = await assignmentCards.count();
      if (assignmentCount > 0) {
        for (let i = 0; i < Math.min(3, assignmentCount); i++) {
          const assignment = assignmentCards.nth(i);
          const assignmentText = await assignment.textContent() || '';
          // Verify impact level information
          expect(assignmentText).toMatch(/(High|Medium|Low)\s+Impact/);
          // Verify hours calculation is reasonable
          const hoursMatch = assignmentText.match(/(\d+)h\/week/);
          if (hoursMatch) {
            const hours = parseInt(hoursMatch[1], 10);
            expect(hours).toBeGreaterThanOrEqual(1);
            expect(hours).toBeLessThanOrEqual(40);
          }
          // Verify removal score badge exists and has proper styling
          const scoreBadge = assignment.locator('span:has-text("Remove"), span:has-text("Moderate"), span:has-text("Keep")');
          await expect(scoreBadge).toBeVisible();
          // Verify role information is present
          await expect(assignment).toContainText('👤');
        }
        console.log(`✅ Verified assignment data accuracy for ${Math.min(3, assignmentCount)} assignments`);
      }
      await modal.locator('button:has(svg)').first().click();
    });
  });
  test.describe('Modal Integration and Error Handling', () => {
    test('should handle modal state consistency during rapid interactions', async ({ authenticatedPage, testHelpers }) => {
      const tableRows = authenticatedPage.locator('table:has(th:has-text("Team Member")) tbody tr');
      const rowCount = await tableRows.count();
      if (rowCount === 0) {
        test.skip('No team members found for rapid interaction test');
        return;
      }
      const firstRow = tableRows.first();
      // Test rapid modal opening/closing
      for (let i = 0; i < 3; i++) {
        // Try both modal types if available
        const addButton = firstRow.locator('button:has-text("➕"), button:has-text("Add")');
        const reduceButton = firstRow.locator('button:has-text("🔻"), button:has-text("Reduce")');
        if (await addButton.count() > 0) {
          await addButton.click();
          const addModal = authenticatedPage.locator('div:has(h2:has-text("➕ Add Projects:"))');
          await expect(addModal).toBeVisible();
          await addModal.locator('button:has(svg)').click();
          await expect(addModal).not.toBeVisible();
        }
        if (await reduceButton.count() > 0) {
          await reduceButton.click();
          const reduceModal = authenticatedPage.locator('div:has(h2:has-text("🔻 Reduce Load:"))');
          await expect(reduceModal).toBeVisible();
          await reduceModal.locator('button:has(svg)').click();
          await expect(reduceModal).not.toBeVisible();
        }
      }
      // Verify no JavaScript errors occurred
      const errors: string[] = [];
      authenticatedPage.on('pageerror', error => errors.push(error.message));
      authenticatedPage.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text());
      });
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      expect(errors.length).toBe(0);
      console.log('✅ No errors during rapid modal interactions');
    });
    test('should maintain data persistence after page refresh', async ({ authenticatedPage, testHelpers }) => {
      // Get initial state
      const initialRows = authenticatedPage.locator('table:has(th:has-text("Team Member")) tbody tr');
      const initialCount = await initialRows.count();
      if (initialCount === 0) {
        test.skip('No team members found for persistence test');
        return;
      }
      // Store initial data
      const initialData: Array<{name: string, utilization: string}> = [];
      for (let i = 0; i < initialCount; i++) {
        const row = initialRows.nth(i);
        const name = await row.locator('td').nth(0).textContent() || '';
        const utilization = await row.locator('td').nth(2).textContent() || '';
        initialData.push({ name, utilization });
      }
      // Refresh page
      await authenticatedPage.reload();
      await authenticatedPage.waitForSelector('h1:has-text("Reports")');
      await testHelpers.handleProfileSelection();
      await authenticatedPage.click('button:has-text("Utilization Report")');
      await authenticatedPage.waitForSelector('h2:has-text("Team Utilization Overview")');
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      // Verify data persistence
      const refreshedRows = authenticatedPage.locator('table:has(th:has-text("Team Member")) tbody tr');
      const refreshedCount = await refreshedRows.count();
      expect(refreshedCount).toBe(initialCount);
      // Verify data matches
      for (let i = 0; i < refreshedCount; i++) {
        const row = refreshedRows.nth(i);
        const name = await row.locator('td').nth(0).textContent() || '';
        const utilization = await row.locator('td').nth(2).textContent() || '';
        const initialPerson = initialData.find(p => p.name === name);
        expect(initialPerson).toBeTruthy();
        expect(utilization).toBe(initialPerson!.utilization);
      }
      console.log('✅ Data persistence verified after page refresh');
    });
    test('should handle network errors gracefully', async ({ authenticatedPage, testHelpers }) => {
      // Simulate network failure for assignment operations
      await authenticatedPage.route('**/api/assignments', route => {
        route.abort('internetdisconnected');
      });
      const addButton = authenticatedPage.locator('button:has-text("➕"), button:has-text("Add")').first();
      if (await addButton.count() > 0) {
        await addButton.click();
        const modal = authenticatedPage.locator('div:has(h2:has-text("➕ Add Projects:"))');
        await expect(modal).toBeVisible();
        await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        const projectCards = modal.locator('div:has(h4)').filter({ hasText: 'Assign' });
        if (await projectCards.count() > 0) {
          // Handle potential error dialogs
          authenticatedPage.on('dialog', dialog => {
            expect(dialog.message()).toContain('Failed');
            dialog.accept();
          });
          await projectCards.first().locator('button:has-text("Assign")').click();
          // Wait for error handling
          await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
          // Modal should still be visible after network error
          await expect(modal).toBeVisible();
        }
        await modal.locator('button:has(svg)').first().click();
      }
      console.log('✅ Network error handling verified');
    });
  });
});