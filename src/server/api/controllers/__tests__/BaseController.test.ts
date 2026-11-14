// Unmock the controller to test the real implementation
jest.unmock('../BaseController.js');

// Mock the logger
jest.mock('../../../services/logging/config.js', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    http: jest.fn(),
    debug: jest.fn()
  }
}));

import { BaseController, RequestWithContext, ControllerOptions } from '../BaseController.js';
import type { Response, NextFunction } from 'express';
import { logger } from '../../../services/logging/config.js';

// Create a concrete implementation for testing
class TestController extends BaseController {
  constructor(options?: ControllerOptions) {
    super(options);
  }

  public testHandleError(error: any, res: Response, message?: string) {
    return this.handleError(error, res, message);
  }

  public testHandleNotFound(res: Response, resource?: string) {
    return this.handleNotFound(res, resource);
  }

  public testHandleValidationError(res: Response, errors: any) {
    return this.handleValidationError(res, errors);
  }

  public testBuildFilters(query: any, filters: Record<string, any>) {
    return this.buildFilters(query, filters);
  }

  public testPaginate(query: any, page?: number, limit?: number) {
    return this.paginate(query, page, limit);
  }

  public testCreateOperationalError(message: string, statusCode?: number) {
    return this.createOperationalError(message, statusCode);
  }

  public async testExecuteQuery<T>(
    queryFn: () => Promise<T>,
    res: Response,
    errorMessage?: string
  ) {
    return this.executeQuery(queryFn, res, errorMessage);
  }
}

// Create enhanced controller for testing logging features
class TestEnhancedController extends BaseController {
  constructor() {
    super({ enableLogging: true });
  }

  public testHandleError(error: any, req: RequestWithContext, res: Response, message?: string) {
    return this.handleError(error, req, res, message);
  }

  public testHandleNotFound(req: RequestWithContext, res: Response, resource?: string) {
    return this.handleNotFound(req, res, resource);
  }

  public testHandleValidationError(req: RequestWithContext, res: Response, errors: any) {
    return this.handleValidationError(req, res, errors);
  }

  public async testExecuteQuery<T>(
    queryFn: () => Promise<T>,
    req: RequestWithContext,
    res: Response,
    errorMessage?: string
  ) {
    return this.executeQuery(queryFn, req, res, errorMessage);
  }

  public testLogBusinessOperation(
    req: RequestWithContext,
    operation: string,
    entityType: string,
    entityId: string,
    metadata?: Record<string, any>
  ) {
    return this.logBusinessOperation(req, operation, entityType, entityId, metadata);
  }

  public testAsyncHandler(fn: (req: RequestWithContext, res: Response, next?: NextFunction) => Promise<any>) {
    return this.asyncHandler(fn);
  }

  public testSendSuccess(req: RequestWithContext, res: Response, data: any, message?: string) {
    return this.sendSuccess(req, res, data, message);
  }

  public testSendPaginatedResponse(
    req: RequestWithContext,
    res: Response,
    data: any[],
    total: number,
    page: number,
    limit: number
  ) {
    return this.sendPaginatedResponse(req, res, data, total, page, limit);
  }

  public testSendError(req: RequestWithContext, res: Response, message: string, statusCode?: number) {
    return this.sendError(req, res, message, statusCode);
  }

  public testCreateOperationalError(message: string, statusCode?: number) {
    return this.createOperationalError(message, statusCode);
  }
}

