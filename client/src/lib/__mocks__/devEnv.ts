/**
 * Jest 专用 mock(由 jest.config.cjs client 项目 moduleNameMapper 指向)。
 * devEnv.ts 把 import.meta 语法隔离在单一出口——ts-jest 的 CJS 变换无法
 * 解析该语法,故在 Jest 下整体映射为 IS_DEV=false(测试环境不激活 DEV 自检;
 * devEnv.ts 文件头注释所描述的正是这条映射,2026-10-11 补齐落线)。
 */
export const IS_DEV = false;
