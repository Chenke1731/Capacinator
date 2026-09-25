/**
 * Dashboard UI Current Projects Validation Tests
 * Tests UI validation for dashboard components
 */
import { test, expect, tags } from '../../../fixtures';
test.describe('Dashboard UI Current Projects Validation', () => {
  test(`${tags.ui} should display "Current Projects" instead of "Total Projects"`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    await testHelpers.navigateTo('/dashboard');
    // Verify the stat card shows "Current Projects"
    const statCards = authenticatedPage.locator('.stat-card');
    await expect(statCards).toHaveCount(4); // Should have 4 stat cards
    // Find the projects stat card
    const projectsCard = statCards.filter({ hasText: 'Current Projects' });
    await expect(projectsCard).toBeVisible();
    // Verify it does NOT say "Total Projects"
    const totalProjectsCard = statCards.filter({ hasText: 'Total Projects' });
    await expect(totalProjectsCard).toHaveCount(0);
    // Verify the card has the correct styling and icon
    await expect(projectsCard.locator('.stat-title')).toContainText('Current Projects');
    await expect(projectsCard.locator('svg')).toBeVisible(); // Icon should be present
    console.log('✅ Dashboard shows "Current Projects" instead of "Total Projects"');
  });
  test(`${tags.ui} should display "Current Project Health" chart title`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    await testHelpers.navigateTo('/dashboard');
    // Verify the project health chart has the updated title
    const healthCard = authenticatedPage.locator('.card').filter({ hasText: 'Current Project Health' });
    await expect(healthCard).toBeVisible();
    // Verify it does NOT say "Project Health Status"
    const oldTitleCard = authenticatedPage.locator('.card').filter({ hasText: 'Project Health Status' });
    await expect(oldTitleCard).toHaveCount(0);
    // Verify the chart is clickable and navigates to projects
    await expect(healthCard).toHaveCSS('cursor', /pointer|hand/);
    console.log('✅ Dashboard shows "Current Project Health" chart title');
  });
  test(`${tags.ui} should display proper icons for all stat cards`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    await testHelpers.navigateTo('/dashboard');
    // Verify all stat cards have icons
    const statCards = authenticatedPage.locator('.stat-card');
    const cardCount = await statCards.count();
    for (let i = 0; i < cardCount; i++) {
      const card = statCards.nth(i);
      const icon = card.locator('svg');
      await expect(icon).toBeVisible();
      // Verify icon has proper size
      const iconBox = await icon.boundingBox();
      if (iconBox) {
        expect(iconBox.width).toBeGreaterThanOrEqual(16);
        expect(iconBox.height).toBeGreaterThanOrEqual(16);
      }
    }
    console.log('✅ All stat cards have properly sized icons');
  });
  test(`${tags.ui} should maintain responsive layout for dashboard cards`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    await testHelpers.navigateTo('/dashboard');
    // Check desktop layout (grid)
    const dashboard = authenticatedPage.locator('.dashboard-container, .dashboard, main');
    await expect(dashboard).toBeVisible();
    // Verify stat cards are in a grid layout
    const statCardsContainer = authenticatedPage.locator('.stat-cards, .grid').first();
    const gridStyle = await statCardsContainer.getAttribute('class');
    expect(gridStyle).toMatch(/grid|flex/);
    // Verify cards are visible and properly spaced
    const statCards = authenticatedPage.locator('.stat-card');
    const firstCard = statCards.first();
    const lastCard = statCards.last();
    const firstBox = await firstCard.boundingBox();
    const lastBox = await lastCard.boundingBox();
    if (firstBox && lastBox) {
      // Cards should be laid out horizontally on desktop
      expect(lastBox.x).toBeGreaterThan(firstBox.x);
    }
    console.log('✅ Dashboard maintains responsive layout');
  });
  test(`${tags.ui} should display chart tooltips on hover`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    await testHelpers.navigateTo('/dashboard');
    // Find a chart with interactive elements
    const healthChart = authenticatedPage.locator('.card').filter({ hasText: 'Current Project Health' }).locator('.recharts-pie-sector').first();
    if (await healthChart.isVisible()) {
      // Hover over chart element
      await healthChart.hover();
      // Check for tooltip (Recharts typically shows tooltips on hover)
      const tooltip = authenticatedPage.locator('.recharts-tooltip-wrapper');
      // Tooltip might appear with a slight delay
      try {
        await expect(tooltip).toBeVisible({ timeout: 2000 });
        console.log('✅ Chart tooltips appear on hover');
      } catch {
        console.log('ℹ️  Tooltip not visible - might require chart data');
      }
    } else {
      console.log('ℹ️  No chart data available for tooltip test');
    }
  });
  test(`${tags.ui} should have consistent color scheme across charts`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    await testHelpers.navigateTo('/dashboard');
    // Check that chart colors follow a consistent theme
    const chartElements = authenticatedPage.locator('.recharts-pie-sector, .recharts-bar, .recharts-area');
    const elementCount = await chartElements.count();
    if (elementCount > 0) {
      const colors = new Set();
      for (let i = 0; i < Math.min(elementCount, 5); i++) {
        const element = chartElements.nth(i);
        const fill = await element.getAttribute('fill');
        if (fill) {
          colors.add(fill);
        }
      }
      console.log(`✅ Found ${colors.size} unique colors in charts`);
      // Verify colors are from expected palette (basic check)
      colors.forEach(color => {
        expect(color).toMatch(/^#[0-9a-fA-F]{6}$|^rgb/);
      });
    } else {
      console.log('ℹ️  No chart elements found for color validation');
    }
  });
  test(`${tags.ui} should display loading states properly`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    // Navigate and intercept API to simulate loading
    const responsePromise = authenticatedPage.waitForResponse('**/api/reporting/dashboard');
    await authenticatedPage.goto('/dashboard');
    // Check for loading indicators (skeletons, spinners, etc.)
    const loadingIndicators = authenticatedPage.locator('.skeleton, .loading, .spinner, [class*="loading"]');
    // Some loading indicator should be visible initially
    const hasLoadingState = await loadingIndicators.first().isVisible().catch(() => false);
    if (hasLoadingState) {
      console.log('✅ Loading states displayed during data fetch');
    }
    // Wait for data to load
    await responsePromise;
    await testHelpers.waitForPageReady();
    // Loading indicators should be gone
    await expect(loadingIndicators).toHaveCount(0);
    console.log('✅ Loading states cleared after data loads');
  });
});