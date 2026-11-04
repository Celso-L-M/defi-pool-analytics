import { AlertMetric } from "@/backend";

export const ALERT_METRIC_LABELS: Record<AlertMetric, string> = {
  [AlertMetric.apyBelow]: "APY falls below",
  [AlertMetric.apyAbove]: "APY rises above",
  [AlertMetric.tvlDropPercent]: "TVL drops by",
};

export function alertThresholdText(metric: AlertMetric, value: number): string {
  return metric === AlertMetric.tvlDropPercent ? `${value}%` : `${value}% APY`;
}

/** Converts a backend nanosecond timestamp to a Date, or null when invalid. */
export function timestampToDate(timestamp: bigint): Date | null {
  const date = new Date(Number(timestamp / 1_000_000n));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatRelativeTime(timestamp: bigint): string {
  const date = timestampToDate(timestamp);
  if (!date) return "Unknown time";
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)} d ago`;
  return date.toLocaleDateString();
}
