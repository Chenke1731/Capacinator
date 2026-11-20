/**
 * U1 — text fit at the 1366/1600 desktop matrix, in both shipped languages.
 *
 * The failure this prevents: auto-layout silently squeezes headers, buttons or
 * badges into vertical text, or pushes the action column outside the visible
 * table wrapper. Pixel baselines cannot catch it because a bad layout can be
 * frozen as "expected".
 */
export const U1_THRESHOLDS = {
  headerHeightMax: 56,
  actionRatioWarn: 0.3,
  actionRatioMax: 0.4,
  minTableWidthForRatio: 600,
  rowHeightWarn: 96,
};

const finding = (metrics, context, severity, rule, detail) => ({
  id: 'U1',
  severity,
  route: context.route.id,
  path: context.route.path,
  language: context.language,
  viewport: `${context.viewport.width}x${context.viewport.height}`,
  rule,
  selector: detail.selector,
  text: detail.text || '',
  expected: detail.expected,
  actual: detail.actual,
  message: detail.message,
});

export function evaluateU1(metrics, context) {
  const findings = [];
  const { route, language, viewport } = context;

  for (const table of metrics.tables || []) {
    if (table.headerHeight > U1_THRESHOLDS.headerHeightMax) {
      findings.push(finding(metrics, context, 'fail', 'header-height', {
        selector: `table[${table.index}]`,
        expected: `<=${U1_THRESHOLDS.headerHeightMax}px`,
        actual: `${table.headerHeight}px`,
        message: `表头行高 ${table.headerHeight}px，超过 ${U1_THRESHOLDS.headerHeightMax}px`,
      }));
    }
    for (const header of table.headers || []) {
      if (header.lines > 1) {
        findings.push(finding(metrics, context, 'fail', 'header-wrap', {
          selector: header.selector,
          text: header.text,
          expected: '1 line',
          actual: `${header.lines} lines`,
          message: `表头「${header.text}」换成 ${header.lines} 行（${language}）`,
        }));
      }
    }
    if (table.action) {
      if (!table.action.visible) {
        const hiddenSeverity = table.horizontalScroll > 0 ? 'warn' : 'fail';
        findings.push(finding(metrics, context, hiddenSeverity, 'action-hidden', {
          selector: `${table.selector} > action`,
          text: table.action.header,
          expected: 'action cell visible without horizontal scroll',
          actual: `cell ${table.action.width}px, table scroll ${table.horizontalScroll}px`,
          message: table.horizontalScroll > 0
            ? '动作列不在初始视口内，需要横向滚动才能操作（en-US 长表头场景先记警告）'
            : '动作列初始不可见：用户必须横向滚动才能操作',
        }));
      }
      if (table.width >= U1_THRESHOLDS.minTableWidthForRatio && table.action.ratio > U1_THRESHOLDS.actionRatioMax) {
        findings.push(finding(metrics, context, 'fail', 'action-ratio', {
          selector: `${table.selector} > action`,
          text: table.action.header,
          expected: `<=${U1_THRESHOLDS.actionRatioMax}`,
          actual: table.action.ratio.toFixed(3),
          message: `动作列占表宽 ${(table.action.ratio * 100).toFixed(1)}%，超过 ${(U1_THRESHOLDS.actionRatioMax * 100).toFixed(0)}%`,
        }));
      } else if (table.width >= U1_THRESHOLDS.minTableWidthForRatio && table.action.ratio > U1_THRESHOLDS.actionRatioWarn) {
        findings.push(finding(metrics, context, 'warn', 'action-ratio', {
          selector: `${table.selector} > action`,
          text: table.action.header,
          expected: `<=${U1_THRESHOLDS.actionRatioWarn}`,
          actual: table.action.ratio.toFixed(3),
          message: `动作列占表宽 ${(table.action.ratio * 100).toFixed(1)}%，超过警戒线 ${(U1_THRESHOLDS.actionRatioWarn * 100).toFixed(0)}%`,
        }));
      }
      for (const button of table.action.buttons || []) {
        if (button.overflowsCell) {
          findings.push(finding(metrics, context, 'fail', 'action-overflow', {
            selector: button.selector,
            text: button.text || button.name,
            expected: 'button inside action cell',
            actual: `button ${button.width}px`,
            message: '动作按钮溢出动作单元格',
          }));
        }
      }
    }
    if (table.rowHeight > U1_THRESHOLDS.rowHeightWarn) {
      findings.push(finding(metrics, context, 'warn', 'row-height', {
        selector: `table[${table.index}] row[0]`,
        expected: `<=${U1_THRESHOLDS.rowHeightWarn}px`,
        actual: `${table.rowHeight}px`,
        message: `首行行高 ${table.rowHeight}px，超过 ${U1_THRESHOLDS.rowHeightWarn}px（可能是多行内容，需人眼确认）`,
      }));
    }
    if (table.horizontalScroll > 0) {
      findings.push(finding(metrics, context, 'warn', 'table-scroll', {
        selector: `table[${table.index}]`,
        expected: '0px',
        actual: `${table.horizontalScroll}px`,
        message: `表格横向滚动 ${table.horizontalScroll}px（en-US 长词允许，但动作列必须可见）`,
      }));
    }
  }

  for (const button of metrics.buttons || []) {
    if (!['page-header', 'action', 'dialog'].includes(button.context)) continue;
    if (!button.iconOnly && button.lines > 1) {
      findings.push(finding(metrics, context, 'fail', 'button-wrap', {
        selector: button.selector,
        text: button.text,
        expected: '1 line',
        actual: `${button.lines} lines`,
        message: `按钮「${button.text}」换成 ${button.lines} 行`,
      }));
    }
    if (button.overflow) {
      findings.push(finding(metrics, context, 'warn', 'button-overflow', {
        selector: button.selector,
        text: button.text,
        expected: 'no clipped label',
        actual: 'scrollWidth > clientWidth',
        message: `按钮「${button.text}」文字被裁切（若有 title 可接受）`,
      }));
    }
  }

  for (const tab of metrics.tabs || []) {
    if (tab.lines > 1) {
      findings.push(finding(metrics, context, 'fail', 'tab-overflow', {
        selector: tab.selector,
        text: tab.text,
        expected: '1 line',
        actual: `${tab.lines} lines`,
        message: `Tab「${tab.text}」换行`,
      }));
    }
  }

  for (const badge of metrics.badges || []) {
    if (badge.lines > 1) {
      findings.push(finding(metrics, context, 'warn', 'badge-wrap', {
        selector: badge.selector,
        text: badge.text,
        expected: '1 line',
        actual: `${badge.lines} lines`,
        message: `徽标「${badge.text}」换成 ${badge.lines} 行`,
      }));
    }
  }

  return findings;
}
