import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * 迁移源静态列提取器(2026-10-13): 覆盖三种声明形态——
 *   1. createTable/alterTable 块内的 table.<type>('col')
 *   2. 原生 `ALTER TABLE t ADD COLUMN col`
 *   3. renameColumn 的目标列
 * 不依赖任何运行库(迁移在 jest 语境不可运行——036 引编译路径)。
 * 消费方: projectsWritableColumns 漂移守卫 + schema-drift 守卫。
 */
export function migrationColumns(table: string): Set<string> {
  const dir = join(__dirname, '../../../../src/server/database/migrations');
  const cols = new Set<string>();
  // 表重建模式(new 表 + renameTable 归位): 归位前的 _new 块也算本表
  const aliases = new Set<string>([table]);
  for (const f of readdirSync(dir).filter((n) => /\.ts$/.test(n))) {
    const src = readFileSync(join(dir, f), 'utf8');
    for (const rm of src.matchAll(new RegExp(`renameTable\\('(\\w+)',\\s*'${table}'\\)`, 'g'))) aliases.add(rm[1]);
    for (const alias of aliases) {
      const blockRe = new RegExp(
        `(?:create|alter)Table\\('${alias}',\\s*\\(table\\)\\s*=>\\s*\\{([\\s\\S]*?)\\n\\s*\\}\\)`, 'g'
      );
      let m;
      while ((m = blockRe.exec(src))) {
        for (const cm of m[1].matchAll(/table\.(?:string|text|integer|boolean|enu|float|datetime|date|increments)\('(\w+)'/g)) {
          cols.add(cm[1]);
        }
        for (const cm of m[1].matchAll(/renameColumn\('\w+',\s*'(\w+)'\)/g)) cols.add(cm[1]);
      }
      for (const cm of src.matchAll(new RegExp(`ALTER TABLE ${alias} ADD COLUMN (\\w+)`, 'gi'))) cols.add(cm[1]);
    }
  }
  return cols;
}

/** 手写集成 schema(test-schema*.sql)的列提取——CREATE TABLE 块 + ALTER ADD
 *  + 重建模式(_new 表 + RENAME TO 归位) */
export function handSchemaColumns(table: string): Set<string> {
  const cols = new Set<string>();
  const names = new Set<string>([table]);
  for (const f of ['test-schema.sql', 'test-schema-additions.sql']) {
    const src = readFileSync(join(__dirname, '../../../../tests/integration', f), 'utf8');
    for (const rm of src.matchAll(new RegExp(`ALTER TABLE (\\w+) RENAME TO ${table}`, 'gi'))) names.add(rm[1]);
    for (const name of names) {
      const blockRe = new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?${name} \\(([\\s\\S]*?)\\n\\);`, 'gi');
      let m;
      while ((m = blockRe.exec(src))) {
        for (const line of m[1].split('\n')) {
          const cm = line.trim().match(/^(\w+)\s+(?:TEXT|INTEGER|REAL|DATETIME|BOOLEAN|BLOB)/i);
          if (cm) cols.add(cm[1]);
        }
      }
      for (const cm of src.matchAll(new RegExp(`ALTER TABLE ${name} ADD COLUMN (\\w+)`, 'gi'))) cols.add(cm[1]);
    }
  }
  return cols;
}
