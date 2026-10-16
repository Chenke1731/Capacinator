#!/usr/bin/env node
/**
 * 构建产物路径验收(IP-08c/S04)。
 *
 * 历史:tsc(rootDir=".") 输出 dist/src/server/index.js,而桌面与 prod 启动
 * 脚本找 dist/server/index.js——干净构建后启动必失败,曾断 8 天无人发现。
 * 消费方现已统一到 dist/src/server/index.js;本脚本挂在 build 链尾,
 * 产物缺位即红,防止路径再度漂移。
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const required = [
  'dist/src/server/index.js',      // 服务端入口(prod 启动/桌面均指向此)
  'dist-client/index.html',        // 客户端产物(electron-builder files)
  'dist/package.json'              // CJS 标记(根 type:module 下防 ESM 误判)
];

const missing = required.filter((rel) => !existsSync(join(process.cwd(), rel)));
if (missing.length > 0) {
  console.error('✗ Build output check failed — missing:');
  for (const m of missing) console.error(`  ${m}`);
  process.exit(1);
}
console.log('✓ Build output paths verified:', required.join(', '));
