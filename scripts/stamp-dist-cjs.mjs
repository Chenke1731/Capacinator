#!/usr/bin/env node
/**
 * dist 标记为 CommonJS(IP-08c/S04)。
 *
 * 根 package.json "type":"module",而生产 tsc(module:"commonjs")输出 CJS——
 * 不打标记时 `node dist/src/server/index.js` 直接 ReferenceError: exports,
 * 桌面 require 同样按最近 package.json 判 ESM。写入 dist/package.json
 * {"type":"commonjs"} 后,dist 树按 CJS 解析,启动路径一致。
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const distDir = join(process.cwd(), 'dist');
if (!existsSync(distDir)) {
  console.error('✗ dist/ 不存在——请先跑 build:server');
  process.exit(1);
}
mkdirSync(distDir, { recursive: true });
writeFileSync(join(distDir, 'package.json'), JSON.stringify({ type: 'commonjs' }, null, 2) + '\n');
console.log('✓ dist/package.json stamped {type:commonjs}');
