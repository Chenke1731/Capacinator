/**
 * Backfill payload semantics shared by EstimationController and
 * DesignEstimationController (改进计划 IP-07a / C11 / C12).
 *
 * - 只有提交的字段进入更新载荷;未提交字段保持库中原值（knex 省略键=不改列）。
 * - 空回填拒绝:不写库、不标完成。
 * - 负数 / NaN / 非数字 / 非法日期 / 显式 null 拒绝。显式清空不是已裁决
 *   操作（计划 D11）——不保留静默清空通道。
 * - backfilled_at 只在合并后行"完整"时写入:Lifecycle 告警与两个回填表单
 *   都把它当"已回填"信号,部分回填写它等于冒充完整。
 */
export type BackfillParseResult =
  | { ok: true; values: Record<string, number | string>; message?: undefined }
  | { ok: false; message: string };

export function parseBackfillBody(
  body: unknown,
  numericFields: readonly string[],
  dateFields: readonly string[]
): BackfillParseResult {
  const source = (body ?? {}) as Record<string, unknown>;
  const values: Record<string, number | string> = {};

  for (const field of numericFields) {
    if (source[field] === undefined) continue;
    const value = source[field];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      return {
        ok: false,
        message: `${field} must be a non-negative number; omit the field to keep its current value (explicit clearing is not supported)`
      };
    }
    values[field] = value;
  }

  for (const field of dateFields) {
    if (source[field] === undefined) continue;
    const value = source[field];
    if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
      return {
        ok: false,
        message: `${field} must be a valid date string; omit the field to keep its current value`
      };
    }
    values[field] = value;
  }

  if (Object.keys(values).length === 0) {
    return { ok: false, message: 'Empty backfill rejected: provide at least one actual field' };
  }
  return { ok: true, values };
}

/** 完整性按合并后的行判断,不按本次提交了什么。 */
export function backfillComplete(
  row: Record<string, unknown>,
  requiredFields: readonly string[]
): boolean {
  return requiredFields.every((f) => row[f] !== null && row[f] !== undefined);
}
