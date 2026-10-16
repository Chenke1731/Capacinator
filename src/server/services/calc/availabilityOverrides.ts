import type { Knex } from 'knex';

export interface AvailabilityOverride {
  start: string;
  end: string;
  availability_percentage: number;
}

/**
 * 已批准且与窗口相交的可用率覆盖，按人分组（IP-03a/C06 共享原语）。
 * 2026-10-16 从 EstimationService 私有方法提出来：容量报表时间线
 * （缺口①）与死线校验必须读同一覆盖集合，两处各写一份查询必然漂移。
 * 键为 String(person_id)——sqlite 对 TEXT 列返回 string，归一防止
 * 消费方拿 number/string 混型 key 查空。
 */
export async function fetchApprovedAvailabilityOverrides(
  db: Knex,
  personIds: Array<string | number>,
  windowStartISO: string,
  windowEndISO: string
): Promise<Map<string, AvailabilityOverride[]>> {
  const byPerson = new Map<string, AvailabilityOverride[]>();
  if (personIds.length === 0) return byPerson;
  const rows = await db('person_availability_overrides')
    .whereIn('person_id', personIds)
    .where('is_approved', 1)
    .where('start_date', '<=', windowEndISO)
    .where('end_date', '>=', windowStartISO)
    .select('person_id', 'start_date', 'end_date', 'availability_percentage');
  for (const row of rows) {
    const key = String(row.person_id);
    const list = byPerson.get(key) ?? [];
    list.push({
      start: String(row.start_date).slice(0, 10),
      end: String(row.end_date).slice(0, 10),
      availability_percentage: row.availability_percentage
    });
    byPerson.set(key, list);
  }
  return byPerson;
}
