// Jest setup for server unit tests
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Mock audit system before any modules are imported
jest.mock('../../../src/server/services/audit/index.js', () => {
  const mockAuditService = {
    audit: jest.fn(),
    getHistory: jest.fn(),
    cleanup: jest.fn()
  };
  
  return {
    initializeAuditService: jest.fn(() => mockAuditService),
    getAuditService: jest.fn(() => mockAuditService),
    AuditService: jest.fn(() => mockAuditService)
  };
});

// Create a comprehensive mock for the database that includes all Knex methods
const mockQueryBuilder = {
  select: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  whereIn: jest.fn().mockReturnThis(),
  whereNot: jest.fn().mockReturnThis(),
  whereNotIn: jest.fn().mockReturnThis(),
  whereNull: jest.fn().mockReturnThis(),
  whereNotNull: jest.fn().mockReturnThis(),
  whereBetween: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  groupBy: jest.fn().mockReturnThis(),
  having: jest.fn().mockReturnThis(),
  join: jest.fn().mockReturnThis(),
  leftJoin: jest.fn().mockReturnThis(),
  rightJoin: jest.fn().mockReturnThis(),
  innerJoin: jest.fn().mockReturnThis(),
  fullOuterJoin: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  offset: jest.fn().mockReturnThis(),
  distinct: jest.fn().mockReturnThis(),
  union: jest.fn().mockReturnThis(),
  unionAll: jest.fn().mockReturnThis(),
  as: jest.fn().mockReturnThis(),
  insert: jest.fn().mockResolvedValue([1]),
  update: jest.fn().mockResolvedValue(1),
  delete: jest.fn().mockResolvedValue(1),
  del: jest.fn().mockResolvedValue(1),
  first: jest.fn().mockResolvedValue({}),
  count: jest.fn().mockResolvedValue([{ count: 0 }]),
  sum: jest.fn().mockResolvedValue([{ sum: 0 }]),
  avg: jest.fn().mockResolvedValue([{ avg: 0 }]),
  min: jest.fn().mockResolvedValue([{ min: 0 }]),
  max: jest.fn().mockResolvedValue([{ max: 0 }]),
  clone: jest.fn().mockReturnThis(),
  then: jest.fn().mockResolvedValue([]),
  catch: jest.fn().mockReturnThis(),
  finally: jest.fn().mockReturnThis()
};

const mockDb = jest.fn(() => mockQueryBuilder);

// Add the query builder methods to the main function too
Object.assign(mockDb, mockQueryBuilder);

// Add Knex-specific methods
mockDb.transaction = jest.fn((callback) => callback(mockDb));
mockDb.raw = jest.fn().mockResolvedValue({ rows: [] });
mockDb.schema = {
  createTable: jest.fn().mockReturnThis(),
  dropTable: jest.fn().mockReturnThis(),
  hasTable: jest.fn().mockResolvedValue(true),
  hasColumn: jest.fn().mockResolvedValue(true)
};

