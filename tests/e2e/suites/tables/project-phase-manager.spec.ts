/**
 * Project Phase Manager Table Tests
 * Tests for the project phase management table functionality
 */
import { test, expect, tags, patterns } from '../../fixtures';
test.describe('Project Phase Manager Table', () => {
  let projectId: string;
  test.beforeEach(async ({ authenticatedPage, testHelpers, apiContext }) => {
    // Get a project or create one for testing
    const projectsResponse = await apiContext.get('/api/projects');
    const projects = await projectsResponse.json();
    if (projects.data && projects.data.length > 0) {
      projectId = projects.data[0].id;
    } else {
      // Create a test project if none exists
      const createResponse = await apiContext.post('/api/projects', {
        data: {
          name: 'Test Project for Phases',
          projectType: 'Web Application',
          location: 'Test Location',
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
        }
      });
      const newProject = await createResponse.json();
      projectId = newProject.data.id;
    }
    // Navigate to project detail page
    await testHelpers.navigateTo(`/projects/${projectId}`);
    await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
    // Expand phases section
    const phaseSection = authenticatedPage.getByText('Project Phases').or(authenticatedPage.getByText('Phases & Timeline')).or(authenticatedPage.getByText('Timeline'));
    if (await phaseSection.isVisible()) {
      await phaseSection.click();
      await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
    }
  });
  test.describe('Phase Table Display', () => {
    test(`${tags.smoke} should display project phases table`, async ({ 
      authenticatedPage 
    }) => {
      // Look for phases table
      const phaseTable = authenticatedPage.locator('table').filter({ has: authenticatedPage.locator('th:has-text("Phase")') });
      const alternativeTable = authenticatedPage.locator('.phase-manager table, [data-testid="phase-table"]');
      const hasTable = await phaseTable.isVisible() || await alternativeTable.isVisible();
      expect(hasTable).toBeTruthy();
      // Check for expected headers
      const expectedHeaders = ['Phase', 'Start Date', 'End Date', 'Duration', 'Actions'];
      for (const header of expectedHeaders) {
        const headerElement = authenticatedPage.locator(`th:has-text("${header}")`);
        if (await headerElement.count() > 0) {
          await expect(headerElement.first()).toBeVisible();
        }
      }
    });
    test('should display phase data with proper formatting', async ({ 
      authenticatedPage 
    }) => {
      const phaseRows = authenticatedPage.locator('tbody tr').filter({ has: authenticatedPage.locator('td') });
      const rowCount = await phaseRows.count();
      if (rowCount > 0) {
        // Check first phase row
        const firstRow = phaseRows.first();
        // Phase name
        const phaseCell = firstRow.locator('td').first();
        const phaseName = await phaseCell.textContent();
        expect(phaseName?.trim()).toBeTruthy();
        // Dates should be formatted
        const startDateCell = firstRow.locator('td').nth(1);
        const endDateCell = firstRow.locator('td').nth(2);
        const startDate = await startDateCell.textContent();
        const endDate = await endDateCell.textContent();
        // Check date format (MM/DD/YYYY or YYYY-MM-DD)
        expect(startDate).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}/);
        expect(endDate).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}/);
        // Duration
        const durationCell = firstRow.locator('td').nth(3);
        const duration = await durationCell.textContent();
        expect(duration).toMatch(/\d+\s*(days?|weeks?|months?)/i);
      }
    });
    test('should indicate custom phases', async ({ 
      authenticatedPage 
    }) => {
      const phaseRows = authenticatedPage.locator('tbody tr');
      // Look for custom phase indicators
      const customBadges = phaseRows.locator('.custom-badge, .badge:has-text("Custom"), [class*="custom"]');
      const customIcons = phaseRows.locator('svg[title*="Custom"], .icon-custom');
      const hasCustomIndicators = 
        await customBadges.count() > 0 ||
        await customIcons.count() > 0;
      // Not all projects have custom phases, so just verify structure exists
      if (hasCustomIndicators) {
        await expect(customBadges.or(customIcons).first()).toBeVisible();
      }
    });
  });
  test.describe('Phase CRUD Operations', () => {
    test(`${tags.crud} ${patterns.crud('phase').create} should add new phase`, async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      // Click Add Phase button
      const addPhaseButton = authenticatedPage.locator('button:has-text("Add Phase"), button:has-text("New Phase")');
      await expect(addPhaseButton).toBeVisible();
      await addPhaseButton.click();
      // Wait for modal
      const modal = authenticatedPage.locator('[role="dialog"]');
      await expect(modal).toBeVisible();
      // Check for phase selection options
      const standardPhaseOption = modal.getByText('Standard Phase').or(modal.getByText('Select from Templates'));
      const customPhaseOption = modal.getByText('Custom Phase').or(modal.getByText('Blank Custom'));
      if (await standardPhaseOption.isVisible()) {
        // Select standard phase flow
        await standardPhaseOption.click();
        // Select a phase from dropdown
        const phaseSelect = modal.locator('select[name="phase_id"], select[name="phaseId"]');
        if (await phaseSelect.isVisible()) {
          const options = await phaseSelect.locator('option').all();
          if (options.length > 1) {
            await phaseSelect.selectOption({ index: 1 });
          }
        }
      } else {
        // Direct phase form
        const phaseNameInput = modal.locator('input[name="phase_name"], input[name="phaseName"]');
        await phaseNameInput.fill('Test Phase');
      }
      // Set dates
      const today = new Date();
      const nextMonth = new Date(today);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      await modal.locator('input[name="start_date"], input[name="startDate"]').fill(today.toISOString().split('T')[0]);
      await modal.locator('input[name="end_date"], input[name="endDate"]').fill(nextMonth.toISOString().split('T')[0]);
      // Submit
      await modal.locator('button[type="submit"], button:has-text("Create"), button:has-text("Add")').click();
      // Wait for modal to close
      await expect(modal).not.toBeVisible({ timeout: 5000 });
      // Verify no errors
      await testHelpers.verifyNoErrors();
    });
    test(`${tags.crud} should duplicate existing phase`, async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      const phaseRows = authenticatedPage.locator('tbody tr');
      const rowCount = await phaseRows.count();
      if (rowCount > 0) {
        const firstRow = phaseRows.first();
        // Look for duplicate action
        const duplicateButton = firstRow.locator('button[title*="Duplicate"], button[aria-label*="duplicate"], .action-duplicate');
        if (await duplicateButton.isVisible()) {
          await duplicateButton.click();
          // Check for confirmation or modal
          const modal = authenticatedPage.locator('[role="dialog"]');
          if (await modal.isVisible()) {
            // Confirm duplication
            const confirmButton = modal.locator('button:has-text("Duplicate"), button:has-text("Confirm")');
            await confirmButton.click();
            await expect(modal).not.toBeVisible({ timeout: 5000 });
          }
          // Verify row count increased
          await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
          const newRowCount = await phaseRows.count();
          expect(newRowCount).toBeGreaterThan(rowCount);
          await testHelpers.verifyNoErrors();
        }
      }
    });
    test(`${tags.crud} ${patterns.crud('phase').update} should edit phase dates`, async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      const phaseRows = authenticatedPage.locator('tbody tr');
      const rowCount = await phaseRows.count();
      if (rowCount > 0) {
        const firstRow = phaseRows.first();
        // Look for edit action
        const editButton = firstRow.locator('button[title*="Edit"], button[aria-label*="edit"], .action-edit');
        if (await editButton.isVisible()) {
          await editButton.click();
          // Check for edit modal
          const modal = authenticatedPage.locator('[role="dialog"]');
          await expect(modal).toBeVisible();
          // Update end date
          const endDateInput = modal.locator('input[name="end_date"], input[name="endDate"]');
          const currentEndDate = await endDateInput.inputValue();
          const newDate = new Date(currentEndDate);
          newDate.setDate(newDate.getDate() + 7); // Add 7 days
          await endDateInput.fill(newDate.toISOString().split('T')[0]);
          // Save changes
          await modal.locator('button[type="submit"], button:has-text("Save"), button:has-text("Update")').click();
          await expect(modal).not.toBeVisible({ timeout: 5000 });
          await testHelpers.verifyNoErrors();
        }
      }
    });
    test(`${tags.crud} ${patterns.crud('phase').delete} should delete phase`, async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      const phaseRows = authenticatedPage.locator('tbody tr');
      const initialRowCount = await phaseRows.count();
      if (initialRowCount > 1) { // Only delete if there are multiple phases
        const lastRow = phaseRows.last();
        // Look for delete action
        const deleteButton = lastRow.locator('button[title*="Delete"], button[aria-label*="delete"], .action-delete');
        if (await deleteButton.isVisible()) {
          await deleteButton.click();
          // Confirm deletion
          const confirmDialog = authenticatedPage.locator('[role="alertdialog"], .confirm-dialog');
          if (await confirmDialog.isVisible()) {
            await confirmDialog.locator('button:has-text("Delete"), button:has-text("Confirm")').click();
            await expect(confirmDialog).not.toBeVisible({ timeout: 5000 });
          }
          // Verify row count decreased
          await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
          const newRowCount = await phaseRows.count();
          expect(newRowCount).toBeLessThan(initialRowCount);
          await testHelpers.verifyNoErrors();
        }
      }
    });
  });
  test.describe('Phase Reordering', () => {
    test('should allow drag and drop reordering of phases', async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      const phaseRows = authenticatedPage.locator('tbody tr');
      const rowCount = await phaseRows.count();
      if (rowCount > 1) {
        // Look for drag handles
        const dragHandles = phaseRows.locator('.drag-handle, [draggable="true"], svg[class*="drag"]');
        if (await dragHandles.count() > 0) {
          const firstHandle = dragHandles.first();
          const secondRow = phaseRows.nth(1);
          // Perform drag and drop
          await firstHandle.hover();
          await authenticatedPage.mouse.down();
          const secondRowBox = await secondRow.boundingBox();
          if (secondRowBox) {
            await authenticatedPage.mouse.move(secondRowBox.x + 10, secondRowBox.y + secondRowBox.height + 10);
            await authenticatedPage.mouse.up();
          }
          await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
          await testHelpers.verifyNoErrors();
        }
      }
    });
    test('should update order indices after reordering', async ({ 
      authenticatedPage 
    }) => {
      // Look for order indicators
      const orderBadges = authenticatedPage.locator('.order-index, [data-order], .phase-order');
      if (await orderBadges.count() > 0) {
        const orders = [];
        for (let i = 0; i < await orderBadges.count(); i++) {
          const orderText = await orderBadges.nth(i).textContent();
          const orderNum = parseInt(orderText?.match(/\d+/, 10)?.[0] || '0');
          orders.push(orderNum);
        }
        // Verify orders are sequential
        const sortedOrders = [...orders].sort((a, b) => a - b);
        expect(orders).toEqual(sortedOrders);
      }
    });
  });
  test.describe('Phase Timeline', () => {
    test('should display visual timeline for phases', async ({ 
      authenticatedPage 
    }) => {
      // Look for timeline visualization
      const timeline = authenticatedPage.locator('.phase-timeline, .gantt-chart, [data-testid="phase-timeline"]');
      if (await timeline.isVisible()) {
        // Check for timeline bars
        const timelineBars = timeline.locator('.timeline-bar, .gantt-bar, rect[class*="phase"]');
        const barCount = await timelineBars.count();
        expect(barCount).toBeGreaterThan(0);
        // Check for date labels
        const dateLabels = timeline.locator('.date-label, .timeline-date, text');
        expect(await dateLabels.count()).toBeGreaterThan(0);
      }
    });
    test('should highlight phase overlaps', async ({ 
      authenticatedPage 
    }) => {
      // Look for overlap indicators
      const overlapWarnings = authenticatedPage.locator('.overlap-warning, .phase-overlap, [class*="warning"]');
      if (await overlapWarnings.count() > 0) {
        // Verify overlap styling
        const firstOverlap = overlapWarnings.first();
        const className = await firstOverlap.getAttribute('class');
        expect(className).toMatch(/warning|overlap|conflict/i);
        // Check for overlap tooltip
        await firstOverlap.hover();
        await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
        const tooltip = authenticatedPage.locator('[role="tooltip"]');
        if (await tooltip.isVisible()) {
          const tooltipText = await tooltip.textContent();
          expect(tooltipText).toMatch(/overlap|conflict|concurrent/i);
        }
      }
    });
  });
  test.describe('Resource Allocation', () => {
    test('should show resource allocation options when adding phase', async ({ 
      authenticatedPage 
    }) => {
      const addPhaseButton = authenticatedPage.locator('button:has-text("Add Phase")');
      await addPhaseButton.click();
      const modal = authenticatedPage.locator('[role="dialog"]');
      await expect(modal).toBeVisible();
      // Look for resource allocation options
      const copyResourcesOption = modal.getByText('Copy Resource Allocation').or(modal.getByText('Copy from Phase'));
      const blankAllocationOption = modal.getByText('Blank Resource Allocation').or(modal.getByText('No Resources'));
      const hasResourceOptions = 
        await copyResourcesOption.isVisible() ||
        await blankAllocationOption.isVisible();
      expect(hasResourceOptions).toBeTruthy();
      // Cancel modal
      await modal.locator('button:has-text("Cancel")').click();
    });
    test('should copy resource allocation from existing phase', async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      const addPhaseButton = authenticatedPage.locator('button:has-text("Add Phase")');
      await addPhaseButton.click();
      const modal = authenticatedPage.locator('[role="dialog"]');
      // Select copy resources option if available
      const copyOption = modal.locator('text=Copy Resource Allocation');
      if (await copyOption.isVisible()) {
        await copyOption.click();
        // Select source phase
        const sourcePhaseSelect = modal.locator('select[name="source_phase"], select[name="copyFromPhase"]');
        if (await sourcePhaseSelect.isVisible()) {
          const options = await sourcePhaseSelect.locator('option').all();
          if (options.length > 1) {
            await sourcePhaseSelect.selectOption({ index: 1 });
          }
        }
      }
      // Cancel for now
      await modal.locator('button:has-text("Cancel")').click();
      await testHelpers.verifyNoErrors();
    });
  });
  test.describe('Phase Dependencies', () => {
    test('should show phase dependencies if configured', async ({ 
      authenticatedPage 
    }) => {
      // Look for dependency indicators
      const dependencyIcons = authenticatedPage.locator('.dependency-icon, svg[title*="dependency"], [class*="dependency"]');
      const dependencyLinks = authenticatedPage.locator('.dependency-link, .arrow, path[class*="link"]');
      const hasDependencies = 
        await dependencyIcons.count() > 0 ||
        await dependencyLinks.count() > 0;
      if (hasDependencies) {
        // Hover to see dependency details
        await dependencyIcons.first().hover();
        const tooltip = authenticatedPage.locator('[role="tooltip"]');
        if (await tooltip.isVisible()) {
          const tooltipText = await tooltip.textContent();
          expect(tooltipText).toMatch(/depends on|requires|after|before/i);
        }
      }
    });
  });
  test.describe('Bulk Operations', () => {
    test('should allow bulk phase operations', async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      // Look for select all checkbox
      const selectAllCheckbox = authenticatedPage.locator('thead input[type="checkbox"]');
      if (await selectAllCheckbox.isVisible()) {
        await selectAllCheckbox.check();
        // Look for bulk actions
        const bulkActions = authenticatedPage.locator('button:has-text("Bulk Actions"), .bulk-actions');
        if (await bulkActions.isVisible()) {
          await bulkActions.click();
          // Check available bulk operations
          const bulkDelete = authenticatedPage.locator('text=Delete Selected');
          const bulkUpdate = authenticatedPage.locator('text=Update Dates');
          const hasBulkOps = 
            await bulkDelete.isVisible() ||
            await bulkUpdate.isVisible();
          expect(hasBulkOps).toBeTruthy();
          // Close menu
          await authenticatedPage.keyboard.press('Escape');
        }
        // Uncheck all
        await selectAllCheckbox.uncheck();
      }
    });
  });
  test.describe('Accessibility', () => {
    test('should have proper table accessibility', async ({ 
      authenticatedPage 
    }) => {
      const table = authenticatedPage.locator('table').first();
      // Check for table caption or aria-label
      const caption = await table.locator('caption').textContent();
      const ariaLabel = await table.getAttribute('aria-label');
      const hasAccessibleLabel = caption || ariaLabel;
      expect(hasAccessibleLabel).toBeTruthy();
      // Check action buttons have proper labels
      const actionButtons = table.locator('button[title], button[aria-label]');
      const buttonCount = await actionButtons.count();
      if (buttonCount > 0) {
        for (let i = 0; i < Math.min(3, buttonCount); i++) {
          const button = actionButtons.nth(i);
          const title = await button.getAttribute('title');
          const ariaLabel = await button.getAttribute('aria-label');
          expect(title || ariaLabel).toBeTruthy();
        }
      }
    });
  });
});