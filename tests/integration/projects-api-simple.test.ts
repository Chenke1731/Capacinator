import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { db } from './setup';
import { v4 as uuidv4 } from 'uuid';

describe('Projects API Integration Tests - Simple', () => {
  let testProjectId: string;
  
  afterEach(async () => {
    // Clean up test projects
    if (testProjectId) {
      await db('project_phases_timeline').where('project_id', testProjectId).del();
      await db('project_assignments').where('project_id', testProjectId).del();
      await db('projects').where('id', testProjectId).del();
    }
    
    // Clean up any other test projects
    await db('projects').where('name', 'like', 'Test Project%').del();
    
    // Clean up test phases
    await db('project_phases').where('name', 'like', '%Test%').del();
  });

  describe('Projects Table Basic Operations', () => {
    test('should create a new project', async () => {
      testProjectId = uuidv4();
      const projectData = {
        id: testProjectId,
        name: 'Test Project Integration',
        priority: 1,
        include_in_demand: 1, // SQLite stores boolean as integer
        description: 'A test project for integration testing',
        created_at: new Date(),
        updated_at: new Date()
      };

      await db('projects').insert(projectData);
      
      const created = await db('projects').where('id', testProjectId).first();
      expect(created).toBeDefined();
      expect(created.name).toBe('Test Project Integration');
      expect(created.priority).toBe(1);
      expect(created.include_in_demand).toBe(1); // SQLite stores boolean as integer
    });

    test('should update a project', async () => {
      // Create project first
      testProjectId = uuidv4();
      await db('projects').insert({
        id: testProjectId,
        name: 'Original Name',
        created_at: new Date(),
        updated_at: new Date()
      });

      // Update it
      await db('projects')
        .where('id', testProjectId)
        .update({
          name: 'Updated Name',
          priority: 2,
          updated_at: new Date()
        });

      const updated = await db('projects').where('id', testProjectId).first();
      expect(updated.name).toBe('Updated Name');
      expect(updated.priority).toBe(2);
    });

    test('should retrieve project with related data', async () => {
      // Create project
      testProjectId = uuidv4();
      await db('projects').insert({
        id: testProjectId,
        name: 'Project with Phases',
        created_at: new Date(),
        updated_at: new Date()
      });

      // Create phase in master table
      const phaseId = uuidv4();
      await db('project_phases').insert({
        id: phaseId,
        name: 'Design Phase',
        order_index: 1,
        created_at: new Date(),
        updated_at: new Date()
      });
      
      // Create phase timeline for project
      await db('project_phases_timeline').insert({
        id: uuidv4(),
        project_id: testProjectId,
        phase_id: phaseId,
        start_date: '2024-01-01',
        end_date: '2024-03-31',
        created_at: new Date(),
        updated_at: new Date()
      });

      // Query project with phases
      const project = await db('projects')
        .where('projects.id', testProjectId)
        .first();
      
      const phases = await db('project_phases_timeline as ppt')
        .join('project_phases as ph', 'ppt.phase_id', 'ph.id')
        .where('ppt.project_id', testProjectId)
        .select('ph.name', 'ppt.start_date', 'ppt.end_date')
        .orderBy('ppt.start_date');

      expect(project).toBeDefined();
      expect(project.name).toBe('Project with Phases');
      expect(phases).toHaveLength(1);
      expect(phases[0].name).toBe('Design Phase');
    });

    test('should delete project', async () => {
      // Create project
      testProjectId = uuidv4();
      await db('projects').insert({
        id: testProjectId,
        name: 'Project to Delete',
        created_at: new Date(),
        updated_at: new Date()
      });

      // Delete project
      const deleteCount = await db('projects').where('id', testProjectId).del();
      expect(deleteCount).toBe(1);

      // Verify project is deleted
      const deletedProject = await db('projects').where('id', testProjectId).first();
      expect(deletedProject).toBeUndefined();
    });
  });

  describe('Complex Project Queries', () => {
    test('should calculate project metrics', async () => {
      // Create multiple projects
      const projectIds = [];
      for (let i = 0; i < 3; i++) {
        const id = uuidv4();
        projectIds.push(id);
        await db('projects').insert({
          id,
          name: `Metric Project ${i}`,
          priority: i === 0 ? 1 : 2,
          aspiration_start: '2026-01-01',
          created_at: new Date(),
          updated_at: new Date()
        });
      }

      // Query aggregate metrics(budget/status 系手写库杜撰列已删——2026-10-13
      // 漂移守卫;聚合改用真实列 priority/aspiration_start)
      const metrics = await db('projects')
        .select(
          db.raw('COUNT(*) as total_projects'),
          db.raw('SUM(priority) as total_priority'),
          db.raw('COUNT(CASE WHEN priority = 1 THEN 1 END) as p1_projects'),
          db.raw("COUNT(CASE WHEN aspiration_start = '2026-01-01' THEN 1 END) as dated_projects")
        )
        .first();

      expect(parseInt(metrics.total_projects, 10)).toBeGreaterThanOrEqual(3);
      expect(parseInt(metrics.total_priority, 10)).toBeGreaterThanOrEqual(5);
      expect(parseInt(metrics.p1_projects, 10)).toBeGreaterThanOrEqual(1);
      expect(parseInt(metrics.dated_projects, 10)).toBeGreaterThanOrEqual(3);

      // Cleanup
      for (const id of projectIds) {
        await db('projects').where('id', id).del();
      }
    });
  });
});