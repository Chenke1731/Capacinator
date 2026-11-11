import { useEffect, useState } from 'react';

/**
 * 防抖值（G-17，批 C 尾项 2026-11-11）：搜索框逐键直连 queryKey 时每个字符
 * 触发一次 GET（intake 收件箱实测）——输入停顿 delay 后才更新下游值。
 * 保留原始值给受控输入，防抖值喂查询。
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
