import { test, expect } from './fixtures'
test.describe('New E2E Setup Verification', () => {
  test('should load application and navigate', async ({ authenticatedPage, testHelpers }) => {
    // The base URL should be set from config
    await testHelpers.navigateTo('/');
    // Should have main navigation
    await expect(authenticatedPage.locator('nav, [role="navigation"], a[href="/people"]').first()).toBeVisible({
      timeout: 15000
    });
    console.log('✅ Application loaded successfully');
    // Navigate to People page
    await authenticatedPage.click('a[href="/people"]');
    // Wait for People page to load
    await expect(page).toHaveURL(/\/people/);
    await expect(authenticatedPage.locator('h1, h2').filter({ hasText: /People/i }).first()).toBeVisible();
    console.log('✅ Navigation working correctly');
  });
  test('should have working API', async ({ request }) => {
    // Test health endpoint
    const healthResponse = await request.get('/api/health');
    expect(healthResponse.ok()).toBeTruthy();
    const healthData = await healthResponse.json();
    expect(healthData.status).toBe('ok');
    console.log('✅ API health check passed');
    // Test data endpoints
    const peopleResponse = await request.get('/api/people');
    expect(peopleResponse.ok()).toBeTruthy();
    const peopleData = await peopleResponse.json();
    expect(peopleData).toHaveProperty('data');
    expect(Array.isArray(peopleData.data)).toBeTruthy();
    console.log(`✅ API returned ${peopleData.data.length} people`);
  });
  test('should persist authentication state', async ({ authenticatedPage, testHelpers }) => {
    // Check if user is authenticated
    const userData = await authenticatedPage.evaluate(() => {
      return {
        user: localStorage.getItem('capacinator_current_user'),
        hasUser: !!localStorage.getItem('capacinator_current_user')
      };
    });
    expect(userData.hasUser).toBeTruthy();
    console.log('✅ Authentication state persisted');
    // Should not show profile selection modal
    await testHelpers.navigateTo('/');
    await expect(authenticatedPage.locator('text="Select Your Profile"')).not.toBeVisible({
      timeout: 5000
    });
    console.log('✅ Profile selection bypassed for authenticated user');
  });
});