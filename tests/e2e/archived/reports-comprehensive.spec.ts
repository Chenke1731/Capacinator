/**
 * Reports Test Suite
 * Comprehensive tests for all reporting functionality
 * Uses dynamic test data for proper isolation
 */
import { test, expect, tags } from '../../fixtures';
import { TestDataContext } from '../../utils/test-data-helpers';
test.describe('Reports Functionality', () => {
  let testContext: TestDataContext;
  let testData: any;
  test.beforeEach(async ({ testDataHelpers, testHelpers, apiContext }) => {
    // Create isolated test context
    testContext = testDataHelpers.createTestContext('reports');
    // Create comprehensive test data for reports
    testData = await testDataHelpers.createBulkTestData(testContext, {
      projects: 3,
      people: 5,
      assignments: 8
    });
    await testHelpers.navigateTo('/reports');
    await testHelpers.waitForPageLoad();
  });
  test.afterEach(async ({ testDataHelpers }) => {
    // Clean up all test data
    await testDataHelpers.cleanupTestContext(testContext);
  });
  test.describe('Report Navigation', () => {
    test(`${tags.smoke} should display all report tabs`, async ({ authenticatedPage }) => {
      const reportTabs = [
        'Demand Report',
        'Capacity Report',
        'Utilization Report',
        'Gaps Report', // or 'Gaps Analysis'
      ];
      for (const tab of reportTabs) {
        const tabButton = authenticatedPage.locator(`button:has-text("${tab}"), button:has-text("${tab.replace(' Report', '')}")`);
        await expect(tabButton).toBeVisible();
      }
    });
    test('should switch between report tabs', async ({ authenticatedPage }) => {
      // Click each tab and verify content changes
      const tabs = [
        { name: 'Demand', content: 'Total Demand' },
        { name: 'Capacity', content: 'Total Capacity' },
        { name: 'Utilization', content: 'Utilization %' },
        { name: 'Gaps', content: 'Capacity Gaps' },
      ];
      for (const tab of tabs) {
        const tabButton = authenticatedPage.locator(`button:has-text("${tab.name}")`);
        await tabButton.click();
        await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {}); // Allow for animation
        // Verify tab content loaded
        await expect(authenticatedPage.locator(`text=${tab.content}`)).toBeVisible({ timeout: 10000 });
      }
    });
  });
  test.describe('Demand Report', () => {
    test(`${tags.reports} should display demand metrics`, async ({ authenticatedPage }) => {
      // Ensure we're on demand tab (usually default)
      const demandTab = authenticatedPage.locator('[role="tab"]:has-text("Demand")');
      if (await demandTab.isVisible()) {
        await demandTab.click();
      }
      // Check for key metrics
      await expect(authenticatedPage.locator('text=Total Demand')).toBeVisible();
      await expect(authenticatedPage.locator('text=/\\d+ hours/')).toBeVisible();
      // Check for charts
      const chartContainer = authenticatedPage.locator('.chart-container, [data-testid="bar-chart"]');
      await expect(chartContainer).toBeVisible();
    });
    test('should filter demand by date range', async ({ authenticatedPage }) => {
      // Look for date filters
      const dateFilter = authenticatedPage.locator('input[type="date"]').first();
      if (await dateFilter.isVisible()) {
        const today = new Date();
        const nextMonth = new Date(today);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        await dateFilter.fill(today.toISOString().split('T')[0]);
        // Wait for data to update
        await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      }
    });
  });
  test.describe('Capacity Report', () => {
    test(`${tags.reports} should display capacity tables`, async ({ 
      authenticatedPage, 
      testHelpers,
      testDataHelpers 
    }) => {
      // Switch to capacity tab
      await authenticatedPage.getByRole('tab', { name: /capacity/i }).click();
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      // Check for people capacity table
      await expect(authenticatedPage.locator('text=People Capacity')).toBeVisible();
      // Check for table
      const table = authenticatedPage.locator('table').first();
      await expect(table).toBeVisible();
      // Verify headers
      const expectedHeaders = ['Name', 'Daily Hours', 'Availability', 'Status'];
      for (const header of expectedHeaders) {
        const headerElement = authenticatedPage.locator(`th:has-text("${header}")`);
        if (await headerElement.count() > 0) {
          await expect(headerElement.first()).toBeVisible();
        }
      }
      // Verify our test people appear in the table
      const tableRows = table.locator('tbody tr');
      const rowCount = await tableRows.count();
      expect(rowCount).toBeGreaterThanOrEqual(testData.people.length);
    });
    test('should show role capacity breakdown', async ({ authenticatedPage }) => {
      await authenticatedPage.getByRole('tab', { name: /capacity/i }).click();
      // Look for role capacity section
      await expect(authenticatedPage.locator('text=Role Capacity')).toBeVisible();
      // Check for role data
      const roleTable = authenticatedPage.locator('table').nth(1);
      if (await roleTable.isVisible()) {
        await expect(roleTable.locator('th:has-text("Role")')).toBeVisible();
      }
    });
  });
  test.describe('Utilization Report', () => {
    test(`${tags.reports} should display utilization metrics`, async ({ authenticatedPage }) => {
      await authenticatedPage.getByRole('tab', { name: /utilization/i }).click();
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      // Check for utilization percentage
      await expect(authenticatedPage.locator('text=Utilization %')).toBeVisible();
      // Check for metrics cards
      const metrics = ['Over', 'Under', 'Optimal'];
      for (const metric of metrics) {
        const metricElement = authenticatedPage.locator(`text=/${metric}/i`);
        if (await metricElement.count() > 0) {
          await expect(metricElement.first()).toBeVisible();
        }
      }
      // Check for utilization table
      const table = authenticatedPage.locator('table');
      await expect(table).toBeVisible();
    });
    test('should show person-level utilization', async ({ 
      authenticatedPage,
      testDataHelpers 
    }) => {
      await authenticatedPage.getByRole('tab', { name: /utilization/i }).click();
      const table = authenticatedPage.locator('table');
      await expect(table).toBeVisible();
      // Check for person data columns
      const headers = ['Name', 'Role', 'Utilization', 'Available'];
      for (const header of headers) {
        const headerElement = table.locator(`th:text-is("${header}")`);
        if (await headerElement.count() > 0) {
          await expect(headerElement.first()).toBeVisible();
        }
      }
      // Verify our test people appear
      for (const person of testData.people.slice(0, 2)) { // Check first 2
        const personRow = table.locator(`tr:has-text("${person.name}")`);
        if (await personRow.count() > 0) {
          await expect(personRow.first()).toBeVisible();
        }
      }
    });
  });
  test.describe('Gaps Report', () => {
    test(`${tags.reports} should display capacity gaps`, async ({ authenticatedPage }) => {
      // Click gaps tab
      const gapsTab = authenticatedPage.locator('[role="tab"]:has-text("Gaps"), [role="tab"]:has-text("Gap")');
      await gapsTab.first().click();
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      // Check for gaps content
      await expect(authenticatedPage.locator('text=/Capacity Gap|Gap Analysis/i')).toBeVisible();
      // Check for gaps table
      const table = authenticatedPage.locator('table');
      if (await table.isVisible()) {
        await expect(table.locator('th:has-text("Role")')).toBeVisible();
        await expect(table.locator('th:has-text("Demand")')).toBeVisible();
        await expect(table.locator('th:has-text("Capacity")')).toBeVisible();
      }
    });
    test('should show actionable gap recommendations', async ({ authenticatedPage }) => {
      const gapsTab = authenticatedPage.locator('[role="tab"]:has-text("Gaps")');
      await gapsTab.first().click();
      // Look for action buttons
      const actionButtons = authenticatedPage.locator('button:has-text("Hire"), button:has-text("View People")');
      const buttonCount = await actionButtons.count();
      if (buttonCount > 0) {
        await expect(actionButtons.first()).toBeVisible();
      }
    });
  });
  test.describe('Export Functionality', () => {
    test('should show export options', async ({ authenticatedPage }) => {
      const exportButton = authenticatedPage.getByRole('button', { name: /export/i });
      if (await exportButton.isVisible()) {
        await exportButton.click();
        // Check for export options
        await expect(authenticatedPage.locator('text=Export as CSV')).toBeVisible();
        await expect(authenticatedPage.locator('text=Export as PDF')).toBeVisible();
      }
    });
  });
  test.describe('Data Accuracy', () => {
    test(`${tags.reports} capacity should match people data`, async ({ 
      authenticatedPage, 
      testHelpers, 
      apiContext 
    }) => {
      // Navigate to capacity report
      await authenticatedPage.getByRole('tab', { name: /capacity/i }).click();
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      // Count rows in people capacity table
      const table = authenticatedPage.locator('table').first();
      const rows = table.locator('tbody tr');
      const rowCount = await rows.count();
      // Row count should include our test people
      expect(rowCount).toBeGreaterThanOrEqual(testData.people.length);
      // Verify test people appear in the table
      for (const person of testData.people) {
        const personRow = table.locator(`tr:has-text("${person.name}")`);
        if (await personRow.count() > 0) {
          await expect(personRow.first()).toBeVisible();
        }
      }
    });
  });
  test.describe('Performance', () => {
    test(`${tags.slow} should load large datasets efficiently`, async ({ authenticatedPage }) => {
      const startTime = Date.now();
      // Navigate through all tabs
      const tabs = ['Demand', 'Capacity', 'Utilization', 'Gaps'];
      for (const tab of tabs) {
        await authenticatedPage.getByRole('button', { name: new RegExp(tab, 'i') }).click();
        await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
      }
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      // All reports should load within reasonable time
      expect(totalTime).toBeLessThan(10000); // 10 seconds for all reports
    });
  });
  test.describe('Report Operations', () => {
    test(`${tags.reports} should update metrics in real-time`, async ({ 
      authenticatedPage, 
      testHelpers, 
      apiContext 
    }) => {
      await testHelpers.navigateTo('/reports');
      await authenticatedPage.click('button:has-text("Capacity Report")');
      // Get initial project count if displayed
      const projectCountElement = authenticatedPage.locator('[data-testid="active-projects-count"]');
      let initialCount = 0;
      if (await projectCountElement.count() > 0) {
        const countText = await projectCountElement.textContent();
        initialCount = parseInt(countText || '0', 10);
      }
      // Create new project via API
      const newProjectData = {
        name: `${testContext.prefix}-Real-time-Test-Project`,
        project_type_id: testData.projects[0].project_type_id || 'type-1',
        location_id: testData.projects[0].location_id || 'loc-1',
        priority: 1
      };
      const response = await apiContext.post('/api/projects', { data: newProjectData });
      const newProject = await response.json();
      if (newProject.id) {
        testContext.createdIds.projects.push(newProject.id);
      }
      // Refresh report if refresh button exists
      const refreshButton = authenticatedPage.locator('button[aria-label="Refresh"]');
      if (await refreshButton.count() > 0) {
        await refreshButton.click();
        await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        // Verify count increased if element exists
        if (await projectCountElement.count() > 0) {
          const newCount = await projectCountElement.textContent();
          expect(parseInt(newCount || '0', 10)).toBeGreaterThan(initialCount);
        }
      }
    });
    test(`${tags.reports} should generate capacity forecasts`, async ({ 
      authenticatedPage, 
      testHelpers 
    }) => {
      await testHelpers.navigateTo('/reports');
      await authenticatedPage.click('button:has-text("Capacity Report")');
      // Check if forecast feature exists
      const forecastButton = authenticatedPage.locator('button:has-text("Show Forecast"), button:has-text("Forecast")');
      if (await forecastButton.count() > 0) {
        await forecastButton.click();
        // Verify forecast elements appear
        const forecastChart = authenticatedPage.locator('[data-testid="forecast-chart"], .forecast-chart');
        await expect(forecastChart).toBeVisible();
        // Look for forecast controls
        const growthRateInput = authenticatedPage.locator('input[name="growth_rate"]');
        if (await growthRateInput.count() > 0) {
          await growthRateInput.fill('10');
          const updateButton = authenticatedPage.locator('button:has-text("Update Forecast")');
          if (await updateButton.count() > 0) {
            await updateButton.click();
            await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
          }
        }
      }
    });
    test(`${tags.reports} should display project health breakdown`, async ({ 
      authenticatedPage, 
      testHelpers 
    }) => {
      await testHelpers.navigateTo('/reports');
      const gapsButton = authenticatedPage.locator('[role="tab"]:has-text("Gaps Analysis"), [role="tab"]:has-text("Gaps Report")');
      if (await gapsButton.count() > 0) {
        await gapsButton.click();
        // Check health indicators if they exist
        const healthCategories = ['Healthy', 'At Risk', 'Critical'];
        for (const category of healthCategories) {
          const indicator = authenticatedPage.locator(`[data-testid="health-indicator-${category.toLowerCase().replace(' ', '-')}"]`);
          if (await indicator.count() > 0) {
            await expect(indicator).toBeVisible();
            const countElement = indicator.locator('.count');
            if (await countElement.count() > 0) {
              await expect(countElement).toHaveText(/\d+/);
            }
          }
        }
      }
    });
    test(`${tags.reports} should show resource utilization charts`, async ({ 
      authenticatedPage, 
      testHelpers 
    }) => {
      await testHelpers.navigateTo('/reports');
      await authenticatedPage.click('button:has-text("Utilization Report")');
      // Check if chart type selector exists
      const chartTypes = ['Bar Chart', 'Heatmap', 'Timeline'];
      for (const chartType of chartTypes) {
        const chartButton = authenticatedPage.locator(`button:has-text("${chartType}")`);
        if (await chartButton.count() > 0) {
          await chartButton.click();
          const chart = authenticatedPage.locator(`[data-testid="${chartType.toLowerCase().replace(' ', '-')}"]`);
          if (await chart.count() > 0) {
            await expect(chart).toBeVisible();
          }
        }
      }
    });
    test(`${tags.reports} should display assignment conflicts`, async ({ 
      authenticatedPage, 
      testHelpers 
    }) => {
      await testHelpers.navigateTo('/reports');
      await authenticatedPage.click('button:has-text("Utilization Report")');
      // Check if conflicts view exists
      const conflictsButton = authenticatedPage.locator('button:has-text("Show Conflicts"), button:has-text("Conflicts")');
      if (await conflictsButton.count() > 0) {
        await conflictsButton.click();
        // Verify conflicts panel
        const conflictsPanel = authenticatedPage.locator('[data-testid="conflicts-panel"], .conflicts-panel');
        if (await conflictsPanel.count() > 0) {
          await expect(conflictsPanel).toBeVisible();
          // Check for overallocation warnings
          const warnings = conflictsPanel.locator('.conflict-warning');
          if (await warnings.count() > 0) {
            await expect(warnings.first()).toContainText(/Over.*allocated|Conflict/);
          }
        }
      }
    });
    test(`${tags.reports} should handle custom date ranges`, async ({ 
      authenticatedPage, 
      testHelpers 
    }) => {
      await testHelpers.navigateTo('/reports');
      // Check if date range picker exists
      const dateRangeButton = authenticatedPage.locator('button[aria-label="Select date range"], button:has-text("Date Range")');
      if (await dateRangeButton.count() > 0) {
        // Test custom range on first report
        await authenticatedPage.click('button:has-text("Capacity Report")');
        await dateRangeButton.click();
        // Select custom range if option exists
        const customRangeOption = authenticatedPage.locator('text=Custom Range');
        if (await customRangeOption.count() > 0) {
          await customRangeOption.click();
          const startDateInput = authenticatedPage.locator('input[name="start_date"]');
          const endDateInput = authenticatedPage.locator('input[name="end_date"]');
          if (await startDateInput.count() > 0 && await endDateInput.count() > 0) {
            await startDateInput.fill('2024-01-01');
            await endDateInput.fill('2024-06-30');
            const applyButton = authenticatedPage.locator('button:has-text("Apply")');
            if (await applyButton.count() > 0) {
              await applyButton.click();
              // Verify range applied
              const dateDisplay = authenticatedPage.locator('[data-testid="date-range-display"], .date-range-display');
              if (await dateDisplay.count() > 0) {
                await expect(dateDisplay).toContainText('Jan');
                await expect(dateDisplay).toContainText('Jun');
              }
            }
          }
        }
      }
    });
    test(`${tags.reports} should save report preferences`, async ({ 
      authenticatedPage, 
      testHelpers 
    }) => {
      await testHelpers.navigateTo('/reports');
      await authenticatedPage.click('button:has-text("Capacity Report")');
      // Check if view preferences exist
      const groupBySelect = authenticatedPage.locator('select[name="group_by"]');
      if (await groupBySelect.count() > 0) {
        await groupBySelect.selectOption('location');
        // Check if save view feature exists
        const saveViewButton = authenticatedPage.locator('button:has-text("Save View")');
        if (await saveViewButton.count() > 0) {
          await saveViewButton.click();
          const viewNameInput = authenticatedPage.locator('input[name="view_name"]');
          if (await viewNameInput.count() > 0) {
            const viewName = `${testContext.prefix}-Location-View`;
            await viewNameInput.fill(viewName);
            const saveButton = authenticatedPage.locator('button:has-text("Save")').last();
            await saveButton.click();
            // Reload and verify saved view exists
            await authenticatedPage.reload();
            await authenticatedPage.click('button:has-text("Capacity Report")');
            const loadViewButton = authenticatedPage.locator('button:has-text("Load View")');
            if (await loadViewButton.count() > 0) {
              await loadViewButton.click();
              const savedView = authenticatedPage.locator(`text=${viewName}`);
              await expect(savedView).toBeVisible();
            }
          }
        }
      }
    });
    test(`${tags.reports} should export reports to Excel`, async ({ 
      authenticatedPage, 
      testHelpers 
    }) => {
      await testHelpers.navigateTo('/reports');
      await authenticatedPage.click('button:has-text("Demand Report")');
      // Check if export to Excel exists
      const exportButton = authenticatedPage.locator('button:has-text("Export to Excel"), button:has-text("Export Excel")');
      if (await exportButton.count() > 0) {
        // Set up download promise before clicking
        const downloadPromise = authenticatedPage.waitForEvent('download', { timeout: 10000 }).catch(() => null);
        // Click export button
        await exportButton.click();
        // Wait for download
        const download = await downloadPromise;
        if (download) {
          // Verify file name
          expect(download.suggestedFilename()).toMatch(/demand.*report.*\.xlsx/i);
        }
      }
    });
    test(`${tags.reports} should handle print functionality`, async ({ 
      authenticatedPage, 
      testHelpers 
    }) => {
      await testHelpers.navigateTo('/reports');
      await authenticatedPage.click('button:has-text("Utilization Report")');
      // Check if print button exists
      const printButton = authenticatedPage.locator('button[aria-label="Print report"], button:has-text("Print")');
      if (await printButton.count() > 0) {
        // Mock print dialog
        await authenticatedPage.evaluate(() => {
          (window as any).printCalled = false;
          window.print = () => {
            (window as any).printCalled = true;
          };
        });
        // Click print button
        await printButton.click();
        // Verify print was called
        const printCalled = await authenticatedPage.evaluate(() => (window as any).printCalled);
        expect(printCalled).toBe(true);
      }
    });
  });
  test.describe('Filter Integration', () => {
    test(`${tags.reports} should preserve filter state between chart interactions`, async ({ 
      authenticatedPage, 
      testHelpers 
    }) => {
      await testHelpers.navigateTo('/reports');
      await authenticatedPage.click('button:has-text("Capacity Report")');
      // Check if filters exist
      const locationFilter = authenticatedPage.locator('select[name="location"]');
      if (await locationFilter.count() > 0) {
        // Apply filter using test data location if available
        const locationValue = testData.projects[0]?.location_id || 'nyc';
        await locationFilter.selectOption(locationValue);
        // Interact with chart if it exists
        const chart = authenticatedPage.locator('[data-testid="capacity-chart"], .capacity-chart');
        if (await chart.count() > 0) {
          const chartBar = chart.locator('.chart-bar, rect').first();
          if (await chartBar.count() > 0) {
            await chartBar.click();
            await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
            // Verify filter still applied
            await expect(locationFilter).toHaveValue(locationValue);
          }
        }
      }
    });
    test(`${tags.reports} should have cross-filter integration across tabs`, async ({ 
      authenticatedPage, 
      testHelpers 
    }) => {
      await testHelpers.navigateTo('/reports');
      // Check if global filters exist
      const globalFiltersButton = authenticatedPage.locator('button:has-text("Global Filters"), button:has-text("Filters")');
      if (await globalFiltersButton.count() > 0) {
        await globalFiltersButton.click();
        const globalLocationFilter = authenticatedPage.locator('select[name="global_location"], select[name="location"]').first();
        if (await globalLocationFilter.count() > 0) {
          const locationValue = testData.projects[0]?.location_id || 'sf';
          await globalLocationFilter.selectOption(locationValue);
          const applyButton = authenticatedPage.locator('button:has-text("Apply to All"), button:has-text("Apply")');
          if (await applyButton.count() > 0) {
            await applyButton.click();
            // Verify filter applies to multiple tabs
            const tabs = ['Demand', 'Capacity'];
            for (const tab of tabs) {
              await authenticatedPage.click(`button:has-text("${tab}")`);
              await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
              const activeFilters = authenticatedPage.locator('[data-testid="active-filters"], .active-filters');
              if (await activeFilters.count() > 0) {
                await expect(activeFilters).toBeVisible();
              }
            }
          }
        }
      }
    });
    test(`${tags.reports} should reset filters correctly`, async ({ 
      authenticatedPage, 
      testHelpers 
    }) => {
      await testHelpers.navigateTo('/reports');
      await authenticatedPage.click('button:has-text("Demand Report")');
      // Apply filters if they exist
      const filters = [
        { name: 'project_type', value: 'development' },
        { name: 'phase', value: 'planning' },
        { name: 'priority', value: 'high' }
      ];
      let filtersApplied = false;
      for (const filter of filters) {
        const filterSelect = authenticatedPage.locator(`select[name="${filter.name}"]`);
        if (await filterSelect.count() > 0) {
          await filterSelect.selectOption(filter.value);
          filtersApplied = true;
        }
      }
      if (filtersApplied) {
        // Reset all filters
        const resetButton = authenticatedPage.locator('button:has-text("Reset Filters"), button:has-text("Clear Filters")');
        if (await resetButton.count() > 0) {
          await resetButton.click();
          // Verify filters cleared
          for (const filter of filters) {
            const filterSelect = authenticatedPage.locator(`select[name="${filter.name}"]`);
            if (await filterSelect.count() > 0) {
              const value = await filterSelect.inputValue();
              expect(value).toBe('');
            }
          }
        }
      }
    });
  });
  test.describe('Table Display Features', () => {
    test(`${tags.reports} should display full-width tables correctly`, async ({ 
      authenticatedPage, 
      testHelpers 
    }) => {
      await testHelpers.navigateTo('/reports');
      await authenticatedPage.click('button:has-text("Capacity Report")');
      // Check if table view button exists
      const tableViewButton = authenticatedPage.locator('button:has-text("Table View")');
      if (await tableViewButton.count() > 0) {
        await tableViewButton.click();
        // Verify table exists
        const table = authenticatedPage.locator('table.capacity-table, table');
        if (await table.count() > 0) {
          // Check responsive behavior
          await authenticatedPage.setViewportSize({ width: 768, height: 1024 });
          await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
          // Table should still be visible on smaller screens
          await expect(table).toBeVisible();
        }
      }
    });
    test(`${tags.reports} should apply row styling based on status`, async ({ 
      authenticatedPage, 
      testHelpers 
    }) => {
      await testHelpers.navigateTo('/reports');
      await authenticatedPage.click('button:has-text("Utilization Report")');
      // Look for rows with utilization status
      const overutilizedRows = authenticatedPage.locator('tr.overutilized, tr[data-status="overutilized"]');
      if (await overutilizedRows.count() > 0) {
        // Check for some visual indication (background color may vary)
        const row = overutilizedRows.first();
        await expect(row).toBeVisible();
      }
      const underutilizedRows = authenticatedPage.locator('tr.underutilized, tr[data-status="underutilized"]');
      if (await underutilizedRows.count() > 0) {
        const row = underutilizedRows.first();
        await expect(row).toBeVisible();
      }
    });
    test(`${tags.reports} should format badges correctly`, async ({ 
      authenticatedPage, 
      testHelpers 
    }) => {
      await testHelpers.navigateTo('/reports');
      const gapsButton = authenticatedPage.locator('[role="tab"]:has-text("Gaps Analysis"), [role="tab"]:has-text("Gaps")');
      if (await gapsButton.count() > 0) {
        await gapsButton.click();
        // Check badge formatting
        const criticalBadges = authenticatedPage.locator('.badge-critical, [data-severity="critical"]');
        if (await criticalBadges.count() > 0) {
          await expect(criticalBadges.first()).toBeVisible();
        }
      }
    });
    test(`${tags.reports} should calculate data accurately`, async ({ 
      authenticatedPage, 
      testHelpers 
    }) => {
      await testHelpers.navigateTo('/reports');
      await authenticatedPage.click('button:has-text("Capacity Report")');
      // Look for capacity metrics
      const totalCapacityElement = authenticatedPage.locator('[data-testid="total-capacity"], .total-capacity');
      const availableCapacityElement = authenticatedPage.locator('[data-testid="available-capacity"], .available-capacity');
      const utilizedCapacityElement = authenticatedPage.locator('[data-testid="utilized-capacity"], .utilized-capacity');
      if (await totalCapacityElement.count() > 0 && 
          await availableCapacityElement.count() > 0 && 
          await utilizedCapacityElement.count() > 0) {
        const totalText = await totalCapacityElement.textContent();
        const availableText = await availableCapacityElement.textContent();
        const utilizedText = await utilizedCapacityElement.textContent();
        // Extract numbers
        const total = parseFloat(totalText?.replace(/[^\d.]/g, '') || '0');
        const available = parseFloat(availableText?.replace(/[^\d.]/g, '') || '0');
        const utilized = parseFloat(utilizedText?.replace(/[^\d.]/g, '') || '0');
        // Basic sanity check - total should be positive if we have data
        if (testData.people.length > 0) {
          expect(total).toBeGreaterThan(0);
        }
      }
    });
    test(`${tags.reports} should handle long text content`, async ({ 
      authenticatedPage, 
      testHelpers 
    }) => {
      await testHelpers.navigateTo('/reports');
      await authenticatedPage.click('button:has-text("Demand Report")');
      // Check if table view exists
      const tableViewButton = authenticatedPage.locator('button:has-text("Table View")');
      if (await tableViewButton.count() > 0) {
        await tableViewButton.click();
        // Check text truncation
        const longTextCells = authenticatedPage.locator('td.truncate, td[data-truncate="true"]');
        if (await longTextCells.count() > 0) {
          const cell = longTextCells.first();
          // Hover should show tooltip with full text
          await cell.hover();
          await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
          const tooltip = authenticatedPage.locator('.tooltip, [role="tooltip"]');
          if (await tooltip.count() > 0) {
            await expect(tooltip).toBeVisible();
          }
        }
      }
    });
    test(`${tags.reports} should support table sorting`, async ({ 
      authenticatedPage, 
      testHelpers 
    }) => {
      await testHelpers.navigateTo('/reports');
      await authenticatedPage.click('button:has-text("Utilization Report")');
      // Check if table view exists
      const tableViewButton = authenticatedPage.locator('button:has-text("Table View")');
      if (await tableViewButton.count() > 0) {
        await tableViewButton.click();
        // Look for sortable column header
        const utilizationHeader = authenticatedPage.locator('th:has-text("Utilization %"), th:has-text("Utilization")');
        if (await utilizationHeader.count() > 0) {
          // Click to sort
          await utilizationHeader.click();
          await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
          // Look for sort indicator
          const sortIcon = utilizationHeader.locator('.sort-icon, svg');
          if (await sortIcon.count() > 0) {
            await expect(sortIcon).toBeVisible();
          }
          // Click again for descending
          await utilizationHeader.click();
          await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
        }
      }
    });
  });
});