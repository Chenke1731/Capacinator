/**
 * I01v/D17 回归：模板 0 天 = 显式零时长里程碑（合法），null/undefined 才缺省 30。
 * 旧实现 `|| 30` 把显式 0 吞成 30（B05/EXP-B05 族，0→30 天探针红证）。
 */
import { describe, test, expect, jest } from '@jest/globals';

jest.mock('../../logging/config.js', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { inheritProjectPhases } from '../phaseInheritance.js';

interface TemplateRow {
  template_phase_id: string;
  phase_id: string;
  default_duration_days: number | null | undefined;
  order_index: number;
  is_mandatory: boolean;
}

function makeDb(templateRows: TemplateRow[], project: { aspiration_start: string; aspiration_finish: string } | null) {
  const inserted: Array<Record<string, any>> = [];
  const db: any = (table: string) => {
    const builder: any = {
      select: () => builder,
      leftJoin: () => builder,
      where: () => builder,
      orderBy: () => Promise.resolve(templateRows),
      first: () => Promise.resolve(project),
      insert: (rows: Array<Record<string, any>>) => {
        inserted.push(...rows);
        return Promise.resolve([rows.length]);
      },
    };
    if (table === 'projects') {
      builder.first = () => Promise.resolve(project);
    }
    return builder;
  };
  return { db, inserted };
}

const PROJECT = { aspiration_start: '2026-01-05', aspiration_finish: '2026-12-31' };

describe('inheritProjectPhases（D17 0 天语义）', () => {
  test('模板 0 天 → start==end（零时长里程碑），下一阶段同日起步', async () => {
    const { db, inserted } = makeDb(
      [
        { template_phase_id: 't1', phase_id: 'p1', default_duration_days: 0, order_index: 1, is_mandatory: true },
        { template_phase_id: 't2', phase_id: 'p2', default_duration_days: 10, order_index: 2, is_mandatory: false },
      ],
      PROJECT
    );

    const count = await inheritProjectPhases(db, 'proj-1', 'type-1');

    expect(count).toBe(2);
    expect(inserted[0].start_date).toBe('2026-01-05');
    expect(inserted[0].end_date).toBe('2026-01-05');
    expect(inserted[0].original_duration_days).toBe(0);
    // 下一阶段从同一日（里程碑当日）起步
    expect(inserted[1].start_date).toBe('2026-01-05');
    expect(inserted[1].end_date).toBe('2026-01-15');
  });

  test('模板 null → 缺省 30 天（旧实现 0 天吞成 30 的反面）', async () => {
    const { db, inserted } = makeDb(
      [{ template_phase_id: 't1', phase_id: 'p1', default_duration_days: null, order_index: 1, is_mandatory: false }],
      PROJECT
    );

    await inheritProjectPhases(db, 'proj-1', 'type-1');

    expect(inserted[0].start_date).toBe('2026-01-05');
    expect(inserted[0].end_date).toBe('2026-02-04'); // +30 天
  });

  test('模板 duration undefined → 缺省 30 天', async () => {
    const { db, inserted } = makeDb(
      [{ template_phase_id: 't1', phase_id: 'p1', default_duration_days: undefined, order_index: 1, is_mandatory: false }],
      PROJECT
    );

    await inheritProjectPhases(db, 'proj-1', 'type-1');

    expect(inserted[0].end_date).toBe('2026-02-04');
  });

  test('非零显式时长保持（10 天）', async () => {
    const { db, inserted } = makeDb(
      [{ template_phase_id: 't1', phase_id: 'p1', default_duration_days: 10, order_index: 1, is_mandatory: false }],
      PROJECT
    );

    await inheritProjectPhases(db, 'proj-1', 'type-1');

    expect(inserted[0].end_date).toBe('2026-01-15');
  });
});
