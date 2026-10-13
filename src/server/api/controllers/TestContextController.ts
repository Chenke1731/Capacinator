import type { Request, Response } from 'express';
import { BaseController } from './BaseController.js';
import { ServiceContainer } from '../../services/ServiceContainer.js';
import { logger } from '../../services/logging/config.js';

/**
 * Represents a registered test context
 */
interface TestContextRecord {
  id: string;
  prefix: string;
  testFile?: string;
  testName?: string;
  createdAt: number;
  lastActivity: number;
  createdIds: {
    people: string[];
    projects: string[];
    assignments: string[];
    scenarios: string[];
    projectPhases: string[];
    availabilityOverrides: string[];
    roles: string[];
    locations: string[];
    projectTypes: string[];
    projectSubTypes: string[];
  };
}

/**
 * In-memory storage for test contexts
 * In production, this would be Redis or similar for multi-process support
 */
const testContexts = new Map<string, TestContextRecord>();

/**
 * Controller for per-test data isolation in E2E tests
 *
 * Provides endpoints for:
 * - Creating isolated test contexts
 * - Tracking created entities per context
 * - Cleaning up context data
 * - Cleaning up orphaned test data
 */
export class TestContextController extends BaseController {
  constructor(container?: ServiceContainer) {
    super({}, { container });
  }

  /**
   * Create a new test context
   * POST /api/test-context/create
   */
  async createContext(req: Request, res: Response) {
    // Only allow in test/e2e environments
    if (!this.isTestEnvironment()) {
      return res.status(403).json({
        success: false,
        error: 'Test context endpoints only available in test environment',
      });
    }

    const { contextId, prefix, testFile, testName } = req.body;

    if (!contextId || !prefix) {
      return res.status(400).json({
        success: false,
        error: 'contextId and prefix are required',
      });
    }

    const context: TestContextRecord = {
      id: contextId,
      prefix,
      testFile,
      testName,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      createdIds: {
        people: [],
        projects: [],
        assignments: [],
        scenarios: [],
        projectPhases: [],
        availabilityOverrides: [],
        roles: [],
        locations: [],
        projectTypes: [],
        projectSubTypes: [],
      },
    };

    testContexts.set(contextId, context);

    logger.info('[TestContext] Created context', { contextId, prefix });

    return res.json({
      success: true,
      data: {
        contextId,
        prefix,
        createdAt: context.createdAt,
      },
    });
  }

