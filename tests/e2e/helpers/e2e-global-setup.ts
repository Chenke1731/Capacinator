import { chromium, FullConfig, Browser, BrowserContext, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { spawn, ChildProcess, execSync } from 'child_process';
import dotenv from 'dotenv';

// Load E2E environment variables before anything else
dotenv.config({ path: path.resolve(process.cwd(), '.env.e2e') });

// Import E2E database initialization
import { initializeE2EDatabase } from '../../../src/server/database/init-e2e.js';
import { E2EProcessManager } from './process-manager.js';
import { portCleanup, E2E_PORTS } from './port-cleanup.js';
import { EnvironmentValidator } from './environment-validator.js';
import { registerE2ECleanup } from './cleanup-hook.js';

// Use process manager for better process lifecycle management
const processManager = new E2EProcessManager();

async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting E2E global setup...');
  
  // Generate test run ID for this session
  const testRunId = `e2e-${Date.now()}`;
  process.env.TEST_RUN_ID = testRunId;
  
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  
  try {
    // Step 0: Validate and prepare environment
    console.log('🔍 Validating E2E environment...');
    const validator = new EnvironmentValidator({ verbose: true });
    let validationResult = await validator.validate();
    
    if (!validationResult.valid) {
      console.log('🔧 Environment validation failed, attempting auto-fix...');
      await validator.autoFix();
      
      // Re-validate after auto-fix
      validationResult = await validator.validate();
      if (!validationResult.valid) {
        throw new Error(`Environment validation failed: ${validationResult.errors.join(', ')}`);
      }
    }
    
    // Clean up any stale processes and ports
    console.log('🧹 Cleaning up stale processes and ports...');
    await processManager.cleanupStalePidFiles();
    await processManager.killAllFromPidFiles();
    
    // Ensure E2E ports are free
    const cleanupSuccess = await portCleanup.cleanupE2EPorts();
    if (!cleanupSuccess) {
      throw new Error('Failed to cleanup E2E ports');
    }
    
    // Acquire lock to prevent concurrent test runs
    const lockAcquired = await processManager.acquireLock();
    if (!lockAcquired) {
      throw new Error('Another E2E test run is in progress');
    }
    
    // Register cleanup hook to ensure cleanup happens even on unexpected exit
    registerE2ECleanup(processManager);
    
    // Step 1: Initialize E2E database
    console.log('🗄️ Initializing E2E database...');
    try {
      await initializeE2EDatabase();
      console.log('✅ E2E database initialized successfully');
    } catch (dbError) {
      console.error('❌ Failed to initialize E2E database:', dbError);
      throw dbError;
    }
    
    // Step 2: Check if server is already running
    const baseURL = config.projects[0].use.baseURL || `http://localhost:${E2E_PORTS.frontend}`;
    const serverRunning = await checkServerRunning(baseURL);

    if (serverRunning) {
      console.log(`ℹ️ E2E server already running on ports ${E2E_PORTS.backend}/${E2E_PORTS.frontend}`);
      console.log('   E2E tests will reuse the existing E2E server and database.');
    } else {
      // Step 3: Start E2E server using process manager
      console.log('🚀 Starting E2E server...');
      await startDevServerWithProcessManager();
      
      // Wait for server to be ready
      await waitForServer(baseURL, 60); // 60 second timeout
    }
    
    // Step 3: Launch browser for setup
    browser = await chromium.launch({ 
      headless: process.env.HEADED !== 'true',
      args: ['--disable-blink-features=AutomationControlled']
    });
    
    context = await browser.newContext({ 
      ignoreHTTPSErrors: true,
      viewport: { width: 1280, height: 720 }
    });
    
    page = await context.newPage();
    
    // Enable console logging for debugging
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`Browser console error: ${msg.text()}`);
      }
    });
    
    // Step 4: Wait for application to be ready
    await waitForApplication(page, baseURL);
    
    // Step 5: Verify test data
    await verifyTestData(page, baseURL);
    
    // Step 6: Handle initial profile selection
    await handleInitialProfileSelection(page, baseURL);
    
    // Step 7: Save authentication state
    await saveAuthState(context);
    
    console.log('✅ E2E global setup completed successfully');
    
    // Store process manager reference for teardown
    (global as any).__E2E_PROCESS_MANAGER__ = processManager;
    
  } catch (error) {
    console.error('❌ E2E global setup failed:', error);
    
    // Clean up on failure
    console.log('🛑 Cleaning up due to setup failure...');
    await processManager.stopAll();
    await processManager.releaseLock();
    
    throw error;
  } finally {
    // Clean up browser resources
    if (page) await page.close();
    if (context) await context.close();
    if (browser) await browser.close();
  }
}

