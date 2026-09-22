/**
 * 短引用码: 事项 id 尾 6 位(2026-09-22 裁决——不加内部自增编码)。
 * 用途: 详情页标题旁展示、截图/口头精确指代、需求台搜索框粘贴直接定位。
 * 不进列表列(不占列预算),不承载域语义(类型/版本/粒度一概不自述)。
 */
export const projectRefCode = (id: string): string => `#${id.slice(-6)}`;

/** 裸码(无 #),搜索比对用 */
export const refCodeOf = (id: string): string => id.slice(-6).toLowerCase();

/** 复制引用码。LAN http 下 navigator.clipboard 不可用(非安全上下文),
 *  回退 execCommand;两者皆败则码本身可选中手抄,不阻塞。 */
export const copyRefCode = async (id: string): Promise<void> => {
  const code = projectRefCode(id);
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
