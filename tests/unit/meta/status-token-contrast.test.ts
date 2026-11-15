/**
 * 状态 token 对比度守卫（G2 静态半，2026-11-15）：
 * 浅色主题下 --status-{success,warning,danger,risk}-text 对 -soft 的
 * WCAG 对比度必须 ≥4.5（AA）。Alert 卡图标、EnhancedKPIs、Badge 全消费
 * 这组配对（f7d2a0f/2da3683 token 化后的一致性锚）。
 *
 * 范围说明：仅浅色主题（soft 为 hex 可静态合成）；深色 soft 是半透明
 * 叠底（rgba）无法离线合成，由双主题截图人眼与 verify:colors 兜底。
 * soft 解析到 var() 时跟进一层（如 --status-success-soft→--badge-success-bg）。
 *
 * 变异自证：把任一 text token 改浅一档（如 risk-text #9a3412→#ea580c）
 * → 对应族必红（3.35:1 事故即 B1-3/D1 的来由）。
 */
import { describe, test, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const css = readFileSync(path.resolve('client/src/index.css'), 'utf8');

/** 收集 name→首个定义值（浅色块先于深色块出现） */
const props = new Map<string, string>();
for (const m of css.matchAll(/(--[a-z-]+)\s*:\s*([^;]+);/g)) {
  if (!props.has(m[1])) props.set(m[1], m[2].trim());
}

function resolve(name: string, depth = 0): string | null {
  const v = props.get(name);
  if (v === undefined) return null;
  const vm = v.match(/^var\((--[a-z-]+)\)$/);
  if (vm && depth < 3) return resolve(vm[1], depth + 1);
  return v;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.match(/^#([0-9a-fA-F]{6})$/);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(hexA: string, hexB: string): number {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) throw new Error(`non-hex: ${hexA} vs ${hexB}`);
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const FAMILIES = ['success', 'warning', 'danger', 'risk'] as const;

describe('status token contrast (G2, light theme)', () => {
  for (const family of FAMILIES) {
    test(`--status-${family}-text on -soft ≥ 4.5:1`, () => {
      const text = resolve(`--status-${family}-text`);
      const soft = resolve(`--status-${family}-soft`);
      expect(text).toBeTruthy();
      expect(soft).toBeTruthy();
      // 仅当两端都解析为 hex 时断言（rgba/复合留给渲染面守卫）
      if (text!.startsWith('#') && soft!.startsWith('#')) {
        const ratio = contrast(text!, soft!);
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      } else {
        throw new Error(`${family} 组合未解析为 hex（text=${text} soft=${soft}），守卫需跟进`);
      }
    });
  }
});
