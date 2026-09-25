/**
 * Capacity Report Accuracy Tests
 * Validates capacity calculations and data accuracy
 * Uses dynamic test data for proper isolation
 */
import { test, expect, tags, patterns } from '../../fixtures';
import { TestDataContext } from '../../utils/test-data-helpers';
test.describe('Capacity Report Accuracy', () => {
  let testContext: TestDataContext;
  let testData: any;
  test.beforeEach(async ({ testDataHelpers, testHelpers, apiContext, authenticatedPage }) => {
    // Create isolated test context
    testContext = testDataHelpers.createTestContext('capaccuracy');
    // Create test data for capacity report testing
    testData = await testDataHelpers.createBulkTestData(testContext, {
      projects: 4,
      people: 6,
      assignments: 10
    });
    await testHelpers.navigateTo('/reports');
    await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
    // Switch to Capacity Report tab
    const capacityTab = authenticatedPage.locator('button:has-text("Capacity Report"), button:has-text("Capacity")').first();
    if (await capacityTab.isVisible()) {
      await capacityTab.click();
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    }
  });
  test.afterEach(async ({ testDataHelpers }) => {
    // Clean up all test data
    await testDataHelpers.cleanupTestContext(testContext);
  });
  test(`${tags.reports} should display accurate capacity summary metrics`, async ({ 
    authenticatedPage 
  }) => {
    // Check if content is available (we should have content from test data)
    const hasContent = await authenticatedPage.locator('.summary-card').count() > 0;
    if (!hasContent) {
      // Check for empty state (shouldn't happen with test data)
      const emptyState = authenticatedPage.locator('text=/no data|no capacity/i');
      if (await emptyState.count() > 0) {
        await expect(emptyState).toBeVisible();
        return;
      }
    }
    // Verify summary cards
    const summaryCards = [
      { 
        selector: '.summary-card:has-text("Total Capacity")', 
        metric: 'capacity_hours', 
        expectedPattern: /\d+\s*hours?/i, 
        minValue: 160 // seed population floor 
      },
      { 
        selector: '.summary-card:has-text("People with Capacity"), .summary-card:has-text("People")', 
        metric: 'people_count', 
        expectedPattern: /\d+/i, 
        minValue: 4 
      },
      { 
        selector: '.summary-card:has-text("Roles"), .summary-card:has-text("# Roles")', 
        metric: 'roles_count', 
        expectedPattern: /\d+/i, 
        minValue: 1 
      },
      { 
        selector: '.summary-card:has-text("Peak Month")', 
        metric: 'peak_month', 
        expectedPattern: /\d{4}-\d{2}/i 
      }
    ];
    for (const card of summaryCards) {
      const cardElement = authenticatedPage.locator(card.selector);
      await expect(cardElement).toBeVisible();
      const metricElement = cardElement.locator('.metric');
      const metricText = await metricElement.textContent();
      expect(metricText?.trim()).toBeTruthy();
      expect(metricText).toMatch(card.expectedPattern);
      if (card.minValue !== undefined) {
        const numericValue = parseInt(metricText?.match(/\d+/, 10)?.[0] || '0');
        expect(numericValue).toBeGreaterThanOrEqual(card.minValue);
      }
    }
  });
  test(`${tags.reports} should display capacity charts with data`, async ({ 
    authenticatedPage 
  }) => {
    const hasCharts = await authenticatedPage.locator('.chart-container').count() > 0;
    if (!hasCharts) {
      // No charts might mean no data
      const emptyState = authenticatedPage.locator('text=/no data|no capacity/i');
      await expect(emptyState).toBeVisible();
      return;
    }
    const charts = [
      { 
        title: 'Capacity by Person', 
        type: 'bar', 
        elementSelector: '.recharts-bar, rect[width]' 
      },
      { 
        title: 'Capacity by Role', 
        type: 'bar', 
        elementSelector: '.recharts-bar, rect[width]' 
      },
      { 
        title: 'Capacity Trend Over Time', 
        type: 'line', 
        elementSelector: '.recharts-line, .recharts-line-dot, circle' 
      }
    ];
    for (const chart of charts) {
      const chartContainer = authenticatedPage.locator(`.chart-container:has-text("${chart.title}")`);
      if (await chartContainer.isVisible()) {
        await expect(chartContainer).toBeVisible();
        // Check for chart visualization
        const chartSvg = chartContainer.locator('svg, .recharts-wrapper');
        await expect(chartSvg).toBeVisible();
        // Check for data elements
        const dataElements = chartContainer.locator(chart.elementSelector);
        const elementCount = await dataElements.count();
        expect(elementCount).toBeGreaterThan(0);
      }
    }
  });
  test(`${tags.reports} should display capacity tables with realistic data`, async ({ 
    authenticatedPage,
    testDataHelpers 
  }) => {
    const hasTables = await authenticatedPage.locator('.full-width-tables').count() > 0;
    if (!hasTables) {
      // Try alternate table selectors
      const tables = await authenticatedPage.locator('table').count();
      if (tables === 0) {
        const emptyState = authenticatedPage.locator('text=/no data|no capacity/i');
        if (await emptyState.count() > 0) {
          await expect(emptyState).toBeVisible();
          return;
        }
      }
    }
    // Test People Capacity Overview table
    const peopleTable = authenticatedPage.locator('.table-container:has-text("People Capacity"), table').first();
    if (await peopleTable.isVisible()) {
      // Check table headers
      const expectedHeaders = ['Name', 'Daily Hours', 'Availability', 'Status'];
      for (const header of expectedHeaders) {
        const headerElement = authenticatedPage.locator(`th:has-text("${header}")`);
        if (await headerElement.count() > 0) {
          await expect(headerElement.first()).toBeVisible();
        }
      }
      // Check for data rows (should include our test people)
      const peopleRows = peopleTable.locator('tbody tr');
      const peopleRowCount = await peopleRows.count();
      expect(peopleRowCount).toBeGreaterThanOrEqual(testData.people.length);
      // Validate first row data quality
      if (peopleRowCount > 0) {
        const firstRow = peopleRows.first();
        // Check person name
        const nameCell = firstRow.locator('td').first();
        const name = await nameCell.textContent();
        expect(name?.trim()).toBeTruthy();
        // Verify at least one test person appears in the table
        let foundTestPerson = false;
        for (const person of testData.people) {
          const personRow = peopleTable.locator(`tr:has-text("${person.name}")`);
          if (await personRow.count() > 0) {
            foundTestPerson = true;
            break;
          }
        }
        expect(foundTestPerson).toBe(true);
        // Check daily hours
        const hoursCell = firstRow.locator('td').nth(1);
        const hours = await hoursCell.textContent();
        const hourValue = parseFloat(hours?.match(/\d+\.?\d*/)?.[0] || '0');
        expect(hourValue).toBeGreaterThan(0);
        expect(hourValue).toBeLessThanOrEqual(24);
      }
    }
  });
  test(`${tags.reports} should validate capacity calculations are reasonable`, async ({ 
    authenticatedPage 
  }) => {
    const hasContent = await authenticatedPage.locator('.summary-card').count() > 0;
    if (!hasContent) {
      return;
    }
    // Get capacity metrics
    const totalCapacityCard = authenticatedPage.locator('.summary-card:has-text("Total Capacity")');
    const totalCapacityText = await totalCapacityCard.locator('.metric').textContent();
    const totalCapacity = parseInt(totalCapacityText?.match(/\d+/, 10)?.[0] || '0');
    const peopleCard = authenticatedPage.locator('.summary-card:has-text("People with Capacity"), .summary-card:has-text("People")');
    const peopleCountText = await peopleCard.locator('.metric').textContent();
    const peopleCount = parseInt(peopleCountText?.match(/\d+/, 10)?.[0] || '0');
    if (totalCapacity > 0 && peopleCount > 0) {
      // Calculate average capacity per person
      const avgCapacityPerPerson = totalCapacity / peopleCount;
      // Should be reasonable (between 20-2000 hours per person for the time period)
      expect(avgCapacityPerPerson).toBeGreaterThan(20);
      expect(avgCapacityPerPerson).toBeLessThan(2000);
      // People count should include our test people
      expect(peopleCount).toBeGreaterThanOrEqual(testData.people.length);
    }
    // Validate peak month format
    const peakMonthCard = authenticatedPage.locator('.summary-card:has-text("Peak Month")');
    if (await peakMonthCard.isVisible()) {
      const peakMonthText = await peakMonthCard.locator('.metric').textContent();
      expect(peakMonthText).toMatch(/\d{4}-\d{2}/);
    }
  });
  test(`${tags.reports} ${tags.api} should verify API data consistency`, async ({ 
    authenticatedPage,
    apiContext,
    testDataHelpers 
  }) => {
    // Make direct API call
    const response = await apiContext.get('/api/reporting/capacity');
    if (response.ok()) {
      const apiData = await response.json();
      // Verify API response structure
      expect(apiData).toBeTruthy();
      // Check if we have expected capacity data
      if (apiData.summary) {
        const totalCapacity = apiData.summary?.total_capacity || apiData.summary?.totalCapacity || 0;
        if (totalCapacity > 0) {
          expect(totalCapacity).toBeGreaterThan(100);
        }
      }
      // Verify people data
      if (apiData.byPerson && Array.isArray(apiData.byPerson)) {
        expect(apiData.byPerson.length).toBeGreaterThanOrEqual(testData.people.length);
        // Validate data structure
        const firstPerson = apiData.byPerson[0];
        expect(firstPerson).toHaveProperty('name');
        expect(firstPerson).toHaveProperty('capacity');
        // Verify our test people are included
        const apiPeopleNames = apiData.byPerson.map((p: any) => p.name);
        for (const testPerson of testData.people) {
          expect(apiPeopleNames).toContain(testPerson.name);
        }
      }
      // Verify role data
      if (apiData.byRole && Array.isArray(apiData.byRole)) {
        expect(apiData.byRole.length).toBeGreaterThan(0);
        // Validate data structure
        const firstRole = apiData.byRole[0];
        expect(firstRole).toHaveProperty('role');
        expect(firstRole).toHaveProperty('totalCapacity');
      }
    }
  });
  test(`${tags.reports} should handle date filtering accurately`, async ({ 
    authenticatedPage,
    testHelpers,
    testDataHelpers 
  }) => {
    const hasContent = await authenticatedPage.locator('.summary-card').count() > 0;
    if (!hasContent) {
      return;
    }
    // Get initial capacity
    const capacityCard = authenticatedPage.locator('.summary-card:has-text("Total Capacity")');
    const initialCapacity = await capacityCard.locator('.metric').textContent();
    const initialValue = parseInt(initialCapacity?.match(/\d+/, 10)?.[0] || '0');
    // Apply date filter
    const startDateInput = authenticatedPage.locator('input[name="startDate"], input[type="date"]').first();
    const endDateInput = authenticatedPage.locator('input[name="endDate"], input[type="date"]').last();
    if (await startDateInput.isVisible() && await endDateInput.isVisible()) {
      // Set to a shorter period that includes our test data
      const today = new Date();
      const twoMonthsAgo = new Date(today);
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
      // Use dates that will include test assignments
      const startDate = testData.assignments[0]?.startDate || twoMonthsAgo.toISOString().split('T')[0];
      const endDate = testData.assignments[testData.assignments.length - 1]?.endDate || today.toISOString().split('T')[0];
      await startDateInput.fill(startDate);
      await endDateInput.fill(endDate);
      const applyButton = authenticatedPage.locator('button:has-text("Apply"), button:has-text("Filter")').first();
      if (await applyButton.isVisible()) {
        await applyButton.click();
        await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
        await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        // Get updated capacity
        const updatedCapacity = await capacityCard.locator('.metric').textContent();
        const updatedValue = parseInt(updatedCapacity?.match(/\d+/, 10)?.[0] || '0');
        // Verify it's a reasonable positive value
        expect(updatedValue).toBeGreaterThan(0);
        // Verify no errors occurred
        await testHelpers.verifyNoErrors();
      }
    }
  });
});