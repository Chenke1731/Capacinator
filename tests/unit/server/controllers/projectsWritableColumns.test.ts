import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { ProjectsController } from '../../../../src/server/api/controllers/ProjectsController';

/**
 * WRITABLE_COLUMNS 白名单漂移守卫(2026-10-13 全库审计 E1 根治的配套):
 * 白名单里每个键必须在迁移源里有真实列定义——新列加迁移忘了进白名单
 * 会被 pick 静默丢弃(功能悄然失效),白名单写了不存在的列则写入必 500。
 * 事实源用迁移源静态提取(表 API 三形态 + 原生 ADD COLUMN + renameColumn
 * 目标),不依赖任何运行库。
 */
function projectColumnsFromMigrations(): Set<string> {
  const dir = join(__dirname, '../../../../src/server/database/migrations');
  const cols = new Set<string>();
  for (const f of readdirSync(dir).filter((n) => /\.ts$/.test(n))) {
    const src = readFileSync(join(dir, f), 'utf8');
    const blockRe = /(?:create|alter)Table\('projects',\s*\(table\)\s*=>\s*\{([\s\S]*?)\n\s*\}\)/g;
    let m;
    while ((m = blockRe.exec(src))) {
      for (const cm of m[1].matchAll(/table\.(?:string|text|integer|boolean|enu|float|datetime|date)\('(\w+)'/g)) {
        cols.add(cm[1]);
      }
    }
    for (const cm of src.matchAll(/ALTER TABLE projects ADD COLUMN (\w+)/gi)) cols.add(cm[1]);
    for (const cm of src.matchAll(/renameColumn\('\w+',\s*'(\w+)'\)/g)) cols.add(cm[1]);
  }
  return cols;
}

describe('ProjectsController.WRITABLE_COLUMNS 漂移守卫', () => {
  it('提取器 sanity: 三种声明形态都被覆盖(基线列/原生 ADD/rename 目标)', () => {
    const cols = projectColumnsFromMigrations();
    expect(cols.has('name')).toBe(true);                 // baseline table.X
    expect(cols.has('iteration_id')).toBe(true);         // 063a 原生 ADD COLUMN
    expect(cols.has('component_id')).toBe(true);         // 066 原生 ADD COLUMN
    expect(cols.has('external_number')).toBe(true);      // 061 renameColumn 目标
    expect(cols.has('seq_number')).toBe(true);           // 062 alterTable 列
  });

  it('白名单每个键都有真实列定义', () => {
    const cols = projectColumnsFromMigrations();
    const missing = ProjectsController.WRITABLE_COLUMNS.filter((k) => !cols.has(k));
    expect(missing).toEqual([]);
  });
});
