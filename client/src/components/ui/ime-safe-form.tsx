/**
 * IME 安全表单：文本输入的 Enter 会触发原生 form submit；中文/日韩输入法
 * 组合期间按 Enter 是"确认候选词"，不能提交。浏览器 SubmitEvent 本身不带
 * composition 状态，因此在 form 上跟踪子输入的 compositionstart/end，
 * onSubmit 时若仍在组合态则阻止提交。
 */
import { forwardRef, useRef, type FormHTMLAttributes } from 'react';

export const ImeSafeForm = forwardRef<HTMLFormElement, FormHTMLAttributes<HTMLFormElement>>(
  function ImeSafeForm({ onSubmit, onCompositionStart, onCompositionEnd, ...rest }, ref) {
    const composingRef = useRef(false);
    return (
      <form
        ref={ref}
        {...rest}
        onCompositionStart={(event) => {
          composingRef.current = true;
          onCompositionStart?.(event);
        }}
        onCompositionEnd={(event) => {
          composingRef.current = false;
          onCompositionEnd?.(event);
        }}
        onSubmit={(event) => {
          if (composingRef.current) {
            event.preventDefault();
            return;
          }
          onSubmit?.(event);
        }}
      />
    );
  }
);
