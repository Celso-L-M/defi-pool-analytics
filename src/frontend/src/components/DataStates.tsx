import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

interface LoadingStateProps {
  label?: string;
  className?: string;
}

export function LoadingState({
  label = "Loading data…",
  className,
}: LoadingStateProps) {
  return (
    <output
      data-ocid="state.loading"
      aria-live="polite"
      className={cn("state-panel", className)}
    >
      <span className="state-icon">
        <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
      </span>
      <p className="text-sm">{label}</p>
    </output>
  );
}

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      data-ocid="state.empty"
      className={cn("state-panel state-panel-empty", className)}
    >
      <span className="state-icon">
        {icon ?? <Inbox className="h-5 w-5" aria-hidden />}
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="text-xs">{description}</p>}
      </div>
      {action}
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = "Something went wrong",
  message = "We could not load this data. Check your connection and try again.",
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      data-ocid="state.error"
      role="alert"
      className={cn("state-panel state-panel-error", className)}
    >
      <span className="state-icon">
        <AlertTriangle className="h-5 w-5" aria-hidden />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs">{message}</p>
      </div>
      {onRetry && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-ocid="state.retry_button"
          onClick={onRetry}
        >
          Retry
        </Button>
      )}
    </div>
  );
}
