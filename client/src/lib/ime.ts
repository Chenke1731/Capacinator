/**
 * 输入法组合态守卫（2026-11-14，UI UX Pro Max 清单 gap 分析发现的缺陷类）。
 *
 * 中文/日文/韩文输入法在**组合期间**按 Enter 是"确认候选词"，不是"提交"。
 * 未判组合态的 Enter 提交会把拼音/半截文本提交出去（中文产品的高频缺陷类；
 * jsdom 测试用 fireEvent.change 绕过了 IME，所以一直没暴露）。
 *
 * React 合成事件读 nativeEvent.isComposing；老浏览器/部分环境只有 keyCode 229
 * 信号（"IME 正在处理按键"），两者都判。
 *
 * 用法（文本输入上的 Enter 提交/失焦保存一律走它）：
 *   if (e.key === 'Enter' && !isImeComposing(e)) submit();
 * 结构不变量守卫见 tests/unit/meta/ime-enter-guard.test.ts（全库扫描 +
 * 非文本输入激活白名单）。
 */
export function isImeComposing(event: {
  nativeEvent?: { isComposing?: boolean; keyCode?: number } | null;
  keyCode?: number;
}): boolean {
  const native = event?.nativeEvent ?? null;
  if (native?.isComposing) return true;
  if (native?.keyCode === 229) return true;
  return event?.keyCode === 229;
}
