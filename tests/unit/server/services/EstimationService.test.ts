import { describe, test, expect, jest } from '@jest/globals';

import {
  convertToPersonMonths,
  windowMonths,
  EstimationService,
  DEFAULT_CONVERSION
} from '../../../../src/server/services/estimation/EstimationService';

  function makeMockDb(
    teamBySide: Record<string, Array<{ id: string; name: string; availability: number }>>,
    assignments: any[],
    pools: any[] = []
  ) {
    // Two calls expected (design side, dev side); route by requested role names
    let call = 0;
    const sides: string[][] = [];
    const mockDb: any = (tableName: string) => {
      if (tableName === 'people') {
        const query: any = {
          select: jest.fn().mockReturnThis(),
          join: jest.fn().mockImplementation((_target: string, builder: any) => {
            // capture role filter from the later whereIn — simpler: record builder usage
            return query;
          }),
          where: jest.fn().mockReturnThis(),
          whereIn: jest.fn().mockImplementation((_col: string, values: string[]) => {
            sides.push(values);
            call += 1;
            return Promise.resolve(teamBySide[values[0]] ?? []);
          })
        };
        return query;
      }
      if (typeof tableName === 'string' && tableName.includes('effective_project_assignments')) {
        const query: any = {
          select: jest.fn().mockReturnThis(),
          whereIn: jest.fn().mockReturnThis(),
          where: jest.fn().mockImplementation((builder: any) => {
            // scenario filter builder — not executed in mock
            void builder;
            return Promise.resolve(assignments);
          })
        };
        return query;
      }
      if (typeof tableName === 'string' && tableName.includes('project_pool_demands')) {
        const query: any = {
          join: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          whereIn: jest.fn().mockReturnThis(),
          select: jest.fn().mockResolvedValue(pools)
        };
        return query;
      }
      if (typeof tableName === 'string' && tableName.includes('project_phases_timeline')) {
        const query: any = {
          join: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          whereNotNull: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(undefined)
        };
        return query;
      }
      if (tableName === 'scenarios') {
        return {
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis()
        };
      }
      throw new Error(`unexpected table ${tableName}`);
    };
    mockDb._sides = () => sides;
    return mockDb;
  }

describe('convertToPersonMonths', () => {
  test('converts LOC to PM intervals with design/dev split (default params)', () => {
    const result = convertToPersonMonths({
      estimated_loc: 15000,
      loc_rate_per_pm: 500,
      design_share_pct: 15,
      deviation_low_pct: 20,
      deviation_high_pct: 50
    });

    // total = 30 PM; interval [24, 30, 45]
    expect(result.total.mid).toBeCloseTo(30, 6);
    expect(result.total.low).toBeCloseTo(24, 6);
    expect(result.total.high).toBeCloseTo(45, 6);

    // design = 15% → 4.5 PM; interval [3.6, 4.5, 6.75]
    expect(result.design.mid).toBeCloseTo(4.5, 6);
    expect(result.design.low).toBeCloseTo(3.6, 6);
    expect(result.design.high).toBeCloseTo(6.75, 6);

    // dev = 85% → 25.5 PM; interval [20.4, 25.5, 38.25]
    expect(result.dev.mid).toBeCloseTo(25.5, 6);
    expect(result.dev.low).toBeCloseTo(20.4, 6);
    expect(result.dev.high).toBeCloseTo(38.25, 6);
  });

  test('applies defaults for omitted optional fields', () => {
    const result = convertToPersonMonths({ estimated_loc: 500 });
    expect(result.total.mid).toBeCloseTo(1, 6);
    expect(result.design.mid).toBeCloseTo(DEFAULT_CONVERSION.design_share_pct / 100, 6);
  });

  test('rejects non-positive rate and out-of-range share', () => {
    expect(() =>
      convertToPersonMonths({ estimated_loc: 100, loc_rate_per_pm: 0 })
    ).toThrow(/positive/);
    expect(() =>
      convertToPersonMonths({ estimated_loc: 100, design_share_pct: 120 })
    ).toThrow(/design_share_pct/);
  });
});

describe('windowMonths', () => {
  test('a 3-calendar-month window is about 2.96 months by elapsed days', () => {
    const months = windowMonths('2026-01-01', '2026-04-01');
    expect(months).toBeGreaterThan(2.9);
    expect(months).toBeLessThan(3.0);
  });

  test('rejects inverted or invalid windows', () => {
    expect(() => windowMonths('2026-05-01', '2026-01-01')).toThrow(/after start/);
    expect(() => windowMonths('not-a-date', '2026-01-01')).toThrow(/invalid/);
  });
});

