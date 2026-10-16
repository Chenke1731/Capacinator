import type { Router, RequestHandler } from 'express';

/**
 * 模块级 DELETE /test-data 的唯一注册入口（结构性原语，2026-10-16 缺口③）。
 *
 * e2e/dev 的数据清理端点绝不能出现在生产路由表——服务端 0.0.0.0 监听
 * （owner 决定保留，LAN 可达），无认证的批量删除等于远程清库入口。
 * 顶层 /api/test-data 子路由在 routes/index.ts 有环境闸门；模块级路由
 * （projects/assignments/people 的 DELETE /:module/test-data）曾绕过它
 * 直接注册。所有模块级清理路由必须经此原语注册，与 index.ts 闸门同
 * 条件：production 不注册（物理缺席），development/e2e/test 保留。
 *
 * 守卫：tests/unit/server/test-data-route-guard.test.ts 全量扫描断言
 * routes/*.ts 不得出现 /test-data 字面量直挂（变异自证已过）。
 */
export function registerTestDataCleanupRoute(router: Router, handler: RequestHandler): void {
  if (process.env.NODE_ENV === 'production') return;
  router.delete('/test-data', handler);
}
