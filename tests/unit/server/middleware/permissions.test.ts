import { describe, test, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';

// Mock UserPermissionsController before importing permissions
const mockHasPermission = jest.fn();
jest.mock('../../../../src/server/api/controllers/UserPermissionsController.js', () => ({
  UserPermissionsController: jest.fn().mockImplementation(() => ({
    hasPermission: mockHasPermission
  }))
}));

// Mock database before importing permissions
let mockDbQuery: any;
const createMockDb = () => {
  const mock: any = jest.fn(() => mockDbQuery);
  mockDbQuery = {
    leftJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    first: jest.fn()
  };
  mock.leftJoin = mockDbQuery.leftJoin;
  mock.select = mockDbQuery.select;
  mock.where = mockDbQuery.where;
  mock.first = mockDbQuery.first;
  return mock;
};

const mockDb = createMockDb();

jest.mock('../../../../src/server/database/index.js', () => ({
  db: mockDb
}));

// Mock logger
const mockLogger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  http: jest.fn()
};

jest.mock('../../../../src/server/services/logging/config.js', () => ({
  logger: mockLogger
}));

// IP-08b/S03: JWT 载荷是唯一可信身份——旧套件以 x-user-id 自报身份驱动,
// 现统一改为 Bearer 令牌(默认放行 user-123,个别用例可覆写)
const mockVerifyAccessToken = jest.fn().mockReturnValue({ userId: 'user-123' });
jest.mock('../../../../src/server/services/auth/index.js', () => ({
  authService: { verifyAccessToken: mockVerifyAccessToken },
  AuthError: class MockAuthError extends Error { constructor(m: string) { super(m); } }
}));

import {
  requirePermission,
  requireSystemAdmin,
  requireAnyPermission,
  requireAllPermissions,
  optionalPermission,
  requireResourceAccess
} from '../../../../src/server/middleware/permissions.js';

