import { test, expect } from './helpers/base-test';

/**
 * E2E Test: Project Type Allocation Table - Zero Values Elimination
 * 
 * This test verifies that the allocation table in project type details
 * does not display unwanted "0" values below percentage input fields.
 * 
 * Bug Description: 
 * - User reported persistent "0" values appearing beneath percentage inputs
 * - These zeros only appeared under percentages where non-zero allocations were configured
 * - Despite multiple fix attempts, the issue persisted
 */

test.describe('Project Type Allocation Table - Zero Values', () => {

  test('should not display unwanted zero values in allocation table', async ({ authenticatedPage: page, testHelpers }) => {
    console.log('🧪 Testing allocation table zero values elimination...');
    
    // Navigate to project types list
    await testHelpers.navigateViaSidebar('Settings');
    await page.waitForLoadState('networkidle');
    
    // Find and click on a project type link (look for one that exists)
    await page.waitForSelector('.project-types-table, .settings-table, [data-testid="project-types-table"]', { timeout: 10000 });
    
    // Get the first project type link
    const projectTypeLink = await page.locator('a[href*="/project-types/"]').first();
    await expect(projectTypeLink).toBeVisible();
    
    const projectTypeHref = await projectTypeLink.getAttribute('href');
    console.log(`Navigating to project type: ${projectTypeHref}`);
    
    // Click the project type link
    await projectTypeLink.click();
    await page.waitForLoadState('networkidle');
    
    // Wait for the allocation table to load
    await page.waitForSelector('.resource-templates-table', { timeout: 15000 });
    console.log('✅ Allocation table found');
    
    // Wait for data to populate
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    
    // Get all table cells in the allocation table
    const allocationCells = await page.locator('.resource-templates-table td').all();
    
    let foundZeroIssues = false;
    const zeroIssues: string[] = [];
    
    // Check each cell for content
    for (let i = 0; i < allocationCells.length; i++) {
      const cell = allocationCells[i];
      const cellText = await cell.textContent();
      const cellHTML = await cell.innerHTML();
      
      // Look for cells that have input fields with percentage values
      const hasInput = await cell.locator('input[type="number"]').count() > 0;
      
      if (hasInput) {
        const input = cell.locator('input[type="number"]');
        const inputValue = await input.inputValue();
        const percentSign = await cell.locator('span:has-text("%")').count() > 0;
        
        // If there's a meaningful input value and a % sign, check for extra zeros
        if (inputValue && inputValue !== '' && inputValue !== '0' && percentSign) {
          // Check if there are text nodes or elements containing just "0" 
          const textNodes = await cell.evaluate((element) => {
            const walker = document.createTreeWalker(
              element,
              NodeFilter.SHOW_TEXT,
              null,
              false
            );
            
            const textNodes = [];
            let node;
            while (node = walker.nextNode()) {
              const text = node.textContent?.trim();
              if (text && text === '0') {
                textNodes.push({
                  text: text,
                  parent: node.parentElement?.tagName || 'unknown'
                });
              }
            }
            return textNodes;
          });
          
          // Also check for span elements or divs that contain only "0"
          const zeroElements = await cell.locator(':text("0")').all();
          const unwantedZeros = [];
          
          for (const zeroEl of zeroElements) {
            const zeroText = await zeroEl.textContent();
            const zeroTagName = await zeroEl.evaluate(el => el.tagName);
            
            // Skip if it's the input element itself or the % sign
            const isInput = await zeroEl.evaluate(el => el.tagName === 'INPUT');
            const isPercentSign = await zeroEl.textContent() === '%';
            
            if (zeroText?.trim() === '0' && !isInput && !isPercentSign) {
              unwantedZeros.push({
                text: zeroText,
                tag: zeroTagName,
                html: await zeroEl.innerHTML()
              });
            }
          }
          
          if (textNodes.length > 0 || unwantedZeros.length > 0) {
            foundZeroIssues = true;
            const issue = `Cell ${i}: Input value="${inputValue}%", Found unwanted zeros - TextNodes: ${JSON.stringify(textNodes)}, Elements: ${JSON.stringify(unwantedZeros)}`;
            zeroIssues.push(issue);
            console.log(`❌ ZERO ISSUE: ${issue}`);
            console.log(`    Cell HTML: ${cellHTML}`);
          } else {
            console.log(`✅ Cell ${i}: Input value="${inputValue}%" - No unwanted zeros found`);
          }
        }
      }
    }
    
    // Take a screenshot for manual verification
    await page.screenshot({ 
      path: 'tests/e2e/screenshots/allocation-table-zero-test.png',
      fullPage: true 
    });
    console.log('📸 Screenshot saved: allocation-table-zero-test.png');
    
    // Generate detailed test report
    const testReport = {
      testName: 'Project Type Allocation Table - Zero Values Elimination',
      timestamp: new Date().toISOString(),
      projectTypeUrl: page.url(),
      totalCellsChecked: allocationCells.length,
      zeroIssuesFound: foundZeroIssues,
      issueDetails: zeroIssues,
      screenshotPath: 'tests/e2e/screenshots/allocation-table-zero-test.png'
    };
    
    console.log('📋 Test Report:', JSON.stringify(testReport, null, 2));
    
    // Write detailed report to file
    const fs = await import('fs');
    const reportPath = 'tests/e2e/allocation-zero-test-report.json';
    fs.writeFileSync(reportPath, JSON.stringify(testReport, null, 2));
    console.log(`📝 Detailed report saved: ${reportPath}`);
    
    // The test should fail if we found unwanted zeros
    if (foundZeroIssues) {
      throw new Error(`❌ FOUND UNWANTED ZEROS IN ALLOCATION TABLE!\n\nIssues:\n${zeroIssues.join('\n')}\n\nSee detailed report: ${reportPath}\nScreenshot: tests/e2e/screenshots/allocation-table-zero-test.png`);
    }
    
    console.log('✅ SUCCESS: No unwanted zeros found in allocation table');
  });

  test('should verify allocation table displays only meaningful values', async ({ authenticatedPage: page, testHelpers }) => {
    console.log('🧪 Testing allocation table displays only meaningful values...');
    
    // Use the same navigation as above
    await testHelpers.navigateViaSidebar('Settings');
    await page.waitForLoadState('networkidle');
    
    const projectTypeLink = await page.locator('a[href*="/project-types/"]').first();
    await projectTypeLink.click();
    await page.waitForLoadState('networkidle');
    
    // Wait for allocation table
    await page.waitForSelector('.resource-templates-table', { timeout: 15000 });
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    
    // Check that input fields with values don't have empty values or "0" when they should be empty
    const inputFields = await page.locator('.resource-templates-table input[type="number"]').all();
    
    let meaningful_values_count = 0;
    let empty_fields_count = 0;
    let problematic_fields = [];
    
    for (let i = 0; i < inputFields.length; i++) {
      const input = inputFields[i];
      const value = await input.inputValue();
      const placeholder = await input.getAttribute('placeholder');
      
      if (value && value !== '' && value !== '0') {
        meaningful_values_count++;
        console.log(`✅ Input ${i}: Has meaningful value "${value}"`);
      } else if (value === '' || value === null) {
        empty_fields_count++;
        console.log(`✅ Input ${i}: Properly empty (value="${value}", placeholder="${placeholder}")`);
      } else if (value === '0') {
        problematic_fields.push({
          index: i,
          value: value,
          placeholder: placeholder,
          message: 'Input has "0" value which should be empty'
        });
        console.log(`❌ Input ${i}: Has "0" value when it should be empty`);
      }
    }
    
    console.log(`📊 Summary: ${meaningful_values_count} meaningful values, ${empty_fields_count} properly empty fields, ${problematic_fields.length} problematic fields`);
    
    // Test should fail if we have problematic fields
    expect(problematic_fields).toHaveLength(0);
    
    // Test should pass if we have at least some meaningful values (indicating the page works)
    expect(meaningful_values_count).toBeGreaterThan(0);
  });
});