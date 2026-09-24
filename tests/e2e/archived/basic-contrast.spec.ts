import { test, expect } from './fixtures'
test.describe('Basic Color Contrast', () => {
  test('check basic text contrast', async ({ authenticatedPage, testHelpers }) => {
    await testHelpers.navigateTo('/');
    // Get computed styles of body and text
    const styles = await authenticatedPage.evaluate(() => {
      const body = document.body;
      const h1 = document.querySelector('h1');
      const bodyStyle = window.getComputedStyle(body);
      const h1Style = h1 ? window.getComputedStyle(h1) : null;
      return {
        bodyBg: bodyStyle.backgroundColor,
        bodyColor: bodyStyle.color,
        h1Color: h1Style?.color,
        colorScheme: bodyStyle.colorScheme,
        // Check CSS variables
        primaryColor: getComputedStyle(document.documentElement).getPropertyValue('--primary'),
        bgPrimary: getComputedStyle(document.documentElement).getPropertyValue('--bg-primary'),
        textPrimary: getComputedStyle(document.documentElement).getPropertyValue('--text-primary'),
      };
    });
    console.log('Styles:', styles);
    // Check if styles are loaded
    expect(styles.bodyBg).toBeTruthy();
    expect(styles.bodyColor).toBeTruthy();
  });
  test('check table contrast', async ({ authenticatedPage, testHelpers }) => {
    await testHelpers.navigateTo('/projects');
    await authenticatedPage.waitForSelector('.table', { timeout: 30000 });
    const tableStyles = await authenticatedPage.evaluate(() => {
      const table = document.querySelector('.table');
      const th = document.querySelector('.table th');
      const td = document.querySelector('.table td');
      if (!table || !th || !td) return null;
      const tableStyle = window.getComputedStyle(table);
      const thStyle = window.getComputedStyle(th);
      const tdStyle = window.getComputedStyle(td);
      // Get parent backgrounds
      const getEffectiveBg = (elem: Element) => {
        let current = elem;
        while (current) {
          const bg = window.getComputedStyle(current).backgroundColor;
          if (bg && bg !== 'rgba(0, 0, 0, 0)') return bg;
          if (!current.parentElement) break;
          current = current.parentElement;
        }
        return window.getComputedStyle(document.body).backgroundColor;
      };
      return {
        table: {
          bg: tableStyle.backgroundColor,
          effectiveBg: getEffectiveBg(table)
        },
        th: {
          color: thStyle.color,
          bg: thStyle.backgroundColor,
          effectiveBg: getEffectiveBg(th)
        },
        td: {
          color: tdStyle.color,
          bg: tdStyle.backgroundColor,
          effectiveBg: getEffectiveBg(td)
        },
        tableHoverBg: getComputedStyle(document.documentElement).getPropertyValue('--table-hover-bg'),
      };
    });
    console.log('Table styles:', tableStyles);
    expect(tableStyles).toBeTruthy();
    expect(tableStyles?.th.color).toBeTruthy();
    expect(tableStyles?.td.color).toBeTruthy();
  });
  test('check hover states', async ({ authenticatedPage, testHelpers }) => {
    await testHelpers.navigateTo('/projects');
    await authenticatedPage.waitForSelector('.table tbody tr', { timeout: 30000 });
    // Get normal state
    const normalState = await authenticatedPage.evaluate(() => {
      const row = document.querySelector('.table tbody tr');
      const td = row?.querySelector('td');
      if (!row || !td) return null;
      const rowStyle = window.getComputedStyle(row);
      const tdStyle = window.getComputedStyle(td);
      return {
        rowBg: rowStyle.backgroundColor,
        tdColor: tdStyle.color
      };
    });
    // Hover and get hover state
    await authenticatedPage.hover('.table tbody tr');
    await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 2000 }).catch(() => {}); // Wait for transition
    const hoverState = await authenticatedPage.evaluate(() => {
      const row = document.querySelector('.table tbody tr');
      const td = row?.querySelector('td');
      if (!row || !td) return null;
      const rowStyle = window.getComputedStyle(row);
      const tdStyle = window.getComputedStyle(td);
      return {
        rowBg: rowStyle.backgroundColor,
        tdColor: tdStyle.color
      };
    });
    console.log('Normal state:', normalState);
    console.log('Hover state:', hoverState);
    // Backgrounds should be different
    expect(normalState?.rowBg).not.toBe(hoverState?.rowBg);
  });
});