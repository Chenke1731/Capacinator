/**
 * Scenario Test Utilities
 * Common helpers and utilities for scenario-related E2E tests
 */

import { Page, APIRequestContext } from '@playwright/test';

export interface ScenarioTestOptions {
  page: Page;
  apiContext: APIRequestContext;
  testPrefix: string;
}

export class ScenarioTestUtils {
  constructor(private options: ScenarioTestOptions) {}

  /**
   * Wait for scenarios to be visible in the UI with polling
   */
  async waitForScenariosToLoad(expectedCount?: number, timeout = 30000) {
    const { page } = this.options;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      // Check if hierarchy container has loaded
      const hierarchyExists = await page.locator('.scenarios-hierarchy').first().isVisible();
      if (!hierarchyExists) {
        await page.waitForTimeout(1000);
        continue;
      }

      // Count hierarchy rows (the actual scenario items)
      const hierarchyRows = await page.locator('.hierarchy-row').count();
      
      // Also check for table rows if hierarchy rows not found
      const tableRows = await page.locator('tr').filter({ 
        has: page.locator('text=/ACTIVE|DRAFT|ARCHIVED/i')
      }).count();
      
      const totalItems = Math.max(hierarchyRows, tableRows);

      console.log(`Polling: Found ${hierarchyRows} hierarchy rows, ${tableRows} table rows`);

      if (expectedCount) {
        if (totalItems >= expectedCount) {
          return totalItems;
        }
      } else if (totalItems > 0) {
        return totalItems;
      }

      // Try refreshing to load data
      await page.keyboard.press('F5');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
    }

