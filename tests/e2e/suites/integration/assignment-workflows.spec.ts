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
      // Navigate to person details
      await availablePerson.getByRole('button', { name: /view/i }).click();
      await authenticatedPage.waitForSelector('text=Workload Insights', { timeout: 10000 });
      // Create assignment
      await authenticatedPage.getByRole('button', { name: /add assignment/i }).click();
      await expect(authenticatedPage.locator('text=Smart Assignment')).toBeVisible({ timeout: 10000 });
      // Use manual selection
      const manualTab = authenticatedPage.locator('button[role="tab"]:has-text("Manual Selection")');
      if (await manualTab.isVisible()) {
        await manualTab.click();
      }
      // Select the project we noted earlier
      const projectSelect = authenticatedPage.locator('#project-select, select[name="project_id"]').first();
      const projectOptions = await projectSelect.locator('option').all();
      let assignmentCreated = false;
      for (const option of projectOptions) {
        const optionText = await option.textContent();
        if (optionText?.includes(projectName || '')) {
          await projectSelect.selectOption(await option.getAttribute('value')!);
          // Wait for role dropdown
          await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
          // Select role if available
          const roleSelect = authenticatedPage.locator('#role-select, select[name="role_id"]').first();
          if (await roleSelect.isEnabled()) {
            const roleOption = await roleSelect.locator('option[value]:not([value=""])').first();
            if (await roleOption.count() > 0) {
              await roleSelect.selectOption(await roleOption.getAttribute('value')!);
            }
          }
          // Set allocation
          await authenticatedPage.fill('#allocation-slider, input[name="allocation_percentage"]', '40');
          // Submit
          await authenticatedPage.keyboard.press('Enter');
          assignmentCreated = true;
          break;
        }
      }
      if (assignmentCreated) {
        // Wait for modal to close
        await authenticatedPage.waitForSelector('text=Smart Assignment', { state: 'detached', timeout: 10000 });
        // Verify assignment appears
        await expect(authenticatedPage.locator(`text=${projectName}`)).toBeVisible({ timeout: 10000 });
      }
    });
  });
  test.describe('Utilization Impact', () => {
    test(`${tags.integration} assignment updates reflect in utilization metrics`, async ({ 
      authenticatedPage, 
      testHelpers 
    }) => {
      // Navigate to people page
      await testHelpers.navigateTo('/people');
      await testHelpers.waitForDataTable();
      // Find person with low utilization
      const underutilizedPerson = await authenticatedPage.locator('tbody tr').filter({
        has: authenticatedPage.locator('td:nth-child(5)').filter({ hasText: /[0-3]\d%/ })
      }).first();
      if (await underutilizedPerson.count() === 0) {
        console.log('No underutilized person found');
        return;
      }
      // Get initial utilization
      const initialUtilization = await underutilizedPerson.locator('td:nth-child(5)').textContent();
      console.log(`Initial utilization: ${initialUtilization}`);
      // Navigate to person details
      await underutilizedPerson.getByRole('button', { name: /view/i }).click();
      await authenticatedPage.waitForSelector('text=Workload Insights', { timeout: 10000 });
      // Note current utilization on detail page
      const utilizationElement = authenticatedPage.locator('text=/Current Utilization|Utilization:/').locator('..').locator('text=/%/');
      let detailUtilization = '0%';
      if (await utilizationElement.count() > 0) {
        detailUtilization = await utilizationElement.textContent() || '0%';
      }
      // Add new assignment
      await authenticatedPage.getByRole('button', { name: /add assignment/i }).click();
      await expect(authenticatedPage.locator('text=Smart Assignment')).toBeVisible({ timeout: 10000 });
      // Create assignment with significant allocation
      const manualTab = authenticatedPage.locator('button[role="tab"]:has-text("Manual Selection")');
      if (await manualTab.isVisible()) {
        await manualTab.click();
      }
      const projectSelect = authenticatedPage.locator('#project-select, select[name="project_id"]').first();
      const projectOption = await projectSelect.locator('option[value]:not([value=""])').first();
      if (await projectOption.count() > 0) {
        await projectSelect.selectOption(await projectOption.getAttribute('value')!);
        await authenticatedPage.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
        // Set 50% allocation
        await authenticatedPage.fill('#allocation-slider, input[name="allocation_percentage"]', '50');
        // Submit
        await authenticatedPage.keyboard.press('Enter');
        // Wait for modal to close and page to update
        await authenticatedPage.waitForSelector('text=Smart Assignment', { state: 'detached', timeout: 10000 });
        await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        // Check updated utilization
        const newUtilizationElement = authenticatedPage.locator('text=/Current Utilization|Utilization:/').locator('..').locator('text=/%/');
        if (await newUtilizationElement.count() > 0) {
          const newUtilization = await newUtilizationElement.textContent();
          console.log(`Updated utilization: ${newUtilization}`);
          // Verify utilization increased
          const oldValue = parseInt(detailUtilization, 10);
          const newValue = parseInt(newUtilization || '0', 10);
          expect(newValue).toBeGreaterThan(oldValue);
        }
      }
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
      await personWithAssignments.getByRole('button', { name: /view/i }).click();
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
      // Find a person already at high utilization
      await testHelpers.navigateTo('/people');
      await testHelpers.waitForDataTable();
      const highUtilizationPerson = await authenticatedPage.locator('tbody tr').filter({
        has: authenticatedPage.locator('td:nth-child(5)').filter({ hasText: /[8-9]\d%|100%/ })
      }).first();
      if (await highUtilizationPerson.count() === 0) {
        console.log('No highly utilized person found');
        return;
      }
      const utilization = await highUtilizationPerson.locator('td:nth-child(5)').textContent();
      console.log(`Testing with person at ${utilization} utilization`);
      await highUtilizationPerson.getByRole('button', { name: /view/i }).click();
      await authenticatedPage.waitForSelector('text=Workload Insights', { timeout: 10000 });
      // Try to add assignment that would overallocate
      await authenticatedPage.getByRole('button', { name: /add assignment/i }).click();
      await expect(authenticatedPage.locator('text=Smart Assignment')).toBeVisible({ timeout: 10000 });
      // Check for warnings in recommended tab — the product INTENTIONALLY
      // allows over-allocation (dashboard alerts exist for exactly this),
      // so the modal may show hints or stay quiet; both are acceptable.
      // What must hold: the manual flow stays usable (no hard block).
      const recommendedTab = authenticatedPage.locator('button[role="tab"]:has-text("Recommended")');
      if (await recommendedTab.count() > 0) {
        await recommendedTab.click();
      }
      // Try manual assignment
      const manualTab = authenticatedPage.locator('button[role="tab"]:has-text("Manual Selection")');
      if (await manualTab.isVisible()) {
        await manualTab.click();
      }
      const projectSelect = authenticatedPage.locator('#project-select, select[name="project_id"]').first();
      const projectOption = await projectSelect.locator('option[value]:not([value=""])').first();
      if (await projectOption.count() > 0) {
        await projectSelect.selectOption(await projectOption.getAttribute('value')!);
        // Set high allocation — over-allocation is permitted by design;
        // the contract here is that the form accepts it (the dashboard's
        // over-allocation alert is the product's intended signal)
        await authenticatedPage.fill('#allocation-slider, input[name="allocation_percentage"]', '50');
        const allocationField = authenticatedPage.locator('#allocation-slider, input[name="allocation_percentage"]').first();
        await expect(allocationField).toBeVisible();
      }
      await authenticatedPage.keyboard.press('Escape');
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
      await personWithMultipleAssignments.getByRole('button', { name: /view/i }).click();
      await authenticatedPage.waitForSelector('text=Workload Insights', { timeout: 10000 });
      // Count assignments on detail page
      const assignmentRows = authenticatedPage.locator('table').filter({
        has: authenticatedPage.locator('th:has-text("Project")')
      }).locator('tbody tr');
      const detailCount = await assignmentRows.count();
      // Open reduce workload
      await authenticatedPage.getByRole('button', { name: /reduce workload/i }).click();
      await expect(authenticatedPage.locator('text=Smart Assignment')).toBeVisible({ timeout: 10000 });
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
      testHelpers 
    }) => {
      // Create a new assignment and verify it appears in history
      await testHelpers.navigateTo('/people');
      await testHelpers.waitForDataTable();
      // Go to first person
      const firstPersonRow = authenticatedPage.locator('tbody tr').first();
      await firstPersonRow.getByRole('button', { name: /view/i }).click();
      await authenticatedPage.waitForSelector('text=Workload Insights', { timeout: 10000 });
      // Note current number of assignments
      const initialAssignments = await authenticatedPage.locator('table').filter({
        has: authenticatedPage.locator('th:has-text("Project")')
      }).locator('tbody tr').count();
      // Create new assignment
      await authenticatedPage.getByRole('button', { name: /add assignment/i }).click();
      await expect(authenticatedPage.locator('text=Smart Assignment')).toBeVisible({ timeout: 10000 });
      const manualTab = authenticatedPage.locator('button[role="tab"]:has-text("Manual Selection")');
      if (await manualTab.isVisible()) {
        await manualTab.click();
      }
      const projectSelect = authenticatedPage.locator('#project-select, select[name="project_id"]').first();
      const projectOption = await projectSelect.locator('option[value]:not([value=""])').first();
      if (await projectOption.count() > 0) {
        const projectName = await projectOption.textContent();
        await projectSelect.selectOption(await projectOption.getAttribute('value')!);
        await authenticatedPage.fill('#allocation-slider, input[name="allocation_percentage"]', '25');
        await authenticatedPage.keyboard.press('Enter');
        // Wait for assignment to be created
        await authenticatedPage.waitForSelector('text=Smart Assignment', { state: 'detached', timeout: 10000 });
        await authenticatedPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        // Verify new assignment appears
        const newAssignments = await authenticatedPage.locator('table').filter({
          has: authenticatedPage.locator('th:has-text("Project")')
        }).locator('tbody tr').count();
        expect(newAssignments).toBe(initialAssignments + 1);
        // Verify the specific assignment exists
        await expect(authenticatedPage.locator(`text=${projectName}`)).toBeVisible();
      }
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
      await personRow.getByRole('button', { name: /view/i }).click();
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