/**
 * I02v 任务挑选器读契约：
 *  - GET /projects?search=&include_ancestors=1&slim=1 命中项必须带祖先路径；
 *  - 搜索走服务端，能命中第 2001 个任务（不受 board-feed 2000 行上限影响）；
 *  - slim 不触发看板的重型汇总，返回真实 total/has_more。
 */
import { describe, test, expect, beforeAll } from '@jest/globals';
import express from 'express';
import supertest from 'supertest';
import { db, TEST_PROJECT_SUB_TYPE_ID } from '../setup';
import { ProjectsController } from '../../../src/server/api/controllers/ProjectsController';

const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const ROOT_ID = `i02v-root-${SUFFIX}`;
const CHILD_ID = `i02v-child-${SUFFIX}`;
const GRANDCHILD_ID = `i02v-grandchild-${SUFFIX}`;
const BULK_PREFIX = `i02v-bulk-${SUFFIX}`;

let request: ReturnType<typeof supertest>;

beforeAll(async () => {
  await db('projects').insert([
    {
      id: ROOT_ID,
      name: `I02V Root ${SUFFIX}`,
      project_sub_type_id: TEST_PROJECT_SUB_TYPE_ID,
      lifecycle_state: 'designing',
    },
    {
      id: CHILD_ID,
      name: `I02V Child ${SUFFIX}`,
      parent_id: ROOT_ID,
      project_sub_type_id: TEST_PROJECT_SUB_TYPE_ID,
      lifecycle_state: 'developing',
    },
    {
      id: GRANDCHILD_ID,
      name: `I02V Grandchild ${SUFFIX}`,
      parent_id: CHILD_ID,
      project_sub_type_id: TEST_PROJECT_SUB_TYPE_ID,
      lifecycle_state: 'developing',
    },
  ]);

  // 2001 行：搜索必须能命中最后一个，而不是被 2000 行上限截断
  const bulk = Array.from({ length: 2001 }, (_, index) => ({
    id: `${BULK_PREFIX}-${String(index + 1).padStart(4, '0')}`,
    name: `${BULK_PREFIX} Task ${String(index + 1).padStart(4, '0')}`,
    project_sub_type_id: TEST_PROJECT_SUB_TYPE_ID,
    lifecycle_state: 'developing',
  }));
  for (let start = 0; start < bulk.length; start += 500) {
    await db('projects').insert(bulk.slice(start, start + 500));
  }

  const controller = new ProjectsController();
  (controller as any).db = db;
  const app = express();
  app.use(express.json());
  app.get('/api/projects', (req, res) => controller.getAll(req as any, res));
  request = supertest(app);
});

describe('I02v 任务挑选器读契约', () => {
  test('搜索命中孙节点时返回完整祖先链', async () => {
    const res = await request.get(
      `/api/projects?search=${encodeURIComponent(`I02V Grandchild ${SUFFIX}`)}&include_ancestors=1&slim=1&limit=10`
    );
    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(1);

    const rows = res.body.data as Array<Record<string, any>>;
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(GRANDCHILD_ID)).toBeTruthy();
    expect(byId.get(CHILD_ID)).toMatchObject({ is_ancestor: true, parent_id: ROOT_ID });
    expect(byId.get(ROOT_ID)).toMatchObject({ is_ancestor: true, parent_id: null });
    expect(byId.get(CHILD_ID)?.name).toContain('I02V Child');
    expect(byId.get(ROOT_ID)?.name).toContain('I02V Root');
  });

  test('搜索能命中第 2001 个任务', async () => {
    const res = await request.get(
      `/api/projects?search=${encodeURIComponent(`${BULK_PREFIX} Task 2001`)}&slim=1&limit=5`
    );
    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(1);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(`${BULK_PREFIX}-2001`);
  });

  test('slim 返回真实 total/has_more，且不依赖看板重型汇总', async () => {
    const res = await request.get(
      `/api/projects?search=${encodeURIComponent(BULK_PREFIX)}&slim=1&limit=10`
    );
    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(2001);
    expect(res.body.pagination.has_more).toBe(true);
    expect(res.body.data).toHaveLength(10);
    expect(res.body.data[0].tags).toEqual([]);
    expect(res.body.data[0].lifecycle_warnings).toEqual([]);
  });
});
