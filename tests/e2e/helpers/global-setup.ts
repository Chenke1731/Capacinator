/**
 * Global Setup for E2E Tests
 * Runs once before all tests
 */

import { chromium, FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting global e2e test setup...');
  
  const baseURL = config.projects[0]?.use?.baseURL || 'http://localhost:3122';
  
  // Create a browser instance for setup
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // First check server health via API
    console.log('⏳ Checking server health...');
    const healthResponse = await page.request.get(`${baseURL}/api/health`);
    if (healthResponse.status() !== 200) {
      throw new Error(`Server health check failed with status ${healthResponse.status()}`);
    }
    console.log('✅ Server is healthy');
    
    // Navigate to the application
    console.log('⏳ Loading application...');
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle');
    
    // Check if profile selection is needed (for initial setup)
    const profileModal = page.locator('text=Select Your Profile');
    if (await profileModal.isVisible({ timeout: 5000 })) {
      console.log('🔐 Handling initial profile selection...');
      
      // Select first available profile
      const select = page.locator('select').first();
      const options = await select.locator('option').all();
      if (options.length > 1) {
        const value = await options[1].getAttribute('value');
        await select.selectOption(value!);
        
        // Click Continue
        const continueBtn = page.locator('button:has-text("Continue")');
        
        // Wait for button to be visible first
        await continueBtn.waitFor({ state: 'visible', timeout: 10000 });
        
        // Wait for it to be enabled
        await page.waitForFunction(
          () => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const continueBtn = buttons.find(btn => btn.textContent?.includes('Continue'));
            return continueBtn && !continueBtn.hasAttribute('disabled');
          },
          { timeout: 10000 }
        );
        
        await continueBtn.click();
        
        // Wait for modal to close
        await profileModal.waitFor({ state: 'detached', timeout: 10000 });
      }
    }
    
    // Verify application is ready
    await page.waitForSelector('.sidebar, nav', { timeout: 30000 });
    console.log('✅ Application is ready for testing');
    
    // Set up any global test data if needed
    await setupGlobalTestData(page, baseURL);
    
    // Store global state for tests
    process.env.TEST_BASE_URL = baseURL;
    process.env.TEST_RUN_ID = `e2e-${Date.now()}`;
    process.env.TEST_SETUP_COMPLETE = 'true';
    
  } catch (error) {
    console.error('❌ Global setup failed:', error);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function setupGlobalTestData(page: any, baseURL: string) {
  console.log('🔧 Verifying test data...');
  
  try {
    // Check basic reference data via API
    const checks = [
      { endpoint: '/api/locations', name: 'locations' },
      { endpoint: '/api/roles', name: 'roles' },
      { endpoint: '/api/project-types', name: 'project types' },
      { endpoint: '/api/people', name: 'people' },
    ];
    
    for (const check of checks) {
      try {
        const response = await page.request.get(`${baseURL}${check.endpoint}`);
        if (response.ok()) {
          const data = await response.json();
          const count = data.data?.length || 0;
          console.log(`✅ Found ${count} ${check.name}`);
          
          // Warn if no data
          if (count === 0) {
            console.warn(`⚠️  No ${check.name} found - some tests may fail`);
          }
        }
      } catch (error) {
        console.warn(`⚠️  Failed to check ${check.name}:`, error.message);
      }
    }
    
    console.log('✅ Test data verification complete');
  } catch (error) {
    console.warn('⚠️  Test data setup encountered issues:', error);
    // Don't fail the entire setup if reference data check fails
  }
}

export default globalSetup;