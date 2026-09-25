/**
 * Dashboard Availability Accuracy Tests
 * Tests that dashboard availability stats accurately reflect person utilization data
 */
import { test, expect, tags } from '../../../fixtures';

test.describe('Dashboard Availability Accuracy', () => {
  test(`${tags.critical} should show correct available people count matching utilization data`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    // Navigate to dashboard
    await testHelpers.navigateTo('/dashboard');
    
    // Get the Quick Stats availability numbers
    const quickStatsSection = authenticatedPage.locator('.card').filter({ hasText: 'Quick Stats' });
    await expect(quickStatsSection).toBeVisible();
    
    // Find Available count
    const availableText = quickStatsSection.locator('text=/Available:\\s*\\d+/i');
    await expect(availableText).toBeVisible();
    const availableMatch = (await availableText.textContent())?.match(/Available:\s*(\d+)/i);
    const dashboardAvailableCount = availableMatch ? parseInt(availableMatch[1], 10) : 0;
    
    console.log(`Dashboard shows ${dashboardAvailableCount} available people`);
    
    // Navigate to People page to verify
    await testHelpers.navigateTo('/people');
    await testHelpers.waitForPageLoad();
    
    // Count people with 100% availability
    const peopleRows = authenticatedPage.locator('tbody tr');
    const rowCount = await peopleRows.count();
    let actualAvailableCount = 0;
    
    for (let i = 0; i < rowCount; i++) {
      const row = peopleRows.nth(i);
      const availabilityCell = row.locator('td').filter({ hasText: /^\d+%$/ });
      const availabilityText = await availabilityCell.textContent();
      
      if (availabilityText === '100%') {
        actualAvailableCount++;
      }
    }
    
    console.log(`People page shows ${actualAvailableCount} people at 100% availability`);
    
    // Verify counts match
    expect(dashboardAvailableCount).toBe(actualAvailableCount);
    
    console.log('✅ Dashboard availability count matches actual data');
  });
  
  test(`${tags.critical} should update availability count when assignments change`, async ({ 
    authenticatedPage,
    testHelpers,
    apiContext 
  }) => {
    // Navigate to dashboard and get initial count
    await testHelpers.navigateTo('/dashboard');
    
    const quickStatsSection = authenticatedPage.locator('.card').filter({ hasText: 'Quick Stats' });
    const availableText = quickStatsSection.locator('text=/Available:\\s*\\d+/i');
    const initialMatch = (await availableText.textContent())?.match(/Available:\s*(\d+)/i);
    const initialAvailableCount = initialMatch ? parseInt(initialMatch[1], 10) : 0;
    
    console.log(`Initial available count: ${initialAvailableCount}`);
    
    // Get a person and project for assignment
    const people = await apiContext.get('/api/people');
    const peopleData = await people.json();
    const availablePerson = peopleData.find((p: any) => p.is_active);
    
    const projects = await apiContext.get('/api/projects');
    const projectsData = await projects.json();
    const activeProject = projectsData[0];
    
    if (availablePerson && activeProject) {
      // Create an assignment
      const scenarios = await apiContext.get('/api/scenarios');
      const scenariosData = await scenarios.json();
      const activeScenario = scenariosData.find((s: any) => s.status === 'active');
      
      if (activeScenario) {
        // Create assignment in the active scenario
        await apiContext.post('/api/assignments', {
          data: {
            scenario_id: activeScenario.id,
            project_id: activeProject.id,
            person_id: availablePerson.id,
            role_id: availablePerson.roles?.[0]?.id || 'dev-role',
            allocation_percentage: 50,
            assignment_date_mode: 'fixed',
            start_date: new Date().toISOString().split('T')[0],
            end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
          }
        });
        
        // Refresh dashboard
        await testHelpers.navigateTo('/dashboard', { waitUntil: 'networkidle' });
        
        // Check updated count
        const updatedMatch = (await availableText.textContent())?.match(/Available:\s*(\d+)/i);
        const updatedAvailableCount = updatedMatch ? parseInt(updatedMatch[1], 10) : 0;
        
        console.log(`Updated available count: ${updatedAvailableCount}`);
        
        // Should have one less available person
        expect(updatedAvailableCount).toBe(initialAvailableCount - 1);
        
        console.log('✅ Dashboard availability count updates correctly after assignment');
      }
    }
  });
  
  test(`${tags.smoke} should show availability breakdown in utilization chart`, async ({ 
    authenticatedPage,
    testHelpers 
  }) => {
    await testHelpers.navigateTo('/dashboard');
    
    // Find the Resource Utilization card
    const utilizationCard = authenticatedPage.locator('.card').filter({ hasText: 'Resource Utilization' });
    await expect(utilizationCard).toBeVisible();
    
    // Check for utilization status labels
    const availableLabel = utilizationCard.locator('text=/Available/i');
    const partiallyAllocatedLabel = utilizationCard.locator('text=/Partially Allocated/i');
    
    // At least one of these should be visible
    const hasUtilizationData = await availableLabel.isVisible() || await partiallyAllocatedLabel.isVisible();
    expect(hasUtilizationData).toBe(true);
    
    console.log('✅ Dashboard shows utilization breakdown');
  });
});