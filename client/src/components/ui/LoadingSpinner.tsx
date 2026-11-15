import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Spinner } from './spinner';

/** 2026-11-15: 快请求也会立即闪全页 spinner(全库 14 处挂载点)。默认延迟
 *  250ms 再显示,期间保留同尺寸占位避免布局跳动(防 CLS);需要立即显示的
 *  场景传 delayMs={0}。现有测试均 mock 本组件,不受默认值影响。 */
export function LoadingSpinner({ delayMs = 250 }: { delayMs?: number }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(delayMs <= 0);

  useEffect(() => {
    if (delayMs <= 0) {
      setVisible(true);
      return;
    }
    const id = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(id);
  }, [delayMs]);

  if (!visible) {
    return <div className="flex h-full min-h-[200px]" aria-hidden="true" />;
  }

  return (
    <div className="flex h-full min-h-[200px] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Spinner size="lg" className="text-primary" />
        <p className="text-sm text-muted-foreground">{t('common:loading')}</p>
      </div>
    </div>
  );
}
