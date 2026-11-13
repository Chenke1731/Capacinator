/**
 * verify-visual 分片纯函数：解析 `i/n`，按组合序号轮转切分，生成报告后缀。
 * 抽出来是为了让分片边界可自测——避免“shard 2/4 漏掉组合”或“报告名互相
 * 覆盖”这类只在全量 20 分钟跑完才暴露的错误。
 */
export function parseShard(raw) {
  if (raw === undefined || raw === null || raw === '') return { index: 1, total: 1 };
  const match = /^(\d+)\/(\d+)$/.exec(String(raw));
  if (!match) throw new Error(`Invalid --shard ${raw}; expected i/n`);
  const index = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isInteger(index) || !Number.isInteger(total) || index < 1 || total < 1 || index > total) {
    throw new Error(`Invalid --shard ${raw}; expected 1 <= i <= n`);
  }
  return { index, total };
}

export function applyShard(combos, shard) {
  if (!shard || shard.total === 1) return combos;
  return combos.filter((_, index) => index % shard.total === shard.index - 1);
}

export function shardSuffix(shard) {
  return shard && shard.total > 1 ? `-shard-${shard.index}-of-${shard.total}` : '';
}
