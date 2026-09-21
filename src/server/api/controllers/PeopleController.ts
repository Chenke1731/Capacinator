import type { Request, Response } from 'express';
import type { Knex } from 'knex';
import { BaseController } from './BaseController.js';
import { ServiceContainer } from '../../services/ServiceContainer.js';

export class PeopleController extends BaseController {
  constructor(container?: ServiceContainer) {
    super({ enableAudit: true }, { container });
  }
  async getAll(req: Request, res: Response) {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const filters = {
      primary_role_id: req.query.primary_role_id, // Still allow filtering by role_id for API compatibility
      supervisor_id: req.query.supervisor_id,
      worker_type: req.query.worker_type,
      location_id: req.query.location_id || req.query.location
    };

    const result = await this.executeAuditedQuery(req, async (db) => {
      let query = db('people')
        .leftJoin('people as supervisor', 'people.supervisor_id', 'supervisor.id')
        .leftJoin('person_roles as primary_person_role', 'people.primary_person_role_id', 'primary_person_role.id')
        .leftJoin('roles as primary_role', 'primary_person_role.role_id', 'primary_role.id')
        .leftJoin('locations', 'people.location_id', 'locations.id')
        .select(
          'people.*',
          'supervisor.name as supervisor_name',
          'primary_role.name as primary_role_name',
          'primary_person_role.proficiency_level as primary_role_proficiency_level',
          'locations.name as location_name'
        );

      // Apply filters manually to handle table prefixes correctly
      if (filters.primary_role_id) query = query.where('primary_role.id', filters.primary_role_id);
      if (filters.supervisor_id) query = query.where('people.supervisor_id', filters.supervisor_id);
      if (filters.worker_type) query = query.where('people.worker_type', filters.worker_type);
      if (filters.location_id) query = query.where('people.location_id', filters.location_id);
      query = this.paginate(query, page, limit);

      const people = await query;
      const total = await db('people').count('* as count').first();

      return {
        data: people,
        pagination: {
          page,
          limit,
          total: total?.count || 0,
          totalPages: Math.ceil((Number(total?.count) || 0) / limit)
        }
      };
    }, res, 'Failed to fetch people');

    if (result) {
      res.json(result);
    }
  }

  async getById(req: Request, res: Response) {
    const { id } = req.params;

    const result = await this.executeAuditedQuery(req, async (db) => {
      const person = await db('people')
        .leftJoin('people as supervisor', 'people.supervisor_id', 'supervisor.id')
        .leftJoin('person_roles as primary_person_role', 'people.primary_person_role_id', 'primary_person_role.id')
        .leftJoin('roles as primary_role', 'primary_person_role.role_id', 'primary_role.id')
        .leftJoin('locations', 'people.location_id', 'locations.id')
        .select(
          'people.*',
          'supervisor.name as supervisor_name',
          'primary_role.name as primary_role_name',
          'primary_person_role.proficiency_level as primary_role_proficiency_level',
          'locations.name as location_name'
        )
        .where('people.id', id)
        .first();

      if (!person) {
        this.handleNotFound(res, 'Person');
        return null;
      }

      // Get roles
      const roles = await db('person_roles')
        .join('roles', 'person_roles.role_id', 'roles.id')
        .select(
          'person_roles.*',
          'roles.name as role_name',
          'roles.description as role_description'
        )
        .where('person_roles.person_id', id);

      // Get current assignments — from assignments_view so rows created via
      // the API (scenario table) are included too; paused rows kept for
      // display (greyed in UI, out of capacity math); undated rows count as
      // ongoing
      const assignments = await db('assignments_view as av')
        .join('projects', 'av.project_id', 'projects.id')
        .join('roles', 'av.role_id', 'roles.id')
        .select(
          'av.*',
          'projects.name as project_name',
          'roles.name as role_name'
        )
        .where('av.person_id', id)
        .where((builder: any) => {
          builder
            .whereNull('av.computed_end_date')
            .orWhere('av.computed_end_date', '>=', new Date());
        })
        .orderBy('av.computed_start_date');

      // Get availability overrides
      const availabilityOverrides = await db('person_availability_overrides')
        .where('person_id', id)
        .orderBy('start_date', 'desc');

      return {
        ...person,
        roles,
        assignments,
        availabilityOverrides
      };
    }, res, 'Failed to fetch person');

    if (result) {
      res.json(result);
    }
  }

