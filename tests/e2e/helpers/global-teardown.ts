/**
 * Global Teardown for E2E Tests
 * Ensures proper cleanup of test environment after all tests complete
 */

import { FullConfig, chromium, request } from '@playwright/test';
import type { E2EProcessManager } from './process-manager.js';
import { portCleanup, E2E_PORTS } from './port-cleanup.js';
import { postTestCleanup } from './test-data-cleanup.js';
import fs from 'fs';
import path from 'path';

async function globalTeardown(config: FullConfig) {
  console.log('🧹 Starting E2E global teardown...');
  
  const baseURL = config.projects[0]?.use?.baseURL || 'http://localhost:3122';
  const testRunId = process.env.TEST_RUN_ID;
  const processManager = (global as any).__E2E_PROCESS_MANAGER__ as E2EProcessManager | undefined;
  
  try {
    // Step 1: Clean up test data using new context-based cleanup
    console.log('🗑️ Cleaning up test data...');
    try {
      const apiBaseUrl = baseURL.replace(/:\d+$/, ':' + (process.env.E2E_SERVER_PORT || '3111'));
      const cleanupApiContext = await request.newContext({
        baseURL: apiBaseUrl,
      });
      await postTestCleanup(cleanupApiContext, apiBaseUrl);
      await cleanupApiContext.dispose();
    } catch (cleanupError) {
      console.warn('⚠️ Context-based cleanup failed, falling back to legacy cleanup:', cleanupError);
      // Fall back to legacy cleanup
      if (testRunId) {
        await cleanupTestData(baseURL, testRunId);
      }
    }

    // Step 2: E2E database cleanup handled by server shutdown
    console.log('🗄️ E2E database will be cleaned up with server...');
    
    // Step 3: Stop all managed processes
    if (processManager) {
      console.log('🛑 Stopping all E2E processes...');
      await processManager.stopAll();
      
      // Release the lock
      await processManager.releaseLock();
      
      // Clean up reference
      delete (global as any).__E2E_PROCESS_MANAGER__;
    } else {
      console.warn('⚠️ No process manager found, attempting direct cleanup...');
      
      // Fallback: Try to clean up ports directly
      await portCleanup.cleanupE2EPorts();
    }
    
    // Step 3.5: Double-check port cleanup
    console.log('🔍 Verifying E2E ports are free...');
    const portResults = await portCleanup.verifyPortsAvailable([E2E_PORTS.backend, E2E_PORTS.frontend]);
    
    for (const [port, available] of portResults.entries()) {
      if (!available) {
        console.warn(`⚠️ Port ${port} is still in use after cleanup, forcing cleanup...`);
        await portCleanup.cleanupPort(port);
      }
    }
    
    // Step 4: Clean up authentication state
    const authPath = path.resolve('test-results/e2e-auth.json');
    if (fs.existsSync(authPath)) {
      console.log('🗑️ Cleaning up authentication state...');
      fs.unlinkSync(authPath);
    }
    
    // Step 5: Clean up PID files directory
    const pidDir = path.join(process.cwd(), '.e2e-pids');
    if (fs.existsSync(pidDir)) {
      console.log('🗑️ Cleaning up PID files...');
      try {
        fs.rmSync(pidDir, { recursive: true, force: true });
      } catch (error) {
        console.warn('⚠️ Failed to remove PID directory:', error);
      }
    }
    
    // Step 6: Clear environment variables
    delete process.env.TEST_BASE_URL;
    delete process.env.TEST_RUN_ID;
    delete process.env.TEST_SETUP_COMPLETE;
    delete process.env.NODE_ENV;
    delete process.env.DATABASE_URL;
    
    console.log('✅ E2E global teardown completed successfully');
    
  } catch (error) {
    console.error('❌ Error during E2E global teardown:', error);
    
    // Last resort: Force cleanup of E2E ports
    console.log('🔨 Attempting force cleanup of E2E ports...');
    try {
      await portCleanup.cleanupE2EPorts();
    } catch (cleanupError) {
      console.error('❌ Force cleanup also failed:', cleanupError);
    }
    
    // Don't fail the test run due to cleanup issues
  }
}

async function cleanupTestData(baseURL: string, testRunId: string) {
  let browser;
  let context;
  let page;
  
  try {
    // Launch browser for API cleanup
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();
    page = await context.newPage();
    
    // Define test data patterns to clean up
    const testPatterns = [
      'Test_',
      'E2E_',
      'e2e-',
      'test-',
      testRunId,
    ];
    
    // Clean up in reverse order of dependencies
    const endpoints = [
      { path: '/api/assignments', name: 'assignments' },
      { path: '/api/scenario-assignments', name: 'scenario assignments' },
      { path: '/api/projects', name: 'projects' },
      { path: '/api/people', name: 'people' },
      { path: '/api/scenarios', name: 'scenarios' },
    ];
    
    for (const endpoint of endpoints) {
      try {
        const response = await page.request.get(`${baseURL}${endpoint.path}`);
        if (!response.ok()) {
          console.log(`⚠️ ${endpoint.name} endpoint not available, skipping cleanup`);
          continue;
        }
        
        const data = await response.json();
        const items = Array.isArray(data) ? data : (data.data || []);
        
        // Find items that match test patterns
        const testItems = items.filter((item: any) => {
          const searchableText = [
            item.name,
            item.project_name,
            item.person_name,
            item.title,
            item.description
          ].filter(Boolean).join(' ');
          
          return testPatterns.some(pattern => 
            searchableText.toLowerCase().includes(pattern.toLowerCase())
          );
        });
        
        if (testItems.length > 0) {
          console.log(`🗑️ Cleaning ${testItems.length} test ${endpoint.name}`);
          
          // Delete each test item
          for (const item of testItems) {
            try {
              const deleteResponse = await page.request.delete(
                `${baseURL}${endpoint.path}/${item.id}`
              );
              
              if (!deleteResponse.ok()) {
                console.warn(`⚠️ Failed to delete ${endpoint.name} ${item.id}: ${deleteResponse.status()}`);
              }
            } catch (error) {
              console.warn(`⚠️ Error deleting ${endpoint.name} ${item.id}:`, error.message);
            }
          }
        }
      } catch (error) {
        console.warn(`⚠️ Failed to clean ${endpoint.name}:`, error.message);
      }
    }
    
  } catch (error) {
    console.warn('⚠️ Test data cleanup encountered issues:', error);
  } finally {
    // Clean up browser resources
    if (page) await page.close();
    if (context) await context.close();
    if (browser) await browser.close();
  }
}

export default globalTeardown;