describe('BaseController', () => {
  let controller: TestController;
  let mockRes: Partial<Response>;
  let mockQuery: any;

  beforeEach(() => {
    controller = new TestController();

    mockRes = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis()
    };

    mockQuery = {
      where: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis()
    };
  });

  describe('handleError (legacy signature)', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should log SQL error details for SQLITE errors', () => {
      const sqliteError = new Error('SQLITE_CONSTRAINT error') as any;
      sqliteError.code = 'SQLITE_ERROR';

      controller.testHandleError(sqliteError, mockRes as Response);

      expect(logger.error).toHaveBeenCalledWith(
        'Controller error',
        sqliteError,
        expect.objectContaining({
          controller: 'TestController',
          sqlError: 'SQLITE_CONSTRAINT error'
        })
      );
      expect(mockRes.status).toHaveBeenCalledWith(500);
    });

    it('should handle regular errors without SQL logging', () => {
      const regularError = new Error('Regular error');

      controller.testHandleError(regularError, mockRes as Response);

      expect(logger.error).toHaveBeenCalledWith(
        'Controller error',
        regularError,
        expect.objectContaining({
          controller: 'TestController',
          sqlError: undefined
        })
      );
      expect(mockRes.status).toHaveBeenCalledWith(500);
    });

    it('should handle operational errors', () => {
      const operationalError = controller.testCreateOperationalError('Validation failed', 400);

      controller.testHandleError(operationalError, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        message: 'Validation failed',
        requestId: undefined
      });
    });
  });

  describe('handleValidationError (legacy signature)', () => {
    it('should return 400 with validation errors', () => {
      const errors = { field: 'is required' };

      controller.testHandleValidationError(mockRes as Response, errors);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        details: errors,
        requestId: undefined
      });
    });
  });

  describe('handleNotFound (legacy signature)', () => {
    it('should return 404 with default resource name', () => {
      controller.testHandleNotFound(mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Resource not found',
        requestId: undefined
      });
    });

    it('should return 404 with custom resource name', () => {
      controller.testHandleNotFound(mockRes as Response, 'User');

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'User not found',
        requestId: undefined
      });
    });
  });

  describe('buildFilters', () => {
    it('should handle LIKE filters with % wildcard', () => {
      const filters = { name: '%test%' };

      controller.testBuildFilters(mockQuery, filters);

      expect(mockQuery.where).toHaveBeenCalledWith('name', 'like', '%test%');
    });

    it('should handle exact match filters', () => {
      const filters = { id: '123', status: 'active' };

      controller.testBuildFilters(mockQuery, filters);

      expect(mockQuery.where).toHaveBeenCalledWith('id', '123');
      expect(mockQuery.where).toHaveBeenCalledWith('status', 'active');
    });

    it('should handle array filters with whereIn', () => {
      const filters = { status: ['active', 'pending'] };

      controller.testBuildFilters(mockQuery, filters);

      expect(mockQuery.whereIn).toHaveBeenCalledWith('status', ['active', 'pending']);
    });

    it('should skip null, undefined, and empty string values', () => {
      const filters = { a: null, b: undefined, c: '', d: 'valid' };

      controller.testBuildFilters(mockQuery, filters);

      expect(mockQuery.where).toHaveBeenCalledTimes(1);
      expect(mockQuery.where).toHaveBeenCalledWith('d', 'valid');
    });
  });

  describe('paginate', () => {
    it('should paginate with default values', () => {
      controller.testPaginate(mockQuery);

      expect(mockQuery.limit).toHaveBeenCalledWith(50);
      expect(mockQuery.offset).toHaveBeenCalledWith(0);
    });

    it('should paginate with custom page and limit', () => {
      controller.testPaginate(mockQuery, 3, 20);

      expect(mockQuery.limit).toHaveBeenCalledWith(20);
      expect(mockQuery.offset).toHaveBeenCalledWith(40); // (3-1) * 20
    });
  });

  describe('createOperationalError', () => {
    it('should create operational error with default status code', () => {
      const error = controller.testCreateOperationalError('Test error');

      expect(error.message).toBe('Test error');
      expect(error.isOperational).toBe(true);
      expect(error.statusCode).toBe(400);
    });

    it('should create operational error with custom status code', () => {
      const error = controller.testCreateOperationalError('Not found', 404);

      expect(error.message).toBe('Not found');
      expect(error.isOperational).toBe(true);
      expect(error.statusCode).toBe(404);
    });
  });

  describe('executeQuery (legacy signature)', () => {
    it('should execute query successfully', async () => {
      const queryFn = jest.fn().mockResolvedValue({ id: 1, name: 'Test' });

      const result = await controller.testExecuteQuery(
        queryFn,
        mockRes as Response
      );

      expect(queryFn).toHaveBeenCalled();
      expect(result).toEqual({ id: 1, name: 'Test' });
    });

    it('should handle query errors', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const error = new Error('Query failed');
      const queryFn = jest.fn().mockRejectedValue(error);

      const result = await controller.testExecuteQuery(
        queryFn,
        mockRes as Response,
        'Custom error message'
      );

      expect(result).toBeUndefined();
      expect(mockRes.status).toHaveBeenCalledWith(500);

      consoleErrorSpy.mockRestore();
    });
  });
});

