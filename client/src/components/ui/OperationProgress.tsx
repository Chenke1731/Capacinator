import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle, XCircle, RefreshCw, AlertTriangle } from "lucide-react";
import { ProgressBar, ProgressBarProps } from "./ProgressBar";
import { Spinner } from "./spinner";
import { cn } from "@/lib/utils";

export type OperationStatus = "idle" | "running" | "success" | "error" | "warning";

export interface OperationProgressProps {
  /** Current status of the operation */
  status: OperationStatus;
  /** Current progress value (0-100 or current/total) */
  current?: number;
  /** Total value for progress calculation */
  total?: number;
  /** Status message to display */
  message?: string;
  /** Detailed description or sub-message */
  details?: string;
  /** Estimated time remaining in seconds */
  estimatedTimeRemaining?: number;
  /** Callback when retry button is clicked */
  onRetry?: () => void;
  /** Callback when cancel button is clicked */
  onCancel?: () => void;
  /** Whether retry is available */
  canRetry?: boolean;
  /** Whether cancel is available */
  canCancel?: boolean;
  /** Progress bar variant */
  variant?: ProgressBarProps["variant"];
  /** Additional class name */
  className?: string;
  /** Errors encountered during operation */
  errors?: string[];
  /** Warnings encountered during operation */
  warnings?: string[];
}

/**
 * Formats seconds into a human-readable time string
 */
