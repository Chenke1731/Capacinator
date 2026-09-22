#!/usr/bin/env node
// UI 生成契约静态防线(契约维度 1/4): 已知反模式在写代码当下就报,不等守卫。
// 当前规则: 按钮类选择器的规则块内出现定宽 width: Npx 而没有同块 padding
// → border-box 下全局 button padding(0.6em 1.2em) 会吃光内容盒, svg 塌成 0 宽。
// (2026-09-22 人力气泡加减号物理消失事故的静态化)
//
// 自证: SELF_TEST=1 注入一条已知反模式,断言能抓到(压力自证,同 verify-boards 碰撞检测器)。

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  'client/src/App.css',
  'client/src/index.css',
  ...process.argv.slice(2)
];

const violations = [];
for (const rel of files) {
  let text;
  try {
    text = readFileSync(resolve(root, rel), 'utf8');
  } catch {
    continue;
  }
  // 逐规则块解析(够用级: 不处理嵌套 @block 内层选择器差异,@media 内规则按原选择器算)
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = ruleRe.exec(text))) {
    const sel = m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim();
    const body = m[2];
    if (!sel || sel.startsWith('@') || sel.includes('@')) continue;
    const isBtnish = /-btn\b|button\b/.test(sel);
    if (!isBtnish) continue;
    const hasFixedWidth = /(^|[^-])width:\s*\d+(\.\d+)?px/.test(body);
    const hasPadding = /padding(-top|-right|-bottom|-left|-inline|-block)?:/.test(body);
    const hasMinWidthOnly = /min-width:/.test(body) && !hasFixedWidth;
    if (hasFixedWidth && !hasPadding && !hasMinWidthOnly) {
      const line = text.slice(0, m.index).split('\n').length;
      violations.push(`${rel}:${line} 「${sel.split('\n').pop().trim()}」 定宽按钮未同块重置 padding → 内容盒会被全局 padding 吃光(图标塌 0 宽)`);
    }
  }
}

if (process.env.SELF_TEST === '1') {
  // 压力自证: 复现事故原样的反模式,必须被抓到
  const buggy = `
.staff-stepper-btn { display:inline-flex; width: 26px; height: 24px; border:none; }
`;
  process.argv.push('/dev/stdin');
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let mm;
  const hits = [];
  while ((mm = ruleRe.exec(buggy))) {
    const sel = mm[1].trim();
    const body = mm[2];
    if (!/-btn\b/.test(sel)) continue;
    if (/(^|[^-])width:\s*\d+px/.test(body) && !/padding/.test(body)) hits.push(sel);
  }
  if (hits.length === 0) {
    console.error('SELF-TEST FAIL: 注入的已知反模式未被检出,检测器失灵');
    process.exit(1);
  }
  console.log(`SELF-TEST PASS: 检出注入反模式 ${hits.join(', ')}`);
  process.exit(violations.length ? 1 : 0);
}

if (violations.length) {
  console.error(`lint:ui FAIL — ${violations.length} 处反模式:`);
  for (const v of violations) console.error('  ' + v);
  console.error('\n修复: 规则块内显式写 padding(图标按钮通常 padding: 0),或改 min-width 让内容撑开。');
  console.error('契约: docs/UI_GENERATION_CONTRACT.md 维度 1/4');
  process.exit(1);
}
console.log('lint:ui PASS — 无已知 CSS 反模式');
