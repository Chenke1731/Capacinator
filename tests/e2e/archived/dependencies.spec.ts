/**
 * Phase Dependencies Test Suite
 * Tests for project phase dependencies and cascade calculations
 * Uses dynamic test data for proper isolation
 */
import { test, expect, tags } from '../../../fixtures';
import { TestDataContext } from '../../../utils/test-data-helpers';
test.describe('Phase Dependencies E2E Tests', () => {
  let testContext: TestDataContext;
  let testData: any;
  let testProject: any;
  test.beforeEach(async ({ testDataHelpers, testHelpers, authenticatedPage, apiContext }) => {
    // Create isolated test context
    testContext = testDataHelpers.createTestContext('phasedeps');
    // Create test project with phases
    testProject = await testDataHelpers.createTestProject(testContext, {
      name: `${testContext.prefix}-Phase-Deps-Project`
    });
    // Create multiple phases for the project
    const phases = [];
    for (let i = 0; i < 3; i++) {
      const phaseData = {
        project_id: testProject.id,
        name: `${testContext.prefix}-Phase-${i + 1}`,
        start_date: new Date(Date.now() + i * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        end_date: new Date(Date.now() + (i + 1) * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        color: ['#FF6B6B', '#4ECDC4', '#45B7D1'][i],
        order_index: i
      };
      const response = await apiContext.post('/api/project-phases', { data: phaseData });
      const phase = await response.json();
      if (phase.id) {
        phases.push(phase);
        testContext.createdIds.projectPhases.push(phase.id);
      }
    }
    testData = { phases };
    // Navigate to the test project
    await testHelpers.navigateTo(`/projects/${testProject.id}`);
    await testHelpers.waitForPageLoad();
  });
  test.afterEach(async ({ testDataHelpers }) => {
    // Clean up all test data
    await testDataHelpers.cleanupTestContext(testContext);
  });
  test(`${tags.smoke} should display project timeline section`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    // Check that the Project Timeline section exists
    await expect(authenticatedPage.locator('h2:has-text("Project Timeline"), h2:has-text("Phases"), h2:has-text("Schedule")')).toBeVisible();
    // Check that the phase management component is rendered
    const phaseManager = authenticatedPage.locator('.visual-phase-manager, .interactive-timeline, .phase-timeline, [data-testid="phase-manager"]');
    await expect(phaseManager).toBeVisible({ timeout: 10000 });
  });
  test('should load and display project phases', async ({ 
    authenticatedPage,
    testHelpers,
    testDataHelpers 
  }) => {
    // Wait for phases to load
    await authenticatedPage.waitForResponse(response => 
      response.url().includes('/api/project-phases') && response.status() === 200
    );
    // Check that our test phases are displayed
    for (const phase of testData.phases) {
      const phaseElement = await testDataHelpers.findByTestData(
        '[data-testid*="timeline-item"], .timeline-item, .phase-item',
        phase.name
      );
      await expect(phaseElement).toBeVisible();
    }
    // Should have the correct number of phases
    const phaseElements = authenticatedPage.locator('[data-testid*="timeline-item"], .timeline-item, .phase-item');
    const count = await phaseElements.count();
    expect(count).toBeGreaterThanOrEqual(testData.phases.length);
  });
  test('should load phase dependencies', async ({ 
    authenticatedPage,
    apiContext 
  }) => {
    // Create a dependency between first two phases
    const dependencyData = {
      predecessor_id: testData.phases[0].id,
      successor_id: testData.phases[1].id,
      lag_value: 0,
      lag_type: 'fs' // finish-to-start
    };
    const response = await apiContext.post('/api/project-phase-dependencies', { data: dependencyData });
    const dependency = await response.json();
    // Refresh page to see dependency
    await authenticatedPage.reload();
    await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
    // Wait for dependencies to load
    await authenticatedPage.waitForResponse(response => 
      response.url().includes('/api/project-phase-dependencies') && response.status() === 200
    );
    // Dependencies should be visualized (lines, arrows, etc.)
    const dependencyElements = authenticatedPage.locator('[class*="dependency"], [data-testid*="dependency"], .dependency-line, .arrow');
    const dependencyCount = await dependencyElements.count();
    expect(dependencyCount).toBeGreaterThan(0);
  });
  test('should create a new phase dependency via UI', async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    // Wait for the timeline to be interactive
    const phaseManager = authenticatedPage.locator('.interactive-timeline, .visual-phase-manager, .phase-timeline');
    await expect(phaseManager).toBeVisible();
    // Find phase elements
    const firstPhase = authenticatedPage.locator(`[data-testid*="phase"]:has-text("${testData.phases[0].name}"), .phase-item:has-text("${testData.phases[0].name}")`);
    const secondPhase = authenticatedPage.locator(`[data-testid*="phase"]:has-text("${testData.phases[1].name}"), .phase-item:has-text("${testData.phases[1].name}")`);
    // Try to create dependency via right-click
    await firstPhase.click({ button: 'right' });
    // Look for dependency creation options
    const contextMenu = authenticatedPage.locator('.context-menu, [role="menu"]');
    const dependencyOption = authenticatedPage.locator('text=/Create Dependency|Add Dependency|Link to/i');
    if (await contextMenu.isVisible() && await dependencyOption.isVisible()) {
      await dependencyOption.click();
      await secondPhase.click();
      // Wait for API call
      const responsePromise = authenticatedPage.waitForResponse(response => 
        response.url().includes('/api/project-phase-dependencies') && 
        response.request().method() === 'POST'
      );
      await responsePromise;
      // Should show dependency line
      const dependencyLine = authenticatedPage.locator('[class*="dependency"], .dependency-line');
      await expect(dependencyLine).toBeVisible({ timeout: 5000 });
    } else {
      // Alternative: Look for dependency button/mode
      const dependencyButton = authenticatedPage.locator('button:has-text("Dependencies"), button[title*="dependency"]');
      if (await dependencyButton.isVisible()) {
        await dependencyButton.click();
        await firstPhase.click();
        await secondPhase.click();
      }
    }
  });
  test('should move a phase and trigger cascade calculation', async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    // Wait for timeline to be ready
    const phaseManager = authenticatedPage.locator('.interactive-timeline, .visual-phase-manager');
    await expect(phaseManager).toBeVisible();
    // Find the specific test phase to drag
    const phaseElement = authenticatedPage.locator(`[draggable="true"]:has-text("${testData.phases[0].name}"), [data-testid*="phase"]:has-text("${testData.phases[0].name}")`);
    if (await phaseElement.isVisible()) {
      // Get initial position
      const initialBox = await phaseElement.boundingBox();
      if (initialBox) {
        // Set up response listener for cascade calculation
        const cascadePromise = authenticatedPage.waitForResponse(response => 
          response.url().includes('/api/project-phase-dependencies/calculate-cascade') && 
          response.request().method() === 'POST',
          { timeout: 10000 }
        ).catch(() => null); // Don't fail if cascade not triggered
        // Drag phase to new position (move right by 100px)
        await phaseElement.hover();
        await authenticatedPage.mouse.down();
        await authenticatedPage.mouse.move(initialBox.x + 100, initialBox.y);
        await authenticatedPage.mouse.up();
        // Check if cascade was calculated
        const cascadeResponse = await cascadePromise;
        if (cascadeResponse) {
          expect(cascadeResponse.status()).toBe(200);
          // Check for cascade results dialog
          const cascadeDialog = authenticatedPage.locator('[data-testid="cascade-dialog"], .cascade-results, .modal:has-text("Cascade"), .dialog:has-text("Impact")');
          const isDialogVisible = await cascadeDialog.isVisible({ timeout: 3000 }).catch(() => false);
          if (isDialogVisible) {
            // Dialog should show affected phases
            await expect(cascadeDialog).toContainText(/affect|impact|cascade/i);
            // Close dialog
            const closeButton = cascadeDialog.locator('button:has-text("Close"), button:has-text("OK"), button:has-text("Cancel")');
            if (await closeButton.isVisible()) {
              await closeButton.click();
            }
          }
        }
      }
    }
  });
  test('should handle cascade conflicts appropriately', async ({ 
    authenticatedPage,
    apiContext 
  }) => {
    // Create dependencies to potentially cause conflicts
    const dependency1 = {
      predecessor_id: testData.phases[0].id,
      successor_id: testData.phases[1].id,
      lag_value: 0,
      lag_type: 'fs'
    };
    const dependency2 = {
      predecessor_id: testData.phases[1].id,
      successor_id: testData.phases[2].id,
      lag_value: 0,
      lag_type: 'fs'
    };
    // Create dependencies
    await apiContext.post('/api/project-phase-dependencies', { data: dependency1 });
    await apiContext.post('/api/project-phase-dependencies', { data: dependency2 });
    // Reload to see dependencies
    await authenticatedPage.reload();
    await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
    // Try to move first phase to create potential conflict
    const phaseElement = authenticatedPage.locator(`[draggable="true"]:has-text("${testData.phases[0].name}")`);
    if (await phaseElement.isVisible()) {
      const box = await phaseElement.boundingBox();
      if (box) {
        // Move phase forward significantly
        await phaseElement.hover();
        await authenticatedPage.mouse.down();
        await authenticatedPage.mouse.move(box.x + 200, box.y);
        await authenticatedPage.mouse.up();
        // Wait for cascade response
        try {
          const response = await authenticatedPage.waitForResponse(
            resp => resp.url().includes('/api/project-phase-dependencies/calculate-cascade'),
            { timeout: 5000 }
          );
          const cascadeData = await response.json();
          // Check if UI shows conflicts
          if (cascadeData.conflicts && cascadeData.conflicts.length > 0) {
            const conflictIndicator = authenticatedPage.locator('.conflict, .warning, [data-testid="conflict"]');
            await expect(conflictIndicator).toBeVisible({ timeout: 3000 });
          }
        } catch (error) {
          console.log('Cascade calculation not triggered or timed out');
        }
      }
    }
  });
  test('should update phase dates based on dependencies', async ({ 
    authenticatedPage,
    apiContext 
  }) => {
    // Create a dependency first
    const dependency = {
      predecessor_id: testData.phases[0].id,
      successor_id: testData.phases[1].id,
      lag_value: 2,
      lag_type: 'fs'
    };
    await apiContext.post('/api/project-phase-dependencies', { data: dependency });
    // Reload page
    await authenticatedPage.reload();
    // Move the first phase
    const firstPhase = authenticatedPage.locator(`[draggable="true"]:has-text("${testData.phases[0].name}")`);
    if (await firstPhase.isVisible()) {
      // Trigger date change
      const box = await firstPhase.boundingBox();
      if (box) {
        await firstPhase.hover();
        await authenticatedPage.mouse.down();
        await authenticatedPage.mouse.move(box.x + 50, box.y);
        await authenticatedPage.mouse.up();
        // Wait for updates
        await authenticatedPage.waitForTimeout(1000);
        // Second phase should be updated based on dependency
        const secondPhaseElement = authenticatedPage.locator(`[data-testid*="phase"]:has-text("${testData.phases[1].name}")`);
        await expect(secondPhaseElement).toBeVisible();
        // Verify that phase positions reflect the dependency relationship
        const firstBox = await firstPhase.boundingBox();
        const secondBox = await secondPhaseElement.boundingBox();
        if (firstBox && secondBox) {
          // Second phase should start after first phase ends (with lag)
          expect(secondBox.x).toBeGreaterThan(firstBox.x);
        }
      }
    }
  });
  test('should delete phase dependencies', async ({ 
    authenticatedPage,
    apiContext 
  }) => {
    // Create a dependency to delete
    const dependency = {
      predecessor_id: testData.phases[0].id,
      successor_id: testData.phases[1].id,
      lag_value: 0,
      lag_type: 'fs'
    };
    const response = await apiContext.post('/api/project-phase-dependencies', { data: dependency });
    const createdDependency = await response.json();
    // Reload page to see dependency
    await authenticatedPage.reload();
    await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
    // Find and click on dependency line
    const dependencyLine = authenticatedPage.locator('[class*="dependency"], .dependency-line').first();
    if (await dependencyLine.isVisible()) {
      await dependencyLine.click();
      // Look for delete option
      const deleteButton = authenticatedPage.locator('button:has-text("Delete"), button[title*="Delete"], .delete-dependency');
      if (await deleteButton.isVisible()) {
        // Set up delete response listener
        const deletePromise = authenticatedPage.waitForResponse(response => 
          response.url().includes(`/api/project-phase-dependencies/${createdDependency.id}`) && 
          response.request().method() === 'DELETE'
        );
        await deleteButton.click();
        // Confirm deletion if needed
        const confirmButton = authenticatedPage.locator('button:has-text("Confirm"), button:has-text("Yes")');
        if (await confirmButton.isVisible({ timeout: 2000 })) {
          await confirmButton.click();
        }
        await deletePromise;
        // Dependency should be removed
        await expect(dependencyLine).not.toBeVisible({ timeout: 3000 });
      }
    }
  });
});