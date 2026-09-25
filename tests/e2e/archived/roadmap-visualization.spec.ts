/**
 * Roadmap Visualization Test Suite
 * Tests for project roadmap phase visualization and timeline display
 * Uses dynamic test data for proper isolation
 */
import { test, expect, tags } from '../../../fixtures';
import { TestDataContext } from '../../../utils/test-data-helpers';
test.describe('Project Roadmap Phase Visualization', () => {
  let testContext: TestDataContext;
  let testProjects: any[];
  test.beforeEach(async ({ testDataHelpers, testHelpers, apiContext }) => {
    // Create isolated test context
    testContext = testDataHelpers.createTestContext('roadmap');
    // Create test projects with phases
    testProjects = [];
    for (let i = 0; i < 2; i++) {
      // Create project
      const project = await testDataHelpers.createTestProject(testContext, {
        name: `${testContext.prefix}-Roadmap-Project-${i + 1}`
      });
      // Create phases for the project
      const phases = [];
      const baseDate = new Date();
      for (let j = 0; j < 3; j++) {
        const phaseData = {
          project_id: project.id,
          name: `${testContext.prefix}-P${i + 1}-Phase-${j + 1}`,
          start_date: new Date(baseDate.getTime() + j * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          end_date: new Date(baseDate.getTime() + (j + 1) * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          color: ['#FF6B6B', '#4ECDC4', '#45B7D1'][j],
          order_index: j
        };
        const response = await apiContext.post('/api/project-phases', { data: phaseData });
        const phase = await response.json();
        if (phase.id) {
          phases.push(phase);
          testContext.createdIds.projectPhases.push(phase.id);
        }
      }
      testProjects.push({ ...project, phases });
    }
    // Navigate to roadmap view
    await testHelpers.navigateTo('/projects?tab=roadmap');
    await testHelpers.waitForPageLoad();
  });
  test.afterEach(async ({ testDataHelpers }) => {
    // Clean up all test data
    await testDataHelpers.cleanupTestContext(testContext);
  });
  test(`${tags.smoke} should display projects with phase timeline`, async ({ 
    authenticatedPage,
    testDataHelpers 
  }) => {
    // Wait for roadmap to load
    await authenticatedPage.waitForSelector('.project-row, .roadmap-project, [data-testid="project-roadmap"]', { timeout: 10000 });
    // Verify timeline structure
    const timelineContainer = authenticatedPage.locator('.timeline-container, .roadmap-timeline, [data-testid="timeline"]');
    await expect(timelineContainer).toBeVisible();
    // Verify timeline headers
    const timelineHeader = authenticatedPage.locator('.timeline-header, .timeline-months, [data-testid="timeline-header"]');
    await expect(timelineHeader).toBeVisible();
    // Check for month/year headers
    const monthHeaders = authenticatedPage.locator('.timeline-header-month, .month-header, [data-month]');
    const monthCount = await monthHeaders.count();
    expect(monthCount).toBeGreaterThan(0);
    // Verify our test projects are displayed
    for (const project of testProjects) {
      const projectRow = await testDataHelpers.findByTestData(
        '.project-row, .roadmap-project',
        project.name
      );
      await expect(projectRow).toBeVisible();
    }
  });
  test('should display phase boxes on timeline', async ({ 
    authenticatedPage,
    testDataHelpers 
  }) => {
    // Wait for project rows
    await authenticatedPage.waitForSelector('.project-row', { timeout: 10000 });
    // Check first test project
    const firstProject = testProjects[0];
    const projectRow = await testDataHelpers.findByTestData(
      '.project-row, .roadmap-project',
      firstProject.name
    );
    // Look for phase bars within the project row
    const phaseBars = projectRow.locator('.phase-bar, .timeline-item, .phase-box, [data-phase-id]');
    const phaseCount = await phaseBars.count();
    // Should have phases displayed
    expect(phaseCount).toBeGreaterThanOrEqual(firstProject.phases.length);
    // Verify phase properties
    if (phaseCount > 0) {
      const firstPhaseBar = phaseBars.first();
      await expect(firstPhaseBar).toBeVisible();
      // Check phase has color
      const backgroundColor = await firstPhaseBar.evaluate(el => {
        return window.getComputedStyle(el).backgroundColor;
      });
      expect(backgroundColor).not.toBe('rgba(0, 0, 0, 0)'); // Not transparent
      // Check phase has dimensions
      const boundingBox = await firstPhaseBar.boundingBox();
      expect(boundingBox?.width).toBeGreaterThan(0);
      expect(boundingBox?.height).toBeGreaterThan(0);
      // Check for phase tooltip on hover
      await firstPhaseBar.hover();
      await authenticatedPage.waitForTimeout(500);
      const tooltip = authenticatedPage.locator('[role="tooltip"], .tooltip, .phase-tooltip');
      const tooltipVisible = await tooltip.isVisible({ timeout: 2000 }).catch(() => false);
      if (tooltipVisible) {
        // Verify tooltip contains phase name
        const tooltipText = await tooltip.textContent();
        const hasPhaseInfo = firstProject.phases.some(phase => 
          tooltipText?.includes(phase.name)
        );
        expect(hasPhaseInfo).toBeTruthy();
      }
    }
  });
  test('should display project information panel', async ({ 
    authenticatedPage,
    testDataHelpers 
  }) => {
    // Wait for project rows
    await authenticatedPage.waitForSelector('.project-row', { timeout: 10000 });
    // Check each test project
    for (const project of testProjects) {
      const projectRow = await testDataHelpers.findByTestData(
        '.project-row',
        project.name
      );
      // Check for project name
      const projectName = projectRow.locator('.project-name, .project-title, [data-testid="project-name"]');
      await expect(projectName).toBeVisible();
      await expect(projectName).toContainText(project.name);
      // Check for project details/metadata
      const projectDetails = projectRow.locator('.project-details, .project-info, .project-metadata');
      const hasDetails = await projectDetails.count() > 0;
      if (hasDetails) {
        await expect(projectDetails.first()).toBeVisible();
      }
      // Check for expand/collapse controls
      const expandButton = projectRow.locator('.collapse-toggle, .expand-toggle, button[aria-expanded]');
      if (await expandButton.count() > 0) {
        // Try expanding to see more details
        const isExpanded = await expandButton.getAttribute('aria-expanded') === 'true';
        if (!isExpanded) {
          await expandButton.click();
          await authenticatedPage.waitForTimeout(500);
        }
      }
    }
  });
  test('should align phases with timeline grid', async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    // Wait for timeline to load
    const timeline = authenticatedPage.locator('.timeline-container, .projects-timeline');
    await expect(timeline).toBeVisible();
    // Get timeline bounds
    const timelineBox = await timeline.boundingBox();
    if (!timelineBox) {
      throw new Error('Could not get timeline bounding box');
    }
    // Check phase positioning
    const phaseBars = authenticatedPage.locator('.phase-bar, .timeline-item');
    const phaseCount = await phaseBars.count();
    for (let i = 0; i < Math.min(phaseCount, 3); i++) {
      const phaseBar = phaseBars.nth(i);
      const phaseBox = await phaseBar.boundingBox();
      if (phaseBox) {
        // Phase should be within timeline bounds
        expect(phaseBox.x).toBeGreaterThanOrEqual(timelineBox.x);
        expect(phaseBox.x + phaseBox.width).toBeLessThanOrEqual(timelineBox.x + timelineBox.width);
        // Phase should have reasonable dimensions
        expect(phaseBox.width).toBeGreaterThan(10); // At least 10px wide
        expect(phaseBox.height).toBeGreaterThan(10); // At least 10px tall
      }
    }
  });
  test('should handle timeline interactions', async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    // Wait for timeline
    const timeline = authenticatedPage.locator('.timeline-container');
    await expect(timeline).toBeVisible();
    // Test horizontal scroll if available
    const scrollContainer = authenticatedPage.locator('.timeline-scroll-container, .timeline-container');
    const initialScrollLeft = await scrollContainer.evaluate(el => el.scrollLeft);
    // Try scrolling
    await scrollContainer.evaluate(el => {
      el.scrollLeft = 200;
    });
    const newScrollLeft = await scrollContainer.evaluate(el => el.scrollLeft);
    // Check if timeline is scrollable
    if (newScrollLeft !== initialScrollLeft) {
      console.log('Timeline supports horizontal scrolling');
      // Reset scroll
      await scrollContainer.evaluate(el => {
        el.scrollLeft = 0;
      });
    }
    // Test phase hover interactions
    const phaseBar = authenticatedPage.locator('.phase-bar, .timeline-item').first();
    if (await phaseBar.isVisible()) {
      await phaseBar.hover();
      await authenticatedPage.waitForTimeout(300);
      // Check for hover effects or tooltips
      const tooltip = authenticatedPage.locator('[role="tooltip"], .tooltip');
      const hasTooltip = await tooltip.isVisible({ timeout: 1000 }).catch(() => false);
      if (hasTooltip) {
        console.log('Phase shows tooltip on hover');
      }
      // Check for click interactions
      await phaseBar.click();
      await authenticatedPage.waitForTimeout(500);
      // Check if click opens details or navigates
      const modal = authenticatedPage.locator('[role="dialog"], .modal');
      const hasModal = await modal.isVisible({ timeout: 1000 }).catch(() => false);
      if (hasModal) {
        console.log('Phase click opens details modal');
        // Close modal
        await authenticatedPage.keyboard.press('Escape');
      }
    }
  });
  test('should display timeline scale correctly', async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    // Check timeline headers for proper date display
    const monthHeaders = authenticatedPage.locator('.timeline-header-month, .month-header');
    const yearHeaders = authenticatedPage.locator('.timeline-header-year, .year-header');
    // Verify months are displayed
    const monthCount = await monthHeaders.count();
    if (monthCount > 0) {
      // Check first few month headers
      for (let i = 0; i < Math.min(monthCount, 3); i++) {
        const monthText = await monthHeaders.nth(i).textContent();
        // Should contain month name or abbreviation
        expect(monthText).toMatch(/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d{1,2}/i);
      }
    }
    // Verify years are displayed if available
    const yearCount = await yearHeaders.count();
    if (yearCount > 0) {
      const yearText = await yearHeaders.first().textContent();
      // Should contain a 4-digit year
      expect(yearText).toMatch(/\d{4}/);
    }
    // Verify grid lines or date markers
    const gridLines = authenticatedPage.locator('.timeline-grid-line, .date-marker, .timeline-tick');
    const gridCount = await gridLines.count();
    if (gridCount > 0) {
      console.log(`Found ${gridCount} timeline grid markers`);
    }
  });
  test('should handle empty timeline gracefully', async ({ 
    authenticatedPage,
    testDataHelpers,
    apiContext
  }) => {
    // Create a project without phases
    const emptyProject = await testDataHelpers.createTestProject(testContext, {
      name: `${testContext.prefix}-Empty-Project`
    });
    // Reload page to see new project
    await authenticatedPage.reload();
    await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
    // Find the empty project row
    const projectRow = await testDataHelpers.findByTestData(
      '.project-row',
      emptyProject.name
    );
    await expect(projectRow).toBeVisible();
    // Check that project row exists but has no phase bars
    const phaseBars = projectRow.locator('.phase-bar, .timeline-item');
    const phaseCount = await phaseBars.count();
    expect(phaseCount).toBe(0);
    // Should still show project info
    const projectName = projectRow.locator('.project-name');
    await expect(projectName).toContainText(emptyProject.name);
  });
  test('should maintain visual consistency across projects', async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    // Check that all project rows have consistent height
    const projectRows = authenticatedPage.locator('.project-row');
    const rowCount = await projectRows.count();
    const heights: number[] = [];
    for (let i = 0; i < rowCount; i++) {
      const box = await projectRows.nth(i).boundingBox();
      if (box) {
        heights.push(box.height);
      }
    }
    // All rows should have similar height (within 10px tolerance)
    if (heights.length > 1) {
      const baseHeight = heights[0];
      for (const height of heights) {
        expect(Math.abs(height - baseHeight)).toBeLessThan(10);
      }
    }
    // Check phase bar alignment across projects
    const phaseBars = authenticatedPage.locator('.phase-bar');
    const barCount = await phaseBars.count();
    if (barCount > 1) {
      // Phase bars should have consistent height
      const barHeights: number[] = [];
      for (let i = 0; i < Math.min(barCount, 5); i++) {
        const box = await phaseBars.nth(i).boundingBox();
        if (box) {
          barHeights.push(box.height);
        }
      }
      // Check consistency
      if (barHeights.length > 1) {
        const baseBarHeight = barHeights[0];
        for (const height of barHeights) {
          expect(Math.abs(height - baseBarHeight)).toBeLessThan(5);
        }
      }
    }
  });
});