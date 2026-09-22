/**
 * 引用码: 创建序号 #N(2026-09-22 裁决数字化——字母组合奇怪,数字可口头指代
 * "3号需求")。落库 seq_number(migration 062,回填+max+1 递增),稳定不动。
 * 用途: 详情页标题旁展示、截图/口头精确指代、需求台搜索框 #N 直接定位。
 * 不进列表列(不占列预算),不承载域语义。
 */
export const projectRefCode = (seqNumber: number | null | undefined): string =>
  seqNumber != null ? `#${seqNumber}` : '';

/** 复制引用码。LAN http 下 navigator.clipboard 不可用(非安全上下文),
 *  回退 execCommand;两者皆败则码本身可选中手抄,不阻塞。 */
export const copyRefCode = async (seqNumber: number | null | undefined): Promise<void> => {
  const code = projectRefCode(seqNumber);
  if (!code) return;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(code);
      return;
    }
  } catch {
    /* 走回退 */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = code;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  } catch {
    /* 静默:文本可选中,用户手抄 */
  }
};
