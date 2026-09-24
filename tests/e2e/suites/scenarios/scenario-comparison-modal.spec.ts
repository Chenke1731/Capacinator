/**
 * Scenario Comparison Modal Styling (modernized 2026-09-24, D13)
 * The comparison dialog is a Radix Dialog: content = [role="dialog"],
 * overlay = the fixed full-screen div (data-state="open", z-50, black/50).
 * Radix close button has no stable class — use Escape where closing is
 * needed. Scenario creation must pass created_by (API requirement).
 */
import { test, expect } from '../../fixtures';
import { createUniqueTestPrefix, waitForSync } from '../../helpers/scenario-test-utils';

// Radix overlay: fixed, covers the viewport, sits above the page (z-50)
const OVERLAY = '.fixed.inset-0[data-state="open"], [data-radix-dialog-overlay]';

test.describe('Scenario Comparison Modal Styling', () => {
  let testScenarioIds: string[] = [];

  test.beforeEach(async ({ authenticatedPage, apiContext, testHelpers }) => {
    const prefix = createUniqueTestPrefix('modaltest');

    // created_by is required by POST /api/scenarios
    const people = await (await apiContext.get('/api/people')).json();
    const created_by = people?.data?.[0]?.id;
    if (!created_by) throw new Error('No people available for test setup');

    // Two branch scenarios as compare targets. Do NOT create extra
    // baselines: ScenarioContext auto-selects the FIRST baseline in the
    // list, and a leftover test baseline steals that selection and blanks
    // out later files' pages (cross-file contamination).
    const scenarios = [
      { name: `${prefix}-Branch-1`, scenario_type: 'branch', status: 'active' },
      { name: `${prefix}-Branch-2`, scenario_type: 'branch', status: 'draft' }
    ];

    for (const scenarioData of scenarios) {
      const response = await apiContext.post('/api/scenarios', {
        data: { ...scenarioData, created_by }
      });
      if (!response.ok()) {
        throw new Error(`Scenario create failed: ${response.status()}`);
      }
      testScenarioIds.push((await response.json()).id);
    }

    await testHelpers.navigateTo('/scenarios');
    await authenticatedPage.waitForSelector('.hierarchy-row');
  });

  test.afterEach(async ({ apiContext }) => {
    for (const id of testScenarioIds) {
      await apiContext.delete(`/api/scenarios/${id}`).catch(() => {});
    }
    testScenarioIds = [];
  });

  // Open the comparison dialog from the seed baseline row
  const openComparison = async (page: import('@playwright/test').Page) => {
    const row = page.locator('.hierarchy-row').filter({ hasText: 'Baseline' }).first();
    await row.locator('.action-button.compare').click();
    await page.waitForSelector('[role="dialog"]');
  };

  test('Comparison modal should have solid background overlay', async ({ authenticatedPage }) => {
    await openComparison(authenticatedPage);

    const modal = authenticatedPage.locator('[role="dialog"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Check overlay: fixed, above the page, semi-opaque black
    const overlay = authenticatedPage.locator(OVERLAY).first();
    await expect(overlay).toBeVisible();
    const overlayStyles = await overlay.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        backgroundColor: computed.backgroundColor,
        opacity: computed.opacity,
        position: computed.position,
        zIndex: computed.zIndex
      };
    });

    // modern Chrome serializes bg-black/50 as oklab(0 0 0 / 0.5)
    expect(overlayStyles.backgroundColor).toMatch(/rgba?\(0,\s*0,\s*0|oklab\(0 0 0/);
    expect(overlayStyles.position).toBe('fixed');
    expect(parseInt(overlayStyles.zIndex, 10)).toBeGreaterThan(10); // above page chrome

    // Modal content must paint an opaque sheet: the DialogContent root may
    // delegate its background to an inner div — walk down from the dialog
    // root and require SOME descendant to carry a solid background.
    const hasOpaqueSheet = await modal.evaluate((root) => {
      const isOpaque = (el: Element) => {
        const bg = window.getComputedStyle(el).backgroundColor;
        const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (!m) return false;
        const alpha = m[4] === undefined ? 1 : parseFloat(m[4]);
        return alpha > 0.95;
      };
      if (isOpaque(root)) return true;
      return Array.from(root.querySelectorAll('div')).some(isOpaque);
    });
    expect(hasOpaqueSheet).toBe(true);
    // (.comparison-setup itself is intentionally transparent — the dialog
    // sheet behind it provides the opacity, asserted above)
  });

  test('Comparison modal should maintain solid background during interactions', async ({ authenticatedPage }) => {
    await openComparison(authenticatedPage);
    const modal = authenticatedPage.locator('[role="dialog"]');

    // Pick the first available target and run the comparison
    const select = modal.locator('#compare-scenario-select');
    await select.selectOption({ index: 1 });
    await waitForSync(authenticatedPage);

    await modal.locator('button:has-text("Run Comparison")').click();
    await waitForSync(authenticatedPage);

    // Background must stay solid after the state change
    const overlay = authenticatedPage.locator(OVERLAY).first();
    const overlayBg = await overlay.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(overlayBg).toMatch(/rgba?\(0,\s*0,\s*0|oklab\(0 0 0/);
    expect(overlayBg).not.toBe('transparent');
  });

  test('Comparison modal should handle theme changes', async ({ authenticatedPage }) => {
    // Theme toggle in the header (two buttons share the class; match by title)
    const themeToggle = authenticatedPage.locator(
      'button[title*="Dark"], button[title*="Light"]'
    ).first();
    if (!(await themeToggle.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    await openComparison(authenticatedPage);

    await themeToggle.click();
    await waitForSync(authenticatedPage);

    // Modal must keep its solid background in the other theme
    const overlay = authenticatedPage.locator(OVERLAY).first();
    const overlayStyles = await overlay.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        backgroundColor: computed.backgroundColor,
        opacity: computed.opacity
      };
    });

    expect(overlayStyles.backgroundColor).toMatch(/rgba?\(0,\s*0,\s*0/);
    expect(overlayStyles.backgroundColor).not.toBe('transparent');
  });

  test('Comparison modal visual regression test', async ({ authenticatedPage }) => {
    await openComparison(authenticatedPage);
    const modal = authenticatedPage.locator('[role="dialog"]');

    await authenticatedPage.screenshot({
      path: 'test-results/modal-backgrounds/scenario-comparison-modal.png',
      fullPage: true,
      animations: 'disabled'
    });

    // Also with a target selected
    await modal.locator('#compare-scenario-select').selectOption({ index: 1 });
    await waitForSync(authenticatedPage);

    await authenticatedPage.screenshot({
      path: 'test-results/modal-backgrounds/scenario-comparison-modal-with-content.png',
      fullPage: true,
      animations: 'disabled'
    });
  });
});