describe('EstimationService.checkDeadline', () => {

  test('full-window supply with no load is feasible when supply covers pessimistic demand', async () => {
    const team = {
      SE: [{ id: 'se1', name: '沈设计', availability: 100 }],
      开发: [{ id: 'dev1', name: '张前端', availability: 100 }]
    };
    const service = new EstimationService(makeMockDb(team, []));

    const result = await service.checkDeadline({
      projectId: 'p1',
      deadline: '2027-03-20', // 6 months from 2026-09-20
      start: '2026-09-20',
      conversion: {
        estimated_loc: 1500, // 3 PM total → design 0.45 [0.36..0.675], dev 2.55 [2.04..3.825]
        loc_rate_per_pm: 500,
        design_share_pct: 15,
        deviation_low_pct: 20,
        deviation_high_pct: 50
      }
    });

    // window 2026-09-20→2027-03-20 is 181 days ≈ 5.9 elapsed-day months
    expect(result.design.supplyPm).toBeCloseTo(5.9, 1);
    expect(result.design.verdict).toBe('feasible');
    expect(result.dev.supplyPm).toBeCloseTo(5.9, 1);
    expect(result.dev.verdict).toBe('feasible');
    expect(result.overall.verdict).toBe('feasible');
  });

  test('reservation buffers and other projects reduce supply; own project excluded', async () => {
    const team = {
      SE: [{ id: 'se1', name: '沈设计', availability: 100 }],
      开发: [
        { id: 'dev1', name: '张前端', availability: 100 },
        { id: 'dev2', name: '李后端', availability: 100 }
      ]
    };
    const sixMonthsLater = '2027-03-20';
    const assignments = [
      // buffer project 50% for the whole window on dev1
      { person_id: 'dev1', project_id: 'buffer', allocation_percentage: 50, computed_start_date: null, computed_end_date: null },
      // another real project 25% on dev2, only half the window
      { person_id: 'dev2', project_id: 'other', allocation_percentage: 50, computed_start_date: '2026-09-20', computed_end_date: '2026-12-20' },
      // THIS project's assignments must be ignored
      { person_id: 'dev1', project_id: 'p1', allocation_percentage: 100, computed_start_date: null, computed_end_date: null }
    ];
    const service = new EstimationService(makeMockDb(team, assignments));

    const result = await service.checkDeadline({
      projectId: 'p1',
      deadline: sixMonthsLater,
      start: '2026-09-20',
      conversion: {
        estimated_loc: 500, // 1 PM → dev 0.85 [0.68..1.275]
        loc_rate_per_pm: 500,
        design_share_pct: 15,
        deviation_low_pct: 20,
        deviation_high_pct: 50
      }
    });

    // dev supply: gross 2 × 5.9 = 11.9; dev1 −2.97 (50% whole window),
    // dev2 −1.49 (50% for half the window) → ≈ 7.4
    expect(result.dev.supplyPm).toBeCloseTo(7.4, 1);
    expect(result.dev.verdict).toBe('feasible');
    // SE untouched → 5.9 PM, feasible
    expect(result.design.supplyPm).toBeCloseTo(5.9, 1);
  });

  test('tight verdict when supply falls between optimistic and pessimistic demand', async () => {
    const team = {
      SE: [{ id: 'se1', name: '沈设计', availability: 100 }],
      开发: [{ id: 'dev1', name: '张前端', availability: 100 }]
    };
    const service = new EstimationService(makeMockDb(team, []));

    const result = await service.checkDeadline({
      projectId: 'p1',
      deadline: '2027-03-20', // ≈5.9 months
      start: '2026-09-20',
      conversion: {
        // total 30 PM → design 4.5 [3.6..6.75]; supply 5.9 → tight.
        // dev 25.5 [20.4..38.25] vs 5.9 → infeasible; overall takes the worst.
        estimated_loc: 15000,
        loc_rate_per_pm: 500,
        design_share_pct: 15,
        deviation_low_pct: 20,
        deviation_high_pct: 50
      }
    });

    expect(result.design.verdict).toBe('tight');
    expect(result.dev.verdict).toBe('infeasible');
    expect(result.overall.verdict).toBe('infeasible');
  });

  test('infeasible verdict reports the optimistic-side gap', async () => {
    const team = {
      SE: [{ id: 'se1', name: '沈设计', availability: 100 }],
      开发: [{ id: 'dev1', name: '张前端', availability: 100 }]
    };
    const service = new EstimationService(makeMockDb(team, []));

    const result = await service.checkDeadline({
      projectId: 'p1',
      deadline: '2026-12-20', // 3 months
      start: '2026-09-20',
      conversion: {
        // dev 25.5 [20.4..38.25] vs supply 3 → infeasible, gap ≈ 17.4
        estimated_loc: 15000,
        loc_rate_per_pm: 500,
        design_share_pct: 15,
        deviation_low_pct: 20,
        deviation_high_pct: 50
      }
    });

    expect(result.dev.verdict).toBe('infeasible');
    expect(result.dev.gapPm).toBeCloseTo(17.4, 0);
    expect(result.overall.verdict).toBe('infeasible');
  });

  test('window longer than 60 months is rejected', async () => {
    const service = new EstimationService(makeMockDb({ SE: [], 开发: [] }, []));
    await expect(
      service.checkDeadline({
        projectId: 'p1',
        deadline: '2040-01-01',
        start: '2026-09-20',
        conversion: { estimated_loc: 100, loc_rate_per_pm: 500 }
      })
    ).rejects.toThrow(/60 months/);
  });
});

