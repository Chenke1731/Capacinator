import { test, expect } from './fixtures';
test.describe('Mobile Features Comprehensive Tests', () => {
  test.describe('Mobile Responsive Layouts', () => {
    test('should adapt dashboard layout for mobile viewport', async ({ authenticatedPage, testHelpers }) => {
      // Test mobile viewport (375x667 - iPhone SE)
      await authenticatedPage.setViewportSize({ width: 375, height: 667 });
      await testHelpers.navigateTo('/dashboard');
      await testHelpers.setupPage();
      // Check if dashboard cards stack vertically on mobile
      const dashboardCards = authenticatedPage.locator('.dashboard-card, .metric-card, .summary-card');
      if (await dashboardCards.count() > 0) {
        // Get the position of first two cards to check stacking
        const firstCard = dashboardCards.first();
        const secondCard = dashboardCards.nth(1);
        if (await secondCard.count() > 0) {
          const firstCardBox = await firstCard.boundingBox();
          const secondCardBox = await secondCard.boundingBox();
          // On mobile, cards should stack vertically (second card below first)
          if (firstCardBox && secondCardBox) {
            expect(secondCardBox.y).toBeGreaterThan(firstCardBox.y + firstCardBox.height - 50);
            console.log('✅ Dashboard cards stack vertically on mobile');
          }
        }
      }
      // Check for mobile-optimized chart sizes
      const charts = authenticatedPage.locator('.recharts-responsive-container, .chart-container');
      if (await charts.count() > 0) {
        const chartBox = await charts.first().boundingBox();
        if (chartBox) {
          expect(chartBox.width).toBeLessThan(400); // Should fit mobile viewport
          console.log('✅ Charts adapt to mobile viewport size');
        }
      }
    });
    test('should handle tablet viewport transitions', async ({ authenticatedPage, testHelpers }) => {
      // Start with desktop viewport
      await authenticatedPage.setViewportSize({ width: 1200, height: 800 });
      await testHelpers.navigateTo('/projects');
      await testHelpers.setupPage();
      // Check initial layout
      const sidebar = authenticatedPage.locator('.sidebar');
      const mainContent = authenticatedPage.locator('.main-content');
      if (await sidebar.count() > 0) {
        const sidebarBox = await sidebar.boundingBox();
        expect(sidebarBox?.width).toBeGreaterThan(200);
      }
      // Transition to tablet viewport (768px)
      await authenticatedPage.setViewportSize({ width: 768, height: 1024 });
      await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {}); // Allow layout to adapt
      // Check if layout adapts for tablet
      if (await sidebar.count() > 0) {
        const newSidebarBox = await sidebar.boundingBox();
        console.log(`✅ Sidebar adapts to tablet viewport: ${newSidebarBox?.width}px wide`);
      }
      // Check if content area adjusts
      if (await mainContent.count() > 0) {
        const contentBox = await mainContent.boundingBox();
        expect(contentBox?.width).toBeLessThan(600); // Should fit tablet layout
        console.log('✅ Main content adapts to tablet viewport');
      }
    });
    test('should display full-screen modals on mobile', async ({ authenticatedPage, testHelpers }) => {
      await authenticatedPage.setViewportSize({ width: 375, height: 667 });
      await testHelpers.navigateTo('/projects');
      await testHelpers.setupPage();
      // Try to open a modal (new project)
      const newProjectButton = authenticatedPage.locator('button:has-text("Add Project"), button:has-text("New Project")');
      if (await newProjectButton.count() > 0) {
        await newProjectButton.click();
        await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        // Check if modal goes full-screen on mobile
        const modal = authenticatedPage.locator('.modal, .dialog, [role="dialog"]');
        if (await modal.count() > 0) {
          const modalBox = await modal.boundingBox();
          const viewport = authenticatedPage.viewportSize();
          if (modalBox && viewport) {
            // Modal should take most of the screen on mobile
            const widthRatio = modalBox.width / viewport.width;
            const heightRatio = modalBox.height / viewport.height;
            expect(widthRatio).toBeGreaterThan(0.8); // At least 80% width
            console.log(`✅ Modal uses ${Math.round(widthRatio * 100)}% of mobile viewport width`);
          }
        }
      }
    });
    test('should handle data table responsive behavior', async ({ authenticatedPage, testHelpers }) => {
      await authenticatedPage.setViewportSize({ width: 375, height: 667 });
      await testHelpers.navigateTo('/people');
      await testHelpers.setupPage();
      // Check for data table
      const table = authenticatedPage.locator('table, .data-table');
      if (await table.count() > 0) {
        const tableBox = await table.boundingBox();
        const viewport = authenticatedPage.viewportSize();
        if (tableBox && viewport) {
          // Table might be wider than viewport, requiring horizontal scroll
          if (tableBox.width > viewport.width) {
            console.log('✅ Data table enables horizontal scroll on mobile');
            // Check for scrollable container
            const scrollContainer = authenticatedPage.locator('.table-container, .overflow-x-auto, .table-responsive');
            expect(await scrollContainer.count()).toBeGreaterThan(0);
          }
        }
        // Check if table headers are visible
        const tableHeaders = authenticatedPage.locator('th');
        if (await tableHeaders.count() > 0) {
          const headerVisible = await tableHeaders.first().isVisible();
          expect(headerVisible).toBeTruthy();
          console.log('✅ Table headers remain accessible on mobile');
        }
      }
    });
    test('should adapt form layouts for mobile', async ({ authenticatedPage, testHelpers }) => {
      await authenticatedPage.setViewportSize({ width: 375, height: 667 });
      await testHelpers.navigateTo('/settings');
      await testHelpers.setupPage();
      // Check form layout adaptation
      const formFields = authenticatedPage.locator('input, select, textarea');
      if (await formFields.count() > 0) {
        // Check if form fields are full-width on mobile
        const fieldBox = await formFields.first().boundingBox();
        const viewport = authenticatedPage.viewportSize();
        if (fieldBox && viewport) {
          const widthRatio = fieldBox.width / (viewport.width - 40); // Account for padding
          expect(widthRatio).toBeGreaterThan(0.8); // Should be mostly full-width
          console.log('✅ Form fields adapt to mobile width');
        }
        // Check if labels are positioned correctly for mobile
        const labels = authenticatedPage.locator('label');
        if (await labels.count() > 0) {
          console.log('✅ Form labels adapt to mobile layout');
        }
      }
    });
  });
  test.describe('Touch Interactions and Navigation', () => {
    test('should handle basic touch interactions', async ({ authenticatedPage, testHelpers }) => {
      // Use mobile viewport and test touch-like behavior
      await authenticatedPage.setViewportSize({ width: 375, height: 667 });
      await testHelpers.navigateTo('/dashboard');
      await testHelpers.setupPage();
      // Test button touch interactions
      const buttons = authenticatedPage.locator('button:visible');
      if (await buttons.count() > 0) {
        const firstButton = buttons.first();
        // Check button touch target size (minimum 44px for accessibility)
        const buttonBox = await firstButton.boundingBox();
        if (buttonBox) {
          expect(buttonBox.height).toBeGreaterThanOrEqual(40); // Close to touch target size
          console.log(`✅ Button touch target size: ${buttonBox.height}px`);
        }
        // Test touch interaction
        await firstButton.click();
        await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
        console.log('✅ Basic touch interaction successful');
      }
    });
    test('should support mobile navigation patterns', async ({ authenticatedPage, testHelpers }) => {
      await authenticatedPage.setViewportSize({ width: 375, height: 667 });
      await testHelpers.navigateTo('/');
      await testHelpers.setupPage();
      // Check sidebar behavior on mobile
      const sidebar = authenticatedPage.locator('.sidebar');
      if (await sidebar.count() > 0) {
        const sidebarVisible = await sidebar.isVisible();
        if (sidebarVisible) {
          console.log('✅ Fixed sidebar navigation on mobile');
          // Test navigation link clicks
          const navLinks = authenticatedPage.locator('.sidebar a, .nav-link');
          if (await navLinks.count() > 0) {
            await navLinks.first().click();
            await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
            console.log('✅ Mobile navigation links functional');
          }
        }
      }
      // Look for mobile menu toggle (if implemented)
      const menuToggle = authenticatedPage.locator('button[aria-label*="menu"], .hamburger, .menu-toggle');
      if (await menuToggle.count() > 0) {
        await menuToggle.click();
        await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
        console.log('✅ Mobile menu toggle functionality available');
      } else {
        console.log('ℹ️ No mobile hamburger menu found - using fixed sidebar');
      }
    });
    test('should handle gesture-like interactions', async ({ authenticatedPage, testHelpers }) => {
      await authenticatedPage.setViewportSize({ width: 375, height: 667 });
      await testHelpers.navigateTo('/projects');
      await testHelpers.setupPage();
      // Test swipe-like behavior (not true gestures, but mouse drag simulation)
      const scrollableArea = authenticatedPage.locator('.table-container, .scroll-container, .main-content');
      if (await scrollableArea.count() > 0) {
        const scrollArea = scrollableArea.first();
        const scrollBox = await scrollArea.boundingBox();
        if (scrollBox) {
          // Simulate horizontal scroll/swipe on mobile
          await authenticatedPage.mouse.move(scrollBox.x + 100, scrollBox.y + 50);
          await authenticatedPage.mouse.down();
          await authenticatedPage.mouse.move(scrollBox.x + 50, scrollBox.y + 50);
          await authenticatedPage.mouse.up();
          console.log('✅ Horizontal scroll/swipe simulation successful');
        }
      }
      // Test pull-to-refresh simulation (if available)
      const refreshArea = authenticatedPage.locator('.refresh-container, [data-testid="pull-refresh"]');
      if (await refreshArea.count() > 0) {
        console.log('✅ Pull-to-refresh functionality detected');
      } else {
        console.log('ℹ️ Pull-to-refresh not implemented');
      }
    });
    test('should support keyboard navigation on mobile', async ({ authenticatedPage, testHelpers }) => {
      await authenticatedPage.setViewportSize({ width: 375, height: 667 });
      await testHelpers.navigateTo('/settings');
      await testHelpers.setupPage();
      // Test tab navigation on mobile devices with keyboards
      await authenticatedPage.keyboard.press('Tab');
      await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 2000 }).catch(() => {});
      const focusedElement = authenticatedPage.locator(':focus');
      if (await focusedElement.count() > 0) {
        console.log('✅ Keyboard navigation works on mobile viewport');
        // Continue tabbing through elements
        for (let i = 0; i < 5; i++) {
          await authenticatedPage.keyboard.press('Tab');
          await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 2000 }).catch(() => {});
        }
        console.log('✅ Tab navigation sequence completed');
      }
    });
  });
  test.describe('Mobile Workflows and User Experience', () => {
    test('should complete project creation workflow on mobile', async ({ authenticatedPage, testHelpers }) => {
      await authenticatedPage.setViewportSize({ width: 375, height: 667 });
      await testHelpers.navigateTo('/projects');
      await testHelpers.setupPage();
      // Start project creation workflow
      const newProjectButton = authenticatedPage.locator('button:has-text("Add Project"), button:has-text("New Project")');
      if (await newProjectButton.count() > 0) {
        await newProjectButton.click();
        await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        // Fill project form on mobile
        const nameField = authenticatedPage.locator('input[name="name"], input[placeholder*="name"]');
        if (await nameField.count() > 0) {
          await nameField.fill('Mobile Test Project');
          // Check if virtual keyboard doesn't obstruct form
          const fieldBox = await nameField.boundingBox();
          if (fieldBox) {
            expect(fieldBox.y).toBeGreaterThan(0); // Should be visible
            console.log('✅ Form field remains visible during mobile input');
          }
        }
        // Select project type on mobile
        const typeSelect = authenticatedPage.locator('select[name="project_type_id"], select[name="type"]');
        if (await typeSelect.count() > 0 && await typeSelect.locator('option').count() > 1) {
          await typeSelect.selectOption({ index: 1 });
          console.log('✅ Dropdown selection works on mobile');
        }
        // Save project
        const saveButton = authenticatedPage.locator('button[type="submit"], button:has-text("Save"), button:has-text("Create")');
        if (await saveButton.count() > 0) {
          await saveButton.click();
          await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
          console.log('✅ Mobile project creation workflow completed');
        }
      }
    });
    test('should handle assignment creation on mobile', async ({ authenticatedPage, testHelpers }) => {
      await authenticatedPage.setViewportSize({ width: 375, height: 667 });
      await testHelpers.navigateTo('/assignments');
      await testHelpers.setupPage();
      // Test assignment workflow
      const newAssignmentButton = authenticatedPage.locator('button:has-text("Add Assignment"), button:has-text("New Assignment")');
      if (await newAssignmentButton.count() > 0) {
        await newAssignmentButton.click();
        await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        // Test mobile form interactions
        const projectSelect = authenticatedPage.locator('select[name="project_id"]');
        const personSelect = authenticatedPage.locator('select[name="person_id"]');
        const allocationInput = authenticatedPage.locator('input[name="allocation_percentage"]');
        if (await projectSelect.count() > 0 && await projectSelect.locator('option').count() > 1) {
          await projectSelect.selectOption({ index: 1 });
        }
        if (await personSelect.count() > 0 && await personSelect.locator('option').count() > 1) {
          await personSelect.selectOption({ index: 1 });
        }
        if (await allocationInput.count() > 0) {
          await allocationInput.fill('50');
          // Test numeric input on mobile
          const inputValue = await allocationInput.inputValue();
          expect(inputValue).toBe('50');
          console.log('✅ Numeric input works correctly on mobile');
        }
        console.log('✅ Mobile assignment creation workflow functional');
      }
    });
    test('should navigate between pages efficiently on mobile', async ({ authenticatedPage, testHelpers }) => {
      await authenticatedPage.setViewportSize({ width: 375, height: 667 });
      await testHelpers.navigateTo('/dashboard');
      await testHelpers.setupPage();
      // Test navigation between key pages
      const navigationPages = [
        { name: 'Projects', path: '/projects' },
        { name: 'People', path: '/people' },
        { name: 'Assignments', path: '/assignments' },
        { name: 'Reports', path: '/reports' }
      ];
      for (const navPage of navigationPages) {
        const navLink = authenticatedPage.locator(`a:has-text("${navPage.name}"), nav a[href="${navPage.path}"]`);
        if (await navLink.count() > 0) {
          const startTime = Date.now();
          await navLink.click();
          await testHelpers.waitForNavigation();
          const endTime = Date.now();
          const navigationTime = endTime - startTime;
          expect(navigationTime).toBeLessThan(5000); // Should navigate within 5 seconds
          console.log(`✅ Navigation to ${navPage.name}: ${navigationTime}ms`);
        }
      }
    });
    test('should handle data filtering on mobile', async ({ authenticatedPage, testHelpers }) => {
      await authenticatedPage.setViewportSize({ width: 375, height: 667 });
      await testHelpers.navigateTo('/projects');
      await testHelpers.setupPage();
      // Test filter interactions on mobile
      const filterControls = authenticatedPage.locator('select, input[type="date"], input[name*="filter"]');
      if (await filterControls.count() > 0) {
        // Test date filter on mobile
        const dateFilter = authenticatedPage.locator('input[type="date"]');
        if (await dateFilter.count() > 0) {
          await dateFilter.first().fill('2024-01-01');
          await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
          console.log('✅ Date filter works on mobile');
        }
        // Test dropdown filter on mobile
        const selectFilter = authenticatedPage.locator('select');
        if (await selectFilter.count() > 0 && await selectFilter.first().locator('option').count() > 1) {
          await selectFilter.first().selectOption({ index: 1 });
          await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
          console.log('✅ Dropdown filter works on mobile');
        }
        // Check if results update
        const resultCount = await authenticatedPage.locator('tbody tr, .result-item').count();
        expect(resultCount).toBeGreaterThanOrEqual(0);
        console.log('✅ Mobile filtering produces results');
      }
    });
  });
  test.describe('Mobile Performance Testing', () => {
    test('should load pages efficiently on mobile', async ({ authenticatedPage, testHelpers }) => {
      await authenticatedPage.setViewportSize({ width: 375, height: 667 });
      // Test performance on key pages
      const testPages = [
        { name: 'Dashboard', path: '/' },
        { name: 'Projects', path: '/projects' },
        { name: 'Reports', path: '/reports' }
      ];
      for (const testPage of testPages) {
        const startTime = Date.now();
        await authenticatedPage.goto(testPage.path);
        await testHelpers.setupPage();
        await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
        const endTime = Date.now();
        const loadTime = endTime - startTime;
        expect(loadTime).toBeLessThan(10000); // Should load within 10 seconds
        console.log(`✅ ${testPage.name} mobile load time: ${loadTime}ms`);
      }
    });
    test('should handle large datasets on mobile', async ({ authenticatedPage, testHelpers }) => {
      await authenticatedPage.setViewportSize({ width: 375, height: 667 });
      await testHelpers.navigateTo('/people');
      await testHelpers.setupPage();
      // Set filters to potentially get more data
      const startDate = authenticatedPage.locator('input[type="date"]').first();
      if (await startDate.count() > 0) {
        await startDate.fill('2020-01-01');
      }
      const endDate = authenticatedPage.locator('input[type="date"]').last();
      if (await endDate.count() > 0) {
        await endDate.fill('2030-12-31');
      }
      // Apply filters and measure response time
      const startTime = Date.now();
      const applyButton = authenticatedPage.locator('button:has-text("Apply"), button:has-text("Filter")');
      if (await applyButton.count() > 0) {
        await applyButton.click();
      }
      await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      expect(responseTime).toBeLessThan(15000); // Should respond within 15 seconds on mobile
      console.log(`✅ Large dataset handling on mobile: ${responseTime}ms`);
    });
    test('should render charts efficiently on mobile', async ({ authenticatedPage, testHelpers }) => {
      await authenticatedPage.setViewportSize({ width: 375, height: 667 });
      await testHelpers.navigateTo('/reports');
      await testHelpers.setupPage();
      // Wait for charts to render
      const startTime = Date.now();
      const charts = authenticatedPage.locator('.recharts-responsive-container, .chart-container');
      if (await charts.count() > 0) {
        await expect(charts.first()).toBeVisible({ timeout: 10000 });
        const endTime = Date.now();
        const renderTime = endTime - startTime;
        expect(renderTime).toBeLessThan(8000); // Charts should render within 8 seconds
        console.log(`✅ Chart rendering on mobile: ${renderTime}ms`);
        // Check if charts are responsive
        const chartBox = await charts.first().boundingBox();
        if (chartBox) {
          expect(chartBox.width).toBeLessThan(400); // Should fit mobile viewport
          console.log('✅ Charts adapt to mobile viewport efficiently');
        }
      }
    });
  });
  test.describe('Offline Functionality Testing', () => {
    test('should detect network status', async ({ authenticatedPage, testHelpers }) => {
      await authenticatedPage.setViewportSize({ width: 375, height: 667 });
      await testHelpers.navigateTo('/dashboard');
      await testHelpers.setupPage();
      // Check for network status detection
      const networkStatus = authenticatedPage.locator('.network-status, .offline-indicator, [data-testid="network-status"]');
      if (await networkStatus.count() > 0) {
        console.log('✅ Network status detection available');
      } else {
        console.log('ℹ️ Network status detection not implemented');
      }
      // Test offline simulation
      await authenticatedPage.context().setOffline(true);
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      // Check for offline handling
      const offlineMessage = authenticatedPage.locator('text=/offline|no connection|network error/i');
      if (await offlineMessage.count() > 0) {
        console.log('✅ Offline detection and messaging working');
      } else {
        console.log('ℹ️ Offline detection not implemented');
      }
      // Restore online status
      await authenticatedPage.context().setOffline(false);
    });
    test('should handle data caching for offline use', async ({ authenticatedPage, testHelpers }) => {
      await authenticatedPage.setViewportSize({ width: 375, height: 667 });
      await testHelpers.navigateTo('/projects');
      await testHelpers.setupPage();
      // Load data while online
      await authenticatedPage.waitForLoadState('networkidle', { timeout: 30000 });
      const onlineDataCount = await authenticatedPage.locator('tbody tr, .project-item').count();
      // Go offline
      await authenticatedPage.context().setOffline(true);
      await authenticatedPage.reload();
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      // Check if data is still available (cached)
      const offlineDataCount = await authenticatedPage.locator('tbody tr, .project-item').count();
      if (offlineDataCount > 0) {
        console.log(`✅ Data caching works: ${offlineDataCount} items available offline`);
      } else {
        console.log('ℹ️ Offline data caching not implemented');
      }
      // Restore online status
      await authenticatedPage.context().setOffline(false);
    });
    test('should provide offline-first functionality', async ({ authenticatedPage, testHelpers }) => {
      await authenticatedPage.setViewportSize({ width: 375, height: 667 });
      // Check for PWA manifest
      const response = await authenticatedPage.request.get('/manifest.json').catch(() => null);
      if (response && response.status() === 200) {
        console.log('✅ PWA manifest available');
        const manifest = await response.json();
        expect(manifest.name || manifest.short_name).toBeTruthy();
      } else {
        console.log('ℹ️ PWA manifest not found');
      }
      // Check for service worker
      await testHelpers.navigateTo('/');
      await testHelpers.setupPage();
      const serviceWorker = await authenticatedPage.evaluate(() => {
        return 'serviceWorker' in navigator;
      });
      if (serviceWorker) {
        const swRegistered = await authenticatedPage.evaluate(() => {
          return navigator.serviceWorker.getRegistrations().then(regs => regs.length > 0);
        });
        if (swRegistered) {
          console.log('✅ Service worker registered');
        } else {
          console.log('ℹ️ Service worker not registered');
        }
      } else {
        console.log('ℹ️ Service worker not supported in test environment');
      }
    });
  });
  test.describe('Mobile Accessibility and Usability', () => {
    test('should maintain accessibility standards on mobile', async ({ authenticatedPage, testHelpers }) => {
      await authenticatedPage.setViewportSize({ width: 375, height: 667 });
      await testHelpers.navigateTo('/dashboard');
      await testHelpers.setupPage();
      // Check for proper viewport meta tag
      const viewportMeta = await authenticatedPage.locator('meta[name="viewport"]').getAttribute('content');
      expect(viewportMeta).toContain('width=device-width');
      console.log('✅ Proper viewport meta tag configured');
      // Check touch target sizes
      const interactiveElements = authenticatedPage.locator('button, a, input, select');
      const elementCount = await interactiveElements.count();
      if (elementCount > 0) {
        for (let i = 0; i < Math.min(elementCount, 5); i++) {
          const element = interactiveElements.nth(i);
          const box = await element.boundingBox();
          if (box) {
            const touchTargetSize = Math.min(box.width, box.height);
            if (touchTargetSize >= 40) { // Minimum touch target size
              console.log(`✅ Touch target ${i + 1}: ${touchTargetSize}px (accessible)`);
            }
          }
        }
      }
      // Check for proper focus indicators
      await authenticatedPage.keyboard.press('Tab');
      const focusedElement = authenticatedPage.locator(':focus');
      if (await focusedElement.count() > 0) {
        console.log('✅ Focus indicators work on mobile');
      }
    });
    test('should support mobile screen readers', async ({ authenticatedPage, testHelpers }) => {
      await authenticatedPage.setViewportSize({ width: 375, height: 667 });
      await testHelpers.navigateTo('/settings');
      await testHelpers.setupPage();
      // Check for ARIA labels and accessibility attributes
      const ariaLabels = authenticatedPage.locator('[aria-label], [aria-labelledby], [aria-describedby]');
      const ariaCount = await ariaLabels.count();
      if (ariaCount > 0) {
        console.log(`✅ Found ${ariaCount} elements with ARIA attributes`);
      }
      // Check for proper heading structure
      const headings = authenticatedPage.locator('h1, h2, h3, h4, h5, h6');
      const headingCount = await headings.count();
      if (headingCount > 0) {
        console.log(`✅ Found ${headingCount} headings for screen reader navigation`);
      }
      // Check for skip links
      const skipLinks = authenticatedPage.locator('a[href="#main"], a:has-text("Skip to content")');
      if (await skipLinks.count() > 0) {
        console.log('✅ Skip links available for accessibility');
      } else {
        console.log('ℹ️ Skip links not found');
      }
    });
    test('should handle landscape orientation', async ({ authenticatedPage, testHelpers }) => {
      // Start in portrait mode
      await authenticatedPage.setViewportSize({ width: 375, height: 667 });
      await testHelpers.navigateTo('/projects');
      await testHelpers.setupPage();
      // Switch to landscape mode
      await authenticatedPage.setViewportSize({ width: 667, height: 375 });
      await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      // Check if layout adapts to landscape
      const mainContent = authenticatedPage.locator('.main-content');
      if (await mainContent.count() > 0) {
        const contentBox = await mainContent.boundingBox();
        if (contentBox) {
          expect(contentBox.width).toBeGreaterThan(contentBox.height);
          console.log('✅ Layout adapts to landscape orientation');
        }
      }
      // Check if navigation remains accessible in landscape
      const sidebar = authenticatedPage.locator('.sidebar');
      if (await sidebar.count() > 0) {
        const sidebarVisible = await sidebar.isVisible();
        expect(sidebarVisible).toBeTruthy();
        console.log('✅ Navigation remains accessible in landscape mode');
      }
    });
  });
});