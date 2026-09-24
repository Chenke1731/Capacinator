import { test, expect } from './fixtures'

test.describe('Utilization Modal Debug', () => {
  test('debug modal structure', async ({ authenticatedPage, testHelpers, e2eTestDataBuilder }) => {
    // Create test data
    const testData = await e2eTestDataBuilder.createUtilizationTestScenario();
    
    // Navigate to utilization report
    await testHelpers.navigateTo('/reports');
    await authenticatedPage.click('button:has-text("Utilization Report")');
    await authenticatedPage.waitForSelector('h2:has-text("Team Utilization Overview")', { timeout: 10000 });
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    
    // Find and click an Add button
    const addButton = authenticatedPage.locator('button').filter({ hasText: /Add|➕/ }).first();
    await addButton.click();
    
    // Wait a moment for any animations
    await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    
    // Look for ANY element that might be the modal
    const possibleModalSelectors = [
      '[role="dialog"]',
      '.modal',
      '[class*="modal"]',
      '.dialog',
      '[class*="dialog"]',
      '.overlay',
      '[class*="overlay"]',
      'div:has(> button:has-text("×"))', // Div with close button
      'div:has-text("Add Projects:")',
      '[aria-modal="true"]'
    ];
    
    console.log('Searching for modal elements...');
    
    for (const selector of possibleModalSelectors) {
      const count = await authenticatedPage.locator(selector).count();
      if (count > 0) {
        console.log(`Found ${count} elements matching: ${selector}`);
        
        // Get the first element's details
        const element = authenticatedPage.locator(selector).first();
        const className = await element.getAttribute('class');
        const role = await element.getAttribute('role');
        const id = await element.getAttribute('id');
        
        console.log(`  - class: ${className}`);
        console.log(`  - role: ${role}`);
        console.log(`  - id: ${id}`);
        
        // Check if it contains expected content
        const hasAddProjects = await element.locator('text="Add Projects"').count() > 0;
        if (hasAddProjects) {
          console.log(`  ✓ Contains "Add Projects" text`);
        }
      }
    }
    
    // Take screenshot
    await authenticatedPage.screenshot({ path: 'test-results/modal-debug.png', fullPage: true });
    
    // Get the page HTML structure around where modal might be
    const bodyHTML = await authenticatedPage.locator('body').innerHTML();
    
    // Look for specific modal content
    if (bodyHTML.includes('Add Projects:')) {
      console.log('Found "Add Projects:" in page HTML');
      
      // Find the container of this text
      const addProjectsElement = await authenticatedPage.locator('text="Add Projects:"').first();
      const parent1 = addProjectsElement.locator('..');
      const parent2 = parent1.locator('..');
      const parent3 = parent2.locator('..');
      
      console.log('Parent element classes:');
      console.log('Parent 1:', await parent1.getAttribute('class'));
      console.log('Parent 2:', await parent2.getAttribute('class'));
      console.log('Parent 3:', await parent3.getAttribute('class'));
    }
    
    // Also check for any elements with z-index suggesting overlay
    const highZIndexElements = await authenticatedPage.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('*'));
      return elements
        .filter(el => {
          const style = window.getComputedStyle(el);
          const zIndex = parseInt(style.zIndex, 10);
          return !isNaN(zIndex) && zIndex > 100;
        })
        .map(el => ({
          tagName: el.tagName,
          className: el.className,
          zIndex: window.getComputedStyle(el).zIndex
        }));
    });
    
    if (highZIndexElements.length > 0) {
      console.log('Elements with high z-index:', highZIndexElements);
    }
  });
});