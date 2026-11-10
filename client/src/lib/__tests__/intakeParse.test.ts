/**
 * I01 快速捕捉解析器单测（设计稿 §5.2 收敛决策的逐条钉死）。
 */
import {
  parseIntakeLine,
  splitIntakeText,
} from '../intakeParse';

describe('parseIntakeLine', () => {
  test('SR 号 + 优先级 + ISO 日期全部提取并从标题剥离', () => {
    const parsed = parseIntakeLine('SR123456 用户登录改造 P2 2026-11-30 交付');
    expect(parsed.title).toBe('用户登录改造 交付');
    expect(parsed.source_ref).toBe('SR123456');
    expect(parsed.priority_hint).toBe(2);
    expect(parsed.expected_finish).toBe('2026-11-30');
  });

  test('URL 优先：行内有链接 → source_ref=URL，SR 正则不再覆盖', () => {
    const parsed = parseIntakeLine('https://jdc.example/ticket/SR-98765 报表导出优化');
    expect(parsed.source_ref).toBe('https://jdc.example/ticket/SR-98765');
    expect(parsed.title).toBe('报表导出优化');
  });

  test('无 URL 时 SR/AR 从任意位置提取并归一大写', () => {
    expect(parseIntakeLine('ar_000123 已上线').source_ref).toBe('AR000123');
    expect(parseIntakeLine('前置 sr-556677 后缀').source_ref).toBe('SR556677');
  });

  test('斜杠日期归一为 ISO；仅显式日期解析', () => {
    expect(parseIntakeLine('报表导出 2026/11/30 前完成').expected_finish).toBe('2026-11-30');
    // "11月底"不解析（反假日期红线）
    expect(parseIntakeLine('登录改造 11月底上线').expected_finish).toBeNull();
  });

  test('P 档只认独立词（不误吃 SR 编号里的数字）', () => {
    expect(parseIntakeLine('SR123456 需求').priority_hint).toBeNull();
    expect(parseIntakeLine('P1 紧急需求').priority_hint).toBe(1);
  });

  test('整行只有链接 → 标题回退 null（UI 兜底未命名）', () => {
    const parsed = parseIntakeLine('https://jdc.example/SR1');
    expect(parsed.source_ref).toBe('https://jdc.example/SR1');
    expect(parsed.title).toBeNull();
  });

  test('空行/纯空白 → 全 null', () => {
    const parsed = parseIntakeLine('   ');
    expect(parsed.title).toBeNull();
    expect(parsed.source_ref).toBeNull();
    expect(parsed.expected_finish).toBeNull();
    expect(parsed.priority_hint).toBeNull();
  });
});

describe('splitIntakeText', () => {
  test('auto：多非空行 → multi=true 一行一条', () => {
    const result = splitIntakeText('SR1 一号\n\nSR2 二号\n', 'auto');
    expect(result.multi).toBe(true);
    expect(result.lines).toEqual(['SR1 一号', 'SR2 二号']);
  });

  test('auto：单行 → multi=false', () => {
    expect(splitIntakeText('只有一行', 'auto')).toEqual({ multi: false, lines: ['只有一行'] });
  });

  test('single：整段一条，取首行供解析', () => {
    const result = splitIntakeText('SR3 标题行\n正文第二段\n正文第三段', 'single');
    expect(result.multi).toBe(false);
    expect(result.lines).toEqual(['SR3 标题行']);
  });

  test('空文本 → 零行', () => {
    expect(splitIntakeText('  \n  ', 'auto').lines).toEqual([]);
  });
});
