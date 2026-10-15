/**
 * 估算表单数值字段统一解释（改进计划 IP-06c / R07）。
 *
 * 空串=使用缺省；合法数字（含 0）原样保留；非法值显式报错——
 * 预览、保存载荷、服务端校验使用同一解释,禁止 `|| 默认` 吞掉合法 0。
 * 报错文案与服务端逐字一致（i18n-error 未知消息透传原文）。
 */

/** 空串 → 缺省;其余交给 Number(非法字符串得 NaN,由校验方报错) */
export function resolveOptionalNumber(raw: string, fallback: number): number {
  return raw === '' ? fallback : Number(raw);
}

export function positiveNumberError(n: number, label: string): string | null {
  if (!Number.isFinite(n) || !(n > 0)) return `${label} must be a positive number`;
  return null;
}

export function rangeError(n: number, label: string, min: number, max: number): string | null {
  if (!Number.isFinite(n) || n < min || n > max) return `${label} must be between ${min} and ${max}`;
  return null;
}
