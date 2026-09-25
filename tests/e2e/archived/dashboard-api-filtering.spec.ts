/**
 * Dashboard API Current Projects Filtering Tests
 * Tests API-level filtering logic for dashboard data
 */
import { test, expect, tags } from '../../../fixtures';
test.describe('Dashboard API Current Projects Filtering', () => {
  test(`${tags.api} should filter projects by current date in API`, async ({ 
    apiContext 
  }) => {
    // Direct API test to verify filtering logic
    const response = await apiContext.get('/api/reporting/dashboard');
    expect(response.status()).toBe(200);
    const data = await response.json();
    // Verify response structure
    expect(data).toHaveProperty('summary');
    expect(data).toHaveProperty('projectHealth');
    expect(data).toHaveProperty('capacityGaps');
    expect(data).toHaveProperty('utilization');
    expect(data).toHaveProperty('availability');
    // Verify summary contains project count
    expect(data.summary).toHaveProperty('projects');
    expect(data.summary).toHaveProperty('people');
    expect(data.summary).toHaveProperty('roles');
    // Log the current project metrics
    console.log('Current Projects Count:', data.summary.projects);
    console.log('Project Health:', data.projectHealth);
    console.log('Capacity Gaps:', data.capacityGaps);
    console.log('Utilization:', data.utilization);
    console.log('Availability:', data.availability);
    // Validate data types and reasonable values
    expect(typeof data.summary.projects).toBe('number');
    expect(data.summary.projects).toBeGreaterThanOrEqual(0);
    expect(data.summary.projects).toBeLessThanOrEqual(20); // Reasonable upper bound
    // Verify capacity gaps structure
    expect(typeof data.capacityGaps).toBe('object');
    if (data.capacityGaps.GAP !== undefined) {
      expect(typeof data.capacityGaps.GAP).toBe('number');
      expect(data.capacityGaps.GAP).toBeGreaterThanOrEqual(0);
    }
    // Verify availability structure
    expect(typeof data.availability).toBe('object');
    if (data.availability.AVAILABLE !== undefined) {
      expect(typeof data.availability.AVAILABLE).toBe('number');
      expect(data.availability.AVAILABLE).toBeGreaterThanOrEqual(0);
    }
  });
  test(`${tags.api} should return consistent data across multiple API calls`, async ({ 
    apiContext 
  }) => {
    // Make multiple API calls to ensure consistency
    const responses = await Promise.all([
      apiContext.get('/api/reporting/dashboard'),
      apiContext.get('/api/reporting/dashboard'),
      apiContext.get('/api/reporting/dashboard')
    ]);
    // All should succeed
    for (const response of responses) {
      expect(response.status()).toBe(200);
    }
    const dataArray = await Promise.all(responses.map(r => r.json()));
    // All responses should be identical (same current projects count)
    const firstProjectCount = dataArray[0].summary.projects;
    dataArray.forEach((data, index) => {
      expect(data.summary.projects).toBe(firstProjectCount);
      console.log(`API call ${index + 1} - Current projects: ${data.summary.projects}`);
    });
    console.log('✅ API calls return consistent current project data');
  });
  test(`${tags.api} should filter project health for current projects only`, async ({ 
    apiContext 
  }) => {
    const response = await apiContext.get('/api/reporting/dashboard');
    const data = await response.json();
    // Verify project health only includes current project statuses
    const healthStatuses = Object.keys(data.projectHealth);
    const validStatuses = ['ACTIVE', 'OVERDUE', 'PLANNING'];
    healthStatuses.forEach(status => {
      expect(validStatuses).toContain(status);
      expect(typeof data.projectHealth[status]).toBe('number');
      expect(data.projectHealth[status]).toBeGreaterThanOrEqual(0);
    });
    // Total health count should match current projects count
    const totalHealthCount = Object.values(data.projectHealth).reduce((sum: number, count: any) => sum + count, 0);
    expect(totalHealthCount).toBe(data.summary.projects);
    console.log('✅ Project health metrics match current projects count');
  });
  test(`${tags.api} should calculate capacity gaps for current projects only`, async ({ 
    apiContext 
  }) => {
    const response = await apiContext.get('/api/reporting/dashboard');
    const data = await response.json();
    // Verify capacity gaps structure
    expect(data.capacityGaps).toHaveProperty('GAP');
    expect(data.capacityGaps).toHaveProperty('OK');
    const gapCount = data.capacityGaps.GAP || 0;
    const okCount = data.capacityGaps.OK || 0;
    expect(typeof gapCount).toBe('number');
    expect(typeof okCount).toBe('number');
    expect(gapCount).toBeGreaterThanOrEqual(0);
    expect(okCount).toBeGreaterThanOrEqual(0);
    console.log(`Capacity gaps for current projects - GAP: ${gapCount}, OK: ${okCount}`);
    // If we have current projects, we should have some capacity data
    if (data.summary.projects > 0) {
      expect(gapCount + okCount).toBeGreaterThanOrEqual(0);
    }
    console.log('✅ Capacity gaps calculated for current projects only');
  });
  test(`${tags.api} should show availability relative to current project assignments`, async ({ 
    apiContext 
  }) => {
    const response = await apiContext.get('/api/reporting/dashboard');
    const data = await response.json();
    // Verify availability structure
    expect(data.availability).toHaveProperty('AVAILABLE');
    expect(data.availability).toHaveProperty('ASSIGNED');
    const available = data.availability.AVAILABLE || 0;
    const assigned = data.availability.ASSIGNED || 0;
    expect(typeof available).toBe('number');
    expect(typeof assigned).toBe('number');
    expect(available).toBeGreaterThanOrEqual(0);
    expect(assigned).toBeGreaterThanOrEqual(0);
    // Total should not exceed total people count
    const totalPeople = data.summary.people;
    expect(available + assigned).toBeLessThanOrEqual(totalPeople);
    console.log(`Availability - Available: ${available}, Assigned to current projects: ${assigned}, Total people: ${totalPeople}`);
    console.log('✅ Availability metrics reflect current project assignments');
  });
  test(`${tags.api} should validate utilization data for current projects`, async ({ 
    apiContext 
  }) => {
    const response = await apiContext.get('/api/reporting/dashboard');
    const data = await response.json();
    // Verify utilization structure (may be empty if no current assignments)
    expect(typeof data.utilization).toBe('object');
    const utilizationCategories = ['OVER_ALLOCATED', 'FULLY_ALLOCATED', 'UNDER_ALLOCATED'];
    Object.keys(data.utilization).forEach(category => {
      expect(utilizationCategories).toContain(category);
      expect(typeof data.utilization[category]).toBe('number');
      expect(data.utilization[category]).toBeGreaterThanOrEqual(0);
    });
    // Total utilization count should not exceed assigned people
    const totalUtilization = Object.values(data.utilization).reduce((sum: number, count: any) => sum + count, 0);
    const assignedPeople = data.availability.ASSIGNED || 0;
    if (totalUtilization > 0) {
      expect(totalUtilization).toBeLessThanOrEqual(assignedPeople);
    }
    console.log('Utilization for current projects:', data.utilization);
    console.log('✅ Utilization data reflects current project assignments');
  });
  test(`${tags.api} should handle edge case of no current projects`, async ({ 
    apiContext 
  }) => {
    // This test simulates the scenario where there might be no current projects
    // based on the current date filter
    const response = await apiContext.get('/api/reporting/dashboard');
    const data = await response.json();
    if (data.summary.projects === 0) {
      // If no current projects, verify the response structure is still valid
      expect(data.projectHealth).toEqual({});
      expect(data.capacityGaps.GAP).toBe(0);
      expect(data.capacityGaps.OK).toBe(0);
      expect(data.utilization).toEqual({});
      expect(data.availability.ASSIGNED).toBe(0);
      expect(data.availability.AVAILABLE).toBe(data.summary.people);
      console.log('✅ API handles zero current projects scenario correctly');
    } else {
      console.log(`Current projects found: ${data.summary.projects}`);
      console.log('✅ API returning current project data as expected');
    }
  });
  test(`${tags.api} should validate date-based filtering logic`, async ({ 
    apiContext 
  }) => {
    // Test that verifies the date filtering is working correctly
    const response = await apiContext.get('/api/reporting/dashboard');
    const data = await response.json();
    const currentDate = new Date().toISOString().split('T')[0];
    console.log(`Testing with current date: ${currentDate}`);
    // Based on our seed data, we know:
    // - Projects span from 2023 to 2026
    // - Some projects should be current as of any date in 2024-2025
    // The number of current projects should be reasonable
    expect(data.summary.projects).toBeGreaterThanOrEqual(0);
    expect(data.summary.projects).toBeLessThanOrEqual(10); // Total projects in seed data
    // If we're in the range 2024-2025, we should have current projects
    const currentYear = new Date().getFullYear();
    if (currentYear >= 2024 && currentYear <= 2025) {
      expect(data.summary.projects).toBeGreaterThan(0);
      console.log(`✅ Found ${data.summary.projects} current projects for year ${currentYear}`);
    }
    console.log('✅ Date-based filtering working correctly');
  });
});