import * as cron from 'node-cron';
import { getAuditedDb } from '../database/index.js';
import { emailService } from './EmailService.js';
import { logger } from './logging/config.js';

export class NotificationScheduler {
  private weeklyEmailTask: cron.ScheduledTask | null = null;
  private db: any;

  constructor() {
    this.db = getAuditedDb();
    this.initializeScheduler();
  }

  private initializeScheduler(): void {
    // Schedule weekly summary emails for Monday 9 AM.
    // createTask (NOT schedule): node-cron v4 has no scheduled:false flag and
    // schedule() auto-arms on creation — module import used to silently arm
    // this cron against the notification feature's never-created tables,
    // throwing every Monday 9 AM. createTask stays dormant until start().
    this.weeklyEmailTask = cron.createTask('0 9 * * 1', async () => {
      await this.sendWeeklySummaryEmails();
    }, {
      timezone: 'America/New_York'
    });

    logger.info('Notification scheduler initialized (dormant until start())');
  }

  public start(): void {
    if (this.weeklyEmailTask) {
      this.weeklyEmailTask.start();
      logger.info('Weekly summary email scheduler started');
    }
  }

  public stop(): void {
    if (this.weeklyEmailTask) {
      this.weeklyEmailTask.stop();
      logger.info('Weekly summary email scheduler stopped');
    }
  }

  private async sendWeeklySummaryEmails(): Promise<void> {
    try {
      logger.info('Sending weekly summary emails');

      // Get all users who have weekly summary notifications enabled
      const users = await this.db('people')
        .select('people.*')
        .join('notification_preferences', 'people.id', 'notification_preferences.user_id')
        .where('notification_preferences.type', 'summary')
        .where('notification_preferences.enabled', true)
        .where('notification_preferences.email_enabled', true)
        .where('people.email', '!=', '')
        .whereNotNull('people.email');

      logger.info('Found users for weekly summary emails', { count: users.length });

      const startOfWeek = new Date();
      startOfWeek.setDate(startOfWeek.getDate() - 7);
      const endOfWeek = new Date();

      for (const user of users) {
        try {
          const summaryData = await this.generateWeeklySummaryData(user.id, startOfWeek, endOfWeek);
          
          const variables = {
            weekOf: startOfWeek.toDateString(),
            assignments: summaryData.assignments,
            totalAllocation: summaryData.totalAllocation,
            availableCapacity: summaryData.availableCapacity,
            upcomingDeadlines: summaryData.upcomingDeadlines
          };

          await emailService.sendNotificationEmail(user.id, 'weekly_summary', variables);
          logger.info('Weekly summary sent', { email: user.email });
        } catch (error) {
          logger.error('Failed to send weekly summary', error instanceof Error ? error : undefined, { email: user.email });
        }
      }

      logger.info('Weekly summary emails completed');
    } catch (error) {
      logger.error('Error in weekly summary email job', error instanceof Error ? error : undefined);
    }
  }

  private async generateWeeklySummaryData(userId: string, startDate: Date, endDate: Date): Promise<any> {
    try {
      // Get user's assignments for the week
      const assignments = await this.db('assignments')
        .select(
          'assignments.*',
          'projects.name as project_name',
          'roles.name as role_name'
        )
        .join('projects', 'assignments.project_id', 'projects.id')
        .join('roles', 'assignments.role_id', 'roles.id')
        .where('assignments.person_id', userId)
        .where('assignments.start_date', '<=', endDate)
        .where('assignments.end_date', '>=', startDate)
        .orderBy('assignments.start_date');

      // Calculate total allocation
      const totalAllocation = assignments.reduce((sum: number, assignment: { allocation?: number }) => {
        return sum + (assignment.allocation || 0);
      }, 0);

      // Calculate available capacity
      const availableCapacity = Math.max(0, 100 - totalAllocation);

      // Get upcoming deadlines (next 14 days)
      const upcomingDeadlineDate = new Date();
      upcomingDeadlineDate.setDate(upcomingDeadlineDate.getDate() + 14);

      const upcomingDeadlines = await this.db('assignments')
        .select(
          'assignments.end_date',
          'projects.name as project_name',
          'roles.name as role_name'
        )
        .join('projects', 'assignments.project_id', 'projects.id')
        .join('roles', 'assignments.role_id', 'roles.id')
        .where('assignments.person_id', userId)
        .where('assignments.end_date', '>=', new Date())
        .where('assignments.end_date', '<=', upcomingDeadlineDate)
        .orderBy('assignments.end_date');

      return {
        assignments: assignments.map((assignment: { project_name: string; role_name: string; allocation: number }) => ({
          projectName: assignment.project_name,
          roleName: assignment.role_name,
          allocation: assignment.allocation
        })),
        totalAllocation,
        availableCapacity,
        upcomingDeadlines: upcomingDeadlines.length > 0
          ? upcomingDeadlines.map((deadline: { project_name: string; role_name: string; end_date: string }) => `${deadline.project_name} (${deadline.role_name}) - ${new Date(deadline.end_date).toLocaleDateString()}`).join(', ')
          : 'None'
      };
    } catch (error) {
      logger.error('Error generating weekly summary data', error instanceof Error ? error : undefined, { userId });
      return {
        assignments: [],
        totalAllocation: 0,
        availableCapacity: 100,
        upcomingDeadlines: 'Error loading data'
      };
    }
  }

