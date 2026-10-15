import { cn } from "@/lib/utils";

export interface ProgressBarProps {
  /** Progress value from 0 to 100 */
  value: number;
  /** Optional maximum value (defaults to 100) */
  max?: number;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Color variant */
  variant?: "default" | "success" | "warning" | "danger";
  /** Whether to show the percentage label */
  showLabel?: boolean;
  /** Custom label (overrides percentage display) */
  label?: string;
  /** Whether the progress is indeterminate (animated) */
  indeterminate?: boolean;
  /** Additional class name */
  className?: string;
}

const sizeClasses = {
  sm: "h-1.5",
  md: "h-2.5",
  lg: "h-4",
};

const variantClasses = {
  default: "bg-[var(--primary-text)]",
  success: "bg-[var(--status-success-text)]",
  warning: "bg-[var(--status-warning-text)]",
  danger: "bg-[var(--status-danger-text)]",
};

export function ProgressBar({
  value,
  max = 100,
  size = "md",
  variant = "default",
  showLabel = false,
  label,
  indeterminate = false,
  className,
}: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={cn("w-full", className)}>
      <div
        className={cn(
          "w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700",
          sizeClasses[size]
        )}
        role="progressbar"
        aria-valuenow={indeterminate ? undefined : value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label || `Progress: ${Math.round(percentage)}%`}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300 ease-in-out",
            variantClasses[variant],
            indeterminate && "animate-progress-indeterminate"
          )}
          style={{
            width: indeterminate ? "30%" : `${percentage}%`,
          }}
        />
      </div>
      {(showLabel || label) && (
        <p className="mt-1 text-xs text-muted-foreground text-center">
          {label || `${Math.round(percentage)}%`}
        </p>
      )}
    </div>
  );
}
