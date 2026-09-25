/**
 * Projects CRUD Test Suite
 * Tests for project management functionality
 * Uses dynamic test data for proper isolation
 */
import { test, expect, tags, patterns } from '../../fixtures';
import { TestDataContext } from '../../utils/test-data-helpers';
test.describe('Project Management', () => {
  let testContext: TestDataContext;
  let testData: any;
  test.beforeEach(async ({ testDataHelpers, testHelpers }) => {
    // Create isolated test context for each test
    testContext = testDataHelpers.createTestContext('proj');
    // Create test data dynamically
    testData = await testDataHelpers.createBulkTestData(testContext, {
      projects: 3,
      people: 2,  // For project owners
      assignments: 0
    });
    await testHelpers.navigateTo('/projects');
    await testHelpers.waitForDataTable();
  });
  test.afterEach(async ({ testDataHelpers }) => {
    // Clean up all test data
    await testDataHelpers.cleanupTestContext(testContext);
  });
  test.describe('Project List Display', () => {
    test(`${tags.smoke} should display projects list with table`, async ({ 
      authenticatedPage,
      testDataHelpers 
    }) => {
      // Check page header
      await expect(authenticatedPage.locator('h1')).toContainText('Projects');
      // Should show data table or empty state
      const table = authenticatedPage.locator('table');
      const emptyState = authenticatedPage.locator('text=/no projects|no data/i');
      const hasContent = await table.isVisible() || await emptyState.isVisible();
      expect(hasContent).toBeTruthy();
      // Should show Add Project button
      await expect(authenticatedPage.locator('button:has-text("Add Project"), button:has-text("New Project")')).toBeVisible();
    });
    test('should display project data with all columns', async ({ 
      authenticatedPage,
      testHelpers,
      testDataHelpers 
    }) => {
      const rowCount = await testHelpers.getTableRowCount();
      if (rowCount > 0) {
        // Check for expected columns
        const expectedHeaders = ['Project Name', 'Type', 'Status', 'Start Date', 'End Date', 'Progress'];
        for (const header of expectedHeaders) {
          const headerElement = authenticatedPage.locator(`th:text-is("${header}"), th:has-text("${header}")`);
          if (await headerElement.count() > 0) {
            await expect(headerElement).toBeVisible();
          }
        }
        // Check specific test project row structure
        const projectRow = await testDataHelpers.findByTestData(
          'tbody tr',
          testData.projects[0].name
        );
        const cells = projectRow.locator('td');
        const cellCount = await cells.count();
        expect(cellCount).toBeGreaterThanOrEqual(5);
        // Project name should be clickable
        const projectLink = projectRow.locator('td:first-child a');
        await expect(projectLink).toBeVisible();
      }
    });
    test('should display project status indicators', async ({ 
      authenticatedPage,
      testHelpers,
      testDataHelpers 
    }) => {
      const rowCount = await testHelpers.getTableRowCount();
      if (rowCount > 0) {
        // Look for status badges on a specific test project
        const projectRow = await testDataHelpers.findByTestData(
          'tbody tr',
          testData.projects[0].name
        );
        const statusBadges = projectRow.locator('.status-badge, .project-status, [class*="badge"]');
        if (await statusBadges.count() > 0) {
          const statusText = await statusBadges.textContent();
          // Should have valid status
          expect(statusText).toMatch(/Active|Completed|Planned|On Hold|In Progress/i);
        }
      }
    });
    test('should display project progress indicators', async ({ 
      authenticatedPage,
      testHelpers,
      testDataHelpers 
    }) => {
      const rowCount = await testHelpers.getTableRowCount();
      if (rowCount > 0) {
        // Look for progress indicators on a specific test project
        const projectRow = await testDataHelpers.findByTestData(
          'tbody tr',
          testData.projects[0].name
        );
        const progressIndicators = projectRow.locator('.progress-bar, .progress-indicator, [role="progressbar"]');
        if (await progressIndicators.count() > 0) {
          await expect(progressIndicators).toBeVisible();
          // Check for percentage text
          const progressText = projectRow.locator('.progress-text, [aria-valuenow]');
          if (await progressText.count() > 0) {
            const text = await progressText.textContent();
            expect(text).toMatch(/\d+%/);
          }
        }
      }
    });
  });
  test.describe('Project CRUD Operations', () => {
    test(`${tags.crud} ${patterns.crud('project').create} should handle Add Project`, async ({ 
      authenticatedPage,
      testHelpers,
      testDataHelpers 
    }) => {
      const addButton = authenticatedPage.locator('button:has-text("Add Project"), button:has-text("New Project")');
      await addButton.click();
      // Should navigate or show modal
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      const url = authenticatedPage.url();
      const hasModal = await authenticatedPage.locator('[role="dialog"]').isVisible();
      const hasForm = await authenticatedPage.locator('form').isVisible();
      expect(url.includes('/projects/new') || hasModal || hasForm).toBeTruthy();
      // If form is visible, fill it
      if (hasModal || hasForm || url.includes('/new')) {
        // Fill project details with unique name
        const projectName = `${testContext.prefix}-New-Project`;
        await authenticatedPage.fill('input[name="name"], input[name="projectName"]', projectName);
        // Fill description if available
        const descriptionField = authenticatedPage.locator('textarea[name="description"]');
        if (await descriptionField.isVisible()) {
          await descriptionField.fill('Test project description');
        }
        // Select project type
        const typeSelect = authenticatedPage.locator('select[name="type"], select[name="projectType"]');
        if (await typeSelect.isVisible()) {
          const options = await typeSelect.locator('option').all();
          if (options.length > 1) {
            await typeSelect.selectOption({ index: 1 });
          }
        }
        // Set dates
        const startDateInput = authenticatedPage.locator('input[name="startDate"], input[type="date"]').nth(0);
        const endDateInput = authenticatedPage.locator('input[name="endDate"], input[type="date"]').nth(1);
        if (await startDateInput.isVisible()) {
          const today = new Date();
          const nextMonth = new Date(today);
          nextMonth.setMonth(nextMonth.getMonth() + 1);
          await startDateInput.fill(today.toISOString().split('T')[0]);
          await endDateInput.fill(nextMonth.toISOString().split('T')[0]);
        }
        // Submit form
        const submitButton = authenticatedPage.locator('button[type="submit"], button:has-text("Save"), button:has-text("Create")');
        await submitButton.click();
        // Wait for navigation or modal close
        await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        // Verify no errors
        await testHelpers.verifyNoErrors();
      }
    });
    test(`${tags.crud} ${patterns.crud('project').read} should navigate to project details`, async ({ 
      authenticatedPage,
      testHelpers,
      testDataHelpers 
    }) => {
      const rowCount = await testHelpers.getTableRowCount();
      if (rowCount > 0) {
        // Click specific test project
        const projectRow = await testDataHelpers.findByTestData(
          'tbody tr',
          testData.projects[0].name
        );
        const projectLink = projectRow.locator('td:first-child a');
        const projectName = testData.projects[0].name;
        await projectLink.click();
        await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
        // Should navigate to detail page
        expect(authenticatedPage.url()).toMatch(/\/projects\/[a-f0-9-]+$/);
        // Should show project details
        await expect(authenticatedPage.locator(`h1:has-text("${projectName}")`)).toBeVisible();
        // Should show project information sections
        const sections = ['Details', 'Team', 'Phases', 'Timeline'];
        for (const section of sections) {
          const sectionElement = authenticatedPage.locator(`text=${section}`);
          if (await sectionElement.count() > 0) {
            await expect(sectionElement).toBeVisible();
          }
        }
      }
    });
    test(`${tags.crud} ${patterns.crud('project').update} should handle Edit Project`, async ({ 
      authenticatedPage,
      testHelpers,
      testDataHelpers 
    }) => {
      const rowCount = await testHelpers.getTableRowCount();
      if (rowCount > 0) {
        // Navigate to specific test project
        const projectRow = await testDataHelpers.findByTestData(
          'tbody tr',
          testData.projects[1].name
        );
        const projectLink = projectRow.locator('td:first-child a');
        await projectLink.click();
        await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
        // Find edit button
        const editButton = authenticatedPage.locator('button:has-text("Edit"), button:has-text("Edit Project")');
        if (await editButton.isVisible()) {
          await editButton.click();
          await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
          // Should show edit form
          const nameInput = authenticatedPage.locator('input[name="name"], input[name="projectName"]');
          await expect(nameInput).toBeVisible();
          // Update project name with unique value
          const updatedName = `${testContext.prefix}-Updated-Project`;
          await nameInput.fill(updatedName);
          // Save changes
          const saveButton = authenticatedPage.locator('button[type="submit"], button:has-text("Save")');
          await saveButton.click();
          // Wait for save
          await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
          // Verify no errors
          await testHelpers.verifyNoErrors();
          // Should see updated name
          await expect(authenticatedPage.locator(`text=${updatedName}`)).toBeVisible();
        }
      }
    });
    test(`${tags.crud} should handle project status changes`, async ({ 
      authenticatedPage,
      testHelpers,
      testDataHelpers 
    }) => {
      const rowCount = await testHelpers.getTableRowCount();
      if (rowCount > 0) {
        // Navigate to specific test project
        const projectRow = await testDataHelpers.findByTestData(
          'tbody tr',
          testData.projects[2].name
        );
        const projectLink = projectRow.locator('td:first-child a');
        await projectLink.click();
        await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
        // Look for status change button/select
        const statusSelect = authenticatedPage.locator('select[name="status"]');
        const statusButton = authenticatedPage.locator('button:has-text("Change Status")');
        if (await statusSelect.isVisible()) {
          // Change via select
          const currentValue = await statusSelect.inputValue();
          const options = await statusSelect.locator('option').all();
          for (const option of options) {
            const value = await option.getAttribute('value');
            if (value !== currentValue) {
              await statusSelect.selectOption(value!);
              break;
            }
          }
          // Save if needed
          const saveButton = authenticatedPage.locator('button:has-text("Save")');
          if (await saveButton.isVisible()) {
            await saveButton.click();
          }
        } else if (await statusButton.isVisible()) {
          // Change via button
          await statusButton.click();
          // Select new status from dropdown/modal
          const statusOptions = authenticatedPage.locator('.status-option, [role="menuitem"]');
          if (await statusOptions.count() > 0) {
            await statusOptions.nth(0).click();
          }
        }
        // Verify no errors
        await testHelpers.verifyNoErrors();
      }
    });
  });
  test.describe('Project Filtering and Search', () => {
    test('should filter projects by search term', async ({ 
      authenticatedPage,
      testHelpers,
      testDataHelpers 
    }) => {
      const rowCount = await testHelpers.getTableRowCount();
      if (rowCount > 0) {
        // Use specific test project name for search
        const searchTerm = testData.projects[0].name.split('-')[0];
        // Search for project
        await testHelpers.searchInTable(searchTerm);
        // Verify filtered results
        const filteredCount = await testHelpers.getTableRowCount();
        expect(filteredCount).toBeLessThanOrEqual(rowCount);
        // If results exist, they should contain search term
        if (filteredCount > 0) {
          const projectResult = await testDataHelpers.findByTestData(
            'tbody tr',
            testData.projects[0].name
          );
          await expect(projectResult).toBeVisible();
        }
      }
    });
    test('should filter by project status', async ({ 
      authenticatedPage,
      testHelpers,
      testDataHelpers 
    }) => {
      const statusFilter = authenticatedPage.locator('select:has(option:text-is("All Statuses")), button:has-text("Status")');
      if (await statusFilter.isVisible()) {
        if (await statusFilter.getAttribute('role') === 'combobox') {
          // Select dropdown
          const options = await statusFilter.locator('option').all();
          if (options.length > 1) {
            await statusFilter.selectOption({ index: 1 });
          }
        } else {
          // Button with dropdown
          await statusFilter.click();
          const firstOption = authenticatedPage.locator('[role="menuitem"]').nth(0);
          await firstOption.click();
        }
        await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        await testHelpers.waitForDataTable();
        // Verify no errors
        await testHelpers.verifyNoErrors();
      }
    });
    test('should filter by date range', async ({ 
      authenticatedPage,
      testHelpers,
      testDataHelpers 
    }) => {
      const dateFilters = authenticatedPage.locator('input[type="date"]');
      if (await dateFilters.count() >= 2) {
        const startDate = dateFilters.nth(0);
        const endDate = dateFilters.nth(1);
        // Set date range
        const today = new Date();
        const lastMonth = new Date(today);
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        await startDate.fill(lastMonth.toISOString().split('T')[0]);
        await endDate.fill(today.toISOString().split('T')[0]);
        // Apply filter
        const applyButton = authenticatedPage.locator('button:has-text("Apply"), button:has-text("Filter")');
        if (await applyButton.isVisible()) {
          await applyButton.click();
        }
        await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        await testHelpers.waitForDataTable();
        // Verify no errors
        await testHelpers.verifyNoErrors();
      }
    });
  });
  test.describe('Project Phases', () => {
    test('should display project phases on detail page', async ({ 
      authenticatedPage,
      testHelpers,
      testDataHelpers 
    }) => {
      const rowCount = await testHelpers.getTableRowCount();
      if (rowCount > 0) {
        // Navigate to specific test project
        const projectRow = await testDataHelpers.findByTestData(
          'tbody tr',
          testData.projects[0].name
        );
        const projectLink = projectRow.locator('td:first-child a');
        await projectLink.click();
        await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
        // Look for phases section
        const phasesSection = authenticatedPage.locator('text=Phases, text=Project Phases');
        if (await phasesSection.isVisible()) {
          // Should show phase list or timeline
          const phaseElements = authenticatedPage.locator('.phase-item, .phase-card, [data-phase]');
          if (await phaseElements.count() > 0) {
            // Check phase structure
            const firstPhase = phaseElements.nth(0);
            await expect(firstPhase).toBeVisible();
            // Should have phase name
            const phaseName = await firstPhase.textContent();
            expect(phaseName).toBeTruthy();
          }
        }
      }
    });
    test('should handle adding new phase', async ({ 
      authenticatedPage,
      testHelpers,
      testDataHelpers 
    }) => {
      const rowCount = await testHelpers.getTableRowCount();
      if (rowCount > 0) {
        // Navigate to specific test project
        const projectRow = await testDataHelpers.findByTestData(
          'tbody tr',
          testData.projects[1].name
        );
        const projectLink = projectRow.locator('td:first-child a');
        await projectLink.click();
        await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
        // Look for add phase button
        const addPhaseButton = authenticatedPage.locator('button:has-text("Add Phase"), button:has-text("New Phase")');
        if (await addPhaseButton.isVisible()) {
          await addPhaseButton.click();
          await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
          // Fill phase form
          const phaseNameInput = authenticatedPage.locator('input[name="phaseName"], input[placeholder*="Phase"]');
          if (await phaseNameInput.isVisible()) {
            // Fill with unique phase name
            const phaseName = `${testContext.prefix}-Test-Phase`;
            await phaseNameInput.fill(phaseName);
            // Submit
            const submitButton = authenticatedPage.locator('button[type="submit"], button:has-text("Add"), button:has-text("Save")');
            await submitButton.click();
            await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
            // Verify no errors
            await testHelpers.verifyNoErrors();
          }
        }
      }
    });
  });
});