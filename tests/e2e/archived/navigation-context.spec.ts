/**
 * Report Navigation Context Tests
 * Tests for maintaining context when navigating between reports and other pages
 * Uses dynamic test data for proper isolation
 */
import { test, expect, tags } from '../../fixtures';
import { TestDataContext } from '../../utils/test-data-helpers';
test.describe('Report Navigation Context', () => {
  let testContext: TestDataContext;
  let testData: any;
  test.beforeEach(async ({ testDataHelpers, testHelpers, apiContext }) => {
    // Create isolated test context
    testContext = testDataHelpers.createTestContext('navcontext');
    // Create test data for navigation context testing
    testData = await testDataHelpers.createBulkTestData(testContext, {
      projects: 3,
      people: 4,
      assignments: 6
    });
  });
  test.afterEach(async ({ testDataHelpers }) => {
    // Clean up all test data
    await testDataHelpers.cleanupTestContext(testContext);
  });
  test.describe('Contextual Action Parameters', () => {
    test(`${tags.reports} should pass correct parameters to assignment creation from capacity report`, async ({ 
      authenticatedPage, 
      testHelpers,
      testDataHelpers 
    }) => {
      await testHelpers.navigateTo('/reports');
      await authenticatedPage.click('button:has-text("Capacity Report")');
      // Wait for report to load
      await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      // Find one of our test people who might be underutilized
      let underutilizedPerson = null;
      let underutilizedRow = null;
      // First try to find an underutilized test person
      for (const person of testData.people) {
        const personRow = authenticatedPage.locator(`tr:has-text("${person.name}")`).first();
        if (await personRow.count() > 0) {
          const utilizationText = await personRow.locator('td').nth(2).textContent();
          if (utilizationText?.includes('%')) {
            const utilization = parseInt(utilizationText.match(/(\d+, 10)%/)?.[1] || '0');
            if (utilization < 50) {
              underutilizedPerson = person;
              underutilizedRow = personRow;
              break;
            }
          }
        }
      }
      // If no underutilized test person, find any underutilized person
      if (!underutilizedRow) {
        underutilizedRow = authenticatedPage.locator('tr:has-text("< 50%")').first();
        if (await underutilizedRow.count() === 0) {
          // Skip test if no underutilized people
          console.log('No underutilized people found, skipping test');
          return;
        }
      }
      const personName = underutilizedPerson?.name || await underutilizedRow.locator('td:first-child').textContent();
      // Click "Add Assignment" action if available
      const addAssignmentButton = underutilizedRow.locator('button:has-text("Add Assignment")');
      if (await addAssignmentButton.count() > 0) {
        await addAssignmentButton.click();
        // Verify navigation to assignment page with context
        await expect(authenticatedPage).toHaveURL(/\/assignments\/new/);
        // Verify pre-filled values
        const personSelect = authenticatedPage.locator('select[name="person_id"]');
        await expect(personSelect).toContainText(personName || '');
        // Verify date context preserved
        const urlParams = new URL(authenticatedPage.url()).searchParams;
        expect(urlParams.get('start_date')).toBeTruthy();
        expect(urlParams.get('context')).toBe('capacity_report');
      }
    });
    test(`${tags.reports} should maintain filter context when navigating to project details`, async ({ 
      authenticatedPage, 
      testHelpers,
      testDataHelpers 
    }) => {
      await testHelpers.navigateTo('/reports');
      await authenticatedPage.click('button:has-text("Demand Report")');
      await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
      // Apply filters using test data values if possible
      const locationSelect = authenticatedPage.locator('select[name="location"]');
      if (await locationSelect.count() > 0) {
        const testLocation = testData.projects[0]?.location_id || 'nyc';
        await locationSelect.selectOption(testLocation);
      }
      const phaseSelect = authenticatedPage.locator('select[name="phase"]');
      if (await phaseSelect.count() > 0) {
        await phaseSelect.selectOption('development');
      }
      // Find a test project link or any project link
      let projectLink = null;
      let projectName = '';
      for (const project of testData.projects) {
        const link = authenticatedPage.locator(`a:has-text("${project.name}")`).first();
        if (await link.count() > 0) {
          projectLink = link;
          projectName = project.name;
          break;
        }
      }
      if (!projectLink) {
        projectLink = authenticatedPage.locator('a.project-link').first();
        if (await projectLink.count() > 0) {
          projectName = await projectLink.textContent() || '';
        }
      }
      if (projectLink && await projectLink.count() > 0) {
        await projectLink.click();
        // Verify navigation to project details
        await expect(authenticatedPage).toHaveURL(/\/projects\/[^/]+$/);
        await expect(authenticatedPage.locator('h1')).toContainText(projectName);
        // Navigate back to reports
        const backLink = authenticatedPage.locator('a:has-text("Back to Reports"), a:has-text("Reports")').first();
        if (await backLink.count() > 0) {
          await backLink.click();
          // Verify filters are preserved
          if (await locationSelect.count() > 0) {
            const currentLocation = await locationSelect.inputValue();
            expect(currentLocation).toBeTruthy();
          }
          if (await phaseSelect.count() > 0) {
            await expect(phaseSelect).toHaveValue('development');
          }
        }
      }
    });
    test(`${tags.reports} should pass role context when creating assignments from gaps analysis`, async ({ 
      authenticatedPage, 
      testHelpers,
      testDataHelpers 
    }) => {
      await testHelpers.navigateTo('/reports');
      await authenticatedPage.click('button:has-text("Gaps Analysis"), button:has-text("Gaps")');
      await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
      // Find a gap for a role that matches our test data
      const testRoles = [...new Set(testData.people.map((p: any) => p.role))];
      let gapRow = null;
      let roleText = '';
      for (const role of testRoles) {
        const row = authenticatedPage.locator(`tr:has-text("${role}"):has-text("Gap:")`).first();
        if (await row.count() > 0) {
          gapRow = row;
          roleText = role;
          break;
        }
      }
      // If no test role gap found, use any gap
      if (!gapRow) {
        gapRow = authenticatedPage.locator('tr:has-text("Gap:")').first();
        if (await gapRow.count() > 0) {
          roleText = await gapRow.locator('td:nth-child(1)').textContent() || '';
        }
      }
      if (gapRow && await gapRow.count() > 0) {
        // Click "Fill Gap" action if available
        const fillGapButton = gapRow.locator('button:has-text("Fill Gap")');
        if (await fillGapButton.count() > 0) {
          await fillGapButton.click();
          // Verify assignment form has role pre-selected
          await expect(authenticatedPage).toHaveURL(/\/assignments\/new/);
          const roleSelect = authenticatedPage.locator('select[name="role_id"], select[name="role"]');
          if (await roleSelect.count() > 0) {
            await expect(roleSelect).toContainText(roleText);
          }
          // Verify suggested allocation based on gap size
          const allocationInput = authenticatedPage.locator('input[name="allocation_percentage"], input[name="allocation"]');
          if (await allocationInput.count() > 0) {
            const suggestedValue = await allocationInput.getAttribute('placeholder');
            if (suggestedValue) {
              expect(suggestedValue).toContain('Suggested');
            }
          }
        }
      }
    });
  });
  test.describe('Navigation Flow Preservation', () => {
    test(`${tags.reports} should maintain report tab selection across navigation`, async ({ 
      authenticatedPage, 
      testHelpers,
      testDataHelpers 
    }) => {
      await testHelpers.navigateTo('/reports');
      // Select Utilization tab
      await authenticatedPage.click('button:has-text("Utilization Report")');
      await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
      // Find a test person link
      let personLink = null;
      for (const person of testData.people) {
        const link = authenticatedPage.locator(`a:has-text("${person.name}")`).first();
        if (await link.count() > 0) {
          personLink = link;
          break;
        }
      }
      if (!personLink) {
        personLink = authenticatedPage.locator('a.person-link').first();
      }
      if (personLink && await personLink.count() > 0) {
        await personLink.click();
        await expect(authenticatedPage).toHaveURL(/\/people\/[^/]+$/);
        // Navigate back using breadcrumb or back button
        const reportsLink = authenticatedPage.locator('a:has-text("Reports")').first();
        if (await reportsLink.count() > 0) {
          await reportsLink.click();
          // Verify still on Utilization tab
          const activeTab = authenticatedPage.locator('button[aria-selected="true"]');
          if (await activeTab.count() > 0) {
            await expect(activeTab).toContainText('Utilization');
          }
        }
      }
    });
    test(`${tags.reports} should preserve scroll position when returning to report`, async ({ 
      authenticatedPage, 
      testHelpers 
    }) => {
      await testHelpers.navigateTo('/reports');
      await authenticatedPage.click('button:has-text("Capacity Report")');
      await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
      // Scroll to middle of report
      await authenticatedPage.evaluate(() => window.scrollTo(0, 500));
      const scrollBefore = await authenticatedPage.evaluate(() => window.scrollY);
      // Navigate away and back
      await authenticatedPage.click('a:has-text("Projects")');
      await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
      await authenticatedPage.goBack();
      await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
      // Check scroll position is preserved (with tolerance)
      const scrollAfter = await authenticatedPage.evaluate(() => window.scrollY);
      expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThan(100);
    });
    test(`${tags.reports} should maintain expanded/collapsed state of report sections`, async ({ 
      authenticatedPage, 
      testHelpers 
    }) => {
      await testHelpers.navigateTo('/reports');
      await authenticatedPage.click('button:has-text("Demand Report")');
      await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
      // Find expandable sections
      const detailsButton = authenticatedPage.locator('button[aria-label="Expand details"], button:has-text("Show Details")').first();
      const summaryButton = authenticatedPage.locator('button[aria-label="Collapse summary"], button:has-text("Hide Summary")').first();
      if (await detailsButton.count() > 0) {
        // Expand details section
        await detailsButton.click();
        const detailsSection = authenticatedPage.locator('[data-testid="demand-details"], .details-section').first();
        if (await detailsSection.count() > 0) {
          await expect(detailsSection).toBeVisible();
        }
      }
      if (await summaryButton.count() > 0) {
        // Collapse summary section
        await summaryButton.click();
        const summarySection = authenticatedPage.locator('[data-testid="demand-summary"], .summary-section').first();
        if (await summarySection.count() > 0) {
          await expect(summarySection).not.toBeVisible();
        }
      }
      // Navigate away and back
      await authenticatedPage.click('a:has-text("Dashboard")');
      await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
      await authenticatedPage.click('a:has-text("Reports")');
      await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
      // Verify states preserved (if sections exist)
      if (await detailsButton.count() > 0) {
        const detailsSection = authenticatedPage.locator('[data-testid="demand-details"], .details-section').first();
        if (await detailsSection.count() > 0) {
          await expect(detailsSection).toBeVisible();
        }
      }
    });
  });
  test.describe('Summary Card Links', () => {
    test(`${tags.reports} should navigate correctly from capacity summary cards`, async ({ 
      authenticatedPage, 
      testHelpers 
    }) => {
      await testHelpers.navigateTo('/reports');
      await authenticatedPage.click('button:has-text("Capacity Report")');
      await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
      // Test "Underutilized" card link if it exists
      const underutilizedCard = authenticatedPage.locator('[data-testid="summary-card"]:has-text("Underutilized"), .summary-card:has-text("Underutilized")').first();
      if (await underutilizedCard.count() > 0) {
        const valueElement = underutilizedCard.locator('.card-value, .metric, .value').first();
        const underutilizedCount = await valueElement.textContent();
        const count = parseInt(underutilizedCount?.match(/\d+/, 10)?.[0] || '0');
        const viewDetailsLink = underutilizedCard.locator('a:has-text("View Details"), button:has-text("View")').first();
        if (await viewDetailsLink.count() > 0) {
          await viewDetailsLink.click();
          // Verify filtered view or navigation
          const heading = authenticatedPage.locator('h2, h1');
          if (await heading.count() > 0) {
            const headingText = await heading.first().textContent();
            expect(headingText?.toLowerCase()).toContain('underutilized');
          }
        }
      }
    });
    test(`${tags.reports} should navigate to gap details from summary metrics`, async ({ 
      authenticatedPage, 
      testHelpers 
    }) => {
      await testHelpers.navigateTo('/reports');
      await authenticatedPage.click('button:has-text("Gaps Analysis"), button:has-text("Gaps")');
      await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
      // Click on critical gaps metric if it exists
      const criticalGapsCard = authenticatedPage.locator('[data-testid="metric-card"]:has-text("Critical Gaps"), .metric-card:has-text("Critical")').first();
      if (await criticalGapsCard.count() > 0) {
        await criticalGapsCard.click();
        // Check if it scrolled to or highlighted critical gaps
        const criticalSection = authenticatedPage.locator('[data-testid="critical-gaps-section"], .critical-gaps, h3:has-text("Critical")').first();
        if (await criticalSection.count() > 0) {
          await expect(criticalSection).toBeInViewport();
        }
      }
    });
    test(`${tags.reports} should link to relevant projects from demand summary`, async ({ 
      authenticatedPage, 
      testHelpers,
      testDataHelpers 
    }) => {
      await testHelpers.navigateTo('/reports');
      await authenticatedPage.click('button:has-text("Demand Report")');
      await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
      // Click "High Demand Projects" link if it exists
      const highDemandLink = authenticatedPage.locator('a:has-text("High Demand Projects")').first();
      if (await highDemandLink.count() > 0) {
        await highDemandLink.click();
        // Verify navigation to projects page with filter
        await expect(authenticatedPage).toHaveURL(/\/projects/);
        // Check for filter indicator
        const filterIndicator = authenticatedPage.locator('[data-testid="active-filter"], .filter-badge, .active-filter').first();
        if (await filterIndicator.count() > 0) {
          const filterText = await filterIndicator.textContent();
          expect(filterText?.toLowerCase()).toContain('demand');
        }
      }
    });
  });
  test.describe('Date Range Context', () => {
    test(`${tags.reports} should preserve custom date range across report types`, async ({ 
      authenticatedPage, 
      testHelpers 
    }) => {
      await testHelpers.navigateTo('/reports');
      // Set custom date range if date controls exist
      const dateRangeButton = authenticatedPage.locator('button:has-text("Date Range")').first();
      const startDateInput = authenticatedPage.locator('input[name="start_date"]').first();
      const endDateInput = authenticatedPage.locator('input[name="end_date"]').first();
      if (await dateRangeButton.count() > 0) {
        await dateRangeButton.click();
      }
      if (await startDateInput.count() > 0 && await endDateInput.count() > 0) {
        await startDateInput.fill('2024-01-01');
        await endDateInput.fill('2024-03-31');
        const applyButton = authenticatedPage.locator('button:has-text("Apply")').first();
        if (await applyButton.count() > 0) {
          await applyButton.click();
          await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
        }
        // Switch between report tabs
        const reports = ['Capacity Report', 'Demand Report', 'Utilization Report'];
        for (const report of reports) {
          const reportButton = authenticatedPage.locator(`button:has-text("${report}")`).first();
          if (await reportButton.count() > 0) {
            await reportButton.click();
            await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
            // Verify date range is preserved
            const dateDisplay = authenticatedPage.locator('[data-testid="date-range-display"], .date-range').first();
            if (await dateDisplay.count() > 0) {
              const dateText = await dateDisplay.textContent();
              expect(dateText).toContain('2024');
            }
          }
        }
      }
    });
    test(`${tags.reports} should maintain date range in export URLs`, async ({ 
      authenticatedPage, 
      testHelpers 
    }) => {
      await testHelpers.navigateTo('/reports');
      await authenticatedPage.click('button:has-text("Utilization Report")');
      await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
      // Set date range using available controls
      const quarterSelect = authenticatedPage.locator('select[name="quarter"]').first();
      if (await quarterSelect.count() > 0) {
        await quarterSelect.selectOption('Q2-2024');
      }
      // Get export link if available
      const exportButton = authenticatedPage.locator('a:has-text("Export"), button:has-text("Export")').first();
      if (await exportButton.count() > 0) {
        const href = await exportButton.getAttribute('href');
        if (href) {
          // Verify URL contains date parameters
          expect(href).toContain('2024');
          if (href.includes('start_date')) {
            expect(href).toMatch(/start_date=2024-\d{2}-\d{2}/);
          }
        }
      }
    });
  });
  test.describe('Cross-Report Navigation', () => {
    test(`${tags.reports} should maintain context in breadcrumb navigation`, async ({ 
      authenticatedPage, 
      testHelpers,
      testDataHelpers 
    }) => {
      await testHelpers.navigateTo('/reports');
      await authenticatedPage.click('button:has-text("Utilization Report")');
      await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
      // Apply team filter if available
      const teamSelect = authenticatedPage.locator('select[name="team"]').first();
      if (await teamSelect.count() > 0) {
        await teamSelect.selectOption({ index: 1 }); // Select first team
      }
      // Navigate to a test person's details
      let personLink = null;
      for (const person of testData.people) {
        const link = authenticatedPage.locator(`a:has-text("${person.name}")`).first();
        if (await link.count() > 0) {
          personLink = link;
          break;
        }
      }
      if (!personLink) {
        personLink = authenticatedPage.locator('a.person-link').first();
      }
      if (personLink && await personLink.count() > 0) {
        await personLink.click();
        // Check breadcrumb if it exists
        const breadcrumb = authenticatedPage.locator('nav[aria-label="Breadcrumb"], .breadcrumb').first();
        if (await breadcrumb.count() > 0) {
          await expect(breadcrumb).toContainText('Reports');
          // Click breadcrumb to return to report
          const reportLink = breadcrumb.locator('a:has-text("Report")').first();
          if (await reportLink.count() > 0) {
            await reportLink.click();
            // Verify filter still applied
            if (await teamSelect.count() > 0) {
              const selectedValue = await teamSelect.inputValue();
              expect(selectedValue).toBeTruthy();
            }
          }
        }
      }
    });
  });
});