  async create(req: Request, res: Response) {
    const personData = req.body;

    // Filter out fields that don't exist in the people table (based on 002_fix_primary_role_foreign_key.ts)
    const validFields = [
      'name', 'email', 'primary_person_role_id', 'worker_type', 'supervisor_id',
      'default_availability_percentage', 'default_hours_per_day', 'location_id'
    ];
    
    const filteredData = Object.keys(personData)
      .filter(key => validFields.includes(key))
      .reduce((obj, key) => {
        obj[key] = personData[key];
        return obj;
      }, {} as any);

    const result = await this.executeAuditedQuery(req, async (db) => {
      await db('people')
        .insert({
          ...filteredData,
          created_at: new Date(),
          updated_at: new Date()
        });

      // Get the created record by ID (since SQLite doesn't support returning)
      const person = await db('people')
        .where(filteredData.email ? { email: filteredData.email } : { name: filteredData.name })
        .orderBy('created_at', 'desc')
        .first();

      return person;
    }, res, 'Failed to create person');

    if (result) {
      res.status(201).json(result);
    }
  }

  async update(req: Request, res: Response) {
    const { id } = req.params;
    const updateData = req.body;

    // Filter out fields that don't exist in the people table (based on 002_fix_primary_role_foreign_key.ts)
    const validFields = [
      'name', 'email', 'primary_person_role_id', 'worker_type', 'supervisor_id',
      'default_availability_percentage', 'default_hours_per_day', 'location_id'
    ];
    
    const filteredData = Object.keys(updateData)
      .filter(key => validFields.includes(key))
      .reduce((obj, key) => {
        let value = updateData[key];
        // Convert empty strings to null for foreign key fields to avoid constraint violations
        if ((key === 'supervisor_id' || key === 'primary_person_role_id' || key === 'location_id') && value === '') {
          value = null;
        }
        obj[key] = value;
        return obj;
      }, {} as any);

    const result = await this.executeAuditedQuery(req, async (db) => {
      const existingPerson = await db('people').where('id', id).first();
      
      if (!existingPerson) {
        this.handleNotFound(res, 'Person');
        return null;
      }

      await db('people')
        .where('id', id)
        .update({
          ...filteredData,
          updated_at: new Date()
        });

      // Get the updated record
      const person = await db('people').where('id', id).first();
      return person;
    }, res, 'Failed to update person');

    if (result) {
      res.json(result);
    }
  }

  async delete(req: Request, res: Response) {
    const { id } = req.params;

    const result = await this.executeAuditedQuery(req, async (db) => {
      const existingPerson = await db('people').where('id', id).first();
      
      if (!existingPerson) {
        this.handleNotFound(res, 'Person');
        return null;
      }

      await db('people')
        .where('id', id)
        .del();

      return { message: 'Person deleted successfully' };
    }, res, 'Failed to delete person');

    if (result) {
      res.json(result);
    }
  }

  async getUtilization(req: Request, res: Response) {
    const result = await this.executeAuditedQuery(req, async (db) => {
      const utilization = await db('person_utilization_view').select('*');
      return utilization;
    }, res, 'Failed to fetch person utilization data');

    if (result) {
      res.json(result);
    }
  }

  async getAvailability(req: Request, res: Response) {
    const result = await this.executeAuditedQuery(req, async (db) => {
      const availability = await db('person_availability_view').select('*');
      return availability;
    }, res, 'Failed to fetch person availability data');

    if (result) {
      res.json(result);
    }
  }

