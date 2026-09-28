/**
 * Rate limiting (S2): the backend previously had none — personId
 * brute-force login (knowing a personId yields a token) and scripted
 * write floods were unimpeded. This is the one security item worth
 * doing despite the owner's security-deferral decision: it changes no
 * architecture and is invisible to normal usage.
 *
 * Two tiers: a global default (300 req/15min per IP) and a strict
 * login tier (10 req/15min per IP). Test stacks (NODE_ENV=test/e2e) are
 * exempt by design — Jest and Playwright would trip any real limit
 * within seconds; those stacks double as the canary that the exemption
 * keeps working.
 */
import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

const BYPASS_ENVS = new Set(['test', 'e2e']);

export interface LimiterOptions {
  windowMs?: number;
  max?: number;
}

const noOp = (_req: Request, _res: Response, next: NextFunction) => next();

// Exported as data so the tier defaults are testable without poking at
// the library middleware's internals (v7+ exposes no .max on the handler).
export const GLOBAL_TIER = { windowMs: 15 * 60 * 1000, max: 300 };
export const LOGIN_TIER = { windowMs: 15 * 60 * 1000, max: 10 };

const build = (defaults: { windowMs: number; max: number }, opts: LimiterOptions) => {
  if (BYPASS_ENVS.has(process.env.NODE_ENV || '')) {
    return noOp;
  }
  return rateLimit({
    windowMs: opts.windowMs ?? defaults.windowMs,
    max: opts.max ?? defaults.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'rate_limited', message: 'Too many requests, please slow down.' },
  });
};

export function createGlobalLimiter(opts: LimiterOptions = {}) {
  return build(GLOBAL_TIER, opts);
}

export function createLoginLimiter(opts: LimiterOptions = {}) {
  return build(LOGIN_TIER, opts);
}