describe('EstimationService pool placeholder subtraction', () => {
  const team = {
    SE: [{ id: 'se1', name: '沈设计', availability: 100 }],
    开发: [{ id: 'dev1', name: '张前端', availability: 100 }]
  };

  test('another project\'s open pool reduces side supply by headcount × overlap', async () => {
    // 3-month window → supply per side = 1 person × 3 months = 3 PM.
    // Another project holds a 2-FTE pool covering the whole window → −6 PM,
    // clamped at 0 → both sides infeasible.
    const pools = [
      { project_id: 'other', headcount: 2, start_date: null, end_date: null }
    ];
    const service = new EstimationService(makeMockDb(team, [], pools));

    const result = await service.checkDeadline({
      projectId: 'p1',
      deadline: '2026-12-20',
      start: '2026-09-20',
      conversion: { estimated_loc: 100, loc_rate_per_pm: 500 } // tiny demand
    });

    expect(result.design.supplyPm).toBe(0);
    expect(result.dev.supplyPm).toBe(0);
    expect(result.overall.verdict).toBe('infeasible');
  });

  test('the evaluated project\'s own pool is part of demand, not supply', async () => {
    const pools = [
      { project_id: 'p1', headcount: 5, start_date: null, end_date: null }
    ];
    const service = new EstimationService(makeMockDb(team, [], pools));

    const result = await service.checkDeadline({
      projectId: 'p1',
      deadline: '2026-12-20',
      start: '2026-09-20',
      conversion: { estimated_loc: 100, loc_rate_per_pm: 500 }
    });

    // Supply untouched by own pool: 3 PM per side → feasible
    expect(result.design.supplyPm).toBeCloseTo(3, 0);
    expect(result.dev.supplyPm).toBeCloseTo(3, 0);
    expect(result.overall.verdict).toBe('feasible');
  });

  test('partial overlap: pool outside the window consumes nothing', async () => {
    const pools = [
      { project_id: 'other', headcount: 3, start_date: '2027-01-01', end_date: '2027-06-30' }
    ];
    const service = new EstimationService(makeMockDb(team, [], pools));

    const result = await service.checkDeadline({
      projectId: 'p1',
      deadline: '2026-12-20',
      start: '2026-09-20',
      conversion: { estimated_loc: 100, loc_rate_per_pm: 500 }
    });

    expect(result.dev.supplyPm).toBeCloseTo(3, 0);
  });
});

describe('EstimationService.checkDesignDeadline', () => {
  const team = { SE: [{ id: 'se1', name: '沈设计', availability: 100 }] };

  test('checks the design side only, demand interval from rough PM', async () => {
    const service = new EstimationService(makeMockDb(team, [], []));

    const result = await service.checkDesignDeadline({
      projectId: 'p1',
      deadline: '2026-12-20', // 3 months
      start: '2026-09-20',
      estimated_design_pm: 3, // [2.4, 3, 4.5]
      deviation_low_pct: 20,
      deviation_high_pct: 50
    });

    expect(result.design.demand.low).toBeCloseTo(2.4, 1);
    expect(result.design.demand.high).toBeCloseTo(4.5, 1);
    expect(result.design.supplyPm).toBeCloseTo(3, 0);
    // supply 3 ∈ [2.4, 4.5] → tight
    expect(result.design.verdict).toBe('tight');
    expect(result.overall.verdict).toBe('tight');
  });

  test('throws when no deadline given and no 设计 phase end date exists', async () => {
    const service = new EstimationService(makeMockDb(team, [], []));
    await expect(
      service.checkDesignDeadline({
        projectId: 'p1',
        estimated_design_pm: 3
      })
    ).rejects.toThrow(/deadline is required/);
  });

  test('rejects non-positive rough estimate', async () => {
    const service = new EstimationService(makeMockDb(team, [], []));
    await expect(
      service.checkDesignDeadline({
        projectId: 'p1',
        deadline: '2026-12-20',
        estimated_design_pm: 0
      })
    ).rejects.toThrow(/estimated_design_pm/);
  });
});
