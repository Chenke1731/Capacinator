/**
 * 探针工装（批 T，2026-11-11）：把"带身份的页面取值"样板收进一处。
 *
 * 背景：I01i→I01s 系列里同一份 登录→localStorage→goto→evaluate→清理 样板
 * 手写了 ~20 遍，出现过身份缺失误开 Login 对话框、双引号 bash 吞反引号
 * 等失败（耗时审计：~15 min 纯浪费 + 若干误诊）。本工具消灭该失败面。
 *
 * 用法（一律写 /tmp/*.mjs 脚本文件后 node 运行，禁内联 -e 传函数体）：
 *   import { probe, probeSession } from '<repo>/scripts/lib/probe.mjs';
 *   const r = await probe('/projects', 'light', () => ({
 *     board: !!document.querySelector('.projects-board'),
 *     btnH: document.querySelector('button.btn')?.getBoundingClientRect().height,
 *   }));
 *   // 多页复用：const s = await probeSession(); await s.run(url1,...); await s.close();
 *
 * 语义：读 ui-profiles 的 fixture 链（数据+日期钉死，可复现）；evaluate 抛错
 * 响亮冒泡（绝不吞）。自证：node scripts/lib/probe.mjs --selftest
 */
import { chromium } from 'playwright';
import { auditEnvironment, authenticate, setupReadOnlyPage } from './ui-profiles.mjs';

export async function probeSession({ launch } = {}) {
  const browser = launch ?? await chromium.launch({ executablePath: auditEnvironment.chrome });
  const auth = await authenticate();
  const run = async (url, theme = 'light', fn, { viewport = { width: 1600, height: 900 }, settle = 900, language = 'zh-CN' } = {}) => {
    const context = await browser.newContext({ viewport });
    try {
      const s = await setupReadOnlyPage(context, auth, theme, { language });
      await s.page.goto(`${auditEnvironment.base}${url}`, { waitUntil: 'networkidle' });
      await s.page.waitForTimeout(settle);
      if (s.errors.length) throw new Error(`probe page errors: ${s.errors.join(' | ')}`);
      return await s.page.evaluate(fn);
    } finally {
      await context.close();
    }
  };
  return { run, close: () => browser.close() };
}

/** 一次性探针（单页单值）；多页请用 probeSession 复用浏览器。 */
export async function probe(url, theme, fn, opts) {
  const s = await probeSession();
  try {
    return await s.run(url, theme, fn, opts);
  } finally {
    await s.close();
  }
}

// ── 自证：探针必须能取到真值；选择器缺失返回可判定的 null 而非静默；
// evaluate 内抛错必须冒泡（吞错=假绿探针，比没有探针更危险）。
if (process.argv[1]?.endsWith('probe.mjs') && process.argv.includes('--selftest')) {
  const s = await probeSession();
  try {
    const ok = await s.run('/projects', 'light', () => ({
      board: !!document.querySelector('.projects-board'),
      missing: document.querySelector('.this-does-not-exist') === null,
    }));
    if (!ok.board) throw new Error('selftest: board not found — probe chain broken');
    if (!ok.missing) throw new Error('selftest: missing-selector contract broken');
    let threw = false;
    try {
      await s.run('/projects', 'light', () => { throw new Error('injected'); });
    } catch (e) {
      threw = String(e.message).includes('injected');
    }
    if (!threw) throw new Error('selftest: evaluate errors are being swallowed');
    console.log('SELF-TEST PASS: probe（真值取回 + 缺失可判 + 抛错冒泡）');
  } finally {
    await s.close();
  }
}
