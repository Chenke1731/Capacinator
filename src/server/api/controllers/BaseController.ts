import type { Request, Response, NextFunction } from 'express';
import { db, getAuditedDb } from '../../database/index.js';
import { AuditContext } from '../../database/AuditedDatabase.js';
import { logger } from '../../services/logging/config.js';
import { ServiceContainer } from '../../services/ServiceContainer.js';

/**
 * Extended Request interface with logging context
 */
export interface RequestWithContext extends Request {
  requestId?: string;
  startTime?: number;
  logger?: any;
  user?: {
    id: string;
    name: string;
    email: string;
    is_system_admin: boolean;
    user_role_id?: string;
  };
}

/**
 * Operational error that is safe to show to users
 */
export interface OperationalError extends Error {
  isOperational: boolean;
  statusCode: number;
}

/**
 * Configuration options for controller features
 */
export interface ControllerOptions {
  /** Enable audit context for database operations */
  enableAudit?: boolean;
  /** Enable enhanced logging (requires request logger middleware) */
  enableLogging?: boolean;
}

/**
 * Dependencies that can be injected into controllers
 */
export interface ControllerDependencies {
  /** Service container instance */
  container?: ServiceContainer;
}

/**
 * Unified BaseController with composable features and dependency injection support
 *
 * This consolidates the functionality of:
 * - Original BaseController (basic error handling, pagination, filters)
 * - EnhancedBaseController (logging, request context, operational errors)
 * - AuditedBaseController (audit context injection)
 *
 * Usage:
 * - For basic controllers: extend BaseController (defaults work)
 * - For controllers needing audit: override options with enableAudit: true
 * - For controllers needing logging: override options with enableLogging: true
 *
 * Dependency Injection:
 * - Controllers can optionally receive a ServiceContainer via constructor
 * - If no container is provided, falls back to global singletons (backward compatible)
 * - For new code, prefer using ServiceContainer for better testability
 *
 * Example with DI:
 * ```typescript
 * class MyController extends BaseController {
 *   constructor(container: ServiceContainer) {
 *     super({ enableLogging: true }, { container });
 *   }
 * }
 * ```
 */
export abstract class BaseController {
  /** Database instance - use this for simple queries */
  protected db: any;

  /** Audited database instance - initialized on first access */
  private _auditedDb: any = null;

  /** Controller feature options */
  protected options: ControllerOptions;

  /** Service container for dependency injection (optional) */
  protected container?: ServiceContainer;

  /**
   * Create a new controller instance
   * @param options - Controller feature options (enableAudit, enableLogging)
   * @param deps - Optional dependencies including ServiceContainer
   */
  constructor(options: ControllerOptions = {}, deps: ControllerDependencies = {}) {
    this.options = {
      enableAudit: false,
      enableLogging: false,
      ...options
    };

    // Store container reference for DI
    this.container = deps.container;

    // Use injected database or fall back to global singleton
    if (deps.container) {
      this.db = deps.container.getDb();
    } else {
      // Backward compatible: use global db singleton
      this.db = db;
    }
  }

  /**
   * Get audited database instance with lazy initialization
   */
  protected get auditedDb(): any {
    if (!this._auditedDb) {
      this._auditedDb = getAuditedDb();
    }
    return this._auditedDb;
  }

  /**
   * Get database instance with optional audit context from request
   * Use this when you need audit trail for database operations
   */
  protected getDb(req?: RequestWithContext): any {
    if (!this.options.enableAudit || !req) {
      return this.db;
    }

    const auditContext: AuditContext = {
      userId: req.user?.id,
      requestId: req.requestId,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    };

    this.auditedDb.setDefaultContext(auditContext);
    return this.auditedDb;
  }

  /**
   * Create an operational error that is safe to show to users
   */
  protected createOperationalError(message: string, statusCode: number = 400): OperationalError {
    const error = new Error(message) as OperationalError;
    error.isOperational = true;
    error.statusCode = statusCode;
    return error;
  }

