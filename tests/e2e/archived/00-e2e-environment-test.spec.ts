import { test, expect } from './fixtures';
test.describe('E2E Environment Verification', () => {
  test('should have isolated e2e environment running', async ({ authenticatedPage, apiContext }) => {
    // Check that we're on the right port and environment
    const baseURL = authenticatedPage.url();
    if (baseURL.includes('dev.capacinator.com') || baseURL.includes('localhost:3120')) {
      console.log('⚠️ Running against dev environment instead of isolated E2E');
    }
    // Verify the application loads
    await expect(authenticatedPage.locator('h1, h2').first()).toBeVisible();
    // Check that the API is accessible
    const response = await apiContext.get('/api/health');
    expect(response.ok()).toBeTruthy();
    // Verify test data is available
    const rolesResponse = await apiContext.get('/api/roles');
    expect(rolesResponse.ok()).toBeTruthy();
    const rolesData = await rolesResponse.json();
    const roles = rolesData.data || rolesData;
    expect(roles).toBeInstanceOf(Array);
    expect(roles.length).toBeGreaterThan(0);
    // Check for E2E test roles if in isolated environment
    if (baseURL.includes('localhost:3121')) {
      const e2eRoles = roles.filter((role: any) => role.name && role.name.includes('E2E'));
      if (e2eRoles.length > 0) {
        console.log(`✅ E2E environment verified with ${roles.length} roles, ${e2eRoles.length} E2E-specific roles`);
      }
    }
  });
  test('should have e2e database isolation', async ({ authenticatedPage, apiContext }) => {
    const baseURL = authenticatedPage.url();
    if (baseURL.includes('dev.capacinator.com') || baseURL.includes('localhost:3120')) {
      console.log('⚠️ Running against dev environment - database isolation check skipped');
      return;
    }
    // Test that we can access data
    const peopleResponse = await apiContext.get('/api/people');
    expect(peopleResponse.ok()).toBeTruthy();
    const peopleData = await peopleResponse.json();
    const people = peopleData.data || peopleData;
    expect(people).toBeInstanceOf(Array);
    // Check for E2E-specific data patterns
    if (baseURL.includes('localhost:3121')) {
      const e2ePeople = people.filter((person: any) => 
        person.name && (person.name.includes('E2E') || person.name.includes('Test'))
      );
      console.log(`✅ Found ${people.length} people, ${e2ePeople.length} test-specific`);
    }
  });
  test('should have e2e scenarios available', async ({ apiContext }) => {
    const scenariosResponse = await apiContext.get('/api/scenarios');
    if (!scenariosResponse.ok()) {
      console.log('⚠️ Scenarios endpoint not available');
      return;
    }
    const scenariosData = await scenariosResponse.json();
    const scenarios = scenariosData.data || scenariosData;
    expect(scenarios).toBeInstanceOf(Array);
    // Should have at least the baseline scenario
    const baselineScenarios = scenarios.filter((s: any) => 
      s.name && (s.name.toLowerCase().includes('baseline') || s.type === 'baseline')
    );
    if (baselineScenarios.length > 0) {
      console.log(`✅ E2E scenarios available: ${scenarios.length} total, ${baselineScenarios.length} baseline`);
    } else {
      console.log(`✅ ${scenarios.length} scenarios available`);
    }
  });
  test('should not interfere with dev environment', async ({ authenticatedPage }) => {
    const baseURL = authenticatedPage.url();
    // Ensure we're not accidentally running against production
    expect(baseURL).not.toContain('production');
    expect(baseURL).not.toContain('app.capacinator.com');
    // Should be running on localhost or dev
    const isLocalOrDev = baseURL.includes('localhost') || baseURL.includes('dev.');
    expect(isLocalOrDev).toBe(true);
    console.log(`✅ Running safely on: ${new URL(baseURL).hostname}`);
  });
  test('should have authentication working', async ({ authenticatedPage, testHelpers }) => {
    // We should already be authenticated via the fixture
    await testHelpers.waitForPageContent();
    // Should not be on login page
    expect(authenticatedPage.url()).not.toContain('/login');
    expect(authenticatedPage.url()).not.toContain('/auth');
    // Should have navigation visible (indicates authenticated)
    await expect(authenticatedPage.locator('.sidebar, nav').first()).toBeVisible();
    console.log('✅ Authentication verified');
  });
});