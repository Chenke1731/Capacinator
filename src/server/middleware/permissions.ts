import type { Request, Response, NextFunction } from 'express';
import { UserPermissionsController } from '../api/controllers/UserPermissionsController.js';
import { authService, AuthError } from '../services/auth/index.js';
import { logger } from '../services/logging/config.js';

// Extend Request interface to include user info
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: string;
        name: string;
        email: string;
        is_system_admin: boolean;
        user_role_id?: string;
      };
    }
  }
}

const permissionsController = new UserPermissionsController();

// Helper to extract user ID — JWT payload is the only trusted source
function getUserIdFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const payload = authService.verifyAccessToken(token);
      return payload.userId;
    } catch (error) {
      if (error instanceof AuthError) {
        // IP-08b/S03: 验签失败不再回退自报身份——客户端宣称的 userId
        // 不是可信来源,无效令牌即 401
        logger.warn('JWT token validation failed', { errorMessage: error.message });
      }
      return null;
    }
  }
  // IP-08b/S03: x-user-id 头 / query.userId 回退已移除——任何人都能
  // 自报任意 userId,权限检查因此形同虚设
  return null;
}

// Middleware to check if user has required permission
export function requirePermission(permissionName: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserIdFromRequest(req);

      if (!userId) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'NO_USER',
          message: 'User ID not provided'
        });
      }

      // Check if user has the required permission
      const hasPermission = await permissionsController.hasPermission(userId, permissionName);

      if (!hasPermission) {
        return res.status(403).json({
          error: 'Insufficient permissions',
          code: 'PERMISSION_DENIED',
          message: `User does not have permission: ${permissionName}`
        });
      }

      // Set user info in request for downstream use
      const userInfo = await getUserInfo(userId);
      req.user = userInfo;

      next();
    } catch (error) {
      logger.error('Permission check error', error instanceof Error ? error : undefined, { context: 'requirePermission' });
      return res.status(500).json({
        error: 'Permission check failed',
        code: 'PERMISSION_ERROR',
        message: 'Could not verify user permissions'
      });
    }
  };
}

// Middleware to check if user is system admin
export function requireSystemAdmin() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserIdFromRequest(req);

      if (!userId) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'NO_USER',
          message: 'User ID not provided'
        });
      }

      const userInfo = await getUserInfo(userId);

      if (!userInfo.is_system_admin) {
        return res.status(403).json({
          error: 'System admin access required',
          code: 'NOT_ADMIN',
          message: 'Only system administrators can access this resource'
        });
      }

      req.user = userInfo;
      next();
    } catch (error) {
      logger.error('System admin check error', error instanceof Error ? error : undefined, { context: 'requireSystemAdmin' });
      return res.status(500).json({
        error: 'Authorization check failed',
        code: 'AUTH_ERROR',
        message: 'Could not verify system admin status'
      });
    }
  };
}

// Middleware to check multiple permissions (user needs ANY of them)
export function requireAnyPermission(...permissionNames: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserIdFromRequest(req);

      if (!userId) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'NO_USER',
          message: 'User ID not provided'
        });
      }

      // Check if user has any of the required permissions
      let hasAnyPermission = false;
      for (const permissionName of permissionNames) {
        const hasPermission = await permissionsController.hasPermission(userId, permissionName);
        if (hasPermission) {
          hasAnyPermission = true;
          break;
        }
      }

      if (!hasAnyPermission) {
        return res.status(403).json({
          error: 'Insufficient permissions',
          code: 'PERMISSION_DENIED',
          message: `User does not have any of the required permissions: ${permissionNames.join(', ')}`
        });
      }

      const userInfo = await getUserInfo(userId);
      req.user = userInfo;

      next();
    } catch (error) {
      logger.error('Permission check error', error instanceof Error ? error : undefined, { context: 'requireAnyPermission' });
      return res.status(500).json({
        error: 'Permission check failed',
        code: 'PERMISSION_ERROR',
        message: 'Could not verify user permissions'
      });
    }
  };
}

// Middleware to check multiple permissions (user needs ALL of them)
export function requireAllPermissions(...permissionNames: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserIdFromRequest(req);

      if (!userId) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'NO_USER',
          message: 'User ID not provided'
        });
      }

      // Check if user has all required permissions
      for (const permissionName of permissionNames) {
        const hasPermission = await permissionsController.hasPermission(userId, permissionName);
        if (!hasPermission) {
          return res.status(403).json({
            error: 'Insufficient permissions',
            code: 'PERMISSION_DENIED',
            message: `User does not have permission: ${permissionName}`
          });
        }
      }

      const userInfo = await getUserInfo(userId);
      req.user = userInfo;

      next();
    } catch (error) {
      logger.error('Permission check error', error instanceof Error ? error : undefined, { context: 'requireAllPermissions' });
      return res.status(500).json({
        error: 'Permission check failed',
        code: 'PERMISSION_ERROR',
        message: 'Could not verify user permissions'
      });
    }
  };
}

// Helper function to get user info
async function getUserInfo(userId: string) {
  const { db } = await import('../database/index.js');
  
  const user = await db('people')
    .leftJoin('user_roles', 'people.user_role_id', 'user_roles.id')
    .select(
      'people.id',
      'people.name',
      'people.email',
      'people.is_system_admin',
      'people.user_role_id',
      'user_roles.name as role_name'
    )
    .where('people.id', userId)
    .first();
  
  if (!user) {
    throw new Error('User not found');
  }
  
  return user;
}

// Middleware to optionally check permissions (doesn't block if no permission)
export function optionalPermission(permissionName: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserIdFromRequest(req);

      if (userId) {
        const userInfo = await getUserInfo(userId);
        req.user = userInfo;

        // Check permission but don't block if not granted
        const hasPermission = await permissionsController.hasPermission(userId, permissionName);
        (req.user as any).hasPermission = hasPermission;
      }

      next();
    } catch (error) {
      logger.warn('Optional permission check error', { error: error instanceof Error ? error.message : String(error), context: 'optionalPermission' });
      // Continue anyway for optional permissions
      next();
    }
  };
}

// Middleware to check if user can manage a specific resource
export function requireResourceAccess(resourceType: 'project' | 'person' | 'role') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserIdFromRequest(req);

      if (!userId) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'NO_USER',
          message: 'User ID not provided'
        });
      }

      const userInfo = await getUserInfo(userId);

      // System admins can access everything
      if (userInfo.is_system_admin) {
        req.user = userInfo;
        return next();
      }

      // Check resource-specific permissions
      const resourcePermissions = {
        project: ['project:edit', 'project:create'],
        person: ['people:edit', 'people:create'],
        role: ['role:edit', 'role:create']
      };

      const requiredPermissions = resourcePermissions[resourceType];

      let hasAccess = false;
      for (const permission of requiredPermissions) {
        const hasPermission = await permissionsController.hasPermission(userId, permission);
        if (hasPermission) {
          hasAccess = true;
          break;
        }
      }

      if (!hasAccess) {
        return res.status(403).json({
          error: 'Insufficient permissions',
          code: 'PERMISSION_DENIED',
          message: `User does not have permission to manage ${resourceType}s`
        });
      }

      req.user = userInfo;
      next();
    } catch (error) {
      logger.error('Resource access check error', error instanceof Error ? error : undefined, { context: 'requireResourceAccess', resourceType });
      return res.status(500).json({
        error: 'Access check failed',
        code: 'ACCESS_ERROR',
        message: 'Could not verify resource access'
      });
    }
  };
}