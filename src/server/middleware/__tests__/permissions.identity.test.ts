import { requirePermission } from '../permissions.js';

/**
 * IP-08b / S03: 移除客户端自报身份回退。
 * 旧回退:x-user-id 头或 query.userId 即可获得任意 userId——身份不是
 * 派发而来而是自报,权限检查形同虚设。唯一可信来源=JWT 载荷。
 */
jest.mock('../../api/controllers/UserPermissionsController.js', () => ({
  UserPermissionsController: jest.fn().mockImplementation(() => ({
    hasPermission: jest.fn().mockResolvedValue(true)
  }))
}));
jest.mock('../../services/auth/index.js', () => ({
  authService: {
    verifyAccessToken: jest.fn()
  },
  AuthError: class AuthError extends Error {}
}));
jest.mock('../../services/logging/config.js', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() }
}));
// getUserInfo 走 db('people') 链——给一个可链式查询桩
jest.mock('../../database/index.js', () => {
  const row = { id: 'user-1', name: 'U', email: 'u@x', is_system_admin: 0, user_role_id: null, role_name: null };
  const chain = {
    leftJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue(row)
  };
  return { db: jest.fn(() => chain) };
});

import { authService } from '../../services/auth/index.js';

const mkRes = () => {
  const res: any = { statusCode: 0, body: null };
  res.status = jest.fn((c: number) => { res.statusCode = c; return res; });
  res.json = jest.fn((b: unknown) => { res.body = b; return res; });
  return res;
};

describe('requirePermission 身份来源 (S03)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('x-user-id 头不再被接受为身份(自报身份回退已移除)', async () => {
    const req: any = { headers: { 'x-user-id': 'admin-user-1' }, query: {} };
    const res = mkRes();
    const next = jest.fn();

    await requirePermission('people:view')(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
    expect(authService.verifyAccessToken).not.toHaveBeenCalled(); // 无 Bearer 即不走验签
  });

  test('query.userId 同样不再被接受', async () => {
    const req: any = { headers: {}, query: { userId: 'admin-user-1' } };
    const res = mkRes();
    const next = jest.fn();

    await requirePermission('people:view')(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('有效 JWT 载荷仍是可信身份来源', async () => {
    (authService.verifyAccessToken as jest.Mock).mockReturnValue({ userId: 'user-1' });
    const req: any = { headers: { authorization: 'Bearer good-token' }, query: {} };
    const res = mkRes();
    const next = jest.fn();

    await requirePermission('people:view')(req, res, next);

    expect(authService.verifyAccessToken).toHaveBeenCalledWith('good-token');
    // hasPermission mock 返回 true → 放行(next 被调且 req.user 注入)
    expect(next).toHaveBeenCalled();
  });

  test('无效/过期 JWT 不再回退到自报身份——401', async () => {
    const { AuthError } = await import('../../services/auth/index.js');
    (authService.verifyAccessToken as jest.Mock).mockImplementation(() => {
      throw new AuthError('token expired', '401');
    });
    const req: any = {
      headers: { authorization: 'Bearer expired', 'x-user-id': 'admin-user-1' },
      query: { userId: 'admin-user-1' }
    };
    const res = mkRes();
    const next = jest.fn();

    await requirePermission('people:view')(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});
