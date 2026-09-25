/**
 * People Availability Table Tests
 * Tests for the availability column and related functionality in the People table
 */
import { test, expect, tags, patterns } from '../../fixtures';
test.describe('People Availability Table', () => {
  test.beforeEach(async ({ authenticatedPage, testHelpers }) => {
    await testHelpers.navigateTo('/people');
    await testHelpers.waitForDataTable();
  });
  test.describe('Availability Column Display', () => {
    test(`${tags.smoke} should display availability column with proper data`, async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      // Check that AVAILABILITY header is present
      await expect(authenticatedPage.locator('th:has-text("AVAILABILITY")')).toBeVisible();
      const rowCount = await testHelpers.getTableRowCount();
      if (rowCount > 0) {
        // Check availability data in first few rows
        const rows = authenticatedPage.locator('tbody tr');
        for (let i = 0; i < Math.min(3, rowCount); i++) {
          const row = rows.nth(i);
          const availabilityCell = row.locator('td').nth(4); // AVAILABILITY is the 5th column
          // Availability should be visible
          await expect(availabilityCell).toBeVisible();
          // Check content format (percentage or status)
          const text = await availabilityCell.textContent();
          expect(text).toBeTruthy();
          // Should match common patterns
          expect(text).toMatch(/\d+%|Available|Partial|Unavailable|Full-time|Part-time/i);
        }
      }
    });
    test('should display availability with visual indicators', async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      const rowCount = await testHelpers.getTableRowCount();
      if (rowCount > 0) {
        // Look for availability indicators
        const availabilityIndicators = authenticatedPage.locator('tbody tr td:nth-child(5)').first();
        // Check for visual elements
        const badge = availabilityIndicators.locator('.badge, .chip, .tag, [class*="availability"]');
        const progressBar = availabilityIndicators.locator('.progress, [role="progressbar"]');
        const icon = availabilityIndicators.locator('svg, .icon, i');
        // At least one type of indicator should exist
        const hasIndicator = 
          await badge.count() > 0 ||
          await progressBar.count() > 0 ||
          await icon.count() > 0;
        expect(hasIndicator).toBeTruthy();
      }
    });
    test('should show color-coded availability status', async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      const rowCount = await testHelpers.getTableRowCount();
      if (rowCount > 0) {
        const availabilityCells = authenticatedPage.locator('tbody tr td:nth-child(5)');
        // Check for color classes
        const greenStatus = availabilityCells.locator('[class*="green"], [class*="success"], [class*="available"]');
        const yellowStatus = availabilityCells.locator('[class*="yellow"], [class*="warning"], [class*="partial"]');
        const redStatus = availabilityCells.locator('[class*="red"], [class*="danger"], [class*="unavailable"]');
        // At least one color status should exist
        const hasColorCoding = 
          await greenStatus.count() > 0 ||
          await yellowStatus.count() > 0 ||
          await redStatus.count() > 0;
        expect(hasColorCoding).toBeTruthy();
      }
    });
  });
  test.describe('Availability Interactions', () => {
    test('should allow editing availability inline', async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      const rowCount = await testHelpers.getTableRowCount();
      if (rowCount > 0) {
        const firstRow = authenticatedPage.locator('tbody tr').first();
        const availabilityCell = firstRow.locator('td:nth-child(5)');
        // Try clicking on availability cell
        await availabilityCell.click();
        await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
        // Check if edit mode is activated
        const input = availabilityCell.locator('input, select');
        const editButton = availabilityCell.locator('button:has-text("Edit"), svg[class*="edit"]');
        if (await input.isVisible()) {
          // Inline edit is available
          const currentValue = await input.inputValue();
          // Try changing value
          if (await input.getAttribute('type') === 'number') {
            await input.fill('80');
          } else if (await input.evaluate(el => el.tagName) === 'SELECT') {
            const options = await input.locator('option').all();
            if (options.length > 1) {
              await input.selectOption({ index: 1 });
            }
          }
          // Save changes (Enter or blur)
          await input.press('Enter');
          await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
          // Verify no errors
          await testHelpers.verifyNoErrors();
        } else if (await editButton.isVisible()) {
          // Edit button workflow
          await editButton.click();
          // Check for edit modal or form
          const modal = authenticatedPage.locator('[role="dialog"]');
          if (await modal.isVisible()) {
            // Cancel for now
            await authenticatedPage.locator('button:has-text("Cancel")').click();
          }
        }
      }
    });
    test('should handle availability filtering', async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      // Look for availability filter
      const availabilityFilter = authenticatedPage.locator(
        'select[name*="availability"], button:has-text("Availability"), [aria-label*="availability"]'
      );
      if (await availabilityFilter.isVisible()) {
        const initialRowCount = await testHelpers.getTableRowCount();
        if (await availabilityFilter.evaluate(el => el.tagName) === 'SELECT') {
          // Select dropdown
          const options = await availabilityFilter.locator('option').all();
          if (options.length > 1) {
            await availabilityFilter.selectOption({ index: 1 });
          }
        } else {
          // Button dropdown
          await availabilityFilter.click();
          const firstOption = authenticatedPage.locator('[role="menuitem"]').first();
          await firstOption.click();
        }
        await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        await testHelpers.waitForDataTable();
        const filteredRowCount = await testHelpers.getTableRowCount();
        expect(filteredRowCount).toBeLessThanOrEqual(initialRowCount);
        // Verify no errors
        await testHelpers.verifyNoErrors();
      }
    });
    test('should sort by availability', async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      const availabilityHeader = authenticatedPage.locator('th:has-text("AVAILABILITY")');
      // Click to sort
      await availabilityHeader.click();
      await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
      // Check for sort indicator
      const sortIcon = availabilityHeader.locator('svg, .sort-icon, [aria-label*="sort"]');
      if (await sortIcon.count() > 0) {
        await expect(sortIcon.first()).toBeVisible();
      }
      // Click again for reverse sort
      await availabilityHeader.click();
      await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
      // Verify no errors
      await testHelpers.verifyNoErrors();
    });
  });
  test.describe('Hours/Day Column', () => {
    test('should display hours per day data', async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      // Check that HOURS/DAY header is present
      await expect(authenticatedPage.locator('th:has-text("HOURS/DAY")')).toBeVisible();
      const rowCount = await testHelpers.getTableRowCount();
      if (rowCount > 0) {
        const firstRow = authenticatedPage.locator('tbody tr').first();
        const hoursCell = firstRow.locator('td:nth-child(6)'); // HOURS/DAY is the 6th column
        const hoursText = await hoursCell.textContent();
        expect(hoursText).toBeTruthy();
        // Should be a number between 0-24
        const hoursMatch = hoursText?.match(/(\d+\.?\d*)/);
        if (hoursMatch) {
          const hours = parseFloat(hoursMatch[1]);
          expect(hours).toBeGreaterThanOrEqual(0);
          expect(hours).toBeLessThanOrEqual(24);
        }
      }
    });
    test('should correlate hours with availability', async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      const rowCount = await testHelpers.getTableRowCount();
      if (rowCount > 0) {
        const firstRow = authenticatedPage.locator('tbody tr').first();
        const availabilityCell = firstRow.locator('td:nth-child(5)');
        const hoursCell = firstRow.locator('td:nth-child(6)');
        const availabilityText = await availabilityCell.textContent();
        const hoursText = await hoursCell.textContent();
        // If availability is 0% or "Unavailable", hours should be 0
        if (availabilityText?.includes('0%') || availabilityText?.includes('Unavailable')) {
          expect(hoursText).toMatch(/0/);
        }
        // If availability is 100% or "Full-time", hours should be 8 (standard)
        if (availabilityText?.includes('100%') || availabilityText?.includes('Full-time')) {
          expect(hoursText).toMatch(/8/);
        }
      }
    });
  });
  test.describe('Availability Tooltips and Details', () => {
    test('should show availability details on hover', async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      const rowCount = await testHelpers.getTableRowCount();
      if (rowCount > 0) {
        const availabilityCell = authenticatedPage.locator('tbody tr').first().locator('td:nth-child(5)');
        // Hover over availability
        await availabilityCell.hover();
        await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
        // Check for tooltip
        const tooltip = authenticatedPage.locator('[role="tooltip"], .tooltip, .popover');
        if (await tooltip.isVisible()) {
          const tooltipText = await tooltip.textContent();
          expect(tooltipText).toBeTruthy();
          // Tooltip might show details like:
          // - Time period
          // - Specific days
          // - Vacation/leave info
          expect(tooltipText).toMatch(/hours|days|week|available|unavailable/i);
        }
      }
    });
    test('should navigate to detailed availability view', async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      const rowCount = await testHelpers.getTableRowCount();
      if (rowCount > 0) {
        // Click on person name to go to detail page
        const personLink = authenticatedPage.locator('tbody tr').first().locator('td:first-child a');
        const personName = await personLink.textContent();
        await personLink.click();
        await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
        // Should be on person detail page
        expect(authenticatedPage.url()).toMatch(/\/people\/[a-f0-9-]+$/);
        // Look for availability section
        const availabilitySection = authenticatedPage.getByText('Availability').or(authenticatedPage.getByText('Schedule')).or(authenticatedPage.getByText('Working Hours'));
        if (await availabilitySection.isVisible()) {
          // Should show detailed availability info
          const calendar = authenticatedPage.locator('.calendar, [role="grid"]');
          const timeline = authenticatedPage.locator('.timeline, .schedule');
          const timeBlocks = authenticatedPage.locator('.time-block, .availability-block');
          const hasDetailedView = 
            await calendar.isVisible() ||
            await timeline.isVisible() ||
            await timeBlocks.count() > 0;
          expect(hasDetailedView).toBeTruthy();
        }
      }
    });
  });
  test.describe('Bulk Availability Operations', () => {
    test('should allow bulk availability updates', async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      const rowCount = await testHelpers.getTableRowCount();
      if (rowCount > 1) {
        // Look for checkboxes
        const checkboxes = authenticatedPage.locator('tbody tr input[type="checkbox"]');
        if (await checkboxes.count() > 0) {
          // Select first two rows
          await checkboxes.nth(0).check();
          await checkboxes.nth(1).check();
          // Look for bulk actions
          const bulkActions = authenticatedPage.locator(
            'button:has-text("Bulk Actions"), button:has-text("Update Selected")'
          );
          if (await bulkActions.isVisible()) {
            await bulkActions.click();
            // Look for availability update option
            const updateAvailability = authenticatedPage.getByText('Update Availability').or(authenticatedPage.getByText('Set Availability'));
            if (await updateAvailability.isVisible()) {
              await updateAvailability.click();
              // Should show bulk update form
              const bulkForm = authenticatedPage.locator('[role="dialog"], .bulk-update-form');
              await expect(bulkForm).toBeVisible();
              // Cancel for now
              await authenticatedPage.locator('button:has-text("Cancel")').click();
            }
          }
        }
      }
    });
  });
  test.describe('Accessibility', () => {
    test('should have proper ARIA labels for availability data', async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      const rowCount = await testHelpers.getTableRowCount();
      if (rowCount > 0) {
        const availabilityCell = authenticatedPage.locator('tbody tr').first().locator('td:nth-child(5)');
        // Check for aria-label or title
        const ariaLabel = await availabilityCell.getAttribute('aria-label');
        const title = await availabilityCell.getAttribute('title');
        const hasAccessibleLabel = ariaLabel || title;
        expect(hasAccessibleLabel).toBeTruthy();
      }
    });
    test('should announce availability changes to screen readers', async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      // Look for live regions
      const liveRegion = authenticatedPage.locator('[aria-live="polite"], [aria-live="assertive"]');
      if (await liveRegion.count() > 0) {
        // Perform an action that changes availability
        const rowCount = await testHelpers.getTableRowCount();
        if (rowCount > 0) {
          const availabilityCell = authenticatedPage.locator('tbody tr').first().locator('td:nth-child(5)');
          await availabilityCell.click();
          // Check if live region updated
          await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
          const liveText = await liveRegion.textContent();
          if (liveText) {
            expect(liveText).toMatch(/availability|updated|changed/i);
          }
        }
      }
    });
  });
});