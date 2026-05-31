import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";
import type React from "react";
import { Component } from "react";

// ─── FallbackUI ───────────────────────────────────────────────────────────────

interface FallbackUIProps {
  error?: Error;
}

export function FallbackUI({ error }: FallbackUIProps) {
  return (
    <div
      className="min-h-[240px] flex flex-col items-center justify-center gap-6 p-8
                 bg-background text-foreground rounded-xl border border-destructive/40"
      data-ocid="error_boundary.error_state"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <span
          className="inline-flex items-center justify-center w-14 h-14 rounded-full
                          bg-destructive/10 border border-destructive/30"
        >
          <AlertTriangle
            className="w-7 h-7 text-destructive"
            aria-hidden="true"
          />
        </span>

        <h2 className="text-xl font-semibold text-foreground">
          Something went wrong
        </h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          An unexpected error occurred while rendering this section.
        </p>
      </div>

      {error && (
        <pre
          className="w-full max-w-lg text-xs bg-card border border-border rounded-lg
                     p-4 overflow-x-auto text-destructive font-mono whitespace-pre-wrap
                     break-words"
          aria-label="Error details"
        >
          {error.message}
        </pre>
      )}

      <Button
        type="button"
        variant="outline"
        className="gap-2"
        onClick={() => window.location.reload()}
        data-ocid="error_boundary.reload_button"
      >
        <RefreshCw className="w-4 h-4" />
        Reload page
      </Button>
    </div>
  );
}

// ─── ErrorBoundary ────────────────────────────────────────────────────────────

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Optional custom fallback. When omitted, renders <FallbackUI>. */
  fallback?: React.ReactElement;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | undefined;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: undefined };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // In production you could forward to a monitoring service here.
    console.error("[ErrorBoundary] Caught error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return <FallbackUI error={this.state.error} />;
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