describe('BaseController with enableLogging', () => {
  let controller: TestEnhancedController;
  let mockReq: Partial<RequestWithContext>;
  let mockRes: Partial<Response>;
  let mockNext: jest.Mock;
  let mockQuery: any;

  beforeEach(() => {
    controller = new TestEnhancedController();

    mockReq = {
      requestId: 'test-request-id',
      logger: {
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
        logPerformance: jest.fn(),
        logBusinessOperation: jest.fn()
      } as any
    };

    mockRes = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis()
    };

    mockNext = jest.fn();

    mockQuery = {
      where: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis()
    };
  });

  describe('handleError (enhanced signature)', () => {
    it('should handle operational errors', () => {
      const operationalError = controller.testCreateOperationalError('Validation failed', 400);

      controller.testHandleError(operationalError, mockReq as RequestWithContext, mockRes as Response);

      expect(mockReq.logger?.error).toHaveBeenCalledWith(
        'Controller error',
        operationalError,
        expect.objectContaining({
          controller: 'TestEnhancedController'
        })
      );
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        message: 'Validation failed',
        requestId: 'test-request-id'
      });
    });

    it('should handle non-operational errors', () => {
      const error = new Error('Unexpected error');

      controller.testHandleError(error, mockReq as RequestWithContext, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        requestId: 'test-request-id',
        details: undefined
      });
    });

    it('should handle non-operational errors with custom message', () => {
      const error = new Error('Database error');

      controller.testHandleError(error, mockReq as RequestWithContext, mockRes as Response, 'Custom error message');

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Custom error message',
        requestId: 'test-request-id',
        details: undefined
      });
    });

    it('should include error details in development mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new Error('Database error');

      controller.testHandleError(error, mockReq as RequestWithContext, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        requestId: 'test-request-id',
        details: 'Database error'
      });

      process.env.NODE_ENV = originalEnv;
    });

    it('should log SQLite errors with code', () => {
      const sqliteError = new Error('SQLITE error') as any;
      sqliteError.code = 'SQLITE_ERROR';

      controller.testHandleError(sqliteError, mockReq as RequestWithContext, mockRes as Response);

      expect(mockReq.logger?.error).toHaveBeenCalledWith(
        'Controller error',
        sqliteError,
        expect.objectContaining({
          controller: 'TestEnhancedController',
          sqlError: 'SQLITE error'
        })
      );
    });
  });

  describe('handleNotFound (enhanced signature)', () => {
    it('should handle not found with default resource', () => {
      controller.testHandleNotFound(mockReq as RequestWithContext, mockRes as Response);

      expect(mockReq.logger?.info).toHaveBeenCalledWith(
        'Resource not found',
        expect.objectContaining({ controller: 'TestEnhancedController' })
      );
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Resource not found',
        requestId: 'test-request-id'
      });
    });

    it('should handle not found with custom resource', () => {
      controller.testHandleNotFound(mockReq as RequestWithContext, mockRes as Response, 'User');

      expect(mockReq.logger?.info).toHaveBeenCalledWith(
        'User not found',
        expect.objectContaining({ controller: 'TestEnhancedController' })
      );
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'User not found',
        requestId: 'test-request-id'
      });
    });
  });

  describe('handleValidationError (enhanced signature)', () => {
    it('should handle validation errors', () => {
      const errors = { field: 'is required', email: 'invalid format' };

      controller.testHandleValidationError(mockReq as RequestWithContext, mockRes as Response, errors);

      expect(mockReq.logger?.warn).toHaveBeenCalledWith(
        'Validation failed',
        expect.objectContaining({
          controller: 'TestEnhancedController',
          validationErrors: errors
        })
      );
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        details: errors,
        requestId: 'test-request-id'
      });
    });
  });

  describe('executeQuery (enhanced signature)', () => {
    it('should execute query successfully', async () => {
      const queryFn = jest.fn().mockResolvedValue({ id: 1, name: 'Test' });

      const result = await controller.testExecuteQuery(
        queryFn,
        mockReq as RequestWithContext,
        mockRes as Response
      );

      expect(queryFn).toHaveBeenCalled();
      expect(result).toEqual({ id: 1, name: 'Test' });
    });

    it('should log performance for slow queries', async () => {
      const queryFn = jest.fn().mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ id: 1 }), 150))
      );

      await controller.testExecuteQuery(
        queryFn,
        mockReq as RequestWithContext,
        mockRes as Response
      );

      expect(mockReq.logger?.logPerformance).toHaveBeenCalledWith(
        'Database Query',
        expect.any(Number),
        expect.objectContaining({ controller: 'TestEnhancedController' })
      );
    });

    it('should handle query errors', async () => {
      const error = new Error('Query failed');
      const queryFn = jest.fn().mockRejectedValue(error);

      const result = await controller.testExecuteQuery(
        queryFn,
        mockReq as RequestWithContext,
        mockRes as Response,
        'Custom error message'
      );

      expect(result).toBeUndefined();
      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('asyncHandler', () => {
    it('should wrap async function and handle success', async () => {
      const asyncFn = jest.fn().mockResolvedValue('success');
      const handler = controller.testAsyncHandler(asyncFn);

      await handler(mockReq as RequestWithContext, mockRes as Response, mockNext);

      expect(asyncFn).toHaveBeenCalledWith(mockReq, mockRes, mockNext);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should catch errors and pass to next', async () => {
      const error = new Error('Async error');
      const asyncFn = jest.fn().mockRejectedValue(error);
      const handler = controller.testAsyncHandler(asyncFn);

      await handler(mockReq as RequestWithContext, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('sendSuccess', () => {
    it('should send success response without message', () => {
      const data = { id: 1, name: 'Test' };

      controller.testSendSuccess(mockReq as RequestWithContext, mockRes as Response, data);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data,
        requestId: 'test-request-id'
      });
    });

    it('should send success response with message', () => {
      const data = { id: 1, name: 'Test' };

      controller.testSendSuccess(mockReq as RequestWithContext, mockRes as Response, data, 'Operation completed');

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data,
        requestId: 'test-request-id',
        message: 'Operation completed'
      });
    });
  });

  describe('sendPaginatedResponse', () => {
    it('should send paginated response', () => {
      const data = [{ id: 1 }, { id: 2 }];

      controller.testSendPaginatedResponse(
        mockReq as RequestWithContext,
        mockRes as Response,
        data,
        50,
        2,
        10
      );

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data,
        pagination: {
          page: 2,
          limit: 10,
          total: 50,
          totalPages: 5,
          hasNextPage: true,
          hasPrevPage: true
        },
        requestId: 'test-request-id'
      });
    });

    it('should indicate no next page on last page', () => {
      const data = [{ id: 1 }];

      controller.testSendPaginatedResponse(
        mockReq as RequestWithContext,
        mockRes as Response,
        data,
        21,
        3,
        10
      );

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data,
        pagination: {
          page: 3,
          limit: 10,
          total: 21,
          totalPages: 3,
          hasNextPage: false,
          hasPrevPage: true
        },
        requestId: 'test-request-id'
      });
    });

    it('should indicate no previous page on first page', () => {
      const data = [{ id: 1 }];

      controller.testSendPaginatedResponse(
        mockReq as RequestWithContext,
        mockRes as Response,
        data,
        10,
        1,
        10
      );

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data,
        pagination: {
          page: 1,
          limit: 10,
          total: 10,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false
        },
        requestId: 'test-request-id'
      });
    });
  });

  describe('sendError', () => {
    it('should send error response with default status code', () => {
      controller.testSendError(mockReq as RequestWithContext, mockRes as Response, 'Something went wrong');

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Something went wrong',
        requestId: 'test-request-id'
      });
    });

    it('should send error response with custom status code', () => {
      controller.testSendError(mockReq as RequestWithContext, mockRes as Response, 'Not found', 404);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Not found',
        requestId: 'test-request-id'
      });
    });
  });

  describe('logBusinessOperation', () => {
    it('should log business operation', () => {
      controller.testLogBusinessOperation(
        mockReq as RequestWithContext,
        'CREATE',
        'project',
        'project-123',
        { priority: 'high' }
      );

      expect(mockReq.logger?.logBusinessOperation).toHaveBeenCalledWith(
        'CREATE',
        'project',
        'project-123',
        undefined,
        expect.objectContaining({
          controller: 'TestEnhancedController',
          priority: 'high'
        })
      );
    });
  });
});

