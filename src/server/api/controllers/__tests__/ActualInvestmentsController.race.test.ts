import knexFactory from 'knex';
import { ActualInvestmentsController } from '../ActualInvestmentsController.js';

/**
 * ActualInvestmentsController 月账竞速 — IP-07b / C10.
 *
 * 真 better-sqlite3 内存库 + 读后写前屏障(Section 10 交错构造):
 * 快照读到旧 source 后阻塞,setManual 完整写完 0.9/manual,再放行快照写。
 * 期望:manual 0.9 存活,快照报告 skipped——不是靠"先读再写"的检查,
 * 而是把 source=snapshot 写进更新条件本身。
 */

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
};

/**
 * asyncHandler 返回 void(BaseController:422):控制器调用不返回 Promise,
 * 必须等 res.json/res.status 真正被调用后再读结果(计划第10节注意事项)。
 */
async function waitForResponse(res: any, timeoutMs = 3000): Promise<any> {
  const start = Date.now();
  while (res.json.mock.calls.length === 0 && (res.status.mock.calls.length === 0)) {
    if (Date.now() - start > timeoutMs) throw new Error('controller response timeout');
    await new Promise((r) => setImmediate(r));
  }
  return res.json.mock.calls[0]?.[0];
}

const DDL = [
  `CREATE TABLE project_actual_investments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    month TEXT NOT NULL,
    fte REAL NOT NULL,
    source TEXT NOT NULL DEFAULT 'snapshot',
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    version INTEGER NOT NULL DEFAULT 1,
    UNIQUE (project_id, month)
  )`,
  // 简化视图表:仅覆盖 activeAssignments 消费的列(计划 FTE 口径证明)
  `CREATE TABLE assignments_view (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    allocation_percentage REAL,
    start_date TEXT, end_date TEXT,
    computed_start_date TEXT, computed_end_date TEXT
  )`
];

function seedAssignments(db: any, month: string) {
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const start = `${month}-01`;
  const end = `${month}-${String(lastDay).padStart(2, '0')}`;
  return db('assignments_view').insert({
    project_id: 'p1', status: 'active', allocation_percentage: 50,
    start_date: start, end_date: end
  });
}

