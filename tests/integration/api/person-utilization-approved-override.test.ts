/**
 * 迁移 076（工作台 v2 §9.2.7 / Claude 复评盯点 2）：
 * person_utilization_view 的可用率覆盖只取 is_approved=1——
 * 未批准覆盖不得改写 current_availability_percentage 与相对判档，
 * 与 fetchApprovedAvailabilityOverrides / CapacityCalculator 同口径。
 */
import { describe, test, expect, beforeAll } from '@jest/globals';
import { randomUUID } from 'crypto';
import { db } from '../setup';
import { personUtilizationRows } from '../../../src/server/services/calc/personUtilization';
import { BASELINE_SCENARIO_ID } from '../../../src/server/services/calc/effectiveAssignments';

const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const PERSON_APPROVED_ID = `m076-person-approved-${SUFFIX}`;
const PERSON_PENDING_ID = `m076-person-pending-${SUFFIX}`;
const PERSON_PLAIN_ID = `m076-person-plain-${SUFFIX}`;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

beforeAll(async () => {
  const today = todayISO();
  await db('people').insert([
    {
      id: PERSON_APPROVED_ID,
      name: `M076 Approved ${SUFFIX}`,
      email: `m076-approved-${SUFFIX}@example.com`,
      worker_type: 'FTE',
      default_availability_percentage: 100,
      default_hours_per_day: 8,
      is_active: true,
    },
    {
      id: PERSON_PENDING_ID,
      name: `M076 Pending ${SUFFIX}`,
      email: `m076-pending-${SUFFIX}@example.com`,
      worker_type: 'FTE',
      default_availability_percentage: 100,
      default_hours_per_day: 8,
      is_active: true,
    },
    {
      id: PERSON_PLAIN_ID,
      name: `M076 Plain ${SUFFIX}`,
      email: `m076-plain-${SUFFIX}@example.com`,
      worker_type: 'FTE',
      default_availability_percentage: 80,
      default_hours_per_day: 8,
      is_active: true,
    },
  ]);
  await db('person_availability_overrides').insert([
    {
      id: randomUUID(),
      person_id: PERSON_APPROVED_ID,
      start_date: shiftDays(today, -10),
      end_date: shiftDays(today, 10),
      availability_percentage: 40,
      reason: 'approved leave',
      is_approved: true,
      approved_by: null,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: randomUUID(),
      person_id: PERSON_PENDING_ID,
      start_date: shiftDays(today, -10),
      end_date: shiftDays(today, 10),
      availability_percentage: 50,
      reason: 'pending leave',
      is_approved: false,
      approved_by: null,
      created_at: new Date(),
      updated_at: new Date(),
    },
  ]);
});

async function viewRow(personId: string): Promise<Record<string, any>> {
  const row = await db('person_utilization_view').where('person_id', personId).first();
  expect(row).toBeTruthy();
  return row as Record<string, any>;
}

describe('migration 076: person_utilization_view approved-only overrides', () => {
  test('已批准覆盖参与容量线（40% 生效）', async () => {
    const row = await viewRow(PERSON_APPROVED_ID);
    expect(Number(row.current_availability_percentage)).toBe(40);
  });

  test('未批准覆盖不参与容量线（保持默认 100，不落 50）', async () => {
    const row = await viewRow(PERSON_PENDING_ID);
    expect(Number(row.current_availability_percentage)).toBe(100);
    expect(row.availability_reason).toBeNull();
  });

  test('无覆盖人员保持默认可用率', async () => {
    const row = await viewRow(PERSON_PLAIN_ID);
    expect(Number(row.current_availability_percentage)).toBe(80);
  });

  test('personUtilizationRows 基线读取与视图同口径并返回 as_of', async () => {
    const rows = await personUtilizationRows(db, BASELINE_SCENARIO_ID);
    const approved = rows.find((r) => String(r.person_id) === PERSON_APPROVED_ID);
    const pending = rows.find((r) => String(r.person_id) === PERSON_PENDING_ID);
    expect(approved).toBeDefined();
    expect(pending).toBeDefined();
    expect(Number(approved!.current_availability_percentage)).toBe(40);
    expect(Number(pending!.current_availability_percentage)).toBe(100);
    expect(typeof approved!.as_of).toBe('string');
    expect(String(approved!.as_of)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
