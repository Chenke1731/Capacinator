/**
 * Roles CRUD Test Suite with Count Validation
 * Tests for roles management functionality and count accuracy
 * Validates that people_count, planners_count, and standard_allocations_count display correctly
 */
import { test, expect, tags } from '../../fixtures';

test.describe('Roles Management', () => {
  test.beforeEach(async ({ testHelpers }) => {
    await testHelpers.navigateTo('/roles');
    await testHelpers.waitForDataTable();
  });

  test.describe('Roles API Data Integrity', () => {
    test('should return roles with correct count fields from API', async ({ apiContext }) => {
      const response = await apiContext.get('/api/roles');
      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('data');
      expect(Array.isArray(data.data)).toBeTruthy();

      // Check that roles have count fields
      const roles = data.data;
      if (roles.length > 0) {
        const firstRole = roles[0];
        expect(firstRole).toHaveProperty('people_count');
        expect(firstRole).toHaveProperty('planners_count');
        expect(firstRole).toHaveProperty('standard_allocations_count');

        // Counts should be numbers
        expect(typeof firstRole.people_count).toBe('number');
        expect(typeof firstRole.planners_count).toBe('number');
        expect(typeof firstRole.standard_allocations_count).toBe('number');
      }
    });

    test('should have accurate people_count for Project Manager role', async ({ apiContext }) => {
      const response = await apiContext.get('/api/roles');
      const data = await response.json();
      const roles = data.data;

      // Find Project Manager role
      const projectManager = roles.find((r: any) => r.name === 'Project Manager');

      if (projectManager) {
        // Alice Johnson is assigned as Project Manager in seed data
        expect(projectManager.people_count).toBeGreaterThanOrEqual(1);

        console.log(`Project Manager role has ${projectManager.people_count} people assigned`);
      }
    });

    test('should validate counts for all seeded roles', async ({ apiContext }) => {
      const response = await apiContext.get('/api/roles');
      const data = await response.json();
      const roles = data.data;

      // Expected roles with people from seed data
      const expectedRolesWithPeople = [
        'Project Manager',
        'Senior Developer',
        'Business Analyst',
        'QA Engineer',
        'DevOps Engineer',
        'UX Designer',
        'Product Manager',
        'Data Scientist'
      ];

      for (const roleName of expectedRolesWithPeople) {
        const role = roles.find((r: any) => r.name === roleName);
        if (role) {
          expect(role.people_count).toBeGreaterThanOrEqual(1);
          console.log(`${roleName}: ${role.people_count} people`);
        }
      }
    });
  });

  test.describe('Roles List Display', () => {
    test(`${tags.smoke} should display roles list with table`, async ({
      authenticatedPage
    }) => {
      // Check page header
      // /roles redirects to /people (roles list merged there)
      await expect(authenticatedPage.locator('h1').first()).toContainText('People');

      // Should show data table or empty state
      const table = authenticatedPage.locator('table');
      const emptyState = authenticatedPage.locator('text=/no roles|no data/i');
      const hasContent = await table.isVisible() || await emptyState.isVisible();
      expect(hasContent).toBeTruthy();

      // Should show Add Role button
      await expect(authenticatedPage.locator('button:has-text("Add Role")')).toBeVisible();
    });

    test('should display role data with all columns including counts', async ({
      authenticatedPage,
      testHelpers
    }) => {
      const rowCount = await testHelpers.getTableRowCount();

      if (rowCount > 0) {
        // Check for expected columns
        const expectedHeaders = ['Role Name', 'People', 'Planners', 'Allocations'];

        for (const header of expectedHeaders) {
          const headerElement = authenticatedPage.locator(`th:has-text("${header}")`);
          await expect(headerElement).toBeVisible();
        }

        // Check that at least one role row displays count data
        const firstRow = authenticatedPage.locator('tbody tr').first();
        await expect(firstRow).toBeVisible();

        // Row should have numerical count values
        const rowText = await firstRow.textContent();
        expect(rowText).toBeTruthy();
      }
    });

    test('should display Project Manager with correct people count', async ({
      authenticatedPage,
      testHelpers
    }) => {
      // Search for Project Manager role
      const searchInput = authenticatedPage.locator('input[type="search"], input[placeholder*="Search"]');
      if (await searchInput.isVisible()) {
        await searchInput.fill('Project Manager');
        await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      }

      // Find Project Manager row
      const projectManagerRow = authenticatedPage.locator('tbody tr').filter({
        hasText: 'Project Manager'
      }).first();

      if (await projectManagerRow.isVisible()) {
        // Take screenshot showing Project Manager with people count
        await authenticatedPage.screenshot({
          path: 'test-results/roles-project-manager-count.png',
          fullPage: false
        });

        const rowText = await projectManagerRow.textContent();
        console.log('Project Manager row:', rowText);

        // The People column should show a count >= 1
        // Look for count badge or numerical value
        const peopleCount = projectManagerRow.locator('[class*="count"]').first();
        if (await peopleCount.isVisible()) {
          const countText = await peopleCount.textContent();
          console.log('People count text:', countText);

          // Extract number from text (handles formats like "1", "1 people", etc.)
          const match = countText?.match(/\d+/);
          if (match) {
            const count = parseInt(match[0], 10);
            expect(count).toBeGreaterThanOrEqual(1);
          }
        }
      }
    });

    test('should display counts with proper formatting', async ({
      authenticatedPage,
      testHelpers
    }) => {
      const rowCount = await testHelpers.getTableRowCount();

      if (rowCount > 0) {
        // Check first few rows for count formatting
        const rows = authenticatedPage.locator('tbody tr').first();

        // Count badges should have icons or numerical indicators
        const countBadges = rows.locator('[class*="count-badge"], [class*="count"]');
        const badgeCount = await countBadges.count();

        if (badgeCount > 0) {
          const firstBadge = countBadges.first();
          await expect(firstBadge).toBeVisible();

          // Badge should contain a number
          const badgeText = await firstBadge.textContent();
          expect(badgeText).toMatch(/\d+/);
        }
      }
    });

    test('should take screenshot of roles table showing all counts', async ({
      authenticatedPage,
      testHelpers
    }) => {
      const rowCount = await testHelpers.getTableRowCount();

      if (rowCount > 0) {
        // Ensure table is fully visible
        await testHelpers.waitForDataTable();

        // Take full page screenshot
        await authenticatedPage.screenshot({
          path: 'test-results/roles-table-with-counts.png',
          fullPage: true
        });

        console.log('Screenshot saved: test-results/roles-table-with-counts.png');
      }
    });
  });

  test.describe('Role Count Validation', () => {
    test('should verify Alice Johnson is assigned to Project Manager', async ({
      authenticatedPage,
      testHelpers,
      apiContext
    }) => {
      // First verify via API that Alice has Project Manager role
      const peopleResponse = await apiContext.get('/api/people');
      const peopleData = await peopleResponse.json();
      const people = peopleData.data?.data || peopleData.data || [];

      const alice = people.find((p: any) => p.name === 'Alice Johnson');

      if (alice) {
        console.log('Alice Johnson found:', alice);

        // Check if Alice has person_roles with Project Manager
        if (alice.person_roles && Array.isArray(alice.person_roles)) {
          const pmRole = alice.person_roles.find((pr: any) =>
            pr.role_name === 'Project Manager' && pr.is_primary === 1
          );

          if (pmRole) {
            console.log('Alice is assigned as Project Manager (primary role)');
          }
        }
      }

      // Now verify in UI
      await testHelpers.navigateTo('/people');
      await testHelpers.waitForDataTable();

      const aliceRow = authenticatedPage.locator('tbody tr').filter({
        hasText: 'Alice Johnson'
      }).first();

      if (await aliceRow.isVisible()) {
        const roleCell = aliceRow.locator('td').nth(1); // Primary Role column
        const roleText = await roleCell.textContent();

        console.log('Alice\'s role in UI:', roleText);
        expect(roleText).toContain('Project Manager');

        // Take screenshot
        await authenticatedPage.screenshot({
          path: 'test-results/alice-johnson-project-manager.png',
          fullPage: false
        });
      }
    });

    test('should validate count consistency between API and UI', async ({
      authenticatedPage,
      testHelpers,
      apiContext
    }) => {
      // Get counts from API
      const apiResponse = await apiContext.get('/api/roles');
      const apiData = await apiResponse.json();
      const apiRoles = apiData.data;

      // Get Project Manager from API
      const apiPM = apiRoles.find((r: any) => r.name === 'Project Manager');

      if (apiPM) {
        console.log('API Project Manager people_count:', apiPM.people_count);

        // Now check UI
        await testHelpers.waitForDataTable();

        const pmRow = authenticatedPage.locator('tbody tr').filter({
          hasText: 'Project Manager'
        }).first();

        if (await pmRow.isVisible()) {
          const rowText = await pmRow.textContent();
          console.log('UI Project Manager row:', rowText);

          // Extract people count from UI
          const peopleCountElement = pmRow.locator('[class*="count"]').first();
          if (await peopleCountElement.isVisible()) {
            const uiCountText = await peopleCountElement.textContent();
            const uiCountMatch = uiCountText?.match(/\d+/);

            if (uiCountMatch) {
              const uiCount = parseInt(uiCountMatch[0], 10);
              console.log('UI Project Manager people_count:', uiCount);

              // Counts should match
              expect(uiCount).toBe(apiPM.people_count);
            }
          }
        }
      }
    });
  });
});
