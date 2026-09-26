/**
 * ARCHIVED 2026-09-26 (L4 harvest slice 3): zombie suite — the graph/
 * graphical view it drives does not exist in the current client (zero
 * "graph" references in client/src). The 2026-09-26 helper fix repaired
 * its setup (scenarios now create cleanly), which only exposed that the
 * feature under test was removed. 14 tests archived, scenario ledger
 * 214 → 200.
 *
 * Scenario Visualization Tests
 * Tests for graph visualization, visual regression, and graphical representations
 * Uses dynamic test data for proper isolation
 */
import { test, expect, tags } from '../../fixtures';
import { TestDataContext } from '../../utils/test-data-helpers';
test.describe('Scenario Visualization', () => {
  let testContext: TestDataContext;
  let testScenarios: any[];
  test.beforeEach(async ({ testDataHelpers, testHelpers }) => {
    // Create isolated test context
    testContext = testDataHelpers.createTestContext('scnvis');
    // Create test scenarios with relationships.
    // Via the shared helper (2026-09-26 systemic fix): the legacy inline
    // creates sent `type` instead of scenario_type, omitted the required
    // created_by, and read .id off the envelope — every create silently
    // failed and children crashed on testScenarios[parent].id.
    testScenarios = [];
    const parentScenarios = [
      { name: 'Baseline 2024', type: 'baseline', status: 'active' as const },
      { name: 'Growth Strategy', type: 'sandbox', status: 'draft' as const }
    ];
    for (const config of parentScenarios) {
      testScenarios.push(await testDataHelpers.createTestScenario(testContext, {
        name: `${testContext.prefix}-${config.name}`,
        description: `${config.name} for visualization testing`,
        type: config.type,
        status: config.status
      }));
    }
    const childScenarios = [
      { name: 'Conservative Growth', parent: 0, type: 'forecast' },
      { name: 'Aggressive Growth', parent: 1, type: 'forecast' }
    ];
    for (const config of childScenarios) {
      testScenarios.push(await testDataHelpers.createTestScenario(testContext, {
        name: `${testContext.prefix}-${config.name}`,
        description: `Child scenario for ${config.name}`,
        type: config.type,
        status: 'draft',
        parent_scenario_id: testScenarios[config.parent].id
      }));
    }
    await testHelpers.navigateTo('/scenarios');
    await testHelpers.waitForPageLoad();
  });
  test.afterEach(async ({ testDataHelpers }) => {
    // Clean up all test data
    await testDataHelpers.cleanupTestContext(testContext);
  });
  test.describe('Graph Visualization', () => {
    test(`${tags.visual} should display scenario dependency graph`, async ({ authenticatedPage }) => {
      // Switch to graphical view
      await authenticatedPage.getByRole('button', { name: 'Graphical' }).click();
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      // Verify graph container
      const graphContainer = authenticatedPage.locator('.graph-container, #scenario-graph, [data-testid="scenario-graph"]');
      await expect(graphContainer).toBeVisible();
      // Check for SVG or Canvas element
      const graphElement = graphContainer.locator('svg, canvas');
      await expect(graphElement.first()).toBeVisible();
    });
    test('should render scenario nodes correctly', async ({ 
      authenticatedPage,
      testDataHelpers 
    }) => {
      await authenticatedPage.getByRole('button', { name: 'Graphical' }).click();
      // Wait for graph to render
      await authenticatedPage.waitForSelector('.graph-node, .node, [data-testid*="node"]', { timeout: 5000 });
      // Verify nodes
      const nodes = authenticatedPage.locator('.graph-node, .node, [data-testid*="node"]');
      const nodeCount = await nodes.count();
      expect(nodeCount).toBeGreaterThanOrEqual(testScenarios.length);
      // Check our test scenario nodes are rendered
      for (const scenario of testScenarios) {
        const nodeElement = await testDataHelpers.findByTestData(
          '.graph-node, .node',
          scenario.name
        );
        await expect(nodeElement).toBeVisible();
        // Node should have visual representation
        const nodeShape = nodeElement.locator('circle, rect, .node-shape');
        await expect(nodeShape).toBeVisible();
        // Node should have label
        const nodeLabel = nodeElement.locator('text, .node-label');
        await expect(nodeLabel).toBeVisible();
        await expect(nodeLabel).toContainText(scenario.name);
      }
    });
    test('should show relationships between scenarios', async ({ 
      authenticatedPage,
      testDataHelpers 
    }) => {
      await authenticatedPage.getByRole('button', { name: 'Graphical' }).click();
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      // Look for edges/connections
      const edges = authenticatedPage.locator('.graph-edge, .edge, line[class*="edge"], path[class*="edge"]');
      // Should have edges for parent-child relationships
      const edgeCount = await edges.count();
      expect(edgeCount).toBeGreaterThanOrEqual(2); // At least 2 child scenarios
      if (edgeCount > 0) {
        // Verify edge properties
        for (let i = 0; i < Math.min(edgeCount, 2); i++) {
          const edge = edges.nth(i);
          await expect(edge).toBeVisible();
          // Edge should have stroke/color
          const edgeStroke = await edge.evaluate(el => 
            window.getComputedStyle(el).stroke || window.getComputedStyle(el).borderColor
          );
          expect(edgeStroke).toBeTruthy();
          expect(edgeStroke).not.toBe('none');
        }
      }
    });
    test('should support graph interactions', async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      await authenticatedPage.getByRole('button', { name: 'Graphical' }).click();
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      // Test zoom controls
      const zoomIn = authenticatedPage.locator('button[aria-label="Zoom in"], button[title*="Zoom in"]');
      const zoomOut = authenticatedPage.locator('button[aria-label="Zoom out"], button[title*="Zoom out"]');
      if (await zoomIn.count() > 0) {
        // Get initial transform
        const graphElement = authenticatedPage.locator('svg g, .graph-content, [data-testid="graph-content"]').first();
        const initialTransform = await graphElement.getAttribute('transform');
        // Zoom in
        await zoomIn.click();
        await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 2000 }).catch(() => {});
        // Verify transform changed
        const newTransform = await graphElement.getAttribute('transform');
        expect(newTransform).not.toBe(initialTransform);
        // Zoom out to reset
        await zoomOut.click();
      }
      // Test pan functionality
      const graphContainer = authenticatedPage.locator('.graph-container, [data-testid="scenario-graph"]');
      const box = await graphContainer.boundingBox();
      if (box) {
        // Simulate pan
        await authenticatedPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await authenticatedPage.mouse.down();
        await authenticatedPage.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 100, { steps: 5 });
        await authenticatedPage.mouse.up();
      }
    });
    test('should highlight node on hover', async ({ 
      authenticatedPage,
      testDataHelpers 
    }) => {
      await authenticatedPage.getByRole('button', { name: 'Graphical' }).click();
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      // Use first test scenario
      const scenario = testScenarios[0];
      const node = await testDataHelpers.findByTestData(
        '.graph-node, .node',
        scenario.name
      );
      // Get initial styles
      const initialStyles = await node.evaluate(el => ({
        opacity: window.getComputedStyle(el).opacity,
        filter: window.getComputedStyle(el).filter,
        transform: window.getComputedStyle(el).transform
      }));
      // Hover over node
      await node.hover();
      await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 2000 }).catch(() => {});
      // Check for highlight effect
      const hoverStyles = await node.evaluate(el => ({
        opacity: window.getComputedStyle(el).opacity,
        filter: window.getComputedStyle(el).filter,
        transform: window.getComputedStyle(el).transform,
        hasHoverClass: el.classList.contains('highlighted') || 
                      el.classList.contains('hover') ||
                      el.classList.contains('node-hover')
      }));
      // Should have visual change on hover
      const hasVisualChange = 
        hoverStyles.hasHoverClass ||
        hoverStyles.opacity !== initialStyles.opacity ||
        hoverStyles.filter !== initialStyles.filter ||
        hoverStyles.transform !== initialStyles.transform;
      expect(hasVisualChange).toBeTruthy();
    });
    test('should show node details on click', async ({ 
      authenticatedPage,
      testDataHelpers 
    }) => {
      await authenticatedPage.getByRole('button', { name: 'Graphical' }).click();
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      // Click a test scenario node
      const scenario = testScenarios[0];
      const node = await testDataHelpers.findByTestData(
        '.graph-node, .node',
        scenario.name
      );
      await node.click();
      // Should show details panel or tooltip
      const detailsPanel = authenticatedPage.locator('.node-details, .scenario-details-panel, [role="tooltip"], .details-popover');
      await expect(detailsPanel).toBeVisible();
      // Details should contain scenario info
      await expect(detailsPanel).toContainText(scenario.name);
      await expect(detailsPanel).toContainText(new RegExp(scenario.type, 'i'));
    });
  });
  test.describe('Layout Options', () => {
    test('should support different graph layouts', async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      await authenticatedPage.getByRole('button', { name: 'Graphical' }).click();
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      // Look for layout selector
      const layoutSelector = authenticatedPage.locator('select[name="layout"], select[aria-label*="Layout"], button[aria-label*="Layout"]');
      if (await layoutSelector.count() > 0) {
        // Try different layouts
        const layouts = ['hierarchical', 'circular', 'force'];
        for (const layout of layouts) {
          const optionExists = await authenticatedPage.locator(`option[value="${layout}"]`).count() > 0;
          if (optionExists) {
            await layoutSelector.selectOption(layout);
            await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
            // Verify layout changed - might be in container attribute or class
            const graphContainer = authenticatedPage.locator('.graph-container, [data-testid="scenario-graph"]');
            const containerClass = await graphContainer.getAttribute('class');
            const dataLayout = await graphContainer.getAttribute('data-layout');
            const hasLayoutApplied = 
              (containerClass && containerClass.includes(layout)) || 
              dataLayout === layout;
            expect(hasLayoutApplied).toBeTruthy();
          }
        }
      }
    });
    test('should fit graph to viewport', async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      await authenticatedPage.getByRole('button', { name: 'Graphical' }).click();
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      // Click fit to screen button
      const fitButton = authenticatedPage.locator('button[aria-label="Fit to screen"], button[title*="Fit"], button:has-text("Fit")');
      if (await fitButton.count() > 0) {
        // Get graph element before fit
        const graphContent = authenticatedPage.locator('.graph-content, svg g, [data-testid="graph-content"]').first();
        await fitButton.click();
        await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
        // Verify transform updated
        const transform = await graphContent.getAttribute('transform');
        expect(transform).toBeTruthy();
        expect(transform).toMatch(/scale|translate/);
      }
    });
  });
  test.describe('Visual Regression', () => {
    test(`${tags.visual} should maintain consistent node styling`, async ({ 
      authenticatedPage,
      testDataHelpers 
    }) => {
      await authenticatedPage.getByRole('button', { name: 'Graphical' }).click();
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      // Take screenshot for visual regression
      const graphContainer = authenticatedPage.locator('.graph-container, [data-testid="scenario-graph"]');
      const box = await graphContainer.boundingBox();
      if (box) {
        await authenticatedPage.screenshot({ 
          path: 'test-results/scenario-graph.png',
          clip: box
        });
      }
      // Verify consistent styling for each scenario type
      for (const scenario of testScenarios) {
        const node = await testDataHelpers.findByTestData(
          '.graph-node, .node',
          scenario.name
        );
        const nodeShape = node.locator('circle, rect, .node-shape');
        const nodeColor = await nodeShape.evaluate(el => 
          window.getComputedStyle(el).fill || 
          window.getComputedStyle(el).backgroundColor
        );
        // Check color based on type
        if (scenario.type === 'baseline') {
          expect(nodeColor).toMatch(/blue|#[0-9a-f]*[4-7][0-9a-f]/i);
        } else if (scenario.type === 'what-if') {
          expect(nodeColor).toMatch(/green|#[0-9a-f]*[7-9a][0-9a-f]/i);
        } else if (scenario.type === 'forecast') {
          expect(nodeColor).toMatch(/purple|orange|#[0-9a-f]{6}/i);
        }
      }
    });
    test('should handle graph animations smoothly', async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      await authenticatedPage.getByRole('button', { name: 'Graphical' }).click();
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      // Trigger animation (e.g., layout change or node highlight)
      const animationTrigger = authenticatedPage.locator('button[aria-label="Animate"], button[title*="Animation"]');
      if (await animationTrigger.count() > 0) {
        // Set up frame counter
        await authenticatedPage.evaluate(() => {
          window.frameCount = 0;
          let animationId: number;
          const startTime = performance.now();
          const countFrames = () => {
            window.frameCount++;
            if (performance.now() - startTime < 1000) {
              animationId = requestAnimationFrame(countFrames);
            }
          };
          animationId = requestAnimationFrame(countFrames);
        });
        await animationTrigger.click();
        // Wait for animation to play (~1 second) using network idle as proxy
        await authenticatedPage.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        // Check frame rate (should be smooth, >30fps)
        const frameCount = await authenticatedPage.evaluate(() => window.frameCount);
        expect(frameCount).toBeGreaterThan(30);
      }
    });
  });
  test.describe('Export and Sharing', () => {
    test('should export graph as image', async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      await authenticatedPage.getByRole('button', { name: 'Graphical' }).click();
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      // Look for export button
      const exportButton = authenticatedPage.locator('button[aria-label*="Export"], button[title*="Export"], button:has-text("Export")');
      if (await exportButton.count() > 0) {
        // Set up download listener
        const downloadPromise = authenticatedPage.waitForEvent('download', { timeout: 10000 });
        await exportButton.click();
        // Select export format if prompted
        const formatOptions = authenticatedPage.locator('button:has-text("PNG"), button:has-text("SVG")');
        if (await formatOptions.count() > 0) {
          await formatOptions.first().click();
        }
        // Wait for download
        try {
          const download = await downloadPromise;
          expect(download.suggestedFilename()).toMatch(/scenario.*\.(png|svg|jpg)/i);
        } catch {
          // Export might not trigger actual download in test environment
          console.log('Export download not triggered in test environment');
        }
      }
    });
    test('should generate shareable link for graph view', async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      await authenticatedPage.getByRole('button', { name: 'Graphical' }).click();
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      const shareButton = authenticatedPage.locator('button[aria-label*="Share"], button[title*="Share"], button:has-text("Share")');
      if (await shareButton.count() > 0) {
        await shareButton.click();
        // Should show share dialog
        const shareDialog = authenticatedPage.locator('.share-dialog, [role="dialog"], .modal');
        await expect(shareDialog).toBeVisible();
        // Should have share link
        const shareLink = shareDialog.locator('input[readonly], .share-link, input[type="url"]');
        if (await shareLink.count() > 0) {
          const linkValue = await shareLink.inputValue();
          expect(linkValue).toMatch(/^https?:\/\//);
          expect(linkValue).toContain('scenarios');
        }
        // Close dialog
        const closeButton = shareDialog.locator('button:has-text("Close"), button[aria-label="Close"]');
        if (await closeButton.isVisible()) {
          await closeButton.click();
        } else {
          await authenticatedPage.keyboard.press('Escape');
        }
      }
    });
  });
  test.describe('Performance', () => {
    test(`${tags.performance} should render graphs efficiently`, async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      await authenticatedPage.getByRole('button', { name: 'Graphical' }).click();
      // Measure initial render time
      const startTime = Date.now();
      await authenticatedPage.waitForSelector('.graph-node, .node', { timeout: 5000 });
      const renderTime = Date.now() - startTime;
      // Should render within reasonable time
      expect(renderTime).toBeLessThan(3000);
      // Check if virtualization is used for large graphs
      const nodes = await authenticatedPage.locator('.graph-node, .node').count();
      if (nodes > 50) {
        // Should implement virtualization or clustering
        const visibleNodes = await authenticatedPage.locator('.graph-node:visible, .node:visible').count();
        expect(visibleNodes).toBeLessThanOrEqual(nodes);
      }
    });
    test('should handle graph updates without full re-render', async ({ 
      authenticatedPage,
      testDataHelpers 
    }) => {
      await authenticatedPage.getByRole('button', { name: 'Graphical' }).click();
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      // Add mutation observer to track DOM changes
      const initialChangeCount = await authenticatedPage.evaluate(() => {
        window.domChangeCount = 0;
        const observer = new MutationObserver(() => window.domChangeCount++);
        const graphContainer = document.querySelector('.graph-container, svg');
        if (graphContainer) {
          observer.observe(graphContainer, { 
            childList: true, 
            subtree: true, 
            attributes: true 
          });
        }
        return window.domChangeCount;
      });
      // Trigger minor update (e.g., highlight node)
      const scenario = testScenarios[0];
      const node = await testDataHelpers.findByTestData(
        '.graph-node, .node',
        scenario.name
      );
      await node.hover();
      await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
      // Check DOM changes were minimal
      const finalChanges = await authenticatedPage.evaluate(() => window.domChangeCount);
      const changeCount = finalChanges - initialChangeCount;
      // Should be targeted updates, not full re-render
      expect(changeCount).toBeLessThan(20);
    });
  });
});