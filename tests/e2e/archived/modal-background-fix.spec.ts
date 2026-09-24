import { test, expect } from './fixtures'
test.describe('Modal Background Fix', () => {
  test('profile select modal should have opaque background', async ({ authenticatedPage, testHelpers }) => {
    // Navigate to the application
    await authenticatedPage.goto('http://localhost:3121');
    // Wait for the modal to appear
    await expect(authenticatedPage.getByRole('dialog')).toBeVisible();
    // Wait a moment for styles to be fully applied
    await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
    // Get the modal content element
    const modalContent = authenticatedPage.locator('[role="dialog"]').first();
    // Check computed styles
    const backgroundColor = await modalContent.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        backgroundColor: computed.backgroundColor,
        opacity: computed.opacity,
        cssVarBackground: computed.getPropertyValue('--background'),
        actualBgColor: computed.backgroundColor,
        isTransparent: computed.backgroundColor === 'rgba(0, 0, 0, 0)' || 
                       computed.backgroundColor === 'transparent' ||
                       computed.backgroundColor === '',
        inlineStyle: el.style.backgroundColor
      };
    });
    console.log('Modal background styles:', backgroundColor);
    // Check if background is properly set
    expect(backgroundColor.isTransparent).toBe(false);
    // Take a screenshot for visual inspection
    await authenticatedPage.screenshot({ 
      path: 'tests/screenshots/modal-background-test.png',
      fullPage: true 
    });
  });
  test('check CSS variables inheritance in portal', async ({ authenticatedPage, testHelpers }) => {
    await authenticatedPage.goto('http://localhost:3121');
    // Wait for modal
    await expect(authenticatedPage.getByRole('dialog')).toBeVisible();
    // Check root element CSS variables
    const rootVars = await authenticatedPage.evaluate(() => {
      const root = document.documentElement;
      const computed = window.getComputedStyle(root);
      return {
        '--background': computed.getPropertyValue('--background'),
        '--foreground': computed.getPropertyValue('--foreground'),
        theme: root.className,
        dataTheme: root.getAttribute('data-theme')
      };
    });
    console.log('Root CSS variables:', rootVars);
    // Check modal CSS variables
    const modalVars = await authenticatedPage.locator('[role="dialog"]').first().evaluate((el) => {
      const computed = window.getComputedStyle(el);
      const parent = el.parentElement;
      const parentComputed = parent ? window.getComputedStyle(parent) : null;
      return {
        modal: {
          '--background': computed.getPropertyValue('--background'),
          '--foreground': computed.getPropertyValue('--foreground'),
          backgroundColor: computed.backgroundColor,
          inlineStyle: el.style.backgroundColor,
          computedBgFromVar: `hsl(${computed.getPropertyValue('--background')})`,
          classes: el.className
        },
        parent: parentComputed ? {
          '--background': parentComputed.getPropertyValue('--background'),
          '--foreground': parentComputed.getPropertyValue('--foreground'),
          backgroundColor: parentComputed.backgroundColor,
          classes: parent.className
        } : null
      };
    });
    console.log('Modal CSS variables:', modalVars);
  });
});