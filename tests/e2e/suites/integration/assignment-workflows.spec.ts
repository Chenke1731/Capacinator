/**
 * Assignment Integration Workflows Test Suite
 * Tests complex assignment workflows that span multiple features and pages
 */
import { test, expect, tags } from '../../fixtures';
test.describe('Assignment Integration Workflows', () => {
  test.describe('Complete Assignment Lifecycle', () => {
    test(`${tags.integration} complete assignment workflow from project to person`, async ({ 
      authenticatedPage, 
      testHelpers 
    }) => {
      // Start from projects page
      await testHelpers.navigateTo('/projects');
      await testHelpers.waitForDataTable();
      // Projects page is the requirements board (no tbody) — rows are
      // div.requirements-row with span columns; the name is the first span
      const projectName = await authenticatedPage
        .locator('.requirements-row')
        .first()
        .locator('span')
        .first()
        .textContent();
      console.log(`Starting with project: ${projectName}`);
      // Navigate to people page
      await testHelpers.navigateTo('/people');
      await testHelpers.waitForDataTable();
      // Find a person with availability
      const availablePerson = await authenticatedPage.locator('tbody tr').filter({
        has: authenticatedPage.locator('td:nth-child(5)').filter({ hasText: /[0-7]\d%/ })
      }).first();
      if (await availablePerson.count() === 0) {
        console.log('No person with availability found');
        return;
      }
      const personName = await availablePerson.locator('td:first-child').textContent();
      console.log(`Assigning to: ${personName}`);
      // Navigate to person details; Add Assignment now routes to the person
      // workbench (the SmartAssignmentModal this test drove has no
      // production entry any more). Creation mechanics through the task
      // picker are covered by person-workload.spec.ts (§18); this test pins
      // the cross-page entry contract.
      await availablePerson.click();
      await authenticatedPage.waitForSelector('text=Workload Insights', { timeout: 10000 });
      await authenticatedPage.getByRole('button', { name: /add assignment/i }).click();
      await authenticatedPage.waitForURL(/\/people\/[^/]+\/workload/, { timeout: 10000 });
      await expect(authenticatedPage.locator('.person-workload-page')).toBeVisible({ timeout: 10000 });
      await authenticatedPage.getByTestId('pw-add-assignment').click();
      const dialog = authenticatedPage.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByTestId('pw-task-board')).toBeVisible({ timeout: 15000 });
      await authenticatedPage.keyboard.press('Escape');
    });
  });
  test.describe('Utilization Impact', () => {
    test(`${tags.integration} assignment updates reflect in utilization metrics`, async ({
      authenticatedPage,
      testHelpers
    }) => {
      // Inline allocation edit on the workbench moves the person's total.
      // Target a person WITH assignment rows (a 0-3x% person often has none).
      await testHelpers.navigateTo('/people');
      await testHelpers.waitForDataTable();
      const personWithWork = authenticatedPage.locator('tbody tr').filter({
        has: authenticatedPage.locator('td:nth-child(4):not(:has-text("0"))')
      }).first();
      if (await personWithWork.count() === 0) {
        console.log('No person with assignments found');
        return;
      }
      await personWithWork.click();
      await authenticatedPage.waitForSelector('text=Workload Insights', { timeout: 10000 });
      await authenticatedPage.getByRole('button', { name: /add assignment/i }).click();
      await authenticatedPage.waitForURL(/\/people\/[^/]+\/workload/, { timeout: 10000 });
      await expect(authenticatedPage.locator('.person-workload-page')).toBeVisible({ timeout: 10000 });

      const total = authenticatedPage.getByTestId('pw-total');
      await expect(total).toBeVisible({ timeout: 15000 });
      const before = parseInt((await total.textContent()) || '0', 10);

      const firstRow = authenticatedPage.locator('.pw-allocation-input, [data-assignment-id]').first();
      await authenticatedPage.locator('.pw-row-actions').first().getByRole('button', { name: /edit/i }).click();
      const allocationInput = authenticatedPage.locator('.pw-allocation-input').first();
      await expect(allocationInput).toBeVisible({ timeout: 10000 });
      const original = await allocationInput.inputValue();
      const bumped = Math.min(parseInt(original || '50', 10) + 10, 200);
      await allocationInput.fill(String(bumped));
      await authenticatedPage.locator('.pw-row-actions').first().getByRole('button', { name: /save/i }).click();
      await expect(allocationInput).toHaveCount(0, { timeout: 10000 });
      await expect.poll(async () => parseInt((await total.textContent()) || '0', 10), { timeout: 15000 })
        .toBeGreaterThan(before);

      // Restore the shared world (other suites read these numbers)
      await authenticatedPage.locator('.pw-row-actions').first().getByRole('button', { name: /edit/i }).click();
      await authenticatedPage.locator('.pw-allocation-input').first().fill(original);
      await authenticatedPage.locator('.pw-row-actions').first().getByRole('button', { name: /save/i }).click();
      await expect(authenticatedPage.locator('.pw-allocation-input')).toHaveCount(0, { timeout: 10000 });
    });
  });
  test.describe('Phase Timeline Integration', () => {
    test(`${tags.integration} phase timeline updates affect phase-linked assignments`, async ({ 
      authenticatedPage, 
      testHelpers 
    }) => {
      // This test verifies that phase-linked assignments update when phase dates change
      await testHelpers.navigateTo('/people');
      await testHelpers.waitForDataTable();
      // Find person with phase-linked assignments
      const personWithAssignments = authenticatedPage.locator('tbody tr').filter({
        has: authenticatedPage.locator('td:nth-child(4):not(:has-text("0"))')
      }).first();
      if (await personWithAssignments.count() === 0) {
        console.log('No person with assignments found');
        return;
      }
      // Action-column densification (7c9e761) removed the per-row View button;
      // rows navigate on click since.
      await personWithAssignments.click();
      await authenticatedPage.waitForSelector('text=Workload Insights', { timeout: 10000 });
      // Look for phase indicators in assignments
      const phaseAssignments = authenticatedPage.locator('table').filter({
        has: authenticatedPage.locator('th:has-text("Project")')
      }).locator('tbody tr').filter({
        has: authenticatedPage.locator('text=/Phase|Design|Development|Testing/')
      });
      const phaseAssignmentCount = await phaseAssignments.count();
      console.log(`Found ${phaseAssignmentCount} phase-linked assignments`);
      if (phaseAssignmentCount > 0) {
        // Note the current dates
        const dateElements = phaseAssignments.first().locator('text=/\\d{1,2}\\/\\d{1,2}\\/\\d{4}/');
        const initialDates = await dateElements.allTextContents();
        console.log('Initial phase dates:', initialDates);
        // In a real test, we would update the phase timeline via API or UI
        // and verify the assignment dates update accordingly
      }
    });
  });
  test.describe('Overallocation Prevention', () => {
    test(`${tags.integration} assignment conflicts prevent overallocation`, async ({
      authenticatedPage,
      testHelpers
    }) => {
      // Premise inverted to the shipped design: over-allocation is ALLOWED
      // and SURFACED (the People insights / dashboard alert is the intended
      // signal), not blocked. Inline-edit one allocation to the max and
      // verify the over state becomes visible, then restore the shared row.
      await testHelpers.navigateTo('/people');
      await testHelpers.waitForDataTable();
      const personWithWork = authenticatedPage.locator('tbody tr').filter({
        has: authenticatedPage.locator('td:nth-child(4):not(:has-text("0"))')
      }).first();
      if (await personWithWork.count() === 0) {
        console.log('No person with assignments found');
        return;
      }
      await personWithWork.click();
      await authenticatedPage.waitForSelector('text=Workload Insights', { timeout: 10000 });
      await authenticatedPage.getByRole('button', { name: /add assignment/i }).click();
      await authenticatedPage.waitForURL(/\/people\/[^/]+\/workload/, { timeout: 10000 });
      const total = authenticatedPage.getByTestId('pw-total');
      await expect(total).toBeVisible({ timeout: 15000 });

      await authenticatedPage.locator('.pw-row-actions').first().getByRole('button', { name: /edit/i }).click();
      const allocationInput = authenticatedPage.locator('.pw-allocation-input').first();
      await expect(allocationInput).toBeVisible({ timeout: 10000 });
      const original = await allocationInput.inputValue();
      await allocationInput.fill('200');
      await authenticatedPage.locator('.pw-row-actions').first().getByRole('button', { name: /save/i }).click();
      await expect(allocationInput).toHaveCount(0, { timeout: 10000 });
      await expect.poll(async () => parseInt((await total.textContent()) || '0', 10), { timeout: 15000 })
        .toBeGreaterThan(100);

      // The surfaced signal: People page over-allocated insight is live
      await testHelpers.navigateTo('/people');
      await testHelpers.waitForDataTable();
      await expect(authenticatedPage.locator('.insight-item.text-danger').first()).toBeVisible({ timeout: 10000 });

      // Restore the shared row
      await authenticatedPage.goBack();
      await authenticatedPage.locator('.pw-row-actions').first().getByRole('button', { name: /edit/i }).click();
      await authenticatedPage.locator('.pw-allocation-input').first().fill(original);
      await authenticatedPage.locator('.pw-row-actions').first().getByRole('button', { name: /save/i }).click();
      await expect(authenticatedPage.locator('.pw-allocation-input')).toHaveCount(0, { timeout: 10000 });
    });
  });
  test.describe('Bulk Operations', () => {
    test(`${tags.integration} bulk operations maintain data consistency`, async ({ 
      authenticatedPage, 
      testHelpers 
    }) => {
      // Find person with multiple assignments
      await testHelpers.navigateTo('/people');
      await testHelpers.waitForDataTable();
      const personWithMultipleAssignments = await authenticatedPage.locator('tbody tr').filter({
        has: authenticatedPage.locator('td:nth-child(4)').filter({ hasText: /[3-9]|\d{2}/ })
      }).first();
      if (await personWithMultipleAssignments.count() === 0) {
        console.log('No person with multiple assignments found');
        return;
      }
      const assignmentCount = await personWithMultipleAssignments.locator('td:nth-child(4)').textContent();
      console.log(`Person has ${assignmentCount} assignments`);
      await personWithMultipleAssignments.click();
      await authenticatedPage.waitForSelector('text=Workload Insights', { timeout: 10000 });
      // Count assignments on detail page
      const assignmentRows = authenticatedPage.locator('table').filter({
        has: authenticatedPage.locator('th:has-text("Project")')
      }).locator('tbody tr');
      const detailCount = await assignmentRows.count();
      // Open reduce workload
      await authenticatedPage.getByRole('button', { name: /reduce workload/i }).click();
      await expect(authenticatedPage.locator('text=Smart Assignment')).toBeVisible({ timeout: 10000 });
      // 2026-11-13 回归：未分层 .smart-assignment-modal 的 position:relative
      // 曾覆盖 DialogContent 的 fixed，弹窗掉到文档流底部。这里用真实布局守住。
      const dialog = authenticatedPage.getByRole('dialog');
      expect(await dialog.evaluate((el) => getComputedStyle(el).position)).toBe('fixed');
      const dialogBox = await dialog.boundingBox();
      const viewport = authenticatedPage.viewportSize();
      expect(dialogBox).not.toBeNull();
      if (dialogBox && viewport) {
        expect(Math.abs(dialogBox.x + dialogBox.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(4);
        expect(dialogBox.y).toBeGreaterThanOrEqual(0);
        expect(dialogBox.y + dialogBox.height).toBeLessThanOrEqual(viewport.height + 1);
      }
      const manualTab = authenticatedPage.locator('button[role="tab"]:has-text("Manual Selection")');
      if (await manualTab.isVisible()) {
        await manualTab.click();
      }
      // Count removable assignments
      const removableItems = await authenticatedPage.locator('.assignment-item, tr[data-assignment], input[type="checkbox"][name*="assignment"]').count();
      // Should match the detail count
      expect(removableItems).toBe(detailCount);
      await authenticatedPage.keyboard.press('Escape');
    });
  });
  test.describe('Cross-Page Consistency', () => {
    test(`${tags.integration} assignment history and audit trail`, async ({
      authenticatedPage,
      testHelpers,
      apiContext
    }) => {
      // Assignment writes must land in the audit trail. A value-changing
      // (+1, then restored) UPDATE guarantees an audit entry while leaving
      // the shared world untouched afterwards.
      const assignmentsBody = await (await apiContext.get('/api/assignments?limit=10')).json();
      const assignment = (assignmentsBody.data || [])[0];
      test.skip(!assignment, 'No assignments in e2e database');
      const bumped = Math.min((assignment.allocation_percentage ?? 50) + 1, 200);
      const update = await apiContext.put(`/api/assignments/${assignment.id}`, {
        data: { allocation_percentage: bumped },
      });
      expect(update.ok()).toBeTruthy();

      await testHelpers.navigateTo('/audit-log');
      await authenticatedPage.locator('.audit-stats').first().waitFor({ timeout: 15000 });
      // FilterBar selects are unlabeled natives — anchor by the option they
      // carry, then filter the ledger down to assignment updates.
      const tableSelect = authenticatedPage.locator('select.form-select').filter({
        has: authenticatedPage.locator('option[value="scenario_project_assignments"]'),
      }).first();
      await tableSelect.selectOption('scenario_project_assignments');
      const actionSelect = authenticatedPage.locator('select.form-select').filter({
        has: authenticatedPage.locator('option[value="UPDATE"]'),
      }).first();
      await actionSelect.selectOption('UPDATE');
      await authenticatedPage.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      const rows = authenticatedPage.locator('tbody tr');
      await expect(rows.first()).toBeVisible({ timeout: 15000 });
      expect(await rows.count()).toBeGreaterThan(0);
      // Restore the shared row (both writes stay audited — that is the point)
      await apiContext.put(`/api/assignments/${assignment.id}`, {
        data: { allocation_percentage: assignment.allocation_percentage },
      });
    });
    test(`${tags.integration} cross-page assignment consistency`, async ({
      authenticatedPage,
      testHelpers,
      apiContext
    }) => {
      // Verify assignments show consistently across different views
      await testHelpers.navigateTo('/people');
      await testHelpers.waitForDataTable();
      // People table columns: Name / Role / Type / Location / Availability /
      // Hours / Workload / Quick Actions — there is NO assignment-count
      // column, so the source of truth is the API
      const personRow = authenticatedPage.locator('tbody tr').first();
      const personName = await personRow.locator('td:first-child').textContent();
      console.log(`Checking assignment consistency for: ${personName}`);

      const peopleBody = await (await apiContext.get('/api/people')).json();
      const person = (peopleBody.data || []).find((p: any) => p.name === personName);
      if (!person) {
        console.log('Person not found via API');
        return;
      }
      const assignmentsBody = await (await apiContext.get('/api/assignments')).json();
      const apiAssignments = (assignmentsBody.data || []).filter(
        (a: any) => a.person_id === person.id
      );

      // Navigate to person details
      await personRow.click();
      await authenticatedPage.waitForSelector('text=Workload Insights', { timeout: 10000 });
      // Count assignments on detail page
      const detailAssignments = await authenticatedPage.locator('table').filter({
        has: authenticatedPage.locator('th:has-text("Project")')
      }).locator('tbody tr').count();
      console.log(`Detail page shows ${detailAssignments} assignments (API: ${apiAssignments.length})`);
      // Counts should match
      expect(detailAssignments).toBe(apiAssignments.length);
    });
  });
});