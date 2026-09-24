import { test, expect } from './fixtures'
/**
 * Comprehensive E2E Tests for Utilization Report Modals
 * 
 * Tests the "Reduce Load" and "Add Projects" modals functionality including:
 * - Modal display and data accuracy
 * - Assignment removal and creation operations
 * - Database state verification
 * - UI refreshing and state consistency
 */
test.describe('Utilization Report Modals', () => {
  test.beforeEach(async ({ authenticatedPage, testHelpers }) => {
    await testHelpers.navigateTo('/reports');
    await testHelpers.setupPage();
    await authenticatedPage.click('button:has-text("Utilization")');
    // Wait for utilization report to load
    await authenticatedPage.waitForSelector('text="Team Utilization Details"', { timeout: 10000 });
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    
    // Scroll down to ensure table is visible
    await authenticatedPage.evaluate(() => {
      const tableElement = document.querySelector('table');
      if (tableElement) {
        tableElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
  });

  // Helper function to find the utilization table
  async function getUtilizationTable(authenticatedPage) {
    // The table with utilization data has headers: Name, Role, Utilization (%), etc.
    const selectors = [
      'table:has(th:has-text("Name")):has(th:has-text("Role")):has(th:has-text("Utilization"))',
      'h3:has-text("Team Utilization Details") + table',
      'h3:has-text("Team Utilization Details") ~ table',
      '.report-table-container:has(h3:has-text("Team Utilization Details")) table',
      'table.report-table'
    ];
    
    for (const selector of selectors) {
      try {
        const table = authenticatedPage.locator(selector).first();
        const count = await table.count();
        if (count > 0 && await table.isVisible()) {
          console.log(`Found utilization table with selector: ${selector}`);
          return table;
        }
      } catch (e) {
        // Continue to next selector
      }
    }
    
    // If no specific table found, look for any table with the right headers
    console.log('Looking for table with utilization data...');
    const allTables = await authenticatedPage.locator('table').all();
    for (const table of allTables) {
      const headers = await table.locator('th').allTextContents();
      if (headers.includes('Name') && headers.includes('Role') && headers.some(h => h.includes('Utilization'))) {
        console.log('Found utilization table by headers:', headers);
        return table;
      }
    }
    
    console.log('No specific utilization table found, using first table');
    return authenticatedPage.locator('table').first();
  }

  // Helper function to find a person with over-utilization (for reduce load tests)
  async function findOverUtilizedPerson(authenticatedPage) {
    const table = await getUtilizationTable(authenticatedPage);
    const rows = await table.locator('tbody tr').all();
    
    for (const row of rows) {
      // Utilization (%) is in the 3rd column (0-indexed: Name, Role, Utilization)
      const utilizationCell = row.locator('td:nth-child(3)');
      const utilizationText = await utilizationCell.textContent();
      const utilization = parseInt((utilizationText || '', 10).replace('%', '') || '0');
      console.log(`Person utilization: ${utilizationText} -> ${utilization}%`);
      
      
      if (utilization > 100) { // Over-utilized
        const actionsCell = row.locator('td:last-child'); // Actions are in the last column
        const reduceButton = actionsCell.locator('button:has-text("Reduce Load")');
        
        if (await reduceButton.isVisible()) {
          return { row, button: reduceButton, utilization };
        }
      }
    }
    return null;
  }

  // Helper function to find a person with under-utilization (for add projects tests)
  async function findUnderUtilizedPerson(authenticatedPage) {
    const table = await getUtilizationTable(authenticatedPage);
    const rows = await table.locator('tbody tr').all();
    
    for (const row of rows) {
      // Utilization (%) is in the 3rd column (0-indexed: Name, Role, Utilization)
      const utilizationCell = row.locator('td:nth-child(3)');
      const utilizationText = await utilizationCell.textContent();
      const utilization = parseInt((utilizationText || '', 10).replace('%', '') || '0');
      console.log(`Person utilization: ${utilizationText} -> ${utilization}%`);
      
      
      if (utilization < 80) { // Under-utilized
        const actionsCell = row.locator('td:last-child'); // Actions are in the last column
        const addButton = actionsCell.locator('button:has-text("Add Projects")');
        
        if (await addButton.isVisible()) {
          return { row, button: addButton, utilization };
        }
      }
    }
    return null;
  }

  test.describe('Utilization Report Basic Tests', () => {
    test('should display utilization table with team members', async ({ authenticatedPage, testHelpers }) => {
      // Debug what's actually on the page
      console.log('=== DEBUGGING PAGE CONTENT ===');
      
      // Check for utilization heading (it's h3, not h2)
      const headingExists = await authenticatedPage.locator('h3:has-text("Team Utilization Details")').isVisible();
      console.log(`Utilization heading visible: ${headingExists}`);
      
      // Count all tables on the page
      const allTables = await authenticatedPage.locator('table').count();
      console.log(`Total tables found: ${allTables}`);
      
      // Get all table headers
      const allHeaders = await authenticatedPage.locator('th').allTextContents();
      console.log(`All table headers found: ${JSON.stringify(allHeaders)}`);
      
      // Check for any utilization-related text
      const utilizationTexts = await authenticatedPage.locator('text=/utilization/i').count();
      console.log(`Elements containing "utilization": ${utilizationTexts}`);
      
      // Take a screenshot for debugging
      await authenticatedPage.screenshot({ path: '/tmp/utilization-page-debug.png' });
      console.log('Screenshot saved to /tmp/utilization-page-debug.png');
      
      // Try to find the table
      const table = await getUtilizationTable(authenticatedPage);
      await expect(table).toBeVisible();
      
      // Verify table has data rows
      const rows = table.locator('tbody tr, tr');
      const rowCount = await rows.count();
      console.log(`Found ${rowCount} rows in utilization table`);
      
      if (rowCount > 0) {
        await expect(rows.first()).toBeVisible();
        
        // Get the actual column headers for this table
        const headers = await table.locator('th').allTextContents();
        console.log(`Table headers: ${JSON.stringify(headers)}`);
        
        // Check if any rows have action buttons
        const buttonsInTable = await table.locator('button').count();
        console.log(`Found ${buttonsInTable} buttons in the table`);
        
        // Look for specific button types
        const reduceButtons = await table.locator('button:has-text("Reduce Load")').count();
        const addButtons = await table.locator('button:has-text("Add Projects")').count();
        console.log(`Found ${reduceButtons} reduce buttons and ${addButtons} add buttons`);
      }
    });

    test('should display modal with current assignments', async ({ authenticatedPage, testHelpers }) => {
      // Find any button in the table that we can click
      const table = await getUtilizationTable(authenticatedPage);
      const allButtons = await table.locator('button').all();
      
      console.log(`Found ${allButtons.length} buttons to test with`);
      
      if (allButtons.length > 0) {
        // Try clicking the first button we find
        const firstButton = allButtons[0];
        const buttonText = await firstButton.textContent();
        console.log(`Clicking button with text: "${buttonText}"`);
        
        await firstButton.click();
        await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        
        // Look for any modal that opens
        const modals = await authenticatedPage.locator('[role="dialog"], .modal, div[style*="position: fixed"]').count();
        console.log(`Found ${modals} modal-like elements after button click`);
        
        if (modals > 0) {
          const modal = authenticatedPage.locator('[role="dialog"], .modal, div[style*="position: fixed"]').first();
          await expect(modal).toBeVisible();
          console.log('Modal opened successfully!');
        }
      } else {
        console.log('No buttons found in utilization table');
      }
    });

    test('should successfully remove assignment and refresh data', async ({ authenticatedPage, testHelpers }) => {
      // Find person with assignments in utilization table
      const utilizationTable = authenticatedPage.locator('table:has(th:has-text("Team Member"))');
      const personRows = await utilizationTable.locator('tbody tr').all();
      let selectedRow = null;
      let initialUtilization = 0;
      
      for (const row of personRows) {
        // Utilization (%) is in the 3rd column (0-indexed: Name, Role, Utilization)
        const utilizationCell = await row.locator('td:nth-child(3)').first();
        const progressBar = await utilizationCell.locator('.report-progress-bar').count();
        let utilization = 0;
        
        if (progressBar > 0) {
          // Extract from progress bar if present
          const progressValue = await utilizationCell.locator('.report-progress-bar').getAttribute('data-value');
          utilization = parseInt(progressValue || '0', 10);
        } else {
          // Otherwise extract from text
          const utilizationText = await utilizationCell.textContent(); // Utilization & Projects column
          utilization = parseInt((utilizationText || '', 10).replace('%', '') || '0');
        }
        
        if (utilization > 0) {
          selectedRow = row;
          initialUtilization = utilization;
          break;
        }
      }

      if (!selectedRow) {
        console.log('No person with assignments found in test data - skipping test');
        test.skip();
        return;
      }
      
      // Open reduce load modal - look for button in Actions column
      const actionsCell = selectedRow.locator('td:nth-child(5)');
      await actionsCell.locator('button:has-text("🔻 Reduce Load")').click();
      
      // Wait for modal and assignments to load
      const modal = authenticatedPage.locator('div:has-text("Reduce Load:")').first();
      await expect(modal).toBeVisible();
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      
      // Get initial assignment count - look for project cards or assignment items
      const assignments = modal.locator('div:has-text("Project:"), .project-card, [class*="assignment"], [class*="project"]');
      const initialAssignmentCount = await assignments.count();
      expect(initialAssignmentCount).toBeGreaterThan(0);
      
      // Get project name before removal for verification
      const firstAssignment = assignments.first();
      const projectName = await firstAssignment.textContent();
      
      // Listen for API calls
      const deleteResponse = authenticatedPage.waitForResponse(response => 
        response.url().includes('/api/assignments') && 
        response.request().method() === 'DELETE'
      );
      
      // Click Remove button and confirm
      authenticatedPage.on('dialog', dialog => dialog.accept()); // Auto-accept confirmation dialog
      await firstAssignment.locator('button:has-text("Remove")').click();
      
      // Verify API call was made successfully and validate response structure
      const response = await deleteResponse;
      const responseBody = await testHelpers.validateAssignmentDeletionResponse(response);
      
      // Wait for modal to close and data to refresh
      await expect(modal).not.toBeVisible({ timeout: 10000 });
      
      // Verify table data was refreshed
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      
      // Check that utilization has decreased (or assignment count reduced)
      const updatedRow = authenticatedPage.locator('.team-utilization-overview tbody tr').first();
      const newUtilizationText = await updatedRow.locator('td:nth-child(6)').textContent();
      const newUtilization = parseInt((newUtilizationText || '', 10).replace('%', '') || '0');
      
      // Utilization should be lower or equal (equal if person has other assignments)
      expect(newUtilization).toBeLessThanOrEqual(initialUtilization);
    });

    test('should display accurate role information for assignments', async ({ authenticatedPage, testHelpers }) => {
      // Find person with assignments and open modal
      const personRows = await authenticatedPage.locator('.team-utilization-overview tbody tr').all();
      let foundPersonWithAssignments = false;
      
      for (const row of personRows) {
        const utilizationText = await row.locator('td:nth-child(6)').textContent();
        const utilization = parseInt((utilizationText || '', 10).replace('%', '') || '0');
        
        if (utilization > 0) {
          await row.locator('button:has-text("Reduce Load")').click();
          foundPersonWithAssignments = true;
          break;
        }
      }
      
      if (!foundPersonWithAssignments) {
        console.log('No person with assignments found in test data - skipping test');
        test.skip();
        return;
      }
      
      const modal = authenticatedPage.locator('div:has-text("Reduce Load:")').first();
      await expect(modal).toBeVisible();
      
      // Verify role information is displayed
      const assignments = modal.locator('.assignment-item, [class*="assignment"]');
      const firstAssignment = assignments.first();
      
      // Check that role emoji and text are present
      await expect(firstAssignment).toContainText('👤');
      
      // Verify the role information is meaningful (not just "Role")
      const roleText = await firstAssignment.textContent();
      expect(roleText).toMatch(/👤\s+\w+/); // Should have role emoji followed by actual role name
    });

    test('should handle empty assignments gracefully', async ({ authenticatedPage, testHelpers }) => {
      // Find a person with 0% utilization
      const personRows = await authenticatedPage.locator('.team-utilization-overview tbody tr').all();
      
      for (const row of personRows) {
        const utilizationText = await row.locator('td:nth-child(6)').textContent();
        const utilization = parseInt((utilizationText || '', 10).replace('%', '') || '0');
        
        if (utilization === 0) {
          await row.locator('button:has-text("Reduce Load")').click();
          
          const modal = authenticatedPage.locator('div:has-text("Reduce Load:")').first();
          await expect(modal).toBeVisible();
          
          // Should show "no assignments" message
          await expect(modal).toContainText('No current assignments');
          
          // Close modal
          await modal.locator('button[aria-label="Close"], button:has-text("×")').click();
          return;
        }
      }
      
      // If no 0% utilization people found, skip this test
      test.skip();
    });
  });

  test.describe('Add Projects Modal', () => {
    test('should display modal with project recommendations', async ({ authenticatedPage, testHelpers }) => {
      // Find a person with less than 100% utilization
      const table = await getUtilizationTable(authenticatedPage);
      const personRows = await table.locator('tbody tr').all();
      let selectedPersonName = '';
      let foundPerson = false;
      
      for (const row of personRows) {
        // Utilization (%) is in the 3rd column (0-indexed: Name, Role, Utilization)
        const utilizationCell = await row.locator('td:nth-child(3)').first();
        const progressBar = await utilizationCell.locator('.report-progress-bar').count();
        let utilization = 0;
        
        if (progressBar > 0) {
          // Extract from progress bar if present
          const progressValue = await utilizationCell.locator('.report-progress-bar').getAttribute('data-value');
          utilization = parseInt(progressValue || '0', 10);
        } else {
          // Otherwise extract from text
          const utilizationText = await utilizationCell.textContent(); // Utilization & Projects column
          utilization = parseInt((utilizationText || '', 10).replace('%', '') || '0');
        }
        
        if (utilization < 100) {
          selectedPersonName = await row.locator('td:nth-child(1)').textContent() || ''; // Team Member column
          const addButton = row.locator('td:nth-child(5) button:has-text("➕"), td:nth-child(5) button:has-text("Add")'); // Actions column
          if (await addButton.count() > 0) {
            await addButton.click();
            foundPerson = true;
            break;
          }
        }
      }
      
      if (!foundPerson) {
        console.log('No person with available capacity found - skipping test');
        test.skip();
        return;
      }

      // Verify modal opened
      const modal = authenticatedPage.locator('div:has-text("Add Projects:")').first();
      await expect(modal).toBeVisible();
      
      // Verify modal title includes person name
      await expect(modal.locator('h2, h3, h4')).toContainText(selectedPersonName);
      
      // Wait for projects to load
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      
      // Verify project recommendations are displayed or "no suitable projects" message
      const projects = modal.locator('[class*="project"], .project-item');
      const noProjectsMessage = modal.locator('text="No suitable projects"');
      
      const hasProjects = await projects.count() > 0;
      const hasNoProjectsMessage = await noProjectsMessage.isVisible();
      
      expect(hasProjects || hasNoProjectsMessage).toBeTruthy();
      
      if (hasProjects) {
        // Verify project details are shown
        const firstProject = projects.first();
        await expect(firstProject.locator('strong, h4')).toBeVisible(); // Project name
        await expect(firstProject).toContainText('h/week'); // Estimated hours
        await expect(firstProject).toContainText('Priority'); // Priority level
        await expect(firstProject).toContainText('👤'); // Role information
        
        // Verify Assign button is present
        await expect(firstProject.locator('button:has-text("Assign")')).toBeVisible();
      }
    });

    test('should successfully create assignment and refresh data', async ({ authenticatedPage, testHelpers }) => {
      // Find person with low utilization
      const personRows = await authenticatedPage.locator('.team-utilization-overview tbody tr').all();
      let selectedRow = null;
      let initialUtilization = 0;
      
      for (const row of personRows) {
        const utilizationText = await row.locator('td:nth-child(6)').textContent();
        const utilization = parseInt((utilizationText || '', 10).replace('%', '') || '0');
        
        if (utilization < 80) { // Find someone with capacity
          selectedRow = row;
          initialUtilization = utilization;
          break;
        }
      }

      if (!selectedRow) {
        console.log('No person with available capacity found - skipping test');
        test.skip();
        return;
      }
      
      // Open add projects modal
      await selectedRow.locator('button:has-text("Add Projects")').click();
      
      const modal = authenticatedPage.locator('div:has-text("Add Projects:")').first();
      await expect(modal).toBeVisible();
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      
      // Check if there are projects available
      const projects = modal.locator('[class*="project"], .project-item');
      const projectCount = await projects.count();
      
      if (projectCount === 0) {
        // If no projects available, check for appropriate message
        await expect(modal).toContainText('No suitable projects');
        await modal.locator('button[aria-label="Close"], button:has-text("×")').click();
        console.log('No projects available for assignment - skipping test');
        test.skip();
        return;
      }
      
      // Get project name before assignment
      const firstProject = projects.first();
      const projectName = await firstProject.locator('strong, h4').textContent();
      
      // Listen for API calls
      const createResponse = authenticatedPage.waitForResponse(response => 
        response.url().includes('/api/assignments') && 
        response.request().method() === 'POST'
      );
      
      // Click Assign button and confirm
      authenticatedPage.on('dialog', dialog => dialog.accept()); // Auto-accept confirmation dialog
      await firstProject.locator('button:has-text("Assign")').click();
      
      // Verify API call was made successfully and validate response structure
      const response = await createResponse;
      const responseBody = await testHelpers.validateAssignmentCreationResponse(response);
      
      // Wait for modal to close and data to refresh
      await expect(modal).not.toBeVisible({ timeout: 10000 });
      
      // Verify table data was refreshed
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      
      // Check that utilization has increased
      const updatedRow = authenticatedPage.locator('.team-utilization-overview tbody tr').first();
      const newUtilizationText = await updatedRow.locator('td:nth-child(6)').textContent();
      const newUtilization = parseInt((newUtilizationText || '', 10).replace('%', '') || '0');
      
      // Utilization should be higher
      expect(newUtilization).toBeGreaterThan(initialUtilization);
    });

    test('should display accurate role and priority information', async ({ authenticatedPage, testHelpers }) => {
      // Find person with available capacity
      const personRows = await authenticatedPage.locator('.team-utilization-overview tbody tr').all();
      
      for (const row of personRows) {
        const utilizationText = await row.locator('td:nth-child(6)').textContent();
        const utilization = parseInt((utilizationText || '', 10).replace('%', '') || '0');
        
        if (utilization < 100) {
          await row.locator('button:has-text("Add Projects")').click();
          break;
        }
      }
      
      const modal = authenticatedPage.locator('div:has-text("Add Projects:")').first();
      await expect(modal).toBeVisible();
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      
      const projects = modal.locator('[class*="project"], .project-item');
      const projectCount = await projects.count();
      
      if (projectCount > 0) {
        const firstProject = projects.first();
        
        // Verify priority information
        const projectText = await firstProject.textContent();
        expect(projectText).toMatch(/(High|Medium|Low)\s+Priority/);
        
        // Verify role information  
        await expect(firstProject).toContainText('👤');
        
        // Verify match score badge
        const matchBadges = firstProject.locator('span:has-text("Match"), span:has-text("Great"), span:has-text("Good"), span:has-text("Fair")');
        await expect(matchBadges.first()).toBeVisible();
      }
    });

    test('should calculate realistic estimated hours', async ({ authenticatedPage, testHelpers }) => {
      // Find person with available capacity
      const personRows = await authenticatedPage.locator('.team-utilization-overview tbody tr').all();
      
      for (const row of personRows) {
        const utilizationText = await row.locator('td:nth-child(6)').textContent();
        const utilization = parseInt((utilizationText || '', 10).replace('%', '') || '0');
        
        if (utilization < 100) {
          await row.locator('button:has-text("Add Projects")').click();
          break;
        }
      }
      
      const modal = authenticatedPage.locator('div:has-text("Add Projects:")').first();
      await expect(modal).toBeVisible();
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      
      const projects = modal.locator('[class*="project"], .project-item');
      const projectCount = await projects.count();
      
      if (projectCount > 0) {
        const firstProject = projects.first();
        const projectText = await firstProject.textContent();
        
        // Extract hours estimate
        const hoursMatch = projectText ? projectText.match(/~(\d+)h\/week/) : null;
        if (hoursMatch) {
          const estimatedHours = parseInt(hoursMatch[1], 10);
          
          // Should be reasonable (between 5-30 hours per week)
          expect(estimatedHours).toBeGreaterThanOrEqual(5);
          expect(estimatedHours).toBeLessThanOrEqual(30);
        }
      }
    });
  });

  test.describe('Modal Integration Tests', () => {
    test('should maintain data consistency between modals and table', async ({ authenticatedPage, testHelpers }) => {
      // Get initial state
      const initialRows = await authenticatedPage.locator('.team-utilization-overview tbody tr').all();
      const initialData = [];
      
      for (const row of initialRows) {
        const name = await row.locator('td:nth-child(2)').textContent();
        const utilization = await row.locator('td:nth-child(6)').textContent();
        initialData.push({ name, utilization });
      }
      
      // Find person with assignments to test remove
      let testPersonRow = null;
      for (const row of initialRows) {
        const utilizationText = await row.locator('td:nth-child(6)').textContent();
        const utilization = parseInt((utilizationText || '', 10).replace('%', '') || '0');
        
        if (utilization > 0 && utilization < 100) {
          testPersonRow = row;
          break;
        }
      }
      
      if (!testPersonRow) {
        console.log('No suitable person found for integration test - skipping test');
        test.skip();
        return;
      }
      
      // Test reduce load workflow
      await testPersonRow.locator('button:has-text("Reduce Load")').click();
      const reduceModal = authenticatedPage.locator('div:has-text("Reduce Load:")').first();
      await expect(reduceModal).toBeVisible();
      
      // Verify modal shows consistent data with table
      const personName = await testPersonRow.locator('td:nth-child(2)').textContent();
      await expect(reduceModal).toContainText(personName || '');
      
      // Close modal
      await reduceModal.locator('button[aria-label="Close"], button:has-text("×")').click();
      await expect(reduceModal).not.toBeVisible();
      
      // Test add projects workflow
      await testPersonRow.locator('button:has-text("Add Projects")').click();
      const addModal = authenticatedPage.locator('div:has-text("Add Projects:")').first();
      await expect(addModal).toBeVisible();
      
      // Verify modal shows consistent person info
      await expect(addModal).toContainText(personName || '');
      
      // Verify utilization percentage is shown in modal
      const modalText = await addModal.textContent();
      expect(modalText).toMatch(/\d+%\s+utilization/);
      
      // Close modal
      await addModal.locator('button[aria-label="Close"], button:has-text("×")').click();
      await expect(addModal).not.toBeVisible();
    });

    test('should handle rapid modal opening/closing without errors', async ({ authenticatedPage, testHelpers }) => {
      const personRows = await authenticatedPage.locator('.team-utilization-overview tbody tr').all();
      
      if (personRows.length === 0) {
        console.log('No people found for rapid interaction test - skipping test');
        test.skip();
        return;
      }
      
      const firstRow = personRows[0];
      
      // Rapidly open and close reduce load modal
      for (let i = 0; i < 3; i++) {
        await firstRow.locator('button:has-text("Reduce Load")').click();
        const modal = authenticatedPage.locator('div:has-text("Reduce Load:")').first();
        await expect(modal).toBeVisible();
        await modal.locator('button[aria-label="Close"], button:has-text("×")').click();
        await expect(modal).not.toBeVisible();
      }
      
      // Rapidly open and close add projects modal
      for (let i = 0; i < 3; i++) {
        await firstRow.locator('button:has-text("Add Projects")').click();
        const modal = authenticatedPage.locator('div:has-text("Add Projects:")').first();
        await expect(modal).toBeVisible();
        await modal.locator('button[aria-label="Close"], button:has-text("×")').click();
        await expect(modal).not.toBeVisible();
      }
      
      // Verify no JavaScript errors occurred
      const errors: string[] = [];
      authenticatedPage.on('pageerror', error => errors.push(error.message));
      authenticatedPage.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text());
      });
      
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      expect(errors.length).toBe(0);
    });

    test('should verify database state after operations', async ({ authenticatedPage, testHelpers }) => {
      // This test verifies that the database operations actually persist
      // by checking API responses and refreshing the page
      
      const personRows = await authenticatedPage.locator('.team-utilization-overview tbody tr').all();
      let testRow = null;
      
      for (const row of personRows) {
        const utilizationText = await row.locator('td:nth-child(6)').textContent();
        const utilization = parseInt((utilizationText || '', 10).replace('%', '') || '0');
        
        if (utilization > 20 && utilization < 80) { // Good candidate for testing
          testRow = row;
          break;
        }
      }
      
      if (!testRow) {
        console.log('No suitable person found for database persistence test - skipping test');
        test.skip();
        return;
      }
      
      // Get initial state
      const initialUtilization = await testRow.locator('td:nth-child(6)').textContent();
      const personName = await testRow.locator('td:nth-child(2)').textContent();
      
      // Perform an operation (try to add a project if available)
      await testRow.locator('button:has-text("Add Projects")').click();
      const modal = authenticatedPage.locator('div:has-text("Add Projects:")').first();
      await expect(modal).toBeVisible();
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      
      const projects = modal.locator('[class*="project"], .project-item');
      const projectCount = await projects.count();
      
      if (projectCount > 0) {
        // Perform assignment
        authenticatedPage.on('dialog', dialog => dialog.accept());
        await projects.first().locator('button:has-text("Assign")').click();
        
        await expect(modal).not.toBeVisible({ timeout: 10000 });
        
        // Refresh the entire page to verify database persistence
        await authenticatedPage.reload();
        await authenticatedPage.waitForSelector('.team-utilization-overview', { timeout: 10000 });
        await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        
        // Find the same person and verify change persisted
        const updatedRows = await authenticatedPage.locator('.team-utilization-overview tbody tr').all();
        let foundPerson = false;
        
        for (const row of updatedRows) {
          const name = await row.locator('td:nth-child(2)').textContent();
          if (name === personName) {
            const newUtilization = await row.locator('td:nth-child(6)').textContent();
            expect(newUtilization).not.toBe(initialUtilization);
            foundPerson = true;
            break;
          }
        }
        
        expect(foundPerson).toBeTruthy();
      } else {
        // If no projects available, just close modal
        await modal.locator('button[aria-label="Close"], button:has-text("×")').click();
        console.log('No projects available for database persistence test - skipping test');
        test.skip();
      }
    });
  });

  test.describe('Error Handling', () => {
    test('should handle API errors gracefully', async ({ authenticatedPage, testHelpers }) => {
      // Intercept API calls to simulate errors
      await authenticatedPage.route('**/api/assignments', route => {
        if (route.request().method() === 'POST') {
          route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Simulated server error' })
          });
        } else {
          route.continue();
        }
      });
      
      // Try to create an assignment
      const personRows = await authenticatedPage.locator('.team-utilization-overview tbody tr').all();
      if (personRows.length > 0) {
        await personRows[0].locator('button:has-text("Add Projects")').click();
        
        const modal = authenticatedPage.locator('div:has-text("Add Projects:")').first();
        await expect(modal).toBeVisible();
        await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        
        const projects = modal.locator('[class*="project"], .project-item');
        if (await projects.count() > 0) {
          authenticatedPage.on('dialog', dialog => dialog.accept());
          await projects.first().locator('button:has-text("Assign")').click();
          
          // Should show error message
          await expect(authenticatedPage.locator('text="Failed to create assignment"')).toBeVisible({ timeout: 5000 });
        }
      }
    });

    test('should handle network timeouts appropriately', async ({ authenticatedPage, testHelpers }) => {
      // Simulate slow network
      await authenticatedPage.route('**/api/assignments', route => {
        setTimeout(() => route.continue(), 10000); // 10 second delay
      });
      
      const personRows = await authenticatedPage.locator('.team-utilization-overview tbody tr').all();
      if (personRows.length > 0) {
        await personRows[0].locator('button:has-text("Add Projects")').click();
        
        // Modal should still open despite slow assignment loading
        const modal = authenticatedPage.locator('div:has-text("Add Projects:")').first();
        await expect(modal).toBeVisible();
        
        // Should show loading or handle gracefully
        await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        await modal.locator('button[aria-label="Close"], button:has-text("×")').click();
      }
    });
  });
});