  async getPersonUtilizationTimeline(req: Request, res: Response) {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    const result = await this.executeAuditedQuery(req, async (db) => {
      // First check if person exists
      const person = await db('people')
        .where('id', id)
        .select('name', 'default_availability_percentage', 'default_hours_per_day')
        .first();

      if (!person) {
        this.handleNotFound(res, 'Person');
        return null;
      }

      // Get project assignments for this person with date filtering.
      // assignments_view unions base + active-scenario rows, exposes pause
      // status, and its computed_*_date columns are already COALESCE'd with
      // the raw dates. Paused rows must not consume the timeline.
      // (No db.raw() here: the audited-db wrapper misparses raw in select.)
      let assignmentsQuery = db('assignments_view as av')
        .join('projects', 'av.project_id', 'projects.id')
        .where('av.person_id', id)
        .where('av.status', 'active')
        .select(
          'av.allocation_percentage',
          'av.computed_start_date as start_date',
          'av.computed_end_date as end_date',
          'projects.name as project_name'
        );

      if (startDate) {
        assignmentsQuery = assignmentsQuery.whereRaw(
          '(av.computed_end_date IS NULL OR av.computed_end_date >= ?)',
          [startDate as string]
        );
      }
      if (endDate) {
        assignmentsQuery = assignmentsQuery.whereRaw(
          '(av.computed_start_date IS NULL OR av.computed_start_date <= ?)',
          [endDate as string]
        );
      }

      const assignments = await assignmentsQuery;

      // Create timeline data by month
      const timelineStart = new Date(startDate as string || '2023-01-01');
      const timelineEnd = new Date(endDate as string || '2026-12-31');
      const timeline: Array<{
        month: string;
        availability: number;
        utilization: number;
        over_allocated: boolean;
      }> = [];

      // Generate monthly data points
      const currentDate = new Date(timelineStart.getFullYear(), timelineStart.getMonth(), 1);
      
      while (currentDate <= timelineEnd) {
        const monthStart = new Date(currentDate);
        const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
        
        // Calculate utilization for this month
        let monthUtilization = 0;
        
        assignments.forEach((assignment: Record<string, any>) => {
          const assignStart = new Date(assignment.start_date);
          const assignEnd = new Date(assignment.end_date);

          // Check if assignment overlaps with this month
          if (assignStart <= monthEnd && assignEnd >= monthStart) {
            monthUtilization += assignment.allocation_percentage;
          }
        });

        timeline.push({
          month: currentDate.toISOString().substring(0, 7), // YYYY-MM format
          availability: person.default_availability_percentage,
          utilization: monthUtilization,
          over_allocated: monthUtilization > person.default_availability_percentage
        });

        // Move to next month
        currentDate.setMonth(currentDate.getMonth() + 1);
      }

      return {
        personName: person.name,
        defaultAvailability: person.default_availability_percentage,
        timeline: timeline.filter(item => item.utilization > 0 || 
          (timeline.some(t => t.utilization > 0) && 
           new Date(item.month) >= new Date(assignments[0]?.start_date || timelineStart) &&
           new Date(item.month) <= new Date(assignments[assignments.length - 1]?.end_date || timelineEnd)))
      };
    }, res, 'Failed to fetch person utilization timeline');

    if (result) {
      res.json(result);
    }
  }

  async addRole(req: Request, res: Response) {
    const { id } = req.params;
    const { role_id, proficiency_level = 3, is_primary = false } = req.body;

    // Validate proficiency level
    if (proficiency_level < 1 || proficiency_level > 5) {
      return res.status(400).json({ 
        error: 'Proficiency level must be between 1 (novice) and 5 (expert)' 
      });
    }

    const result = await this.executeQuery(async () => {
      return await this.db.transaction(async (trx: Knex.Transaction) => {
        // Check if person already has this role
        const existingPersonRole = await trx('person_roles')
          .where('person_id', id)
          .where('role_id', role_id)
          .first();

        if (existingPersonRole) {
          throw new Error('Person already has this role. Use PUT to update expertise level.');
        }

        // If setting as primary, remove primary flag from other roles
        if (is_primary) {
          await trx('person_roles')
            .where('person_id', id)
            .update({ is_primary: false });

        }

        // Insert the new person role
        const [insertedPersonRole] = await trx('person_roles')
          .insert({
            person_id: id,
            role_id,
            proficiency_level,
            is_primary
          })
          .returning('*');

        // If this is the primary role, update the people table reference
        if (is_primary) {
          await trx('people')
            .where('id', id)
            .update({ primary_person_role_id: insertedPersonRole.id });
        }

        // Return the created person role with role details
        const personRole = await trx('person_roles as pr')
          .join('roles as r', 'pr.role_id', 'r.id')
          .where('pr.id', insertedPersonRole.id)
          .select(
            'pr.id',
            'pr.person_id',
            'pr.role_id',
            'pr.proficiency_level',
            'pr.is_primary',
            'r.name as role_name',
            'r.description as role_description'
          )
          .first();

        return personRole;
      });
    }, res, 'Failed to add role to person');

    if (result) {
      res.status(201).json(result);
    }
  }

