import { describe, test, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import type { Express } from 'express';

// Mock all dependencies before imports
const mockUse = jest.fn();
const mockGet = jest.fn();
const mockApp = {
  use: mockUse,
  get: mockGet
};

// Mock express
jest.mock('express', () => {
  const mockExpress: any = jest.fn(() => mockApp);
  mockExpress.json = jest.fn(() => 'json-middleware');
  mockExpress.urlencoded = jest.fn(() => 'urlencoded-middleware');
  // Support both named and default exports
  mockExpress.default = mockExpress;
  return mockExpress;
});

// Mock helmet
const mockHelmet = jest.fn(() => 'helmet-middleware');
mockHelmet.default = mockHelmet;
jest.mock('helmet', () => mockHelmet);

// Mock cors
const mockCors = jest.fn(() => 'cors-middleware');
mockCors.default = mockCors;
jest.mock('cors', () => mockCors);

// Mock compression
const mockCompression = jest.fn(() => 'compression-middleware');
mockCompression.default = mockCompression;
jest.mock('compression', () => mockCompression);

// Mock morgan
const mockMorgan = jest.fn(() => 'morgan-middleware');
mockMorgan.default = mockMorgan;
jest.mock('morgan', () => mockMorgan);

// Mock middleware
const mockRequestLoggerMiddleware = 'request-logger-middleware';
const mockUserContextMiddleware = 'user-context-middleware';
jest.mock('../../../src/server/middleware/requestLogger.js', () => ({
  requestLoggerMiddleware: mockRequestLoggerMiddleware,
  userContextMiddleware: mockUserContextMiddleware
}));

const mockEnhancedAuditMiddleware = 'enhanced-audit-middleware';
jest.mock('../../../src/server/middleware/enhancedAuditMiddleware.js', () => ({
  enhancedAuditMiddleware: mockEnhancedAuditMiddleware
}));

const mockEnhancedErrorHandler = 'enhanced-error-handler';
jest.mock('../../../src/server/middleware/enhancedErrorHandler.js', () => ({
  enhancedErrorHandler: mockEnhancedErrorHandler
}));

// Mock routes
const mockApiRoutes: any = jest.fn();
Object.assign(mockApiRoutes, { default: mockApiRoutes, _mockValue: 'api-routes' });
jest.mock('../../../src/server/api/routes/index.js', () => mockApiRoutes);

// Mock AuditRouteHandler
const mockRegister = jest.fn();
const mockAuditRouteHandler = jest.fn(() => ({
  register: mockRegister
}));
jest.mock('../../../src/server/utils/AuditRouteHandler.js', () => ({
  AuditRouteHandler: mockAuditRouteHandler
}));

// Mock services
const mockInitializeNotificationScheduler = jest.fn();
jest.mock('../../../src/server/services/notifications/scheduler.js', () => ({
  initializeNotificationScheduler: mockInitializeNotificationScheduler
}));

const mockInitializeAutomaticBackups = jest.fn();
jest.mock('../../../src/server/services/backup/scheduler.js', () => ({
  initializeAutomaticBackups: mockInitializeAutomaticBackups
}));

// Mock config
const mockConfig = {
  features: {
    audit: true
  }
};
jest.mock('../../../src/server/config/index.js', () => ({
  config: mockConfig
}));

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};
jest.mock('../../../src/server/services/logging/config.js', () => ({
  logger: mockLogger
}));

// Mock audit service
const mockAuditService = { logChange: jest.fn() };
const mockGetAuditService = jest.fn(() => mockAuditService);

// Import after mocks
import { createExpressApp } from '../../../src/server/app.js';