async function checkServerRunning(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    // Check the API health endpoint directly on server port
    const serverUrl = url.replace(`:${E2E_PORTS.frontend}`, `:${E2E_PORTS.backend}`);
    const response = await fetch(`${serverUrl}/api/health`, { 
      signal: controller.signal 
    });
    
    clearTimeout(timeout);
    return response.ok;
  } catch (error) {
    return false;
  }
}

async function startDevServerWithProcessManager(): Promise<void> {
  const env = {
    NODE_ENV: 'e2e',
    PORT: String(E2E_PORTS.backend),
    CLIENT_PORT: String(E2E_PORTS.frontend),
    FORCE_COLOR: '0',
    // Enable audit service for E2E tests
    AUDIT_ENABLED: 'true',
    AUDIT_MAX_HISTORY_ENTRIES: '1000',
    AUDIT_RETENTION_DAYS: '365',
    AUDIT_ENABLED_TABLES: 'people,projects,roles,assignments,availability,project_assignments,scenario_project_assignments',
    AUDIT_SENSITIVE_FIELDS: 'password,token,secret,key,hash'
  };
  
  // Start backend server
  await processManager.startProcess('e2e-backend',
    ['npx', 'tsx', 'src/server/index.ts'],
    {
      env,
      port: E2E_PORTS.backend,
      // Match on database initialization complete - this is the reliable startup indicator
      // The structured logger may not output "Server running" in plain text format
      waitForOutput: /E2E database initialized|Server running|Production mode/,
      timeout: 60000 // Increase timeout to allow for database migrations
    }
  );
  
  // Start frontend server (--port/--strictPort beat client-vite.config.ts, which only
  // reads VITE_PORT from .env files — a process.env VITE_PORT would be ignored)
  await processManager.startProcess('e2e-frontend',
    ['npx', 'vite', '--config', 'client-vite.config.ts', '--port', String(E2E_PORTS.frontend), '--strictPort'],
    {
      env,
      port: E2E_PORTS.frontend,
      waitForOutput: /ready in|Local:/,
      timeout: 30000
    }
  );
}