  async getRoles(req: Request, res: Response) {
    const { id } = req.params;

    const result = await this.executeQuery(async () => {
      const personRoles = await this.db('person_roles as pr')
        .join('roles as r', 'pr.role_id', 'r.id')
        .join('people as p', 'pr.person_id', 'p.id')
        .where('pr.person_id', id)
        .select(
          'pr.id',
          'pr.person_id',
          'pr.role_id',
          'pr.proficiency_level',
          'pr.is_primary',
          'r.name as role_name',
          'r.description as role_description',
          'p.name as person_name'
        )
        .orderBy('pr.is_primary', 'desc')
        .orderBy('pr.proficiency_level', 'desc');

      return personRoles;
    }, res, 'Failed to fetch person roles');

    if (result) {
      res.json({ data: result });
    }
  }

  async updateRole(req: Request, res: Response) {
    const { id, roleId } = req.params;
    const { proficiency_level, is_primary } = req.body;

    // Validate proficiency level if provided
    if (proficiency_level !== undefined && (proficiency_level < 1 || proficiency_level > 5)) {
      return res.status(400).json({ 
        error: 'Proficiency level must be between 1 (novice) and 5 (expert)' 
      });
    }

    const result = await this.executeQuery(async () => {
      // Check if person role exists
      const existingPersonRole = await this.db('person_roles')
        .where('person_id', id)
        .where('role_id', roleId)
        .first();

      if (!existingPersonRole) {
        throw new Error('Person role not found');
      }

      return await this.db.transaction(async (trx: Knex.Transaction) => {
        // If setting as primary, remove primary flag from other roles
        if (is_primary) {
          await trx('person_roles')
            .where('person_id', id)
            .update({ is_primary: false });
        }

        // Update the person role
        const updateData: any = {};
        if (proficiency_level !== undefined) updateData.proficiency_level = proficiency_level;
        if (is_primary !== undefined) updateData.is_primary = is_primary;

        await trx('person_roles')
          .where('person_id', id)
          .where('role_id', roleId)
          .update(updateData);

        // If setting as primary, update the primary_person_role_id in people table
        if (is_primary) {
          await trx('people')
            .where('id', id)
            .update({ primary_person_role_id: existingPersonRole.id });
        }

        // Return the updated person role with role details
        const updatedPersonRole = await trx('person_roles as pr')
          .join('roles as r', 'pr.role_id', 'r.id')
          .where('pr.person_id', id)
          .where('pr.role_id', roleId)
          .select(
            'pr.id',
            'pr.person_id',
            'pr.role_id',
            'pr.proficiency_level',
            'pr.is_primary',
            'r.name as role_name',
            'r.description as role_description'
          )
          .first();

        return updatedPersonRole;
      });
    }, res, 'Failed to update person role');

    if (result) {
      res.json({ data: result });
    }
  }

  async removeRole(req: Request, res: Response) {
    const { id, roleId } = req.params;

    const result = await this.executeQuery(async () => {
      const deletedCount = await this.db('person_roles')
        .where('person_id', id)
        .where('role_id', roleId)
        .del();

      if (deletedCount === 0) {
        this.handleNotFound(res, 'Person role assignment');
        return null;
      }

      return { message: 'Role removed from person successfully' };
    }, res, 'Failed to remove role from person');

    if (result) {
      res.json(result);
    }
  }

