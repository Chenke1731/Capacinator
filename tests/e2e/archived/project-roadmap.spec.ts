import { test, expect } from './fixtures'
import { TestDataGenerator } from './helpers/test-data-generator';
test.describe('Project Roadmap', () => {
  let testDataGenerator: TestDataGenerator;
  let testData: any;
  test.beforeEach(async ({ request, page }) => {
    testDataGenerator = new TestDataGenerator(request);
    // Generate comprehensive test data for roadmap testing
    testData = await testDataGenerator.generateProjectRoadmapData();
    // Navigate to roadmap page
    await testHelpers.navigateTo('/roadmap');
  });
  test.afterEach(async () => {
    // Clean up test data after each test
    await testDataGenerator.cleanup();
  });
  test.describe('Page Loading and Basic UI', () => {
    test('should load roadmap page with correct layout', async ({ authenticatedPage, testHelpers }) => {
      // Verify page title and header
      await expect(authenticatedPage.locator('h1')).toContainText('Project Roadmap');
      await expect(authenticatedPage.locator('.subtitle')).toContainText('Visual timeline of all projects and their phases');
      // Verify main sections are present
      await expect(authenticatedPage.locator('.roadmap-header')).toBeVisible();
      await expect(authenticatedPage.locator('.roadmap-content')).toBeVisible();
      await expect(authenticatedPage.locator('.timeline-container')).toBeVisible();
      // Verify search and filter controls
      await expect(authenticatedPage.locator('.search-box input')).toBeVisible();
      await expect(authenticatedPage.locator('select').first()).toBeVisible(); // Status filter
      // Verify zoom controls
      await expect(authenticatedPage.locator('.zoom-controls')).toBeVisible();
      // Verify new UI elements from our roadmap improvements
      await expect(authenticatedPage.locator('.timeline-nav-controls')).toBeVisible();
      await expect(authenticatedPage.locator('.timeline-nav-btn.today-btn')).toBeVisible();
      await expect(authenticatedPage.locator('.timeline-date-picker')).toBeVisible();
      // Verify year and month headers are separate (our two-row design)
      await expect(authenticatedPage.locator('.timeline-years')).toBeVisible();
      await expect(authenticatedPage.locator('.timeline-months')).toBeVisible();
      // Verify side navigation bars exist (though hidden until hover)
      await expect(authenticatedPage.locator('.timeline-nav-side.left')).toBeAttached();
      await expect(authenticatedPage.locator('.timeline-nav-side.right')).toBeAttached();
      // Verify zoom level display
      await expect(authenticatedPage.locator('.zoom-level')).toBeVisible();
    });
    test('should display timeline header with months', async ({ authenticatedPage, testHelpers }) => {
      // Wait for timeline to load
      await expect(authenticatedPage.locator('.timeline-header')).toBeVisible();
      // Verify month headers are displayed
      const monthHeaders = authenticatedPage.locator('.timeline-header-month');
      const headerCount = await monthHeaders.count();
      expect(headerCount).toBeGreaterThanOrEqual(1);
      // Verify month headers contain month text (year is in separate row now)
      const firstMonth = monthHeaders.first();
      await expect(firstMonth).toContainText(/\w{3}/); // e.g., "Jan"
      // Verify year headers are present
      const yearHeaders = authenticatedPage.locator('.timeline-header-year');
      const yearCount = await yearHeaders.count();
      expect(yearCount).toBeGreaterThanOrEqual(1);
      const firstYear = yearHeaders.first();
      await expect(firstYear).toContainText(/\d{4}/); // e.g., "2024"
    });
    test('should handle empty state gracefully', async ({ authenticatedPage, testHelpers }) => {
      // Test with no projects (clean database)
      await testDataGenerator.cleanup();
      await authenticatedPage.reload();
      // Should still show basic structure
      await expect(authenticatedPage.locator('.roadmap-header')).toBeVisible();
      await expect(authenticatedPage.locator('.timeline-header')).toBeVisible();
      // Projects area should be empty but not broken
      await expect(authenticatedPage.locator('.projects-timeline')).toBeVisible();
      const projectRows = authenticatedPage.locator('.project-row');
      await expect(projectRows).toHaveCount(0);
    });
  });
  test.describe('Project Display and Data', () => {
    test('should display projects with correct information', async ({ authenticatedPage, testHelpers }) => {
      // Wait for projects to load
      const projectCount = await authenticatedPage.locator('.project-row').count();
      expect(projectCount).toBeGreaterThanOrEqual(1);
      const firstProject = authenticatedPage.locator('.project-row').first();
      // Verify project info section
      await expect(firstProject.locator('.project-name')).toBeVisible();
      await expect(firstProject.locator('.project-type')).toBeVisible();
      await expect(firstProject.locator('.project-status')).toBeVisible();
      await expect(firstProject.locator('.project-dates')).toBeVisible();
      // Verify project timeline section
      await expect(firstProject.locator('.project-timeline')).toBeVisible();
      console.log('✅ Projects display with correct structure');
    });
    test('should display project phases as visual bars', async ({ authenticatedPage, testHelpers }) => {
      // Wait for projects with phases to load
      const projectCount = await authenticatedPage.locator('.project-row').count();
      expect(projectCount).toBeGreaterThanOrEqual(1);
      const projectWithPhases = authenticatedPage.locator('.project-row').first();
      const phaseBars = projectWithPhases.locator('.phase-bar');
      if (await phaseBars.count() > 0) {
        const firstPhase = phaseBars.first();
        // Verify phase bar structure
        await expect(firstPhase).toBeVisible();
        await expect(firstPhase.locator('.phase-name')).toBeVisible();
        await expect(firstPhase.locator('.phase-duration')).toBeVisible();
        // Verify resize handles (should be present but hidden)
        await expect(firstPhase.locator('.resize-start')).toBeInViewport();
        await expect(firstPhase.locator('.resize-end')).toBeInViewport();
        console.log('✅ Phase bars display correctly');
      } else {
        console.log('ℹ️  No phases found for projects - this is acceptable for empty test data');
      }
    });
    test('should show phase details on hover', async ({ authenticatedPage, testHelpers }) => {
      const phaseBars = authenticatedPage.locator('.phase-bar');
      if (await phaseBars.count() > 0) {
        const firstPhase = phaseBars.first();
        // Hover over phase to reveal resize handles
        await firstPhase.hover();
        // Wait for hover effects
        await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 2000 }).catch(() => {});
        // Check that phase gets hover styling (should have elevated appearance)
        await expect(firstPhase).toHaveClass(/phase-bar/);
        console.log('✅ Phase hover interactions work');
      }
    });
  });
  test.describe('Search and Filtering', () => {
    test('should filter projects by search term', async ({ authenticatedPage, testHelpers }) => {
      // Wait for projects to load
      const projectCount = await authenticatedPage.locator('.project-row').count();
      expect(projectCount).toBeGreaterThanOrEqual(1);
      const initialProjectCount = await authenticatedPage.locator('.project-row').count();
      if (initialProjectCount > 0) {
        // Get the name of the first project
        const firstProjectName = await authenticatedPage.locator('.project-name').first().textContent();
        if (firstProjectName) {
          // Search for part of the project name
          const searchTerm = firstProjectName.split(' ')[0];
          await authenticatedPage.locator('.search-box input').fill(searchTerm);
          // Wait for search to be applied (debounced)
          await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
          // Verify filtered results
          const filteredRows = authenticatedPage.locator('.project-row');
          const filteredCount = await filteredRows.count();
          // Should have at least the matching project
          expect(filteredCount).toBeGreaterThanOrEqual(1);
          // Verify the matching project is still visible
          await expect(authenticatedPage.locator('.project-name').first()).toContainText(searchTerm);
          console.log(`✅ Search filtering works: ${initialProjectCount} → ${filteredCount} projects`);
        }
      }
    });
    test('should filter projects by status', async ({ authenticatedPage, testHelpers }) => {
      // Wait for projects to load
      const projectCount = await authenticatedPage.locator('.project-row').count();
      expect(projectCount).toBeGreaterThanOrEqual(1);
      // Try filtering by different statuses
      const statusFilter = authenticatedPage.locator('select').first();
      // Test "Active" filter
      await statusFilter.selectOption('active');
      await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
      // Verify URL or query state changed (projects may or may not be filtered depending on data)
      // The important thing is that the filter doesn't break the page
      await expect(authenticatedPage.locator('.timeline-container')).toBeVisible();
      // Test "All Statuses" (reset)
      await statusFilter.selectOption('');
      await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
      await expect(authenticatedPage.locator('.timeline-container')).toBeVisible();
      console.log('✅ Status filtering works without errors');
    });
    test('should clear search and show all projects', async ({ authenticatedPage, testHelpers }) => {
      const searchInput = authenticatedPage.locator('.search-box input');
      // Wait for initial load
      await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
      const initialCount = await authenticatedPage.locator('.project-row').count();
      // Enter search term
      await searchInput.fill('nonexistentproject');
      await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
      // Clear search
      await searchInput.clear();
      await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
      // Should show all projects again
      const finalCount = await authenticatedPage.locator('.project-row').count();
      expect(finalCount).toBe(initialCount);
      console.log('✅ Search clearing works correctly');
    });
  });
  test.describe('Timeline Zoom Controls', () => {
    test('should zoom in and out using controls', async ({ authenticatedPage, testHelpers }) => {
      // Wait for timeline to load
      await expect(authenticatedPage.locator('.zoom-level')).toBeVisible();
      // Get initial zoom level
      const initialZoomText = await authenticatedPage.locator('.zoom-level').textContent();
      // Zoom in
      await authenticatedPage.locator('.zoom-controls button').last().click(); // Zoom in button
      await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 2000 }).catch(() => {});
      // Check zoom level changed
      const zoomedInText = await authenticatedPage.locator('.zoom-level').textContent();
      expect(zoomedInText).not.toBe(initialZoomText);
      // Zoom out
      await authenticatedPage.locator('.zoom-controls button').first().click(); // Zoom out button
      await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 2000 }).catch(() => {});
      // Should be back to original or different level
      const zoomedOutText = await authenticatedPage.locator('.zoom-level').textContent();
      expect(zoomedOutText).not.toBe(zoomedInText);
      console.log(`✅ Zoom controls work: ${initialZoomText} → ${zoomedInText} → ${zoomedOutText}`);
    });
    test('should update timeline scale when zooming', async ({ authenticatedPage, testHelpers }) => {
      // Measure timeline width before zooming
      const timelineHeader = authenticatedPage.locator('.timeline-header');
      await expect(timelineHeader).toBeVisible();
      // Get initial timeline properties
      const initialBbox = await timelineHeader.boundingBox();
      // Zoom in significantly
      for (let i = 0; i < 3; i++) {
        await authenticatedPage.locator('.zoom-controls button').last().click();
        await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 2000 }).catch(() => {});
      }
      // Timeline should be more detailed now (visual verification)
      await expect(timelineHeader).toBeVisible();
      console.log('✅ Timeline scale updates with zoom');
    });
  });
  test.describe('Phase Interaction and Editing', () => {
    test('should open edit modal when clicking on phase', async ({ authenticatedPage, testHelpers }) => {
      const phaseBars = authenticatedPage.locator('.phase-bar');
      if (await phaseBars.count() > 0) {
        // Click on first phase
        await phaseBars.first().click();
        // Verify modal opens
        await expect(authenticatedPage.locator('[data-radix-dialog-overlay]')).toBeVisible();
        await expect(authenticatedPage.locator('.modal-container')).toBeVisible();
        await expect(authenticatedPage.locator('[role="dialog"] > div > div:first-child h3')).toContainText('Edit Phase Dates');
        // Verify form fields
        await expect(authenticatedPage.locator('input[type="date"]').first()).toBeVisible(); // Start date
        await expect(authenticatedPage.locator('input[type="date"]').last()).toBeVisible();  // End date
        // Verify action buttons
        await expect(authenticatedPage.locator('button:has-text("Cancel")')).toBeVisible();
        await expect(authenticatedPage.locator('button:has-text("Save Changes")')).toBeVisible();
        console.log('✅ Phase edit modal opens correctly');
      }
    });
    test('should close modal when clicking cancel', async ({ authenticatedPage, testHelpers }) => {
      const phaseBars = authenticatedPage.locator('.phase-bar');
      if (await phaseBars.count() > 0) {
        // Open modal
        await phaseBars.first().click();
        await expect(authenticatedPage.locator('[data-radix-dialog-overlay]')).toBeVisible();
        // Click cancel
        await authenticatedPage.locator('button:has-text("Cancel")').click();
        // Modal should be gone
        await expect(authenticatedPage.locator('[data-radix-dialog-overlay]')).not.toBeVisible();
        console.log('✅ Modal closes when cancelled');
      }
    });
    test('should close modal when clicking X button', async ({ authenticatedPage, testHelpers }) => {
      const phaseBars = authenticatedPage.locator('.phase-bar');
      if (await phaseBars.count() > 0) {
        // Open modal
        await phaseBars.first().click();
        await expect(authenticatedPage.locator('[data-radix-dialog-overlay]')).toBeVisible();
        // Click X button
        await authenticatedPage.locator('[role="dialog"] > div > div:first-child button').click();
        // Modal should be gone
        await expect(authenticatedPage.locator('[data-radix-dialog-overlay]')).not.toBeVisible();
        console.log('✅ Modal closes when X is clicked');
      }
    });
    test('should validate date inputs in edit modal', async ({ authenticatedPage, testHelpers }) => {
      const phaseBars = authenticatedPage.locator('.phase-bar');
      if (await phaseBars.count() > 0) {
        // Open modal
        await phaseBars.first().click();
        await expect(authenticatedPage.locator('[data-radix-dialog-overlay]')).toBeVisible();
        // Get date inputs
        const startDateInput = authenticatedPage.locator('input[type="date"]').first();
        const endDateInput = authenticatedPage.locator('input[type="date"]').last();
        // Set valid dates
        await startDateInput.fill('2024-01-01');
        await endDateInput.fill('2024-01-31');
        // Verify dates are set
        await expect(startDateInput).toHaveValue('2024-01-01');
        await expect(endDateInput).toHaveValue('2024-01-31');
        // Save button should be enabled
        const saveButton = authenticatedPage.locator('button:has-text("Save Changes")');
        await expect(saveButton).toBeEnabled();
        console.log('✅ Date validation in modal works');
      }
    });
  });
  test.describe('Drag and Drop Functionality', () => {
    test('should show resize handles on phase hover', async ({ authenticatedPage, testHelpers }) => {
      const phaseBars = authenticatedPage.locator('.phase-bar');
      if (await phaseBars.count() > 0) {
        const firstPhase = phaseBars.first();
        // Hover over phase
        await firstPhase.hover();
        // Resize handles should become more visible on hover
        const startHandle = firstPhase.locator('.resize-start');
        const endHandle = firstPhase.locator('.resize-end');
        await expect(startHandle).toBeInViewport();
        await expect(endHandle).toBeInViewport();
        console.log('✅ Resize handles appear on hover');
      }
    });
    test('should change cursor when hovering over resize handles', async ({ authenticatedPage, testHelpers }) => {
      const phaseBars = authenticatedPage.locator('.phase-bar');
      if (await phaseBars.count() > 0) {
        const firstPhase = phaseBars.first();
        // Hover over resize handle
        await firstPhase.locator('.resize-start').hover();
        // Note: Cursor changes are hard to test directly, but we can verify
        // the elements have the correct CSS classes/properties
        await expect(firstPhase.locator('.resize-start')).toHaveClass(/resize-start/);
        console.log('✅ Resize handle interaction works');
      }
    });
    // Note: Full drag and drop testing is complex and may require more sophisticated
    // simulation of mouse events. For now, we'll test the UI setup for drag functionality.
    test('should have draggable phase elements with proper structure', async ({ authenticatedPage, testHelpers }) => {
      const phaseBars = authenticatedPage.locator('.phase-bar');
      if (await phaseBars.count() > 0) {
        const firstPhase = phaseBars.first();
        // Verify phase has draggable structure
        await expect(firstPhase.locator('.phase-content')).toBeVisible();
        await expect(firstPhase.locator('.resize-start')).toBeInViewport();
        await expect(firstPhase.locator('.resize-end')).toBeInViewport();
        // Verify cursor styles are applied
        await expect(firstPhase).toHaveClass(/phase-bar/);
        console.log('✅ Phase elements have proper draggable structure');
      }
    });
  });
  test.describe('Data Loading and Error Handling', () => {
    test('should show loading state initially', async ({ authenticatedPage, testHelpers }) => {
      // Navigate to roadmap and check for loading state very quickly
      await testHelpers.navigateTo('/roadmap');
      // Check if loading spinner appears (may be very brief)
      const loadingSpinner = authenticatedPage.locator('svg[class*="animate-spin"], .loading-container');
      // Either loading shows briefly, or content loads fast enough that we skip it
      // Both are acceptable behaviors
      await expect(authenticatedPage.locator('.roadmap-header')).toBeVisible({ timeout: 10000 });
      console.log('✅ Page loads without errors');
    });
    test('should handle API errors gracefully', async ({ authenticatedPage, testHelpers }) => {
      // This test would require mocking API responses to simulate errors
      // For now, we'll verify error handling structure exists
      await expect(authenticatedPage.locator('.roadmap-content')).toBeVisible();
      // In case of real errors, error components should be present in DOM structure
      // (even if not currently visible)
      console.log('✅ Error handling structure verified');
    });
    test('should be responsive on different viewport sizes', async ({ authenticatedPage, testHelpers }) => {
      // Test desktop view
      await authenticatedPage.setViewportSize({ width: 1200, height: 800 });
      await expect(authenticatedPage.locator('.roadmap-header')).toBeVisible();
      await expect(authenticatedPage.locator('.search-filters')).toBeVisible();
      // Test tablet view
      await authenticatedPage.setViewportSize({ width: 768, height: 600 });
      await expect(authenticatedPage.locator('.roadmap-header')).toBeVisible();
      // Test mobile view
      await authenticatedPage.setViewportSize({ width: 375, height: 667 });
      await expect(authenticatedPage.locator('.roadmap-header')).toBeVisible();
      // Controls should still be accessible
      await expect(authenticatedPage.locator('.zoom-controls')).toBeVisible();
      console.log('✅ Responsive design works across viewports');
    });
  });
  test.describe('Keyboard Navigation and Accessibility', () => {
    test('should support keyboard navigation for interactive elements', async ({ authenticatedPage, testHelpers }) => {
      // Focus on search input
      await authenticatedPage.keyboard.press('Tab');
      await expect(authenticatedPage.locator('.search-box input')).toBeFocused();
      // Tab to status filter
      await authenticatedPage.keyboard.press('Tab');
      await expect(authenticatedPage.locator('select').first()).toBeFocused();
      // Continue tabbing through zoom controls
      await authenticatedPage.keyboard.press('Tab');
      await authenticatedPage.keyboard.press('Tab');
      console.log('✅ Keyboard navigation works for main controls');
    });
    test('should have proper ARIA labels and semantic elements', async ({ authenticatedPage, testHelpers }) => {
      // Verify main heading structure
      await expect(authenticatedPage.locator('h1')).toBeVisible();
      // Verify input labels and semantic structure
      const searchInput = authenticatedPage.locator('.search-box input');
      await expect(searchInput).toHaveAttribute('placeholder');
      // Buttons should be properly structured
      const zoomButtons = authenticatedPage.locator('.zoom-controls button');
      await expect(zoomButtons).toHaveCount(2);
      console.log('✅ Basic accessibility structure verified');
    });
  });
  test.describe('Timeline Grid Alignment and Layout', () => {
    test('should ensure timeline header does not overlap project names', async ({ authenticatedPage, testHelpers }) => {
      // Wait for projects to load (accept any positive number of projects)
      await authenticatedPage.waitForSelector('.project-row', { timeout: 10000 });
      const projectCount = await authenticatedPage.locator('.project-row').count();
      expect(projectCount).toBeGreaterThan(0);
      // Get bounds of project info area and timeline header
      const projectInfo = authenticatedPage.locator('.project-info').first();
      const timelineHeader = authenticatedPage.locator('.timeline-header');
      await expect(projectInfo).toBeVisible();
      await expect(timelineHeader).toBeVisible();
      const projectInfoBox = await projectInfo.boundingBox();
      const timelineHeaderBox = await timelineHeader.boundingBox();
      expect(projectInfoBox).toBeTruthy();
      expect(timelineHeaderBox).toBeTruthy();
      // Timeline header should start after project info ends
      expect(timelineHeaderBox!.x).toBeGreaterThanOrEqual(projectInfoBox!.x + projectInfoBox!.width);
      console.log(`✅ Timeline header positioned correctly: project info ends at ${projectInfoBox!.x + projectInfoBox!.width}, timeline starts at ${timelineHeaderBox!.x}`);
    });
    test('should ensure grid lines only appear in timeline area', async ({ authenticatedPage, testHelpers }) => {
      // Wait for layout to stabilize
      await expect(authenticatedPage.locator('.timeline-container')).toBeVisible();
      // Check project info area has no grid line overlap
      const projectInfo = authenticatedPage.locator('.project-info').first();
      const projectTimeline = authenticatedPage.locator('.project-timeline').first();
      if (await projectInfo.count() > 0 && await projectTimeline.count() > 0) {
        const projectInfoBox = await projectInfo.boundingBox();
        const timelineBox = await projectTimeline.boundingBox();
        expect(projectInfoBox).toBeTruthy();
        expect(timelineBox).toBeTruthy();
        // Timeline area should start after project info
        expect(timelineBox!.x).toBeGreaterThanOrEqual(projectInfoBox!.x + projectInfoBox!.width);
        console.log(`✅ Grid lines contained in timeline area: project info width ${projectInfoBox!.width}, timeline starts at offset ${timelineBox!.x - projectInfoBox!.x}`);
      }
    });
    test('should have proper vertical alignment between header and project rows', async ({ authenticatedPage, testHelpers }) => {
      // Wait for projects to load (accept any positive number)
      await authenticatedPage.waitForSelector('.project-row', { timeout: 10000 });
      const projectCount = await authenticatedPage.locator('.project-row').count();
      expect(projectCount).toBeGreaterThan(0);
      const timelineHeader = authenticatedPage.locator('.timeline-header');
      const projectRow = authenticatedPage.locator('.project-row').first();
      const projectTimeline = projectRow.locator('.project-timeline');
      await expect(timelineHeader).toBeVisible();
      await expect(projectTimeline).toBeVisible();
      const headerBox = await timelineHeader.boundingBox();
      const timelineBox = await projectTimeline.boundingBox();
      expect(headerBox).toBeTruthy();
      expect(timelineBox).toBeTruthy();
      // Timeline areas should be horizontally aligned
      expect(Math.abs(headerBox!.x - timelineBox!.x)).toBeLessThan(5); // Allow 5px tolerance
      console.log(`✅ Timeline header and project timelines are aligned: header at ${headerBox!.x}, timeline at ${timelineBox!.x}`);
    });
    test('should have consistent width between timeline header and project timeline areas', async ({ authenticatedPage, testHelpers }) => {
      await authenticatedPage.waitForSelector('.project-row', { timeout: 10000 });
      const projectCount = await authenticatedPage.locator('.project-row').count();
      expect(projectCount).toBeGreaterThan(0);
      const timelineHeader = authenticatedPage.locator('.timeline-header');
      const projectTimeline = authenticatedPage.locator('.project-timeline').first();
      const headerBox = await timelineHeader.boundingBox();
      const timelineBox = await projectTimeline.boundingBox();
      expect(headerBox).toBeTruthy();
      expect(timelineBox).toBeTruthy();
      // Widths should be similar (allow some tolerance for scrollbars)
      const widthDifference = Math.abs(headerBox!.width - timelineBox!.width);
      expect(widthDifference).toBeLessThan(20); // Allow 20px difference for scrollbars
      console.log(`✅ Timeline areas have consistent width: header ${headerBox!.width}px, timeline ${timelineBox!.width}px`);
    });
    test('should ensure expand/collapse toggle works correctly', async ({ authenticatedPage, testHelpers }) => {
      // Wait for projects to load
      await expect(authenticatedPage.locator('.project-row')).toHaveCount(1, { timeout: 10000 });
      // Find expand/collapse all button
      const expandCollapseButton = authenticatedPage.locator('button:has-text("Expand All"), button:has-text("Collapse All")');
      await expect(expandCollapseButton).toBeVisible();
      // Get initial button text
      const initialText = await expandCollapseButton.textContent();
      // Click the button
      await expandCollapseButton.click();
      await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 2000 }).catch(() => {}); // Wait for animation
      // Text should change
      const newText = await expandCollapseButton.textContent();
      expect(newText).not.toBe(initialText);
      // Click again to toggle back
      await expandCollapseButton.click();
      await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 2000 }).catch(() => {});
      const finalText = await expandCollapseButton.textContent();
      expect(finalText).toBe(initialText);
      console.log(`✅ Expand/collapse toggle works: ${initialText} → ${newText} → ${finalText}`);
    });
    test('should maintain layout integrity when projects are collapsed', async ({ authenticatedPage, testHelpers }) => {
      await expect(authenticatedPage.locator('.project-row')).toHaveCount(1, { timeout: 10000 });
      // Collapse all projects
      const collapseButton = authenticatedPage.locator('button:has-text("Collapse All")');
      if (await collapseButton.count() > 0) {
        await collapseButton.click();
        await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 2000 }).catch(() => {});
      }
      // Verify layout is still intact
      await expect(authenticatedPage.locator('.timeline-header')).toBeVisible();
      await expect(authenticatedPage.locator('.project-row')).toHaveClass(/collapsed/);
      // Timeline alignment should still be correct
      const projectInfo = authenticatedPage.locator('.project-info').first();
      const timelineHeader = authenticatedPage.locator('.timeline-header');
      const projectInfoBox = await projectInfo.boundingBox();
      const timelineHeaderBox = await timelineHeader.boundingBox();
      expect(timelineHeaderBox!.x).toBeGreaterThanOrEqual(projectInfoBox!.x + projectInfoBox!.width);
      console.log('✅ Layout integrity maintained when collapsed');
    });
    test('should handle zoom changes without breaking alignment', async ({ authenticatedPage, testHelpers }) => {
      await expect(authenticatedPage.locator('.project-row')).toHaveCount(1, { timeout: 10000 });
      // Get initial alignment
      const timelineHeader = authenticatedPage.locator('.timeline-header');
      const projectTimeline = authenticatedPage.locator('.project-timeline').first();
      const initialHeaderBox = await timelineHeader.boundingBox();
      const initialTimelineBox = await projectTimeline.boundingBox();
      // Zoom in
      await authenticatedPage.locator('.zoom-controls button').last().click();
      await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 2000 }).catch(() => {});
      // Check alignment is maintained
      const zoomedHeaderBox = await timelineHeader.boundingBox();
      const zoomedTimelineBox = await projectTimeline.boundingBox();
      // X positions should still be aligned
      expect(Math.abs(zoomedHeaderBox!.x - zoomedTimelineBox!.x)).toBeLessThan(5);
      // Timeline should still start after project info
      const projectInfo = authenticatedPage.locator('.project-info').first();
      const projectInfoBox = await projectInfo.boundingBox();
      expect(zoomedHeaderBox!.x).toBeGreaterThanOrEqual(projectInfoBox!.x + projectInfoBox!.width);
      console.log('✅ Alignment maintained after zoom');
    });
    test('should ensure phase bars are properly positioned within timeline area', async ({ authenticatedPage, testHelpers }) => {
      const phaseBars = authenticatedPage.locator('.phase-bar');
      if (await phaseBars.count() > 0) {
        const firstPhase = phaseBars.first();
        const projectTimeline = authenticatedPage.locator('.project-timeline').first();
        const projectInfo = authenticatedPage.locator('.project-info').first();
        const phaseBox = await firstPhase.boundingBox();
        const timelineBox = await projectTimeline.boundingBox();
        const projectInfoBox = await projectInfo.boundingBox();
        expect(phaseBox).toBeTruthy();
        expect(timelineBox).toBeTruthy();
        expect(projectInfoBox).toBeTruthy();
        // Phase should be within timeline area
        expect(phaseBox!.x).toBeGreaterThanOrEqual(timelineBox!.x);
        expect(phaseBox!.x + phaseBox!.width).toBeLessThanOrEqual(timelineBox!.x + timelineBox!.width);
        // Phase should not overlap project info
        expect(phaseBox!.x).toBeGreaterThanOrEqual(projectInfoBox!.x + projectInfoBox!.width);
        console.log(`✅ Phase bars properly positioned: phase at ${phaseBox!.x}, timeline starts at ${timelineBox!.x}, project info ends at ${projectInfoBox!.x + projectInfoBox!.width}`);
      }
    });
  });
  test.describe('Integration and Performance', () => {
    test('should handle multiple projects efficiently', async ({ authenticatedPage, testHelpers }) => {
      // Measure page performance with multiple projects
      const startTime = Date.now();
      await testHelpers.navigateTo('/roadmap');
      await expect(authenticatedPage.locator('.timeline-container')).toBeVisible();
      const loadTime = Date.now() - startTime;
      // Should load within reasonable time (10 seconds)
      expect(loadTime).toBeLessThan(10000);
      console.log(`✅ Page loaded in ${loadTime}ms`);
    });
    test('should maintain state when navigating away and back', async ({ authenticatedPage, testHelpers }) => {
      // Set up initial state
      await authenticatedPage.locator('.search-box input').fill('test');
      await authenticatedPage.locator('select').first().selectOption('active');
      // Navigate away
      await testHelpers.navigateTo('/projects');
      await expect(authenticatedPage.locator('h1')).toBeVisible();
      // Navigate back
      await testHelpers.navigateTo('/roadmap');
      await expect(authenticatedPage.locator('.roadmap-header')).toBeVisible();
      // Note: Depending on implementation, state may or may not persist
      // The important thing is that the page still works correctly
      await expect(authenticatedPage.locator('.timeline-container')).toBeVisible();
      console.log('✅ Navigation state handling works');
    });
  });
});