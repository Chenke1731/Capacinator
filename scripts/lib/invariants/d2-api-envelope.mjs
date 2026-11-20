/**
 * D2 — API envelope contract.
 *
 * Static scan only. It flags controller responses that are clearly not an
 * envelope (array literals, bare object literals without data/success/error)
 * and client-side "Array.isArray(payload) ? payload : payload?.data" defense
 * branches. Identifiers/calls are intentionally "unknown", not failures: the
 * value may already be an envelope produced by a service.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const OBJECT_ENVELOPE_KEYS = new Set(['data', 'success', 'error']);

const finding = (id, severity, rule, detail) => ({
  id,
  severity,
  route: '*',
  path: detail.file,
  language: '*',
  viewport: '*',
  rule,
  selector: `${detail.file}:${detail.line}`,
  text: detail.code,
  expected: detail.expected,
  actual: detail.actual,
  message: detail.message,
  file: detail.file,
  line: detail.line,
});

function unwrap(node) {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function objectKeys(node) {
  return new Set(
    node.properties
      .filter((property) => ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property))
      .map((property) => property.name?.getText?.() || '')
      .filter(Boolean)
  );
}

/** Returns 'ok' | 'bad' | 'unknown'. */
export function classifyJsonArgument(rawNode) {
  const node = unwrap(rawNode);
  if (!node) return 'unknown';
  if (ts.isArrayLiteralExpression(node)) return 'bad';
  if (ts.isObjectLiteralExpression(node)) {
    const keys = objectKeys(node);
    if ([...OBJECT_ENVELOPE_KEYS].some((key) => keys.has(key))) return 'ok';
    if (keys.has('message')) return 'bad';
    // A pure spread makes the shape unknowable statically.
    if (node.properties.every((property) => ts.isSpreadAssignment(property))) return 'unknown';
    return 'bad';
  }
  if (ts.isConditionalExpression(node)) {
    const branches = [classifyJsonArgument(node.whenTrue), classifyJsonArgument(node.whenFalse)];
    if (branches.includes('bad')) return 'bad';
    if (branches.every((value) => value === 'ok')) return 'ok';
    return 'unknown';
  }
  return 'unknown';
}

export function scanControllerText(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const findings = [];
  const unknown = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'json') {
      const arg = node.arguments[0];
      const status = classifyJsonArgument(arg);
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      const code = node.getText(source).replace(/\s+/g, ' ').slice(0, 180);
      if (status === 'bad') {
        findings.push({ file, line, code, reason: 'missing envelope' });
      } else if (status === 'unknown') {
        unknown.push({ file, line, code });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { findings, unknown };
}

export function scanClientDefensiveText(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const findings = [];
  const visit = (node) => {
    if (ts.isConditionalExpression(node)) {
      const condition = unwrap(node.condition);
      if (
        ts.isCallExpression(condition) &&
        ts.isPropertyAccessExpression(condition.expression) &&
        condition.expression.expression.getText(source) === 'Array' &&
        condition.expression.name.text === 'isArray' &&
        condition.arguments.length === 1
      ) {
        const argumentText = condition.arguments[0].getText(source);
        const trueText = unwrap(node.whenTrue).getText(source);
        const falseText = node.whenFalse.getText(source);
        if (trueText === argumentText && /\.\s*data\b/.test(falseText)) {
          const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
          findings.push({
            file,
            line,
            code: node.getText(source).replace(/\s+/g, ' ').slice(0, 180),
            reason: 'defensive envelope parsing',
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

function collectFiles(dir, pattern, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      collectFiles(abs, pattern, acc);
    } else if (pattern.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) {
      acc.push(abs);
    }
  }
  return acc;
}

export function scanD2({ root = process.cwd() } = {}) {
  const controllers = collectFiles(path.join(root, 'src/server/api/controllers'), /\.ts$/);
  const client = collectFiles(path.join(root, 'client/src'), /\.(ts|tsx)$/);
  const controllerFindings = [];
  const unknown = [];
  for (const file of controllers) {
    const rel = path.relative(root, file).replaceAll('\\', '/');
    const result = scanControllerText(rel, fs.readFileSync(file, 'utf8'));
    controllerFindings.push(...result.findings);
    unknown.push(...result.unknown);
  }
  const clientFindings = [];
  for (const file of client) {
    const rel = path.relative(root, file).replaceAll('\\', '/');
    clientFindings.push(...scanClientDefensiveText(rel, fs.readFileSync(file, 'utf8')));
  }
  return { controllerFindings, clientFindings, unknown };
}

export function d2Findings(scan) {
  const out = [];
  for (const item of scan.controllerFindings) {
    out.push(finding('D2', 'fail', 'controller-envelope', {
      file: item.file,
      line: item.line,
      code: item.code,
      expected: '{ data } / { success } / { error, message }',
      actual: 'bare array/object',
      message: `控制器响应缺少信封：${item.reason}`,
    }));
  }
  for (const item of scan.clientFindings) {
    out.push(finding('D2', 'fail', 'client-defensive-parse', {
      file: item.file,
      line: item.line,
      code: item.code,
      expected: 'consume documented envelope only',
      actual: 'Array.isArray(payload) ? payload : payload?.data',
      message: `客户端仍在防御解析信封：${item.reason}`,
    }));
  }
  return out;
}
