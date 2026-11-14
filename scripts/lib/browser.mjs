/**
 * Single source of truth for the Chromium executable used by audit/debug scripts.
 *
 * Resolution order:
 *   1. UI_AUDIT_CHROME (explicit override; must exist)
 *   2. Playwright's expected executablePath() for the installed Playwright version
 *   3. error with an install hint
 *
 * We intentionally do NOT scan for the highest chromium-* directory: a browser
 * built for a different Playwright revision can mismatch the protocol (e.g.
 * 1.58 expects 1223; vlmkit's 1.65 uses 1255).
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export function resolveChromium() {
  const override = process.env.UI_AUDIT_CHROME;
  if (override) {
    if (!fs.existsSync(override)) {
      throw new Error(`UI_AUDIT_CHROME points to a missing file: ${override}`);
    }
    return override;
  }

  let expected;
  let version = 'unknown';
  try {
    const playwright = require('playwright');
    expected = playwright.chromium.executablePath();
    version = require('playwright/package.json').version;
  } catch (error) {
    throw new Error(
      `Cannot resolve Playwright Chromium: ${error instanceof Error ? error.message : String(error)}. ` +
        'Run `npx playwright install chromium` or set UI_AUDIT_CHROME.'
    );
  }

  if (!expected || !fs.existsSync(expected)) {
    throw new Error(
      `Chromium for Playwright ${version} not found at ${expected ?? '(unknown path)'}. ` +
        'Run `npx playwright install chromium` (do not point at another Playwright revision), ' +
        'or set UI_AUDIT_CHROME explicitly.'
    );
  }
  return expected;
}
