import type { Request, Response } from 'express';
import { BaseController } from './BaseController.js';
import { ServiceContainer } from '../../services/ServiceContainer.js';

// ============================================================================
// Availability Types
// ============================================================================

/**
 * Availability override row from database
 */
interface AvailabilityOverrideRow {
  id: string;
  person_id: string;
  start_date: string;
  end_date: string;
  availability_percentage: number;
  hours_per_day?: number;
  reason?: string;
  override_type?: 'VACATION' | 'SICK' | 'TRAINING' | 'CONFERENCE' | 'PERSONAL';
  is_approved?: boolean;
  approved_by?: string;
}

/**
 * Person calendar entry with overrides
 */
interface PersonCalendarEntry {
  person_id: string;
  person_name: string;
  default_availability: number;
  overrides: Array<{
    id: string;
    start_date: string;
    end_date: string;
    availability_percentage: number;
    override_type?: string;
    reason?: string;
  }>;
}

/**
 * Simplified person row for calendar queries
 */
interface CalendarPersonRow {
  id: string;
  name: string;
  default_availability_percentage: number;
}

export class AvailabilityController extends BaseController {
  constructor(container?: ServiceContainer) {
    super({ enableAudit: true }, { container });
  }
  async getAll(req: Request, res: Response) {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const filters = {
      person_id: req.query.person_id,
      override_type: req.query.override_type,
      is_approved: req.query.is_approved
    };

    const result = await this.executeQuery(async () => {
      let query = this.db('person_availability_overrides')
        .join('people', 'person_availability_overrides.person_id', 'people.id')
        .leftJoin('people as approver', 'person_availability_overrides.approved_by', 'approver.id')
        .select(
          'person_availability_overrides.*',
          'people.name as person_name',
          'people.email as person_email',
          'approver.name as approver_name'
        );

      // Add date range filter
      if (req.query.start_date) {
        query = query.where('person_availability_overrides.end_date', '>=', req.query.start_date);
      }
      if (req.query.end_date) {
        query = query.where('person_availability_overrides.start_date', '<=', req.query.end_date);
      }

      // Filter for pending approvals
      if (req.query.pending_only === 'true') {
        query = query.where('person_availability_overrides.is_approved', false);
      }

      query = this.buildFilters(query, filters);
      // total 与数据同过滤(2026-10-13 全库审计: 原先裸表 count)——克隆清投影;
      // 排序此刻尚未附加,无需 clearOrder
      const total = await query.clone().clearSelect().count('* as count').first();
      query = this.paginate(query, page, limit);
      query = query.orderBy('person_availability_overrides.start_date', 'desc');

      const overrides = await query;

      return {
        data: overrides,
        pagination: {
          page,
          limit,
          total: Number(total?.count) || 0,
          totalPages: Math.ceil((Number(total?.count) || 0) / limit)
        }
      };
    }, res, 'Failed to fetch availability overrides');

    if (result) {
      res.json(result);
    }
  }

  async create(req: Request, res: Response) {
    const overrideData = req.body;

    const result = await this.executeAuditedQuery(req, async (db) => {
      // Check for conflicts
      const conflicts = await this.checkAvailabilityConflicts(
        overrideData.person_id,
        overrideData.start_date,
        overrideData.end_date
      );

      if (conflicts.length > 0) {
        return res.status(400).json({
          error: 'Availability override conflicts with existing overrides',
          conflicts,
          message: 'Please resolve conflicts before creating override'
        });
      }

      // Auto-approve if creator is supervisor or self
      const person = await db('people').where('id', overrideData.person_id).first();
      const creatorId = req.body.created_by || 'system'; // Would come from auth in real app
      
      let isApproved = false;
      let approvedBy = null;

      if (creatorId === overrideData.person_id || creatorId === person?.supervisor_id) {
        isApproved = true;
        approvedBy = creatorId;
      }

      await db('person_availability_overrides')
        .insert({
          ...overrideData,
          is_approved: isApproved,
          approved_by: approvedBy,
          approved_at: isApproved ? new Date() : null,
          created_at: new Date(),
          updated_at: new Date()
        });

      // Audit logging is now automatic through AuditedDatabase
      // Get the created record by ID (use person_id and dates for lookup since SQLite doesn't return ID)
      const createdOverride = await db('person_availability_overrides')
        .where({
          person_id: overrideData.person_id,
          start_date: overrideData.start_date,
          end_date: overrideData.end_date
        })
        .orderBy('created_at', 'desc')
        .first();
        
      return createdOverride;
    }, res, 'Failed to create availability override');

    if (result) {
      res.status(201).json(result);
    }
  }

