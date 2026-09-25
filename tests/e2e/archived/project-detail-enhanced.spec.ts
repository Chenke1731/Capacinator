/**
 * Enhanced E2E Tests: ProjectDetail Page Interactions & Visual Testing
 * 
 * This test suite covers comprehensive user interactions with the ProjectDetail page,
 * including inline editing, modal operations, section navigation, and visual regression testing.
 */
import { test, expect, tags } from '../../fixtures';
import { TestDataContext } from '../../utils/test-data-helpers';

test.describe('ProjectDetail Enhanced UI Tests', () => {
  let testContext: TestDataContext;
  let testProject: any;
  let testPerson: any;
  let testAssignment: any;

  test.beforeEach(async ({ testDataHelpers, testHelpers }) => {
    // Create isolated test context
    testContext = testDataHelpers.createTestContext('project-detail-enhanced');
    
    // Create a comprehensive test project with all data
    testProject = await testDataHelpers.createTestProject(testContext, {
      name: 'Enhanced UI Test Project',
      description: 'Project for testing complete UI interactions',
      priority: 2, // High priority
      aspiration_start: '2024-01-01',
      aspiration_finish: '2024-12-31'
    });

    // Create test person for assignments
    testPerson = await testDataHelpers.createTestPerson(testContext, {
      firstName: 'Alice',
      lastName: 'Johnson',
      email: 'alice.johnson@test.com'
    });

    // Create test assignment
    testAssignment = await testDataHelpers.createTestAssignment(testContext, {
      personId: testPerson.id,
      projectId: testProject.id,
      roleId: testContext.seedData.roles[0].id,
      allocation: 0.75,
      startDate: '2024-01-01',
      endDate: '2024-06-30'
    });

    await testHelpers.setupPage();
  });

  test.afterEach(async ({ testDataHelpers }) => {
    await testDataHelpers.cleanupTestContext(testContext);
  });

  test(`${tags.ui} should display project detail page layout correctly`, async ({
    authenticatedPage,
    testHelpers
  }) => {
    await testHelpers.navigateTo(`/projects/${testProject.id}`);
    await testHelpers.waitForPageLoad();

    // Wait for project data to load
    await authenticatedPage.waitForSelector('h1', { timeout: 10000 });

    // Verify page structure
    await expect(authenticatedPage.locator('h1')).toContainText('Enhanced UI Test Project');
    
    // Verify priority badge
    await expect(authenticatedPage.locator('.badge')).toContainText('High');
    
    // Verify all sections are present
    await expect(authenticatedPage.locator('text=Project Information')).toBeVisible();
    await expect(authenticatedPage.locator('text=Project Timeline')).toBeVisible();
    await expect(authenticatedPage.locator('text=Resource Demand')).toBeVisible();
    await expect(authenticatedPage.locator('text=Team Assignments')).toBeVisible();
    await expect(authenticatedPage.locator('text=History')).toBeVisible();
  });

  test(`${tags.ui} should handle section expand/collapse interactions`, async ({
    authenticatedPage,
    testHelpers
  }) => {
    await testHelpers.navigateTo(`/projects/${testProject.id}`);
    await testHelpers.waitForPageLoad();

    await authenticatedPage.waitForSelector('h1', { timeout: 10000 });

    // Test Project Information section (should start expanded)
    const projectInfoSection = authenticatedPage.locator('text=Project Information');
    await expect(projectInfoSection).toBeVisible();
    
    // Verify content is visible
    await expect(authenticatedPage.locator('text=Enhanced UI Test Project')).toBeVisible();
    
    // Click to collapse
    await projectInfoSection.click();
    await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
    
    // Content should be hidden
    const descriptionField = authenticatedPage.locator('textarea, input[value*="Enhanced UI Test Project"]');
    await expect(descriptionField).not.toBeVisible();
    
    // Click to expand again
    await projectInfoSection.click();
    await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
    
    // Content should be visible again
    await expect(authenticatedPage.locator('text=Project for testing complete UI interactions')).toBeVisible();

    // Test History section (should start collapsed)
    const historySection = authenticatedPage.locator('text=History');
    await expect(historySection).toBeVisible();
    
    // History content should not be visible initially
    await expect(authenticatedPage.locator('text=Project created')).not.toBeVisible();
    
    // Click to expand
    await historySection.click();
    await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
    
    // History content should now be visible
    await expect(authenticatedPage.locator('text=Project created')).toBeVisible();
    await expect(authenticatedPage.locator('text=Last updated')).toBeVisible();
  });

  test(`${tags.ui} should handle inline editing interactions`, async ({
    authenticatedPage,
    testHelpers
  }) => {
    await testHelpers.navigateTo(`/projects/${testProject.id}`);
    await testHelpers.waitForPageLoad();

    await authenticatedPage.waitForSelector('h1', { timeout: 10000 });

    // Test description field inline editing
    const descriptionText = authenticatedPage.locator('text=Project for testing complete UI interactions');
    await expect(descriptionText).toBeVisible();
    
    // Click to edit
    await descriptionText.click();
    await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
    
    // Should show textarea for editing
    const textareaField = authenticatedPage.locator('textarea');
    await expect(textareaField).toBeVisible();
    
    // Clear and type new description
    await textareaField.fill('Updated project description for UI testing');
    
    // Press Enter to save (or blur)
    await textareaField.blur();
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    
    // Should show updated text
    await expect(authenticatedPage.locator('text=Updated project description for UI testing')).toBeVisible();
  });

  test(`${tags.ui} should handle assignment modal interactions`, async ({
    authenticatedPage,
    testHelpers
  }) => {
    await testHelpers.navigateTo(`/projects/${testProject.id}`);
    await testHelpers.waitForPageLoad();

    await authenticatedPage.waitForSelector('h1', { timeout: 10000 });

    // Expand assignments section if needed
    const assignmentsSection = authenticatedPage.locator('text=Team Assignments');
    await assignmentsSection.click();
    await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});

    // Find and click on assignment row
    const assignmentRow = authenticatedPage.locator('text=Alice Johnson').locator('..').locator('..');
    await expect(assignmentRow).toBeVisible();
    await assignmentRow.click();

    // Modal should open
    await expect(authenticatedPage.locator('text=Assignment Details')).toBeVisible();
    
    // Verify assignment details are shown
    await expect(authenticatedPage.locator('text=Alice Johnson')).toBeVisible();
    await expect(authenticatedPage.locator('text=75%')).toBeVisible();
    
    // Click Edit button
    await authenticatedPage.locator('text=Edit').click();
    await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
    
    // Should show editing form
    await expect(authenticatedPage.locator('text=Edit Assignment')).toBeVisible();
    
    // Update allocation percentage
    const allocationInput = authenticatedPage.locator('input[type="number"]');
    await allocationInput.fill('80');
    
    // Save changes
    await authenticatedPage.locator('text=Save Changes').click();
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    
    // Modal should close and changes should be reflected
    await expect(authenticatedPage.locator('text=Assignment Details')).not.toBeVisible();
    await expect(authenticatedPage.locator('text=80%')).toBeVisible();
  });

  test(`${tags.ui} should handle timeline component integration`, async ({
    authenticatedPage,
    testHelpers
  }) => {
    await testHelpers.navigateTo(`/projects/${testProject.id}`);
    await testHelpers.waitForPageLoad();

    await authenticatedPage.waitForSelector('h1', { timeout: 10000 });

    // Expand timeline section
    const timelineSection = authenticatedPage.locator('text=Project Timeline');
    await timelineSection.click();
    await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});

    // Timeline component should be visible
    const timelineComponent = authenticatedPage.locator('[data-testid="unified-timeline"], .unified-project-timeline, .timeline, .project-timeline').first();
    await expect(timelineComponent).toBeVisible();
    
    // Should show project phases or timeline content
    // Note: This depends on the actual timeline implementation
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {}); // Allow timeline to load
  });

  test(`${tags.ui} should handle demand chart integration`, async ({
    authenticatedPage,
    testHelpers
  }) => {
    await testHelpers.navigateTo(`/projects/${testProject.id}`);
    await testHelpers.waitForPageLoad();

    await authenticatedPage.waitForSelector('h1', { timeout: 10000 });

    // Expand demand section
    const demandSection = authenticatedPage.locator('text=Resource Demand');
    await demandSection.click();
    await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});

    // Demand chart should be visible
    const demandChart = authenticatedPage.locator('[data-testid="demand-chart"], .demand-chart, .chart-container').first();
    await expect(demandChart).toBeVisible();
    
    // Allow chart to load
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  });

  test(`${tags.ui} should handle navigation interactions`, async ({
    authenticatedPage,
    testHelpers
  }) => {
    await testHelpers.navigateTo(`/projects/${testProject.id}`);
    await testHelpers.waitForPageLoad();

    await authenticatedPage.waitForSelector('h1', { timeout: 10000 });

    // Test back button navigation
    const backButton = authenticatedPage.locator('button').first(); // First button should be back
    await backButton.click();
    
    // Should navigate back to projects list
    await authenticatedPage.waitForURL('**/projects');
    await expect(authenticatedPage.locator('h1')).toContainText('Projects');
    
    // Navigate back to project detail
    await testHelpers.navigateTo(`/projects/${testProject.id}`);
    await testHelpers.waitForPageLoad();
    
    // Test person link navigation
    const assignmentsSection = authenticatedPage.locator('text=Team Assignments');
    await assignmentsSection.click();
    await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
    
    const personLink = authenticatedPage.locator('a', { hasText: 'Alice Johnson' });
    if (await personLink.isVisible()) {
      // Person link should have correct href
      await expect(personLink).toHaveAttribute('href', new RegExp(`/people/${testPerson.id}`));
    }
  });

  test(`${tags.visual} should take baseline screenshots for visual regression`, async ({
    authenticatedPage,
    testHelpers
  }) => {
    await testHelpers.navigateTo(`/projects/${testProject.id}`);
    await testHelpers.waitForPageLoad();

    await authenticatedPage.waitForSelector('h1', { timeout: 10000 });
    
    // Wait for all content to load
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

    // Take full page screenshot
    await expect(authenticatedPage).toHaveScreenshot('project-detail-full-page.png', {
      fullPage: true,
      threshold: 0.2, // Allow for small differences
      maxDiffPixels: 1000
    });

    // Take screenshots of individual sections
    
    // Project Information section
    const projectInfoSection = authenticatedPage.locator('.detail-section').first();
    await expect(projectInfoSection).toHaveScreenshot('project-detail-info-section.png', {
      threshold: 0.2
    });

    // Assignments section
    const assignmentsSection = authenticatedPage.locator('text=Team Assignments');
    await assignmentsSection.click();
    await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
    
    const assignmentsContainer = authenticatedPage.locator('.detail-section').nth(3); // Assuming 4th section
    await expect(assignmentsContainer).toHaveScreenshot('project-detail-assignments-section.png', {
      threshold: 0.2
    });

    // Timeline section
    const timelineSection = authenticatedPage.locator('text=Project Timeline');
    await timelineSection.click();
    await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
    
    const timelineContainer = authenticatedPage.locator('.detail-section').nth(1); // Assuming 2nd section
    await expect(timelineContainer).toHaveScreenshot('project-detail-timeline-section.png', {
      threshold: 0.2
    });
  });

  test(`${tags.visual} should capture assignment modal screenshots`, async ({
    authenticatedPage,
    testHelpers
  }) => {
    await testHelpers.navigateTo(`/projects/${testProject.id}`);
    await testHelpers.waitForPageLoad();

    await authenticatedPage.waitForSelector('h1', { timeout: 10000 });

    // Open assignment modal
    const assignmentsSection = authenticatedPage.locator('text=Team Assignments');
    await assignmentsSection.click();
    await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});

    const assignmentRow = authenticatedPage.locator('text=Alice Johnson').locator('..').locator('..');
    await assignmentRow.click();
    
    // Wait for modal to open
    await expect(authenticatedPage.locator('text=Assignment Details')).toBeVisible();
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

    // Screenshot modal in view mode
    const modal = authenticatedPage.locator('.modal-content');
    await expect(modal).toHaveScreenshot('assignment-modal-view.png', {
      threshold: 0.2
    });

    // Switch to edit mode
    await authenticatedPage.locator('text=Edit').click();
    await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});

    // Screenshot modal in edit mode
    await expect(modal).toHaveScreenshot('assignment-modal-edit.png', {
      threshold: 0.2
    });
  });

  test(`${tags.performance} should load project detail page within performance budget`, async ({
    authenticatedPage,
    testHelpers
  }) => {
    // Start timing
    const startTime = Date.now();
    
    await testHelpers.navigateTo(`/projects/${testProject.id}`);
    await testHelpers.waitForPageLoad();

    // Wait for critical content to load
    await authenticatedPage.waitForSelector('h1', { timeout: 10000 });
    await authenticatedPage.waitForSelector('text=Project Information', { timeout: 5000 });
    
    const loadTime = Date.now() - startTime;
    
    // Should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
    
    // Check for console errors that might indicate performance issues
    const logs = [];
    authenticatedPage.on('console', msg => {
      if (msg.type() === 'error') {
        logs.push(msg.text());
      }
    });
    
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {}); // Allow any async operations to complete
    
    // Should not have any console errors
    expect(logs.filter(log => !log.includes('404'))).toHaveLength(0); // Ignore 404s
  });

  test(`${tags.accessibility} should be keyboard navigable`, async ({
    authenticatedPage,
    testHelpers
  }) => {
    await testHelpers.navigateTo(`/projects/${testProject.id}`);
    await testHelpers.waitForPageLoad();

    await authenticatedPage.waitForSelector('h1', { timeout: 10000 });

    // Test keyboard navigation through sections
    await authenticatedPage.keyboard.press('Tab'); // Should focus first interactive element
    
    // Navigate to section headers and test Enter key
    const projectInfoHeader = authenticatedPage.locator('text=Project Information');
    await projectInfoHeader.focus();
    await authenticatedPage.keyboard.press('Enter');
    await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
    
    // Test Tab navigation to editable fields
    await authenticatedPage.keyboard.press('Tab');
    await authenticatedPage.keyboard.press('Tab');
    
    // Should be able to reach the assignments section
    const assignmentsHeader = authenticatedPage.locator('text=Team Assignments');
    await assignmentsHeader.focus();
    await authenticatedPage.keyboard.press('Enter');
    await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
    
    // Test Escape key to close modal (if one opens)
    const assignmentRow = authenticatedPage.locator('text=Alice Johnson').locator('..').locator('..');
    if (await assignmentRow.isVisible()) {
      await assignmentRow.click();
      await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
      
      if (await authenticatedPage.locator('text=Assignment Details').isVisible()) {
        await authenticatedPage.keyboard.press('Escape');
        await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
        
        // Modal should close
        await expect(authenticatedPage.locator('text=Assignment Details')).not.toBeVisible();
      }
    }
  });
});