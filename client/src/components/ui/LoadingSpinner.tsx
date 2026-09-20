import { useTranslation } from 'react-i18next';
import { Spinner } from './spinner';

export function LoadingSpinner() {
  const { t } = useTranslation();

  return (
    <div className="flex h-full min-h-[200px] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Spinner size="lg" className="text-primary" />
        <p className="text-sm text-muted-foreground">{t('common:loading')}</p>
      </div>
    </div>
  );
}