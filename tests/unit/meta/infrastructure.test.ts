/**
 * Meta-tests: the test infrastructure proving it is alive (design §5.2).
 * If these fail, no other test result is trustworthy.
 */
import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';

describe('Test Infrastructure Meta-Tests', () => {
  describe('Collection ledger', () => {
    it('floor file exists and has both configs', () => {
      expect(existsSync('tests/e2e/.collection-floor.json')).toBe(true);
      const floor = JSON.parse(readFileSync('tests/e2e/.collection-floor.json', 'utf8'));
      expect(floor).toHaveProperty('main');
      expect(floor).toHaveProperty('scenario');
      expect(floor.main).toBeGreaterThan(0);
      expect(floor.scenario).toBeGreaterThan(0);
    });
    // Live count verification runs as scripts/check-collection.mjs in the
    // e2e CI job — duplicating it here invites environment-mismatch flakes
  });

  describe('Auth state file schema', () => {
    it('e2e-auth.json (when present) has localStorage with user keys', () => {
      const path = 'test-results/e2e-auth.json';
      if (!existsSync(path)) {
        // Written at global-setup time; absent only if setup hasn't run yet
        return;
      }
      const state = JSON.parse(readFileSync(path, 'utf8'));
      expect(state).toHaveProperty('origins');
      expect(state.origins.length).toBeGreaterThan(0);
      const ls = state.origins[0].localStorage;
      expect(ls).toBeDefined();
      const keys = ls.map((i: { name: string }) => i.name);
      expect(keys).toContain('capacinator_current_user');
    });
  });

  describe('Seed anchors', () => {
    it('consolidated seed has category-prefixed project types', () => {
      const seed = readFileSync('src/server/database/seeds/e2e-test-data-consolidated.ts', 'utf8');
      // The category prefix MUST match client/src/lib/projectCategories.ts
      // (the Projects tab filters by it — three drift incidents to date)
      expect(seed).toMatch(/需求交付/);
    });

    it('consolidated seed materializes project_allocation_overrides', () => {
      const seed = readFileSync('src/server/database/seeds/e2e-test-data-consolidated.ts', 'utf8');
      expect(seed).toMatch(/project_allocation_overrides/);
      expect(seed).toMatch(/template-e2e-001/);
    });
  });

  describe('Port disjointness', () => {
    it('e2e ports never overlap dev ports', () => {
      const src = readFileSync('tests/e2e/helpers/port-cleanup.ts', 'utf8');
      const e2eBackend = src.match(/backend:\s*(\d+)/)?.[1];
      const e2eFrontend = src.match(/frontend:\s*(\d+)/)?.[1];
      expect(e2eBackend).toBe('3111');
      expect(e2eFrontend).toBe('3122');
      expect(e2eBackend).not.toBe('3110');
      expect(e2eFrontend).not.toBe('3120');
    });
  });

  describe('Vite proxy isolation', () => {
    it('playwright configs pass PORT=3111 to vite webServer (proxy target)', () => {
      for (const config of ['playwright.config.ts', 'playwright.scenario.config.ts']) {
        const src = readFileSync(config, 'utf8');
        expect(src).toMatch(/PORT.*3111/);
      }
    });
  });

  describe('Helper method existence', () => {
    it('TestHelpers still exports the methods specs depend on', () => {
      const src = readFileSync('tests/e2e/utils/test-helpers.ts', 'utf8');
      for (const method of ['navigateTo', 'waitForPageLoad', 'waitForDataTable', 'setupPage', 'waitForPageReady']) {
        expect(src).toMatch(new RegExp(`async ${method}\\(`));
      }
    });

    it('TestDataHelpers still exports the methods specs depend on', () => {
      const src = readFileSync('tests/e2e/utils/test-data-helpers.ts', 'utf8');
      for (const method of ['createTestUser', 'createTestProject', 'createTestScenario', 'createTestAssignment', 'cleanupTestContext']) {
        expect(src).toMatch(new RegExp(`async ${method}\\(`));
      }
    });
  });
});
