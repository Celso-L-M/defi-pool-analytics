type DataSourceName =
  | "ICPSwap"
  | "KongSwap"
  | "Uniswap"
  | "PancakeSwap"
  | "Raydium"
  | "Binance"
  | "Mock";

interface DataSourceBadgeProps {
  source: DataSourceName;
  lastUpdated?: Date | null;
  showTimestamp?: boolean;
  status?: "live" | "cached" | "demo";
}

const SOURCE_COLORS: Record<DataSourceName, string> = {
  ICPSwap: "#00A3FF",
  KongSwap: "#00FF88",
  Uniswap: "#FF007A",
  PancakeSwap: "#F0B90B",
  Raydium: "#9945FF",
  Binance: "#F3BA2F",
  Mock: "#6B7280",
};

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffS = Math.floor(diffMs / 1000);
  if (diffS < 60) return `${diffS}s ago`;
  const diffM = Math.floor(diffS / 60);
  if (diffM < 60) return `${diffM}m ago`;
  const diffH = Math.floor(diffM / 60);
  return `${diffH}h ago`;
}

export function DataSourceBadge({
  source,
  lastUpdated = null,
  showTimestamp = true,
  status,
}: DataSourceBadgeProps) {
  const resolvedStatus =
    status ?? (source === "Mock" ? "demo" : lastUpdated ? "live" : "cached");

  const dotColor =
    resolvedStatus === "live"
      ? "#00FF88"
      : resolvedStatus === "cached"
        ? "#F0B90B"
        : "#6B7280";

  const accentColor = SOURCE_COLORS[source] ?? "#6B7280";

  return (
    <span
      data-ocid="data_source_badge"
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full glass-card border text-xs font-mono"
      style={{
        borderColor: `${accentColor}30`,
        backgroundColor: `${accentColor}0D`,
      }}
    >
      {/* Status dot */}
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: dotColor, boxShadow: `0 0 4px ${dotColor}` }}
        aria-hidden="true"
      />

      {/* Source label */}
      <span style={{ color: accentColor }}>{source}</span>

      {/* Timestamp */}
      {showTimestamp && lastUpdated && (
        <span className="text-muted-foreground">
          {formatRelativeTime(lastUpdated)}
        </span>
      )}

      {/* Demo badge */}
      {resolvedStatus === "demo" && (
        <span className="text-muted-foreground">demo</span>
      )}
    </span>
  );
}
