import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import { ProjectsController } from '../../../src/server/api/controllers/ProjectsController';
import { db, createMockRequest, createMockResponse } from '../test-utils';
import { randomUUID } from 'crypto';

/**
 * Integration tests for the demand-board batch endpoints (2026-10-11).
 *
 * batch-delete: descendant closure (checking an SR must take its whole
 * subtree), leaf-first deletion, all-or-nothing on missing ids.
 * batch-update: patch whitelist (state-machine fields rejected), tag
 * merge semantics, iteration skipped on rows that have children.
 */
describe('ProjectsController batch endpoints', () => {
  let controller: ProjectsController;
  let fixture: { srId: string; childA: string; childB: string; plainId: string; iterationId: string; tagA: number; tagB: number };

  const insertProject = async (overrides: Record<string, any> = {}) => {
    const row = {
      id: randomUUID(),
      name: 'Batch Fixture',
      priority: 5,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides
    };
    await db('projects').insert(row);
    return row.id;
  };

  beforeAll(async () => {
    controller = new ProjectsController();
    (controller as any).db = db;

    const iterationId = randomUUID();
    await db('iterations').insert({
      id: iterationId,
      name: 'ITER-BATCH',
      start_date: '2026-10-01',
      end_date: '2026-10-30',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    const srId = await insertProject({ name: 'SR fixture' });
    const childA = await insertProject({ name: 'AR-A', parent_id: srId });
    const childB = await insertProject({ name: 'AR-B', parent_id: srId });
    const plainId = await insertProject({ name: 'plain fixture' });

    await db('tags').insert([
      { id: 9001, name: 'batch-tag-a', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 9002, name: 'batch-tag-b', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    ]);
    await db('project_tags').insert({ project_id: plainId, tag_id: 9001, created_at: new Date().toISOString() });

    fixture = { srId, childA, childB, plainId, iterationId, tagA: 9001, tagB: 9002 };
  });

  beforeEach(async () => {
    // 每个用例自建自删,不共享状态——批量删除用例会清掉别人的夹具
  });

  /** asyncHandler 包装器返回 void(async 链无人 await)——轮询等 res 落地再断言 */
  const call = async (handler: any, body: any) => {
    const req: any = createMockRequest({ body } as any);
    const res: any = createMockResponse();
    handler.call(controller, req, res);
    for (let i = 0; i < 100; i++) {
      if ((res.json as any).mock?.calls.length || (res.status as any).mock?.calls.length) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    return { req, res };
  };

  describe('POST /projects/batch-delete', () => {
    it('deletes the full subtree when an SR id is given (closure)', async () => {
      const srId = await insertProject({ name: 'SR-tree' });
      const child = await insertProject({ name: 'child', parent_id: srId });
      const grandChild = await insertProject({ name: 'grandchild', parent_id: child });

      const { res } = await call(controller.batchDelete, { ids: [srId] });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ deleted: 3 })
        })
      );
      const remaining = await db('projects').whereIn('id', [srId, child, grandChild]);
      expect(remaining).toHaveLength(0);
    });

    it('deleting only a child leaves the parent untouched', async () => {
      const srId = await insertProject({ name: 'SR-stays' });
      const child = await insertProject({ name: 'child-goes', parent_id: srId });

      const { res } = await call(controller.batchDelete, { ids: [child] });
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      expect(await db('projects').where('id', srId)).toHaveLength(1);
      expect(await db('projects').where('id', child)).toHaveLength(0);
    });

    it('rejects unknown ids without deleting anything (all-or-nothing)', async () => {
      const keep = await insertProject({ name: 'survivor' });
      const { res } = await call(controller.batchDelete, { ids: [keep, randomUUID()] });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('not found') }));
      expect(await db('projects').where('id', keep)).toHaveLength(1);
      await db('projects').where('id', keep).del();
    });

    it('rejects invalid id payloads', async () => {
      for (const bad of [{}, { ids: [] }, { ids: 'x' }, { ids: [123] }]) {
        const { res } = await call(controller.batchDelete, bad);
        expect(res.status).toHaveBeenCalledWith(400);
      }
    });
  });

  describe('POST /projects/batch-update', () => {
    it('sets product_version and release_version across rows (null clears)', async () => {
      const a = await insertProject({ name: 'v-a', product_version: 'v1.0' });
      const b = await insertProject({ name: 'v-b' });

      const set = await call(controller.batchUpdate, { ids: [a, b], patch: { product_version: 'v2.0', release_version: 'R3' } });
      expect(set.res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: expect.objectContaining({ updated: 2, skipped: 0 }) })
      );
      expect(await db('projects').where({ id: a, product_version: 'v2.0', release_version: 'R3' })).toHaveLength(1);

      const clear = await call(controller.batchUpdate, { ids: [a, b], patch: { product_version: null } });
      expect(clear.res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      expect((await db('projects').where('id', a).first()).product_version).toBeNull();
      await db('projects').whereIn('id', [a, b]).del();
    });

    it('rejects priority outside 1-5', async () => {
      for (const priority of [0, 6, '3', 2.5]) {
        const { res } = await call(controller.batchUpdate, { ids: [fixture.plainId], patch: { priority } });
        expect(res.status).toHaveBeenCalledWith(400);
      }
    });

    it('rejects whitelisted-out fields (state machine is not batch-writable)', async () => {
      const { res } = await call(controller.batchUpdate, {
        ids: [fixture.plainId],
        patch: { lifecycle_state: 'delivered' }
      });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('lifecycle_state') }));
    });

    it('merges tags: (existing ∪ add) − remove, not full replace', async () => {
      // plainId starts with tagA(9001)
      await call(controller.batchUpdate, {
        ids: [fixture.plainId],
        patch: { add_tag_ids: [fixture.tagB], remove_tag_ids: [fixture.tagA] }
      });
      const tags = (await db('project_tags').where('project_id', fixture.plainId)).map((r: any) => r.tag_id).sort();
      expect(tags).toEqual([fixture.tagB]);
      // restore for later cases
      await db('project_tags').where('project_id', fixture.plainId).del();
      await db('project_tags').insert({ project_id: fixture.plainId, tag_id: fixture.tagA, created_at: new Date().toISOString() });
    });

    it('rejects unknown tag ids', async () => {
      const { res } = await call(controller.batchUpdate, { ids: [fixture.plainId], patch: { add_tag_ids: [999999] } });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Tags not found') }));
    });

    it('sets iteration on plain rows but skips rows that have children (skipped count)', async () => {
      const { res } = await call(controller.batchUpdate, {
        ids: [fixture.srId, fixture.plainId],
        patch: { iteration_id: fixture.iterationId }
      });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: expect.objectContaining({ updated: 1, skipped: 1 }) })
      );
      expect((await db('projects').where('id', fixture.plainId).first()).iteration_id).toBe(fixture.iterationId);
      expect((await db('projects').where('id', fixture.srId).first()).iteration_id).toBeNull();
    });

    it('rejects nonexistent iteration and supports detach via null', async () => {
      const bad = await call(controller.batchUpdate, { ids: [fixture.plainId], patch: { iteration_id: randomUUID() } });
      expect(bad.res.status).toHaveBeenCalledWith(400);

      const detach = await call(controller.batchUpdate, { ids: [fixture.plainId], patch: { iteration_id: null } });
      expect(detach.res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      expect((await db('projects').where('id', fixture.plainId).first()).iteration_id).toBeNull();
    });

    it('rejects empty patch and unknown ids', async () => {
      const empty = await call(controller.batchUpdate, { ids: [fixture.plainId], patch: {} });
      expect(empty.res.status).toHaveBeenCalledWith(400);
      const missing = await call(controller.batchUpdate, { ids: [randomUUID()], patch: { priority: 3 } });
      expect(missing.res.status).toHaveBeenCalledWith(400);
    });
  });
});
