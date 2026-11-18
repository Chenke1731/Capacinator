/**
 * GET /availability?is_approved=true 必须命中真实 approved 行：
 * Express 查询参数是字符串，SQLite 布尔列存 0/1——`where('is_approved','true')`
 * 在真库恒空（Claude 复审 P1-1）。此用例走真 migrations + 真 HTTP 查询串。
 */
import { describe, test, expect, beforeAll } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { db } from '../setup';
import { AvailabilityController } from '../../../src/server/api/controllers/AvailabilityController';

const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const PERSON_ID = `availability-filter-${SUFFIX}`;
const APPROVED_ID = randomUUID();
const PENDING_ID = randomUUID();

const controller = new AvailabilityController();
(controller as unknown as { db: unknown }).db = db;

const app = express();
app.get('/api/availability', (req, res) => {
  void controller.getAll(req, res);
});

beforeAll(async () => {
  await db('people').insert({
    id: PERSON_ID,
    name: `Availability Filter ${SUFFIX}`,
    email: `availability-filter-${SUFFIX}@example.com`,
    worker_type: 'FTE',
    default_availability_percentage: 100,
    default_hours_per_day: 8,
    is_active: true,
  });
  await db('person_availability_overrides').insert([
    {
      id: APPROVED_ID,
      person_id: PERSON_ID,
      start_date: '2026-01-01',
      end_date: '2026-01-31',
      availability_percentage: 0,
      reason: 'approved leave',
      is_approved: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: PENDING_ID,
      person_id: PERSON_ID,
      start_date: '2026-02-01',
      end_date: '2026-02-28',
      availability_percentage: 50,
      reason: 'pending leave',
      is_approved: false,
      created_at: new Date(),
      updated_at: new Date(),
    },
  ]);
});

describe('GET /api/availability is_approved filter', () => {
  test('is_approved=true 命中 approved 行并排除 pending（真 SQLite）', async () => {
    const response = await request(app)
      .get('/api/availability')
      .query({ person_id: PERSON_ID, is_approved: 'true' });

    expect(response.status).toBe(200);
    const rows = response.body.data as Array<{ id: string }>;
    expect(rows.some((row) => row.id === APPROVED_ID)).toBe(true);
    expect(rows.some((row) => row.id === PENDING_ID)).toBe(false);
    expect(response.body.pagination.total).toBe(1);
  });

  test('is_approved=false 命中 pending 行并排除 approved', async () => {
    const response = await request(app)
      .get('/api/availability')
      .query({ person_id: PERSON_ID, is_approved: 'false' });

    expect(response.status).toBe(200);
    const rows = response.body.data as Array<{ id: string }>;
    expect(rows.some((row) => row.id === PENDING_ID)).toBe(true);
    expect(rows.some((row) => row.id === APPROVED_ID)).toBe(false);
    expect(response.body.pagination.total).toBe(1);
  });
});
