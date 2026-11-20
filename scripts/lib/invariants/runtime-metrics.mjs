/**
 * Browser-side measurement shared by U1 (text fit) and U3 (action safety).
 *
 * The function is serialized into page.evaluate, so it must not close over
 * Node-side values. It deliberately measures computed layout only: no writes.
 */
export function measurePage() {
  const textOf = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  const hasBox = (el) => {
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const style = getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none';
  };
  const lineCount = (el) => {
    if (!el) return 0;
    const tops = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.textContent || !node.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (rect.width <= 1 || rect.height <= 1) continue;
        if (!tops.some((top) => Math.abs(top - rect.top) <= 2)) tops.push(rect.top);
      }
    }
    return tops.length;
  };
  const describe = (el) => {
    const testId = el.getAttribute('data-testid');
    const id = testId || el.id;
    const classes = (el.className || '').toString().split(/\s+/).filter(Boolean).slice(0, 3).join('.');
    const base = `${el.tagName.toLowerCase()}${classes ? `.${classes}` : ''}`;
    return id ? `${base}#${id}` : base;
  };
  const accessibleName = (el) => {
    const labelledBy = el.getAttribute('aria-labelledby');
    const labelledText = labelledBy
      ? labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.innerText || '').join(' ')
      : '';
    return (
      el.getAttribute('aria-label') ||
      labelledText ||
      el.getAttribute('title') ||
      textOf(el) ||
      [...el.querySelectorAll('img[alt]')].map((img) => img.getAttribute('alt')).join(' ').trim()
    );
  };

  const contextOf = (el) => {
    if (el.closest('.table-actions')) return 'action';
    if (el.closest('[role="dialog"], [role="alertdialog"]')) return 'dialog';
    if (el.closest('thead, tbody tr td')) return 'table';
    if (el.closest('.page-header, .header-actions, .toolbar, .filter-bar, .filters, .filter-row')) return 'page-header';
    if (el.closest('nav, .sidebar')) return 'nav';
    return 'other';
  };

  const buttons = [...document.querySelectorAll('button, [role="button"]')]
    .filter(hasBox)
    .slice(0, 400)
    .map((el) => {
      const text = textOf(el);
      const rect = el.getBoundingClientRect();
      const name = accessibleName(el)?.replace(/\s+/g, ' ').trim() || '';
      return {
        selector: describe(el),
        text,
        name,
        context: contextOf(el),
        iconOnly: text.length === 0,
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
        lines: text ? lineCount(el) : 0,
        overflow: el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1,
        disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true',
      };
    });

  const tabs = [...document.querySelectorAll('[role="tab"], .tab-button, .nav-tab')]
    .filter(hasBox)
    .map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        selector: describe(el),
        text: textOf(el),
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
        lines: lineCount(el),
        overflow: el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1,
      };
    });

  const badges = [...document.querySelectorAll('.badge, .status-badge, [data-testid*="badge"]')]
    .filter(hasBox)
    .slice(0, 300)
    .map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        selector: describe(el),
        text: textOf(el),
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
        lines: lineCount(el),
        overflow: el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1,
      };
    });

  const tables = [...document.querySelectorAll('table')].map((table, index) => {
    const wrapper = table.parentElement;
    const tableRect = table.getBoundingClientRect();
    const wrapperRect = wrapper?.getBoundingClientRect();
    const headers = [...table.querySelectorAll('thead th')].map((th) => {
      const rect = th.getBoundingClientRect();
      return {
        selector: describe(th),
        text: textOf(th),
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
        lines: lineCount(th),
        whiteSpace: getComputedStyle(th).whiteSpace,
      };
    });
    const headerHeight = Math.round((table.querySelector('thead tr')?.getBoundingClientRect().height || 0) * 10) / 10;
    const firstRow = table.querySelector('tbody tr');
    const rowHeight = Math.round((firstRow?.getBoundingClientRect().height || 0) * 10) / 10;
    const dataCells = firstRow
      ? [...firstRow.querySelectorAll('td')].map((cell, cellIndex) => {
          const rect = cell.getBoundingClientRect();
          const style = getComputedStyle(cell);
          return {
            index: cellIndex,
            selector: describe(cell),
            text: textOf(cell).slice(0, 80),
            width: Math.round(rect.width * 10) / 10,
            clientWidth: cell.clientWidth,
            scrollWidth: cell.scrollWidth,
            overflowX: style.overflowX,
            whiteSpace: style.whiteSpace,
            textOverflow: style.textOverflow,
            hasControl: Boolean(cell.querySelector('button, input, select, textarea, [role="button"]')),
          };
        })
      : [];
    const actionIndex = headers.findIndex((header) => /操作|actions?/i.test(header.text));
    let action = null;
    if (actionIndex >= 0 && firstRow) {
      const cells = [...firstRow.querySelectorAll('td')];
      // Empty states render one colspan cell; treating it as the action column
      // produces a bogus 100% ratio.
      if (cells.length === headers.length) {
        const cell = cells[actionIndex] || cells[cells.length - 1];
        if (cell) {
          const rect = cell.getBoundingClientRect();
          const actionButtons = [...cell.querySelectorAll('button, [role="button"]')]
            .filter(hasBox)
            .map((el) => {
              const buttonRect = el.getBoundingClientRect();
              const text = textOf(el);
              return {
                selector: describe(el),
                text,
                name: accessibleName(el)?.replace(/\s+/g, ' ').trim() || '',
                iconOnly: text.length === 0,
                width: Math.round(buttonRect.width * 10) / 10,
                height: Math.round(buttonRect.height * 10) / 10,
                overflowsCell:
                  buttonRect.right > rect.right + 1 || buttonRect.left < rect.left - 1,
              };
            });
          action = {
            header: headers[actionIndex]?.text || '',
            width: Math.round(rect.width * 10) / 10,
            ratio: tableRect.width ? Math.round((rect.width / tableRect.width) * 1000) / 1000 : 0,
            visible:
              !wrapperRect ||
              (rect.right <= wrapperRect.right + 1 && rect.left >= wrapperRect.left - 1),
            buttons: actionButtons,
            textButtonCount: actionButtons.filter((button) => button.text.length > 0).length,
          };
        }
      }
    }
    return {
      index,
      selector: describe(table),
      width: Math.round(tableRect.width * 10) / 10,
      wrapperWidth: Math.round((wrapperRect?.width || 0) * 10) / 10,
      scrollWidth: wrapper?.scrollWidth || 0,
      clientWidth: wrapper?.clientWidth || 0,
      horizontalScroll: wrapper ? Math.max(0, wrapper.scrollWidth - wrapper.clientWidth) : 0,
      headerHeight,
      rowHeight,
      dataCells,
      headers,
      action,
    };
  });

  return {
    url: location.href,
    viewport: { width: innerWidth, height: innerHeight },
    title: document.title,
    tables,
    buttons,
    tabs,
    badges,
  };
}