// Create audited controller for testing audit features
class TestAuditedController extends BaseController {
  constructor() {
    super({ enableAudit: true, enableLogging: true });
  }

  public testGetDb(req?: RequestWithContext) {
    return this.getDb(req);
  }

  public async testExecuteAuditedQuery<T>(
    req: RequestWithContext,
    queryFn: (db: any) => Promise<T>,
    res: Response,
    errorMessage?: string
  ) {
    return this.executeAuditedQuery(req, queryFn, res, errorMessage);
  }
}

describe('BaseController with enableAudit', () => {
  let controller: TestAuditedController;
  let mockReq: Partial<RequestWithContext>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    controller = new TestAuditedController();

    mockReq = {
      requestId: 'test-request-id',
      ip: '127.0.0.1',
      user: {
        id: 'user-123',
        name: 'Test Admin',
        email: 'admin@test.com',
        is_system_admin: true
      },
      get: jest.fn().mockReturnValue('Test User Agent'),
      logger: {
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
        logPerformance: jest.fn(),
        logBusinessOperation: jest.fn()
      } as any
    };

    mockRes = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis()
    };
  });

  describe('getDb', () => {
    it('should return regular db when audit is disabled or no request', () => {
      // When no request is provided, should return regular db
      const db = controller.testGetDb();
      expect(db).toBeDefined();
    });

    it('should return audited db with context when request provided', () => {
      const db = controller.testGetDb(mockReq as RequestWithContext);
      expect(db).toBeDefined();
    });
  });

  describe('executeAuditedQuery', () => {
    it('should execute query successfully with audit context', async () => {
      const queryFn = jest.fn().mockResolvedValue({ id: 1, name: 'Test' });

      const result = await controller.testExecuteAuditedQuery(
        mockReq as RequestWithContext,
        queryFn,
        mockRes as Response
      );

      expect(queryFn).toHaveBeenCalled();
      expect(result).toEqual({ id: 1, name: 'Test' });
    });

    it('should log performance for slow audited queries', async () => {
      const queryFn = jest.fn().mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ id: 1 }), 150))
      );

      await controller.testExecuteAuditedQuery(
        mockReq as RequestWithContext,
        queryFn,
        mockRes as Response
      );

      expect(mockReq.logger?.logPerformance).toHaveBeenCalledWith(
        'Audited Database Query',
        expect.any(Number),
        expect.objectContaining({ controller: 'TestAuditedController' })
      );
    });

    it('should handle query errors in audited query', async () => {
      const error = new Error('Audited query failed');
      const queryFn = jest.fn().mockRejectedValue(error);

      const result = await controller.testExecuteAuditedQuery(
        mockReq as RequestWithContext,
        queryFn,
        mockRes as Response,
        'Custom audit error message'
      );

      expect(result).toBeUndefined();
      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });
});

