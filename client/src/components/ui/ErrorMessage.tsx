import { AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription, AlertTitle } from './alert';

interface ErrorMessageProps {
  message: string;
  details?: string;
}

export function ErrorMessage({ message, details }: ErrorMessageProps) {
  const { t } = useTranslation();

  return (
    <Alert variant="destructive" className="mx-auto max-w-2xl">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{t('common:error')}</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>{message}</p>
        {details && <p className="text-sm opacity-90">{details}</p>}
      </AlertDescription>
    </Alert>
  );
}