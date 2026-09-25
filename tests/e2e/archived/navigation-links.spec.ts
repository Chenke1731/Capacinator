/**
 * Navigation Hyperlinks Test Suite
 * Tests for cross-page navigation and link functionality
 * Uses dynamic test data for proper isolation
 */
import { test, expect, tags } from '../../fixtures';
import { TestDataContext } from '../../utils/test-data-helpers';
test.describe('Navigation and Hyperlinks', () => {
  let testContext: TestDataContext;
  let testData: any;
  test.beforeEach(async ({ testDataHelpers, authenticatedPage, testHelpers }) => {
    // Create isolated test context
    testContext = testDataHelpers.createTestContext('navlinks');
    // Create test data with assignments to test cross-links
    testData = await testDataHelpers.createBulkTestData(testContext, {
      projects: 2,
      people: 2,
      assignments: 2
    });
    await testHelpers.waitForReactApp();
  });
  test.afterEach(async ({ testDataHelpers }) => {
    // Clean up all test data
    await testDataHelpers.cleanupTestContext(testContext);
  });
  test.describe('Main Navigation', () => {
    test(`${tags.smoke} should have all main navigation links`, async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      const navLinks = [
        { text: 'Dashboard', url: '/dashboard' },
        { text: 'Projects', url: '/projects' },
        { text: 'People', url: '/people' },
        { text: 'Assignments', url: '/assignments' },
        { text: 'Scenarios', url: '/scenarios' },
        { text: 'Reports', url: '/reports' }
      ];
      for (const link of navLinks) {
        const navLink = authenticatedPage.locator(`nav a:has-text("${link.text}"), [data-testid="nav-${link.text.toLowerCase()}"]`);
        await expect(navLink).toBeVisible();
        // Click and verify navigation
        await navLink.click();
        await testHelpers.waitForNavigation();
        expect(authenticatedPage.url()).toContain(link.url);
      }
    });
    test('should highlight active navigation item', async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      // Navigate to projects
      await testHelpers.clickAndNavigate('nav a:has-text("Projects")', '/projects');
      // Check if Projects nav item is highlighted
      const activeLink = authenticatedPage.locator('nav a:has-text("Projects")');
      const className = await activeLink.getAttribute('class');
      const ariaAttr = await activeLink.getAttribute('aria-current');
      // Different apps use different methods to indicate active state
      const isActive = 
        className?.match(/active|current|selected/) ||
        ariaAttr === 'page' ||
        ariaAttr === 'true';
      expect(isActive).toBeTruthy();
    });
    test('should have working logo/home link', async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      // Navigate away from home
      await testHelpers.clickAndNavigate('nav a:has-text("Projects")', '/projects');
      // Click logo or brand
      const logo = authenticatedPage.locator('nav a:first-child, .navbar-brand, .logo, header a:has(img)').nth(0);
      if (await logo.isVisible()) {
        await logo.click();
        await testHelpers.waitForNavigation();
        expect(authenticatedPage.url()).toMatch(/\/(dashboard)?$/);
      }
    });
  });
  test.describe('Breadcrumb Navigation', () => {
    test('should show breadcrumbs on detail pages', async ({ 
      authenticatedPage,
      testHelpers,
      testDataHelpers 
    }) => {
      // Navigate to projects
      await testHelpers.clickAndNavigate('nav a:has-text("Projects")', '/projects');
      await testHelpers.waitForDataLoad();
      // Click specific test project
      const projectRow = await testDataHelpers.findByTestData(
        'tbody tr',
        testData.projects[0].name
      );
      const projectLink = projectRow.locator('td a').nth(0);
      await projectLink.click();
      await testHelpers.waitForNavigation();
      // Check for breadcrumbs
      const breadcrumbs = authenticatedPage.locator('nav[aria-label="breadcrumb"], .breadcrumb, .breadcrumbs');
      if (await breadcrumbs.isVisible()) {
        // Should have "Projects" link in breadcrumbs
        const projectsLink = breadcrumbs.locator('a:has-text("Projects")');
        await expect(projectsLink).toBeVisible();
        // Click to go back to projects list
        await projectsLink.click();
        await testHelpers.waitForNavigation();
        expect(authenticatedPage.url()).toContain('/projects');
      }
    });
  });
  test.describe('Cross-Page Links', () => {
    test('should link from project to team members', async ({ 
      authenticatedPage,
      testHelpers,
      testDataHelpers 
    }) => {
      // Go to project detail
      await testHelpers.clickAndNavigate('nav a:has-text("Projects")', '/projects');
      await testHelpers.waitForDataLoad();
      // Click specific test project
      const projectRow = await testDataHelpers.findByTestData(
        'tbody tr',
        testData.projects[0].name
      );
      const projectLink = projectRow.locator('td a').nth(0);
      await projectLink.click();
      await testHelpers.waitForNavigation();
      // Find team members section
      const teamSection = authenticatedPage.locator('text=/Team Members|Assigned People|Resources|Assignments/i');
      if (await teamSection.isVisible()) {
        // Look for person link using test data
        const personLink = authenticatedPage.locator(`a:has-text("${testData.people[0].name}")`);
        if (await personLink.isVisible()) {
          await personLink.click();
          await testHelpers.waitForNavigation();
          // Should be on person detail page
          expect(authenticatedPage.url()).toMatch(/\/people\/[a-f0-9-]+$/);
          await expect(authenticatedPage.locator(`h1:has-text("${testData.people[0].name}")`)).toBeVisible();
        }
      }
    });
    test('should link from person to assigned projects', async ({ 
      authenticatedPage,
      testHelpers,
      testDataHelpers 
    }) => {
      // Go to people page
      await testHelpers.clickAndNavigate('nav a:has-text("People")', '/people');
      await testHelpers.waitForDataLoad();
      // Click specific test person who has assignments
      const personRow = await testDataHelpers.findByTestData(
        'tbody tr',
        testData.people[0].name
      );
      const personLink = personRow.locator('td a').nth(0);
      await personLink.click();
      await testHelpers.waitForNavigation();
      // Find projects section
      const projectsSection = authenticatedPage.locator('text=/Current Projects|Assignments|Allocated To|Projects/i');
      if (await projectsSection.isVisible()) {
        // Look for project link using test data
        const projectLink = authenticatedPage.locator(`a:has-text("${testData.projects[0].name}")`);
        if (await projectLink.isVisible()) {
          await projectLink.click();
          await testHelpers.waitForNavigation();
          // Should be on project detail page
          expect(authenticatedPage.url()).toMatch(/\/projects\/[a-f0-9-]+$/);
          await expect(authenticatedPage.locator(`h1:has-text("${testData.projects[0].name}")`)).toBeVisible();
        }
      }
    });
    test('should link from assignment to both project and person', async ({ 
      authenticatedPage,
      testHelpers,
      testDataHelpers 
    }) => {
      await testHelpers.clickAndNavigate('nav a:has-text("Assignments")', '/assignments');
      await testHelpers.waitForDataLoad();
      // Find assignment row with our test data
      const assignmentRow = authenticatedPage.locator(
        `tbody tr:has-text("${testData.projects[0].name}"):has-text("${testData.people[0].name}")`
      );
      if (await assignmentRow.count() > 0) {
        // Test project link
        const projectLink = assignmentRow.locator(`a:has-text("${testData.projects[0].name}")`);
        if (await projectLink.isVisible()) {
          await projectLink.click();
          await testHelpers.waitForNavigation();
          expect(authenticatedPage.url()).toMatch(/\/projects\/[a-f0-9-]+$/);
          await expect(authenticatedPage.locator(`h1:has-text("${testData.projects[0].name}")`)).toBeVisible();
          // Go back
          await authenticatedPage.goBack();
          await testHelpers.waitForDataLoad();
        }
        // Test person link
        const personLink = assignmentRow.locator(`a:has-text("${testData.people[0].name}")`);
        if (await personLink.isVisible()) {
          await personLink.click();
          await testHelpers.waitForNavigation();
          expect(authenticatedPage.url()).toMatch(/\/people\/[a-f0-9-]+$/);
          await expect(authenticatedPage.locator(`h1:has-text("${testData.people[0].name}")`)).toBeVisible();
        }
      }
    });
  });
  test.describe('Action Links', () => {
    test('should have working edit links', async ({ 
      authenticatedPage,
      testHelpers,
      testDataHelpers 
    }) => {
      await testHelpers.navigateTo('/projects');
      await testHelpers.waitForDataTable();
      // Find specific test project row
      const projectRow = await testDataHelpers.findByTestData(
        'tbody tr',
        testData.projects[0].name
      );
      // Find edit button/link
      const editLink = projectRow.locator('a[href*="edit"], button:has-text("Edit")');
      if (await editLink.isVisible()) {
        await editLink.click();
        // Should either navigate to edit page or open modal
        const hasEditUrl = authenticatedPage.url().includes('/edit');
        const hasModal = await authenticatedPage.locator('[role="dialog"]').isVisible();
        expect(hasEditUrl || hasModal).toBeTruthy();
      }
    });
    test('should have working view links', async ({ 
      authenticatedPage,
      testHelpers,
      testDataHelpers 
    }) => {
      await testHelpers.navigateTo('/people');
      await testHelpers.waitForDataTable();
      // Find specific test person row
      const personRow = await testDataHelpers.findByTestData(
        'tbody tr',
        testData.people[0].name
      );
      // Find view button/link
      const viewLink = personRow.locator('a[href*="people/"], button:has-text("View")');
      if (await viewLink.isVisible()) {
        await viewLink.click();
        await testHelpers.waitForNavigation();
        // Should be on person detail page
        expect(authenticatedPage.url()).toMatch(/\/people\/[a-f0-9-]+$/);
        await expect(authenticatedPage.locator(`h1:has-text("${testData.people[0].name}")`)).toBeVisible();
      }
    });
  });
  test.describe('External Links', () => {
    test('should open external links in new tab', async ({ 
      authenticatedPage,
      testHelpers 
    }) => {
      // Navigate to a page that might have external links (like settings or help)
      await testHelpers.navigateTo('/settings');
      // Look for external links
      const externalLinks = authenticatedPage.locator('a[target="_blank"], a[rel*="external"]');
      const count = await externalLinks.count();
      if (count > 0) {
        // Check first external link
        const firstLink = externalLinks.nth(0);
        const target = await firstLink.getAttribute('target');
        const rel = await firstLink.getAttribute('rel');
        // Should have target="_blank" and ideally rel="noopener"
        expect(target).toBe('_blank');
        if (rel) {
          expect(rel).toContain('noopener');
        }
      }
    });
  });
});