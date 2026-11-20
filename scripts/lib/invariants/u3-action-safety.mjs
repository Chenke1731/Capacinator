/**
 * U3 — action safety and accessible names.
 *
 * Runtime side: icon-only controls must have an accessible name and a
 * >=24x24 target; a table action cell should not accumulate multiple text
 * buttons. Static side: native confirm/alert/prompt are not allowed because
 * they bypass the app's ConfirmDialog language/theme/focus contract.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export const U3_THRESHOLDS = {
  iconTargetMin: 24,
  textActionsWarn: 1,
};

const finding = (context, severity, rule, detail) => ({
  id: 'U3',
  severity,
  route: context.route?.id ?? '*',
  path: context.route?.path ?? '*',
  language: context.language ?? '*',
  viewport: context.viewport ? `${context.viewport.width}x${context.viewport.height}` : '*',
  rule,
  selector: detail.selector,
  text: detail.text || '',
  expected: detail.expected,
  actual: detail.actual,
  message: detail.message,
  file: detail.file,
  line: detail.line,
});

export function evaluateU3(metrics, context) {
  const findings = [];
  for (const button of metrics.buttons || []) {
    if (!button.iconOnly) continue;
    if (!button.name) {
      findings.push(finding(context, 'fail', 'icon-name', {
        selector: button.selector,
        text: button.selector,
        expected: 'aria-label / title / accessible text',
        actual: 'none',
        message: '图标按钮没有可访问名称',
      }));
    }
    if (button.width < U3_THRESHOLDS.iconTargetMin || button.height < U3_THRESHOLDS.iconTargetMin) {
      findings.push(finding(context, 'fail', 'icon-target', {
        selector: button.selector,
        text: button.name,
        expected: `>=${U3_THRESHOLDS.iconTargetMin}x${U3_THRESHOLDS.iconTargetMin}`,
        actual: `${button.width}x${button.height}`,
        message: `图标按钮目标 ${button.width}x${button.height}，小于 ${U3_THRESHOLDS.iconTargetMin}px`,
      }));
    }
  }

  for (const table of metrics.tables || []) {
    if (table.action && table.action.textButtonCount > U3_THRESHOLDS.textActionsWarn) {
      findings.push(finding(context, 'warn', 'action-text-buttons', {
        selector: `${table.selector} > action`,
        text: table.action.header,
        expected: `<=${U3_THRESHOLDS.textActionsWarn} text action`,
        actual: `${table.action.textButtonCount} text actions`,
        message: `动作列有 ${table.action.textButtonCount} 个文字按钮；应保留一个主操作，其余图标化或收进菜单`,
      }));
    }
  }
  return findings;
}

function collectSourceFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      collectSourceFiles(abs, acc);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) {
      acc.push(abs);
    }
  }
  return acc;
}

/** Pure AST scan; exported so the selftest can feed synthetic source text. */
export function findNativeDialogsInText(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const findings = [];
  const names = new Set(['confirm', 'alert', 'prompt']);
  const lineOf = (node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isIdentifier(expr) && names.has(expr.text)) {
        findings.push({ file, line: lineOf(node), code: node.getText(source).replace(/\s+/g, ' ').slice(0, 160), name: expr.text });
      } else if (ts.isPropertyAccessExpression(expr) && names.has(expr.name.text)) {
        const target = expr.expression.getText(source);
        if (target === 'window' || target === 'globalThis' || target === 'self') {
          findings.push({ file, line: lineOf(node), code: node.getText(source).replace(/\s+/g, ' ').slice(0, 160), name: expr.name.text });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

export function scanNativeDialogs(root = 'client/src') {
  const base = path.resolve(root);
  return collectSourceFiles(base).flatMap((file) =>
    findNativeDialogsInText(path.relative(process.cwd(), file).replaceAll('\\', '/'), fs.readFileSync(file, 'utf8'))
  );
}

export function nativeDialogFindings(dialogs) {
  return dialogs.map((dialog) =>
    finding({}, 'fail', 'native-dialog', {
      selector: `${dialog.file}:${dialog.line}`,
      text: dialog.code,
      expected: 'shared ConfirmDialog / AlertDialog',
      actual: `${dialog.name}()`,
      message: `禁止 native ${dialog.name}()；使用共享 ConfirmDialog，保证主题/焦点/i18n`,
      file: dialog.file,
      line: dialog.line,
    })
  );
}
