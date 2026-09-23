// 截图响应模板(2026-09-23): 收到用户截图的第一动作——固定脚本,不依赖临场判断。
// 用法: node scripts/analyze-screenshot.mjs <图片路径>
// 输出: 红圈/箭头坐标聚类 → 圈内色彩结构 → 亮块形状 → 可对照的页面区域建议
// 原理: 用户圈注是唯一事实源;先取证再谈方案,错误暴露在 30 秒内而非 3 轮对话后。
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const path = process.argv[2];
if (!path || !readFileSync(path)) {
  console.error('用法: node scripts/analyze-screenshot.mjs <图片路径>');
  process.exit(1);
}

// 用 PIL 做像素分析(python3 + Pillow 项目环境已有)
const py = `
from PIL import Image
from collections import Counter
import sys, json

img = Image.open('${path}').convert('RGB')
w, h = img.size
px = img.load()
out = {'size': [w, h]}

# ── 1. 红色标注(圈/箭头/下划线)聚类 ──
reds = []
for y in range(0, h, 2):
    for x in range(0, w, 2):
        r, g, b = px[x, y]
        if r > 170 and g < 110 and b < 110 and (r - max(g, b)) > 60:
            reds.append((x, y))
out['red_pixels'] = len(reds)

def cluster(points, gap=40):
    clusters = []
    for x, y in points:
        placed = False
        for c in clusters:
            if any(abs(x-a) < gap and abs(y-b) < gap for a, b in c):
                c.append((x, y)); placed = True; break
        if not placed: clusters.append([(x, y)])
    merged = True
    while merged:
        merged = False
        for i in range(len(clusters)):
            for j in range(i+1, len(clusters)):
                if any(abs(a[0]-b[0]) < gap and abs(a[1]-b[1]) < gap for a in clusters[i] for b in clusters[j]):
                    clusters[i] += clusters[j]; del clusters[j]; merged = True; break
            if merged: break
    return sorted(clusters, key=len, reverse=True)

cs = cluster(reds) if reds else []
out['annotations'] = []
for c in cs[:3]:
    xs = [p[0] for p in c]; ys = [p[1] for p in c]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    ann = {'bbox': [x0, y0, x1, y1], 'center': [(x0+x1)//2, (y0+y1)//2], 'px': len(c)}
    # 圈内采样(收缩 15% 去掉红圈本身)
    mx, my = max(1,int((x1-x0)*0.15)), max(1,int((y1-y0)*0.15))
    if x1-x0 > 30 and y1-y0 > 30:
        colors = Counter()
        for yy in range(y0+my, y1-my, 2):
            for xx in range(x0+mx, x1-mx, 2):
                colors[px[xx, yy]] += 1
        ann['top_colors'] = [f'rgb{c}' for c, _ in colors.most_common(5)]
        # 亮块(>=239)行分布 → 块结构
        bright_rows = []
        for yy in range(y0+my, y1-my):
            n = sum(1 for xx in range(x0+mx, x1-mx, 2) if sum(px[xx, yy])/3 >= 239)
            bright_rows.append(n)
        if bright_rows:
            segs = (max(bright_rows), sum(1 for n in bright_rows if n > 5))
            ann['bright_blocks'] = segs
    out['annotations'].append(ann)

# ── 2. 全图暗色文字主色(判断主题) ──
dark = Counter()
for yy in range(0, h, 12):
    for xx in range(0, w, 12):
        r, g, b = px[xx, yy]
        if max(r, g, b) < 120:
            dark[(r//24*24, g//24*24, b//24*24)] += 1
out['theme_hint'] = 'dark' if sum(1 for yy in range(0, h, 20) for xx in range(0, w, 20) if sum(px[xx, yy])/3 > 200) < (w//20)*(h//20)*0.5 else 'light'
out['dark_text_top'] = [f'rgb{c}' for c, _ in dark.most_common(3)]

print(json.dumps(out))
`;

// 多行 python 必须走临时文件(python3 -c 的换行转义会炸——2026-09-23 自证踩坑)
import { writeFileSync, unlinkSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
const tmp = mkdtempSync(join(tmpdir(), 'shot-'));
const pyFile = join(tmp, 'analyze.py');
writeFileSync(pyFile, py);
let raw;
try {
  raw = execSync(`python3 ${JSON.stringify(pyFile)}`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
} finally {
  unlinkSync(pyFile);
  try { unlinkSync(join(tmp)); } catch { /* 目录非空时忽略 */ }
}
const a = JSON.parse(raw);

console.log(`截图 ${a.size[0]}×${a.size[1]}  主题判断: ${a.theme_hint}`);
if (a.red_pixels === 0) {
  console.log('未检测到红色标注——直接对照整页结构分析');
} else {
  for (const [i, ann] of a.annotations.entries()) {
    const [x0, y0, x1, y1] = ann.bbox;
    console.log(`\n圈${i + 1}: ${x1 - x0}×${y1 - y0} @中心(${ann.center[0]},${ann.center[1]}) ${ann.px}px`);
    if (ann.top_colors) console.log(`  圈内主色: ${ann.top_colors.join(' ')}`);
    if (ann.bright_blocks) console.log(`  亮块: 最宽 ${ann.bright_blocks[0]}px, 有亮块行数 ${ann.bright_blocks[1]}`);
    console.log(`  → 下一步: 用无头探针取页面该坐标区域的 DOM 结构对照`);
  }
}
console.log(`\n暗文字主色: ${(a.dark_text_top || []).join(' ')}`);
