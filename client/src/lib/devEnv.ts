/**
 * DEV 标记的单一出口(2026-10-11)。
 * import.meta 语法隔离在此——ts-jest 的 CJS 变换不认识它(App.tsx 同款写法
 * 只因未被任何测试引用而幸免;useCellPopover 被测试引用,直接写会炸套件)。
 * jest 经 moduleNameMapper 将本模块映射为常量 mock(IS_DEV=false);
 * vite 构建中 import.meta.env.DEV 在 release 为 false,自检代码被 DCE 剔除。
 */
export const IS_DEV: boolean = import.meta.env.DEV;
