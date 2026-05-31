import { AlertCircle, AlertTriangle, X } from "lucide-react";

interface ErrorBannerProps {
  message: string;
  source: string;
  type: "error" | "warning";
  onDismiss: () => void;
}

export function ErrorBanner({
  message,
  source,
  type,
  onDismiss,
}: ErrorBannerProps) {
  const isError = type === "error";

  const borderColor = isError ? "rgba(220,38,38,0.4)" : "rgba(245,158,11,0.4)";
  const bgColor = isError ? "rgba(220,38,38,0.08)" : "rgba(245,158,11,0.08)";
  const iconColor = isError ? "#EF4444" : "#F59E0B";
  const textColor = isError ? "text-red-400" : "text-amber-400";
  const Icon = isError ? AlertCircle : AlertTriangle;

  return (
    <div
      role="alert"
      data-ocid="error_banner"
      className="flex items-start gap-3 px-4 py-3 rounded-lg backdrop-blur-sm border animate-in slide-in-from-top-2 fade-in duration-300"
      style={{ borderColor, backgroundColor: bgColor }}
    >
      <Icon
        className={`w-4 h-4 mt-0.5 flex-shrink-0 ${textColor}`}
        style={{ filter: `drop-shadow(0 0 4px ${iconColor})` }}
        aria-hidden="true"
      />

      <div className="flex-1 min-w-0">
        <span className={`text-xs font-semibold font-mono ${textColor} mr-2`}>
          [{source}]
        </span>
        <span className="text-xs text-foreground/80">{message}</span>
      </div>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        data-ocid="error_banner.close_button"
        className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded transition-all duration-200 ${textColor} hover:bg-white/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current`}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
