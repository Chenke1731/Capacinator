/**
 * Rate limiter contract (S2, optimization plan 2026-09-28): no global
 * rate limiting exists today — personId brute-force login and scripted
 * write floods are unimpeded. Two tiers: global default (300/15min) and
 * a strict login tier (10/15min). Test stacks (NODE_ENV=test/e2e: Jest
 * 4200+ tests and Playwright suites would trip any real limit within
 * seconds) are exempt by design — the test stacks themselves are the
 * guard that the exemption keeps working.
 */
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import supertest from 'supertest';
import express from 'express';
import { createGlobalLimiter, createLoginLimiter, GLOBAL_TIER, LOGIN_TIER } from '../../../../src/server/middleware/rateLimiter';

const ORIGINAL_ENV = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_ENV;
});

const hit = async (middleware: any, path = '/probe', n = 1) => {
  const app = express();
  app.use(middleware);
  app.use(path, (_req: any, res: any) => res.json({ ok: true }));
  const request = supertest(app);
  const statuses: number[] = [];
  for (let i = 0; i < n; i++) {
    statuses.push((await request.get(path)).status);
  }
  return statuses;
};

describe('rate limiter (S2)', () => {
  test('test/e2e environments bypass the limiter entirely', async () => {
    process.env.NODE_ENV = 'e2e';
    const statuses = await hit(createGlobalLimiter({ max: 3 }), '/probe', 20);
    expect(statuses.filter((s) => s === 200)).toHaveLength(20);
  });

  test('real environments trip the configured threshold with 429', async () => {
    process.env.NODE_ENV = 'production';
    const statuses = await hit(createGlobalLimiter({ max: 3 }), '/probe', 5);
    expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
    expect(statuses.slice(3)).toEqual([429, 429]);
  });

  test('429 responses carry the standard headers and an error body', async () => {
    process.env.NODE_ENV = 'production';
    const app = express();
    app.use(createGlobalLimiter({ max: 1 }));
    app.use('/probe', (_req: any, res: any) => res.json({ ok: true }));
    const request = supertest(app);
    await request.get('/probe');
    const res = await request.get('/probe');
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('rate_limited');
    expect(res.headers['ratelimit-remaining']).toBe('0');
  });

  test('default tiers: global 300/15min, login 10/15min, when not overridden', async () => {
    expect(GLOBAL_TIER).toEqual({ windowMs: 15 * 60 * 1000, max: 300 });
    expect(LOGIN_TIER).toEqual({ windowMs: 15 * 60 * 1000, max: 10 });
  });
});
