import { Page } from '@playwright/test';

export async function setupTestUser(page: Page) {
  // Navigate to the application (baseURL-relative — never hardcode a port)
  await page.goto('/');
  
  // Handle profile selection modal if it appears
  try {
    // Check if profile modal is visible
    const profileModalVisible = await page.locator('text="Select Your Profile"').isVisible();
    
    if (profileModalVisible) {
      console.log('Profile modal detected, selecting user...');
      
      // Click on the shadcn Select trigger to open dropdown
      console.log('🎯 Attempting to open profile dropdown...');
      const selectTrigger = page.locator('#person-select');
      await selectTrigger.waitFor({ state: 'visible', timeout: 5000 });
      
      // Take screenshot before clicking
      await page.screenshot({ path: '/tmp/before-dropdown-click.png' });
      
      await selectTrigger.click();
      console.log('📂 Clicked select trigger');

      // Wait for the dropdown portal to render
      await page.waitForSelector('[role="option"], [data-radix-collection-item]', { state: 'visible', timeout: 5000 }).catch(() => {});
      
      // Try multiple strategies to find dropdown options
      console.log('🔍 Looking for dropdown options...');
      
      // Strategy 1: Look for role="option"
      let options = page.locator('[role="option"]');
      let optionCount = await options.count();
      
      // Strategy 2: If no options found, try data-radix attributes
      if (optionCount === 0) {
        console.log('⚠️ No options with role="option", trying data-radix-collection-item...');
        options = page.locator('[data-radix-collection-item]');
        optionCount = await options.count();
      }
      
      // Strategy 3: Look in portals
      if (optionCount === 0) {
        console.log('⚠️ No options found, looking in portals...');
        options = page.locator('[data-radix-popper-content-wrapper] [role="option"]');
        optionCount = await options.count();
      }
      
      console.log(`📊 Found ${optionCount} profile options`);
      
      // Take screenshot after dropdown should be open
      await page.screenshot({ path: '/tmp/after-dropdown-click.png' });
      
      if (optionCount > 0) {
        // Get option texts for logging
        const optionTexts = await options.evaluateAll(elements => 
          elements.map(el => el.textContent?.trim() || '')
        );
        console.log('Available profiles:', optionTexts);
        
        // Try to find and click a specific option or use the first one
        const targetOption = optionTexts.findIndex(text => text.includes('Alice Johnson'));
        const optionToClick = targetOption >= 0 ? targetOption : 0;
        
        await options.nth(optionToClick).click();
        console.log(`✅ Selected profile: ${optionTexts[optionToClick]}`);
      } else {
        // Fallback: Try keyboard navigation
        console.log('⚠️ No options visible, trying keyboard navigation...');
        await selectTrigger.press('Enter');
        // Wait for dropdown to appear
        await page.waitForSelector('[role="listbox"], [role="option"]', { state: 'visible', timeout: 2000 }).catch(() => {});
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        console.log('✅ Attempted selection via keyboard');
      }
      
      // Click Continue button
      await page.locator('button:has-text("Continue")').click();
      
      // Wait for modal to disappear
      await page.waitForSelector('text="Select Your Profile"', { state: 'detached', timeout: 10000 });
      console.log('Profile selection completed');
    }
  } catch (error) {
    console.log('No profile selection needed or error:', error);
  }
  
  // Wait for the main app to load with longer timeout
  await page.waitForLoadState('networkidle', { timeout: 15000 });
  
  // Take screenshot after profile selection
  await page.screenshot({ path: 'after-setup.png' });
  
  // Try multiple selectors for navigation
  const navSelectors = [
    'nav',
    '[role="navigation"]',
    '.navbar',
    'header',
    '.navigation',
    '.header',
    '[data-testid="navigation"]',
    'a[href="/people"]',
    'text=People'
  ];
  
  let navFound = false;
  for (const selector of navSelectors) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      console.log(`Found navigation using selector: ${selector}`);
      navFound = true;
      break;
    }
  }
  
  if (!navFound) {
    // Take screenshot for debugging
    await page.screenshot({ path: 'navigation-not-found.png' });
    const pageContent = await page.content();
    console.error('Page content sample:', pageContent.substring(0, 1000));
    throw new Error('Main navigation not found after setup');
  }
  
  console.log('Test setup completed');
}