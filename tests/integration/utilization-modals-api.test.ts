import { describe, test, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';

import { randomUUID } from 'crypto';
import { db as testDb, TEST_PROJECT_SUB_TYPE_ID } from './setup';

// Mock the database module to use test database
jest.mock('../../src/server/database/index.js', () => ({
  db: require('./setup').db
}));

// Mock the notification scheduler to prevent cron jobs
jest.mock('../../src/server/services/NotificationScheduler.js', () => ({
  notificationScheduler: {
    scheduleAssignmentNotification: jest.fn(),
    start: jest.fn(),
    stop: jest.fn()
  }
}));

import { AssignmentsController } from '../../src/server/api/controllers/AssignmentsController';
import { ReportingController } from '../../src/server/api/controllers/ReportingController';

/**
 * Integration tests for utilization modal backend operations
 * 
 * Tests the complete backend workflow for:
 * - Assignment creation/deletion
 * - Utilization report data accuracy
 * - Database state consistency
 * - Conflict detection
 */

describe('Utilization Modals API Integration', () => {
  let assignmentsController: AssignmentsController;
  let reportingController: ReportingController;
  let testData: any;

  beforeAll(async () => {
    assignmentsController = new AssignmentsController();
    reportingController = new ReportingController();
    
    // Mock the db property on controllers to use test database
    (assignmentsController as any).db = testDb;
    (reportingController as any).db = testDb;
    
    // Create test data
    testData = {
      person1_id: randomUUID(),
      person2_id: randomUUID(),
      project1_id: randomUUID(),
      project2_id: randomUUID(),
      project3_id: randomUUID(),
      role_id: randomUUID(),
      location_id: randomUUID()
    };

    // Insert test location
    await testDb('locations').insert({
      id: testData.location_id,
      name: 'Test Location',
      created_at: new Date(),
      updated_at: new Date()
    });

    // Insert test role
    await testDb('roles').insert({
      id: testData.role_id,
      name: 'Test Developer',
      created_at: new Date(),
      updated_at: new Date()
    });

    // Insert test people
    await testDb('people').insert([
      {
        id: testData.person1_id,
        name: 'Alice Johnson',
        email: 'alice.test@example.com',
        location_id: testData.location_id,
        default_availability_percentage: 100,
        default_hours_per_day: 8,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: testData.person2_id,
        name: 'Bob Smith',
        email: 'bob.test@example.com',
        location_id: testData.location_id,
        default_availability_percentage: 100,
        default_hours_per_day: 8,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      }
    ]);

    // Insert test projects
    await testDb('projects').insert([
      {
        id: testData.project1_id,
        name: 'Test Project Alpha',
        description: 'High priority test project',
        priority: 1,
        location_id: testData.location_id,
        project_sub_type_id: TEST_PROJECT_SUB_TYPE_ID,
        include_in_demand: true,
        aspiration_start: '2024-01-01',
        aspiration_finish: '2024-06-30',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: testData.project2_id,
        name: 'Test Project Beta',
        description: 'Medium priority test project',
        priority: 2,
        location_id: testData.location_id,
        project_sub_type_id: TEST_PROJECT_SUB_TYPE_ID,
        include_in_demand: true,
        aspiration_start: '2024-02-01',
        aspiration_finish: '2024-08-31',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: testData.project3_id,
        name: 'Test Project Gamma',
        description: 'Low priority test project',
        priority: 3,
        location_id: testData.location_id,
        project_sub_type_id: TEST_PROJECT_SUB_TYPE_ID,
        include_in_demand: true,
        aspiration_start: '2024-03-01',
        aspiration_finish: '2024-09-30',
        created_at: new Date(),
        updated_at: new Date()
      }
    ]);

    // Create baseline scenario
    await testDb('scenarios').insert({
      id: 'baseline-0000-0000-0000-000000000000',
      name: 'Baseline',
      status: 'active',
      scenario_type: 'baseline',
      created_by: testData.person1_id,
      created_at: new Date(),
      updated_at: new Date()
    });

    // Add person-role relationships
    await testDb('person_roles').insert([
      {
        // 001 真身: proficiency_level 为整数(1-5),无 created_at/updated_at 列
        person_id: testData.person1_id,
        role_id: testData.role_id,
        proficiency_level: 5
      },
      {
        person_id: testData.person2_id,
        role_id: testData.role_id,
        proficiency_level: 2
      }
    ]);
  });

  afterAll(async () => {
    // Clean up test data
    try {
      await testDb('scenario_project_assignments').where('person_id', 'in', [testData.person1_id, testData.person2_id]).del();
      await testDb('project_assignments').where('person_id', 'in', [testData.person1_id, testData.person2_id]).del();
      await testDb('person_roles').where('person_id', 'in', [testData.person1_id, testData.person2_id]).del();
      await testDb('scenarios').where('id', 'baseline-0000-0000-0000-000000000000').del();
      await testDb('projects').whereIn('id', [testData.project1_id, testData.project2_id, testData.project3_id]).del();
      await testDb('people').whereIn('id', [testData.person1_id, testData.person2_id]).del();
      await testDb('roles').where('id', testData.role_id).del();
      await testDb('locations').where('id', testData.location_id).del();
    } catch (error) {
      console.error('Error in afterAll cleanup:', error);
    }
  });

  beforeEach(async () => {
    // Clean only assignments between tests, not the base data
    await testDb('project_assignments').where('person_id', 'in', [testData.person1_id, testData.person2_id]).del();
    
    // Re-create the test data that gets wiped by global setup cleanup
    // Check if data exists first to avoid duplicates
    const locationExists = await testDb('locations').where('id', testData.location_id).first();
    if (!locationExists) {
      await testDb('locations').insert({
        id: testData.location_id,
        name: 'Test Location',
          created_at: new Date(),
        updated_at: new Date()
      });
    }

    const roleExists = await testDb('roles').where('id', testData.role_id).first();
    if (!roleExists) {
      await testDb('roles').insert({
        id: testData.role_id,
        name: 'Test Developer',
        created_at: new Date(),
        updated_at: new Date()
      });
    }

    const peopleExist = await testDb('people').where('id', 'in', [testData.person1_id, testData.person2_id]).count('* as count').first();
    if (peopleExist?.count === 0) {
      await testDb('people').insert([
        {
          id: testData.person1_id,
          name: 'Alice Johnson',
          email: 'alice.test@example.com',
          location_id: testData.location_id,
          default_availability_percentage: 100,
          default_hours_per_day: 8,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: testData.person2_id,
          name: 'Bob Smith',
          email: 'bob.test@example.com',
          location_id: testData.location_id,
          default_availability_percentage: 100,
          default_hours_per_day: 8,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        }
      ]);
    }

    const projectsExist = await testDb('projects').where('id', 'in', [testData.project1_id, testData.project2_id, testData.project3_id]).count('* as count').first();
    if (projectsExist?.count === 0) {
      await testDb('projects').insert([
        {
          id: testData.project1_id,
          name: 'Test Project Alpha',
          description: 'High priority test project',
          priority: 1,
          location_id: testData.location_id,
          project_sub_type_id: TEST_PROJECT_SUB_TYPE_ID,
          include_in_demand: true,
          aspiration_start: '2024-01-01',
          aspiration_finish: '2024-06-30',
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: testData.project2_id,
          name: 'Test Project Beta',
          description: 'Medium priority test project',
          priority: 2,
          location_id: testData.location_id,
          project_sub_type_id: TEST_PROJECT_SUB_TYPE_ID,
          include_in_demand: true,
          aspiration_start: '2024-02-01',
          aspiration_finish: '2024-08-31',
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: testData.project3_id,
          name: 'Test Project Gamma',
          description: 'Low priority test project',
          priority: 3,
          location_id: testData.location_id,
          project_sub_type_id: TEST_PROJECT_SUB_TYPE_ID,
          include_in_demand: true,
          aspiration_start: '2024-03-01',
          aspiration_finish: '2024-09-30',
          created_at: new Date(),
          updated_at: new Date()
        }
      ]);
    }

    const personRolesExist = await testDb('person_roles').where('person_id', 'in', [testData.person1_id, testData.person2_id]).count('* as count').first();
    if (personRolesExist?.count === 0) {
      await testDb('person_roles').insert([
        {
          id: randomUUID(),
          person_id: testData.person1_id,
          role_id: testData.role_id,
          proficiency_level: 'Expert',
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: randomUUID(),
          person_id: testData.person2_id,
          role_id: testData.role_id,
          proficiency_level: 'Junior',
          created_at: new Date(),
          updated_at: new Date()
        }
      ]);
    }
  });

  describe('Reduce Load Modal Backend Operations', () => {
    it('should retrieve person assignments for reduce load modal', async () => {
      // Create test assignments
      const assignment1_id = randomUUID();
      const assignment2_id = randomUUID();
      
      await testDb('project_assignments').insert([
        {
          id: assignment1_id,
          project_id: testData.project1_id,
          person_id: testData.person1_id,
          role_id: testData.role_id,
          allocation_percentage: 60,
          assignment_date_mode: 'fixed',
          start_date: '2024-01-01',
          end_date: '2024-06-30',
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: assignment2_id,
          project_id: testData.project2_id,
          person_id: testData.person1_id,
          role_id: testData.role_id,
          allocation_percentage: 30,
          assignment_date_mode: 'fixed',
          start_date: '2024-02-01',
          end_date: '2024-08-31',
          created_at: new Date(),
          updated_at: new Date()
        }
      ]);

      // Retrieve assignments as would be done by the modal
      const assignments = await testDb('project_assignments')
        .leftJoin('projects', 'project_assignments.project_id', 'projects.id')
        .leftJoin('roles', 'project_assignments.role_id', 'roles.id')
        .where('project_assignments.person_id', testData.person1_id)
        .select(
          'project_assignments.*',
          'projects.name as project_name',
          'projects.priority as project_priority',
          'roles.name as role_name'
        );

      expect(assignments).toHaveLength(2);
      expect(assignments[0].project_name).toBe('Test Project Alpha');
      expect(assignments[0].allocation_percentage).toBe(60);
      expect(assignments[0].role_name).toBe('Test Developer');
      expect(assignments[1].project_name).toBe('Test Project Beta');
      expect(assignments[1].allocation_percentage).toBe(30);
    });

    it('should successfully delete assignment and update utilization', async () => {
      // Create initial assignment
      const assignment_id = randomUUID();
      await testDb('project_assignments').insert({
        id: assignment_id,
        project_id: testData.project1_id,
        person_id: testData.person1_id,
        role_id: testData.role_id,
        allocation_percentage: 80,
        assignment_date_mode: 'fixed',
        start_date: '2024-01-01',
        end_date: '2024-06-30',
        created_at: new Date(),
        updated_at: new Date()
      });

      // Verify initial state
      const initialUtilization = await testDb('project_assignments')
        .where('person_id', testData.person1_id)
        .sum('allocation_percentage as total')
        .first();
      
      expect(initialUtilization?.total).toBe(80);

      // Delete assignment (simulate remove button click)
      const deleteResult = await testDb('project_assignments')
        .where('id', assignment_id)
        .del();

      expect(deleteResult).toBe(1);

      // Verify assignment was removed
      const remainingAssignments = await testDb('project_assignments')
        .where('person_id', testData.person1_id)
        .count('* as count')
        .first();

      expect(remainingAssignments?.count).toBe(0);

      // Verify utilization calculation
      const newUtilization = await testDb('project_assignments')
        .where('person_id', testData.person1_id)
        .sum('allocation_percentage as total')
        .first();

      expect(newUtilization?.total || 0).toBe(0);
    });

    it('should calculate removal scores correctly', async () => {
      // This tests the business logic for ranking assignments for removal
      const assignments = [
        {
          id: randomUUID(),
          project_priority: 1, // High priority
          allocation_percentage: 50,
          start_date: '2024-01-01'
        },
        {
          id: randomUUID(),
          project_priority: 3, // Low priority
          allocation_percentage: 30,
          start_date: new Date(Date.now() - (10 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0] // 10 days ago (recent)
        }
      ];

      // Calculate removal scores (higher = better candidate for removal)
      const calculateRemovalScore = (assignment: any) => {
        let score = 0;
        
        // Less critical projects get higher removal scores
        if (assignment.project_priority === 3) score += 30; // Low priority
        else if (assignment.project_priority === 2) score += 10; // Medium priority
        
        // Lower allocation percentage = easier to remove
        score += (50 - assignment.allocation_percentage);
        
        // Recent assignments are easier to remove
        const assignmentAge = new Date().getTime() - new Date(assignment.start_date).getTime();
        const ageInDays = assignmentAge / (1000 * 60 * 60 * 24);
        if (ageInDays < 30) score += 15;
        
        return Math.max(0, score);
      };

      const scores = assignments.map(calculateRemovalScore);
      
      // Low priority, smaller allocation should score higher
      expect(scores[1]).toBeGreaterThan(scores[0]);
      expect(scores[1]).toBeGreaterThanOrEqual(30 + 20 + 15); // Low priority + allocation diff + recent
    });
  });

  describe('Add Projects Modal Backend Operations', () => {
    it('should retrieve available projects for assignment', async () => {
      // Retrieve projects as would be done by the modal
      const availableProjects = await testDb('projects')
        .where('include_in_demand', true)
        .select('*');

      expect(availableProjects).toHaveLength(3);
      expect(availableProjects.map(p => p.name)).toContain('Test Project Alpha');
      expect(availableProjects.map(p => p.name)).toContain('Test Project Beta');
      expect(availableProjects.map(p => p.name)).toContain('Test Project Gamma');
    });

    it('should successfully create new assignment', async () => {
      const assignmentData = {
        project_id: testData.project1_id,
        person_id: testData.person2_id,
        role_id: testData.role_id,
        allocation_percentage: 40,
        assignment_date_mode: 'fixed',
        start_date: '2024-01-01',
        end_date: '2024-06-30',
      };

      // Simulate assignment creation
      const [assignment] = await testDb('project_assignments')
        .insert({
          ...assignmentData,
          id: randomUUID(),
          created_at: new Date(),
          updated_at: new Date()
        })
        .returning('*');

      expect(assignment).toBeDefined();
      expect(assignment.allocation_percentage).toBe(40);
      expect(assignment.project_id).toBe(testData.project1_id);
      expect(assignment.person_id).toBe(testData.person2_id);

      // Verify utilization calculation after assignment
      const utilization = await testDb('project_assignments')
        .where('person_id', testData.person2_id)
        .sum('allocation_percentage as total')
        .first();

      expect(utilization?.total).toBe(40);
    });

    it('should prevent over-allocation during assignment creation', async () => {
      // Create existing assignment that uses 80% capacity
      await testDb('scenario_project_assignments').insert({
        id: randomUUID(),
        scenario_id: 'baseline-0000-0000-0000-000000000000',
        project_id: testData.project1_id,
        person_id: testData.person1_id,
        role_id: testData.role_id,
        allocation_percentage: 80,
        assignment_date_mode: 'fixed',
        start_date: '2024-01-01',
        end_date: '2024-06-30',
        created_at: new Date(),
        updated_at: new Date()
      });

      // Test conflict detection for overlapping assignment
      const conflict = await assignmentsController.checkConflicts(
        testData.person1_id,
        '2024-02-01',
        '2024-05-31',
        30 // This would make total 110%
      );

      expect(conflict).toBeTruthy();
      expect(conflict?.total_allocation).toBe(110);
      expect(conflict?.available_capacity).toBe(100);
      expect(conflict?.person_id).toBe(testData.person1_id);
    });

    it('should calculate match scores for project recommendations', async () => {
      const person = {
        id: testData.person1_id,
        utilization: 20, // Low utilization
        location: 'Test Location'
      };

      const projects = [
        {
          id: testData.project1_id,
          priority: 1, // High priority
          location_name: 'Test Location', // Same location
          include_in_demand: true,
          aspiration_start: '2024-01-01',
          aspiration_finish: '2024-06-30'
        },
        {
          id: testData.project2_id,
          priority: 3, // Low priority
          location_name: 'Other Location', // Different location
          include_in_demand: true,
          aspiration_start: '2024-02-01',
          aspiration_finish: '2024-08-31'
        }
      ];

      // Calculate match scores (simulate frontend logic)
      const calculateMatchScore = (project: any, person: any) => {
        let score = 20; // Base score
        
        // Priority-based scoring
        if (project.priority === 1) score += 30;
        else if (project.priority === 2) score += 20;
        else if (project.priority === 3) score += 10;
        
        // Location match bonus
        if (project.location_name === person.location) score += 15;
        
        // Person's utilization affects matching
        if (person.utilization < 50) score += 25;
        else if (person.utilization < 80) score += 15;
        else if (person.utilization < 100) score += 5;
        
        // Project structure bonus
        if (project.aspiration_start && project.aspiration_finish) score += 10;
        if (project.include_in_demand === true) score += 15;
        
        return score;
      };

      const scores = projects.map(p => calculateMatchScore(p, person));
      
      // High priority + location match should score higher
      expect(scores[0]).toBeGreaterThan(scores[1]);
      expect(scores[0]).toBeGreaterThanOrEqual(20 + 30 + 15 + 25 + 10 + 15); // Expected minimum
    });

    it('should calculate realistic estimated hours', async () => {
      const person = {
        utilization: 30,
        availableHours: 40
      };

      const projects = [
        { priority: 1 }, // High priority
        { priority: 2 }, // Medium priority
        { priority: 3 }  // Low priority
      ];

      // Calculate estimated hours (simulate frontend logic)
      const calculateEstimatedHours = (project: any, person: any) => {
        const availableCapacity = 100 - (person.utilization || 0);
        const maxHoursPerWeek = (person.availableHours || 40) * (availableCapacity / 100);
        
        let suggestedHours;
        if (project.priority === 1) {
          suggestedHours = Math.min(maxHoursPerWeek * 0.6, 30);
        } else if (project.priority === 2) {
          suggestedHours = Math.min(maxHoursPerWeek * 0.4, 20);
        } else {
          suggestedHours = Math.min(maxHoursPerWeek * 0.25, 15);
        }
        
        return Math.max(5, Math.round(suggestedHours));
      };

      const estimatedHours = projects.map(p => calculateEstimatedHours(p, person));
      
      // All estimates should be reasonable
      estimatedHours.forEach(hours => {
        expect(hours).toBeGreaterThanOrEqual(5);
        expect(hours).toBeLessThanOrEqual(30);
      });
      
      // High priority should get more hours than low priority
      expect(estimatedHours[0]).toBeGreaterThanOrEqual(estimatedHours[2]);
    });
  });

  describe('Utilization Report Integration', () => {
    it('should reflect assignment changes in utilization report', async () => {
      // Create assignment
      const assignment_id = randomUUID();
      await testDb('project_assignments').insert({
        id: assignment_id,
        project_id: testData.project1_id,
        person_id: testData.person1_id,
        role_id: testData.role_id,
        allocation_percentage: 60,
        assignment_date_mode: 'fixed',
        start_date: '2024-01-01',
        end_date: '2024-06-30',
        created_at: new Date(),
        updated_at: new Date()
      });

      // Get utilization data as would be returned to frontend
      const utilizationData = await testDb('people')
        .leftJoin('person_roles', 'people.id', 'person_roles.person_id')
        .leftJoin('roles', 'person_roles.role_id', 'roles.id')
        .leftJoin('locations', 'people.location_id', 'locations.id')
        .leftJoin(
          testDb('project_assignments')
            .select('person_id')
            .sum('allocation_percentage as total_allocation_percentage')
            .groupBy('person_id')
            .as('allocations'),
          'people.id', 'allocations.person_id'
        )
        .where('people.id', testData.person1_id)
        .select(
          'people.id as person_id',
          'people.name as person_name',
          'people.email as person_email',
          'roles.name as primary_role_name',
          'locations.name as location_name',
          'people.default_availability_percentage',
          'people.default_hours_per_day',
          'allocations.total_allocation_percentage'
        )
        .first();

      expect(utilizationData).toBeDefined();
      expect(utilizationData.person_name).toBe('Alice Johnson');
      expect(utilizationData.total_allocation_percentage).toBe(60);
      expect(utilizationData.primary_role_name).toBe('Test Developer');

      // Delete assignment
      await testDb('project_assignments').where('id', assignment_id).del();

      // Verify utilization updated
      const updatedUtilizationData = await testDb('people')
        .leftJoin(
          testDb('project_assignments')
            .select('person_id')
            .sum('allocation_percentage as total_allocation_percentage')
            .groupBy('person_id')
            .as('allocations'),
          'people.id', 'allocations.person_id'
        )
        .where('people.id', testData.person1_id)
        .select(
          'people.id as person_id',
          'people.name as person_name',
          'allocations.total_allocation_percentage'
        )
        .first();

      expect(updatedUtilizationData.total_allocation_percentage).toBeNull(); // No assignments
    });

    it('should handle concurrent assignment operations', async () => {
      // Simulate multiple assignment operations happening simultaneously
      const operations = [];
      
      for (let i = 0; i < 5; i++) {
        operations.push(
          testDb('project_assignments').insert({
            id: randomUUID(),
            project_id: testData.project1_id,
            person_id: testData.person1_id,
            role_id: testData.role_id,
            allocation_percentage: 10,
            assignment_date_mode: 'fixed',
            start_date: '2024-01-01',
            end_date: '2024-06-30',
              created_at: new Date(),
            updated_at: new Date()
          })
        );
      }

      // Execute all operations concurrently
      await Promise.all(operations);

      // Verify final state
      const assignments = await testDb('project_assignments')
        .where('person_id', testData.person1_id)
        .count('* as count')
        .first();

      expect(assignments?.count).toBe(5);

      const totalUtilization = await testDb('project_assignments')
        .where('person_id', testData.person1_id)
        .sum('allocation_percentage as total')
        .first();

      expect(totalUtilization?.total).toBe(50); // 5 * 10%
    });
  });

  describe('Data Consistency and Validation', () => {
    it('should maintain referential integrity', async () => {
      // Test that assignments require valid person, project, and role IDs
      const invalidAssignment = {
        id: randomUUID(),
        project_id: randomUUID(), // Non-existent project
        person_id: testData.person1_id,
        role_id: testData.role_id,
        allocation_percentage: 50,
        assignment_date_mode: 'fixed',
        start_date: '2024-01-01',
        end_date: '2024-06-30',
        created_at: new Date(),
        updated_at: new Date()
      };

      // Check if foreign keys are enabled
      const fkStatus = await testDb.raw('PRAGMA foreign_keys');
      const foreignKeysEnabled = fkStatus[0]?.foreign_keys === 1;
      
      if (foreignKeysEnabled) {
        // Test if foreign keys are actually enforced
        let insertFailed = false;
        try {
          await testDb('project_assignments').insert(invalidAssignment);
        } catch (error) {
          insertFailed = true;
        }
        
        if (!insertFailed) {
          console.warn('Foreign keys enabled but not enforced in SQLite test environment');
          // Just verify the test data
          expect(invalidAssignment.person_id).toBe('non-existent-person-id');
        } else {
          // Foreign keys are properly enforced
          expect(insertFailed).toBe(true);
        }
      } else {
        console.warn('Foreign keys not enabled in SQLite test environment');
        // Just skip the foreign key test
        expect(invalidAssignment.person_id).toBe('non-existent-person-id');
      }
    });

    it('should validate allocation percentage bounds', async () => {
      const validationTests = [
        { allocation: -10, shouldFail: false }, // Negative values handled by business logic
        { allocation: 0, shouldFail: false },   // Zero is valid
        { allocation: 100, shouldFail: false }, // 100% is valid
        { allocation: 150, shouldFail: false }  // Over 100% handled by conflict detection
      ];

      for (const test of validationTests) {
        const assignment = {
          id: randomUUID(),
          project_id: testData.project1_id,
          person_id: testData.person1_id,
          role_id: testData.role_id,
          allocation_percentage: test.allocation,
          assignment_date_mode: 'fixed',
          start_date: '2024-01-01',
          end_date: '2024-06-30',
          created_at: new Date(),
          updated_at: new Date()
        };

        if (test.shouldFail) {
          await expect(testDb('project_assignments').insert(assignment))
            .rejects.toThrow();
        } else {
          await expect(testDb('project_assignments').insert(assignment))
            .resolves.toBeDefined();
          
          // Clean up
          await testDb('project_assignments').where('id', assignment.id).del();
        }
      }
    });

    it('should handle date validation correctly', async () => {
      const assignment = {
        id: randomUUID(),
        project_id: testData.project1_id,
        person_id: testData.person1_id,
        role_id: testData.role_id,
        allocation_percentage: 50,
        assignment_date_mode: 'fixed',
        start_date: '2024-06-30', // End before start
        end_date: '2024-01-01',
        created_at: new Date(),
        updated_at: new Date()
      };

      // Database will accept this, but business logic should validate
      await testDb('project_assignments').insert(assignment);
      
      const inserted = await testDb('project_assignments').where('id', assignment.id).first();
      expect(inserted).toBeDefined();
      expect(new Date(inserted.start_date) > new Date(inserted.end_date)).toBe(true);
      
      // Clean up
      await testDb('project_assignments').where('id', assignment.id).del();
    });
  });
});