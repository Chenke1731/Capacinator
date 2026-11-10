/**
 * I01 快速捕捉解析器（纯函数，2026-11-10 设计稿 §5.2）。
 *
 * 只做提示、不做决定：解析结果全部可被用户覆盖；缺省永不造值。
 * - URL 优先：行内有 URL → source_ref=URL，不再用 SR/AR 正则覆盖；
 * - 无 URL 时提取 SR/AR 编号并从标题中剥离；
 * - 日期仅接受显式 ISO（YYYY-MM-DD / YYYY/MM/DD→归一）；**不解析"11月底"**
 *   （U10 反假日期红线同源：模糊日期留在原文，不冒充期望值）；
 * - P1–P5 → priority_hint（仅分流预填）；
 * - 标题 = 剥离链接/编号/日期/优先级后的剩余文本；全链接行 → null，
 *   由 UI 兜底"未命名需求（ref）"。
 */

const URL_RE = /(https?:\/\/[^\s，。；、）)]+)/i;
const REF_RE = /(SR|AR)[-_ ]?(\d+)/i;
const PRIO_RE = /(?:^|\s)[Pp]([1-5])(?=\s|$)/;
const ISO_RE = /(\d{4})-(\d{2})-(\d{2})/;
const SLASH_DATE_RE = /(\d{4})\/(\d{2})\/(\d{2})/;

export interface ParsedIntakeItem {
  title: string | null;
  source_ref: string | null;
  priority_hint: number | null;
  expected_finish: string | null;
}

export function parseIntakeLine(line: string): ParsedIntakeItem {
  let rest = line;

  let source_ref: string | null = null;
  const url = rest.match(URL_RE);
  if (url) {
    source_ref = url[1];
    rest = rest.replace(url[0], ' ');
  } else {
    const ref = rest.match(REF_RE);
    if (ref) {
      source_ref = `${ref[1].toUpperCase()}${ref[2]}`;
      rest = rest.replace(ref[0], ' ');
    }
  }

  let priority_hint: number | null = null;
  const p = rest.match(PRIO_RE);
  if (p) {
    priority_hint = Number(p[1]);
    rest = rest.replace(p[0], ' ');
  }

  let expected_finish: string | null = null;
  const iso = rest.match(ISO_RE);
  if (iso) {
    expected_finish = `${iso[1]}-${iso[2]}-${iso[3]}`;
    rest = rest.replace(iso[0], ' ');
  } else {
    const slash = rest.match(SLASH_DATE_RE);
    if (slash) {
      expected_finish = `${slash[1]}-${slash[2]}-${slash[3]}`;
      rest = rest.replace(slash[0], ' ');
    }
  }

  const title = rest.replace(/\s+/g, ' ').trim();
  return { title: title || null, source_ref, priority_hint, expected_finish };
}

export interface SplitIntakeResult {
  /** auto 且 >1 非空行 → true（一行一条） */
  multi: boolean;
  /** single 模式恒为 [首行]（解析用首行，原文整段由调用方保存 raw_text） */
  lines: string[];
}

/** auto：按非空行拆分，>1 行即多行模式；single：整段一条（取首行供解析） */
export function splitIntakeText(text: string, mode: 'auto' | 'single'): SplitIntakeResult {
  const trimmed = text.replace(/\r/g, '');
  const lines = trimmed.split('\n').map((s) => s.trim()).filter(Boolean);
  if (mode === 'single') {
    return { multi: false, lines: lines.length > 0 ? [lines[0]] : [] };
  }
  return { multi: lines.length > 1, lines };
}