describe('Permissions Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: jest.Mock<NextFunction>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    mockHasPermission.mockReset();

    // Setup mock request
    mockRequest = {
      headers: {},
      query: {},
      user: undefined
    };

    // Setup mock response
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    mockResponse = {
      status: statusMock as any,
      json: jsonMock
    };

    // Setup mock next
    mockNext = jest.fn() as jest.Mock<NextFunction>;

    // Reset mock db query
    mockDbQuery.leftJoin.mockReturnThis();
    mockDbQuery.select.mockReturnThis();
    mockDbQuery.where.mockReturnThis();
    mockDbQuery.first.mockResolvedValue(null);
  });

  describe('requirePermission', () => {
    it('should call next() when user has required permission', async () => {
      const mockUser = {
        id: 'user-123',
        name: 'John Doe',
        email: 'john@example.com',
        is_system_admin: false,
        user_role_id: 'role-1',
        role_name: 'Developer'
      };

      mockRequest.headers!['authorization'] = 'Bearer test-token'; // IP-08b: JWT 取代 x-user-id
      mockHasPermission.mockResolvedValue(true);
      mockDbQuery.first.mockResolvedValue(mockUser);

      const middleware = requirePermission('project:edit');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockHasPermission).toHaveBeenCalledWith('user-123', 'project:edit');
      expect(mockRequest.user).toEqual(mockUser);
      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should return 401 when user ID not provided in header', async () => {
      const middleware = requirePermission('project:edit');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Authentication required',
        code: 'NO_USER',
        message: 'User ID not provided'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('IP-08b: query 参数 userId 不再产生身份(自报回退移除)→401', async () => {
      mockRequest.query!.userId = 'user-456';

      const middleware = requirePermission('project:view');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(mockHasPermission).not.toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 403 when user lacks required permission', async () => {
      const mockUser = {
        id: 'user-123',
        name: 'John Doe',
        email: 'john@example.com',
        is_system_admin: false
      };

      mockRequest.headers!['authorization'] = 'Bearer test-token'; // IP-08b: JWT 取代 x-user-id
      mockHasPermission.mockResolvedValue(false);
      mockDbQuery.first.mockResolvedValue(mockUser);

      const middleware = requirePermission('project:delete');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Insufficient permissions',
        code: 'PERMISSION_DENIED',
        message: 'User does not have permission: project:delete'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 500 when getUserInfo throws error', async () => {
      mockRequest.headers!['authorization'] = 'Bearer test-token'; // IP-08b: JWT 取代 x-user-id
      mockHasPermission.mockResolvedValue(true);
      mockDbQuery.first.mockRejectedValue(new Error('Database connection failed'));
      mockLogger.error.mockClear();

      const middleware = requirePermission('project:edit');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Permission check failed',
        code: 'PERMISSION_ERROR',
        message: 'Could not verify user permissions'
      });
      expect(mockNext).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Permission check error',
        expect.any(Error),
        expect.objectContaining({ context: 'requirePermission' })
      );
    });

    it('should return 500 when hasPermission throws error', async () => {
      mockRequest.headers!['authorization'] = 'Bearer test-token'; // IP-08b: JWT 取代 x-user-id
      mockHasPermission.mockRejectedValue(new Error('Permission service unavailable'));
      mockLogger.error.mockClear();

      const middleware = requirePermission('project:edit');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Permission check failed',
        code: 'PERMISSION_ERROR',
        message: 'Could not verify user permissions'
      });
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should return 500 when user not found in database', async () => {
      mockVerifyAccessToken.mockReturnValueOnce({ userId: 'nonexistent-user' });
      mockRequest.headers!['authorization'] = 'Bearer test-token';
      mockHasPermission.mockResolvedValue(true);
      mockDbQuery.first.mockResolvedValue(null);
      mockLogger.error.mockClear();

      const middleware = requirePermission('project:edit');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Permission check error',
        expect.any(Error),
        expect.objectContaining({ context: 'requirePermission' })
      );
    });
  });

  describe('requireSystemAdmin', () => {
    it('should call next() when user is system admin', async () => {
      const mockAdminUser = {
        id: 'admin-123',
        name: 'Admin User',
        email: 'admin@example.com',
        is_system_admin: true,
        user_role_id: 'admin-role'
      };

      mockVerifyAccessToken.mockReturnValueOnce({ userId: 'admin-123' });
      mockRequest.headers!['authorization'] = 'Bearer test-token';
      mockDbQuery.first.mockResolvedValue(mockAdminUser);

      const middleware = requireSystemAdmin();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.user).toEqual(mockAdminUser);
      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should return 401 when user ID not provided', async () => {
      const middleware = requireSystemAdmin();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Authentication required',
        code: 'NO_USER',
        message: 'User ID not provided'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 403 when user is not system admin', async () => {
      const mockRegularUser = {
        id: 'user-123',
        name: 'Regular User',
        email: 'user@example.com',
        is_system_admin: false
      };

      mockRequest.headers!['authorization'] = 'Bearer test-token'; // IP-08b: JWT 取代 x-user-id
      mockDbQuery.first.mockResolvedValue(mockRegularUser);

      const middleware = requireSystemAdmin();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'System admin access required',
        code: 'NOT_ADMIN',
        message: 'Only system administrators can access this resource'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 500 when database query fails', async () => {
      mockRequest.headers!['authorization'] = 'Bearer test-token'; // IP-08b: JWT 取代 x-user-id
      mockDbQuery.first.mockRejectedValue(new Error('Database error'));
      mockLogger.error.mockClear();

      const middleware = requireSystemAdmin();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Authorization check failed',
        code: 'AUTH_ERROR',
        message: 'Could not verify system admin status'
      });
      expect(mockLogger.error).toHaveBeenCalledWith(
        'System admin check error',
        expect.any(Error),
        expect.objectContaining({ context: 'requireSystemAdmin' })
      );
    });

    it('should get user ID from query parameter', async () => {
      const mockAdminUser = {
        id: 'admin-789',
        name: 'Admin',
        email: 'admin@example.com',
        is_system_admin: true
      };

      mockVerifyAccessToken.mockReturnValueOnce({ userId: 'admin-789' });
      mockRequest.headers!['authorization'] = 'Bearer test-token';
      mockDbQuery.first.mockResolvedValue(mockAdminUser);

      const middleware = requireSystemAdmin();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('requireAnyPermission', () => {
    it('should call next() when user has one of the required permissions', async () => {
      const mockUser = {
        id: 'user-123',
        name: 'John Doe',
        email: 'john@example.com',
        is_system_admin: false
      };

      mockRequest.headers!['authorization'] = 'Bearer test-token'; // IP-08b: JWT 取代 x-user-id
      mockHasPermission
        .mockResolvedValueOnce(false)  // First permission denied
        .mockResolvedValueOnce(true);  // Second permission granted
      mockDbQuery.first.mockResolvedValue(mockUser);

      const middleware = requireAnyPermission('project:delete', 'project:edit');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockHasPermission).toHaveBeenCalledTimes(2);
      expect(mockHasPermission).toHaveBeenCalledWith('user-123', 'project:delete');
      expect(mockHasPermission).toHaveBeenCalledWith('user-123', 'project:edit');
      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should call next() when user has first permission (early exit)', async () => {
      const mockUser = {
        id: 'user-456',
        name: 'Jane Doe',
        email: 'jane@example.com',
        is_system_admin: false
      };

      mockVerifyAccessToken.mockReturnValueOnce({ userId: 'user-456' });
      mockRequest.headers!['authorization'] = 'Bearer test-token';
      mockHasPermission.mockResolvedValue(true);
      mockDbQuery.first.mockResolvedValue(mockUser);

      const middleware = requireAnyPermission('project:view', 'project:edit', 'project:delete');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Should stop checking after first success
      expect(mockHasPermission).toHaveBeenCalledTimes(1);
      expect(mockHasPermission).toHaveBeenCalledWith('user-456', 'project:view');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 401 when user ID not provided', async () => {
      const middleware = requireAnyPermission('project:edit', 'project:view');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Authentication required',
        code: 'NO_USER',
        message: 'User ID not provided'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 403 when user has none of the required permissions', async () => {
      const mockUser = {
        id: 'user-123',
        name: 'John Doe',
        email: 'john@example.com',
        is_system_admin: false
      };

      mockRequest.headers!['authorization'] = 'Bearer test-token'; // IP-08b: JWT 取代 x-user-id
      mockHasPermission.mockResolvedValue(false);
      mockDbQuery.first.mockResolvedValue(mockUser);

      const middleware = requireAnyPermission('project:delete', 'project:admin');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Insufficient permissions',
        code: 'PERMISSION_DENIED',
        message: 'User does not have any of the required permissions: project:delete, project:admin'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 500 when permission check throws error', async () => {
      mockRequest.headers!['authorization'] = 'Bearer test-token'; // IP-08b: JWT 取代 x-user-id
      mockHasPermission.mockRejectedValue(new Error('Service error'));
      mockLogger.error.mockClear();

      const middleware = requireAnyPermission('project:edit', 'project:view');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Permission check failed',
        code: 'PERMISSION_ERROR',
        message: 'Could not verify user permissions'
      });
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle single permission correctly', async () => {
      const mockUser = {
        id: 'user-123',
        name: 'John Doe',
        email: 'john@example.com',
        is_system_admin: false
      };

      mockRequest.headers!['authorization'] = 'Bearer test-token'; // IP-08b: JWT 取代 x-user-id
      mockHasPermission.mockResolvedValue(true);
      mockDbQuery.first.mockResolvedValue(mockUser);

      const middleware = requireAnyPermission('project:view');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockHasPermission).toHaveBeenCalledTimes(1);
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('requireAllPermissions', () => {
    it('should call next() when user has all required permissions', async () => {
      const mockUser = {
        id: 'user-123',
        name: 'John Doe',
        email: 'john@example.com',
        is_system_admin: false
      };

      mockRequest.headers!['authorization'] = 'Bearer test-token'; // IP-08b: JWT 取代 x-user-id
      mockHasPermission.mockResolvedValue(true);
      mockDbQuery.first.mockResolvedValue(mockUser);

      const middleware = requireAllPermissions('project:view', 'project:edit');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockHasPermission).toHaveBeenCalledTimes(2);
      expect(mockHasPermission).toHaveBeenCalledWith('user-123', 'project:view');
      expect(mockHasPermission).toHaveBeenCalledWith('user-123', 'project:edit');
      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should return 401 when user ID not provided', async () => {
      const middleware = requireAllPermissions('project:edit', 'project:delete');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Authentication required',
        code: 'NO_USER',
        message: 'User ID not provided'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 403 when user lacks one of the required permissions', async () => {
      const mockUser = {
        id: 'user-123',
        name: 'John Doe',
        email: 'john@example.com',
        is_system_admin: false
      };

      mockRequest.headers!['authorization'] = 'Bearer test-token'; // IP-08b: JWT 取代 x-user-id
      mockHasPermission
        .mockResolvedValueOnce(true)   // First permission granted
        .mockResolvedValueOnce(false); // Second permission denied
      mockDbQuery.first.mockResolvedValue(mockUser);

      const middleware = requireAllPermissions('project:view', 'project:delete');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Insufficient permissions',
        code: 'PERMISSION_DENIED',
        message: 'User does not have permission: project:delete'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should stop checking after first denied permission (early exit)', async () => {
      const mockUser = {
        id: 'user-123',
        name: 'John Doe',
        email: 'john@example.com',
        is_system_admin: false
      };

      mockRequest.headers!['authorization'] = 'Bearer test-token'; // IP-08b: JWT 取代 x-user-id
      mockHasPermission
        .mockResolvedValueOnce(false)  // First denied
        .mockResolvedValueOnce(true);  // Would grant, but shouldn't be called
      mockDbQuery.first.mockResolvedValue(mockUser);

      const middleware = requireAllPermissions('project:delete', 'project:view', 'project:edit');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Should stop after first failure
      expect(mockHasPermission).toHaveBeenCalledTimes(1);
      expect(mockHasPermission).toHaveBeenCalledWith('user-123', 'project:delete');
      expect(statusMock).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 500 when permission check throws error', async () => {
      mockRequest.headers!['authorization'] = 'Bearer test-token'; // IP-08b: JWT 取代 x-user-id
      mockHasPermission.mockRejectedValue(new Error('Permission service down'));
      mockLogger.error.mockClear();

      const middleware = requireAllPermissions('project:view', 'project:edit');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Permission check failed',
        code: 'PERMISSION_ERROR',
        message: 'Could not verify user permissions'
      });
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle single permission correctly', async () => {
      const mockUser = {
        id: 'user-123',
        name: 'John Doe',
        email: 'john@example.com',
        is_system_admin: false
      };

      mockRequest.headers!['authorization'] = 'Bearer test-token'; // IP-08b: JWT 取代 x-user-id
      mockHasPermission.mockResolvedValue(true);
      mockDbQuery.first.mockResolvedValue(mockUser);

      const middleware = requireAllPermissions('project:admin');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockHasPermission).toHaveBeenCalledTimes(1);
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('optionalPermission', () => {
    it('should call next() and set user with permission flag when permission granted', async () => {
      const mockUser = {
        id: 'user-123',
        name: 'John Doe',
        email: 'john@example.com',
        is_system_admin: false
      };

      mockRequest.headers!['authorization'] = 'Bearer test-token'; // IP-08b: JWT 取代 x-user-id
      mockHasPermission.mockResolvedValue(true);
      mockDbQuery.first.mockResolvedValue(mockUser);

      const middleware = optionalPermission('project:edit');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.user).toBeDefined();
      expect((mockRequest.user as any).hasPermission).toBe(true);
      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should call next() and set user with permission flag when permission denied', async () => {
      const mockUser = {
        id: 'user-123',
        name: 'John Doe',
        email: 'john@example.com',
        is_system_admin: false
      };

      mockRequest.headers!['authorization'] = 'Bearer test-token'; // IP-08b: JWT 取代 x-user-id
      mockHasPermission.mockResolvedValue(false);
      mockDbQuery.first.mockResolvedValue(mockUser);

      const middleware = optionalPermission('project:admin');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.user).toBeDefined();
      expect((mockRequest.user as any).hasPermission).toBe(false);
      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should call next() without user when no user ID provided', async () => {
      const middleware = optionalPermission('project:edit');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should call next() even when getUserInfo throws error', async () => {
      mockRequest.headers!['authorization'] = 'Bearer test-token'; // IP-08b: JWT 取代 x-user-id
      mockDbQuery.first.mockRejectedValue(new Error('Database error'));
      mockLogger.warn.mockClear();

      const middleware = optionalPermission('project:edit');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Optional permission check error',
        expect.objectContaining({ context: 'optionalPermission' })
      );
    });

    it('should call next() even when hasPermission throws error', async () => {
      const mockUser = {
        id: 'user-123',
        name: 'John Doe',
        email: 'john@example.com',
        is_system_admin: false
      };

      mockRequest.headers!['authorization'] = 'Bearer test-token'; // IP-08b: JWT 取代 x-user-id
      mockDbQuery.first.mockResolvedValue(mockUser);
      mockHasPermission.mockRejectedValue(new Error('Permission service error'));
      mockLogger.warn.mockClear();

      const middleware = optionalPermission('project:edit');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('requireResourceAccess', () => {
    it('should call next() when user is system admin (bypass permissions)', async () => {
      const mockAdminUser = {
        id: 'admin-123',
        name: 'Admin User',
        email: 'admin@example.com',
        is_system_admin: true
      };

      mockVerifyAccessToken.mockReturnValueOnce({ userId: 'admin-123' });
      mockRequest.headers!['authorization'] = 'Bearer test-token';
      mockDbQuery.first.mockResolvedValue(mockAdminUser);

      const middleware = requireResourceAccess('project');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.user).toEqual(mockAdminUser);
      expect(mockNext).toHaveBeenCalled();
      expect(mockHasPermission).not.toHaveBeenCalled(); // Should bypass permission check
    });

    it('should call next() when user has project:edit permission', async () => {
      const mockUser = {
        id: 'user-123',
        name: 'John Doe',
        email: 'john@example.com',
        is_system_admin: false
      };

      mockRequest.headers!['authorization'] = 'Bearer test-token'; // IP-08b: JWT 取代 x-user-id
      mockDbQuery.first.mockResolvedValue(mockUser);
      mockHasPermission
        .mockResolvedValueOnce(true);  // project:edit granted

      const middleware = requireResourceAccess('project');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockHasPermission).toHaveBeenCalledWith('user-123', 'project:edit');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should call next() when user has project:create permission', async () => {
      const mockUser = {
        id: 'user-123',
        name: 'John Doe',
        email: 'john@example.com',
        is_system_admin: false
      };

      mockRequest.headers!['authorization'] = 'Bearer test-token'; // IP-08b: JWT 取代 x-user-id
      mockDbQuery.first.mockResolvedValue(mockUser);
      mockHasPermission
        .mockResolvedValueOnce(false)  // project:edit denied
        .mockResolvedValueOnce(true);  // project:create granted

      const middleware = requireResourceAccess('project');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockHasPermission).toHaveBeenCalledTimes(2);
      expect(mockHasPermission).toHaveBeenCalledWith('user-123', 'project:create');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should work with person resource type', async () => {
      const mockUser = {
        id: 'user-123',
        name: 'John Doe',
        email: 'john@example.com',
        is_system_admin: false
      };

      mockRequest.headers!['authorization'] = 'Bearer test-token'; // IP-08b: JWT 取代 x-user-id
      mockDbQuery.first.mockResolvedValue(mockUser);
      mockHasPermission
        .mockResolvedValueOnce(true);  // people:edit granted

      const middleware = requireResourceAccess('person');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockHasPermission).toHaveBeenCalledWith('user-123', 'people:edit');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should work with role resource type', async () => {
      const mockUser = {
        id: 'user-123',
        name: 'John Doe',
        email: 'john@example.com',
        is_system_admin: false
      };

      mockRequest.headers!['authorization'] = 'Bearer test-token'; // IP-08b: JWT 取代 x-user-id
      mockDbQuery.first.mockResolvedValue(mockUser);
      mockHasPermission
        .mockResolvedValueOnce(false)  // role:edit denied
        .mockResolvedValueOnce(true);  // role:create granted

      const middleware = requireResourceAccess('role');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockHasPermission).toHaveBeenCalledWith('user-123', 'role:edit');
      expect(mockHasPermission).toHaveBeenCalledWith('user-123', 'role:create');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 401 when user ID not provided', async () => {
      const middleware = requireResourceAccess('project');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Authentication required',
        code: 'NO_USER',
        message: 'User ID not provided'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 403 when user lacks all resource permissions', async () => {
      const mockUser = {
        id: 'user-123',
        name: 'John Doe',
        email: 'john@example.com',
        is_system_admin: false
      };

      mockRequest.headers!['authorization'] = 'Bearer test-token'; // IP-08b: JWT 取代 x-user-id
      mockDbQuery.first.mockResolvedValue(mockUser);
      mockHasPermission.mockResolvedValue(false);

      const middleware = requireResourceAccess('project');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Insufficient permissions',
        code: 'PERMISSION_DENIED',
        message: 'User does not have permission to manage projects'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 500 when database query fails', async () => {
      mockRequest.headers!['authorization'] = 'Bearer test-token'; // IP-08b: JWT 取代 x-user-id
      mockDbQuery.first.mockRejectedValue(new Error('Database connection failed'));
      mockLogger.error.mockClear();

      const middleware = requireResourceAccess('project');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Access check failed',
        code: 'ACCESS_ERROR',
        message: 'Could not verify resource access'
      });
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Resource access check error',
        expect.any(Error),
        expect.objectContaining({ context: 'requireResourceAccess', resourceType: 'project' })
      );
    });

    it('should return 500 when permission check throws error', async () => {
      const mockUser = {
        id: 'user-123',
        name: 'John Doe',
        email: 'john@example.com',
        is_system_admin: false
      };

      mockRequest.headers!['authorization'] = 'Bearer test-token'; // IP-08b: JWT 取代 x-user-id
      mockDbQuery.first.mockResolvedValue(mockUser);
      mockHasPermission.mockRejectedValue(new Error('Permission service unavailable'));
      mockLogger.error.mockClear();

      const middleware = requireResourceAccess('person');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Resource access check error',
        expect.any(Error),
        expect.objectContaining({ context: 'requireResourceAccess', resourceType: 'person' })
      );
    });

    it('should prioritize header over query for user ID', async () => {
      const mockUser = {
        id: 'header-user',
        name: 'Header User',
        email: 'header@example.com',
        is_system_admin: true
      };

      mockVerifyAccessToken.mockReturnValueOnce({ userId: 'header-user' });
      mockRequest.headers!['authorization'] = 'Bearer test-token';
      mockVerifyAccessToken.mockReturnValueOnce({ userId: 'query-user' });
      mockRequest.headers!['authorization'] = 'Bearer test-token';
      mockDbQuery.first.mockResolvedValue(mockUser);

      const middleware = requireResourceAccess('project');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Should use header user ID
      expect(mockDbQuery.where).toHaveBeenCalledWith('people.id', 'header-user');
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Integration Tests', () => {
    it('should work with complete request flow', async () => {
      const mockUser = {
        id: 'user-123',
        name: 'John Doe',
        email: 'john@example.com',
        is_system_admin: false,
        user_role_id: 'role-1',
        role_name: 'Developer'
      };

      mockVerifyAccessToken.mockReset().mockReturnValue({ userId: 'user-123' }); // 清残留 once 队列
      mockRequest.headers!['authorization'] = 'Bearer test-token';
      mockHasPermission.mockResolvedValue(true);
      mockDbQuery.first.mockResolvedValue(mockUser);

      const middleware = requirePermission('project:edit');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Verify complete flow
      expect(mockHasPermission).toHaveBeenCalledWith('user-123', 'project:edit');
      expect(mockDbQuery.where).toHaveBeenCalledWith('people.id', 'user-123');
      expect(mockRequest.user).toEqual(mockUser);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should chain multiple permission middlewares', async () => {
      const mockUser = {
        id: 'user-123',
        name: 'John Doe',
        email: 'john@example.com',
        is_system_admin: false
      };

      mockRequest.headers!['authorization'] = 'Bearer test-token'; // IP-08b: JWT 取代 x-user-id
      mockHasPermission.mockResolvedValue(true);
      mockDbQuery.first.mockResolvedValue(mockUser);

      const middleware1 = requirePermission('project:view');
      const middleware2 = requirePermission('project:edit');

      await middleware1(mockRequest as Request, mockResponse as Response, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockRequest.user).toBeDefined();

      mockNext.mockClear();

      await middleware2(mockRequest as Request, mockResponse as Response, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
    });
  });
});