async function waitForServer(url: string, maxSeconds: number): Promise<void> {
  console.log(`⏳ Waiting for server at ${url}...`);
  
  const startTime = Date.now();
  const maxTime = maxSeconds * 1000;
  
  while (Date.now() - startTime < maxTime) {
    // checkServerRunning now handles the port conversion
    if (await checkServerRunning(url)) {
      console.log('✅ Server is ready');
      return;
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  throw new Error(`Server failed to start within ${maxSeconds} seconds`);
}

async function waitForApplication(page: Page, baseURL: string) {
  console.log('⏳ Waiting for application to be ready...');
  
  const maxAttempts = 30;
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    try {
      // Try to load the application
      await page.goto(baseURL, { 
        waitUntil: 'domcontentloaded',
        timeout: 10000 
      });
      
      // Check if React app is loaded
      const hasReactRoot = await page.evaluate(() => {
        return document.querySelector('#root') !== null || 
               document.querySelector('[data-reactroot]') !== null;
      });
      
      if (hasReactRoot) {
        console.log('✅ Application is ready');
        return;
      }
      
    } catch (error) {
      attempts++;
      if (attempts >= maxAttempts) {
        throw new Error(`Application failed to start after ${maxAttempts} attempts: ${error}`);
      }
      console.log(`⏳ Attempt ${attempts}/${maxAttempts} failed, retrying in 1s...`);
      await page.waitForTimeout(1000);
    }
  }
}

async function verifyTestData(page: Page, baseURL: string) {
  console.log('🔍 Verifying test data...');
  
  try {
    // Test API connectivity using same port (Vite proxies /api)
    const healthResponse = await page.request.get(`${baseURL}/api/health`);
    if (!healthResponse.ok()) {
      throw new Error(`API health check failed: ${healthResponse.status()}`);
    }
    console.log('✅ API health check passed');
    
    // Verify essential test data
    const endpoints = ['/api/roles'];
    
    for (const endpoint of endpoints) {
      try {
        const response = await page.request.get(`${baseURL}${endpoint}`);
        if (!response.ok()) {
          console.warn(`⚠️ ${endpoint} returned ${response.status()}`);
        } else {
          const data = await response.json();
          console.log(`✅ ${endpoint}: ${Array.isArray(data) ? data.length : 'OK'} items`);
        }
      } catch (err) {
        console.warn(`⚠️ ${endpoint} request failed:`, err);
      }
    }
    
  } catch (error) {
    console.error('⚠️ Test data verification failed:', error);
    // Don't fail setup for data issues
  }
}

async function handleInitialProfileSelection(page: Page, baseURL: string) {
  console.log('🔍 Handling initial profile selection...');
  
  try {
    // Navigate to the application
    await page.goto(baseURL, { waitUntil: 'networkidle' });
    
    // Wait for either profile modal or main app
    const profileModalSelector = 'text=Select Your Profile';
    const mainAppSelector = '.sidebar, nav, [data-testid="navigation"]';
    
    // Race to see what appears first
    const result = await Promise.race([
      page.waitForSelector(profileModalSelector, { timeout: 5000 })
        .then(() => 'profile-modal'),
      page.waitForSelector(mainAppSelector, { timeout: 5000 })
        .then(() => 'main-app')
    ]).catch(() => null);
    
    if (result === 'profile-modal') {
      console.log('📋 Profile selection modal detected');
      
      // Handle profile selection
      await selectProfile(page);
      
      console.log('✅ Profile selected and saved');
    } else if (result === 'main-app') {
      console.log('✅ Already authenticated, skipping profile selection');
    } else {
      console.warn('⚠️ Neither profile modal nor main app detected');
    }
    
  } catch (error) {
    console.error('⚠️ Profile selection handling failed:', error);
    // Don't fail setup for profile selection issues
  }
}

async function selectProfile(page: Page) {
  console.log('🎯 Starting profile selection...');
  
  const maxAttempts = 3;
  let attemptCount = 0;
  let profileSelected = false;
  
  while (attemptCount < maxAttempts && !profileSelected) {
    attemptCount++;
    console.log(`\n📍 Attempt ${attemptCount}/${maxAttempts} to select profile...`);
    
    try {
      // Wait for the Select trigger button using id
      const selectTrigger = page.locator('#person-select');
      await selectTrigger.waitFor({ state: 'visible', timeout: 10000 });
      
      // Log current page state
      const triggerText = await selectTrigger.textContent();
      console.log(`Select trigger text: "${triggerText}"`);
      
      // Take screenshot before clicking
      await page.screenshot({ 
        path: `/tmp/profile-before-click-attempt-${attemptCount}.png`,
        fullPage: true 
      });
      
      // Click the select trigger to open dropdown
      console.log('📂 Opening profile dropdown...');
      await selectTrigger.click();
      
      // Wait for dropdown animation
      await page.waitForTimeout(1000);
      
      // Try multiple strategies to find dropdown options
      let options = null;
      let optionCount = 0;
      const strategies = [
        {
          name: 'Standard role="option"',
          selector: '[role="option"]:visible',
          timeout: 3000
        },
        {
          name: 'Radix collection items',
          selector: '[data-radix-collection-item]:visible',
          timeout: 2000
        },
        {
          name: 'Portal with role="option"',
          selector: '[data-radix-popper-content-wrapper] [role="option"]:visible',
          timeout: 2000
        },
        {
          name: 'Any SelectItem in portal',
          selector: '[data-radix-portal] [role="option"]:visible',
          timeout: 2000
        },
        {
          name: 'Direct SelectContent children',
          selector: '[role="listbox"] [role="option"]:visible',
          timeout: 2000
        }
      ];
      
      for (const strategy of strategies) {
        try {
          console.log(`🔍 Trying strategy: ${strategy.name}`);
          options = page.locator(strategy.selector);
          await options.first().waitFor({ state: 'visible', timeout: strategy.timeout });
          optionCount = await options.count();
          console.log(`✅ ${strategy.name}: Found ${optionCount} options`);
          if (optionCount > 0) break;
        } catch (e) {
          console.log(`⚠️ ${strategy.name}: No visible options`);
        }
      }
      
      // If still no options, try keyboard navigation
      if (optionCount === 0) {
        console.log('🎹 Trying keyboard navigation...');
        await selectTrigger.focus();
        await page.keyboard.press('Space');
        await page.waitForTimeout(500);
        
        // Check again for options
        options = page.locator('[role="option"]:visible');
        optionCount = await options.count();
        console.log(`📊 After keyboard activation: ${optionCount} options`);
      }
      
      // Take screenshot of dropdown state
      await page.screenshot({ 
        path: `/tmp/profile-dropdown-state-attempt-${attemptCount}.png`,
        fullPage: true 
      });
      
      // Log DOM structure for debugging
      const portalCount = await page.locator('[data-radix-portal]').count();
      const popperCount = await page.locator('[data-radix-popper-content-wrapper]').count();
      console.log(`DOM state: ${portalCount} portals, ${popperCount} popper wrappers`);
      
      if (optionCount > 0) {
        // Get all option texts
        const optionTexts = await options.evaluateAll(elements => 
          elements.map(el => el.textContent?.trim() || '')
        );
        console.log('Available profiles:', optionTexts);
        
        // Select the first valid option
        const targetOption = optionTexts.findIndex(text => text.length > 0);
        const optionToSelect = targetOption >= 0 ? targetOption : 0;
        const selectedText = optionTexts[optionToSelect];
        
        console.log(`Selecting profile: "${selectedText}"`);
        await options.nth(optionToSelect).click({ force: true });
        
        // Wait for selection to register
        await page.waitForTimeout(500);
        
        // Verify selection was made
        const currentValue = await selectTrigger.textContent();
        console.log(`Select value after click: "${currentValue}"`);
        
        // Wait for Continue button
        const continueButton = page.locator('button:has-text("Continue")');
        await continueButton.waitFor({ state: 'visible', timeout: 5000 });
        
        // Wait for button to be enabled
        await page.waitForFunction(
          () => {
            const btn = document.querySelector('button[type="submit"]');
            return btn && !btn.disabled && !btn.hasAttribute('disabled');
          },
          { timeout: 5000 }
        );
        
        // Click Continue
        console.log('👆 Clicking Continue button...');
        await continueButton.click();
        
        // Wait for modal to close
        await page.waitForSelector('text="Select Your Profile"', { 
          state: 'detached',
          timeout: 10000 
        });
        
        console.log('✅ Profile selected successfully');
        profileSelected = true;
        
        // Wait for navigation to complete
        await page.waitForLoadState('networkidle');
        
        // Save user data to auth state
        const userData = { name: selectedText, profileSelected: true };
        await page.evaluate((data) => {
          localStorage.setItem('selectedProfile', JSON.stringify(data));
        }, userData);
        
      } else {
        throw new Error(`No profile options found on attempt ${attemptCount}`);
      }
      
    } catch (error) {
      console.error(`❌ Attempt ${attemptCount} failed:`, error);
      
      if (attemptCount < maxAttempts) {
        console.log('🔄 Retrying...');
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);
      } else {
        // Final attempt failed, try API fallback
        console.log('🔌 All UI attempts failed, trying API fallback...');
        await handleProfileSelectionViaAPI(page);
        profileSelected = true;
      }
    }
  }
  
  if (!profileSelected) {
    throw new Error('Failed to select profile after all attempts');
  }
}