  async deleteTestData(req: Request, res: Response) {
    const result = await this.executeQuery(async () => {
      // Delete test people (ones with "Test_" in name)
      const deleted = await this.db('people')
        .where('name', 'like', 'Test_%')
        .del();

      return { message: `Deleted ${deleted} test people` };
    }, res, 'Failed to delete test data');

    if (result) {
      res.json(result);
    }
  }

  /**
   * GET /api/people/:id/github-activity
   * Get GitHub commit activity for a person
   *
   * Task T054 (Phase 7)
   */
  async getGitHubActivity(req: Request, res: Response) {
    const { id } = req.params;
    const personId = parseInt(id, 10);

    if (isNaN(personId)) {
      return this.handleValidationError(req, res, { id: 'Invalid person ID' });
    }

    const result = await this.executeQuery(async () => {
      // Get person with GitHub info
      const person = await this.db('people')
        .where({ id: personId })
        .first();

      if (!person) {
        this.handleNotFound(req, res, 'Person');
        return null;
      }

      // Check if person has GitHub username
      if (!person.github_username || !person.github_user_id) {
        return {
          person_id: personId,
          person_name: person.name,
          github_connected: false,
          activity: [],
          message: 'Person has no GitHub account connected',
        };
      }

      // Find active GitHub connection for this person
      const connection = await this.db('github_account_associations as gaa')
        .join('github_connections as gc', 'gaa.github_connection_id', 'gc.id')
        .where('gaa.person_id', personId)
        .where('gaa.active', true)
        .where('gc.status', 'active')
        .select('gc.*')
        .first();

      if (!connection) {
        return {
          person_id: personId,
          person_name: person.name,
          github_username: person.github_username,
          github_connected: false,
          activity: [],
          message: 'No active GitHub connection found for this person',
        };
      }

      // Import services
      const { getGitHubConnectionService } = await import('../../services/GitHubConnectionService.js');
      const { getEncryptionService } = await import('../../services/EncryptionService.js');
      const { default: GitHubApiService } = await import('../../services/GitHubApiService.js');

      const connectionService = getGitHubConnectionService();
      const encryptionService = getEncryptionService();

      // Refresh token if needed
      try {
        await connectionService.refreshTokenIfNeeded(connection.id);
      } catch {
        // Continue even if refresh fails - token might still be valid
        const { logger } = await import('../../services/logging/config.js');
        logger.warn('Token refresh failed, continuing with existing token', {
          connectionId: connection.id,
        });
      }

      // Decrypt access token
      const accessToken = encryptionService.decrypt(connection.encrypted_token);

      // Create GitHub API client with error handling
      const octokit = GitHubApiService.createClient({
        auth: accessToken,
        baseUrl: connection.github_base_url,
      });

      try {
        // Fetch recent events for the user (last 90 days)
        const activity = await GitHubApiService.withErrorHandling(async () => {
          const { data: events } = await octokit.activity.listEventsForAuthenticatedUser({
            username: person.github_username,
            per_page: 100,
          });

          // Filter to push events (commits)
          const pushEvents = events.filter((event) => event.type === 'PushEvent');

          // Extract commit information
          return pushEvents.map((event: any) => ({
            id: event.id,
            type: event.type,
            repo: event.repo.name,
            created_at: event.created_at,
            commits: event.payload?.commits?.length || 0,
            commit_messages: event.payload?.commits?.map((c: any) => c.message).slice(0, 3) || [],
          }));
        });

        // Update last_used_at timestamp
        await connectionService.markAsUsed(connection.id);

        return {
          person_id: personId,
          person_name: person.name,
          github_username: person.github_username,
          github_connected: true,
          activity,
          activity_count: activity.length,
        };
      } catch (error: any) {
        // Return error with user-friendly message
        return {
          person_id: personId,
          person_name: person.name,
          github_username: person.github_username,
          github_connected: true,
          activity: [],
          error: error.message || 'Failed to fetch GitHub activity',
        };
      }
    }, res, 'Failed to fetch GitHub activity');

    if (result) {
      res.json(result);
    }
  }
}