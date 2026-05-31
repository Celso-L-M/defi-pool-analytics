import { Breadcrumb } from "@/components/Breadcrumb";
import { DataSourceBadge } from "@/components/DataSourceBadge";
import { ErrorBanner } from "@/components/ErrorBanner";
import { HelpIcon } from "@/components/HelpIcon";
import { PercentChange } from "@/components/PercentChange";
import { ProtocolBadge } from "@/components/ProtocolBadge";
import { SkeletonTable } from "@/components/SkeletonLoaders";
import { Sparkline } from "@/components/Sparkline";
import { Button } from "@/components/ui/button";
import { MOCK_POOLS, PROTOCOL_METADATA } from "@/data/mockData";
import { safeLocalStorage, useDefiStore } from "@/store/useDefiStore";
import type { ILRisk, Pool, Protocol } from "@/types/defi";
import { exportCSV, exportPDF } from "@/utils/exportUtils";
import { toast } from "@/utils/toast";
import {
  ArrowDownUp,
  ArrowUpDown,
  Bell,
  BellOff,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Columns,
  FileText,
  Info,
  Search,
  Star,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ─── Types ─────────────────────────────────────────────────────────────────────

type SortKey =
  | "name"
  | "protocol"
  | "chain"
  | "tvl"
  | "apy24h"
  | "apy7d"
  | "apy30d"
  | "volume24h"
  | "fees24h"
  | "ilRisk";

interface ColDef {
  key: SortKey;
  label: string;
  align?: "right" | "left";
  mobileHidden?: boolean;
  helpTerm?: "APY" | "TVL" | "ImpermanentLoss";
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const PROTOCOLS: { id: Protocol | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "uniswap", label: "Uniswap" },
  { id: "pancakeswap", label: "PancakeSwap" },
  { id: "raydium", label: "Raydium" },
  { id: "icp", label: "ICP" },
];

const PROTOCOL_TO_SOURCE: Record<Protocol, string> = {
  uniswap: "Uniswap",
  pancakeswap: "PancakeSwap",
  raydium: "Raydium",
  icp: "ICPSwap",
};

const IL_RISK_ORDER: Record<ILRisk, number> = { low: 0, medium: 1, high: 2 };
const PAGE_SIZE = 10;
const LS_WATCHLIST = "defi_watchlist";
const LS_ALERTS = "defi_price_alerts";

const COLUMNS: ColDef[] = [
  { key: "name", label: "Pool Name" },
  { key: "protocol", label: "Protocol", mobileHidden: true },
  { key: "chain", label: "Chain", mobileHidden: true },
  { key: "tvl", label: "TVL", align: "right", helpTerm: "TVL" },
  { key: "apy24h", label: "APY 24h", align: "right", helpTerm: "APY" },
  { key: "apy7d", label: "APY 7d", align: "right", mobileHidden: true },
  { key: "apy30d", label: "APY 30d", align: "right", mobileHidden: true },
  { key: "volume24h", label: "24h Volume", align: "right", mobileHidden: true },
  { key: "fees24h", label: "Daily Fees", align: "right", mobileHidden: true },
  { key: "ilRisk", label: "IL Risk", helpTerm: "ImpermanentLoss" },
];

// ─── Formatters ────────────────────────────────────────────────────────────────

function formatTVL(val: number): string {
  if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(1)}B`;
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  return `$${(val / 1_000).toFixed(0)}K`;
}

function formatFees(val: number): string {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

function formatRelativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const diffS = Math.floor(diffMs / 1000);
  if (diffS < 60) return `${diffS}s ago`;
  const diffM = Math.floor(diffS / 60);
  if (diffM < 60) return `${diffM}m ago`;
  const diffH = Math.floor(diffM / 60);
  return `${diffH}h ago`;
}

// ─── IL Badge ──────────────────────────────────────────────────────────────────

const IL_BADGE_STYLES: Record<
  ILRisk,
  { background: string; border: string; color: string; textShadow?: string }
> = {
  low: {
    background: "rgba(0,255,136,0.08)",
    border: "1px solid rgba(0,255,136,0.25)",
    color: "#00FF88",
    textShadow: "0 0 6px rgba(0,255,136,0.4)",
  },
  medium: {
    background: "rgba(255,170,0,0.08)",
    border: "1px solid rgba(255,170,0,0.25)",
    color: "#FFAA00",
  },
  high: {
    background: "rgba(255,68,102,0.08)",
    border: "1px solid rgba(255,68,102,0.25)",
    color: "#FF4466",
    textShadow: "0 0 6px rgba(255,68,102,0.4)",
  },
};

function ILBadge({ risk }: { risk: ILRisk }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={IL_BADGE_STYLES[risk]}
    >
      {risk.charAt(0).toUpperCase() + risk.slice(1)}
    </span>
  );
}

// ─── Sort Icon ─────────────────────────────────────────────────────────────────

function SortIcon({
  active,
  direction,
}: { active: boolean; direction: "asc" | "desc" }) {
  if (!active)
    return (
      <ArrowDownUp
        className="w-3.5 h-3.5"
        style={{ color: "rgba(255,255,255,0.2)" }}
      />
    );
  return direction === "asc" ? (
    <ChevronUp className="w-3.5 h-3.5" style={{ color: "#00A3FF" }} />
  ) : (
    <ChevronDown className="w-3.5 h-3.5" style={{ color: "#00A3FF" }} />
  );
}

// ─── Custom Recharts Tooltip ────────────────────────────────────────────────────

interface ChartTooltipPayload {
  name?: string;
  value?: number;
  dataKey?: string;
  color?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: ChartTooltipPayload[];
  label?: string;
  valueFormatter?: (v: number) => string;
  valueLabel?: string;
}

function GlassTooltip({
  active,
  payload,
  label,
  valueFormatter,
  valueLabel,
}: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const val = item.value ?? 0;
  const fmt = valueFormatter ? valueFormatter(val) : val.toFixed(2);

  return (
    <div
      className="rounded-xl px-3 py-2.5 min-w-[140px]"
      style={{
        background: "rgba(10,10,10,0.97)",
        backdropFilter: "blur(16px)",
        border: "1px solid rgba(0,163,255,0.35)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.6), 0 0 12px rgba(0,163,255,0.15)",
      }}
    >
      {label && (
        <p className="text-[10px] font-mono mb-1" style={{ color: "#505050" }}>
          {label}
        </p>
      )}
      {item.name && (
        <p
          className="text-[11px] font-semibold mb-0.5"
          style={{ color: "#c0c0c0" }}
        >
          {item.name}
        </p>
      )}
      <p
        className="text-sm font-mono font-bold"
        style={{
          color: item.color ?? "#00A3FF",
          textShadow: `0 0 8px ${item.color ?? "#00A3FF"}80`,
        }}
      >
        {valueLabel ?? ""}
        {fmt}
      </p>
    </div>
  );
}

// Multi-series tooltip
function MultiGlassTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl px-3 py-2.5 min-w-[160px]"
      style={{
        background: "rgba(10,10,10,0.97)",
        backdropFilter: "blur(16px)",
        border: "1px solid rgba(0,163,255,0.35)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.6), 0 0 12px rgba(0,163,255,0.15)",
      }}
    >
      {label && (
        <p
          className="text-[10px] font-mono mb-1.5"
          style={{ color: "#505050" }}
        >
          {label}
        </p>
      )}
      {payload.map((item) => (
        <div
          key={item.name ?? item.dataKey}
          className="flex items-center justify-between gap-3 mb-0.5"
        >
          <span
            className="text-[11px]"
            style={{ color: item.color ?? "#c0c0c0" }}
          >
            {item.name}
          </span>
          <span
            className="text-[11px] font-mono font-semibold"
            style={{ color: item.color ?? "#00A3FF" }}
          >
            {typeof item.value === "number"
              ? item.value.toFixed(2)
              : item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Sort Helper ───────────────────────────────────────────────────────────────

function sortPools(pools: Pool[], key: SortKey, dir: "asc" | "desc"): Pool[] {
  return [...pools].sort((a, b) => {
    let av: number | string = 0;
    let bv: number | string = 0;
    switch (key) {
      case "name":
        av = a.name;
        bv = b.name;
        break;
      case "protocol":
        av = a.protocol;
        bv = b.protocol;
        break;
      case "chain":
        av = a.chain;
        bv = b.chain;
        break;
      case "tvl":
        av = a.stats.tvl;
        bv = b.stats.tvl;
        break;
      case "apy24h":
        av = a.apy.current;
        bv = b.apy.current;
        break;
      case "apy7d":
        av = a.apy.day7Avg;
        bv = b.apy.day7Avg;
        break;
      case "apy30d":
        av = a.apy.day30Avg;
        bv = b.apy.day30Avg;
        break;
      case "volume24h":
        av = a.stats.volume24h;
        bv = b.stats.volume24h;
        break;
      case "fees24h":
        av = a.stats.fees24h;
        bv = b.stats.fees24h;
        break;
      case "ilRisk":
        av = IL_RISK_ORDER[a.ilRisk];
        bv = IL_RISK_ORDER[b.ilRisk];
        break;
    }
    if (typeof av === "string" && typeof bv === "string")
      return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    return dir === "asc"
      ? (av as number) - (bv as number)
      : (bv as number) - (av as number);
  });
}

// ─── Sparkline data helper (7-day APY trend) ───────────────────────────────────

function getSparklineData(pool: Pool): number[] {
  if (pool.apyTrend?.day7?.length) {
    return pool.apyTrend.day7.map((d) => d.apy);
  }
  // Fallback: generate synthetic from averages
  const base = pool.apy.day7Avg;
  return Array.from({ length: 7 }, (_, i) => {
    const noise = (((i * 7919 + 1) % 17) / 17 - 0.5) * base * 0.3;
    return Math.max(0.1, base + noise);
  });
}

function sparklineColor(pool: Pool): string {
  const data = getSparklineData(pool);
  if (data.length < 2) return "#00A3FF";
  return data[data.length - 1] >= data[0] ? "#00FF88" : "#FF4466";
}

// ─── Watchlist Card ─────────────────────────────────────────────────────────────

function WatchlistPoolCard({
  pool,
  hasAlert,
  onToggleAlert,
  onRemove,
}: {
  pool: Pool;
  hasAlert: boolean;
  onToggleAlert: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 min-w-[200px] transition-all duration-200"
      style={{
        background: "rgba(0,163,255,0.04)",
        border: "1px solid rgba(0,163,255,0.15)",
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className="font-medium text-sm truncate"
            style={{ color: "#e0e0e0" }}
          >
            {pool.name}
          </span>
          <ILBadge risk={pool.ilRisk} />
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <ProtocolBadge protocol={pool.protocol} size="sm" />
          <span
            className="font-mono text-xs"
            style={{
              color: "#00FF88",
              textShadow: "0 0 6px rgba(0,255,136,0.5)",
            }}
          >
            {pool.apy.current.toFixed(2)}%
          </span>
          <span className="text-xs" style={{ color: "#505050" }}>
            {formatTVL(pool.stats.tvl)} TVL
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          type="button"
          data-ocid={`watchlist.alert_toggle.${pool.id}`}
          onClick={onToggleAlert}
          aria-label={hasAlert ? "Disable price alert" : "Enable price alert"}
          className="w-7 h-7 rounded-md flex items-center justify-center transition-all duration-200"
          style={{
            background: hasAlert
              ? "rgba(255,170,0,0.12)"
              : "rgba(255,255,255,0.03)",
            border: hasAlert
              ? "1px solid rgba(255,170,0,0.3)"
              : "1px solid transparent",
            color: hasAlert ? "#FFAA00" : "#505050",
          }}
        >
          {hasAlert ? (
            <Bell className="w-3.5 h-3.5" />
          ) : (
            <BellOff className="w-3.5 h-3.5" />
          )}
        </button>
        <button
          type="button"
          data-ocid={`watchlist.remove_button.${pool.id}`}
          onClick={onRemove}
          aria-label="Remove from watchlist"
          className="w-7 h-7 rounded-md flex items-center justify-center transition-all duration-200"
          style={{
            background: "rgba(0,255,136,0.08)",
            border: "1px solid rgba(0,255,136,0.2)",
            color: "#00FF88",
          }}
        >
          <Star className="w-3.5 h-3.5 fill-current" />
        </button>
      </div>
    </div>
  );
}

// ─── Table Row ─────────────────────────────────────────────────────────────────

function TableRow({
  pool,
  rowNum,
  isWatched,
  showAllColumns,
  onToggleWatchlist,
}: {
  pool: Pool;
  rowNum: number;
  isWatched: boolean;
  page: number;
  showAllColumns: boolean;
  onToggleWatchlist: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const sparkData = getSparklineData(pool);
  const sparkColor = sparklineColor(pool);
  const sourceName = PROTOCOL_TO_SOURCE[pool.protocol] as
    | "ICPSwap"
    | "KongSwap"
    | "Uniswap"
    | "PancakeSwap"
    | "Raydium";

  return (
    <tr
      data-ocid={`pool-comparison.item.${rowNum}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderBottom: "1px solid rgba(0,163,255,0.06)",
        background: hovered ? "rgba(0,163,255,0.05)" : "transparent",
        transition: "background 0.15s ease",
        borderLeft: isWatched
          ? "2px solid rgba(0,163,255,0.4)"
          : "2px solid transparent",
      }}
    >
      {/* Star */}
      <td className="px-2 py-3">
        <button
          type="button"
          data-ocid={`pool-comparison.star.${pool.id}`}
          onClick={onToggleWatchlist}
          aria-label={isWatched ? "Remove from watchlist" : "Add to watchlist"}
          className="w-7 h-7 rounded-md flex items-center justify-center transition-all duration-200"
          style={{
            color: isWatched ? "#00FF88" : "#303030",
            textShadow: isWatched ? "0 0 6px rgba(0,255,136,0.6)" : "none",
          }}
        >
          <Star
            className="w-4 h-4"
            style={{ fill: isWatched ? "#00FF88" : "transparent" }}
          />
        </button>
      </td>

      {/* Pool Name */}
      <td className="px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className="font-medium" style={{ color: "#d0d0d0" }}>
              {pool.name}
            </span>
            <DataSourceBadge
              source={sourceName}
              showTimestamp={false}
              status={pool.dataSource === "demo" ? "demo" : "live"}
            />
          </div>
          <span
            className="text-xs font-mono truncate max-w-[140px]"
            style={{ color: "#404040" }}
          >
            {pool.address.length > 16
              ? `${pool.address.slice(0, 8)}...${pool.address.slice(-6)}`
              : pool.address}
          </span>
        </div>
      </td>

      {/* Protocol — hidden on mobile unless showAllColumns */}
      <td
        className={`px-4 py-3${showAllColumns ? "" : " hidden sm:table-cell"}`}
      >
        <ProtocolBadge protocol={pool.protocol} size="sm" />
      </td>

      {/* Chain — hidden on mobile */}
      <td
        className={`px-4 py-3${showAllColumns ? "" : " hidden sm:table-cell"}`}
      >
        <span
          className="text-xs whitespace-nowrap uppercase"
          style={{ color: "#505050", letterSpacing: "0.04em" }}
        >
          {pool.chain}
        </span>
      </td>

      {/* TVL */}
      <td className="px-4 py-3 text-right">
        <span
          className="font-mono tabular-nums"
          style={{
            color: "#00A3FF",
            textShadow: "0 0 6px rgba(0,163,255,0.35)",
          }}
        >
          {formatTVL(pool.stats.tvl)}
        </span>
      </td>

      {/* APY 24h with PercentChange */}
      <td className="px-4 py-3 text-right">
        <div className="flex flex-col items-end gap-0.5">
          <span
            className="font-mono font-semibold"
            style={{
              color: "#00FF88",
              textShadow: "0 0 8px rgba(0,255,136,0.5)",
            }}
          >
            {pool.apy.current.toFixed(2)}%
          </span>
          <PercentChange value={pool.apy.day1Change} size="sm" />
        </div>
      </td>

      {/* APY 7d — hidden on mobile */}
      <td
        className={`px-4 py-3 text-right${showAllColumns ? "" : " hidden sm:table-cell"}`}
      >
        <span className="font-mono" style={{ color: "#808080" }}>
          {pool.apy.day7Avg.toFixed(2)}%
        </span>
      </td>

      {/* APY 30d — hidden on mobile */}
      <td
        className={`px-4 py-3 text-right${showAllColumns ? "" : " hidden sm:table-cell"}`}
      >
        <span className="font-mono" style={{ color: "#606060" }}>
          {pool.apy.day30Avg.toFixed(2)}%
        </span>
      </td>

      {/* Volume — hidden on mobile */}
      <td
        className={`px-4 py-3 text-right whitespace-nowrap${showAllColumns ? "" : " hidden sm:table-cell"}`}
      >
        <span className="font-mono tabular-nums" style={{ color: "#606060" }}>
          {formatTVL(pool.stats.volume24h)}
        </span>
      </td>

      {/* Fees — hidden on mobile */}
      <td
        className={`px-4 py-3 text-right whitespace-nowrap${showAllColumns ? "" : " hidden sm:table-cell"}`}
      >
        <span className="font-mono tabular-nums" style={{ color: "#606060" }}>
          {formatFees(pool.stats.fees24h)}
        </span>
      </td>

      {/* IL Risk */}
      <td className="px-4 py-3">
        <ILBadge risk={pool.ilRisk} />
      </td>

      {/* Sparkline trend */}
      <td className="px-3 py-3">
        <Sparkline data={sparkData} color={sparkColor} width={72} height={28} />
      </td>
    </tr>
  );
}