    throw new Error(`Timeout waiting for scenarios to load. Expected: ${expectedCount || 'any'}`);
  }

  /**
   * Get scenario row by name with retry.
   *
   * 2026-09-26 (slice 5): added reload between retries. The page's list can
   * render stale after API-created rows (the fetch returns complete data
   * but the tree keeps the previous snapshot — same stale-list race family
   * the debt ledger recorded in D13; reload-retry is the known cure).
   */
  async getScenarioRow(scenarioName: string, retries = 3) {
    const { page } = this.options;

    for (let i = 0; i < retries; i++) {
      // Try hierarchy row first (tree view)
      let row = page.locator('.hierarchy-row').filter({
        hasText: scenarioName
      });

      if (await row.isVisible()) {
        return row.first();
      }

      // Fallback to table row
      row = page.locator('tr').filter({
        hasText: scenarioName
      }).filter({
        hasNotText: 'NAME'
      });

      if (await row.isVisible()) {
        return row.first();
      }

      console.log(`Retry ${i + 1}/${retries}: Looking for scenario "${scenarioName}" — reloading`);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.scenarios-hierarchy', { timeout: 15000 }).catch(() => {});
    }

    throw new Error(`Could not find scenario row for: ${scenarioName}`);
  }

  /**
   * Create scenario via API with validation
   */
  async createScenario(scenarioData: any) {
    const { apiContext } = this.options;
    
    console.log('Creating scenario:', scenarioData);
    
    const response = await apiContext.post('/api/scenarios', { 
      data: scenarioData 
    });

    if (!response.ok()) {
      const error = await response.text();
      throw new Error(`Failed to create scenario: ${response.status()} - ${error}`);
    }

    const scenario = await response.json();
    
    // Validate the created scenario
    if (!scenario.id) {
      throw new Error('Created scenario has no ID');
    }

    // Wait a moment for database to settle
    await new Promise(resolve => setTimeout(resolve, 500));

    return scenario;
  }

  /**
   * Verify scenarios are visible via API
   */
  async verifyScenariosViaAPI(expectedNames: string[]) {
    const { apiContext } = this.options;
    
    const response = await apiContext.get('/api/scenarios');
    if (!response.ok()) {
      throw new Error(`Failed to fetch scenarios: ${response.status()}`);
    }

    const scenarios = await response.json();
    console.log(`API returned ${scenarios.length} total scenarios`);

    const foundNames = scenarios.map((s: any) => s.name);
    const missing = expectedNames.filter(name => !foundNames.includes(name));

    if (missing.length > 0) {
      console.error('Missing scenarios:', missing);
      console.error('Available scenarios:', foundNames);
      return false;
    }

    return true;
  }

  /**
   * Get action button with better selectors
   */
  getActionButton(row: any, action: 'branch' | 'compare' | 'edit' | 'delete') {
    // Action buttons are in the actions column
    const actionsCell = row.locator('.hierarchy-cell.actions-column, td:last-child');
    
    // Try multiple selector strategies
    const selectors = {
      branch: [
        'button[title*="Branch"]',
        'button[aria-label*="Branch"]',
        'button:has-text("Branch")',
        'button.action-button.branch'
      ],
      compare: [
        'button[title*="Compare"]',
        'button[aria-label*="Compare"]',
        'button:has-text("Compare")',
        'button.action-button.compare'
      ],
      edit: [
        'button[title*="Edit"]',
        'button[aria-label*="Edit"]',
        'button:has-text("Edit")',
        'button.action-button.edit'
      ],
      delete: [
        'button[title*="Delete"]',
        'button[aria-label*="Delete"]',
        'button:has-text("Delete")',
        'button.action-button.delete'
      ]
    };

    // Try each selector within the actions cell
    for (const selector of selectors[action]) {
      const button = actionsCell.locator(selector).first();
      if (button) return button;
    }

    // Fallback to any button in the actions cell
    return actionsCell.locator('button').nth(action === 'branch' ? 0 : action === 'compare' ? 1 : action === 'edit' ? 2 : 3);
  }

  /**
   * Get badge element with flexible selectors
   */
  getBadge(row: any, type: 'type' | 'status') {
    const patterns = {
      type: /baseline|branch|sandbox/i,
      status: /active|draft|archived/i
    };

    // Look for specific scenario class elements — hierarchy rows use
    // .type-column/.status-column; the .scenario-type/.scenario-status
    // classes belong to the card components
    const selectors = {
      type: '.scenario-type, .type-column',
      status: '.scenario-status, .status-column'
    };

    return row.locator(selectors[type]).first();
  }

  /**
   * Switch to a specific scenario using the header dropdown
   */
  async switchToScenario(scenarioName: string) {
    const { page } = this.options;

    const openAndCheck = async (): Promise<boolean> => {
      if (!(await page.locator('.scenario-button').isVisible().catch(() => false))) {
        return false;
      }
      await page.click('.scenario-button');
      await page.waitForSelector('.scenario-dropdown', { state: 'visible' });
      return page.locator('.scenario-option').filter({ hasText: scenarioName }).first()
        .isVisible().catch(() => false);
    };

    // The header list may predate the API-created scenario (stale query) —
    // if the option isn't in the dropdown, reload once and retry.
    if (!(await openAndCheck())) {
      await page.keyboard.press('Escape');
      await page.reload();
      await page.waitForLoadState('networkidle');
      if (!(await openAndCheck())) {
        throw new Error(`Scenario option not in dropdown after reload: ${scenarioName}`);
      }
    }

    // Find and click the scenario option
    const scenarioOption = page.locator('.scenario-option').filter({ hasText: scenarioName }).first();
    await scenarioOption.click();

    // Wait for dropdown to close and data to refresh
    await page.waitForSelector('.scenario-dropdown', { state: 'hidden' });
    await page.waitForLoadState('networkidle');

    // Verify scenario is now selected
    const selectedScenario = await page.locator('.scenario-button .scenario-name').textContent();
    if (!selectedScenario?.includes(scenarioName)) {
      throw new Error(`Failed to switch to scenario: ${scenarioName}`);
    }
  }
  
  /**
   * Cleanup scenarios by prefix
   */
  async cleanupScenariosByPrefix(prefix: string) {
    const { apiContext } = this.options;
    
    try {
      const response = await apiContext.get('/api/scenarios');
      if (!response.ok()) return;

      const scenarios = await response.json();
      const toDelete = scenarios.filter((s: any) => 
        s.name.startsWith(prefix) && s.scenario_type !== 'baseline'
      );

      for (const scenario of toDelete) {
        try {
          await apiContext.delete(`/api/scenarios/${scenario.id}`);
          console.log(`🗑️ Deleted scenario: ${scenario.name}`);
        } catch (err) {
          console.warn(`Failed to delete ${scenario.name}:`, err);
        }
      }
    } catch (error) {
      console.warn('Cleanup error:', error);
    }
  }
}

/**
 * Create a unique test prefix with timestamp
 */
export function createUniqueTestPrefix(base: string): string {
  const timestamp = Date.now().toString(36).slice(-4);
  return `${base}-${timestamp}`;
}

/**
 * Wait for API and UI to sync
 */
export async function waitForSync(page: Page, timeout = 5000) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  // Force a re-render by toggling a filter or refreshing. Skip while a
  // modal dialog is open — the overlay makes the Filters button unclickable
  // and this helper would time out the calling test.
  const dialogOpen = await page.locator('[role="dialog"]').isVisible().catch(() => false);
  if (dialogOpen) return;

  const filterButton = page.locator('button:has-text("Filters")');
  if (await filterButton.isVisible()) {
    await filterButton.click();
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
  }
}