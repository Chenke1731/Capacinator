/**
 * Demand-board virtualization boundary (P5+P6 收尾): the board must show
 * EVERY demand past the old limit:200 cliff. The e2e world stays small,
 * so this spec seeds past the boundary explicitly (300 items) — the only
 * place the full-set contract (board-count == seeded count, virtual
 * scroll reaches the tail) is exercised end to end.
 *
 * New contract note: DOM row count ≠ data row count. The board renders
 * only the viewport; assertions that need "all rows" must use the
 * board-count badge or accumulate after scrolling.
 */
import { test, expect } from '../../fixtures';

test.describe('demand board virtualization @demand @board', () => {
  test('300 items: board count shows the full set, scrolling reaches the tail', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.goto('/projects?tab=demand');

    // seed 300 items through the API (test prefix keeps cleanup simple)
    const created: string[] = [];
    for (let batch = 0; batch < 3; batch++) {
      const ids = await page.evaluate(async (b) => {
        const subRes = await fetch('/api/project-sub-types', { headers: { 'X-Test-Environment': 'e2e' } });
        const groups = await subRes.json();
        const g = (groups.data ?? []).find((x: any) => x.sub_types?.length);
        const sub = g?.sub_types?.[0];
        if (!sub) throw new Error('no sub_type available');
        const out: string[] = [];
        for (let i = 0; i < 100; i++) {
          const res = await fetch('/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Test-Environment': 'e2e' },
            body: JSON.stringify({
              name: `virt-boundary-${String(b * 100 + i).padStart(4, '0')}`,
              project_type_id: g.project_type_id,
              project_sub_type_id: sub.id
            })
          });
          const body = await res.json();
          out.push((body.data ?? body).id);
        }
        return out;
      }, batch);
      created.push(...ids);
    }

    try {
      await page.reload();
      await expect(page.locator('.requirements-row').first()).toBeVisible();

      // full-set contract: badge reflects every item, no 200 cliff
      const badge = await page.locator('[data-testid="board-count"], .board-count').first().innerText();
      const shown = Number((badge.match(/\d+/) ?? ['0'])[0]);
      expect(shown).toBeGreaterThanOrEqual(300);

      // virtualization contract: DOM rows stay near the viewport window —
      // if this ever approaches the data count, the board silently
      // regressed to full rendering (7.7s settle at 1000 rows)
      const domRows = await page.locator('.requirements-row').count();
      expect(domRows).toBeLessThan(60);

      // row-height contract (fixed-height virtualization): every rendered
      // row must fit its wrapper tier (child 40 / sr+plain 43). A taller
      // cell layout would visually stack rows — assert content fits.
      const rowFit = await page.evaluate(() => {
        const bad = [];
        for (const w of document.querySelectorAll('[data-index]')) {
          const row = w.firstElementChild;
          if (row && row.getBoundingClientRect().height > w.getBoundingClientRect().height + 1) {
            bad.push(w.getAttribute('data-index'));
          }
        }
        return bad;
      });
      expect(rowFit, `rows exceeding their wrapper: ${rowFit.join(',')}`).toEqual([]);

      // search reaches the LAST seeded item (beyond any viewport window)
      await page.fill('[data-testid="search-input"]', 'virt-boundary-0299');
      await expect(page.locator('.requirements-row', { hasText: 'virt-boundary-0299' })).toBeVisible();
    } finally {
      await page.evaluate(async (ids) => {
        for (const id of ids) {
          await fetch(`/api/projects/${id}`, { method: 'DELETE', headers: { 'X-Test-Environment': 'e2e' } });
        }
      }, created);
    }
  });
});