  /**
   * Handle errors with optional logging support
   * Automatically detects if request has logging context
   */
  protected handleError(
    error: any,
    reqOrRes: RequestWithContext | Response,
    resOrMessage?: Response | string,
    message: string = 'Internal server error'
  ): void {
    // Support both signatures:
    // handleError(error, res, message?) - legacy
    // handleError(error, req, res, message?) - with logging
    let req: RequestWithContext | undefined;
    let res: Response;
    let errorMessage: string;

    if (resOrMessage && typeof resOrMessage !== 'string') {
      // New signature: handleError(error, req, res, message?)
      req = reqOrRes as RequestWithContext;
      res = resOrMessage as Response;
      errorMessage = message;
    } else {
      // Legacy signature: handleError(error, res, message?)
      res = reqOrRes as Response;
      errorMessage = (resOrMessage as string) || message;
    }

    // Log error with context if available
    if (req?.logger && this.options.enableLogging) {
      req.logger.error('Controller error', error, {
        controller: this.constructor.name,
        sqlError: error.code === 'SQLITE_ERROR' ? error.message : undefined,
        // message-only logging hid the call site (e.g. the demand-report
        // "query.where is not a function" 500 that could not be reproduced)
        stack: error instanceof Error ? error.stack : String(error)
      });
    } else {
      // Fallback to logger for backwards compatibility
      logger.error('Controller error', error instanceof Error ? error : undefined, {
        controller: this.constructor.name,
        sqlError: error.code === 'SQLITE_ERROR' ? error.message : undefined
      });
    }

    // Handle operational errors (safe to show to users)
    if (error.isOperational) {
      res.status(error.statusCode).json({
        error: error.message,
        requestId: req?.requestId
      });
      return;
    }

    // Generic error response
    const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'e2e';
    res.status(500).json({
      error: errorMessage,
      requestId: req?.requestId,
      details: isDev ? error.message : undefined
    });
  }

  /**
   * Handle not found responses
   */
  protected handleNotFound(
    reqOrRes: RequestWithContext | Response,
    resOrResource?: Response | string,
    resource: string = 'Resource'
  ): void {
    // Support both signatures
    let req: RequestWithContext | undefined;
    let res: Response;
    let resourceName: string;

    if (resOrResource && typeof resOrResource !== 'string') {
      req = reqOrRes as RequestWithContext;
      res = resOrResource as Response;
      resourceName = resource;
    } else {
      res = reqOrRes as Response;
      resourceName = (resOrResource as string) || resource;
    }

    if (req?.logger && this.options.enableLogging) {
      req.logger.info(`${resourceName} not found`, {
        controller: this.constructor.name
      });
    }

    res.status(404).json({
      error: `${resourceName} not found`,
      requestId: req?.requestId
    });
  }

  /**
   * Handle validation errors
   */
  protected handleValidationError(
    reqOrRes: RequestWithContext | Response,
    resOrErrors?: Response | any,
    errors?: any
  ): void {
    // Support both signatures
    let req: RequestWithContext | undefined;
    let res: Response;
    let validationErrors: any;

    if (resOrErrors && typeof resOrErrors === 'object' && 'status' in resOrErrors) {
      req = reqOrRes as RequestWithContext;
      res = resOrErrors as Response;
      validationErrors = errors;
    } else {
      res = reqOrRes as Response;
      validationErrors = resOrErrors;
    }

    if (req?.logger && this.options.enableLogging) {
      req.logger.warn('Validation failed', {
        controller: this.constructor.name,
        validationErrors
      });
    }

    res.status(400).json({
      error: 'Validation failed',
      details: validationErrors,
      requestId: req?.requestId
    });
  }

