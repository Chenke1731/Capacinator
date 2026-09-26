/**
 * ARCHIVED 2026-09-26 (L4 harvest slice 3): speculative-era zombie suite.
 * After the test-data-helpers systemic fix cured its setup, the failing
 * bodies were verified against the client: tooltips, drag-and-drop, panel
 * resize, keyboard shortcuts, skeleton loaders — 0 references anywhere in
 * client/src (features never built or since removed). The real coverage
 * this suite nominally provided (scenario dropdown, view modes) lives in
 * scenario-ui-comprehensive / ui-scenario-interactions / red line core 6.
 * 16 tests archived, scenario ledger 214 → 168.
 *
 * Scenario UI Interactions Tests
 * Tests for dropdowns, visibility controls, view modes, and UI components
 * Uses dynamic test data for proper isolation
 */
import { test, expect, tags } from '../../fixtures';
import { TestDataContext } from '../../utils/test-data-helpers';
test.describe('Scenario UI Interactions', () => {
  let testContext: TestDataContext;
  let testScenarios: any[];
  test.beforeEach(async ({ testDataHelpers, testHelpers }) => {
    // Create isolated test context
    testContext = testDataHelpers.createTestContext('scnui');
    testScenarios = [];
    // Create test scenarios with different states for UI testing.
    // Via the shared helper (2026-09-26 systemic fix): correct field names,
    // required created_by, envelope unwrapping — the legacy inline creates
    // silently failed (400) and crashed downstream on scenario.id.
    const scenarioConfigs = [
      { name: 'Active Scenario', type: 'branch', status: 'active' as const },
      { name: 'Draft Scenario', type: 'sandbox', status: 'draft' as const },
      { name: 'Archived Scenario', type: 'forecast', status: 'archived' as const }
    ];
    for (const config of scenarioConfigs) {
      testScenarios.push(await testDataHelpers.createTestScenario(testContext, {
        name: `${testContext.prefix}-${config.name}`,
        description: `${config.name} for UI testing`,
        type: config.type,
        status: config.status
      }));
    }
    await testHelpers.navigateTo('/scenarios');
    await testHelpers.waitForPageLoad();
  });
  test.afterEach(async ({ testDataHelpers }) => {
    // Clean up all test data
    await testDataHelpers.cleanupTestContext(testContext);
  });
  test.describe('Dropdown Controls', () => {
    test(`${tags.ui} should display and interact with scenario dropdown`, async ({ 
      authenticatedPage,
      testDataHelpers 
    }) => {
      // Find scenario dropdown/select
      const dropdown = authenticatedPage.locator('#scenario-select, select[name="scenario"]');
      if (await dropdown.count() > 0) {
        await expect(dropdown.first()).toBeVisible();
        // Get initial value
        const initialValue = await dropdown.first().inputValue();
        // Open dropdown and check options
        await dropdown.first().click();
        // Verify our test scenarios appear as options
        const options = dropdown.locator('option');
        const optionCount = await options.count();
        expect(optionCount).toBeGreaterThanOrEqual(testScenarios.length);
        // Check that our test scenarios are in the dropdown
        for (const scenario of testScenarios) {
          const option = options.locator(`text="${scenario.name}"`);
          if (await option.count() > 0) {
            await expect(option).toBeVisible();
          }
        }
      }
    });
    test('should filter dropdown options based on search', async ({ 
      authenticatedPage,
      testDataHelpers 
    }) => {
      // Look for searchable dropdown
      const searchableDropdown = authenticatedPage.locator('.scenario-search-dropdown, [data-testid="scenario-search"]');
      if (await searchableDropdown.count() > 0) {
        await searchableDropdown.click();
        // Type search term using test prefix
        await authenticatedPage.keyboard.type(testContext.prefix);
        // Verify filtered results contain our test scenarios
        const visibleOptions = authenticatedPage.locator('[role="option"]:visible, .dropdown-item:visible');
        const count = await visibleOptions.count();
        expect(count).toBeGreaterThanOrEqual(testScenarios.length);
        for (let i = 0; i < Math.min(count, 3); i++) {
          const optionText = await visibleOptions.nth(i).textContent();
          expect(optionText?.toLowerCase()).toContain(testContext.prefix.toLowerCase());
        }
      }
    });
    test('should handle dropdown keyboard navigation', async ({ 
      authenticatedPage,
      testDataHelpers 
    }) => {
      const dropdown = authenticatedPage.locator('#scenario-select, select[name="scenario"]');
      if (await dropdown.count() > 0) {
        const firstDropdown = dropdown.first();
        await firstDropdown.focus();
        // Get initial value
        const initialValue = await firstDropdown.inputValue();
        // Navigate with keyboard
        await authenticatedPage.keyboard.press('ArrowDown');
        await authenticatedPage.keyboard.press('ArrowDown');
        await authenticatedPage.keyboard.press('Enter');
        // Verify selection changed
        const newValue = await firstDropdown.inputValue();
        expect(newValue).not.toBe(initialValue);
      }
    });
  });
  test.describe('Visibility Controls', () => {
    test('should toggle scenario visibility', async ({ 
      authenticatedPage,
      testDataHelpers 
    }) => {
      // Find first test scenario card
      const firstScenario = testScenarios[0];
      const scenarioCard = await testDataHelpers.findByTestData(
        '.scenario-card',
        firstScenario.name
      );
      // Find visibility toggle within the card
      const visibilityToggle = scenarioCard.locator('.visibility-toggle, button[aria-label*="visibility"]');
      if (await visibilityToggle.count() > 0) {
        const initialState = await visibilityToggle.getAttribute('aria-checked') || 
                           await visibilityToggle.getAttribute('data-state');
        // Toggle visibility
        await visibilityToggle.click();
        // Verify state changed
        const newState = await visibilityToggle.getAttribute('aria-checked') || 
                       await visibilityToggle.getAttribute('data-state');
        expect(newState).not.toBe(initialState);
      }
    });
    test('should show/hide archived scenarios', async ({ 
      authenticatedPage,
      testDataHelpers 
    }) => {
      // Find archived toggle
      const archivedToggle = authenticatedPage.locator('input[name="show_archived"], input[id*="archived"]');
      if (await archivedToggle.count() > 0) {
        // Initially archived should be hidden
        const archivedScenario = testScenarios.find(s => s.status === 'archived');
        if (archivedScenario) {
          const archivedCard = authenticatedPage.locator(`.scenario-card:has-text("${archivedScenario.name}")`);
          // Show archived
          await archivedToggle.check();
          await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
          // Verify archived scenario appears
          await expect(archivedCard).toBeVisible();
          // Hide archived
          await archivedToggle.uncheck();
          await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
          // Verify archived scenario hidden
          await expect(archivedCard).not.toBeVisible();
        }
      }
    });
    test('should control section visibility', async ({ 
      authenticatedPage,
      testDataHelpers 
    }) => {
      // Navigate to first test scenario details
      const firstScenario = testScenarios[0];
      const scenarioCard = await testDataHelpers.findByTestData(
        '.scenario-card',
        firstScenario.name
      );
      await scenarioCard.click();
      // Find collapsible sections
      const sections = authenticatedPage.locator('.collapsible-section, [data-state="open"], details');
      const sectionCount = await sections.count();
      if (sectionCount > 0) {
        for (let i = 0; i < Math.min(sectionCount, 2); i++) {
          const section = sections.nth(i);
          const toggle = section.locator('.section-toggle, summary, button[aria-expanded]').first();
          if (await toggle.count() > 0) {
            // Get initial state
            const isExpanded = await section.getAttribute('data-state') === 'open' ||
                             await toggle.getAttribute('aria-expanded') === 'true' ||
                             await section.evaluate((el: HTMLDetailsElement) => el.open);
            // Toggle section
            await toggle.click();
            await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 2000 }).catch(() => {});
            // Verify state changed
            const newExpanded = await section.getAttribute('data-state') === 'open' ||
                               await toggle.getAttribute('aria-expanded') === 'true' ||
                               await section.evaluate((el: HTMLDetailsElement) => el.open);
            expect(newExpanded).toBe(!isExpanded);
          }
        }
      }
    });
  });
  test.describe('View Mode Interactions', () => {
    test('should display correct elements in card view', async ({ 
      authenticatedPage,
      testDataHelpers 
    }) => {
      // Ensure card view is active
      await authenticatedPage.getByRole('button', { name: 'Cards' }).click();
      await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
      // Verify card elements for first test scenario
      const firstScenario = testScenarios[0];
      const card = await testDataHelpers.findByTestData(
        '.scenario-card',
        firstScenario.name
      );
      await expect(card).toBeVisible();
      await expect(card.locator('.scenario-name, h3, h4')).toContainText(firstScenario.name);
      await expect(card.locator('.scenario-description, p')).toBeVisible();
      await expect(card.locator('.scenario-type, .type-badge')).toContainText(firstScenario.type);
      await expect(card.locator('.status-badge, .scenario-status')).toContainText(firstScenario.status);
    });
    test('should display correct columns in list view', async ({ 
      authenticatedPage,
      testDataHelpers 
    }) => {
      // Switch to list view
      await authenticatedPage.getByRole('button', { name: 'List' }).click();
      await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
      // Verify table structure
      const table = authenticatedPage.locator('table');
      await expect(table).toBeVisible();
      // Verify headers
      const headers = ['Name', 'Type', 'Status'];
      for (const header of headers) {
        const th = table.locator(`th:has-text("${header}"), thead td:has-text("${header}")`);
        await expect(th).toBeVisible();
      }
      // Verify our test scenarios appear in rows
      for (const scenario of testScenarios.slice(0, 2)) { // Check first 2
        const row = table.locator(`tr:has-text("${scenario.name}")`);
        await expect(row).toBeVisible();
        await expect(row.locator('td')).toContainText(scenario.type);
        await expect(row.locator('td')).toContainText(scenario.status);
      }
    });
    test(`${tags.visual} should display graph in graphical view`, async ({ 
      authenticatedPage,
      testDataHelpers 
    }) => {
      // Switch to graphical view
      await authenticatedPage.getByRole('button', { name: 'Graphical' }).click();
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      // Verify graph container
      const graphContainer = authenticatedPage.locator('.scenario-graph, .graph-container, svg, canvas');
      await expect(graphContainer).toBeVisible();
      // Check for nodes representing our scenarios
      const nodes = authenticatedPage.locator('.graph-node, .node, circle, rect');
      const nodeCount = await nodes.count();
      expect(nodeCount).toBeGreaterThanOrEqual(testScenarios.length);
      // Verify our test scenarios appear as nodes
      for (const scenario of testScenarios) {
        const nodeText = authenticatedPage.locator(`text:has-text("${scenario.name}"), .node-label:has-text("${scenario.name}")`);
        if (await nodeText.count() > 0) {
          await expect(nodeText.first()).toBeVisible();
        }
      }
    });
  });
  test.describe('Interactive Elements', () => {
    test('should show tooltips on hover', async ({ 
      authenticatedPage,
      testDataHelpers 
    }) => {
      // Find element with tooltip in our test scenario
      const firstScenario = testScenarios[0];
      const scenarioCard = await testDataHelpers.findByTestData(
        '.scenario-card',
        firstScenario.name
      );
      const elementWithTooltip = scenarioCard.locator('[data-tooltip], [title], [aria-describedby]').first();
      if (await elementWithTooltip.count() > 0) {
        // Clear any existing tooltips
        await authenticatedPage.mouse.move(0, 0);
        await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
        // Hover to show tooltip
        await elementWithTooltip.hover();
        await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
        // Verify tooltip appears
        const tooltip = authenticatedPage.locator('.tooltip, [role="tooltip"], .tippy-content');
        await expect(tooltip).toBeVisible();
      }
    });
    test('should handle drag and drop in planning view', async ({ 
      authenticatedPage,
      testDataHelpers 
    }) => {
      // Navigate to planning view if available
      const planningButton = authenticatedPage.locator('button:has-text("Planning"), a:has-text("Planning")');
      if (await planningButton.count() > 0) {
        await planningButton.click();
        await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        // Find draggable scenario elements
        const draggableScenarios = authenticatedPage.locator('[draggable="true"]');
        const dropZones = authenticatedPage.locator('.drop-zone, [data-droppable="true"]');
        if (await draggableScenarios.count() > 0 && await dropZones.count() > 1) {
          const firstDraggable = draggableScenarios.first();
          const targetDropZone = dropZones.nth(1);
          // Get initial position info
          const initialParent = await firstDraggable.locator('..').getAttribute('class');
          // Perform drag and drop
          await firstDraggable.dragTo(targetDropZone);
          await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
          // Verify element moved
          const newParent = await firstDraggable.locator('..').getAttribute('class');
          expect(newParent).not.toBe(initialParent);
        }
      }
    });
    test('should resize panels', async ({ 
      authenticatedPage,
      testDataHelpers 
    }) => {
      // Navigate to a scenario detail view
      const firstScenario = testScenarios[0];
      const scenarioCard = await testDataHelpers.findByTestData(
        '.scenario-card',
        firstScenario.name
      );
      await scenarioCard.click();
      // Find resizable panel
      const resizeHandle = authenticatedPage.locator('.resize-handle, [data-resize-handle]');
      if (await resizeHandle.count() > 0) {
        const handle = resizeHandle.first();
        const panel = handle.locator('..').first();
        // Get initial size
        const initialWidth = await panel.evaluate(el => el.getBoundingClientRect().width);
        // Get handle position
        const box = await handle.boundingBox();
        if (box) {
          // Drag resize handle
          await authenticatedPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await authenticatedPage.mouse.down();
          await authenticatedPage.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2);
          await authenticatedPage.mouse.up();
          // Verify size changed
          const newWidth = await panel.evaluate(el => el.getBoundingClientRect().width);
          expect(Math.abs(newWidth - initialWidth)).toBeGreaterThan(50);
        }
      }
    });
  });
  test.describe('Modal Interactions', () => {
    test('should handle modal keyboard shortcuts', async ({ 
      authenticatedPage 
    }) => {
      // Open new scenario modal
      await authenticatedPage.click('button:has-text("New Scenario")');
      const modal = authenticatedPage.locator('[role="dialog"], .modal');
      await expect(modal).toBeVisible();
      // Test Escape key
      await authenticatedPage.keyboard.press('Escape');
      await expect(modal).not.toBeVisible();
    });
    test('should validate modal form inputs', async ({ 
      authenticatedPage,
      apiContext 
    }) => {
      await authenticatedPage.click('button:has-text("New Scenario")');
      const modal = authenticatedPage.locator('[role="dialog"], .modal');
      // Try to submit empty form
      await modal.locator('button:has-text("Create"), button:has-text("Save")').click();
      // Check for validation errors
      await expect(modal.locator('.error-message, .invalid-feedback, .field-error')).toBeVisible();
      // Fill required fields with test data
      const testName = `${testContext.prefix}-Modal-Test`;
      await modal.locator('input[name="name"], input[name="scenario_name"]').fill(testName);
      // Listen for API call
      const responsePromise = authenticatedPage.waitForResponse(response => 
        response.url().includes('/api/scenarios') && response.request().method() === 'POST'
      );
      // Submit again
      await modal.locator('button:has-text("Create"), button:has-text("Save")').click();
      const response = await responsePromise;
      const newScenario = await response.json();
      if (newScenario.id) {
        testContext.createdIds.scenarios.push(newScenario.id);
      }
      // Modal should close
      await expect(modal).not.toBeVisible();
    });
  });
  test.describe('Loading States', () => {
    test('should show loading indicators during operations', async ({ 
      authenticatedPage 
    }) => {
      // Find refresh or reload button
      const refreshButton = authenticatedPage.locator('button[aria-label="Refresh"], button[aria-label="Reload"]');
      if (await refreshButton.count() > 0) {
        // Set up promise to catch loading indicator
        const loadingPromise = authenticatedPage.waitForSelector(
          '.loading, .spinner, [aria-busy="true"]',
          { state: 'visible', timeout: 3000 }
        ).catch(() => null);
        // Click refresh
        await refreshButton.click();
        // Check if loading indicator appeared
        const loadingElement = await loadingPromise;
        if (loadingElement) {
          // Wait for loading to complete
          await expect(authenticatedPage.locator('.loading, .spinner, [aria-busy="true"]')).not.toBeVisible({ timeout: 10000 });
        }
      }
    });
    test('should handle skeleton loaders', async ({ 
      authenticatedPage 
    }) => {
      // Force reload to potentially see skeleton loaders
      await authenticatedPage.evaluate(() => {
        // Clear any cached data to force loading state
        window.localStorage.clear();
        window.sessionStorage.clear();
      });
      await authenticatedPage.reload();
      // Check for skeleton loaders
      const skeletons = authenticatedPage.locator('.skeleton, .placeholder, [aria-busy="true"]');
      if (await skeletons.count() > 0) {
        // Verify skeletons are visible initially
        await expect(skeletons.first()).toBeVisible();
        // Wait for content to load
        await expect(skeletons.first()).not.toBeVisible({ timeout: 10000 });
        // Verify real content is shown (our test scenarios)
        const firstScenario = testScenarios[0];
        const content = authenticatedPage.locator(`.scenario-card:has-text("${firstScenario.name}")`);
        await expect(content).toBeVisible();
      }
    });
  });
});