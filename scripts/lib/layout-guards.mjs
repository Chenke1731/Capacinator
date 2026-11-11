// 共享布局守卫: 几何碰撞 + 横向溢出。被 verify-boards / verify-visual 复用。
// 碰撞定义: 同一作用域内两个可见元素矩形在两个方向都相交 >2px,且互不包含。
// 覆盖"内容溢出盒子"型重叠的探测面——盒子固定宽时溢出的是子内容,矩形相交仍可检出。

export async function findCollisions(page, scopeSelector = '.unified-tab-content') {
  return page.evaluate((scopeSel) => {
    const bad = [];
    const scopes = document.querySelectorAll(scopeSel);
    if (!scopes.length) return bad;
    const seen = new Set();
    scopes.forEach((scope) => {
      const els = Array.from(scope.querySelectorAll('button, span, input, select, a, td, th, div')).filter((e) => {
        const r = e.getBoundingClientRect();
        if (!r.width || !r.height) return false;
        const c = getComputedStyle(e);
        if (c.visibility === 'hidden' || c.display === 'none' || +c.opacity === 0) return false;
        // 只留"叶子级文本/交互件": 自身直接持有文本节点,或本就是控件
        const hasOwnText = Array.from(e.childNodes).some(
          (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim()
        );
        return hasOwnText || e.matches('button,input,select');
      });
      // 可见矩形: 与 overflow!=visible 祖先求交——被裁剪的"幽灵矩形"不算碰撞
      const visRect = (el) => {
        let r = el.getBoundingClientRect();
        let p = el.parentElement;
        while (p) {
          const s = getComputedStyle(p);
          if (s.overflow !== 'visible' || s.overflowX !== 'visible' || s.overflowY !== 'visible') {
            const pr = p.getBoundingClientRect();
            r = { left: Math.max(r.left, pr.left), right: Math.min(r.right, pr.right), top: Math.max(r.top, pr.top), bottom: Math.min(r.bottom, pr.bottom) };
          }
          p = p.parentElement;
        }
        return r;
      };
      // 批 D（2026-11-11，评审 D2-a 裁剪感知版）：裁剪残片跳过——仅当元素
      // 确属被祖先裁剪（未裁宽 − 可见宽 > 1px）且可见宽 < 8px 时视为残片。
      // 天然窄元素（未裁宽即窄，如单字符徽章）不在此列，其真实重叠仍报。
      const isClippedSliver = (el) => {
        const full = el.getBoundingClientRect();
        const vis = visRect(el);
        return (full.width - (vis.right - vis.left) > 1) && (vis.right - vis.left) < 8;
      };
      for (let a = 0; a < els.length; a++) {
        if (isClippedSliver(els[a])) continue;
        for (let b = a + 1; b < els.length; b++) {
          if (els[a].contains(els[b]) || els[b].contains(els[a])) continue;
          if (isClippedSliver(els[b])) continue;
          const A = visRect(els[a]);
          const B = visRect(els[b]);
          if (A.right - A.left < 2 || B.right - B.left < 2) continue;
          const ox = Math.min(A.right, B.right) - Math.max(A.left, B.left);
          const oy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
          if (ox > 2 && oy > 2) {
            const key = `${(els[a].textContent || '').trim().slice(0, 8)}×${(els[b].textContent || '').trim().slice(0, 8)}`;
            if (!seen.has(key)) {
              seen.add(key);
              bad.push(`${key} ${ox.toFixed(0)}x${oy.toFixed(0)}px @y${A.top.toFixed(0)}`);
            }
          }
        }
      }
    });
    return bad;
  }, scopeSelector);
}

export async function findOverflow(page) {
  return page.evaluate(() => {
    const bad = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > doc.clientWidth + 1) {
      bad.push(`页面横向溢出 ${doc.scrollWidth - doc.clientWidth}px`);
    }
    return bad;
  });
}
