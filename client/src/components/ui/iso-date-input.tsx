/**
 * 页面内日期编辑统一使用 ISO 文本输入（YYYY-MM-DD）。
 *
 * 背景：原生 input[type=date] 的显示格式跟随浏览器 locale（当前环境显示
 * MM/DD/YYYY），与表格/抽屉的 YYYY-MM-DD 不一致，且跨浏览器不可控。
 * 直接操作/排产场景以“可核对的具体日”优先，这里统一为 ISO 文本 + 校验。
 */
import type { CSSProperties } from 'react';

export interface IsoDateInputProps {
  value: string;
  onValueChange: (value: string) => void;
  ariaLabel: string;
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

/** 严格校验真实日历日（2026-02-30 不合格）。 */
export function isIsoCalendarDate(value: string | null | undefined): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