  /**
   * Execute a query with error handling
   * Supports both legacy (queryFn, res, message) and enhanced (queryFn, req, res, message) signatures
   */
  protected async executeQuery<T>(
    queryFn: () => Promise<T>,
    reqOrRes: RequestWithContext | Response,
    resOrMessage?: Response | string,
    errorMessage?: string
  ): Promise<T | undefined> {
    // Determine signature
    let req: RequestWithContext | undefined;
    let res: Response;
    let message: string | undefined;

    if (resOrMessage && typeof resOrMessage !== 'string') {
      req = reqOrRes as RequestWithContext;
      res = resOrMessage as Response;
      message = errorMessage;
    } else {
      res = reqOrRes as Response;
      message = resOrMessage as string;
    }

    const startTime = Date.now();

    try {
      const result = await queryFn();

      // Log slow queries if logging enabled
      if (req?.logger && this.options.enableLogging) {
        const duration = Date.now() - startTime;
        if (duration > 100) {
          req.logger.logPerformance?.('Database Query', duration, {
            controller: this.constructor.name
          });
        }
      }

      return result;
    } catch (error) {
      if (req) {
        this.handleError(error, req, res, message);
      } else {
        this.handleError(error, res, message);
      }
      return undefined;
    }
  }

  /**
   * Execute a query with audit context
   */
  protected async executeAuditedQuery<T>(
    req: RequestWithContext,
    queryFn: (db: any) => Promise<T>,
    res: Response,
    errorMessage?: string
  ): Promise<T | undefined> {
    const startTime = Date.now();

    try {
      const auditedDb = this.getDb(req);
      const result = await queryFn(auditedDb);

      // Log slow queries
      if (req.logger && this.options.enableLogging) {
        const duration = Date.now() - startTime;
        if (duration > 100) {
          req.logger.logPerformance?.('Audited Database Query', duration, {
            controller: this.constructor.name
          });
        }
      }

      return result;
    } catch (error) {
      this.handleError(error, req, res, errorMessage);
      return undefined;
    }
  }

  /**
   * Apply pagination to a query
   */
  protected paginate(query: any, page: number = 1, limit: number = 50): any {
    const offset = (page - 1) * limit;
    return query.limit(limit).offset(offset);
  }

  /**
   * Build WHERE filters from a record
   * Supports exact match, LIKE patterns (%), and arrays (IN clause)
   */
  protected buildFilters(query: any, filters: Record<string, any>): any {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        if (Array.isArray(value)) {
          query.whereIn(key, value);
        } else if (typeof value === 'string' && value.includes('%')) {
          query.where(key, 'like', value);
        } else {
          query.where(key, value);
        }
      }
    });
    return query;
  }

  /**
   * Log a business operation (requires enableLogging: true)
   */
  protected logBusinessOperation(
    req: RequestWithContext,
    operation: string,
    entityType: string,
    entityId: string,
    metadata: Record<string, any> = {}
  ): void {
    if (req.logger?.logBusinessOperation) {
      req.logger.logBusinessOperation(
        operation,
        entityType,
        entityId,
        req.user?.id,
        {
          controller: this.constructor.name,
          ...metadata
        }
      );
    }
  }

  /**
   * Wrap async route handlers to catch errors
   */
  protected asyncHandler(
    fn: (req: RequestWithContext, res: Response, next?: NextFunction) => Promise<any>
  ): (req: RequestWithContext, res: Response, next?: NextFunction) => void {
    return (req: RequestWithContext, res: Response, next?: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next || ((e: unknown) => { throw e; }));
    };
  }

  /**
   * Send a success response with standard format
   */
  protected sendSuccess(
    req: RequestWithContext,
    res: Response,
    data: any,
    message?: string
  ): void {
    const response: any = {
      success: true,
      data,
      requestId: req.requestId
    };

    if (message) {
      response.message = message;
    }

    res.json(response);
  }

  /**
   * Send a paginated response with metadata
   */
  protected sendPaginatedResponse(
    req: RequestWithContext,
    res: Response,
    data: any[],
    total: number,
    page: number,
    limit: number
  ): void {
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      requestId: req.requestId
    });
  }

  /**
   * Send an error response
   */
  protected sendError(
    req: RequestWithContext,
    res: Response,
    message: string,
    statusCode: number = 400
  ): void {
    res.status(statusCode).json({
      error: message,
      requestId: req.requestId
    });
  }
}
