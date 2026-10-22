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
      project_sub_type_id: 'test-sub-type-1', // 001 真身 NOT NULL+FK(setup 种子)
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

  /** asyncHandler 包装器返回 void(async 链无人 await)——轮询等 res 落地再断言。
   * params 供 /:id 路由端点(如 update)使用 */
  const call = async (handler: any, body: any, params: Record<string, string> = {}) => {
    const req: any = createMockRequest({ body, params } as any);
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

    it('enforces the 2000-id cap (2001 rejected before any DB work, 审视#2)', async () => {
      const ids = Array.from({ length: 2001 }, () => randomUUID());
      const { res } = await call(controller.batchDelete, { ids });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('at most 2000') }));
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

    it('mixed patch skips only the iteration field on SR rows — tags and other scalars still land (2026-10-13 字段级拆分)', async () => {
      // SR 行带一个既有标签(tagA);混合补丁 {iteration_id, priority, add_tag_ids}
      await db('project_tags').where('project_id', fixture.srId).del();
      await db('project_tags').insert({ project_id: fixture.srId, tag_id: fixture.tagA, created_at: new Date().toISOString() });
      await db('projects').where('id', fixture.srId).update({ priority: 5 });

      const { res } = await call(controller.batchUpdate, {
        ids: [fixture.srId, fixture.plainId],
        patch: { iteration_id: fixture.iterationId, priority: 2, add_tag_ids: [fixture.tagB] }
      });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: expect.objectContaining({ updated: 2, skipped: 1 }) })
      );
      const sr = await db('projects').where('id', fixture.srId).first();
      expect(sr.iteration_id).toBeNull();   // 迭代字段跳过(只读窗)
      expect(sr.priority).toBe(2);          // 其余标量照常
      const srTags = (await db('project_tags').where('project_id', fixture.srId).select('tag_id'))
        .map((t: any) => t.tag_id).sort();
      expect(srTags).toEqual([fixture.tagA, fixture.tagB]); // 标签照常
      const plain = await db('projects').where('id', fixture.plainId).first();
      expect(plain.iteration_id).toBe(fixture.iterationId); // plain 行全量生效
      expect(plain.priority).toBe(2);

      // 还原,不泄漏给后续用例
      await db('project_tags').where('project_id', fixture.srId).del();
      await db('projects').whereIn('id', [fixture.srId, fixture.plainId]).update({ priority: 5, iteration_id: null });
      await db('project_tags').where('project_id', fixture.plainId).del();
      await db('project_tags').insert({ project_id: fixture.plainId, tag_id: fixture.tagA, created_at: new Date().toISOString() });
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

    it('rejects empty tag arrays as a no-op patch — no false "updated N" (审视#11)', async () => {
      const { res } = await call(controller.batchUpdate, { ids: [fixture.plainId], patch: { add_tag_ids: [], remove_tag_ids: [] } });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('empty') }));
    });

    it('caps the not-found id listing at 5 (2000 unknown ids, 审视#2)', async () => {
      const ids = Array.from({ length: 2000 }, () => randomUUID());
      const { res } = await call(controller.batchUpdate, { ids, patch: { priority: 3 } });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('(and 1995 more)') })
      );
    });
  });

  describe('PUT /projects/:id (iteration invariant, 审视#3)', () => {
    it('rejects iteration_id on rows with children; plain rows still attach', async () => {
      const srId = await insertProject({ name: 'SR-inv' });
      const childId = await insertProject({ name: 'AR-inv', parent_id: srId });

      // SR(有子行)拒绝——与批量端点同一不变量,单条不再放行
      const bad = await call(controller.update, { iteration_id: fixture.iterationId }, { id: srId });
      expect(bad.res.status).toHaveBeenCalledWith(400);
      expect(bad.res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('read-only') })
      );
      expect((await db('projects').where('id', srId).first()).iteration_id).toBeNull();

      // plain 行正常挂接(不变量只拦有子行的 SR)
      const ok = await call(controller.update, { iteration_id: fixture.iterationId }, { id: fixture.plainId });
      expect((await db('projects').where('id', fixture.plainId).first()).iteration_id).toBe(fixture.iterationId);

      await db('projects').whereIn('id', [srId, childId]).del();
      await db('projects').where('id', fixture.plainId).update({ iteration_id: null });
    });

    it('rejects null clear on rows with children too — invariant covers set AND clear (2026-10-13 四口径统一)', async () => {
      // SR 行残留一个挂接值(历史脏数据形态),null 清挂同样被拦
      await db('projects').where('id', fixture.srId).update({ iteration_id: fixture.iterationId });
      const bad = await call(controller.update, { iteration_id: null }, { id: fixture.srId });
      expect(bad.res.status).toHaveBeenCalledWith(400);
      expect((await db('projects').where('id', fixture.srId).first()).iteration_id).toBe(fixture.iterationId);
      await db('projects').where('id', fixture.srId).update({ iteration_id: null });
    });
  });

  describe('POST /projects (iteration validation, 2026-10-13 四口径统一 1/4)', () => {
    it('rejects unknown iteration_id at create; known iteration attaches', async () => {
      const typeId = randomUUID();
      const subTypeId = randomUUID();
      await db('project_types').insert({ id: typeId, name: `ITER-CREATE-TYPE-${typeId.slice(0, 8)}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      await db('project_sub_types').insert({ id: subTypeId, name: `ITER-CREATE-SUB-${subTypeId.slice(0, 8)}`, project_type_id: typeId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });

      // create 原先不校验,任意字符串直插——现在与 update/batch 同一存在性校验
      const bad = await call(controller.create, { name: 'ITER-CREATE-BAD', project_type_id: typeId, project_sub_type_id: subTypeId, iteration_id: randomUUID() });
      expect(bad.res.status).toHaveBeenCalledWith(400);
      expect(bad.res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Iteration not found') }));
      expect(await db('projects').where('name', 'ITER-CREATE-BAD').first()).toBeUndefined();

      const good = await call(controller.create, { name: 'ITER-CREATE-OK', project_type_id: typeId, project_sub_type_id: subTypeId, iteration_id: fixture.iterationId });
      const row = await db('projects').where('name', 'ITER-CREATE-OK').first();
      expect(row?.iteration_id).toBe(fixture.iterationId);

      await db('projects').where('id', row!.id).del();
      await db('project_sub_types').where('id', subTypeId).del();
      await db('project_types').where('id', typeId).del();
    });
  });

  describe('事务回滚(2026-10-13 主链入事务)', () => {
    it('create 标签 FK 失败不留僵尸项目——整体回滚', async () => {
      const typeId = randomUUID();
      const subTypeId = randomUUID();
      await db('project_types').insert({ id: typeId, name: `TX-ROLLBACK-${typeId.slice(0, 8)}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      await db('project_sub_types').insert({ id: subTypeId, name: `TX-SUB-${subTypeId.slice(0, 8)}`, project_type_id: typeId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });

      // tag_ids 含不存在 id: 项目行已插,标签插入撞 FK → 四段写入整体回滚
      // (无事务时此处留下无标签僵尸项目)
      const { res } = await call(controller.create, {
        name: 'TX-ZOMBIE',
        project_type_id: typeId,
        project_sub_type_id: subTypeId,
        tag_ids: [999999]
      });
      expect(res.status).toHaveBeenCalledWith(500);
      expect(await db('projects').where('name', 'TX-ZOMBIE').first()).toBeUndefined();

      await db('project_sub_types').where('id', subTypeId).del();
      await db('project_types').where('id', typeId).del();
    });

    it('update 标签替换插入失败回滚——原标签不丢', async () => {
      const id = await insertProject({ name: 'TX-TAG-KEEP' });
      await db('project_tags').insert({ project_id: id, tag_id: fixture.tagA, created_at: new Date().toISOString() });

      // del 全部旧标签后插入含 FK 垃圾的新集合 → 失败必须整体回滚
      const { res } = await call(controller.update, { tag_ids: [fixture.tagA, 999999] }, { id });
      expect(res.status).toHaveBeenCalledWith(500);
      const tags = await db('project_tags').where('project_id', id).select('tag_id');
      expect(tags.map((t: any) => t.tag_id)).toEqual([fixture.tagA]);

      await db('project_tags').where('project_id', id).del();
      await db('projects').where('id', id).del();
    });
  });

  describe('写入白名单(2026-10-13 E1 根治)', () => {
    it('PUT 丢弃身份列/状态机字段/未知键——行不被改写,不 500', async () => {
      const id = await insertProject({ name: 'WL-KEEP', seq_number: 777 });
      const { res } = await call(controller.update, {
        name: 'WL-KEEP-2',
        id: 'hijack-attempt',
        seq_number: 9999,
        created_at: '1999-01-01T00:00:00.000Z',
        lifecycle_state: 'delivered',
        bogus_field: 'x'
      }, { id });
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));

      const row = await db('projects').where('id', id).first();
      expect(row.id).toBe(id);                    // 主键劫持被拦
      expect(row.seq_number).toBe(777);           // 序号劫持被拦
      expect(row.name).toBe('WL-KEEP-2');         // 合法字段照常生效
      expect(row.lifecycle_state).toBeNull();     // 状态机字段不可经通用 update 写
      expect((row as any).bogus_field).toBeUndefined();

      await db('projects').where('id', id).del();
    });

    it('create 同样丢弃非白名单载荷(列在不在都不收)', async () => {
      const typeId = randomUUID();
      const subTypeId = randomUUID();
      await db('project_types').insert({ id: typeId, name: `WL-T-${typeId.slice(0, 6)}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      await db('project_sub_types').insert({ id: subTypeId, name: `WL-S-${subTypeId.slice(0, 6)}`, project_type_id: typeId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });

      const { res } = await call(controller.create, {
        name: 'WL-DROP',
        project_type_id: typeId,
        project_sub_type_id: subTypeId,
        status: 'active',
        lifecycle_state: 'delivered',
        budget: 999,
        ghost_key: 1
      });
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));

      const row = await db('projects').where('name', 'WL-DROP').first();
      expect(row).toBeTruthy();
      expect(row.lifecycle_state).toBeNull();        // 非生命周期类型强制 NULL
      expect((row as any).budget).toBeUndefined();   // 列已从手写库删除(漂移守卫),载荷更不可能写入
      expect((row as any).ghost_key).toBeUndefined();

      await db('projects').where('id', row.id).del();
      await db('project_sub_types').where('id', subTypeId).del();
      await db('project_types').where('id', typeId).del();
    });
  });
});