function formatTimeRemaining(seconds: number): string {
  if (seconds < 60) {
    return `${Math.ceil(seconds)} second${seconds !== 1 ? "s" : ""} remaining`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.ceil(seconds % 60);
  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s remaining`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m remaining`;
}

/**
 * OperationProgress component for displaying progress of long-running operations
 * with status messages, time estimates, and retry capability.
 */
export function OperationProgress({
  status,
  current = 0,
  total = 100,
  message,
  details,
  estimatedTimeRemaining,
  onRetry,
  onCancel,
  canRetry = false,
  canCancel = false,
  variant,
  className,
  errors,
  warnings,
}: OperationProgressProps) {
  const { t } = useTranslation();
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
  const isRunning = status === "running";
  const isComplete = status === "success" || status === "error" || status === "warning";

  // Determine variant based on status if not provided
  const progressVariant = variant || (
    status === "success" ? "success" :
    status === "error" ? "danger" :
    status === "warning" ? "warning" :
    "default"
  );

  // Status icon
  const StatusIcon = {
    idle: null,
    running: () => <Spinner size="sm" className="text-primary" />,
    success: () => <CheckCircle className="h-5 w-5 text-green-500" />,
    error: () => <XCircle className="h-5 w-5 text-red-500" />,
    warning: () => <AlertTriangle className="h-5 w-5 text-yellow-500" />,
  }[status];

  return (
    <div className={cn("rounded-lg border bg-card p-4 shadow-sm", className)}>
      {/* Header with status and message */}
      <div className="flex items-center gap-3 mb-3">
        {StatusIcon && <StatusIcon />}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">
            {message || (isRunning ? t('common:processing') : status === "success" ? t('common:complete') : status === "error" ? t('common:failed') : t('common:ready'))}
          </p>
          {details && (
            <p className="text-xs text-muted-foreground truncate">{details}</p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          {canCancel && isRunning && onCancel && (
            <button
              onClick={onCancel}
              className="btn btn-sm btn-secondary"
              title={t('common:cancelOperation')}
            >
              {t('common:cancel')}
            </button>
          )}
          {canRetry && status === "error" && onRetry && (
            <button
              onClick={onRetry}
              className="btn btn-sm btn-primary flex items-center gap-1"
              title={t('common:retryOperation')}
            >
              <RefreshCw className="h-3 w-3" />
              {t('common:retry')}
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {(isRunning || isComplete) && (
        <div className="mb-2">
          <ProgressBar
            value={isComplete ? 100 : percentage}
            variant={progressVariant}
            size="md"
            indeterminate={isRunning && total === 0}
          />
        </div>
      )}

      {/* Progress details */}
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>
          {isRunning && total > 0 && `${current} of ${total}`}
          {isComplete && status === "success" && t('common:completedSuccessfully')}
          {isComplete && status === "error" && t('common:operationFailedTitle')}
          {isComplete && status === "warning" && t('common:completedWithWarnings')}
        </span>
        <span>
          {isRunning && percentage > 0 && `${percentage}%`}
          {isRunning && estimatedTimeRemaining !== undefined && estimatedTimeRemaining > 0 && (
            <span className="ml-2">{formatTimeRemaining(estimatedTimeRemaining)}</span>
          )}
        </span>
      </div>

      {/* Errors section */}
      {errors && errors.length > 0 && (
        <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
          <p className="text-xs font-medium text-red-700 dark:text-red-300 mb-1">
            Errors ({errors.length}):
          </p>
          <ul className="text-xs text-red-600 dark:text-red-400 list-disc list-inside max-h-24 overflow-y-auto">
            {errors.slice(0, 5).map((error, index) => (
              <li key={index} className="truncate">{error}</li>
            ))}
            {errors.length > 5 && (
              <li className="text-red-500">...and {errors.length - 5} more errors</li>
            )}
          </ul>
        </div>
      )}

      {/* Warnings section */}
      {warnings && warnings.length > 0 && (
        <div className="mt-3 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded border border-yellow-200 dark:border-yellow-800">
          <p className="text-xs font-medium text-yellow-700 dark:text-yellow-300 mb-1">
            Warnings ({warnings.length}):
          </p>
          <ul className="text-xs text-yellow-600 dark:text-yellow-400 list-disc list-inside max-h-24 overflow-y-auto">
            {warnings.slice(0, 5).map((warning, index) => (
              <li key={index} className="truncate">{warning}</li>
            ))}
            {warnings.length > 5 && (
              <li className="text-yellow-500">...and {warnings.length - 5} more warnings</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Hook for managing operation progress state
 */
export interface UseOperationProgressOptions {
  /** Initial total for progress calculation */
  initialTotal?: number;
  /** Callback when operation completes successfully */
  onSuccess?: () => void;
  /** Callback when operation fails */
  onError?: (error: string) => void;
}

export interface OperationProgressState {
  status: OperationStatus;
  current: number;
  total: number;
  message: string;
  details: string;
  errors: string[];
  warnings: string[];
  estimatedTimeRemaining?: number;
}

export function useOperationProgress(options: UseOperationProgressOptions = {}) {
  const { initialTotal = 0, onSuccess, onError } = options;

  const [state, setState] = useState<OperationProgressState>({
    status: "idle",
    current: 0,
    total: initialTotal,
    message: "",
    details: "",
    errors: [],
    warnings: [],
  });

  const [startTime, setStartTime] = useState<number | null>(null);

  // Calculate estimated time remaining based on progress
  useEffect(() => {
    if (state.status === "running" && startTime && state.current > 0 && state.total > 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = state.current / elapsed;
      const remaining = (state.total - state.current) / rate;
      setState(prev => ({ ...prev, estimatedTimeRemaining: remaining }));
    }
  }, [state.current, state.total, state.status, startTime]);

  const start = useCallback((message: string, total?: number) => {
    setStartTime(Date.now());
    setState({
      status: "running",
      current: 0,
      total: total || initialTotal,
      message,
      details: "",
      errors: [],
      warnings: [],
    });
  }, [initialTotal]);

  const updateProgress = useCallback((current: number, details?: string) => {
    setState(prev => ({
      ...prev,
      current,
      details: details || prev.details,
    }));
  }, []);

  const setTotal = useCallback((total: number) => {
    setState(prev => ({ ...prev, total }));
  }, []);

  const setMessage = useCallback((message: string) => {
    setState(prev => ({ ...prev, message }));
  }, []);

  const addError = useCallback((error: string) => {
    setState(prev => ({ ...prev, errors: [...prev.errors, error] }));
  }, []);

  const addWarning = useCallback((warning: string) => {
    setState(prev => ({ ...prev, warnings: [...prev.warnings, warning] }));
  }, []);

  const complete = useCallback((message?: string) => {
    setState(prev => ({
      ...prev,
      status: prev.errors.length > 0 ? "error" : prev.warnings.length > 0 ? "warning" : "success",
      current: prev.total,
      message: message || prev.message,
    }));
    if (state.errors.length === 0) {
      onSuccess?.();
    }
  }, [state.errors.length, onSuccess]);

  const fail = useCallback((errorMessage: string) => {
    setState(prev => ({
      ...prev,
      status: "error",
      message: "Operation failed",
      errors: [...prev.errors, errorMessage],
    }));
    onError?.(errorMessage);
  }, [onError]);

  const reset = useCallback(() => {
    setStartTime(null);
    setState({
      status: "idle",
      current: 0,
      total: initialTotal,
      message: "",
      details: "",
      errors: [],
      warnings: [],
    });
  }, [initialTotal]);

  return {
    ...state,
    start,
    updateProgress,
    setTotal,
    setMessage,
    addError,
    addWarning,
    complete,
    fail,
    reset,
  };
}
