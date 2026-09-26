/**
 * ARCHIVED 2026-09-26 (L4 harvest slice 3): speculative-era zombie suite.
 * Its targets — "Planning Tools" (what-if analysis, capacity calculator,
 * planning parameters) and "Collaboration Features" (comments, approvals,
 * sharing) — have 0 references in client/src: the modules were never built.
 * Comparison coverage that is real lives in scenario-comparison-modal.spec.ts
 * and red line test 13. 16 tests archived, scenario ledger 214 → 168.
 *
 * Scenario Planning Workflows Tests
 * Tests for scenario planning, comparison features, and workflow integration
 * Uses dynamic test data for proper isolation
 */
import { test, expect, tags } from '../../fixtures';
import { TestDataContext } from '../../utils/test-data-helpers';
import { ScenarioTestUtils, createUniqueTestPrefix, waitForSync } from '../../helpers/scenario-test-utils';
test.describe('Scenario Planning Workflows', () => {
  let testContext: TestDataContext;
  let testScenarios: any[];
  let testProjects: any[];
  let scenarioUtils: ScenarioTestUtils;
  let userId: string;
  
  test.beforeEach(async ({ testDataHelpers, testHelpers, apiContext, authenticatedPage }) => {
    // Create isolated test context
    const uniquePrefix = createUniqueTestPrefix('scnplan');
    testContext = testDataHelpers.createTestContext(uniquePrefix);
    
    // Initialize scenario utilities
    scenarioUtils = new ScenarioTestUtils({
      page: authenticatedPage,
      apiContext,
      testPrefix: uniquePrefix
    });
    
    // Get user ID
    try {
      const profileResponse = await apiContext.get('/api/profile');
      if (profileResponse.ok()) {
        const profile = await profileResponse.json();
        userId = profile.person?.id || '';
      }
    } catch (error) {
      console.log('Could not get profile:', error);
    }
    
    if (!userId) {
      const testUser = await testDataHelpers.createTestUser(testContext);
      userId = testUser.id;
    }
    // Create test projects for linking
    testProjects = [];
    for (let i = 0; i < 2; i++) {
      const project = await testDataHelpers.createTestProject(testContext, {
        name: `${testContext.prefix}-Project-${i + 1}`
      });
      testProjects.push(project);
    }
    // Create test scenarios for planning workflows.
    // Via the shared helper (2026-09-26 systemic fix): the inline creates
    // read .id off the {success, data} envelope — scenarios existed but
    // testScenarios stayed empty and downstream crashed on `.name`.
    testScenarios = [];
    const scenarioConfigs = [
      { name: 'Q2 Planning', type: 'sandbox', status: 'draft' as const },
      { name: 'Baseline 2024', type: 'baseline', status: 'active' as const },
      { name: 'What-If Growth', type: 'branch', status: 'draft' as const },
      { name: 'Forecast Q3', type: 'branch', status: 'active' as const }
    ];
    for (const config of scenarioConfigs) {
      testScenarios.push(await testDataHelpers.createTestScenario(testContext, {
        name: `${testContext.prefix}-${config.name}`,
        description: `${config.name} scenario for workflow testing`,
        type: config.type,
        status: config.status,
        created_by: userId,
        extra: { planning_period: config.type === 'sandbox' ? '2024-Q2' : null }
      }));
    }
    await testHelpers.navigateTo('/scenarios');
    await testHelpers.waitForPageContent();
  });
  test.afterEach(async ({ testDataHelpers }) => {
    // Clean up all test data
    await scenarioUtils.cleanupScenariosByPrefix(testContext.prefix);
    await testDataHelpers.cleanupTestContext(testContext);
  });
  test.describe('Scenario Planning', () => {
    test(`${tags.planning} should create planning scenarios`, async ({ 
      authenticatedPage,
      apiContext 
    }) => {
      // Create new planning scenario
      await authenticatedPage.click('button:has-text("New Scenario"), button:has-text("Create Scenario")');
      const modal = authenticatedPage.locator('[role="dialog"], .modal');
      const newScenarioName = `${testContext.prefix}-Q3-2024-Planning`;
      await modal.locator('input[name="name"], input[name="scenario_name"]').fill(newScenarioName);
      const typeSelect = modal.locator('select[name="scenario_type"], select[name="type"]');
      if (await typeSelect.isVisible()) {
        await typeSelect.selectOption('sandbox');
      }
      const periodInput = modal.locator('input[name="planning_period"], input[name="period"]');
      if (await periodInput.isVisible()) {
        await periodInput.fill('2024-Q3');
      }
      // Listen for API response
      const responsePromise = authenticatedPage.waitForResponse(response => 
        response.url().includes('/api/scenarios') && response.request().method() === 'POST'
      );
      await modal.locator('button:has-text("Create"), button:has-text("Save")').click();
      const response = await responsePromise;
      const newScenario = await response.json();
      if (newScenario.id) {
        testContext.createdIds.scenarios.push(newScenario.id);
      }
      // Wait for modal to close and verify scenario created
      await expect(modal).not.toBeVisible();
      await waitForSync(authenticatedPage);
      
      await scenarioUtils.waitForScenariosToLoad();
      const planningRow = await scenarioUtils.getScenarioRow(newScenarioName);
      await expect(planningRow).toBeVisible();
      
      const typeBadge = scenarioUtils.getBadge(planningRow, 'type');
      await expect(typeBadge).toContainText('sandbox', { ignoreCase: true });
    });
    test('should set planning parameters', async ({ 
      authenticatedPage,
      testDataHelpers 
    }) => {
      // Use our planning scenario
      const planningScenario = testScenarios.find(s => s.scenario_type === 'sandbox');
      const scenarioRow = await scenarioUtils.getScenarioRow(planningScenario.name);
      
      // Click on scenario to view details
      const nameLink = scenarioRow.locator('.scenario-name, .name, a').first();
      if (await nameLink.isVisible()) {
        await nameLink.click();
      }
      // Open planning parameters
      const parametersButton = authenticatedPage.locator('button:has-text("Parameters"), button:has-text("Settings")');
      if (await parametersButton.count() > 0) {
        await parametersButton.click();
        // Set parameters
        const paramsPanel = authenticatedPage.locator('.parameters-panel, .settings-panel, [data-testid="parameters"]');
        await paramsPanel.locator('input[name="growth_rate"]').fill('15');
        await paramsPanel.locator('input[name="hiring_budget"]').fill('500000');
        const prioritySelect = paramsPanel.locator('select[name="priority_focus"]');
        if (await prioritySelect.isVisible()) {
          await prioritySelect.selectOption('product');
        }
        // Save parameters
        const responsePromise = authenticatedPage.waitForResponse(response => 
          response.url().includes(`/api/scenarios/${planningScenario.id}`) && 
          (response.request().method() === 'PUT' || response.request().method() === 'PATCH')
        );
        await paramsPanel.locator('button:has-text("Apply"), button:has-text("Save")').click();
        await responsePromise;
        // Verify applied
        await expect(authenticatedPage.locator('.toast, .notification')).toContainText(/updated|saved/i);
      }
    });
    test('should run what-if analysis', async ({ 
      authenticatedPage,
      testDataHelpers 
    }) => {
      // Use our what-if scenario
      const whatIfScenario = testScenarios.find(s => s.scenario_type === 'branch' && s.name.includes('What-If'));
      const scenarioRow = await scenarioUtils.getScenarioRow(whatIfScenario.name);
      
      // Click on scenario to view details
      const nameLink = scenarioRow.locator('.scenario-name, .name, a').first();
      if (await nameLink.isVisible()) {
        await nameLink.click();
      }
      // Configure what-if parameters
      const analysisButton = authenticatedPage.locator('button:has-text("Configure Analysis"), button:has-text("Analysis Settings")');
      if (await analysisButton.isVisible()) {
        await analysisButton.click();
        const analysisModal = authenticatedPage.locator('[role="dialog"], .modal');
        // Set conditions
        await analysisModal.locator('input[name="team_multiplier"]').fill('2.0');
        await analysisModal.locator('input[name="timeline_impact"]').fill('-20');
        // Run analysis
        const analysisPromise = authenticatedPage.waitForResponse(response => 
          response.url().includes('/api/scenarios') && 
          response.url().includes('analysis')
        );
        await analysisModal.locator('button:has-text("Run Analysis"), button:has-text("Analyze")').click();
        try {
          await analysisPromise;
        } catch {
          // Analysis endpoint may not exist
        }
        // Wait for results
        const results = authenticatedPage.locator('.analysis-results, .results-panel');
        await expect(results).toBeVisible({ timeout: 10000 });
        await expect(results).toContainText(/impact|result|analysis/i);
      }
    });
    test('should support milestone planning', async ({ 
      authenticatedPage,
      testDataHelpers,
      apiContext 
    }) => {
      // Use first test scenario
      const scenario = testScenarios[0];
      const scenarioRow = await scenarioUtils.getScenarioRow(scenario.name);
      // Click on scenario to view details
      const nameLink = scenarioRow.locator('.scenario-name, .name, a').first();
      if (await nameLink.isVisible()) {
        await nameLink.click();
      }
      // Add milestone
      const addMilestoneButton = authenticatedPage.locator('button:has-text("Add Milestone"), button:has-text("New Milestone")');
      if (await addMilestoneButton.isVisible()) {
        await addMilestoneButton.click();
        const milestoneModal = authenticatedPage.locator('[role="dialog"]');
        const milestoneName = `${testContext.prefix}-Product-Launch`;
        await milestoneModal.locator('input[name*="name"]').fill(milestoneName);
        await milestoneModal.locator('input[name*="date"][type="date"]').fill('2024-06-15');
        await milestoneModal.locator('textarea[name*="requirements"], textarea[name*="description"]').fill('Complete features A, B, C');
        const responsePromise = authenticatedPage.waitForResponse(response => 
          response.url().includes('/api/milestones') && response.request().method() === 'POST'
        );
        await milestoneModal.locator('button:has-text("Add"), button:has-text("Create")').click();
        try {
          const response = await responsePromise;
          const milestone = await response.json();
          if (milestone.id) {
            testContext.createdIds.milestones = testContext.createdIds.milestones || [];
            testContext.createdIds.milestones.push(milestone.id);
          }
        } catch {
          // Milestones API may not exist
        }
        // Verify milestone appears
        const milestoneCard = authenticatedPage.locator(`.milestone-card:has-text("${milestoneName}"), .milestone-item:has-text("${milestoneName}")`);
        await expect(milestoneCard).toBeVisible();
      }
    });
  });
  test.describe('Scenario Comparison', () => {
    test(`${tags.comparison} should compare multiple scenarios`, async ({ 
      authenticatedPage,
      testDataHelpers 
    }) => {
      // Switch to comparison view
      const compareButton = authenticatedPage.locator('button:has-text("Compare"), button:has-text("Comparison")');
      await compareButton.click();
      // Select scenarios to compare
      const scenarioSelector = authenticatedPage.locator('.scenario-selector, .comparison-selector');
      // Select first two test scenarios
      for (let i = 0; i < 2; i++) {
        const scenario = testScenarios[i];
        const checkbox = scenarioSelector.locator(`input[type="checkbox"][value="${scenario.id}"], label:has-text("${scenario.name}") input[type="checkbox"]`);
        if (await checkbox.isVisible()) {
          await checkbox.check();
        }
      }
      // View comparison
      await authenticatedPage.click('button:has-text("Compare Selected"), button:has-text("View Comparison")');
      // Verify comparison view
      await expect(authenticatedPage.locator('.comparison-view, .scenario-comparison')).toBeVisible();
      await expect(authenticatedPage.locator('.comparison-table, .comparison-grid')).toBeVisible();
      // Should show both scenarios
      const comparisonColumns = authenticatedPage.locator('.comparison-column, .scenario-column');
      await expect(comparisonColumns).toHaveCount(2);
    });
    test('should highlight scenario differences', async ({ 
      authenticatedPage,
      testDataHelpers 
    }) => {
      // Enter comparison mode
      const compareButton = authenticatedPage.locator('button:has-text("Compare")');
      if (await compareButton.count() > 0) {
        await compareButton.click();
        // Select two scenarios with different types
        const baselineScenario = testScenarios.find(s => s.scenario_type === 'baseline');
        const whatIfScenario = testScenarios.find(s => s.scenario_type === 'branch' && s.name.includes('What-If'));
        // Select scenarios
        for (const scenario of [baselineScenario, whatIfScenario]) {
          const checkbox = authenticatedPage.locator(`input[type="checkbox"][value="${scenario.id}"], label:has-text("${scenario.name}") input`);
          if (await checkbox.isVisible()) {
            await checkbox.check();
          }
        }
        await authenticatedPage.click('button:has-text("Compare Selected")');
        // Enable difference highlighting
        const highlightToggle = authenticatedPage.locator('input[name="highlight_differences"], input[id*="highlight"]');
        if (await highlightToggle.isVisible()) {
          await highlightToggle.check();
        }
        // Check for highlighted differences
        const differences = authenticatedPage.locator('.difference-highlight, .diff-highlight, [data-diff="true"]');
        if (await differences.count() > 0) {
          // Differences should be visually distinct
          const firstDiff = differences.first();
          const highlightColor = await firstDiff.evaluate(el => 
            window.getComputedStyle(el).backgroundColor
          );
          expect(highlightColor).toMatch(/rgb|rgba/);
        }
      }
    });
    test('should generate comparison report', async ({ 
      authenticatedPage,
      testDataHelpers 
    }) => {
      // Enter comparison mode
      await authenticatedPage.click('button:has-text("Compare")');
      // Select first two scenarios
      for (let i = 0; i < 2; i++) {
        const scenario = testScenarios[i];
        const checkbox = authenticatedPage.locator(`label:has-text("${scenario.name}") input[type="checkbox"]`);
        if (await checkbox.isVisible()) {
          await checkbox.check();
        }
      }
      await authenticatedPage.click('button:has-text("Compare Selected")');
      // Generate report
      const reportButton = authenticatedPage.locator('button:has-text("Generate Report"), button:has-text("Export Comparison")');
      if (await reportButton.count() > 0) {
        const downloadPromise = authenticatedPage.waitForEvent('download');
        await reportButton.click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/comparison|report|scenario/i);
      }
    });
    test('should show side-by-side metrics', async ({ 
      authenticatedPage,
      testDataHelpers 
    }) => {
      // Navigate to comparison view
      await authenticatedPage.click('button:has-text("Compare")');
      // Select scenarios
      for (let i = 0; i < 2; i++) {
        const scenario = testScenarios[i];
        const selector = authenticatedPage.locator(`label:has-text("${scenario.name}") input, input[value="${scenario.id}"]`);
        if (await selector.isVisible()) {
          await selector.check();
        }
      }
      await authenticatedPage.click('button:has-text("Compare Selected")');
      // Check metrics panel
      const metricsPanel = authenticatedPage.locator('.metrics-comparison, .comparison-metrics');
      if (await metricsPanel.count() > 0) {
        // Check metric categories
        const metricCategories = ['Cost', 'Timeline', 'Resources', 'Risk'];
        for (const category of metricCategories) {
          const metricRow = metricsPanel.locator(`.metric-row:has-text("${category}"), .metric-item:has-text("${category}")`);
          const isVisible = await metricRow.isVisible({ timeout: 2000 }).catch(() => false);
          if (isVisible) {
            // Should show values for each scenario
            const values = metricRow.locator('.metric-value, .value');
            const valueCount = await values.count();
            expect(valueCount).toBeGreaterThanOrEqual(2); // For 2 scenarios
          }
        }
      }
    });
  });
  test.describe('Workflow Integration', () => {
    test('should integrate with project planning', async ({ 
      authenticatedPage,
      testDataHelpers,
      apiContext 
    }) => {
      // Use first test scenario
      const scenario = testScenarios[0];
      const scenarioRow = await scenarioUtils.getScenarioRow(scenario.name);
      // Click on scenario to view details
      const nameLink = scenarioRow.locator('.scenario-name, .name, a').first();
      if (await nameLink.isVisible()) {
        await nameLink.click();
      }
      // Link to project
      const linkButton = authenticatedPage.locator('button:has-text("Link Project"), button:has-text("Associate Project")');
      if (await linkButton.isVisible()) {
        await linkButton.click();
        const linkModal = authenticatedPage.locator('[role="dialog"]');
        const projectSelect = linkModal.locator('select[name="project_id"], select[name="project"]');
        if (await projectSelect.count() > 0) {
          // Select our test project
          const option = projectSelect.locator(`option:has-text("${testProjects[0].name}")`);
          if (await option.count() > 0) {
            await projectSelect.selectOption(testProjects[0].id);
          } else {
            await projectSelect.selectOption({ index: 1 });
          }
          const linkPromise = authenticatedPage.waitForResponse(response => 
            response.url().includes('/api/scenario-projects') || 
            response.url().includes(`/api/scenarios/${scenario.id}`)
          );
          await linkModal.locator('button:has-text("Link"), button:has-text("Associate")').click();
          try {
            await linkPromise;
          } catch {
            // Link API may vary
          }
          // Verify link established
          await expect(authenticatedPage.locator('.linked-projects, .associated-projects')).toBeVisible();
        }
      }
    });
    test('should sync with resource allocation', async ({ 
      authenticatedPage,
      testDataHelpers 
    }) => {
      // Use active scenario
      const activeScenario = testScenarios.find(s => s.status === 'active');
      const scenarioRow = await scenarioUtils.getScenarioRow(activeScenario.name);
      // Click on scenario to view details
      const nameLink = scenarioRow.locator('.scenario-name, .name, a').first();
      if (await nameLink.isVisible()) {
        await nameLink.click();
      }
      // Open resource view
      const resourcesTab = authenticatedPage.locator('button:has-text("Resources"), [role="tab"]:has-text("Resources")');
      if (await resourcesTab.count() > 0) {
        await resourcesTab.click();
        // Should show resource allocation
        await expect(authenticatedPage.locator('.resource-allocation-view, .resources-panel')).toBeVisible();
        // Modify allocation
        const allocationInput = authenticatedPage.locator('input[type="range"], input[type="number"][name*="allocation"]').first();
        if (await allocationInput.isVisible()) {
          await allocationInput.fill('75');
          // Save changes
          const updateButton = authenticatedPage.locator('button:has-text("Update Allocation"), button:has-text("Save Resources")');
          if (await updateButton.isVisible()) {
            await updateButton.click();
            // Verify sync indicator
            await expect(authenticatedPage.locator('.sync-status, .save-status')).toContainText(/synced|saved|updated/i);
          }
        }
      }
    });
    test('should export scenario to project', async ({ 
      authenticatedPage,
      testDataHelpers,
      apiContext 
    }) => {
      // Use draft scenario
      const draftScenario = testScenarios.find(s => s.status === 'draft');
      const scenarioRow = await scenarioUtils.getScenarioRow(draftScenario.name);
      // Click on scenario to view details
      const nameLink = scenarioRow.locator('.scenario-name, .name, a').first();
      if (await nameLink.isVisible()) {
        await nameLink.click();
      }
      // Export to project
      const exportButton = authenticatedPage.locator('button:has-text("Export to Project"), button:has-text("Create Project")');
      if (await exportButton.isVisible()) {
        await exportButton.click();
        const exportModal = authenticatedPage.locator('[role="dialog"]');
        const projectName = `${testContext.prefix}-Implementation-2024`;
        await exportModal.locator('input[name*="name"]').fill(projectName);
        const responsePromise = authenticatedPage.waitForResponse(response => 
          response.url().includes('/api/projects') && response.request().method() === 'POST'
        );
        await exportModal.locator('button:has-text("Export"), button:has-text("Create")').click();
        try {
          const response = await responsePromise;
          const newProject = await response.json();
          if (newProject.id) {
            testContext.createdIds.projects.push(newProject.id);
          }
          // Should navigate to new project
          await expect(authenticatedPage).toHaveURL(/\/projects\/[^/]+$/);
          await expect(authenticatedPage.locator('h1')).toContainText(projectName);
        } catch {
          // Export functionality may vary
        }
      }
    });
  });
  test.describe('Collaboration Features', () => {
    test('should support scenario comments', async ({ 
      authenticatedPage,
      testDataHelpers,
      apiContext 
    }) => {
      // Use first scenario
      const scenario = testScenarios[0];
      const scenarioRow = await scenarioUtils.getScenarioRow(scenario.name);
      // Click on scenario to view details
      const nameLink = scenarioRow.locator('.scenario-name, .name, a').first();
      if (await nameLink.isVisible()) {
        await nameLink.click();
      }
      // Add comment
      const commentSection = authenticatedPage.locator('.comments-section, .scenario-comments, [data-testid="comments"]');
      if (await commentSection.count() > 0) {
        const commentText = `${testContext.prefix} - This looks good, but we should consider the budget impact`;
        await commentSection.locator('textarea').fill(commentText);
        const postPromise = authenticatedPage.waitForResponse(response => 
          response.url().includes('/api/comments') && response.request().method() === 'POST'
        );
        await commentSection.locator('button:has-text("Post"), button:has-text("Add Comment")').click();
        try {
          const response = await postPromise;
          const comment = await response.json();
          if (comment.id) {
            testContext.createdIds.comments = testContext.createdIds.comments || [];
            testContext.createdIds.comments.push(comment.id);
          }
        } catch {
          // Comments API may vary
        }
        // Verify comment appears
        const commentItem = authenticatedPage.locator(`.comment-item:has-text("${testContext.prefix}"), .comment:has-text("${testContext.prefix}")`);
        await expect(commentItem).toBeVisible();
        await expect(commentItem).toContainText('budget impact');
      }
    });
    test('should track scenario approvals', async ({ 
      authenticatedPage,
      testDataHelpers 
    }) => {
      // Use planning scenario
      const planningScenario = testScenarios.find(s => s.scenario_type === 'sandbox' && s.name.includes('Planning'));
      const scenarioRow = await scenarioUtils.getScenarioRow(planningScenario.name);
      // Click on scenario to view details
      const nameLink = scenarioRow.locator('.scenario-name, .name, a').first();
      if (await nameLink.isVisible()) {
        await nameLink.click();
      }
      // Check approval section
      const approvalSection = authenticatedPage.locator('.approval-section, .approvals-panel');
      if (await approvalSection.count() > 0) {
        // Request approval
        const requestButton = approvalSection.locator('button:has-text("Request Approval"), button:has-text("Submit for Approval")');
        if (await requestButton.isVisible()) {
          await requestButton.click();
          const approvalModal = authenticatedPage.locator('[role="dialog"]');
          // Select approver if dropdown exists
          const approverSelect = approvalModal.locator('select[name="approver"], select[name="reviewer"]');
          if (await approverSelect.isVisible()) {
            await approverSelect.selectOption({ index: 1 });
          }
          await approvalModal.locator('textarea[name*="notes"], textarea[name*="comment"]').fill('Ready for review');
          const submitPromise = authenticatedPage.waitForResponse(response => 
            response.url().includes('/api/approvals') || response.url().includes('approval')
          );
          await approvalModal.locator('button:has-text("Send Request"), button:has-text("Submit")').click();
          try {
            await submitPromise;
          } catch {
            // Approval API may vary
          }
          // Verify status change
          await expect(approvalSection.locator('.approval-status, .status')).toContainText(/pending|review|submitted/i);
        }
      }
    });
    test('should share scenario with team', async ({ 
      authenticatedPage,
      testDataHelpers 
    }) => {
      // Use first scenario
      const scenario = testScenarios[0];
      const scenarioRow = await scenarioUtils.getScenarioRow(scenario.name);
      // Click on scenario to view details
      const nameLink = scenarioRow.locator('.scenario-name, .name, a').first();
      if (await nameLink.isVisible()) {
        await nameLink.click();
      }
      // Share scenario
      const shareButton = authenticatedPage.locator('button:has-text("Share"), button[aria-label="Share"]');
      if (await shareButton.isVisible()) {
        await shareButton.click();
        const shareModal = authenticatedPage.locator('[role="dialog"]');
        // Add team members
        const testEmail = `${testContext.prefix}-team@example.com`;
        await shareModal.locator('input[name*="email"], input[type="email"]').fill(testEmail);
        const permissionSelect = shareModal.locator('select[name*="permission"], select[name*="role"]');
        if (await permissionSelect.isVisible()) {
          await permissionSelect.selectOption('edit');
        }
        // Add to list
        const addButton = shareModal.locator('button:has-text("Add"), button[aria-label="Add"]');
        if (await addButton.isVisible()) {
          await addButton.click();
        }
        // Verify share list
        await expect(shareModal.locator('.share-list, .collaborators-list')).toContainText(testEmail);
        // Send invites
        const invitePromise = authenticatedPage.waitForResponse(response => 
          response.url().includes('/api/invitations') || response.url().includes('share')
        );
        await shareModal.locator('button:has-text("Send Invitations"), button:has-text("Share")').click();
        try {
          await invitePromise;
        } catch {
          // Share API may vary
        }
        // Verify success
        await expect(authenticatedPage.locator('.toast, .notification')).toContainText(/shared|invited|added/i);
      }
    });
  });
  test.describe('Planning Tools', () => {
    test('should use capacity calculator', async ({ 
      authenticatedPage,
      testDataHelpers 
    }) => {
      // Use planning scenario
      const planningScenario = testScenarios.find(s => s.scenario_type === 'sandbox' && s.name.includes('Planning'));
      const scenarioRow = await scenarioUtils.getScenarioRow(planningScenario.name);
      // Click on scenario to view details
      const nameLink = scenarioRow.locator('.scenario-name, .name, a').first();
      if (await nameLink.isVisible()) {
        await nameLink.click();
      }
      // Open tools
      const toolsButton = authenticatedPage.locator('button:has-text("Planning Tools"), button:has-text("Tools")');
      if (await toolsButton.count() > 0) {
        await toolsButton.click();
        const calculatorButton = authenticatedPage.locator('button:has-text("Capacity Calculator"), a:has-text("Capacity")');
        if (await calculatorButton.isVisible()) {
          await calculatorButton.click();
          const calculator = authenticatedPage.locator('.capacity-calculator, .calculator-panel');
          // Input parameters
          await calculator.locator('input[name="team_size"]').fill('10');
          await calculator.locator('input[name="avg_hours"], input[name="hours_per_week"]').fill('40');
          await calculator.locator('input[name="efficiency"], input[name="utilization"]').fill('80');
          // Calculate
          await calculator.locator('button:has-text("Calculate"), button:has-text("Compute")').click();
          // Verify results
          await expect(calculator.locator('.calculation-result, .results')).toContainText(/capacity|hours|total/i);
        }
      }
    });
    test('should generate timeline projections', async ({ 
      authenticatedPage,
      testDataHelpers 
    }) => {
      // Use forecast scenario
      const forecastScenario = testScenarios.find(s => s.scenario_type === 'branch' && s.name.includes('Forecast'));
      const scenarioRow = await scenarioUtils.getScenarioRow(forecastScenario.name);
      
      // Click on scenario to view details
      const nameLink = scenarioRow.locator('.scenario-name, .name, a').first();
      if (await nameLink.isVisible()) {
        await nameLink.click();
      }
      // Generate timeline
      const timelineButton = authenticatedPage.locator('button:has-text("Generate Timeline"), button:has-text("Create Timeline")');
      if (await timelineButton.isVisible()) {
        await timelineButton.click();
        const timelineModal = authenticatedPage.locator('[role="dialog"]');
        // Configure timeline
        await timelineModal.locator('input[name*="start"][type="date"]').fill('2024-01-01');
        await timelineModal.locator('input[name="phases"], input[name="phase_count"]').fill('4');
        const methodSelect = timelineModal.locator('select[name*="methodology"]');
        if (await methodSelect.isVisible()) {
          await methodSelect.selectOption('agile');
        }
        const generatePromise = authenticatedPage.waitForResponse(response => 
          response.url().includes('/api/timelines') || response.url().includes('generate')
        );
        await timelineModal.locator('button:has-text("Generate"), button:has-text("Create")').click();
        try {
          await generatePromise;
        } catch {
          // Timeline API may vary
        }
        // Verify timeline created
        await expect(authenticatedPage.locator('.timeline-visualization, .timeline-view')).toBeVisible();
        await expect(authenticatedPage.locator('.timeline-phase, .phase-item')).toHaveCount(4);
      }
    });
  });
});