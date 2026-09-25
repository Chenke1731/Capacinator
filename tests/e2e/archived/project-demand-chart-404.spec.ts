/**
 * Regression Test: ProjectDemandChart 404 Prevention
 * 
 * This test ensures that the ProjectDemandChart component doesn't make
 * API calls with undefined project IDs, preventing 404 errors.
 * 
 * Bug Reference: GET /api/demands/project/undefined returning 404
 * Fixed by adding enabled: !!projectId guards to useQuery calls
 */
import { test, expect, tags } from '../../fixtures';

test.describe('ProjectDemandChart API Call Regression Tests', () => {
  
  test.beforeEach(async ({ testHelpers }) => {
    await testHelpers.setupPage();
  });

  test(`${tags.regression} should not make API calls with undefined project ID`, async ({
    authenticatedPage,
    testHelpers
  }) => {
    // Track API calls to catch any with undefined IDs
    const apiCalls: string[] = [];
    const errorCalls: string[] = [];
    
    // Monitor all API requests
    authenticatedPage.on('request', request => {
      const url = request.url();
      if (url.includes('/api/demands/project/') || url.includes('/api/assignments') || url.includes('/api/project-phases')) {
        apiCalls.push(url);
        
        // Flag calls with undefined
        if (url.includes('undefined')) {
          errorCalls.push(url);
        }
      }
    });

    // Navigate to a project detail page
    await testHelpers.navigateTo('/projects');
    await testHelpers.waitForPageLoad();

    // Wait for project list to load and get a valid project ID
    await authenticatedPage.waitForSelector('[data-testid="projects-table"], table, .project-item', { timeout: 10000 });
    
    // Look for a project link to click
    const projectLink = authenticatedPage.locator('a[href*="/projects/"]:not([href="/projects"])').first();
    
    if (await projectLink.isVisible()) {
      // Click on a project to go to detail page
      await projectLink.click();
      await testHelpers.waitForPageLoad();
      
      // Wait for project details to load
      await authenticatedPage.waitForSelector('[data-testid="project-detail"], .project-detail, h1', { timeout: 10000 });
      
      // Give some time for any API calls to complete
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      
      // Verify no API calls were made with undefined IDs
      expect(errorCalls).toHaveLength(0);
      
      if (errorCalls.length > 0) {
        console.log('❌ API calls with undefined IDs found:', errorCalls);
      } else {
        console.log('✅ No undefined API calls detected');
      }
      
      // Log all API calls for debugging
      console.log('All API calls made:', apiCalls.filter(call => 
        call.includes('demands') || call.includes('assignments') || call.includes('phases')
      ));
      
    } else {
      console.log('No project links found, test skipped');
    }
  });

  test(`${tags.regression} should handle rapid navigation without undefined calls`, async ({
    authenticatedPage,
    testHelpers
  }) => {
    const errorCalls: string[] = [];
    
    // Monitor for undefined API calls
    authenticatedPage.on('request', request => {
      const url = request.url();
      if (url.includes('undefined') && (url.includes('/api/demands/') || url.includes('/api/assignments') || url.includes('/api/phases'))) {
        errorCalls.push(url);
      }
    });

    // Navigate rapidly between pages to test for race conditions
    await testHelpers.navigateTo('/projects');
    await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
    
    await testHelpers.navigateTo('/reports');
    await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
    
    await testHelpers.navigateTo('/projects');
    await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
    
    // Try to navigate to a project detail page if possible
    const projectLink = authenticatedPage.locator('a[href*="/projects/"]:not([href="/projects"])').first();
    if (await projectLink.isVisible()) {
      await projectLink.click();
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    }
    
    // Verify no undefined calls were made during rapid navigation
    expect(errorCalls).toHaveLength(0);
    
    if (errorCalls.length > 0) {
      console.log('❌ Undefined API calls during navigation:', errorCalls);
    } else {
      console.log('✅ No undefined API calls during rapid navigation');
    }
  });

  test(`${tags.regression} should handle direct URL navigation without undefined calls`, async ({
    authenticatedPage,
    testHelpers
  }) => {
    const errorCalls: string[] = [];
    
    // Monitor for undefined API calls
    authenticatedPage.on('request', request => {
      const url = request.url();
      if (url.includes('undefined') && (url.includes('/api/demands/') || url.includes('/api/assignments') || url.includes('/api/phases'))) {
        errorCalls.push(url);
      }
    });

    // Try to navigate directly to a project detail URL
    // This tests the scenario where React Router params might not be immediately available
    await testHelpers.navigateTo('/projects/987fcdeb-51a2-4b3c-d4e5-f6a7b8c9d0e1');
    
    // Wait for page to load or redirect
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    
    // Verify no undefined calls were made
    expect(errorCalls).toHaveLength(0);
    
    if (errorCalls.length > 0) {
      console.log('❌ Undefined API calls with direct navigation:', errorCalls);
    } else {
      console.log('✅ No undefined API calls with direct navigation');
    }
  });
});