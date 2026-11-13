#!/usr/bin/env node
/**
 * verify-visual 分片运行器。
 *
 * 全量视觉矩阵约 160 组合，单进程串行 18–25 min；每个组合是独立的
 * 页面/主题/视口，天然可切分。本脚本按 `--shard i/n` 启动 n 个
 * verify-visual 进程并汇总退出码。报告/基线按 tag 隔离，shard 报告名
 * 带 `-shard-i-of-n` 后缀；共享预算/夹具写入模式（--record-existing-axe /
 * --capture-fixtures）会被 verify-visual 自身拒绝。
 *
 * 用法:
 *   node scripts/verify-visual-shards.mjs                 # 默认 4 分片
 *   node scripts/verify-visual-shards.mjs --shards 8
 *   node scripts/verify-visual-shards.mjs --shards 4 --page /dashboard
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const args = process.argv.slice(2);
let shards = 4;
const forwarded = [];

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--help' || arg === '-h') {
    console.log('verify-visual-shards: [--shards N] [verify-visual args...]');
    process.exit(0);
  }
  if (arg === '--shards') {
    if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Missing value for --shards');
    shards = Number(args[++i]);
    continue;
  }
  if (arg.startsWith('--shards=')) {
    shards = Number(arg.slice('--shards='.length));
    continue;
  }
  forwarded.push(arg);
}

if (!Number.isInteger(shards) || shards < 1 || shards > 16) {
  throw new Error('--shards must be an integer between 1 and 16');
}

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const script = path.join(here, 'verify-visual.mjs');
const startedAt = Date.now();
const children = [];

function pipeWithPrefix(stream, prefix) {
  const lines = createInterface({ input: stream });
  lines.on('line', (line) => console.log(`${prefix} ${line}`));
}

function runShard(index) {
  return new Promise((resolve) => {
    const label = `[${index}/${shards}]`;
    const child = spawn(
      process.execPath,
      [script, '--shard', `${index}/${shards}`, ...forwarded],
      { cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    children.push(child);
    pipeWithPrefix(child.stdout, label);
    pipeWithPrefix(child.stderr, label);
    child.on('error', (error) => {
      console.error(`${label} spawn failed: ${error.message}`);
      resolve(1);
    });
    child.on('exit', (code, signal) => {
      const status = code ?? (signal ? 128 : 1);
      console.log(`${label} exited ${signal ? `signal ${signal}` : `code ${status}`}`);
      resolve(status);
    });
  });
}

const onSignal = (signal) => {
  for (const child of children) child.kill(signal);
  process.exit(130);
};
process.on('SIGINT', () => onSignal('SIGINT'));
process.on('SIGTERM', () => onSignal('SIGTERM'));

const codes = await Promise.all(Array.from({ length: shards }, (_, i) => runShard(i + 1)));
const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
const failed = codes.filter((code) => code !== 0).length;
console.log(`\nverify-visual shards: ${shards - failed}/${shards} passed, wall=${elapsed}s`);
process.exit(failed > 0 ? 1 : 0);
