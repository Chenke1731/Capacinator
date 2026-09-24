/**
 * E2E port constants & safety guard (2026-09-24 migration)
 *
 * History: this file implemented lsof/fuser/SIGTERM→SIGKILL port clearing
 * (308 lines) — the machinery that killed the dev stack on 2026-09-24
 * when E2E_PORTS still equaled the dev ports. Process lifecycle now
 * belongs to Playwright's webServer; only the constants and the overlap
 * guard remain.
 */

// E2E must own ports that NEVER overlap the dev stack.
// Mirrored as literals in playwright.config.ts / playwright.e2e.config.ts /
// playwright.scenario.config.ts webServer blocks — keep them in sync.
export const E2E_PORTS = {
  backend: 3111,
  frontend: 3122,
} as const;

// Dev-stack ports — e2e must never touch these.
export const DEV_PORTS = [3110, 3120] as const;

/** Throws if E2E_PORTS ever drift back onto dev ports (incident 2026-09-24). */
export function assertE2ePortsDisjointFromDev(): void {
  const overlap = [E2E_PORTS.backend, E2E_PORTS.frontend].filter((p) =>
    (DEV_PORTS as readonly number[]).includes(p)
  );
  if (overlap.length > 0) {
    throw new Error(
      `E2E_PORTS must not overlap dev ports [${DEV_PORTS.join(', ')}]: got ${overlap.join(', ')}. ` +
        'This exact overlap killed the dev stack on 2026-09-24.'
    );
  }
}