// ─── Chart Panel Wrapper ────────────────────────────────────────────────────────

function ChartPanel({
  title,
  source,
  lastUpdatedTs,
  children,
}: {
  title: string;
  source:
    | "ICPSwap"
    | "KongSwap"
    | "Uniswap"
    | "PancakeSwap"
    | "Raydium"
    | "Binance"
    | "Mock";
  lastUpdatedTs?: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "rgba(13,13,13,0.8)",
        backdropFilter: "blur(10px)",
        border: "1px solid rgba(0,163,255,0.15)",
        boxShadow: "0 4px 32px rgba(0,0,0,0.4)",
      }}
    >
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: "#808080" }}
        >
          {title}
        </h3>
        <div className="flex items-center gap-2">
          {lastUpdatedTs && (
            <span
              className="text-[10px] font-mono"
              style={{ color: "#404040" }}
            >
              {formatRelativeTime(lastUpdatedTs)}
            </span>
          )}
          <DataSourceBadge
            source={source}
            lastUpdated={lastUpdatedTs ? new Date(lastUpdatedTs) : null}
            showTimestamp={false}
          />
        </div>
      </div>
      {children}
    </div>
  );
}

// ─── APY Trend Chart ───────────────────────────────────────────────────────────

function APYTrendChart({ pools }: { pools: Pool[] }) {
  const top5 = pools.slice(0, 5);
  const COLORS = ["#00FF88", "#00A3FF", "#FF4466", "#FFAA00", "#9945FF"];

  // Build date-keyed data from day7 history
  const allDates = Array.from(
    new Set(top5.flatMap((p) => (p.apyTrend?.day7 ?? []).map((d) => d.date))),
  ).sort();

  const chartData = allDates.map((date) => {
    const row: Record<string, string | number> = { date };
    for (const pool of top5) {
      const pt = pool.apyTrend?.day7?.find((d) => d.date === date);
      row[pool.name] = pt ? pt.apy : pool.apy.day7Avg;
    }
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart
        data={chartData}
        margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis
          dataKey="date"
          tick={{ fill: "#404040", fontSize: 9 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: string) => v.slice(5)}
        />
        <YAxis
          tick={{ fill: "#404040", fontSize: 9 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `${v.toFixed(0)}%`}
        />
        <Tooltip content={<MultiGlassTooltip />} />
        <Legend
          wrapperStyle={{
            fontSize: "10px",
            color: "#606060",
            paddingTop: "8px",
          }}
        />
        {top5.map((pool, i) => (
          <Line
            key={pool.id}
            type="monotone"
            dataKey={pool.name}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, fill: COLORS[i % COLORS.length] }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Fee Comparison Chart ───────────────────────────────────────────────────────

function FeeComparisonChart({ pools }: { pools: Pool[] }) {
  const top8 = pools.slice(0, 8);
  const chartData = top8.map((p) => ({
    name: p.name.length > 10 ? `${p.name.slice(0, 10)}…` : p.name,
    fees: p.stats.fees24h,
    feeRate: p.stats.feeRate * 100,
    pool: p,
  }));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart
        data={chartData}
        margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis
          dataKey="name"
          tick={{ fill: "#404040", fontSize: 8 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fill: "#404040", fontSize: 9 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => formatFees(v)}
        />
        <Tooltip
          content={
            <GlassTooltip
              valueFormatter={(v) => formatFees(v)}
              valueLabel="Fees: "
            />
          }
        />
        <Bar dataKey="fees" radius={[3, 3, 0, 0]}>
          {chartData.map((entry) => (
            <Cell
              key={entry.name}
              fill={`rgba(0,255,136,${0.4 + (chartData.indexOf(entry) / chartData.length) * 0.4})`}
              stroke="rgba(0,255,136,0.3)"
              strokeWidth={1}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Security Score Chart ───────────────────────────────────────────────────────

function SecurityScoreChart({ pools }: { pools: Pool[] }) {
  const top8 = pools.slice(0, 8);
  const chartData = top8.map((p) => ({
    name: p.name.length > 10 ? `${p.name.slice(0, 10)}…` : p.name,
    score:
      p.securityScore ?? Math.round(60 + Math.abs(p.id.charCodeAt(0) % 40)),
  }));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart
        data={chartData}
        margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis
          dataKey="name"
          tick={{ fill: "#404040", fontSize: 8 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: "#404040", fontSize: 9 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          content={
            <GlassTooltip
              valueFormatter={(v) => `${v.toFixed(0)} / 100`}
              valueLabel="Score: "
            />
          }
        />
        <Bar dataKey="score" radius={[3, 3, 0, 0]}>
          {chartData.map((entry) => {
            const pct = entry.score / 100;
            const color =
              pct >= 0.75
                ? `rgba(0,255,136,${0.5 + pct * 0.4})`
                : pct >= 0.5
                  ? `rgba(255,170,0,${0.5 + pct * 0.4})`
                  : `rgba(255,68,102,${0.5 + pct * 0.4})`;
            return (
              <Cell
                key={entry.name}
                fill={color}
                stroke={color.replace(/,[^,]+\)$/, ",0.6)")}
                strokeWidth={1}
              />
            );
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function PoolComparisonPage() {
  const { dismissedErrors, dismissError, lastUpdatedBySource } = useDefiStore();

  const [isLoading, setIsLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("tvl");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [activeProtocol, setActiveProtocol] = useState<Protocol | "all">("all");
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [page, setPage] = useState(1);
  const [showTooltip, setShowTooltip] = useState(false);
  const [showAllColumns, setShowAllColumns] = useState(false);

  const [watchlist, setWatchlist] = useState<string[]>(() => {
    try {
      const raw = safeLocalStorage.get(LS_WATCHLIST, "[]");
      return JSON.parse(raw ?? "[]") as string[];
    } catch {
      return [];
    }
  });
  const [alertPools, setAlertPools] = useState<string[]>(() => {
    try {
      const raw = safeLocalStorage.get(LS_ALERTS, "[]");
      return JSON.parse(raw ?? "[]") as string[];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    safeLocalStorage.set(LS_WATCHLIST, JSON.stringify(watchlist));
  }, [watchlist]);
  useEffect(() => {
    safeLocalStorage.set(LS_ALERTS, JSON.stringify(alertPools));
  }, [alertPools]);

  React.useEffect(() => {
    const t = setTimeout(() => setIsLoading(false), 700);
    return () => clearTimeout(t);
  }, []);

  // Detect which data sources have demo/failed pools
  const demoSources = useMemo(() => {
    const sources = new Set<string>();
    for (const p of MOCK_POOLS) {
      if (p.dataSource === "demo") {
        sources.add(PROTOCOL_TO_SOURCE[p.protocol]);
      }
    }
    return sources;
  }, []);

  const activeErrorBanners = useMemo(
    () =>
      Array.from(demoSources).filter(
        (src) => !dismissedErrors.includes(`demo-${src}`),
      ),
    [demoSources, dismissedErrors],
  );

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
    setPage(1);
  }

  function toggleWatchlist(poolId: string) {
    const isCurrentlyWatched = watchlist.includes(poolId);
    setWatchlist((prev) =>
      isCurrentlyWatched
        ? prev.filter((id) => id !== poolId)
        : [...prev, poolId],
    );
    if (isCurrentlyWatched) {
      setAlertPools((prev) => prev.filter((id) => id !== poolId));
      toast.info("Pool removed from watchlist");
    } else {
      toast.info("Pool added to watchlist");
    }
  }

  function toggleAlert(poolId: string) {
    const hasAlert = alertPools.includes(poolId);
    setAlertPools((prev) =>
      hasAlert ? prev.filter((id) => id !== poolId) : [...prev, poolId],
    );
    if (hasAlert) toast.info("Price alert disabled");
    else toast.success("Price alert enabled");
  }

  const filtered = useMemo(() => {
    let pools = MOCK_POOLS;
    if (activeProtocol !== "all")
      pools = pools.filter((p) => p.protocol === activeProtocol);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      pools = pools.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.token0.toLowerCase().includes(q) ||
          p.token1.toLowerCase().includes(q),
      );
    }
    return sortPools(pools, sortKey, sortDir);
  }, [activeProtocol, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pagePools = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const watchedPools = useMemo(
    () => MOCK_POOLS.filter((p) => watchlist.includes(p.id)),
    [watchlist],
  );

  function handleProtocolChange(id: Protocol | "all") {
    setActiveProtocol(id);
    setPage(1);
  }

  function handleSearch(e: React.ChangeEvent<HTMLInputElement>) {
    setSearch(e.target.value);
    setPage(1);
  }

  function handleExportCSV() {
    const headers = [
      "Pool Name",
      "Protocol",
      "Chain",
      "TVL",
      "APY 24h",
      "APY 7d",
      "APY 30d",
      "24h Volume",
      "Daily Fees",
      "IL Risk",
    ];
    const rows = filtered.map((p) => [
      p.name,
      p.protocol,
      p.chain,
      formatTVL(p.stats.tvl),
      `${p.apy.current.toFixed(2)}%`,
      `${p.apy.day7Avg.toFixed(2)}%`,
      `${p.apy.day30Avg.toFixed(2)}%`,
      formatTVL(p.stats.volume24h),
      formatFees(p.stats.fees24h),
      p.ilRisk,
    ]);
    exportCSV(
      `pools-${new Date().toISOString().slice(0, 10)}.csv`,
      headers,
      rows,
    );
    toast.success("Pool data exported to CSV");
  }

  function handleExportPDF() {
    const date = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const topPool = filtered[0];
    const avgAPY =
      filtered.reduce((s, p) => s + p.apy.current, 0) / (filtered.length || 1);
    exportPDF({
      title: "DeFi Pool Analytics \u2013 Pool Comparator Report",
      date,
      walletAddress: "Pool Comparator View",
      summary: [
        { label: "Pools Shown", value: String(filtered.length) },
        { label: "Avg APY", value: `${avgAPY.toFixed(2)}%` },
        { label: "Top Pool (APY)", value: topPool?.name ?? "N/A" },
        { label: "Watchlisted", value: String(watchlist.length) },
      ],
      sections: [
        {
          title: "Watchlisted Pools",
          rows: watchedPools.length
            ? watchedPools.map((p) => ({
                label: p.name,
                value: `${p.apy.current.toFixed(2)}% APY \u2022 ${p.ilRisk} IL \u2022 ${formatTVL(p.stats.tvl)} TVL`,
              }))
            : [{ label: "No watchlisted pools", value: "" }],
        },
      ],
      tableHeaders: [
        "Pool",
        "Protocol",
        "Chain",
        "TVL",
        "APY 24h",
        "APY 7d",
        "APY 30d",
        "Volume",
        "Fees",
        "IL Risk",
      ],
      tableRows: filtered.map((p) => [
        p.name,
        p.protocol,
        p.chain,
        formatTVL(p.stats.tvl),
        `${p.apy.current.toFixed(2)}%`,
        `${p.apy.day7Avg.toFixed(2)}%`,
        `${p.apy.day30Avg.toFixed(2)}%`,
        formatTVL(p.stats.volume24h),
        formatFees(p.stats.fees24h),
        p.ilRisk,
      ]),
    });
    toast.success("Comparison report generated");
  }

  // Visible columns depending on mobile state
  const visibleColumns = COLUMNS.filter(
    (col) => showAllColumns || !col.mobileHidden,
  );

  // Total colspan for empty state
  const totalCols = visibleColumns.length + 3; // star + trend + visible cols

  const chartLastUpdated = lastUpdatedBySource.poolComparison ?? undefined;

  return (
    <div className="space-y-5 py-6 px-4 md:px-6">
      {/* Breadcrumb */}
      <Breadcrumb
        items={[{ label: "Home", href: "/" }, { label: "Pool Comparator" }]}
      />

      {/* Error Banners */}
      {activeErrorBanners.length > 0 && (
        <div className="space-y-2">
          {activeErrorBanners.map((src) => (
            <ErrorBanner
              key={src}
              source={src}
              type="warning"
              message={`${src} data unavailable — showing cached data`}
              onDismiss={() => dismissError(`demo-${src}`)}
            />
          ))}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-display font-bold tracking-tight"
            style={{ color: "#e0e0e0" }}
          >
            Pool Comparison
          </h1>
          <p
            className="text-sm mt-1 uppercase"
            style={{
              color: "#505050",
              letterSpacing: "0.05em",
              fontSize: "11px",
            }}
          >
            Sort, filter &amp; find the best cross-chain opportunities
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div
            className="relative"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-md transition-all duration-200"
              data-ocid="pool-comparison.cross_chain_info_button"
              aria-label="Cross-chain comparison info"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#606060",
              }}
            >
              <Info className="w-3.5 h-3.5" />
              Cross-chain
            </button>
            {showTooltip && (
              <div
                className="absolute right-0 top-full mt-2 w-72 z-50 rounded-lg p-3 text-xs"
                data-ocid="pool-comparison.cross_chain_tooltip"
                style={{
                  background: "rgba(10,10,10,0.98)",
                  backdropFilter: "blur(16px)",
                  border: "1px solid rgba(0,163,255,0.2)",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
                  color: "#909090",
                }}
              >
                <p className="font-semibold mb-1" style={{ color: "#e0e0e0" }}>
                  Cross-chain Pool Comparison
                </p>
                <p className="leading-relaxed">
                  Use the protocol filter tabs below to compare liquidity pools
                  across Ethereum, BSC, Solana, and Internet Computer.
                </p>
              </div>
            )}
          </div>
          <button
            type="button"
            data-ocid="pool-comparison.export_csv_button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 text-xs rounded-md px-2.5 py-1.5 transition-all duration-200"
            style={{
              background: "rgba(0,255,136,0.05)",
              border: "1px solid rgba(0,255,136,0.25)",
              color: "#00FF88",
            }}
          >
            <FileText className="w-3.5 h-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            data-ocid="pool-comparison.export_pdf_button"
            onClick={handleExportPDF}
            className="inline-flex items-center gap-1.5 text-xs rounded-md px-2.5 py-1.5 transition-all duration-200"
            style={{
              background: "rgba(0,163,255,0.05)",
              border: "1px solid rgba(0,163,255,0.25)",
              color: "#00A3FF",
            }}
          >
            <FileText className="w-3.5 h-3.5" />
            Export PDF
          </button>
        </div>
      </div>

      {/* Watchlist */}
      {watchedPools.length > 0 && (
        <div
          data-ocid="watchlist.section"
          className="rounded-xl p-4"
          style={{
            background: "rgba(0,255,136,0.03)",
            border: "1px solid rgba(0,255,136,0.15)",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Star
              className="w-4 h-4"
              style={{
                color: "#00FF88",
                filter: "drop-shadow(0 0 6px rgba(0,255,136,0.6))",
                fill: "#00FF88",
              }}
            />
            <h2
              className="text-sm font-semibold uppercase"
              style={{ color: "#e0e0e0", letterSpacing: "0.08em" }}
            >
              Watchlist
            </h2>
            <span className="text-xs" style={{ color: "#505050" }}>
              {watchedPools.length} pool{watchedPools.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {watchedPools.map((pool) => (
              <WatchlistPoolCard
                key={pool.id}
                pool={pool}
                hasAlert={alertPools.includes(pool.id)}
                onToggleAlert={() => toggleAlert(pool.id)}
                onRemove={() => toggleWatchlist(pool.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ChartPanel
          title="APY Trend — Top Pools (7d)"
          source="Uniswap"
          lastUpdatedTs={chartLastUpdated}
        >
          <APYTrendChart pools={filtered} />
        </ChartPanel>
        <ChartPanel
          title="Daily Fee Comparison"
          source="ICPSwap"
          lastUpdatedTs={chartLastUpdated}
        >
          <FeeComparisonChart pools={filtered} />
        </ChartPanel>
        <ChartPanel
          title="Security Score"
          source="KongSwap"
          lastUpdatedTs={chartLastUpdated}
        >
          <SecurityScoreChart pools={filtered} />
        </ChartPanel>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div
          className="flex items-center gap-1 p-1 rounded-lg overflow-x-auto"
          data-ocid="pool-comparison.protocol_filter"
          style={{
            background: "rgba(13,13,13,0.6)",
            border: "1px solid rgba(0,163,255,0.12)",
          }}
        >
          {PROTOCOLS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => handleProtocolChange(id as Protocol | "all")}
              data-ocid={`pool-comparison.protocol_tab.${id}`}
              className="px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all duration-200"
              style={{
                background:
                  activeProtocol === id
                    ? "rgba(0,163,255,0.15)"
                    : "transparent",
                border:
                  activeProtocol === id
                    ? "1px solid rgba(0,163,255,0.35)"
                    : "1px solid transparent",
                color: activeProtocol === id ? "#00A3FF" : "#606060",
                textShadow:
                  activeProtocol === id
                    ? "0 0 8px rgba(0,163,255,0.5)"
                    : "none",
              }}
            >
              {id !== "all" && (
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full mr-1.5"
                  style={{
                    backgroundColor:
                      activeProtocol === id ? "#00A3FF" : "#404040",
                    boxShadow:
                      activeProtocol === id
                        ? "0 0 4px rgba(0,163,255,0.8)"
                        : "none",
                  }}
                />
              )}
              {label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 sm:max-w-xs">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
            style={{ color: searchFocused ? "#00A3FF" : "#505050" }}
          />
          <input
            placeholder="Search pool or token..."
            value={search}
            onChange={handleSearch}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className="w-full pl-9 pr-4 text-sm h-9 rounded-lg outline-none transition-all duration-200"
            data-ocid="pool-comparison.search_input"
            style={{
              background: "rgba(13,13,13,0.8)",
              backdropFilter: "blur(8px)",
              border: searchFocused
                ? "1px solid rgba(0,163,255,0.5)"
                : "1px solid rgba(0,163,255,0.15)",
              boxShadow: searchFocused
                ? "0 0 0 2px rgba(0,163,255,0.1)"
                : "none",
              color: "#c0c0c0",
            }}
          />
        </div>

        {/* Mobile column toggle */}
        <button
          type="button"
          data-ocid="pool-comparison.toggle_columns_button"
          onClick={() => setShowAllColumns((v) => !v)}
          className="sm:hidden inline-flex items-center gap-1.5 text-xs h-9 px-3 rounded-lg transition-all duration-200"
          style={{
            background: showAllColumns
              ? "rgba(0,163,255,0.12)"
              : "rgba(255,255,255,0.04)",
            border: showAllColumns
              ? "1px solid rgba(0,163,255,0.3)"
              : "1px solid rgba(255,255,255,0.08)",
            color: showAllColumns ? "#00A3FF" : "#606060",
          }}
        >
          <Columns className="w-3.5 h-3.5" />
          {showAllColumns ? "Less" : "More Columns"}
        </button>
      </div>

      {/* Table Card */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: "rgba(13,13,13,0.8)",
          backdropFilter: "blur(10px)",
          border: "1px solid rgba(0,163,255,0.15)",
          boxShadow: "0 4px 32px rgba(0,0,0,0.4)",
        }}
      >
        {isLoading ? (
          <div className="p-4">
            <SkeletonTable rows={10} />
          </div>
        ) : MOCK_POOLS.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-20 gap-3"
            data-ocid="pool-comparison.global_empty_state"
          >
            <ArrowUpDown
              className="w-10 h-10"
              style={{ color: "rgba(0,163,255,0.2)" }}
            />
            <p className="font-medium" style={{ color: "#505050" }}>
              No pools available for comparison
            </p>
            <p className="text-xs" style={{ color: "#333" }}>
              Pool data will appear here once loaded.
            </p>
          </div>
        ) : (
          <>
            <div className="relative overflow-x-auto">
              <div
                className="pointer-events-none absolute right-0 top-0 h-full w-8 md:hidden z-10"
                style={{
                  background:
                    "linear-gradient(to left, rgba(13,13,13,0.9), transparent)",
                }}
              />
              <table
                className="w-full text-sm"
                style={{ minWidth: showAllColumns ? "1000px" : "540px" }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: "1px solid rgba(0,163,255,0.15)",
                      background: "rgba(0,163,255,0.04)",
                    }}
                  >
                    {/* Star col */}
                    <th className="px-2 py-3 w-8" />
                    {visibleColumns.map((col) => (
                      <th
                        key={col.key}
                        onClick={() => handleSort(col.key)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ")
                            handleSort(col.key);
                        }}
                        className="px-4 py-3 whitespace-nowrap select-none cursor-pointer transition-all duration-150"
                        style={{
                          textAlign: col.align === "right" ? "right" : "left",
                          color: sortKey === col.key ? "#00A3FF" : "#505050",
                          textShadow:
                            sortKey === col.key
                              ? "0 0 8px rgba(0,163,255,0.5)"
                              : "none",
                          fontSize: "10px",
                          fontWeight: 600,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                        }}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSort(col.key);
                          }}
                          data-ocid={`pool-comparison.sort.${col.key}`}
                          className="inline-flex items-center gap-1.5 transition-all duration-150"
                          style={{
                            flexDirection:
                              col.align === "right" ? "row-reverse" : "row",
                            color: sortKey === col.key ? "#00A3FF" : "#505050",
                          }}
                        >
                          {col.label}
                          <SortIcon
                            active={sortKey === col.key}
                            direction={sortDir}
                          />
                        </button>
                        {col.helpTerm && (
                          <span className="inline-flex ml-1">
                            <HelpIcon term={col.helpTerm} variant="sm" />
                          </span>
                        )}
                      </th>
                    ))}
                    {/* Trend col */}
                    <th
                      className="px-3 py-3 whitespace-nowrap"
                      style={{
                        color: "#505050",
                        fontSize: "10px",
                        fontWeight: 600,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                      }}
                    >
                      Trend
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagePools.length === 0 ? (
                    <tr>
                      <td colSpan={totalCols}>
                        <div
                          className="flex flex-col items-center justify-center py-16 gap-3"
                          data-ocid="pool-comparison.empty_state"
                        >
                          <ArrowUpDown
                            className="w-8 h-8"
                            style={{ color: "rgba(0,163,255,0.2)" }}
                          />
                          <p className="text-sm" style={{ color: "#505050" }}>
                            No pools match your filters.
                          </p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSearch("");
                              setActiveProtocol("all");
                            }}
                            style={{ color: "#00A3FF" }}
                          >
                            Clear filters
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    pagePools.map((pool, idx) => {
                      const rowNum = (page - 1) * PAGE_SIZE + idx + 1;
                      const isWatched = watchlist.includes(pool.id);
                      return (
                        <TableRow
                          key={pool.id}
                          pool={pool}
                          rowNum={rowNum}
                          isWatched={isWatched}
                          page={page}
                          showAllColumns={showAllColumns}
                          onToggleWatchlist={() => toggleWatchlist(pool.id)}
                        />
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderTop: "1px solid rgba(0,163,255,0.1)" }}
            >
              <p className="text-xs" style={{ color: "#505050" }}>
                Showing{" "}
                <span style={{ color: "#c0c0c0" }}>
                  {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}
                  &ndash;
                  {Math.min(page * PAGE_SIZE, filtered.length)}
                </span>{" "}
                of <span style={{ color: "#c0c0c0" }}>{filtered.length}</span>{" "}
                pools
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  data-ocid="pool-comparison.pagination_prev"
                  className="h-7 px-3 text-xs rounded-md transition-all duration-200 disabled:opacity-30"
                  style={{
                    background: "rgba(0,163,255,0.08)",
                    border: "1px solid rgba(0,163,255,0.2)",
                    color: "#00A3FF",
                  }}
                >
                  Previous
                </button>
                <span
                  className="text-xs font-mono tabular-nums"
                  style={{ color: "#505050" }}
                >
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  data-ocid="pool-comparison.pagination_next"
                  className="h-7 px-3 text-xs rounded-md transition-all duration-200 disabled:opacity-30"
                  style={{
                    background: "rgba(0,163,255,0.08)",
                    border: "1px solid rgba(0,163,255,0.2)",
                    color: "#00A3FF",
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
