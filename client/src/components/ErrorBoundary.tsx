/**
 * Error boundaries (I1): the app previously shipped none — any runtime
 * render exception blanked the whole page (real case: ReportsTabContent
 * ClipboardList ReferenceError took out the entire page). One root-level
 * boundary renders an error card instead of a white screen; per-route
 * boundaries keep the shell (nav) alive when a single page dies.
 *
 * The boundary itself is a class component (React's only error-boundary
 * API); the fallback card is a function component so it can use i18n.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from './ui/alert';
import { Button } from './ui/button';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

const ErrorFallback = ({ onRetry }: { onRetry: () => void }) => {
  const { t } = useTranslation();
  return (
    <Alert variant="destructive" role="alert">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{t('errors:boundary.title')}</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <span>{t('errors:boundary.description')}</span>
        <Button variant="outline" size="sm" className="w-fit" onClick={onRetry}>
          {t('errors:boundary.retry')}
        </Button>
      </AlertDescription>
    </Alert>
  );
};

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Surface in the console for diagnosis (the boundary swallows the
    // crash otherwise); wire to a reporting service here if one lands.
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return <ErrorFallback onRetry={this.reset} />;
    }
    return this.props.children;
  }
}