async function handleProfileSelectionViaAPI(page: Page) {
  console.log('🔌 Using API fallback for profile selection...');
  
  try {
    // Fetch people list via API
    const baseURL = page.url().split('/')[0] + '//' + page.url().split('/')[2];
    const peopleResponse = await page.request.get(`${baseURL}/api/people`);
    
    if (!peopleResponse.ok()) {
      throw new Error(`Failed to fetch people: ${peopleResponse.status()}`);
    }
    
    const peopleData = await peopleResponse.json();
    const people = peopleData.data || peopleData;
    
    if (!Array.isArray(people) || people.length === 0) {
      throw new Error('No people found in API response');
    }
    
    // Select the first person
    const selectedPerson = people[0];
    console.log(`API fallback: Selecting ${selectedPerson.name}`);
    
    // Set auth data directly in localStorage
    await page.evaluate((person) => {
      localStorage.setItem('capacinator_current_user', JSON.stringify(person));
      localStorage.setItem('selectedProfile', JSON.stringify({
        name: person.name,
        id: person.id,
        profileSelected: true
      }));
      // Trigger storage event for any listeners
      window.dispatchEvent(new Event('storage'));
    }, selectedPerson);
    
    // Reload page to apply the selection
    await page.reload({ waitUntil: 'networkidle' });
    
    console.log('✅ Profile selected via API fallback');
  } catch (error) {
    console.error('❌ API fallback failed:', error);
    throw error;
  }
}

async function saveAuthState(context: BrowserContext) {
  try {
    // Create test-results directory if it doesn't exist
    const authDir = path.resolve('test-results');
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }
    
    // Get the current page from context
    const pages = context.pages();
    if (pages.length > 0) {
      const page = pages[0];
      
      // Ensure user data is in localStorage before saving
      const userData = await page.evaluate(() => {
        const currentUser = localStorage.getItem('capacinator_current_user');
        const selectedProfile = localStorage.getItem('selectedProfile');
        return { currentUser, selectedProfile };
      });
      
      console.log('💾 Current auth data:', {
        hasCurrentUser: !!userData.currentUser,
        hasSelectedProfile: !!userData.selectedProfile
      });
    }
    
    // Save the storage state
    const authPath = path.join(authDir, 'e2e-auth.json');
    await context.storageState({ path: authPath });
    
    console.log(`💾 Authentication state saved to ${authPath}`);
    
    // Verify the saved state
    const savedState = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
    const hasLocalStorage = savedState.origins?.some((origin: any) => 
      origin.localStorage?.length > 0
    );
    console.log(`✅ Saved state verification: ${hasLocalStorage ? 'Contains localStorage data' : 'No localStorage data'}`);
    
  } catch (error) {
    console.warn('⚠️ Failed to save authentication state:', error);
  }
}

export default globalSetup;