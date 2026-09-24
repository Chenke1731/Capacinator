import { Page } from '@playwright/test';

export interface AuthConfig {
  profileModalTimeout?: number;
  navigationTimeout?: number;
  selectDropdownTimeout?: number;
  continueButtonTimeout?: number;
  skipIfAuthenticated?: boolean;
}

const DEFAULT_CONFIG: Required<AuthConfig> = {
  // 20s: cold e2e world first-render can exceed 10s (vite on-demand
  // compilation); 5s caused false "no modal" skips on 2026-09-24
  profileModalTimeout: 20000,
  navigationTimeout: 15000,
  selectDropdownTimeout: 5000,
  continueButtonTimeout: 10000,
  skipIfAuthenticated: true
};

export class ImprovedAuthHelper {
  private page: Page;
  private config: Required<AuthConfig>;

  constructor(page: Page, config: AuthConfig = {}) {
    this.page = page;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if user is already authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    try {
      const hasUser = await this.page.evaluate(() => {
        const userData = localStorage.getItem('capacinator_current_user');
        return userData !== null && userData !== 'null' && userData !== '';
      });
      return hasUser;
    } catch {
      return false;
    }
  }

  /**
   * Wait for page to stabilize after navigation
   */
  async waitForPageLoad(): Promise<void> {
    try {
      // Wait for network to settle
      await this.page.waitForLoadState('networkidle', { 
        timeout: this.config.navigationTimeout 
      });
    } catch {
      // If network doesn't settle, at least wait for DOM
      await this.page.waitForLoadState('domcontentloaded');
    }
  }

  /**
   * Handle profile selection with improved error handling
   */
  async handleProfileSelection(): Promise<boolean> {
    console.log('🔍 Checking for profile selection modal...');

    // Check if already authenticated
    if (this.config.skipIfAuthenticated) {
      const isAuth = await this.isAuthenticated();
      if (isAuth) {
        console.log('✅ Already authenticated, skipping profile selection');
        return true;
      }
    }

    try {
      // Wait for page to stabilize first
      await this.waitForPageLoad();

      // Check if profile modal exists
      const profileModal = this.page.locator('text="Select Your Profile"');
      const modalVisible = await profileModal.isVisible({ 
        timeout: this.config.profileModalTimeout 
      }).catch(() => false);

      if (!modalVisible) {
        console.log('✅ No profile modal detected, continuing...');
        return true;
      }

      console.log('📋 Profile modal detected, proceeding with selection...');

      // Wait for the select component to be ready
      const selectTrigger = this.page.locator('#person-select');
      
      try {
        await selectTrigger.waitFor({ 
          state: 'visible', 
          timeout: this.config.selectDropdownTimeout 
        });
        console.log('📝 Profile select component found');
      } catch (error) {
        console.log('❌ Profile select component not found within timeout');
        // Try to continue anyway or throw based on requirements
        throw new Error('Profile select component not found');
      }

      // Select profile
      const profileSelected = await this.selectProfile();
      if (!profileSelected) {
        throw new Error('Failed to select profile');
      }

      // Click Continue button
      await this.clickContinueButton();

      // Wait for modal to close
      await this.waitForModalClose(profileModal);

      // Wait for navigation to complete
      await this.waitForNavigationComplete();

      console.log('🎉 Profile selection process completed');
      return true;

    } catch (error) {
      console.log(`❌ Profile selection failed: ${error.message}`);
      
      // Try to continue anyway if possible
      console.log('🔄 Attempting to continue anyway...');
      
      // Take screenshot for debugging
      await this.page.screenshot({ 
        path: '/tmp/profile-modal-error.png' 
      }).catch(() => console.log('📸 Failed to save error screenshot'));

      // Check if we're already on the main page despite the error
      const isOnMainPage = await this.checkIfOnMainPage();
      if (isOnMainPage) {
        console.log('✅ Already on main page despite error');
        return true;
      }

      return false;
    }
  }

