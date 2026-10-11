import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';

/**
 * 需求台行选择三态框(2026-10-11 批量操作)。
 * Radix 原语(键盘/a11y 免费) + 板内视觉语言: 16px、设计系统变量、
 * 半选渲染短横。样式在 App.css(.req-checkbox);显式声明字号字重与
 * padding(排版铁律: button 全局继承 500,定宽按钮必须显式重置)。
 *
 * onToggle 收到"点击后的目标布尔态": 未选/半选点击 → true(选整树),
 * 已选点击 → false。Radix 对 indeterminate 态点击同样派发 true。
 */
export function ReqCheckbox({ checked, onToggle, label, disabled }: {
  checked: boolean | 'indeterminate';
  onToggle: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <CheckboxPrimitive.Root
      type="button"
      className="req-checkbox"
      checked={checked}
      onCheckedChange={(v) => onToggle(v === true)}
      aria-label={label}
      disabled={disabled}
      data-testid="req-checkbox"
      data-state={checked === 'indeterminate' ? 'indeterminate' : checked ? 'checked' : 'unchecked'}
    >
      <CheckboxPrimitive.Indicator className="req-checkbox-ind">
        {checked === 'indeterminate' ? <Minus size={10} strokeWidth={3.2} /> : <Check size={11} strokeWidth={3.2} />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
