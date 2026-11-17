/**
 * 页面内日期编辑统一使用 ISO 文本输入（YYYY-MM-DD）。
 *
 * 背景：原生 input[type=date] 的显示格式跟随浏览器 locale（当前环境显示
 * MM/DD/YYYY），与表格/抽屉的 YYYY-MM-DD 不一致，且跨浏览器不可控。
 * 直接操作/排产场景以“可核对的具体日”优先，这里统一为 ISO 文本 + 校验。
 */
import type { CSSProperties } from 'react';
import { isIsoCalendarDate } from '../../lib/isoDate';

export { isIsoCalendarDate };

export interface IsoDateInputProps {
  value: string;
  onValueChange: (value: string) => void;
  ariaLabel: string;
  ariaDescribedBy?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  id?: string;
  style?: CSSProperties;
}

export function IsoDateInput({
  value,
  onValueChange,
  ariaLabel,
  ariaDescribedBy,
  disabled = false,
  invalid = false,
  className,
  id,
  style,
}: IsoDateInputProps) {
  return (
    <input
      id={id}
      type="text"
      className={className}
      style={style}
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-invalid={invalid || undefined}
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
      placeholder="YYYY-MM-DD"
      maxLength={10}
      pattern="\d{4}-\d{2}-\d{2}"
      data-iso-date="true"
      onChange={(event) => onValueChange(event.target.value)}
    />
  );
}
