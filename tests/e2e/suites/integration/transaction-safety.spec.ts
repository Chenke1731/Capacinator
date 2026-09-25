/**
 * Database Transaction Safety and Concurrent Operation Tests
 * Critical tests that validate data integrity under concurrent operations,
 * prevent race conditions, and handle database transactions safely
 * Uses dynamic test data for proper isolation.
 *
 * 2026-09-26 modernization (L4 harvest slice 2): the four failing @critical
 * tests were rewritten API-driven. Legacy diseases cured:
 * - envelope unwrapping (responses are {success, data} — never read .id/.length on the envelope)
 * - payloads now carry role_id + assignment_date_mode (both required)
 * - the dead createAssignmentViaUI flow (drove a modal that no longer exists) removed
 * - rollback vector changed from over-allocation (ALLOWED by design — the
 *   dashboard alert exists for exactly that) to end_date < start_date (rejected)
 */
import { test, expect, tags } from '../../fixtures';
import { TestDataContext } from '../../utils/test-data-helpers';
test.describe('Database Transaction Safety and Concurrent Operations', () => {
  let testContext: TestDataContext;
  let testData: any;
  test.beforeEach(async ({ testDataHelpers, apiContext }) => {
    // Create isolated test context
    testContext = testDataHelpers.createTestContext('txnsafety');
    // Create test data
    testData = await testDataHelpers.createBulkTestData(testContext, {
      projects: 3,
      people: 3,
      assignments: 3
    });
    // Seed roles for assignment payloads (role_id is required)
    const rolesRes = await apiContext.get('/api/roles');
    const rolesBody = await rolesRes.json();
    testData.roles = rolesBody.data || rolesBody;
  });
  test.afterEach(async ({ testDataHelpers }) => {
    // Clean up all test data
    await testDataHelpers.cleanupTestContext(testContext);
  });

  // Valid assignment payload builder (API contract: role_id + mode + dates)
  function assignmentPayload(overrides: Record<string, unknown> = {}) {
    return {
      person_id: testData.people[0].id,
      project_id: testData.projects[0].id,
      role_id: testData.roles[0].id,
      allocation_percentage: 30,
      assignment_date_mode: 'fixed',
      start_date: new Date().toISOString().split('T')[0],
      end_date: new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0],
      ...overrides,
    };
  }

  // Unwrap the {success, data} envelope for created entities
  function unwrap(body: any) {
    return body?.data ?? body;
  }
  test.describe('Concurrent User Operations', () => {
    test(`${tags.critical} ${tags.integration} should handle multiple users creating assignments simultaneously without data corruption`, async ({
      apiContext
    }) => {
      // kill-mutation: drop the DB concurrency handling (→ parallel writes
      // corrupt or 5xx under SQLite locking)
      const results = await Promise.allSettled([0, 1, 2].map((i) =>
        apiContext.post('/api/assignments', {
          data: assignmentPayload({
            person_id: testData.people[i % testData.people.length].id,
            project_id: testData.projects[i % testData.projects.length].id,
            allocation_percentage: 30 + i * 10,
          }),
        })
      ));

      const succeeded = results.filter((r) => r.status === 'fulfilled' && r.value.ok());
      const serverErrors = results.filter(
        (r) => r.status === 'fulfilled' && r.value.status() >= 500
      );
      // All three concurrent creates should succeed cleanly
      expect(succeeded.length).toBe(3);
      expect(serverErrors.length).toBe(0);

      // Data-level: each created row exists with its own allocation
      const assignments = await Promise.all(
        succeeded.map((r: any) => r.value.json())
      );
      const ids = assignments.map((b: any) => unwrap(b).id);
      expect(new Set(ids).size).toBe(3); // no id collision / double write
      for (const id of ids) {
        testContext.createdIds.assignments.push(id);
      }

      // Cleanup via API contract (id round-trip proves integrity)
      for (const id of ids) {
        const del = await apiContext.delete(`/api/assignments/${id}`);
        expect(del.ok()).toBe(true);
      }
    });
    test(`${tags.critical} ${tags.integration} should prevent data corruption during concurrent updates`, async ({
      apiContext
    }) => {
      // kill-mutation: break update row-targeting (→ concurrent PUTs write
      // cross-rows or the final value is none of the attempted ones)
      const createRes = await apiContext.post('/api/assignments', {
        data: assignmentPayload({ allocation_percentage: 50 }),
      });
      expect(createRes.ok()).toBe(true);
      const created = unwrap(await createRes.json());
      testContext.createdIds.assignments.push(created.id);

      const updateResults = await Promise.allSettled([60, 70, 80].map((v) =>
        apiContext.put(`/api/assignments/${created.id}`, {
          data: { allocation_percentage: v },
        })
      ));
      const successful = updateResults.filter((r) => r.status === 'fulfilled' && r.value.ok());
      expect(successful.length).toBeGreaterThanOrEqual(1);
      expect(
        updateResults.filter((r) => r.status === 'fulfilled' && r.value.status() >= 500).length
      ).toBe(0);

      // Final state is consistent: exactly one row, value ∈ attempted set
      const finalRes = await apiContext.get(`/api/assignments/${created.id}`);
      expect(finalRes.ok()).toBe(true);
      const finalBody = unwrap(await finalRes.json());
      const finalAllocation =
        finalBody.allocation_percentage ?? unwrap(finalBody).allocation_percentage;
      expect([60, 70, 80, 50]).toContain(finalAllocation);
    });
  });
  test.describe('Transaction Rollback and Recovery', () => {
    test(`${tags.critical} should rollback transactions on validation failures`, async ({
      apiContext
    }) => {
      // kill-mutation: make the invalid-create path persist anyway (→
      // rejected rows leak into the table)
      // NOTE: over-allocation is deliberately ALLOWED by the product (the
      // dashboard alert exists for it) — the invalid vector here is
      // end_date < start_date, which the API rejects (pinned by red line 11)
      // Counting is scoped to THIS context's person: workers run sibling
      // tests in parallel against the same world — a global count would race.
      const myPersonId = testData.people[0].id;
      const rowsFor = (body: any) =>
        (unwrap(body) as any[]).filter((r) => r.person_id === myPersonId);
      const initialCount = rowsFor(await (await apiContext.get('/api/assignments')).json()).length;

      // Valid create goes through
      const validRes = await apiContext.post('/api/assignments', {
        data: assignmentPayload({ allocation_percentage: 80 }),
      });
      expect(validRes.ok()).toBe(true);
      testContext.createdIds.assignments.push(unwrap(await validRes.json()).id);

      // Invalid create (end before start) is rejected
      const invalidRes = await apiContext.post('/api/assignments', {
        data: assignmentPayload({
          start_date: '2026-12-01',
          end_date: '2026-01-01',
        }),
      });
      expect(invalidRes.ok()).toBe(false);
      expect(invalidRes.status()).toBeGreaterThanOrEqual(400);

      // Rollback proof: this person's rows grew by exactly the ONE valid row
      const finalCount = rowsFor(await (await apiContext.get('/api/assignments')).json()).length;
      expect(finalCount).toBe(initialCount + 1);
    });
    test(`${tags.critical} should maintain referential integrity`, async ({
      apiContext,
      testDataHelpers
    }) => {
      // kill-mutation: drop the project-delete guard (→ assignments orphan
      // silently when their project is removed)
      const createRes = await apiContext.post('/api/assignments', {
        data: assignmentPayload({ project_id: testData.projects[0].id, allocation_percentage: 50 }),
      });
      expect(createRes.ok()).toBe(true);
      const created = unwrap(await createRes.json());
      testContext.createdIds.assignments.push(created.id);

      // Try to delete the project that carries the assignment
      const deleteProject = await apiContext.delete(`/api/projects/${testData.projects[0].id}`);
      if (!deleteProject.ok()) {
        // Blocked — integrity held
        expect(deleteProject.status()).toBeGreaterThanOrEqual(400);
      } else {
        // Cascade delete — the assignment must be gone too (no orphans)
        const assignmentCheck = await apiContext.get(`/api/assignments/${created.id}`);
        expect(assignmentCheck.status()).toBe(404);
        // keep cleanup bookkeeping consistent (row already gone)
        testContext.createdIds.assignments = testContext.createdIds.assignments.filter(
          (id: string) => id !== created.id
        );
      }
    });
  });
  test.describe('Deadlock Prevention', () => {
    test(`${tags.critical} should handle potential deadlock scenarios`, async ({ 
      apiContext,
      testDataHelpers 
    }) => {
      console.log('🔒 Testing deadlock prevention');
      // Create cross-dependent operations that could deadlock
      const operations = [
        // Operation 1: Update Person A, then Project B
        async () => {
          const updatePerson = await apiContext.put(`/api/people/${testData.people[0].id}`, {
            data: { utilization_target: 80 }
          });
          const updateProject = await apiContext.put(`/api/projects/${testData.projects[1].id}`, {
            data: { status: 'active' }
          });
          return { updatePerson: updatePerson.ok(), updateProject: updateProject.ok() };
        },
        // Operation 2: Update Project B, then Person A (opposite order)
        async () => {
          const updateProject = await apiContext.put(`/api/projects/${testData.projects[1].id}`, {
            data: { status: 'planning' }
          });
          const updatePerson = await apiContext.put(`/api/people/${testData.people[0].id}`, {
            data: { utilization_target: 90 }
          });
          return { updateProject: updateProject.ok(), updatePerson: updatePerson.ok() };
        }
      ];
      // Execute operations concurrently
      const results = await Promise.allSettled(operations.map(op => op()));
      // Both should complete (no deadlock)
      const completed = results.filter(r => r.status === 'fulfilled');
      expect(completed.length).toBe(2);
      console.log('✅ No deadlock detected - all operations completed');
      // Verify final state is consistent
      const personCheck = await apiContext.get(`/api/people/${testData.people[0].id}`);
      const projectCheck = await apiContext.get(`/api/projects/${testData.projects[1].id}`);
      expect(personCheck.ok()).toBe(true);
      expect(projectCheck.ok()).toBe(true);
      console.log('✅ Database state remains consistent after concurrent operations');
    });
  });
  test.describe('Data Consistency Verification', () => {
    test(`${tags.critical} should maintain assignment allocation constraints`, async ({ 
      apiContext,
      testHelpers,
      authenticatedPage 
    }) => {
      console.log('🔒 Testing assignment allocation constraints');
      // Create multiple assignments for same person
      const person = testData.people[0];
      const assignments = [];
      for (let i = 0; i < 3; i++) {
        const response = await apiContext.post('/api/assignments', {
          data: {
            person_id: person.id,
            project_id: testData.projects[i].id,
            allocation_percentage: 30,
            start_date: new Date().toISOString().split('T')[0],
            end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
          }
        });
        if (response.ok()) {
          const data = await response.json();
          assignments.push(data);
          testContext.createdIds.assignments.push(data.id);
        }
      }
      // Verify total allocation doesn't exceed 100%
      await testHelpers.navigateTo('/people');
      await testHelpers.waitForDataTable();
      // Check person's utilization
      const personRow = authenticatedPage.locator(`tr:has-text("${person.name}")`);
      if (await personRow.count() > 0) {
        const utilizationCell = personRow.locator('td').nth(4); // Utilization column
        const utilizationText = await utilizationCell.textContent();
        if (utilizationText?.includes('%')) {
          const utilization = parseInt(utilizationText.match(/(\d+, 10)%/)?.[1] || '0');
          expect(utilization).toBeLessThanOrEqual(100);
          console.log(`✅ Person utilization (${utilization}%) within valid range`);
        }
      }
      // Verify via API
      const personDetails = await apiContext.get(`/api/people/${person.id}`);
      if (personDetails.ok()) {
        const data = await personDetails.json();
        if (data.current_utilization !== undefined) {
          expect(data.current_utilization).toBeLessThanOrEqual(100);
        }
      }
      console.log('✅ Assignment allocation constraints maintained');
    });
  });
});