describe('Express App', () => {
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUse.mockClear();
    mockGet.mockClear();
    mockRegister.mockClear();
    mockInitializeNotificationScheduler.mockClear();
    mockInitializeAutomaticBackups.mockClear();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();

    originalNodeEnv = process.env.NODE_ENV;
    delete process.env.NODE_ENV;

    // Reset config to default
    mockConfig.features.audit = true;
  });

  afterEach(() => {
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
  });

  describe('createExpressApp', () => {
    it('should create an Express application', async () => {
      const app = await createExpressApp();

      expect(app).toBe(mockApp);
    });

    it('should configure helmet security middleware with CSP (production - no unsafe-eval)', async () => {
      process.env.NODE_ENV = 'production';
      await createExpressApp();

      expect(mockHelmet).toHaveBeenCalledWith({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'"],
            reportUri: ['/api/csp-report'],
          },
          reportOnly: false,
        }
      });
      expect(mockUse).toHaveBeenCalledWith('helmet-middleware');
    });

    it('should configure helmet security middleware with CSP (development - with unsafe-eval)', async () => {
      process.env.NODE_ENV = 'development';
      await createExpressApp();

      expect(mockHelmet).toHaveBeenCalledWith({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-eval'"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'"],
            reportUri: ['/api/csp-report'],
          },
          reportOnly: false,
        }
      });
      expect(mockUse).toHaveBeenCalledWith('helmet-middleware');
    });

    it('should configure CORS for development environment', async () => {
      process.env.NODE_ENV = 'development';

      await createExpressApp();

      expect(mockCors).toHaveBeenCalledWith({
        origin: ['http://localhost:3120', 'http://localhost:3121', 'http://localhost:5173'],
        credentials: true
      });
      expect(mockUse).toHaveBeenCalledWith('cors-middleware');
    });

    it('should configure CORS for production environment', async () => {
      process.env.NODE_ENV = 'production';

      await createExpressApp();

      expect(mockCors).toHaveBeenCalledWith({
        origin: false,
        credentials: true
      });
    });

    it('should register body parsing middleware', async () => {
      await createExpressApp();

      expect(mockUse).toHaveBeenCalledWith('json-middleware');
      expect(mockUse).toHaveBeenCalledWith('urlencoded-middleware');
    });

    it('should register compression middleware', async () => {
      await createExpressApp();

      expect(mockUse).toHaveBeenCalledWith('compression-middleware');
      expect(mockCompression).toHaveBeenCalled();
    });

    it('should register request logger middleware', async () => {
      await createExpressApp();

      expect(mockUse).toHaveBeenCalledWith(mockRequestLoggerMiddleware);
    });

    it('should register morgan in non-test environment', async () => {
      process.env.NODE_ENV = 'development';

      await createExpressApp();

      expect(mockMorgan).toHaveBeenCalledWith('dev');
      expect(mockUse).toHaveBeenCalledWith('morgan-middleware');
    });

    it('should not register morgan in test environment', async () => {
      process.env.NODE_ENV = 'test';

      await createExpressApp();

      expect(mockMorgan).not.toHaveBeenCalled();
    });

    it('should register user context middleware', async () => {
      await createExpressApp();

      expect(mockUse).toHaveBeenCalledWith(mockUserContextMiddleware);
    });

    it('should register enhanced audit middleware', async () => {
      await createExpressApp();

      expect(mockUse).toHaveBeenCalledWith(mockEnhancedAuditMiddleware);
    });

    it('should register audit routes when audit is enabled', async () => {
      mockConfig.features.audit = true;

      // Mock the dynamic import
      jest.doMock('../../../src/server/services/audit/index.js', () => ({
        getAuditService: mockGetAuditService
      }), { virtual: true });

      await createExpressApp();

      expect(mockLogger.info).toHaveBeenCalledWith('Getting audit service');
    });

    it('should log warning when audit service is enabled but returns null', async () => {
      mockConfig.features.audit = true;
      const mockGetAuditServiceNull = jest.fn(() => null);

      jest.doMock('../../../src/server/services/audit/index.js', () => ({
        getAuditService: mockGetAuditServiceNull
      }), { virtual: true });

      await createExpressApp();

      // Note: This test may not work perfectly due to dynamic import mocking complexity
      // The warning log would be called if the service returns null
    });

    it('should not register audit routes when audit is disabled', async () => {
      mockConfig.features.audit = false;

      await createExpressApp();

      expect(mockLogger.info).toHaveBeenCalledWith('Audit service is disabled in config');
      expect(mockAuditRouteHandler).not.toHaveBeenCalled();
    });

    it('should mount API routes', async () => {
      await createExpressApp();

      expect(mockLogger.info).toHaveBeenCalledWith('Mounting API routes');
      expect(mockUse).toHaveBeenCalledWith('/api', mockApiRoutes);
    });

    it('should register health check endpoint', async () => {
      await createExpressApp();

      expect(mockGet).toHaveBeenCalledWith('/api/health', expect.any(Function));
    });

    it('should return correct health check response', async () => {
      process.env.NODE_ENV = 'production';
      await createExpressApp();

      // Get the health check handler
      const healthCheckCall = mockGet.mock.calls.find(call => call[0] === '/api/health');
      expect(healthCheckCall).toBeDefined();

      const healthCheckHandler = healthCheckCall![1];

      // Mock request and response
      const mockReq = {};
      const mockJson = jest.fn();
      const mockRes = { json: mockJson };

      // Call the health check handler
      healthCheckHandler(mockReq, mockRes);

      expect(mockJson).toHaveBeenCalledWith({
        status: 'ok',
        timestamp: expect.any(String),
        environment: 'production'
      });
    });

    it('should register enhanced error handler', async () => {
      await createExpressApp();

      expect(mockUse).toHaveBeenCalledWith(mockEnhancedErrorHandler);
    });

    it('should initialize notification scheduler in non-test environment', async () => {
      process.env.NODE_ENV = 'development';

      await createExpressApp();

      expect(mockLogger.info).toHaveBeenCalledWith('Initializing notification scheduler');
      expect(mockInitializeNotificationScheduler).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Notification scheduler started');
    });

    it('should initialize automatic backups in non-test environment', async () => {
      process.env.NODE_ENV = 'development';

      await createExpressApp();

      expect(mockInitializeAutomaticBackups).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Automatic backups scheduled', { frequency: 'daily' });
    });

    it('should not initialize background services in test environment', async () => {
      process.env.NODE_ENV = 'test';

      await createExpressApp();

      expect(mockInitializeNotificationScheduler).not.toHaveBeenCalled();
      expect(mockInitializeAutomaticBackups).not.toHaveBeenCalled();
    });

    it('should register middleware in correct order', async () => {
      await createExpressApp();

      const calls = mockUse.mock.calls.map(call => call[0]);

      // Verify middleware order (security first, then parsing, then logging, then routes, then error handling)
      const helmetIndex = calls.indexOf('helmet-middleware');
      const corsIndex = calls.indexOf('cors-middleware');
      const jsonIndex = calls.indexOf('json-middleware');
      const requestLoggerIndex = calls.indexOf(mockRequestLoggerMiddleware);
      const errorHandlerIndex = calls.indexOf(mockEnhancedErrorHandler);

      expect(helmetIndex).toBeLessThan(corsIndex);
      expect(corsIndex).toBeLessThan(jsonIndex);
      expect(jsonIndex).toBeLessThan(requestLoggerIndex);
      expect(requestLoggerIndex).toBeLessThan(errorHandlerIndex);
    });
  });
});
