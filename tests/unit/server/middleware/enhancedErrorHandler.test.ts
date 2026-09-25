import { describe, test, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';
import type { ErrorWithStatus } from '../../../../src/server/middleware/enhancedErrorHandler.js';

// Mock logger before importing the error handler
const mockLogger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
};

jest.mock('../../../../src/server/services/logging/config.js', () => ({
  logger: mockLogger
}));

import {
  enhancedErrorHandler,
  setupGlobalErrorHandlers
} from '../../../../src/server/middleware/enhancedErrorHandler.js';

describe('Enhanced Error Handler Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: jest.Mock<NextFunction>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      method: 'GET',
      url: '/api/test',
      ip: '127.0.0.1',
      get: jest.fn((header: string) => {
        if (header === 'User-Agent') return 'Mozilla/5.0';
        return undefined;
      })
    } as any;

    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    mockResponse = {
      status: statusMock as any,
      json: jsonMock
    };

    mockNext = jest.fn() as jest.Mock<NextFunction>;

    // Reset environment
    delete process.env.NODE_ENV;
  });

  describe('enhancedErrorHandler', () => {
    describe('Status Code Handling', () => {
      it('should handle 400 Bad Request errors', () => {
        const error: ErrorWithStatus = new Error('Invalid input');
        error.status = 400;

        enhancedErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Bad Request'
          })
        );
        expect(mockLogger.warn).toHaveBeenCalledWith('Client Error', expect.any(Object));
      });

      it('should handle 401 Unauthorized errors', () => {
        const error: ErrorWithStatus = new Error('Not authenticated');
        error.status = 401;

        enhancedErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

        expect(statusMock).toHaveBeenCalledWith(401);
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Unauthorized'
          })
        );
      });

      it('should handle 403 Forbidden errors', () => {
        const error: ErrorWithStatus = new Error('Access denied');
        error.status = 403;

        enhancedErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

        expect(statusMock).toHaveBeenCalledWith(403);
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Forbidden'
          })
        );
      });

      it('should handle 404 Not Found errors', () => {
        const error: ErrorWithStatus = new Error('Resource not found');
        error.status = 404;

        enhancedErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

        expect(statusMock).toHaveBeenCalledWith(404);
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Not Found'
          })
        );
      });

      it('should handle 409 Conflict errors', () => {
        const error: ErrorWithStatus = new Error('Duplicate resource');
        error.status = 409;

        enhancedErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

        expect(statusMock).toHaveBeenCalledWith(409);
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Conflict'
          })
        );
      });

      it('should handle 422 Validation Failed errors', () => {
        const error: ErrorWithStatus = new Error('Validation error');
        error.status = 422;

        enhancedErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

        expect(statusMock).toHaveBeenCalledWith(422);
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Validation Failed'
          })
        );
      });

      it('should handle 429 Too Many Requests errors', () => {
        const error: ErrorWithStatus = new Error('Rate limit exceeded');
        error.status = 429;

        enhancedErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

        expect(statusMock).toHaveBeenCalledWith(429);
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Too Many Requests'
          })
        );
      });

      it('should handle 500 Internal Server Error', () => {
        const error: ErrorWithStatus = new Error('Database connection failed');
        error.status = 500;

        enhancedErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

        expect(statusMock).toHaveBeenCalledWith(500);
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Internal Server Error'
          })
        );
        // Sanitized shape (2026-09-26): raw Error objects are never logged —
        // they can carry circular req/socket refs that crash the logger
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Server Error',
          expect.objectContaining({ name: error.name, message: error.message }),
          expect.any(Object)
        );
      });

      it('should handle 502 Bad Gateway errors', () => {
        const error: ErrorWithStatus = new Error('Upstream error');
        error.status = 502;

        enhancedErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

        expect(statusMock).toHaveBeenCalledWith(502);
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Bad Gateway'
          })
        );
      });

      it('should handle 503 Service Unavailable errors', () => {
        const error: ErrorWithStatus = new Error('Service down');
        error.status = 503;

        enhancedErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

        expect(statusMock).toHaveBeenCalledWith(503);
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Service Unavailable'
          })
        );
      });

      it('should handle 504 Gateway Timeout errors', () => {
        const error: ErrorWithStatus = new Error('Request timeout');
        error.status = 504;

        enhancedErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

        expect(statusMock).toHaveBeenCalledWith(504);
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Gateway Timeout'
          })
        );
      });

      it('should use statusCode field if status is not set', () => {
        const error: ErrorWithStatus = new Error('Error');
        error.statusCode = 400;

        enhancedErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

        expect(statusMock).toHaveBeenCalledWith(400);
      });

      it('should default to 500 if no status code is provided', () => {
        const error: ErrorWithStatus = new Error('Unknown error');

        enhancedErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

        expect(statusMock).toHaveBeenCalledWith(500);
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Internal Server Error'
          })
        );
      });

      it('should return "Request Failed" for unknown 4xx errors', () => {
        const error: ErrorWithStatus = new Error('Unknown client error');
        error.status = 418; // I'm a teapot

        enhancedErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

        expect(statusMock).toHaveBeenCalledWith(418);
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Request Failed'
          })
        );
      });

      it('should return "Internal Server Error" for unknown 5xx errors', () => {
        const error: ErrorWithStatus = new Error('Unknown server error');
        error.status = 511;

        enhancedErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

        expect(statusMock).toHaveBeenCalledWith(511);
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Internal Server Error'
          })
        );
      });
    });

    describe('Operational Errors', () => {
      it('should use error message for operational errors', () => {
        const error: ErrorWithStatus = new Error('User not found');
        error.status = 404;
        error.isOperational = true;

        enhancedErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'User not found',
            details: 'User not found'
          })
        );
      });

      it('should treat errors with status < 500 as operational', () => {
        const error: ErrorWithStatus = new Error('Validation failed');
        error.status = 400;

        enhancedErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

        const call = jsonMock.mock.calls[0][0];
        expect(call).toHaveProperty('details', 'Validation failed');
      });

      it('should not treat 500+ errors as operational by default', () => {
        const error: ErrorWithStatus = new Error('Database error');
        error.status = 500;

        enhancedErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

        const call = jsonMock.mock.calls[0][0];
        expect(call).not.toHaveProperty('details');
      });
    });

    describe('Development vs Production Mode', () => {
      it('should include error details in development mode', () => {
        process.env.NODE_ENV = 'development';
        const error: ErrorWithStatus = new Error('Detailed error message');
        error.status = 500;

        enhancedErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            details: 'Detailed error message'
          })
        );
      });

      it('should include stack trace in development for 500+ errors', () => {
        process.env.NODE_ENV = 'development';
        const error: ErrorWithStatus = new Error('Server error');
        error.status = 500;
        error.stack = 'Error: Server error\n    at test.ts:10:5';

        enhancedErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            stack: 'Error: Server error\n    at test.ts:10:5'
          })
        );
      });

      it('should not include stack trace in development for 4xx errors', () => {
        process.env.NODE_ENV = 'development';
        const error: ErrorWithStatus = new Error('Client error');
        error.status = 400;
        error.stack = 'Error: Client error\n    at test.ts:10:5';

        enhancedErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

        const call = jsonMock.mock.calls[0][0];
        expect(call).not.toHaveProperty('stack');
      });

      it('should not include stack trace in production', () => {
        process.env.NODE_ENV = 'production';
        const error: ErrorWithStatus = new Error('Production error');
        error.status = 500;
        error.stack = 'Error: Production error\n    at test.ts:10:5';

        enhancedErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

        const call = jsonMock.mock.calls[0][0];
        expect(call).not.toHaveProperty('stack');
      });

      it('should not include error details in production for non-operational errors', () => {
        process.env.NODE_ENV = 'production';
        const error: ErrorWithStatus = new Error('Sensitive error details');
        error.status = 500;

        enhancedErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

        const call = jsonMock.mock.calls[0][0];
        expect(call).not.toHaveProperty('details');
      });
    });

    describe('Error Context', () => {
      it('should include request context in error logs', () => {
        const error: ErrorWithStatus = new Error('Test error');
        error.status = 500;

        (mockRequest as any).requestId = 'req-123';
        (mockRequest as any).user = { id: 'user-456' };

        enhancedErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockLogger.error).toHaveBeenCalledWith(
          'Server Error',
          expect.objectContaining({ name: error.name, message: error.message }),
          expect.objectContaining({
            method: 'GET',
            url: '/api/test',
            userAgent: 'Mozilla/5.0',
            ip: '127.0.0.1',
            requestId: 'req-123',
            userId: 'user-456',
            statusCode: 500,
            isOperational: false
          })
        );
      });

      it('should include requestId in response', () => {
        const error: ErrorWithStatus = new Error('Test error');
        error.status = 400;
        (mockRequest as any).requestId = 'req-789';

        enhancedErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            requestId: 'req-789'
          })
        );
      });

      it('should handle missing user context gracefully', () => {
        const error: ErrorWithStatus = new Error('Test error');
        error.status = 500;

        enhancedErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockLogger.error).toHaveBeenCalledWith(
          'Server Error',
          expect.objectContaining({ name: error.name, message: error.message }),
          expect.objectContaining({
            userId: undefined
          })
        );
      });
    });

    describe('Logging Levels', () => {
      it('should log 500+ errors as error level', () => {
        const error: ErrorWithStatus = new Error('Server error');
        error.status = 500;

        enhancedErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockLogger.error).toHaveBeenCalled();
        expect(mockLogger.warn).not.toHaveBeenCalled();
        expect(mockLogger.info).not.toHaveBeenCalled();
      });

      it('should log 400-499 errors as warn level', () => {
        const error: ErrorWithStatus = new Error('Client error');
        error.status = 404;

        enhancedErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockLogger.warn).toHaveBeenCalled();
        expect(mockLogger.error).not.toHaveBeenCalled();
        expect(mockLogger.info).not.toHaveBeenCalled();
      });

      it('should log <400 errors as info level', () => {
        const error: ErrorWithStatus = new Error('Redirect');
        error.status = 301;

        enhancedErrorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockLogger.info).toHaveBeenCalled();
        expect(mockLogger.error).not.toHaveBeenCalled();
        expect(mockLogger.warn).not.toHaveBeenCalled();
      });
    });
  });

  describe('setupGlobalErrorHandlers', () => {
    let originalProcessOn: any;
    let originalProcessExit: any;
    let processListeners: Map<string, Function>;
    let mockProcessExit: jest.Mock;

    beforeEach(() => {
      processListeners = new Map();
      originalProcessOn = process.on;
      originalProcessExit = process.exit;

      // Mock process.exit globally for all tests in this suite
      mockProcessExit = jest.fn() as any;
      process.exit = mockProcessExit;

      // Mock process.on to capture listeners
      process.on = jest.fn((event: string, handler: Function) => {
        processListeners.set(event, handler);
        return process;
      }) as any;
    });

    afterEach(() => {
      process.on = originalProcessOn;
      process.exit = originalProcessExit;
    });

    it('should register unhandledRejection handler', () => {
      setupGlobalErrorHandlers();

      expect(process.on).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
    });

    it('should register uncaughtException handler', () => {
      setupGlobalErrorHandlers();

      expect(process.on).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
    });

    it('should register SIGTERM handler', () => {
      setupGlobalErrorHandlers();

      expect(process.on).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    });

    it('should register SIGINT handler', () => {
      setupGlobalErrorHandlers();

      expect(process.on).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    });

    it('should log unhandled promise rejections', () => {
      setupGlobalErrorHandlers();

      const handler = processListeners.get('unhandledRejection');
      const testError = new Error('Unhandled rejection');
      const testPromise = { toString: () => 'Promise<rejected>' } as any;

      handler?.(testError, testPromise);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Unhandled Promise Rejection',
        testError,
        expect.objectContaining({
          reason: expect.any(String),
          stack: expect.any(String)
        })
      );
    });

    it('should log uncaught exceptions', () => {
      setupGlobalErrorHandlers();

      const handler = processListeners.get('uncaughtException');
      const testError = new Error('Uncaught exception');

      handler?.(testError);

      expect(mockLogger.error).toHaveBeenCalledWith('Uncaught Exception', testError);
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle unhandled rejections in E2E mode without exiting', () => {
      process.env.NODE_ENV = 'e2e';

      setupGlobalErrorHandlers();

      const handler = processListeners.get('unhandledRejection');
      const testError = new Error('E2E rejection');
      const testPromise = { toString: () => 'Promise<rejected>' } as any;

      handler?.(testError, testPromise);

      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockProcessExit).not.toHaveBeenCalled();
    });

    it('should not exit on unhandled rejection in production', () => {
      process.env.NODE_ENV = 'production';

      setupGlobalErrorHandlers();

      const handler = processListeners.get('unhandledRejection');
      const testError = new Error('Production rejection');
      const testPromise = { toString: () => 'Promise<rejected>' } as any;

      handler?.(testError, testPromise);

      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockProcessExit).not.toHaveBeenCalled();
    });

    it('should exit on unhandled rejection in development', () => {
      process.env.NODE_ENV = 'development';

      setupGlobalErrorHandlers();

      const handler = processListeners.get('unhandledRejection');
      const testError = new Error('Dev rejection');
      const testPromise = { toString: () => 'Promise<rejected>' } as any;

      handler?.(testError, testPromise);

      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle graceful shutdown on SIGTERM', () => {
      jest.useFakeTimers();

      setupGlobalErrorHandlers();

      const handler = processListeners.get('SIGTERM');

      handler?.();

      expect(mockLogger.info).toHaveBeenCalledWith('Received SIGTERM, shutting down gracefully...');

      // Fast-forward time
      jest.advanceTimersByTime(5000);

      expect(mockLogger.info).toHaveBeenCalledWith('Shutdown complete');
      expect(mockProcessExit).toHaveBeenCalledWith(0);

      jest.useRealTimers();
    });

    it('should handle graceful shutdown on SIGINT', () => {
      jest.useFakeTimers();

      setupGlobalErrorHandlers();

      const handler = processListeners.get('SIGINT');

      handler?.();

      expect(mockLogger.info).toHaveBeenCalledWith('Received SIGINT, shutting down gracefully...');

      // Fast-forward time
      jest.advanceTimersByTime(5000);

      expect(mockLogger.info).toHaveBeenCalledWith('Shutdown complete');
      expect(mockProcessExit).toHaveBeenCalledWith(0);

      jest.useRealTimers();
    });
  });
});