  async bulkCreate(req: Request, res: Response) {
    const { overrides, apply_to_all = false } = req.body;
    // 数组入参校验(2026-10-13 全库审计): 非数组载荷原先 overrides[0]/for...of
    // 直接 TypeError → 500
    if (!Array.isArray(overrides) || overrides.length === 0) {
      res.status(400).json({ error: 'Validation error', message: 'overrides must be a non-empty array' });
      return;
    }

    const result = await this.executeQuery(async () => {
      const results = {
        successful: [] as any[],
        failed: [] as any[],
        conflicts: [] as any[]
      };

      let targetPeople = [];

      if (apply_to_all) {
        // Apply to all people (assuming all are active)
        targetPeople = await this.db('people')
          .select('id');
      } else if (overrides[0]?.person_ids) {
        // Apply to specific people
        targetPeople = overrides[0].person_ids.map((id: string) => ({ id }));
      }

      for (const person of targetPeople) {
        for (const override of overrides) {
          try {
            // Check conflicts
            const conflicts = await this.checkAvailabilityConflicts(
              person.id,
              override.start_date,
              override.end_date
            );

            if (conflicts.length > 0) {
              results.conflicts.push({
                person_id: person.id,
                override,
                conflicts
              });
              continue;
            }

            const [created] = await this.db('person_availability_overrides')
              .insert({
                person_id: person.id,
                start_date: override.start_date,
                end_date: override.end_date,
                availability_percentage: override.availability_percentage,
                override_type: override.override_type,
                reason: override.reason,
                hours_per_day: override.hours_per_day,
                is_approved: true, // Bulk creates are pre-approved
                approved_by: req.body.created_by || 'system',
                approved_at: new Date(),
                created_at: new Date(),
                updated_at: new Date()
              })
              .returning('*');

            // Log audit event for bulk creation
            if ((req as any).logAuditEvent) {
              await (req as any).logAuditEvent(
                'availability',
                created.id,
                'CREATE',
                null,
                created,
                'Availability override created (bulk)'
              );
            }

            results.successful.push(created);

          } catch (error) {
            results.failed.push({
              person_id: person.id,
              override,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      }

      return {
        summary: {
          total_attempted: targetPeople.length * overrides.length,
          successful: results.successful.length,
          failed: results.failed.length,
          conflicts: results.conflicts.length
        },
        results
      };
    }, res, 'Failed to create bulk availability overrides');

    if (result) {
      res.json(result);
    }
  }

  async approve(req: Request, res: Response) {
    const { id } = req.params;
    const { approved, approver_notes } = req.body;

    const result = await this.executeQuery(async () => {
      const override = await this.db('person_availability_overrides')
        .where('id', id)
        .first();

      if (!override) {
        this.handleNotFound(res, 'Availability override');
        return null;
      }

      if (override.is_approved) {
        return res.status(400).json({
          error: 'Override already approved',
          approved_by: override.approved_by,
          approved_at: override.approved_at
        });
      }

      const [updated] = await this.db('person_availability_overrides')
        .where('id', id)
        .update({
          is_approved: approved,
          approved_by: req.body.approver_id || 'system',
          approved_at: approved ? new Date() : null,
          approver_notes,
          updated_at: new Date()
        })
        .returning('*');

      // Log audit event after approval/rejection
      if ((req as any).logAuditEvent) {
        await (req as any).logAuditEvent(
          'availability',
          id,
          'UPDATE',
          override,
          updated,
          `Availability override ${approved ? 'approved' : 'rejected'}`
        );
      }

      // If rejected, could notify the requester
      if (!approved) {
        // TODO: Send notification
      }

      return updated;
    }, res, 'Failed to approve availability override');

    if (result) {
      res.json(result);
    }
  }

  async update(req: Request, res: Response) {
    const { id } = req.params;
    const updateData = req.body;

    const result = await this.executeQuery(async () => {
      const override = await this.db('person_availability_overrides')
        .where('id', id)
        .first();

      if (!override) {
        this.handleNotFound(res, 'Availability override');
        return null;
      }

      // Check for conflicts if dates are being changed
      if (updateData.start_date || updateData.end_date) {
        const conflicts = await this.checkAvailabilityConflicts(
          updateData.person_id || override.person_id,
          updateData.start_date || override.start_date,
          updateData.end_date || override.end_date,
          id // Exclude current override from conflict check
        );

        if (conflicts.length > 0) {
          return res.status(400).json({
            error: 'Availability override conflicts with existing overrides',
            conflicts,
            message: 'Please resolve conflicts before updating override'
          });
        }
      }

      const [updated] = await this.db('person_availability_overrides')
        .where('id', id)
        .update({
          ...updateData,
          updated_at: new Date()
        })
        .returning('*');

      // Log audit event after update
      if ((req as any).logAuditEvent) {
        await (req as any).logAuditEvent(
          'availability',
          id,
          'UPDATE',
          override,
          updated,
          'Availability override updated'
        );
      }

      return updated;
    }, res, 'Failed to update availability override');

    if (result) {
      res.json(result);
    }
  }

  async delete(req: Request, res: Response) {
    const { id } = req.params;

    const result = await this.executeAuditedQuery(req, async (db) => {
      const override = await db('person_availability_overrides')
        .where('id', id)
        .first();

      if (!override) {
        this.handleNotFound(res, 'Availability override');
        return null;
      }

      // Audit logging is now automatic through AuditedDatabase
      await db('person_availability_overrides')
        .where('id', id)
        .delete();

      return { message: 'Availability override deleted successfully', deleted: override };
    }, res, 'Failed to delete availability override');

    if (result) {
      res.json(result);
    }
  }

  async getCalendar(req: Request, res: Response) {
    const { start_date, end_date, team_id, location_id } = req.query;

    const result = await this.executeQuery(async () => {
      // Get people based on filters
      const peopleQuery = this.db('people');
      
      if (team_id) {
        // TODO: Add team filtering when team table exists
      }
      
      const people: CalendarPersonRow[] = await peopleQuery.select('id', 'name', 'default_availability_percentage');

      // Get availability overrides for date range
      let overridesQuery = this.db('person_availability_overrides')
        .whereIn('person_id', people.map((p) => p.id))
        .where('is_approved', true);

      if (start_date) {
        overridesQuery = overridesQuery.where('end_date', '>=', start_date);
      }
      if (end_date) {
        overridesQuery = overridesQuery.where('start_date', '<=', end_date);
      }

      const overrides: AvailabilityOverrideRow[] = await overridesQuery.select('*');

      // Build calendar data
      const calendar: PersonCalendarEntry[] = people.map((person) => {
        const personOverrides = overrides.filter((o) => o.person_id === person.id);

        return {
          person_id: person.id,
          person_name: person.name,
          default_availability: person.default_availability_percentage,
          overrides: personOverrides.map((o) => ({
            id: o.id,
            start_date: o.start_date,
            end_date: o.end_date,
            availability_percentage: o.availability_percentage,
            override_type: o.override_type,
            reason: o.reason
          }))
        };
      });

      // Calculate team availability summary
      const summary = this.calculateTeamAvailabilitySummary(calendar, start_date as string, end_date as string);

      return {
        calendar,
        summary,
        filters: {
          start_date,
          end_date,
          team_id,
          location_id,
          people_count: people.length
        }
      };
    }, res, 'Failed to fetch availability calendar');

    if (result) {
      res.json(result);
    }
  }

  async getForecast(req: Request, res: Response) {
    const { weeks = 12 } = req.query;

    const result = await this.executeQuery(async () => {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + (Number(weeks) * 7));

      // Get all people (assuming all are active if no is_active column)
      const people: CalendarPersonRow[] = await this.db('people')
        .select('id', 'name', 'default_availability_percentage');

      // Get future overrides
      const overrides: AvailabilityOverrideRow[] = await this.db('person_availability_overrides')
        .where('start_date', '>=', startDate)
        .where('start_date', '<=', endDate)
        .where('is_approved', true)
        .select('*');

      // Calculate weekly forecast
      const forecast = [];
      
      for (let week = 0; week < Number(weeks); week++) {
        const weekStart = new Date(startDate);
        weekStart.setDate(weekStart.getDate() + (week * 7));
        
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);

        const weekData = {
          week_number: week + 1,
          start_date: weekStart.toISOString().split('T')[0],
          end_date: weekEnd.toISOString().split('T')[0],
          total_capacity: 0,
          people_on_leave: 0,
          people_reduced_capacity: 0,
          capacity_by_role: {} as Record<string, number>
        };

        // Calculate capacity for this week
        for (const person of people) {
          const personOverrides = overrides.filter((o) =>
            o.person_id === person.id &&
            o.start_date <= weekEnd.toISOString().split('T')[0] &&
            o.end_date >= weekStart.toISOString().split('T')[0]
          );

          let availability = person.default_availability_percentage;

          if (personOverrides.length > 0) {
            // Use the most restrictive override
            availability = Math.min(...personOverrides.map((o) => o.availability_percentage));
            
            if (availability === 0) {
              weekData.people_on_leave++;
            } else if (availability < person.default_availability_percentage) {
              weekData.people_reduced_capacity++;
            }
          }

          weekData.total_capacity += availability / 100;
        }

        forecast.push(weekData);
      }

      return {
        forecast,
        summary: {
          weeks: Number(weeks),
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0],
          total_people: people.length,
          average_weekly_capacity: forecast.reduce((sum, w) => sum + w.total_capacity, 0) / forecast.length
        }
      };
    }, res, 'Failed to generate availability forecast');

    if (result) {
      res.json(result);
    }
  }

  private async checkAvailabilityConflicts(
    person_id: string,
    start_date: string,
    end_date: string,
    exclude_id?: string
  ) {
    let query = this.db('person_availability_overrides')
      .where('person_id', person_id)
      .where('start_date', '<=', end_date)
      .where('end_date', '>=', start_date);

    if (exclude_id) {
      query = query.where('id', '!=', exclude_id);
    }

    return await query.select('*');
  }

  private calculateTeamAvailabilitySummary(
    calendar: PersonCalendarEntry[],
    _start_date: string,
    _end_date: string
  ) {
    const summary = {
      total_people: calendar.length,
      people_available: 0,
      people_on_leave: 0,
      people_reduced_capacity: 0,
      average_availability: 0,
      dates_with_low_capacity: [] as string[]
    };

    // For simplicity, just check current date
    // In production, would check each day in range
    const today = new Date().toISOString().split('T')[0];

    calendar.forEach(person => {
      const currentOverride = person.overrides.find((o) =>
        o.start_date <= today && o.end_date >= today
      );

      const availability = currentOverride?.availability_percentage ?? person.default_availability;
      
      if (availability === 0) {
        summary.people_on_leave++;
      } else if (availability < 100) {
        summary.people_reduced_capacity++;
      } else {
        summary.people_available++;
      }

      summary.average_availability += availability;
    });

    summary.average_availability = summary.average_availability / calendar.length;

    return summary;
  }
}