import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { describe, it, expect, afterEach } from '@jest/globals';
import express from 'express';
import type { RequestHandler } from 'express';
import { registerTestDataCleanupRoute } from '../../../src/server/api/routes/register-test-data-route.js';

/**
 * test-data 路由生产隔离守卫（2026-10-16 缺口③）：
 * e2e/dev 清理端点（无认证批量删除）不得出现在生产路由表——服务端
 * 0.0.0.0 监听（owner 决定保留），泄漏即远程清库入口。本项目曾只给
 * 顶层 /api/test-data 加了 NODE_ENV 闸门，projects/assignments/people
 * 三个模块级 DELETE /test-data 绕过闸门直挂（Codex 报了两处，people
 * 是全量扫描补获的第三处——"修复时看到的 API"不是问题边界）。
 *
 * 守卫三件套：
 *   A. 结构不变量（全量扫描）：routes/*.ts 除豁免文件外不得出现
 *      /test-data 字面量直挂——新模块违规即红，不依赖评审眼力；
 *   B. 闸门配对：唯一允许的直挂点（index.ts 顶层挂载）必须仍在
 *      NODE_ENV !== 'production' 块内；
 *   C. 原语行为：production 物理缺席，development/e2e/test 正常注册。
 * 上线前已过变异自证：还原一处直挂必红（见 2026-10-16 会话记录）。
 */
const ROUTES_DIR = path.join(__dirname, '../../../src/server/api/routes');

/** index.ts 的挂载由 B 组闸门配对单独断言；test-data.ts 挂在其后；原语自身即唯一注册点 */
const SCAN_EXEMPT = new Set(['index.ts', 'test-data.ts', 'register-test-data-route.ts']);

describe('test-data 路由生产隔离守卫', () => {
  describe('A. 结构不变量：模块级 /test-data 只允许经原语注册', () => {
    it('routes/*.ts 全量扫描无 /test-data 字面量直挂', () => {
      const files = readdirSync(ROUTES_DIR)
        .filter((f) => f.endsWith('.ts') && !SCAN_EXEMPT.has(f));
      expect(files.length).toBeGreaterThan(5); // 扫描器 sanity：目录漂移时防恒绿

      const offenders: string[] = [];
      for (const f of files) {
        const src = readFileSync(path.join(ROUTES_DIR, f), 'utf8');
        const m = src.match(/\.(get|post|put|patch|delete|use)\(\s*['"]\/test-data/);
        if (m) offenders.push(`${f}: ${m[0]}`);
      }
      expect(offenders).toEqual([]);
    });
  });

  describe('B. 闸门配对：index.ts 顶层挂载仍在环境闸门内', () => {
    it("router.use('/test-data') 前置 NODE_ENV 闸门", () => {
      const lines = readFileSync(path.join(ROUTES_DIR, 'index.ts'), 'utf8').split('\n');
      const mountLine = lines.findIndex((l) => l.includes("router.use('/test-data'"));
      expect(mountLine).toBeGreaterThanOrEqual(0);
      const windowAbove = lines.slice(Math.max(0, mountLine - 8), mountLine).join('\n');
      expect(windowAbove).toMatch(/NODE_ENV\s*!==\s*'production'/);
    });
  });

  describe('C. 原语行为：按环境注册/物理缺席', () => {
    const ORIGINAL = process.env.NODE_ENV;
    const mustNotRun: RequestHandler = (_req, res) => {
      res.status(500).end('test-data handler must not run');
    };

    afterEach(() => {
      process.env.NODE_ENV = ORIGINAL;
    });

    it('production：不注册任何路由', () => {
      process.env.NODE_ENV = 'production';
      const router = express.Router();
      registerTestDataCleanupRoute(router, mustNotRun);
      expect(router.stack).toHaveLength(0);
    });

    it.each(['development', 'e2e', 'test'])('%s：注册 DELETE /test-data', (env) => {
      process.env.NODE_ENV = env;
      const router = express.Router();
      registerTestDataCleanupRoute(router, mustNotRun);
      expect(router.stack).toHaveLength(1);
      expect(router.stack[0].route?.path).toBe('/test-data');
      expect(router.stack[0].route?.methods?.delete).toBeTruthy();
    });
  });
});
