import { Page } from '@playwright/test';

export async function login(page: Page) {
  // Navigate to the application (baseURL-relative — never hardcode a port)
  await page.goto('/');
  
  // Check if we need to select a profile
  const profileModal = page.locator('.profile-selection-modal');
  if (await profileModal.isVisible()) {
    // Select the first available profile
    await page.locator('button:has-text("Select your name")').click();
    await page.locator('[role="option"]').first().click();
    await page.locator('button:has-text("Continue")').click();
    
    // Wait for modal to close
    await profileModal.waitFor({ state: 'hidden' });
  }
}