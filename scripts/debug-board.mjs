// 一条命令出全量诊断: npm run debug:board
// 列宽审计(轨道/内容/利用率) + 排版档位 + 预算,双主题轮换
import { chromium } from 'playwright';
import { openBoard, columnAudit, typoAudit, CHROME } from '../lib/board-probes.mjs';

const browser = await chromium.launch({ executablePath: CHROME });
for (const theme of ['light', 'dark']) {
  for (const vw of [Number(process.argv[2] ?? 1600)]) {
    const page = await openBoard(browser, { theme, vw });
    const col = await columnAudit(page);
    const typo = await typoAudit(page);
    console.log(`\n===== ${theme} @${vw} ${col.tier} =====`);
    console.log(`横滚: ${col.hScroll ? '⚠有' : '无'} | 死区: ${col.deadZone}px | 字号档: ${typo.sizes.join('/')} (min ${typo.min}px)`);
    for (const c of col.cols) {
      const flag = c.util < 45 ? ' ←利用率低' : '';
      console.log(`  ${c.key.padEnd(6)} 轨道${String(c.track).padStart(4)} 内容${String(c.natural).padStart(4)} 利用率${String(c.util).padStart(3)}%${flag}`);
    }
    await page.close();
  }
}
await browser.close();