// Mock unified BaseController (consolidates former AuditedBaseController and EnhancedBaseController)
jest.mock('../../../src/server/api/controllers/BaseController.js', () => {
  return {
    BaseController: class BaseController {
      protected db: any;
      protected options: { enableAudit?: boolean; enableLogging?: boolean };
      private _auditedDb: any;

      constructor(options: { enableAudit?: boolean; enableLogging?: boolean } = {}) {
        this.options = { enableAudit: false, enableLogging: false, ...options };
        this.db = mockDb;
        this._auditedDb = null;
      }

      protected get auditedDb() {
        return this._auditedDb || mockDb;
      }

      protected getDb(req?: any) {
        return this.db;
      }

      protected handleError(error: any, reqOrRes: any, resOrMessage?: any, message?: string) {
        // Support both (error, res, message) and (error, req, res, message) signatures
        let req: any;
        let res: any;
        let errorMessage: string;

        if (resOrMessage && typeof resOrMessage === 'object' && typeof resOrMessage.status === 'function') {
          req = reqOrRes;
          res = resOrMessage;
          errorMessage = message || 'Internal server error';
        } else {
          res = reqOrRes;
          errorMessage = (typeof resOrMessage === 'string' ? resOrMessage : message) || 'Internal server error';
        }

        console.error('Controller error:', error);

        // Handle operational errors
        if (error.isOperational) {
          res.status(error.statusCode).json({
            error: error.message,
            requestId: req?.requestId
          });
          return;
        }

        res.status(500).json({
          error: errorMessage,
          requestId: req?.requestId,
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
      }

      protected handleNotFound(reqOrRes: any, resOrResource?: any, resource = 'Resource') {
        let req: any;
        let res: any;
        let resourceName: string;

        if (resOrResource && typeof resOrResource === 'object' && typeof resOrResource.status === 'function') {
          req = reqOrRes;
          res = resOrResource;
          resourceName = resource;
        } else {
          res = reqOrRes;
          resourceName = (typeof resOrResource === 'string' ? resOrResource : resource) || 'Resource';
        }

        res.status(404).json({
          error: `${resourceName} not found`,
          requestId: req?.requestId
        });
      }

      protected handleValidationError(reqOrRes: any, resOrErrors?: any, errors?: any) {
        let req: any;
        let res: any;
        let validationErrors: any;

        if (resOrErrors && typeof resOrErrors === 'object' && typeof resOrErrors.status === 'function') {
          req = reqOrRes;
          res = resOrErrors;
          validationErrors = errors;
        } else {
          res = reqOrRes;
          validationErrors = resOrErrors;
        }

        res.status(400).json({
          error: 'Validation failed',
          details: validationErrors,
          requestId: req?.requestId
        });
      }

      protected async executeQuery<T>(
        queryFn: () => Promise<T>,
        reqOrRes: any,
        resOrMessage?: any,
        errorMessage?: string
      ): Promise<T | undefined> {
        let req: any;
        let res: any;
        let message: string | undefined;

        if (resOrMessage && typeof resOrMessage === 'object' && typeof resOrMessage.status === 'function') {
          req = reqOrRes;
          res = resOrMessage;
          message = errorMessage;
        } else {
          res = reqOrRes;
          message = resOrMessage;
        }

        try {
          return await queryFn();
        } catch (error) {
          if (req) {
            this.handleError(error, req, res, message);
          } else {
            this.handleError(error, res, message);
          }
          return undefined;
        }
      }

      protected async executeAuditedQuery<T>(
        req: any,
        queryFn: (db: any) => Promise<T>,
        res: any,
        errorMessage?: string
      ): Promise<T | undefined> {
        try {
          const db = this.getDb(req);
          return await queryFn(db);
        } catch (error) {
          this.handleError(error, req, res, errorMessage);
          return undefined;
        }
      }

      protected paginate(query: any, page: number = 1, limit: number = 50) {
        const offset = (page - 1) * limit;
        return query.limit(limit).offset(offset);
      }

      protected buildFilters(query: any, filters: Record<string, any>) {
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

      protected createOperationalError(message: string, statusCode: number = 400): Error & { isOperational: boolean; statusCode: number } {
        const error = new Error(message) as Error & { isOperational: boolean; statusCode: number };
        error.isOperational = true;
        error.statusCode = statusCode;
        return error;
      }

      protected logBusinessOperation(
        req: any,
        operation: string,
        entityType: string,
        entityId: string,
        metadata: Record<string, any> = {}
      ) {
        if (req.logger?.logBusinessOperation) {
          req.logger.logBusinessOperation(operation, entityType, entityId, req.user?.id, {
            controller: this.constructor.name,
            ...metadata
          });
        }
      }

      protected asyncHandler(fn: (req: any, res: any, next: any) => Promise<any>) {
        return (req: any, res: any, next: any) => {
          Promise.resolve(fn(req, res, next)).catch(next);
        };
      }

      protected sendSuccess(req: any, res: any, data: any, message?: string) {
        const response: any = { success: true, data, requestId: req.requestId };
        if (message) response.message = message;
        res.json(response);
      }

      protected sendPaginatedResponse(req: any, res: any, data: any[], total: number, page: number, limit: number) {
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

      protected sendError(req: any, res: any, message: string, statusCode: number = 400) {
        res.status(statusCode).json({
          error: message,
          requestId: req.requestId
        });
      }
    },
    RequestWithContext: {},
    OperationalError: {},
    ControllerOptions: {}
  };
});

// Setup test database or mocks as needed
beforeAll(() => {
  // Global test setup
});

afterAll(() => {
  // Global test cleanup
});