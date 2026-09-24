/**
 * Scenario Functionality (modernized 2026-09-24, D13)
 * Auth goes through the project fixtures (authenticatedPage); localStorage
 * reads use expect.poll because the scenario auto-selection effect settles
 * shortly after first render.
 */
import { test, expect } from '../../fixtures';

async function readScenario(page: import('@playwright/test').Page): Promise<any> {
  await expect.poll(async () =>
    page.evaluate(() => localStorage.getItem('currentScenario'))
  ).toBeTruthy();
  const raw = await page.evaluate(() => localStorage.getItem('currentScenario'));
  return JSON.parse(raw!);
}

test.describe('Scenario Functionality', () => {
  test('should have baseline scenario in context after app loads', async ({ authenticatedPage }) => {
    const parsed = await readScenario(authenticatedPage);

    expect(parsed).toHaveProperty('id');
    expect(parsed).toHaveProperty('name');
    expect(parsed.scenario_type).toBe('baseline');
  });

  test('should include scenario ID in API request headers', async ({ authenticatedPage }) => {
    const scenario = await readScenario(authenticatedPage);

    let capturedHeaders: any = null;
    authenticatedPage.on('request', request => {
      if (request.url().includes('/api/assignments')) {
        capturedHeaders = request.headers();
      }
    });

    await authenticatedPage.goto('/assignments');
    await authenticatedPage.waitForLoadState('networkidle');

    if (capturedHeaders) {
      expect(capturedHeaders['x-scenario-id']).toBe(scenario.id);
    } else {
      throw new Error('No /api/assignments request captured — scenario header unverifiable');
    }
  });

  test('demand report should show scenario context', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/reports?tab=demand');
    await authenticatedPage.waitForLoadState('networkidle');

    // The context line is "<strong>Current Scenario:</strong> <name>"
    const contextText = await authenticatedPage
      .locator('strong:text("Current Scenario:")').locator('..').textContent();
    expect(contextText).toBeTruthy();
    expect(contextText).toContain('Baseline');
  });

  test('assignments page should load with scenario context', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/assignments');
    await authenticatedPage.waitForLoadState('networkidle');
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

    const hasPageContent = await authenticatedPage
      .locator('.assignments-page, .page-header, h1:has-text("Assignments")').first()
      .isVisible().catch(() => false);
    expect(hasPageContent).toBeTruthy();
  });

  test('should maintain scenario context across page navigation', async ({ authenticatedPage }) => {
    const initialId = (await readScenario(authenticatedPage)).id;

    const pages = ['/projects', '/people', '/assignments', '/reports?tab=demand'];
    for (const pageUrl of pages) {
      await authenticatedPage.goto(pageUrl);
      await authenticatedPage.waitForLoadState('networkidle');

      const current = await readScenario(authenticatedPage);
      expect(current.id).toBe(initialId);
    }
  });

  test('API requests should respect scenario filtering', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/assignments');

    const apiResponse = await authenticatedPage.waitForResponse(
      response => response.url().includes('/api/assignments') && response.status() === 200,
      { timeout: 10000 }
    );

    const headers = apiResponse.request().headers();
    expect(headers['x-scenario-id']).toBeTruthy();
  });
});
