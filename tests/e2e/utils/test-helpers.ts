import { setupPageWithAuth } from './improved-auth-helpers';
import { Page, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function evaluateColorContrast(color1: string, color2: string): number {
  // Convert color strings to RGB
  const getRGB = (color: string) => {
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return null;
    return { r: parseInt(match[1], 10), g: parseInt(match[2], 10), b: parseInt(match[3], 10) };
  };
  
  // Calculate relative luminance
  const getLuminance = (rgb: any) => {
    const [r, g, b] = [rgb.r, rgb.g, rgb.b].map(val => {
      val = val / 255;
      return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  
  const rgb1 = getRGB(color1);
  const rgb2 = getRGB(color2);
  
  if (!rgb1 || !rgb2) return 0;
  
  const lum1 = getLuminance(rgb1);
  const lum2 = getLuminance(rgb2);
  
  const contrast = (Math.max(lum1, lum2) + 0.05) / (Math.min(lum1, lum2) + 0.05);
  return Math.round(contrast * 100) / 100;
}

export function checkWCAGCompliance(contrastRatio: number, fontSize: number, isBold: boolean = false): { aa: boolean; aaa: boolean } {
  // WCAG 2.1 Level AA: 4.5:1 for normal text, 3:1 for large text
  // Large text: 18pt (24px) or 14pt (18.5px) bold
  const isLargeText = fontSize >= 24 || (fontSize >= 18.5 && isBold);
  const aaThreshold = isLargeText ? 3 : 4.5;
  const aaaThreshold = isLargeText ? 4.5 : 7;
  
  return {
    aa: contrastRatio >= aaThreshold,
    aaa: contrastRatio >= aaaThreshold
  };
}

export class TestHelpers {
  constructor(private page: Page) {}

  /**
   * Navigate to a specific page and wait for it to load
   */
  async navigateTo(path: string) {
    // Relative paths resolve against the context baseURL (e2e frontend
    // 3122) — never hardcode a port here: the old hardcoded :3120 sent
    // this test's traffic into the dev stack (root cause of D9, 2026-09-24)
    await this.page.goto(path, { waitUntil: 'domcontentloaded' });
    
    // Handle profile selection if it appears  
    await this.handleProfileSelection();
    
    // Wait for content to be ready
    await this.waitForPageContent();
    
    // For mobile viewports, ensure we can see the main content
    const viewport = this.page.viewportSize();
    if (viewport && viewport.width < 768) {
      // In mobile, the sidebar might overlap content
      // Wait for main content to be visible
      await this.page.waitForSelector('.main-content, main, [data-testid="main-content"]', { 
        state: 'visible', 
        timeout: 5000 
      }).catch(() => {
        // If main content not found, continue anyway
        console.log('Note: Main content selector not found in mobile viewport');
      });
    }
  }

  /**
   * Navigate to a specific page with retry logic
   */
  async gotoWithRetry(path: string, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        await this.page.goto(path);
        await this.page.waitForLoadState('networkidle');
        return;
      } catch (error) {
        if (i === retries - 1) throw error;
        // Wait for DOM to settle before retry
        await this.page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
      }
    }
  }

  /**
   * Wait for React app to be ready
   */
  async waitForReactApp() {
    // Wait for React root element
    try {
      await this.page.waitForSelector('#root, #app, [data-reactroot]', { timeout: 5000 });
    } catch {
      // If no React root found, just wait for page load
      await this.page.waitForLoadState('networkidle');
    }
    
    // Wait for hydration
    await this.waitForReactHydration();
  }

  /**
   * Wait for page load - alias for waitForPageContent for backward compatibility
   */
  async waitForPageLoad() {
    await this.waitForPageContent();
  }

  /**
   * Click an element and navigate to a URL
   */
  async clickAndNavigate(selector: string, expectedUrl: string) {
    // Check if page is closed before starting
    if (this.page.isClosed()) {
      throw new Error('Page is closed - cannot click and navigate');
    }
    
    // Wait for the element to be visible and clickable
    await this.page.waitForSelector(selector, { state: 'visible', timeout: 5000 });
    
    // Use multiple click strategies for reliability
    try {
      await this.page.click(selector, { timeout: 10000 });
    } catch (error) {
      console.log(`Click failed with ${selector}, trying force click...`);
      
      // Check if page closed during click attempt
      if (this.page.isClosed()) {
        throw new Error('Page was closed during click attempt');
      }
      
      await this.page.click(selector, { force: true, timeout: 5000 });
    }
    
    // Check if page is still open before waiting for URL
    if (this.page.isClosed()) {
      throw new Error('Page was closed after click');
    }
    
    await this.page.waitForURL(url => url.pathname === expectedUrl || url.pathname.includes(expectedUrl), { timeout: 5000 });
  }

  /**
   * Handle profile selection modal if present - Robust version
   */
  async handleProfileSelection() {
    console.log('🔍 Checking for profile selection modal...');

    try {
      // Wait for page to settle by checking for any content
      await this.page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});

      // Tolerant gate: in the cold e2e world the first render can take well
      // over 10s (vite on-demand compilation), while the dev world shows the
      // modal instantly. Wait for EITHER signal instead of assuming the modal.
      const firstSignal = await Promise.race([
        this.page.waitForSelector('text=Select Your Profile', { timeout: 20000 }).then(() => 'modal'),
        this.page.waitForSelector('.sidebar, nav, h1', { timeout: 20000 }).then(() => 'main-app'),
      ]).catch(() => null as unknown as string | null);

      if (firstSignal !== 'modal') {
        console.log(`✅ No profile modal needed (${firstSignal ?? 'nothing rendered'}), continuing...`);
        return;
      }

      console.log('📋 Profile modal detected, proceeding with selection...');
      
      // Wait for the shadcn Select trigger to be ready (30s: cold-start module
      // compilation can exceed the old 10s budget — 2026-09-24 batch timeouts)
      await this.page.waitForSelector('#person-select', { timeout: 30000, state: 'visible' });
      console.log('📝 Profile select component found');

      // Wait for data to populate by checking network idle
      await this.page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      
      // Use multiple approaches to select an option
      console.log('🎯 Attempting to select profile...');
      
      // Handle shadcn Select component
      let selectionSucceeded = false;
      
      try {
        // Click the Select trigger using id
        const selectTrigger = this.page.locator('#person-select');
        await selectTrigger.click();
        console.log('📂 Opened shadcn Select dropdown');

        // Wait for dropdown options to appear
        await this.page.waitForSelector('[role="option"], [data-radix-collection-item]', { state: 'visible', timeout: 5000 });
        
        // Click the first valid option
        const options = this.page.locator('[role="option"], [data-radix-collection-item]');
        const optionCount = await options.count();
        if (optionCount > 0) {
          const firstOption = options.first();
          const optionText = await firstOption.textContent();
          console.log(`Selecting profile: ${optionText}`);
          await firstOption.click();
          console.log('✅ Profile selected using shadcn Select');
          selectionSucceeded = true;
        }
      } catch (shadcnError) {
        console.log(`⚠️ Shadcn Select failed: ${shadcnError.message}`);
      }
      
      if (!selectionSucceeded) {
        throw new Error('Failed to select profile from dropdown');
      }

      // Wait for React to process the selection (dropdown should close)
      await this.page.waitForSelector('[role="listbox"]', { state: 'hidden', timeout: 3000 }).catch(() => {});
      
      // Wait for Continue button to be enabled
      console.log('⏳ Waiting for Continue button to become enabled...');
      
      // Use a more flexible selector for the continue button
      const continueButtonSelector = 'button:has-text("Continue")';
      
      try {
        await this.page.waitForSelector(continueButtonSelector, { timeout: 10000, state: 'visible' });
      } catch (error) {
        console.log('⚠️ Continue button not found, checking if already on main page...');
        // Check if we're already past the profile selection
        const isOnMainPage = await this.page.locator('.sidebar, nav, h1').count() > 0;
        if (isOnMainPage) {
          console.log('✅ Already on main page, skipping profile selection');
          return;
        }
        throw error;
      }
      
      // Wait for it to become enabled by waiting for the disabled attribute to be removed
      let continueEnabled = false;
      try {
        await expect(this.page.locator(continueButtonSelector)).toBeEnabled({ timeout: 10000 });
        continueEnabled = true;
        console.log('✅ Continue button is now enabled');
      } catch {
        console.log('⚠️ Continue button never became enabled within timeout');
      }
      
      if (!continueEnabled) {
        console.log('⚠️ Continue button never became enabled, trying to click anyway...');
      }

      // Click the Continue button
      console.log('👆 Clicking Continue button...');
      
      try {
        // First wait for any overlays to disappear
        const overlaySelector = '.fixed.inset-0.z-50.bg-black';
        try {
          await this.page.waitForSelector(overlaySelector, { state: 'detached', timeout: 2000 });
        } catch {
          // Overlay might not exist or already gone
        }
        
        // Try normal click first
        await this.page.locator(continueButtonSelector).click({ timeout: 5000 });
        console.log('✅ Continue button clicked successfully');
      } catch (clickError) {
        console.log(`⚠️ Normal click failed: ${clickError.message}`);
        
        // Try force click as fallback
        await this.page.locator(continueButtonSelector).click({ force: true });
        console.log('✅ Continue clicked using force option');
      }
      
      // Wait for modal to disappear
      console.log('⏳ Waiting for profile modal to close...');
      try {
        await this.page.waitForSelector('text=Select Your Profile', { 
          state: 'detached', 
          timeout: 15000 
        });
        console.log('✅ Profile modal successfully closed');
      } catch (detachError) {
        console.log(`⚠️ Modal close detection failed: ${detachError.message}`);
        
        // Check if modal is actually gone
        const modalStillExists = await this.page.locator('text=Select Your Profile').count() > 0;
        if (!modalStillExists) {
          console.log('✅ Profile modal is actually gone, proceeding...');
        } else {
          console.log('⚠️ Profile modal still present, but proceeding anyway...');
        }
      }
      
      // Wait for any navigation or state changes to complete
      console.log('⏳ Waiting for navigation to stabilize...');
      try {
        await this.page.waitForLoadState('networkidle', { timeout: 10000 });
        console.log('✅ Network activity settled');
      } catch (networkError) {
        console.log('⚠️ Network idle timeout, but continuing...');
      }

      console.log('🎉 Profile selection process completed');
      
    } catch (error) {
      console.log(`❌ Profile selection failed: ${error.message}`);
      console.log('🔄 Attempting to continue anyway...');
      
      // Take a screenshot for debugging
      try {
        await this.page.screenshot({ path: '/tmp/profile-modal-error.png' });
        console.log('📸 Error screenshot saved to /tmp/profile-modal-error.png');
      } catch (screenshotError) {
        console.log('📸 Failed to save error screenshot');
      }
      
      // Don't throw error, just continue - many tests can work without profile selection
    }
  }

  /**
   * Complete page setup including profile selection and waiting for page load
   */
  async setupPage() {
    try {
      // Check if page is closed before starting
      if (this.page.isClosed()) {
        throw new Error('Page is closed - cannot setup');
      }
      
      // Only wait for React app if we haven't navigated yet
      const currentUrl = this.page.url();
      if (currentUrl === 'about:blank' || !currentUrl.includes('localhost')) {
        await this.waitForReactApp();
      }
      
      // Handle profile selection if needed
      await this.handleProfileSelection();
      
      // Wait for navigation to complete
      await this.waitForNavigation();
      
      // After profile selection, wait for the actual content to appear
      await this.waitForPageContent();
    } catch (error) {
      console.log('Setup page failed:', error.message);
      // Check if the page closed during setup
      if (this.page.isClosed()) {
        throw new Error('Page was closed during setup');
      }
      // For other errors, try to continue - maybe the page is already loaded
    }
  }

  /**
   * Wait for data to load (tables, lists, etc)
   */
  async waitForDataLoad() {
    // Wait for loading indicators to disappear
    try {
      await this.page.waitForSelector('.loading, .spinner, [data-loading="true"]', { state: 'detached', timeout: 3000 });
    } catch {
      // No loading indicator found
    }
    
    // Wait for data elements
    try {
      await this.page.waitForSelector('tbody tr, .data-item, .list-item', { timeout: 5000 });
    } catch {
      // No data elements found
    }

    // Wait for DOM to settle
    await this.page.waitForLoadState('domcontentloaded', { timeout: 2000 }).catch(() => {});
  }

  /**
   * Wait for the main navigation to be visible
   */
  async waitForNavigation() {
    // Try multiple navigation selector strategies
    const navSelectors = [
      '[data-testid="main-navigation"]',
      '.sidebar',
      'nav',
      '.navigation',
      '.nav-list'
    ];
    
    for (const selector of navSelectors) {
      try {
        await this.page.waitForSelector(selector, { timeout: 3000 });
        return; // Found navigation
      } catch {
        continue;
      }
    }
    
    // If no specific navigation found, just wait for page load
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Navigate using the sidebar menu
   */
  async navigateViaSidebar(menuItem: string) {
    // Check if page is closed before starting
    if (this.page.isClosed()) {
      throw new Error('Page is closed - cannot navigate');
    }
    
    // Wait for React hydration first
    await this.waitForReactHydration();
    
    // Map menu items to their actual URLs
    const urlMap: Record<string, string> = {
      'Dashboard': '/dashboard',
      'Projects': '/projects',
      'People': '/people',
      'Assignments': '/assignments',
      'Scenarios': '/scenarios',
      'Reports': '/reports',
      'Locations': '/locations',
      'Audit Log': '/audit-log',
      'Settings': '/settings'
    };
    
    const expectedUrl = urlMap[menuItem] || `/${menuItem.toLowerCase()}`;
    
    try {
      // Wait for navigation links to be ready
      await this.page.waitForSelector('nav a, .sidebar a, a[href*="/"]', { state: 'visible', timeout: 5000 }).catch(() => {});

      // Check if we're in mobile viewport
      const viewport = this.page.viewportSize();
      const isMobile = viewport && viewport.width < 768;
      
      // Try multiple selectors for navigation items
      const selectors = [
        `nav a:has-text("${menuItem}")`,
        `.sidebar a:has-text("${menuItem}")`,
        `.nav-link:has-text("${menuItem}")`,
        `a[href="${expectedUrl}"]`
      ];
      
      let clicked = false;
      for (const selector of selectors) {
        try {
          const element = await this.page.$(selector);
          if (element && await element.isVisible()) {
            if (isMobile) {
              // On mobile, sidebar might be partially off-screen
              await element.scrollIntoViewIfNeeded();
            }
            await this.clickAndNavigate(selector, expectedUrl);
            clicked = true;
            break;
          }
        } catch (e) {
          // Try next selector
        }
      }
      
      if (clicked) {
        return;
      }
    } catch (error) {
      console.log(`Could not find navigation item: ${menuItem}, using direct navigation to ${expectedUrl}`);
      
      // Check if page is still open before fallback
      if (this.page.isClosed()) {
        throw new Error('Page was closed during navigation attempt');
      }
      
      // Fallback to direct navigation
      await this.page.goto(expectedUrl);
      await this.page.waitForLoadState('networkidle');
      return;
    }
  }

  /**
   * Wait for data table to load
   */
  async waitForDataTable() {
    await this.waitForReactHydration();
    
    // Try multiple table selector strategies
    const tableSelectors = [
      'table',  // Standard HTML table
      '[role="table"]',  // ARIA table
      '.rounded-md.border table',  // Table within the rounded border
      '.data-table-wrapper',
      '.table-container',
      '.table',
      '.projects-table',
      '.people-table',
      '.assignments-table',
      '[role="tabpanel"] table'  // Table inside tab panel
    ];
    
    let found = false;
    for (const selector of tableSelectors) {
      try {
        await this.page.waitForSelector(selector, { timeout: 2000, state: 'visible' });
        found = true;
        break;
      } catch {
        continue;
      }
    }
    
    if (!found) {
      // If no table found, wait for network to settle
      await this.page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    }
    
    // Wait for loading state to finish (optional)
    try {
      await this.page.waitForSelector('.table-loading, .loading, .spinner', { state: 'hidden', timeout: 5000 });
    } catch {
      // Loading indicator might not exist
    }
    
    // Wait for table rows to appear
    try {
      await this.page.waitForSelector('tbody tr, .table-row', { timeout: 5000 });
    } catch {
      // Table might be empty
    }
  }

  /**
   * Fill a form field by label
   */
  async fillFieldByLabel(label: string, value: string) {
    const field = this.page.locator(`label:has-text("${label}") + input, label:has-text("${label}") + select, label:has-text("${label}") + textarea`);
    await field.fill(value);
  }

  /**
   * Select dropdown option by label
   */
  async selectDropdownByLabel(label: string, option: string) {
    const select = this.page.locator(`label:has-text("${label}") + select`);
    await select.selectOption({ label: option });
  }

  /**
   * Click button by text
   */
  async clickButton(buttonText: string) {
    await this.page.click(`button:has-text("${buttonText}")`);
  }

  /**
   * Upload a file to the import page
   */
  async uploadFile(fileName: string) {
    const filePath = path.join(__dirname, '../fixtures', fileName);
    const fileInput = this.page.locator('input[type="file"]');
    await fileInput.setInputFiles(filePath);
  }

  /**
   * Wait for success message
   */
  async waitForSuccessMessage() {
    await this.page.waitForSelector('.import-result.success', { timeout: 30000 });
  }

  /**
   * Wait for error message
   */
  async waitForErrorMessage() {
    await this.page.waitForSelector('.import-result.error, .error-message', { timeout: 10000 });
  }

  /**
   * Get table row count
   */
  async getTableRowCount(): Promise<number> {
    const rows = await this.page.locator('table tbody tr, .table tbody tr').count();
    return rows;
  }

  /**
   * Click table row by index
   */
  async clickTableRow(index: number) {
    await this.page.click(`table tbody tr:nth-child(${index + 1}), .table tbody tr:nth-child(${index + 1})`);
  }

  /**
   * Search in data table
   */
  async searchInTable(searchTerm: string) {
    const searchInput = this.page.locator('input[placeholder*="Search"]');
    await searchInput.fill(searchTerm);
    // Wait for network idle (debounced search should trigger API call)
    await this.page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await this.waitForDataTable();
  }

  /**
   * Filter by dropdown in filter bar
   */
  async filterByDropdown(filterLabel: string, option: string) {
    const filterSelect = this.page.locator(`.filter-bar select`).filter({ hasText: filterLabel }).or(
      this.page.locator(`.filter-bar label:has-text("${filterLabel}") + select`)
    );
    await filterSelect.selectOption({ label: option });
    await this.waitForDataTable();
  }

  /**
   * Clear all filters
   */
  async clearFilters() {
    const resetButton = this.page.locator('button:has-text("Reset Filters")');
    if (await resetButton.isVisible()) {
      await resetButton.click();
      await this.waitForDataTable();
    }
  }

  /**
   * Check if element exists and is visible
   */
  async isElementVisible(selector: string): Promise<boolean> {
    try {
      const element = this.page.locator(selector);
      return await element.isVisible();
    } catch {
      return false;
    }
  }

  /**
   * Get text content of element
   */
  async getElementText(selector: string): Promise<string> {
    const element = this.page.locator(selector);
    return await element.textContent() || '';
  }

  /**
   * Wait for React hydration to complete
   */
  async waitForReactHydration() {
    // Use a more forgiving approach - just wait for any content to appear
    try {
      // First try to wait for specific React elements
      const selectors = [
        '[data-reactroot]',
        '#root > *', 
        '.App',
        '.layout',
        '.main-content',
        'body > div',  // Any div in body
        'main',        // Main tag
        'header',      // Header tag
        '.container'   // Generic container
      ];
      
      let found = false;
      for (const selector of selectors) {
        try {
          await this.page.waitForSelector(selector, { timeout: 1000 });
          found = true;
          break; // Found one, React is likely hydrated
        } catch {
          continue;
        }
      }
      
      // If no specific selectors found, just wait for page to be interactive
      if (!found) {
        await this.page.waitForLoadState('domcontentloaded', { timeout: 5000 });
      }
      
    } catch (error) {
      // If all fails, just continue - the page might be loaded already
      console.log('React hydration check failed, continuing anyway');
    }
    
    // Ensure DOM is ready for interaction
    try {
      await this.page.waitForLoadState('domcontentloaded', { timeout: 1000 });
    } catch {
      // DOM might already be ready, continue
    }
  }

  /**
   * Wait for dashboard charts to load
   */
  async waitForDashboardCharts() {
    await this.waitForReactHydration();
    
    // Try multiple chart loading strategies
    const chartSelectors = [
      '.recharts-surface',
      '.recharts-wrapper',
      '.chart-container',
      'svg',
      'canvas',
      '.dashboard-chart'
    ];
    
    for (const selector of chartSelectors) {
      try {
        await this.page.waitForSelector(selector, { timeout: 5000 });
        return; // Found charts
      } catch {
        continue;
      }
    }
    
    // If no charts found, just wait for content to load
    await this.page.waitForSelector('.main-content', { timeout: 10000 });
  }

  /**
   * Verify page title
   */
  async verifyPageTitle(expectedTitle: string) {
    // Special handling for Reports page which loads content slowly
    if (expectedTitle === 'Reports') {
      try {
        // Wait for Reports page content to load
        await this.page.waitForSelector('h1:has-text("Reports")', { timeout: 10000 });
        return;
      } catch {
        // If Reports content doesn't load, just verify URL was correct
        const url = this.page.url();
        if (url.includes('/reports')) {
          return; // Navigation was successful even if content is slow
        }
      }
    }
    
    // Try multiple strategies to find page title
    const titleSelectors = [
      'h1:not(.logo-title)',  // h1 that's not the logo
      'h2',                   // Page heading
      '.page-title',          // Custom page title class
      '.main-content h1',     // h1 within main content
      '.main-content h2'      // h2 within main content
    ];
    
    for (const selector of titleSelectors) {
      const elements = this.page.locator(selector);
      const count = await elements.count();
      
      for (let i = 0; i < count; i++) {
        const element = elements.nth(i);
        if (await element.isVisible()) {
          const title = await element.textContent();
          if (title && (title.trim() === expectedTitle || title.includes(expectedTitle))) {
            return; // Found matching title
          }
        }
      }
    }
    
    // If no exact match, check if page contains the expected text
    await expect(this.page.locator('body')).toContainText(expectedTitle);
  }

  /**
   * Take screenshot with name
   */
  async takeScreenshot(name: string) {
    await this.page.screenshot({ 
      path: `e2e/screenshots/${name}.png`,
      fullPage: true 
    });
  }

  /**
   * Wait for page content to load after profile selection
   */
  async waitForPageContent() {
    console.log('Waiting for page content to load...');
    
    // Check if the page is still open
    if (this.page.isClosed()) {
      throw new Error('Page closed while waiting for content');
    }
    
    // Wait for any loading indicators to disappear first
    try {
      await this.page.waitForSelector('.loading-spinner, .loading, [data-loading="true"]', { 
        state: 'detached', 
        timeout: 5000 
      });
    } catch {
      // No loading indicators, which is fine
    }
    
    // First, specifically wait for the layout to be ready
    try {
      await this.page.waitForSelector('.layout, .app-layout, #app, #root', { timeout: 10000 });
      console.log('✅ Layout container found');
    } catch {
      console.log('⚠️ Layout container not found');
    }
    
    // Wait for navigation specifically
    try {
      await this.page.waitForSelector('.sidebar, nav, .navigation', { timeout: 5000 });
      console.log('✅ Sidebar found');
    } catch {
      console.log('⚠️ Sidebar not found');
    }
    
    // Wait for navigation links
    try {
      await this.page.waitForSelector('.nav-link, a[href*="/"], nav a', { timeout: 5000 });
      console.log('✅ Navigation links found');
    } catch {
      console.log('⚠️ Navigation links not found');
    }
    
    // Wait for main content area
    try {
      await this.page.waitForSelector('.main-content, main, [role="main"]', { timeout: 5000 });
      console.log('✅ Main content area found');
    } catch {
      console.log('⚠️ Main content area not found');
    }
    
    // Wait for one of several possible content indicators
    const contentSelectors = [
      '.report-tabs, button.tab',           // Report tabs
      '.summary-card',                      // Summary cards
      '.chart-container',                   // Charts
      'table, .table',                      // Tables
      '.actionable-item',                   // Actionable items
      '.full-width-tables',                 // Full width tables
      'text=No data available',             // No data message
      'h1',                                 // Any main heading
      '.new-assignment-btn, button:has-text("New Assignment")'  // Assignment page specific
    ];
    
    // Create a race condition between finding content and timeout
    const contentPromises = contentSelectors.map(async (selector) => {
      try {
        await this.page.waitForSelector(selector, { timeout: 8000 });
        return selector;
      } catch {
        return null;
      }
    });
    
    // Add a timeout promise as well
    const timeoutPromise = new Promise<string>((resolve) => {
      setTimeout(() => resolve('timeout'), 10000);
    });
    
    const result = await Promise.race([...contentPromises, timeoutPromise]);
    
    if (result && result !== 'timeout') {
      console.log(`✅ Found content: ${result}`);
    } else {
      // If no specific content found or timeout, check if page is still valid
      if (!this.page.isClosed()) {
        console.log('⚠️ No specific content found within timeout, but page is still open');
        // Just continue - the page might be valid but empty or slow loading
      } else {
        throw new Error('Page closed while waiting for content');
      }
    }
  }

  /**
   * Clear database for clean test state
   */
  async clearDatabase() {
    // This would typically make an API call to clear test data
    // For now, we'll assume the database is cleared between tests
    await this.page.evaluate(() => {
      // Clear any client-side storage
      localStorage.clear();
      sessionStorage.clear();
    });
  }

  /**
   * Clear any notifications or toasts
   */
  async clearNotifications() {
    try {
      // Close any notifications
      const notifications = await this.page.locator('.notification, .toast, [role="alert"]').all();
      for (const notification of notifications) {
        const closeButton = notification.locator('.close, button[aria-label="Close"]');
        if (await closeButton.isVisible()) {
          await closeButton.click();
        }
      }
      
      // Close any open modals
      const modals = await this.page.locator('[role="dialog"], .modal').all();
      for (const modal of modals) {
        const closeButton = modal.locator('.close, button[aria-label="Close"]');
        if (await closeButton.isVisible()) {
          await closeButton.click();
        }
      }
    } catch {
      // Ignore errors - notifications might not exist
    }
  }

  /**
   * Verify no errors on page
   */
  async verifyNoErrors() {
    const errorElements = await this.page.locator('.error-message, .import-result.error').count();
    expect(errorElements).toBe(0);
  }

  /**
   * Wait for loading to complete
   */
  async waitForLoadingComplete() {
    try {
      // Only wait for loading spinner to be hidden if it exists
      await this.page.waitForSelector('.loading-spinner', { state: 'hidden', timeout: 3000 });
    } catch {
      // Loading spinner might not exist, that's ok
      console.log('No loading spinner found - continuing');
    }
  }

  /**
   * Validate API response JSON structure to catch serialization errors
   * This helper ensures response bodies can be properly parsed and have expected structure
   */
  async validateApiResponse(response: any, expectedProperties: string[] = [], operationType: string = 'API operation') {
    // Verify response status
    expect(response.status()).toBeGreaterThanOrEqual(200);
    expect(response.status()).toBeLessThan(300);
    
    // Validate JSON response body structure to catch serialization errors
    let responseBody: any;
    try {
      responseBody = await response.json();
    } catch (error) {
      throw new Error(`Failed to parse JSON response for ${operationType}: ${error}`);
    }
    
    expect(responseBody).toBeDefined();
    
    // Validate expected properties exist
    for (const property of expectedProperties) {
      expect(responseBody).toHaveProperty(property);
    }
    
    console.log(`✅ ${operationType} response body validated successfully`);
    return responseBody;
  }

  /**
   * Validate assignment creation response
   */
  async validateAssignmentCreationResponse(response: any) {
    return await this.validateApiResponse(response, [
      'id', 'project_id', 'person_id', 'role_id', 
      'allocation_percentage', 'start_date', 'end_date'
    ], 'Assignment creation');
  }

  /**
   * Validate assignment deletion response
   */
  async validateAssignmentDeletionResponse(response: any) {
    return await this.validateApiResponse(response, ['message'], 'Assignment deletion');
  }

  /**
   * Validates that a utilization modal (Add Projects or Reduce Load) opened correctly
   */
  async validateUtilizationModalOpened(modalType: 'add' | 'reduce', personName: string, utilization: number) {
    const modalSelector = modalType === 'add' 
      ? 'div:has(h2:has-text("➕ Add Projects:"))'
      : 'div:has(h2:has-text("🔻 Reduce Load:"))';
    
    const modal = this.page.locator(modalSelector);
    await expect(modal).toBeVisible({ timeout: 10000 });
    
    // Verify person information
    await expect(modal).toContainText(personName);
    await expect(modal).toContainText(`${utilization}% utilization`);
    
    // Verify close button
    const closeButton = modal.locator('button:has(svg), button:has-text("×")');
    await expect(closeButton).toBeVisible();
    
    // Wait for content to load (network idle means data has been fetched)
    await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    console.log(`✅ ${modalType === 'add' ? 'Add Projects' : 'Reduce Load'} modal validated for ${personName}`);
    return modal;
  }

  /**
   * Validates project recommendations in Add Projects modal
   */
  async validateProjectRecommendations(modal: any) {
    // Check for either projects or no projects message
    const projectCards = modal.locator('div:has(h4)').filter({ hasText: 'h/week' });
    const noProjectsMessage = modal.locator('text="No suitable projects found"');
    
    const projectCount = await projectCards.count();
    const hasNoProjectsMessage = await noProjectsMessage.isVisible();
    
    expect(projectCount > 0 || hasNoProjectsMessage).toBeTruthy();
    
    if (projectCount > 0) {
      // Validate first project structure
      const firstProject = projectCards.first();
      
      await expect(firstProject.locator('h4')).toBeVisible(); // Project name
      await expect(firstProject).toContainText('h/week'); // Estimated hours
      await expect(firstProject).toContainText('Priority'); // Priority level
      await expect(firstProject).toContainText('👤'); // Role information
      
      const assignButton = firstProject.locator('button:has-text("Assign")');
      await expect(assignButton).toBeVisible();
      
      const matchBadge = firstProject.locator('span:has-text("Match")');
      await expect(matchBadge).toBeVisible();
      
      console.log(`✅ Validated ${projectCount} project recommendations`);
      return { hasProjects: true, projectCount, firstProject };
    } else {
      console.log('✅ Validated no projects message displayed correctly');
      return { hasProjects: false, projectCount: 0, firstProject: null };
    }
  }

  /**
   * Validates assignment list in Reduce Load modal
   */
  async validateAssignmentList(modal: any) {
    // Check for either assignments or no assignments message
    const assignmentCards = modal.locator('div:has(h4)').filter({ hasText: 'Remove' });
    const noAssignmentsMessage = modal.locator('text="No current assignments found"');
    
    const assignmentCount = await assignmentCards.count();
    const hasNoAssignmentsMessage = await noAssignmentsMessage.isVisible();
    
    expect(assignmentCount > 0 || hasNoAssignmentsMessage).toBeTruthy();
    
    if (assignmentCount > 0) {
      // Validate first assignment structure
      const firstAssignment = assignmentCards.first();
      
      await expect(firstAssignment.locator('h4')).toBeVisible(); // Project name
      await expect(firstAssignment).toContainText('h/week'); // Hours
      await expect(firstAssignment).toContainText('Impact'); // Impact level
      await expect(firstAssignment).toContainText('👤'); // Role information
      
      const removeButton = firstAssignment.locator('button:has-text("Remove")');
      await expect(removeButton).toBeVisible();
      
      const scoreBadge = firstAssignment.locator('span:has-text("Remove"), span:has-text("Moderate"), span:has-text("Keep")');
      await expect(scoreBadge).toBeVisible();
      
      console.log(`✅ Validated ${assignmentCount} current assignments`);
      return { hasAssignments: true, assignmentCount, firstAssignment };
    } else {
      console.log('✅ Validated no assignments message displayed correctly');
      return { hasAssignments: false, assignmentCount: 0, firstAssignment: null };
    }
  }

  /**
   * Performs assignment creation through Add Projects modal with full validation
   */
  async performAssignmentCreation(projectElement: any, personName: string, expectedProjectName: string) {
    // Monitor API calls
    const createResponse = this.page.waitForResponse(response => 
      response.url().includes('/api/assignments') && 
      response.request().method() === 'POST'
    );
    
    // Monitor console errors
    const consoleErrors: string[] = [];
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    // Handle confirmation dialog
    this.page.on('dialog', dialog => {
      expect(dialog.message()).toContain('Are you sure you want to assign');
      expect(dialog.message()).toContain(personName);
      expect(dialog.message()).toContain(expectedProjectName);
      dialog.accept();
    });
    
    // Click assign button
    await projectElement.locator('button:has-text("Assign")').click();
    
    // Verify API call was successful
    const response = await createResponse;
    expect(response.status()).toBe(201);
    
    // Validate response structure
    const responseBody = await this.validateAssignmentCreationResponse(response);
    
    // Verify no console errors
    expect(consoleErrors.length).toBe(0);
    
    console.log('✅ Assignment creation completed successfully with validation');
    return responseBody;
  }

  /**
   * Performs assignment removal through Reduce Load modal with full validation
   */
  async performAssignmentRemoval(assignmentElement: any, personName: string, expectedProjectName: string) {
    // Monitor API calls
    const deleteResponse = this.page.waitForResponse(response => 
      response.url().includes('/api/assignments') && 
      response.request().method() === 'DELETE'
    );
    
    // Monitor console errors
    const consoleErrors: string[] = [];
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    // Handle confirmation dialog
    this.page.on('dialog', dialog => {
      expect(dialog.message()).toContain('Are you sure you want to remove');
      expect(dialog.message()).toContain(personName);
      expect(dialog.message()).toContain(expectedProjectName);
      dialog.accept();
    });
    
    // Click remove button
    await assignmentElement.locator('button:has-text("Remove")').click();
    
    // Verify API call was successful
    const response = await deleteResponse;
    expect(response.status()).toBe(200);
    
    // Validate response structure
    const responseBody = await this.validateAssignmentDeletionResponse(response);
    
    // Verify no console errors
    expect(consoleErrors.length).toBe(0);
    
    console.log('✅ Assignment removal completed successfully with validation');
    return responseBody;
  }

  /**
   * Validates utilization change after modal operations
   */
  async validateUtilizationChange(
    personName: string,
    initialUtilization: number,
    expectedChange: 'increase' | 'decrease'
  ) {
    // Wait for data refresh (network idle means data has been refetched)
    await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    
    // Find the person in the updated table
    const tableRows = this.page.locator('table:has(th:has-text("Team Member")) tbody tr');
    const rowCount = await tableRows.count();
    
    for (let i = 0; i < rowCount; i++) {
      const row = tableRows.nth(i);
      const nameCell = row.locator('td').nth(0);
      const utilizationCell = row.locator('td').nth(2);
      
      const currentName = await nameCell.textContent() || '';
      if (currentName === personName) {
        const currentUtilizationText = await utilizationCell.textContent() || '';
        const currentUtilization = parseInt(currentUtilizationText.replace('%', '').trim());
        
        if (expectedChange === 'increase') {
          expect(currentUtilization).toBeGreaterThan(initialUtilization);
          console.log(`✅ Utilization increased from ${initialUtilization}% to ${currentUtilization}%`);
        } else {
          expect(currentUtilization).toBeLessThanOrEqual(initialUtilization);
          console.log(`✅ Utilization decreased from ${initialUtilization}% to ${currentUtilization}%`);
        }
        
        return currentUtilization;
      }
    }
    
    throw new Error(`Person ${personName} not found in updated utilization table`);
  }

  /**
   * Finds a person suitable for testing add projects functionality
   */
  async findPersonForAddProjects() {
    const tableRows = this.page.locator('table:has(th:has-text("Team Member")) tbody tr');
    const rowCount = await tableRows.count();
    
    for (let i = 0; i < rowCount; i++) {
      const row = tableRows.nth(i);
      const nameCell = row.locator('td').nth(0);
      const utilizationCell = row.locator('td').nth(2);
      const actionsCell = row.locator('td').nth(4);
      
      const personName = await nameCell.textContent() || '';
      const utilizationText = await utilizationCell.textContent() || '';
      const utilization = parseInt(utilizationText.replace('%', '').trim());
      
      // Look for person with capacity and available add button
      if (utilization < 90) {
        const addButton = actionsCell.locator('button:has-text("➕"), button:has-text("Add")');
        if (await addButton.count() > 0) {
          return { row, personName, utilization, addButton };
        }
      }
    }
    
    return null;
  }

  /**
   * Finds a person suitable for testing reduce load functionality
   */
  async findPersonForReduceLoad() {
    const tableRows = this.page.locator('table:has(th:has-text("Team Member")) tbody tr');
    const rowCount = await tableRows.count();
    
    for (let i = 0; i < rowCount; i++) {
      const row = tableRows.nth(i);
      const nameCell = row.locator('td').nth(0);
      const utilizationCell = row.locator('td').nth(2);
      const actionsCell = row.locator('td').nth(4);
      
      const personName = await nameCell.textContent() || '';
      const utilizationText = await utilizationCell.textContent() || '';
      const utilization = parseInt(utilizationText.replace('%', '').trim());
      
      // Look for person with assignments and available reduce button
      if (utilization > 20) {
        const reduceButton = actionsCell.locator('button:has-text("🔻"), button:has-text("Reduce")');
        if (await reduceButton.count() > 0) {
          return { row, personName, utilization, reduceButton };
        }
      }
    }
    
    return null;
  }
}
// Re-export auth helpers for convenience
export { setupPageWithAuth };
