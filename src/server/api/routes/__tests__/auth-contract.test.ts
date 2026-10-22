import request from 'supertest';
import express from 'express';
import authRouter from '../auth.js';

/**
 * IP-10 / S05: auth 三端点响应契约钉死——与 client/src/lib/api-client.ts 的
 * auth 块声明逐键对应。声明侧 login/me 已对齐(b2d3f70);本套件把运行真身
 * (routes/auth.ts 的 res.json 形状)钉住:服务端改名/增删键必须连带改声明,
 * 否则这里红。
 */

const mockTokenPayload = {
  userId: 'u1',
  email: 'u1@example.com',
  name: '测试用户',
  isSystemAdmin: false,
  userRoleId: 'r1',
};

const mockUser = { id: 'u1', name: '测试用户', email: 'u1@example.com' };

jest.mock('../../../services/auth/index.js', () => {
  class AuthError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.name = 'AuthError';
      this.code = code;
    }
  }
  return {
    AuthError,
    authService: {
      verifyAccessToken: jest.fn(() => mockTokenPayload),
      getUserById: jest.fn(async () => mockUser),
      loginByPersonId: jest.fn(async () => ({ accessToken: 'at-1', refreshToken: 'rt-1' })),
      refreshAccessToken: jest.fn(async () => ({ accessToken: 'at-2', refreshToken: 'rt-2' })),
    },
  };
});

describe('Auth routes 响应契约 (IP-10/S05)', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
  });

  test('GET /verify = { success, valid, user } — api-client 声明 { success; valid; user: TokenPayload }', async () => {
    const res = await request(app).get('/api/auth/verify').set('Authorization', 'Bearer test-token');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, valid: true, user: mockTokenPayload });
  });

  test('GET /verify 无 token → 401 { error, code, message }（信封规范）', async () => {
    const res = await request(app).get('/api/auth/verify');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: 'Authentication required',
      code: 'NO_TOKEN',
      message: 'Authorization header is missing',
    });
  });

  test('GET /me = { success, user } — api-client 声明 { success; user: Person }', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer test-token');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, user: mockUser });
  });

  test('POST /login = { success, user, accessToken, refreshToken } — 与声明一致', async () => {
    const res = await request(app).post('/api/auth/login').send({ personId: 'u1' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      user: mockUser,
      accessToken: 'at-1',
      refreshToken: 'rt-1',
    });
  });

  test('POST /login 缺 personId → 400 { error, code, message }', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'Validation error',
      code: 'MISSING_PERSON_ID',
      message: 'Person ID is required',
    });
  });

  test('POST /logout = { success, message } — api-client 声明 { success; message }', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Logged out successfully' });
  });

  test('POST /refresh = { success, accessToken, refreshToken } — 与声明一致', async () => {
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'rt-old' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, accessToken: 'at-2', refreshToken: 'rt-2' });
  });
});
