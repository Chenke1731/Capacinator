/**
 * API Tests for Capacity Report Structure
 * Ensures the capacity report API returns correctly structured data
 */
import { test, expect, tags } from '../../fixtures';

test.describe('Capacity Report API Structure', () => {
  test(`${tags.api} ${tags.critical} returns correct data structure`, async ({ 
    apiContext 
  }) => {
    const response = await apiContext.get('/api/reporting/capacity');
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    
    // Check top-level structure
    expect(data).toHaveProperty('capacityGaps');
    expect(data).toHaveProperty('byRole');
    expect(data).toHaveProperty('utilizationData');
    expect(data).toHaveProperty('personUtilization');
    expect(data).toHaveProperty('timeline');
    expect(data).toHaveProperty('summary');
  });

  test(`${tags.api} ${tags.critical} utilizationData has required fields for frontend`, async ({ 
    apiContext 
  }) => {
    const response = await apiContext.get('/api/reporting/capacity');
    const data = await response.json();
    
    expect(Array.isArray(data.utilizationData)).toBe(true);
    
    if (data.utilizationData.length > 0) {
      const person = data.utilizationData[0];
      
      // Required fields for the frontend table
      expect(person).toHaveProperty('person_id');
      expect(person).toHaveProperty('person_name');
      expect(person).toHaveProperty('default_availability_percentage');
      expect(person).toHaveProperty('available_hours');
      expect(person).toHaveProperty('total_allocated_hours');
      expect(person).toHaveProperty('allocation_status');
      
      // Ensure numeric fields are numbers, not null
      expect(typeof person.default_availability_percentage).toBe('number');
      expect(typeof person.available_hours).toBe('number');
      expect(typeof person.total_allocated_hours).toBe('number');
      
      // Status should be uppercase
      const validStatuses = ['AVAILABLE', 'PARTIALLY_ALLOCATED', 'FULLY_ALLOCATED', 'OVER_ALLOCATED', 'UNAVAILABLE'];
      expect(validStatuses).toContain(person.allocation_status);
    }
  });

  test(`${tags.api} ${tags.critical} byRole data matches chart expectations`, async ({ 
    apiContext 
  }) => {
    const response = await apiContext.get('/api/reporting/capacity');
    const data = await response.json();
    
    expect(Array.isArray(data.byRole)).toBe(true);
    
    if (data.byRole.length > 0) {
      const role = data.byRole[0];
      
      // Required fields for the chart
      expect(role).toHaveProperty('id');
      expect(role).toHaveProperty('role');
      expect(role).toHaveProperty('capacity');
      expect(role).toHaveProperty('utilized');
      expect(role).toHaveProperty('available');
      expect(role).toHaveProperty('people_count');
      expect(role).toHaveProperty('status');
      
      // Numeric fields should be numbers
      expect(typeof role.capacity).toBe('number');
      expect(typeof role.utilized).toBe('number');
      expect(typeof role.available).toBe('number');
      expect(typeof role.people_count).toBe('number');
    }
  });

  test(`${tags.api} availability percentages are not all zero`, async ({ 
    apiContext 
  }) => {
    const response = await apiContext.get('/api/reporting/capacity');
    const data = await response.json();
    
    if (data.utilizationData.length > 0) {
      // At least one person should have non-zero availability
      const peopleWithAvailability = data.utilizationData.filter((p: any) => 
        p.default_availability_percentage > 0
      );
      
      expect(peopleWithAvailability.length).toBeGreaterThan(0);
    }
  });

  test(`${tags.api} calculations are consistent`, async ({ 
    apiContext 
  }) => {
    const response = await apiContext.get('/api/reporting/capacity');
    const data = await response.json();
    
    // Find people with allocations
    const allocatedPeople = data.utilizationData.filter((p: any) => 
      p.total_allocation_percentage > 0
    );
    
    allocatedPeople.forEach((person: any) => {
      // Verify allocation hours calculation
      const expectedHours = (person.total_allocation_percentage / 100) * person.default_hours_per_day;
      expect(Math.abs(person.total_allocated_hours - expectedHours)).toBeLessThan(0.1);
      
      // Verify status based on allocation
      if (person.total_allocation_percentage >= 100) {
        expect(['FULLY_ALLOCATED', 'OVER_ALLOCATED']).toContain(person.allocation_status);
      } else if (person.total_allocation_percentage >= 80) {
        // 80% or more is considered fully allocated
        expect(person.allocation_status).toBe('FULLY_ALLOCATED');
      } else if (person.total_allocation_percentage > 0) {
        expect(person.allocation_status).toBe('PARTIALLY_ALLOCATED');
      }
    });
  });
});