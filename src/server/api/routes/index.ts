import { Router, Request, Response } from 'express';
import projectRoutes from './projects.js';
import peopleRoutes from './people.js';
import rolesRoutes from './roles.js';
import locationsRoutes from './locations.js';
import projectTypesRoutes from './project-types.js';
import projectSubTypesRoutes from './project-sub-types.js';
import phasesRoutes from './phases.js';
import projectPhasesRoutes from './project-phases.js';
import projectPhaseDependenciesRoutes from './project-phase-dependencies.js';
import resourceTemplatesRoutes from './resource-templates.js';
import assignmentsRoutes from './assignments.js';
import availabilityRoutes from './availability.js';
import reportingRoutes from './reporting.js';
import importRoutes from './import.js';
import demandRoutes from './demands.js';
import exportRoutes from './export.js';
import testDataRoutes from './test-data.js';
import testContextRoutes from './test-context.js';
import projectTypeHierarchyRoutes from './project-type-hierarchy.js';
import projectAllocationRoutes from './project-allocations.js';
import scenariosRoutes from './scenarios.js';
import settingsRoutes from './settings.js';
import estimationsRoutes from './estimations.js';
import designEstimationsRoutes from './design-estimations.js';
import poolDemandsRoutes from './pool-demands.js';
import actualInvestmentsRoutes from './actual-investments.js';
import lifecycleRoutes from './lifecycle.js';
import tagsRoutes from './tags.js';
import iterationsRoutes from './iterations.js';
import userPermissionsRoutes from './user-permissions.js';
import notificationsRoutes from './notifications.js';
import recommendationsRoutes from './recommendations.js';
import authRoutes from './auth.js';
import syncRoutes from './sync.js';
import githubConnectionsRoutes from './github-connections.js';
// Note: createAuditRoutes and getAuditService removed - unused imports
import type { RequestWithLogging } from '../../middleware/requestLogger.js';

const router = Router();

// Auth routes (no auth required for login/refresh)
router.use('/auth', authRoutes);

// Git Sync routes (Feature: 001-git-sync-integration)
router.use('/sync', syncRoutes);

// GitHub connections routes (Feature: 005-github-auth-user-link)
router.use('/github-connections', githubConnectionsRoutes);

// Mount all route modules
router.use('/projects', projectRoutes);
router.use('/people', peopleRoutes);
router.use('/roles', rolesRoutes);
router.use('/locations', locationsRoutes);
router.use('/project-types', projectTypesRoutes);
router.use('/project-sub-types', projectSubTypesRoutes);
router.use('/project-type-hierarchy', projectTypeHierarchyRoutes);
router.use('/project-allocations', projectAllocationRoutes);
router.use('/scenarios', scenariosRoutes);
router.use('/phases', phasesRoutes);
router.use('/project-phases', projectPhasesRoutes);
router.use('/project-phase-dependencies', projectPhaseDependenciesRoutes);
router.use('/resource-templates', resourceTemplatesRoutes);
router.use('/assignments', assignmentsRoutes);
router.use('/availability', availabilityRoutes);
router.use('/reporting', reportingRoutes);
router.use('/import', importRoutes);
router.use('/export', exportRoutes);
router.use('/demands', demandRoutes);
router.use('/settings', settingsRoutes);
router.use('/estimations', estimationsRoutes);
router.use('/design-estimations', designEstimationsRoutes);
router.use('/pool-demands', poolDemandsRoutes);
router.use('/actual-investments', actualInvestmentsRoutes);
router.use('/projects', lifecycleRoutes);
router.use('/tags', tagsRoutes);
router.use('/iterations', iterationsRoutes);
router.use('/user-permissions', userPermissionsRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/recommendations', recommendationsRoutes);

// Test data cleanup routes (for e2e tests)
router.use('/test-data', testDataRoutes);

// Test context routes (for per-test data isolation)
router.use('/test-context', testContextRoutes);

// CSP violation reporting endpoint
router.post('/csp-report', (req: Request, res: Response) => {
  const reqWithLogging = req as RequestWithLogging;
  const report = req.body['csp-report'] || req.body;

  if (report) {
    reqWithLogging.logger.warn('CSP Violation Report', {
      documentUri: report['document-uri'],
      violatedDirective: report['violated-directive'],
      effectiveDirective: report['effective-directive'],
      blockedUri: report['blocked-uri'],
      sourceFile: report['source-file'],
      lineNumber: report['line-number'],
      columnNumber: report['column-number'],
      originalPolicy: report['original-policy'],
      disposition: report.disposition,
    });
  }

  // Return 204 No Content (standard for CSP reports)
  res.status(204).end();
});

// Client logging endpoint for remote logging
router.post('/client-logs', (req: Request, res: Response) => {
  const reqWithLogging = req as RequestWithLogging;
  const { logs } = req.body;

  if (!Array.isArray(logs)) {
    res.status(400).json({ error: 'Invalid logs format' });
    return;
  }

  // Log each client log entry with proper context
  logs.forEach((logEntry: { level?: string; message: string; component?: string; sessionId?: string; userId?: string; timestamp?: string; metadata?: Record<string, unknown>; error?: unknown }) => {
    const level = logEntry.level?.toLowerCase() || 'info';
    const message = `[CLIENT] ${logEntry.message}`;
    const metadata: Record<string, unknown> = {
      component: logEntry.component,
      sessionId: logEntry.sessionId,
      userId: logEntry.userId,
      clientTimestamp: logEntry.timestamp,
      ...logEntry.metadata
    };

    // Add error details if present
    if (logEntry.error) {
      metadata.clientError = logEntry.error;
    }

    switch (level) {
      case 'error':
        reqWithLogging.logger.error(message, undefined, metadata);
        break;
      case 'warn':
        reqWithLogging.logger.warn(message, metadata);
        break;
      case 'debug':
        reqWithLogging.logger.debug(message, metadata);
        break;
      default:
        reqWithLogging.logger.info(message, metadata);
    }
  });

  res.json({
    success: true,
    processed: logs.length,
    requestId: reqWithLogging.requestId
  });
});

// Audit routes will be mounted dynamically after service initialization

export default router;