  /**
   * Track entities created in a context
   * POST /api/test-context/track
   */
  async trackEntities(req: Request, res: Response) {
    if (!this.isTestEnvironment()) {
      return res.status(403).json({
        success: false,
        error: 'Test context endpoints only available in test environment',
      });
    }

    const { contextId, entityType, entityIds } = req.body;

    if (!contextId || !entityType || !Array.isArray(entityIds)) {
      return res.status(400).json({
        success: false,
        error: 'contextId, entityType, and entityIds array are required',
      });
    }

    const context = testContexts.get(contextId);
    if (!context) {
      return res.status(404).json({
        success: false,
        error: `Context ${contextId} not found`,
      });
    }

    const validTypes = Object.keys(context.createdIds);
    if (!validTypes.includes(entityType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid entityType. Must be one of: ${validTypes.join(', ')}`,
      });
    }

    // Add new entity IDs (avoid duplicates)
    const existingIds = new Set(context.createdIds[entityType as keyof typeof context.createdIds]);
    for (const id of entityIds) {
      if (!existingIds.has(id)) {
        context.createdIds[entityType as keyof typeof context.createdIds].push(id);
      }
    }

    context.lastActivity = Date.now();

    return res.json({
      success: true,
      data: {
        contextId,
        entityType,
        trackedCount: entityIds.length,
        totalTracked: context.createdIds[entityType as keyof typeof context.createdIds].length,
      },
    });
  }

  /**
   * Clean up a specific test context
   * POST /api/test-context/cleanup
   */
  async cleanupContext(req: Request, res: Response) {
    if (!this.isTestEnvironment()) {
      return res.status(403).json({
        success: false,
        error: 'Test context endpoints only available in test environment',
      });
    }

    const { contextId } = req.body;

    if (!contextId) {
      return res.status(400).json({
        success: false,
        error: 'contextId is required',
      });
    }

    const context = testContexts.get(contextId);
    if (!context) {
      // Context not found is OK - might have been cleaned up already
      return res.json({
        success: true,
        data: {
          contextId,
          message: 'Context not found or already cleaned up',
          deleted: {},
        },
      });
    }

    const deleted = await this.cleanupContextData(context);
    testContexts.delete(contextId);

    logger.info('[TestContext] Cleaned up context', { contextId, deleted });

    return res.json({
      success: true,
      data: {
        contextId,
        deleted,
      },
    });
  }

  /**
   * Clean up orphaned test data (contexts older than maxAgeMs)
   * POST /api/test-context/cleanup-orphaned
   */
  async cleanupOrphanedData(req: Request, res: Response) {
    if (!this.isTestEnvironment()) {
      return res.status(403).json({
        success: false,
        error: 'Test context endpoints only available in test environment',
      });
    }

    const { maxAgeMs = 24 * 60 * 60 * 1000 } = req.body; // Default: 24 hours
    const cutoffTime = Date.now() - maxAgeMs;
    const orphanedContexts: string[] = [];
    const deletedByContext: Record<string, Record<string, number>> = {};

    // Find and clean up orphaned contexts
    for (const [contextId, context] of testContexts.entries()) {
      if (context.lastActivity < cutoffTime) {
        orphanedContexts.push(contextId);
        deletedByContext[contextId] = await this.cleanupContextData(context);
        testContexts.delete(contextId);
      }
    }

    // Also clean up orphaned data in the database by prefix pattern
    const orphanedDbData = await this.cleanupOrphanedDbData(cutoffTime);

    logger.info('[TestContext] Cleaned up orphaned contexts', { count: orphanedContexts.length });

    return res.json({
      success: true,
      data: {
        orphanedContexts,
        deletedByContext,
        orphanedDbData,
      },
    });
  }

  /**
   * Get all active test contexts (for debugging)
   * GET /api/test-context/list
   */
  async listContexts(req: Request, res: Response) {
    if (!this.isTestEnvironment()) {
      return res.status(403).json({
        success: false,
        error: 'Test context endpoints only available in test environment',
      });
    }

    const contexts = Array.from(testContexts.values()).map((ctx) => ({
      id: ctx.id,
      prefix: ctx.prefix,
      testFile: ctx.testFile,
      testName: ctx.testName,
      createdAt: ctx.createdAt,
      lastActivity: ctx.lastActivity,
      entityCounts: Object.entries(ctx.createdIds).reduce(
        (acc, [key, ids]) => {
          acc[key] = ids.length;
          return acc;
        },
        {} as Record<string, number>
      ),
    }));

    return res.json({
      success: true,
      data: {
        count: contexts.length,
        contexts,
      },
    });
  }

  /**
   * Clean up data for a specific prefix (useful for manual cleanup)
   * DELETE /api/test-context/by-prefix/:prefix
   */
  async cleanupByPrefix(req: Request, res: Response) {
    if (!this.isTestEnvironment()) {
      return res.status(403).json({
        success: false,
        error: 'Test context endpoints only available in test environment',
      });
    }

    const { prefix } = req.params;

    if (!prefix) {
      return res.status(400).json({
        success: false,
        error: 'prefix is required',
      });
    }

    const deleted = await this.cleanupByPrefixPattern(prefix);

    return res.json({
      success: true,
      data: {
        prefix,
        deleted,
      },
    });
  }

  // ============================================
  // Helper Methods
  // ============================================

  /**
   * Check if running in test environment
   */
  private isTestEnvironment(): boolean {
    const env = process.env.NODE_ENV;
    return env === 'test' || env === 'e2e' || env === 'development';
  }

  /**
   * Clean up all data for a context
   */
  private async cleanupContextData(context: TestContextRecord): Promise<Record<string, number>> {
    const deleted: Record<string, number> = {};

    // Delete in reverse dependency order
    const deletionOrder: Array<{ table: string; type: keyof TestContextRecord['createdIds'] }> = [
      { table: 'assignments', type: 'assignments' },
      { table: 'person_availability_overrides', type: 'availabilityOverrides' },
      { table: 'project_phases_timeline', type: 'projectPhases' },
      { table: 'scenarios', type: 'scenarios' },
      { table: 'projects', type: 'projects' },
      { table: 'people', type: 'people' },
      { table: 'project_sub_types', type: 'projectSubTypes' },
      { table: 'project_types', type: 'projectTypes' },
      { table: 'locations', type: 'locations' },
      { table: 'roles', type: 'roles' },
    ];

    for (const { table, type } of deletionOrder) {
      const ids = context.createdIds[type];
      if (ids.length > 0) {
        try {
          const count = await this.db(table).whereIn('id', ids).del();
          deleted[type] = count;
        } catch (error) {
          logger.warn('[TestContext] Failed to delete entity', { type, error: error instanceof Error ? error.message : String(error) });
          deleted[type] = 0;
        }
      }
    }

    return deleted;
  }

  /**
   * Clean up orphaned data in the database by timestamp patterns
   */
  private async cleanupOrphanedDbData(cutoffTime: number): Promise<Record<string, number>> {
    const deleted: Record<string, number> = {};

    // Convert cutoff time to a prefix pattern (base36 timestamp)
    // Test context prefixes look like: t<timestamp><random>
    // We can identify old test data by matching the pattern

    try {
      // Clean up by common test prefixes
      const testPrefixPatterns = [
        't%', // Test context prefix pattern
        'test_%', // Older test data pattern
        'Test_%', // Another common pattern
      ];

      // Get table-to-pattern mappings for name-based cleanup
      // ('assignments' 表不存在,2026-10-13 审计——换真实分配双表)
      const tablesWithNames = [
        { table: 'project_assignments', column: 'notes' },
        { table: 'scenario_project_assignments', column: 'notes' },
        { table: 'people', column: 'name' },
        { table: 'projects', column: 'name' },
        { table: 'scenarios', column: 'name' },
        { table: 'roles', column: 'name' },
        { table: 'locations', column: 'name' },
        { table: 'project_types', column: 'name' },
        { table: 'project_sub_types', column: 'name' },
      ];

      // Also clean up entities created before cutoff time with test-like names
      for (const { table, column } of tablesWithNames) {
        try {
          let count = 0;
          for (const pattern of testPrefixPatterns) {
            const result = await this.db(table)
              .where(column, 'like', pattern)
              .andWhere('created_at', '<', new Date(cutoffTime).toISOString())
              .del();
            count += result;
          }
          if (count > 0) {
            deleted[table] = (deleted[table] || 0) + count;
          }
        } catch {
          // Table might not have the column or might not exist
        }
      }
    } catch (error) {
      logger.error('[TestContext] Error cleaning up orphaned DB data', error instanceof Error ? error : undefined);
    }

    return deleted;
  }

  /**
   * Clean up data by prefix pattern
   */
  private async cleanupByPrefixPattern(prefix: string): Promise<Record<string, number>> {
    const deleted: Record<string, number> = {};
    const pattern = `${prefix}%`;

    // Tables and their name columns
    const tables = [
      { table: 'assignments', nameColumn: 'notes', deps: [] },
      { table: 'person_availability_overrides', nameColumn: null, personRef: 'person_id' },
      { table: 'project_phases_timeline', nameColumn: null, projectRef: 'project_id' },
      { table: 'scenarios', nameColumn: 'name', deps: [] },
      { table: 'projects', nameColumn: 'name', deps: ['assignments', 'project_phases_timeline'] },
      { table: 'people', nameColumn: 'name', deps: ['assignments', 'person_availability_overrides'] },
      { table: 'project_sub_types', nameColumn: 'name', deps: [] },
      { table: 'project_types', nameColumn: 'name', deps: ['project_sub_types'] },
      { table: 'locations', nameColumn: 'name', deps: [] },
      { table: 'roles', nameColumn: 'name', deps: [] },
    ];

    // Delete in proper order
    for (const { table, nameColumn } of tables) {
      if (nameColumn) {
        try {
          const count = await this.db(table).where(nameColumn, 'like', pattern).del();
          if (count > 0) {
            deleted[table] = count;
          }
        } catch (error) {
          logger.warn('[TestContext] Failed to cleanup table by prefix', { table, error: error instanceof Error ? error.message : String(error) });
        }
      }
    }

    return deleted;
  }
}