  /**
   * Select a profile from the dropdown
   */
  private async selectProfile(): Promise<boolean> {
    console.log('🎯 Attempting to select profile...');

    try {
      // Click the select trigger
      const selectTrigger = this.page.locator('#person-select');
      await selectTrigger.click();
      console.log('📂 Opened shadcn Select dropdown');

      // Wait for options with multiple selectors
      const optionSelectors = [
        '[role="option"]:visible',
        '[data-radix-collection-item]:visible',
        '[role="listbox"] [role="option"]:visible'
      ];

      let options = null;
      let optionCount = 0;

      // Try each selector
      for (const selector of optionSelectors) {
        try {
          await this.page.waitForSelector(selector, { 
            timeout: this.config.selectDropdownTimeout 
          });
          options = this.page.locator(selector);
          optionCount = await options.count();
          if (optionCount > 0) break;
        } catch {
          continue;
        }
      }

      if (!options || optionCount === 0) {
        console.log('⚠️ No dropdown options found');
        return false;
      }

      // Select the first option
      const firstOption = options.first();
      const optionText = await firstOption.textContent();
      console.log(`Selecting profile: ${optionText}`);
      await firstOption.click();
      console.log('✅ Profile selected using shadcn Select');

      // Wait for selection to register (dropdown closes)
      await this.page.waitForSelector('[role="listbox"]', { state: 'hidden', timeout: 3000 }).catch(() => {});
      return true;

    } catch (error) {
      console.log(`❌ Failed to select profile: ${error.message}`);
      return false;
    }
  }

  /**
   * Click the Continue button
   */
  private async clickContinueButton(): Promise<void> {
    console.log('⏳ Waiting for Continue button to become enabled...');

    const continueButton = this.page.locator('button:has-text("Continue")');
    
    // Wait for button to be visible
    await continueButton.waitFor({ 
      state: 'visible', 
      timeout: this.config.continueButtonTimeout 
    });

    // Wait for button to be enabled
    await this.page.waitForFunction(
      () => {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          if (btn.textContent?.includes('Continue') && !(btn as HTMLButtonElement).disabled) {
            return true;
          }
        }
        return false;
      },
      { timeout: this.config.continueButtonTimeout }
    );

    console.log('✅ Continue button is now enabled');
    console.log('👆 Clicking Continue button...');
    
    await continueButton.click();
    console.log('✅ Continue button clicked successfully');
  }

  /**
   * Wait for profile modal to close
   */
  private async waitForModalClose(profileModal: any): Promise<void> {
    console.log('⏳ Waiting for profile modal to close...');
    
    await profileModal.waitFor({ 
      state: 'detached', 
      timeout: this.config.navigationTimeout 
    });
    
    console.log('✅ Profile modal successfully closed');
  }

  /**
   * Wait for navigation to complete after profile selection
   */
  private async waitForNavigationComplete(): Promise<void> {
    console.log('⏳ Waiting for navigation to stabilize...');
    
    try {
      await this.page.waitForLoadState('networkidle', { 
        timeout: this.config.navigationTimeout 
      });
      console.log('✅ Network activity settled');
    } catch {
      // Fallback to DOM ready
      await this.page.waitForLoadState('domcontentloaded');
      console.log('✅ DOM content loaded');
    }
  }

  /**
   * Check if we're on the main application page
   */
  private async checkIfOnMainPage(): Promise<boolean> {
    const mainPageSelectors = [
      '.sidebar',
      'nav',
      '[role="navigation"]',
      'a[href="/dashboard"]',
      'a[href="/people"]',
      'main',
      '[role="main"]'
    ];

    for (const selector of mainPageSelectors) {
      const count = await this.page.locator(selector).count();
      if (count > 0) {
        return true;
      }
    }

    return false;
  }

  /**
   * Setup page with authentication handling
   */
  async setupPageWithAuth(url: string = '/'): Promise<void> {
    // Navigate to the page
    await this.page.goto(url, { 
      waitUntil: 'domcontentloaded',
      timeout: this.config.navigationTimeout 
    });

    // Handle profile selection if needed
    await this.handleProfileSelection();

    // Wait for page content
    await this.waitForPageContent();
  }

  /**
   * Wait for page content to be ready
   */
  private async waitForPageContent(): Promise<void> {
    console.log('Waiting for page content to load...');

    const contentSelectors = [
      '.layout-container',
      '.sidebar',
      'nav',
      'main',
      'h1',
      '.chart-container',
      'table',
      '.table',
      '.report-tabs',
      'button.tab'
    ];

    try {
      // Wait for at least one content element
      await this.page.waitForSelector(contentSelectors.join(', '), {
        timeout: this.config.navigationTimeout
      });

      // Log what we found
      for (const selector of contentSelectors.slice(0, 5)) {
        const found = await this.page.locator(selector).count() > 0;
        if (found) {
          console.log(`✅ Found content: ${selector}`);
          break;
        }
      }

    } catch (error) {
      console.log('⚠️ No specific content found within timeout, but page is still open');
    }
  }
}

/**
 * Convenience function for quick setup
 */
export async function setupPageWithAuth(page: Page, url: string = '/', config?: AuthConfig): Promise<void> {
  const authHelper = new ImprovedAuthHelper(page, config);
  await authHelper.setupPageWithAuth(url);
}