describe('BaseController edge cases', () => {
  let controller: TestController;
  let mockRes: Partial<Response>;
  let mockQuery: any;

  beforeEach(() => {
    controller = new TestController();

    mockRes = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis()
    };

    mockQuery = {
      where: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis()
    };
  });

  describe('buildFilters edge cases', () => {
    it('should handle numeric values', () => {
      const filters = { count: 5, score: 0 };

      controller.testBuildFilters(mockQuery, filters);

      expect(mockQuery.where).toHaveBeenCalledWith('count', 5);
      expect(mockQuery.where).toHaveBeenCalledWith('score', 0);
    });

    it('should handle boolean values', () => {
      const filters = { active: true, deleted: false };

      controller.testBuildFilters(mockQuery, filters);

      expect(mockQuery.where).toHaveBeenCalledWith('active', true);
      expect(mockQuery.where).toHaveBeenCalledWith('deleted', false);
    });

    it('should handle empty object', () => {
      const filters = {};

      controller.testBuildFilters(mockQuery, filters);

      expect(mockQuery.where).not.toHaveBeenCalled();
      expect(mockQuery.whereIn).not.toHaveBeenCalled();
    });

    it('should handle mixed filters with LIKE at start', () => {
      const filters = { name: 'test%' };

      controller.testBuildFilters(mockQuery, filters);

      expect(mockQuery.where).toHaveBeenCalledWith('name', 'like', 'test%');
    });

    it('should handle mixed filters with LIKE at end', () => {
      const filters = { name: '%test' };

      controller.testBuildFilters(mockQuery, filters);

      expect(mockQuery.where).toHaveBeenCalledWith('name', 'like', '%test');
    });
  });

  describe('paginate edge cases', () => {
    it('should handle page 0 (invalid - defaults calculation)', () => {
      controller.testPaginate(mockQuery, 0, 10);

      expect(mockQuery.limit).toHaveBeenCalledWith(10);
      // (0-1) * 10 = -10, which is the calculation result
      expect(mockQuery.offset).toHaveBeenCalledWith(-10);
    });

    it('should handle large page numbers', () => {
      controller.testPaginate(mockQuery, 1000, 50);

      expect(mockQuery.limit).toHaveBeenCalledWith(50);
      expect(mockQuery.offset).toHaveBeenCalledWith(49950); // (1000-1) * 50
    });

    it('should handle limit of 1', () => {
      controller.testPaginate(mockQuery, 5, 1);

      expect(mockQuery.limit).toHaveBeenCalledWith(1);
      expect(mockQuery.offset).toHaveBeenCalledWith(4); // (5-1) * 1
    });
  });

  describe('createOperationalError edge cases', () => {
    it('should create error with status code 500', () => {
      const error = controller.testCreateOperationalError('Server error', 500);

      expect(error.message).toBe('Server error');
      expect(error.isOperational).toBe(true);
      expect(error.statusCode).toBe(500);
    });

    it('should create error with status code 403', () => {
      const error = controller.testCreateOperationalError('Forbidden', 403);

      expect(error.message).toBe('Forbidden');
      expect(error.isOperational).toBe(true);
      expect(error.statusCode).toBe(403);
    });

    it('should create error with status code 422', () => {
      const error = controller.testCreateOperationalError('Unprocessable entity', 422);

      expect(error.message).toBe('Unprocessable entity');
      expect(error.isOperational).toBe(true);
      expect(error.statusCode).toBe(422);
    });
  });
});