  // Helper method to send assignment notification
  public async sendAssignmentNotification(
    userId: string,
    action: 'created' | 'updated' | 'removed',
    assignmentData: any
  ): Promise<void> {
    try {
      const user = await this.db('people').where('id', userId).first();
      if (!user) {
        logger.warn('User not found for assignment notification', { userId });
        return;
      }

      const project = await this.db('projects').where('id', assignmentData.project_id).first();
      const role = await this.db('roles').where('id', assignmentData.role_id).first();

      if (!project || !role) {
        logger.warn('Project or role not found for assignment notification', { projectId: assignmentData.project_id, roleId: assignmentData.role_id });
        return;
      }

      const templateName = action === 'created' ? 'assignment_created' : 'assignment_updated';
      
      const variables = {
        projectName: project.name,
        roleName: role.name,
        startDate: assignmentData.start_date ? new Date(assignmentData.start_date).toLocaleDateString() : 'TBD',
        endDate: assignmentData.end_date ? new Date(assignmentData.end_date).toLocaleDateString() : 'TBD',
        allocation: assignmentData.allocation || 0,
        changes: assignmentData.changes || 'Assignment details updated'
      };

      await emailService.sendNotificationEmail(userId, templateName, variables);
      logger.info('Assignment notification sent', { action, email: user.email });
    } catch (error) {
      logger.error('Error sending assignment notification', error instanceof Error ? error : undefined, { userId, action });
    }
  }

  // Helper method to send approval notification
  public async sendApprovalNotification(
    approverUserId: string,
    requestData: any
  ): Promise<void> {
    try {
      const approver = await this.db('people').where('id', approverUserId).first();
      const requestor = await this.db('people').where('id', requestData.requestor_id).first();

      if (!approver || !requestor) {
        logger.warn('Approver or requestor not found for approval notification', { approverId: approverUserId, requestorId: requestData.requestor_id });
        return;
      }

      const variables = {
        requestType: requestData.type || 'Unknown',
        requestorName: requestor.name,
        details: requestData.details || 'No details provided',
        reason: requestData.reason || 'No reason provided'
      };

      await emailService.sendNotificationEmail(approverUserId, 'approval_request', variables);
      logger.info('Approval notification sent', { email: approver.email });
    } catch (error) {
      logger.error('Error sending approval notification', error instanceof Error ? error : undefined, { approverUserId });
    }
  }

  // Helper method to send project timeline notification
  public async sendProjectTimelineNotification(
    projectId: string,
    oldStartDate: Date | null,
    newStartDate: Date | null,
    oldEndDate: Date | null,
    newEndDate: Date | null
  ): Promise<void> {
    try {
      const project = await this.db('projects').where('id', projectId).first();
      if (!project) {
        logger.warn('Project not found for timeline notification', { projectId });
        return;
      }

      // Get all users assigned to this project
      const assignedUsers = await this.db('assignments')
        .select('people.id', 'people.email', 'people.name')
        .join('people', 'assignments.person_id', 'people.id')
        .where('assignments.project_id', projectId)
        .whereNotNull('people.email')
        .where('people.email', '!=', '')
        .groupBy('people.id');

      if (assignedUsers.length === 0) {
        logger.info('No users assigned to project for timeline notification', { projectName: project.name, projectId });
        return;
      }

      const variables = {
        projectName: project.name,
        previousStart: oldStartDate ? oldStartDate.toLocaleDateString() : 'Not set',
        newStart: newStartDate ? newStartDate.toLocaleDateString() : 'Not set',
        previousEnd: oldEndDate ? oldEndDate.toLocaleDateString() : 'Not set',
        newEnd: newEndDate ? newEndDate.toLocaleDateString() : 'Not set'
      };

      for (const user of assignedUsers) {
        await emailService.sendNotificationEmail(user.id, 'project_timeline_changed', variables);
        logger.info('Project timeline notification sent', { email: user.email, projectId });
      }
    } catch (error) {
      logger.error('Error sending project timeline notification', error instanceof Error ? error : undefined, { projectId });
    }
  }

  // Helper method to send system maintenance notification
  public async sendSystemMaintenanceNotification(
    title: string,
    message: string,
    scheduledTime: Date,
    duration: string,
    impact: string
  ): Promise<void> {
    try {
      // Get all users with system notifications enabled
      const users = await this.db('people')
        .select('people.*')
        .join('notification_preferences', 'people.id', 'notification_preferences.user_id')
        .where('notification_preferences.type', 'system')
        .where('notification_preferences.enabled', true)
        .where('notification_preferences.email_enabled', true)
        .where('people.email', '!=', '')
        .whereNotNull('people.email');

      if (users.length === 0) {
        logger.info('No users to notify for system maintenance');
        return;
      }

      const variables = {
        title,
        message,
        scheduledTime: scheduledTime.toLocaleString(),
        duration,
        impact
      };

      for (const user of users) {
        await emailService.sendNotificationEmail(user.id, 'system_maintenance', variables);
        logger.info('System maintenance notification sent', { email: user.email });
      }
    } catch (error) {
      logger.error('Error sending system maintenance notification', error instanceof Error ? error : undefined);
    }
  }
}

// Export singleton instance
export const notificationScheduler = new NotificationScheduler();