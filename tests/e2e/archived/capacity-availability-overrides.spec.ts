/**
 * Capacity Report Availability Override Tests
 * Ensures capacity calculations correctly account for vacations, training, etc.
 */
import { test, expect, tags } from '../../fixtures';

test.describe('Capacity Report with Availability Overrides', () => {
  test(`${tags.reports} should reduce capacity when person has availability override`, async ({ 
    apiContext,
    testDataHelpers
  }) => {
    const testContext = testDataHelpers.createTestContext('capacity-override');
    
    // Create two people with same default availability
    const person1 = await testDataHelpers.createPerson(testContext, {
      name: 'Full Capacity Person',
      default_hours_per_day: 8,
      default_availability_percentage: 100
    });
    
    const person2 = await testDataHelpers.createPerson(testContext, {
      name: 'Reduced Capacity Person',
      default_hours_per_day: 8,
      default_availability_percentage: 100
    });
    
    // Create availability override for person2 (50% availability due to training)
    await apiContext.post('/api/availability', {
      data: {
        person_id: person2.id,
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        availability_percentage: 50,
        hours_per_day: 4,
        override_type: 'TRAINING',
        reason: 'Cloud certification training',
        is_approved: true
      }
    });
    
    try {
      // Get capacity report
      const response = await apiContext.get('/api/reporting/capacity');
      const data = await response.json();
      
      // Find our test people
      const fullCapacityPerson = data.utilizationData.find((p: any) => p.person_id === person1.id);
      const reducedCapacityPerson = data.utilizationData.find((p: any) => p.person_id === person2.id);
      
      expect(fullCapacityPerson).toBeDefined();
      expect(reducedCapacityPerson).toBeDefined();
      
      // Person 1 should have full capacity
      expect(fullCapacityPerson.default_availability_percentage).toBe(100);
      expect(fullCapacityPerson.available_hours).toBe(8);
      
      // Person 2 should have reduced capacity due to training
      expect(reducedCapacityPerson.default_availability_percentage).toBe(50);
      expect(reducedCapacityPerson.available_hours).toBe(4);
      expect(reducedCapacityPerson.availability_reason).toBe('Cloud certification training');
    } finally {
      await testDataHelpers.cleanupTestContext(testContext);
    }
  });

  test(`${tags.reports} should show zero capacity for person on vacation`, async ({ 
    apiContext,
    testDataHelpers
  }) => {
    const testContext = testDataHelpers.createTestContext('capacity-vacation');
    
    const person = await testDataHelpers.createPerson(testContext, {
      name: 'Vacationing Person',
      default_hours_per_day: 8,
      default_availability_percentage: 100
    });
    
    // Create vacation override
    await apiContext.post('/api/availability', {
      data: {
        person_id: person.id,
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        availability_percentage: 0,
        hours_per_day: 0,
        override_type: 'VACATION',
        reason: 'Annual leave',
        is_approved: true
      }
    });
    
    try {
      const response = await apiContext.get('/api/reporting/capacity');
      const data = await response.json();
      
      const vacationingPerson = data.utilizationData.find((p: any) => p.person_id === person.id);
      
      expect(vacationingPerson).toBeDefined();
      expect(vacationingPerson.default_availability_percentage).toBe(0);
      expect(vacationingPerson.available_hours).toBe(0);
      expect(vacationingPerson.utilization_status).toBe('Unavailable');
    } finally {
      await testDataHelpers.cleanupTestContext(testContext);
    }
  });

  test(`${tags.reports} role capacity should reflect availability overrides`, async ({ 
    apiContext,
    testDataHelpers
  }) => {
    const testContext = testDataHelpers.createTestContext('role-capacity');
    
    // Get a specific role
    const rolesResponse = await apiContext.get('/api/roles');
    const roles = await rolesResponse.json();
    const devRole = roles.find((r: any) => r.name === 'Software Developer') || roles[0];
    
    // Create 3 developers
    const devs = await Promise.all([
      testDataHelpers.createPerson(testContext, {
        name: 'Dev 1 - Full Time',
        primary_role_id: devRole.id,
        default_hours_per_day: 8,
        default_availability_percentage: 100
      }),
      testDataHelpers.createPerson(testContext, {
        name: 'Dev 2 - Full Time',
        primary_role_id: devRole.id,
        default_hours_per_day: 8,
        default_availability_percentage: 100
      }),
      testDataHelpers.createPerson(testContext, {
        name: 'Dev 3 - Full Time',
        primary_role_id: devRole.id,
        default_hours_per_day: 8,
        default_availability_percentage: 100
      })
    ]);
    
    // Put one dev on vacation
    await apiContext.post('/api/availability', {
      data: {
        person_id: devs[1].id,
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        availability_percentage: 0,
        hours_per_day: 0,
        override_type: 'VACATION',
        reason: 'PTO',
        is_approved: true
      }
    });
    
    try {
      const beforeResponse = await apiContext.get('/api/reporting/capacity');
      const beforeData = await beforeResponse.json();
      
      // Find the role in byRole data
      const roleData = beforeData.byRole.find((r: any) => r.id === devRole.id);
      
      if (roleData) {
        // With one person on vacation, capacity should be reduced
        // Expected: 2 people * 8 hours = 16 hours (not 24)
        expect(roleData.capacity).toBeLessThan(24);
        
        // Check capacity gaps view too
        const gapData = beforeData.capacityGaps.find((g: any) => g.role_id === devRole.id);
        if (gapData) {
          expect(gapData.people_with_reduced_availability).toBeGreaterThanOrEqual(1);
        }
      }
    } finally {
      await testDataHelpers.cleanupTestContext(testContext);
    }
  });

  test(`${tags.reports} ${tags.api} availability override API endpoint`, async ({ 
    apiContext,
    testDataHelpers
  }) => {
    const testContext = testDataHelpers.createTestContext('availability-api');
    const person = await testDataHelpers.createPerson(testContext);
    
    try {
      // Test creating availability override
      const createResponse = await apiContext.post('/api/availability', {
        data: {
          person_id: person.id,
          start_date: new Date().toISOString().split('T')[0],
          end_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          availability_percentage: 20,
          hours_per_day: 1.6,
          override_type: 'TRAINING',
          reason: 'Leadership training',
          is_approved: true
        }
      });
      
      expect(createResponse.ok()).toBeTruthy();
      
      // Verify it appears in capacity report
      const capacityResponse = await apiContext.get('/api/reporting/capacity');
      const capacityData = await capacityResponse.json();
      
      const personData = capacityData.utilizationData.find((p: any) => p.person_id === person.id);
      expect(personData.default_availability_percentage).toBe(20);
      expect(personData.availability_reason).toBe('Leadership training');
    } finally {
      await testDataHelpers.cleanupTestContext(testContext);
    }
  });
});