describe('ActualInvestmentsController snapshot/manual race (C10)', () => {
  let db: any;
  let controller: ActualInvestmentsController;
  let mockRes: any;

  beforeAll(async () => {
    db = knexFactory({ client: 'better-sqlite3', connection: ':memory:' });
    for (const stmt of DDL) await db.raw(stmt);
  });

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    await db('project_actual_investments').del();
    await db('assignments_view').del();
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, "error").mockImplementation();

    controller = new ActualInvestmentsController();
    mockRes = { json: jest.fn(), status: jest.fn().mockReturnThis() };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /**
   * 屏障 db 包装:project_actual_investments 的下一次 first() 在真实读取
   * 完成后挂起,直到测试放行——把交错精确钉在"实际读与写之间"。
   */
  function armReadGate() {
    let release: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let readDone: () => void;
    const readDonePromise = new Promise<void>((r) => { readDone = r; });
    let armed = true;

    const wrapped: any = (tableName: string) => {
      const builder = db(tableName);
      if (armed && tableName === 'project_actual_investments') {
        const origFirst = builder.first.bind(builder);
        builder.first = async (...args: any[]) => {
          const row = await origFirst(...args);
          armed = false;
          readDone();
          await gate;
          return row;
        };
      }
      return builder;
    };
    for (const key of Object.getOwnPropertyNames(db)) {
      if (['then', 'catch', 'finally'].includes(key)) continue;
      try {
        wrapped[key] = (db as any)[key];
      } catch {
        // 函数的 length/name 等只读属性,跳过
      }
    }
    (controller as any).db = wrapped;
    return { release: () => release(), readDone: readDonePromise };
  }

  const currentRow = async (month: string) =>
    db('project_actual_investments').where({ project_id: 'p1', month }).first();

  test('C10: manual write racing a blocked snapshot survives (read-then-write is not protection)', async () => {
    // 已有 snapshot=0.2;整月 50% 实名使快照计算 0.5
    await seedAssignments(db, '2026-01');
    await db('project_actual_investments').insert({ project_id: 'p1', month: '2026-01', fte: 0.2, source: 'snapshot' });

    const { release, readDone } = armReadGate();
    const snapshotReq: any = { params: { projectId: 'p1' }, body: { month: '2026-01' }, headers: {}, logger: mockLogger, logAuditEvent: jest.fn() };
    controller.snapshot(snapshotReq, mockRes);

    await readDone; // 快照已读到旧 source=snapshot,正卡在写之前

    // setManual 完整执行(独立请求,无屏障)
    const manualController = new ActualInvestmentsController();
    (manualController as any).db = db;
    const manualRes = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    manualController.setManual(
      { params: { projectId: 'p1' }, body: { month: '2026-01', fte: 0.9 }, headers: {}, logger: mockLogger, user: { id: 'u1' }, logAuditEvent: jest.fn() } as any,
      manualRes as any
    );
    await waitForResponse(manualRes);
    expect(manualRes.status).not.toHaveBeenCalledWith(400);

    release(); // 放行快照的写
    await waitForResponse(mockRes);

    const row = await currentRow('2026-01');
    expect(row.fte).toBe(0.9);
    expect(row.source).toBe('manual');

    const body = mockRes.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.data.skipped).toBe(true);
    expect(body.data.data.fte).toBe(0.9);
  });

  test('C10: insert race — manual wins the unique constraint, snapshot reports skipped instead of erroring', async () => {
    // 无既有行(2026-02),快照走插入路径
    await seedAssignments(db, '2026-02');

    const { release, readDone } = armReadGate();
    const snapshotReq: any = { params: { projectId: 'p1' }, body: { month: '2026-02' }, headers: {}, logger: mockLogger, logAuditEvent: jest.fn() };
    controller.snapshot(snapshotReq, mockRes);

    await readDone; // 快照读到 null,卡在插入之前

    const manualController = new ActualInvestmentsController();
    (manualController as any).db = db;
    const manualRes = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    manualController.setManual(
      { params: { projectId: 'p1' }, body: { month: '2026-02', fte: 0.9 }, headers: {}, logger: mockLogger, user: { id: 'u1' }, logAuditEvent: jest.fn() } as any,
      manualRes as any
    );
    await waitForResponse(manualRes);

    release();
    await waitForResponse(mockRes);

    const row = await currentRow('2026-02');
    expect(row.fte).toBe(0.9);
    expect(row.source).toBe('manual');

    const body = mockRes.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.data.skipped).toBe(true);
    expect(mockRes.status).not.toHaveBeenCalledWith(500);
  });

  test('sequential re-snapshot after manual keeps skipping (no race needed)', async () => {
    await seedAssignments(db, '2026-03');
    const req = (month: string): any => ({ params: { projectId: 'p1' }, body: { month }, headers: {}, logger: mockLogger, logAuditEvent: jest.fn() });
    (controller as any).db = db;

    const res1 = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    controller.snapshot(req('2026-03'), res1 as any);
    await waitForResponse(res1);
    expect(res1.json.mock.calls[0][0].data.data.fte).toBe(0.5);
    expect(res1.json.mock.calls[0][0].data.data.source).toBe('snapshot');

    const resM = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    controller.setManual({ ...req('2026-03'), body: { month: '2026-03', fte: 0.9 }, user: { id: 'u1' } } as any, resM as any);
    await waitForResponse(resM);

    const res2 = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    controller.snapshot(req('2026-03'), res2 as any);
    await waitForResponse(res2);
    const body2 = res2.json.mock.calls[0][0];
    expect(body2.data.data.skipped).toBe(true);

    const row = await currentRow('2026-03');
    expect(row.fte).toBe(0.9);
    expect(row.source).toBe('manual');
  });

  test('snapshot refreshes an existing snapshot row (no regression in the happy path)', async () => {
    await seedAssignments(db, '2026-04');
    await db('project_actual_investments').insert({ project_id: 'p1', month: '2026-04', fte: 0.2, source: 'snapshot' });
    (controller as any).db = db;

    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    controller.snapshot({ params: { projectId: 'p1' }, body: { month: '2026-04' }, headers: {}, logger: mockLogger, logAuditEvent: jest.fn() } as any, res as any);
    await waitForResponse(res);

    const row = await currentRow('2026-04');
    expect(row.fte).toBe(0.5);
    expect(row.source).toBe('snapshot');
    expect(res.json.mock.calls[0][0].data.data.fte).toBe(0.5);
  });
});
