import { Breadcrumb } from "@/components/Breadcrumb";
import { DataSourceBadge } from "@/components/DataSourceBadge";
import { HELP_TERMS, HelpIcon } from "@/components/HelpIcon";
import { ProtocolBadge } from "@/components/ProtocolBadge";
import { SkeletonChart, SkeletonTable } from "@/components/SkeletonLoaders";
import { MOCK_POOLS, PROTOCOL_METADATA } from "@/data/mockData";
import { cn } from "@/lib/utils";
import type { Pool, Protocol } from "@/types/defi";
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Timeframe = "1D" | "7D" | "30D";
type ProtocolFilter = "all" | Protocol;

const PROTOCOL_TABS: { value: ProtocolFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "uniswap", label: "Uniswap" },
  { value: "pancakeswap", label: "PancakeSwap" },
  { value: "raydium", label: "Raydium" },
  { value: "icp", label: "ICP" },
];

const TIMEFRAMES: Timeframe[] = ["1D", "7D", "30D"];

// Premium DeFi chart colors: electric blue, neon green, purple, amber, coral
// Protocol-consistent color mapping
const PROTOCOL_LINE_COLORS: Record<string, string> = {
  uniswap: "#00A3FF", // electric blue
  pancakeswap: "#ffa500", // amber
  raydium: "#00FF88", // neon green
  icp: "#9945FF", // violet
  icpswap: "#9945FF", // violet
  kongswap: "#cc44ff", // purple-violet
};

// Fallback palette when protocol unknown
const LINE_COLORS = [
  "#00A3FF", // electric blue
  "#00FF88", // neon green
  "#9945FF", // purple
  "#ffa500", // amber
  "#ff4466", // coral/red
];

function formatAPY(v: number) {
  return `${v.toFixed(2)}%`;
}

function buildChartData(
  pools: Pool[],
  timeframe: Timeframe,
): Record<string, number | string>[] {
  if (timeframe === "1D") {
    const hours = Array.from({ length: 24 }, (_, i) => {
      const h = i.toString().padStart(2, "0");
      const point: Record<string, number | string> = { time: `${h}:00` };
      for (const pool of pools) {
        const noise =
          Math.sin(i * 0.5 + pool.apy.current) * pool.apy.current * 0.04;
        point[pool.id] = Math.max(
          0.1,
          Number((pool.apy.current + noise).toFixed(2)),
        );
      }
      return point;
    });
    return hours;
  }

  if (timeframe === "7D") {
    const allDates = pools[0]?.apyTrend.day7.map((d) => d.date) ?? [];
    return allDates.map((date) => {
      const point: Record<string, number | string> = { time: date.slice(5) };
      for (const pool of pools) {
        const entry = pool.apyTrend.day7.find((d) => d.date === date);
        point[pool.id] = entry?.apy ?? pool.apy.day7Avg;
      }
      return point;
    });
  }

  // 30D
  const allDates = pools[0]?.apyTrend.day30.map((d) => d.date) ?? [];
  return allDates.map((date, idx) => {
    const point: Record<string, number | string> = {
      time: idx % 5 === 0 ? date.slice(5) : "",
    };
    for (const pool of pools) {
      const entry = pool.apyTrend.day30.find((d) => d.date === date);
      point[pool.id] = entry?.apy ?? pool.apy.day30Avg;
    }
    return point;
  });
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  poolMap: Record<string, Pool>;
}

function CustomTooltip({
  active,
  payload,
  label,
  poolMap,
  timeframe,
}: CustomTooltipProps & {
  chartData?: Record<string, number | string>[];
  timeframe: Timeframe;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg p-3 min-w-[200px]"
      style={{
        background: "rgba(0,0,0,0.82)",
        border: "1px solid rgba(0,163,255,0.3)",
        backdropFilter: "blur(12px)",
        boxShadow: "0 0 20px rgba(0,163,255,0.15), 0 8px 24px rgba(0,0,0,0.5)",
      }}
    >
      <p
        className="text-xs mb-2 font-mono uppercase tracking-widest"
        style={{ color: "#909090" }}
      >
        {label} · {timeframe}
      </p>
      {payload.map((entry) => {
        const pool = poolMap[entry.name];
        return (
          <div
            key={entry.name}
            className="flex items-center justify-between gap-4 text-xs py-0.5"
          >
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{
                    background: entry.color,
                    boxShadow: `0 0 6px ${entry.color}99`,
                  }}
                />
                <span
                  className="truncate max-w-[120px] font-medium"
                  style={{ color: "#e0e0e0" }}
                >
                  {pool?.name ?? entry.name}
                </span>
              </div>
              {pool && (
                <span
                  className="text-[10px] pl-3.5 uppercase tracking-widest"
                  style={{ color: "#606060" }}
                >
                  {pool.protocol}
                </span>
              )}
            </div>
            <span
              className="font-mono font-semibold text-right"
              style={{
                color: entry.color,
                textShadow: `0 0 8px ${entry.color}99`,
              }}
            >
              {formatAPY(entry.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ChangeCell({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-mono text-xs font-semibold",
      )}
      style={{
        color: positive ? "#00FF88" : "#ff4466",
        textShadow: positive
          ? "0 0 8px rgba(0,255,136,0.5)"
          : "0 0 8px rgba(255,68,102,0.5)",
      }}
    >
      {positive ? (
        <svg
          className="w-3 h-3"
          viewBox="0 0 12 12"
          fill="none"
          role="img"
          aria-label="up"
        >
          <path d="M6 2l4 6H2l4-6z" fill="currentColor" />
        </svg>
      ) : (
        <svg
          className="w-3 h-3"
          viewBox="0 0 12 12"
          fill="none"
          role="img"
          aria-label="down"
        >
          <path d="M6 10L2 4h8l-4 6z" fill="currentColor" />
        </svg>
      )}
      {Math.abs(value).toFixed(2)}%
    </span>
  );
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isMobile;
}

export function APYTrackerPage() {
  const [protocol, setProtocol] = useState<ProtocolFilter>("all");
  const [timeframe, setTimeframe] = useState<Timeframe>("7D");
  const [selectedPoolIds, setSelectedPoolIds] = useState<Set<string>>(
    new Set(),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated] = useState<Date>(() => new Date());
  const isMobile = useIsMobile();

  // Simulate async fetch
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 900);
    return () => clearTimeout(timer);
  }, []);

  const filteredPools = useMemo(
    () =>
      protocol === "all"
        ? MOCK_POOLS
        : MOCK_POOLS.filter((p) => p.protocol === protocol),
    [protocol],
  );

  // Default: top 5 by current APY when filter changes
  useEffect(() => {
    const top5 = [...filteredPools]
      .sort((a, b) => b.apy.current - a.apy.current)
      .slice(0, 5)
      .map((p) => p.id);
    setSelectedPoolIds(new Set(top5));
  }, [filteredPools]);

  const chartPools = useMemo(
    () => filteredPools.filter((p) => selectedPoolIds.has(p.id)).slice(0, 5),
    [filteredPools, selectedPoolIds],
  );

  const chartData = useMemo(
    () => (chartPools.length ? buildChartData(chartPools, timeframe) : []),
    [chartPools, timeframe],
  );

  const poolMap = useMemo(
    () => Object.fromEntries(MOCK_POOLS.map((p) => [p.id, p])),
    [],
  );

  const togglePool = useCallback((id: string) => {
    setSelectedPoolIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id);
      } else {
        if (next.size < 5) next.add(id);
      }
      return next;
    });
  }, []);

  const sortedTablePools = useMemo(
    () => [...filteredPools].sort((a, b) => b.apy.current - a.apy.current),
    [filteredPools],
  );

  // Compute per-pool APY change over selected timeframe
  const poolTimeframeChange = useMemo(() => {
    const result: Record<string, number> = {};
    for (const pool of chartPools) {
      if (timeframe === "1D") {
        result[pool.id] = pool.apy.day1Change;
      } else if (timeframe === "7D") {
        const data = pool.apyTrend.day7;
        if (data.length >= 2) {
          result[pool.id] = data[data.length - 1].apy - data[0].apy;
        } else {
          result[pool.id] = 0;
        }
      } else {
        const data = pool.apyTrend.day30;
        if (data.length >= 2) {
          result[pool.id] = data[data.length - 1].apy - data[0].apy;
        } else {
          result[pool.id] = 0;
        }
      }
    }
    return result;
  }, [chartPools, timeframe]);

  // Protocol-aware color assignment
  const getPoolColor = useCallback((pool: Pool, idx: number): string => {
    const protocolColor = PROTOCOL_LINE_COLORS[pool.protocol];
    if (protocolColor) return protocolColor;
    return LINE_COLORS[idx] ?? "#00A3FF";
  }, []);

  return (
    <div
      className="space-y-6 p-4 sm:p-6"
      style={{ background: "#0D0D0D", minHeight: "100%" }}
    >
      {/* Breadcrumb */}
      <Breadcrumb
        items={[{ label: "Home", href: "/" }, { label: "APY Tracker" }]}
      />

      {/* Header */}
      <div className="pb-2">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1
                className="text-2xl font-display font-bold tracking-widest uppercase"
                style={{ color: "#e0e0e0" }}
              >
                APY{" "}
                <span
                  style={{
                    color: "#00A3FF",
                    textShadow: "0 0 16px rgba(0,163,255,0.5)",
                  }}
                >
                  Tracker
                </span>
              </h1>
              <HelpIcon term="APY" />
            </div>
            <div
              className="mt-1 h-0.5 w-24 rounded-full"
              style={{
                background:
                  "linear-gradient(90deg, #00A3FF 0%, transparent 100%)",
                boxShadow: "0 0 8px rgba(0,163,255,0.6)",
              }}
            />
          </div>
        </div>
        <p className="text-sm mt-2 tracking-wide" style={{ color: "#909090" }}>
          Monitor annualized yield performance across protocols and timeframes
        </p>
        <div className="mt-2">
          <DataSourceBadge
            source="Mock"
            lastUpdated={lastUpdated}
            status="demo"
          />
        </div>
      </div>

      {/* Protocol filter tabs */}
      <div
        data-ocid="apy.protocol_filter"
        className="flex flex-wrap items-center gap-1 p-1 rounded-lg w-fit"
        style={{
          background: "rgba(13,13,13,0.8)",
          border: "1px solid rgba(0,163,255,0.15)",
          backdropFilter: "blur(8px)",
        }}
      >
        {PROTOCOL_TABS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            data-ocid={`apy.protocol_tab.${value}`}
            onClick={() => setProtocol(value)}
            className="px-3.5 py-1.5 rounded-md text-xs font-medium transition-smooth uppercase tracking-wider"
            style={{
              background:
                protocol === value ? "rgba(0,163,255,0.15)" : "transparent",
              color: protocol === value ? "#00A3FF" : "#909090",
              border:
                protocol === value
                  ? "1px solid rgba(0,163,255,0.4)"
                  : "1px solid transparent",
              boxShadow:
                protocol === value
                  ? "0 0 12px rgba(0,163,255,0.2), inset 0 0 8px rgba(0,163,255,0.05)"
                  : "none",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Chart card */}
      <div
        className="rounded-xl"
        style={{
          background: "rgba(13,13,13,0.85)",
          border: "1px solid rgba(0,163,255,0.2)",
          backdropFilter: "blur(10px)",
          boxShadow:
            "0 0 30px rgba(0,163,255,0.08), 0 8px 32px rgba(0,0,0,0.4)",
        }}
      >
        {/* Chart header: title + timeframe toggle */}
        <div
          className="flex items-center justify-between px-5 pt-4 pb-3"
          style={{ borderBottom: "1px solid rgba(0,163,255,0.12)" }}
        >
          <div>
            <h2
              className="text-sm font-semibold uppercase tracking-widest"
              style={{ color: "#e0e0e0" }}
            >
              APY TREND &mdash;{" "}
              <span style={{ color: "#00A3FF" }}>
                {protocol === "all"
                  ? "All Protocols"
                  : PROTOCOL_METADATA[protocol]?.name}
              </span>
            </h2>
            <p
              className="text-xs mt-0.5 tracking-wide"
              style={{ color: "#909090" }}
            >
              Showing top 5 selected pools
            </p>
          </div>
          <div
            data-ocid="apy.timeframe_toggle"
            className="flex items-center gap-1 rounded-md p-0.5"
            style={{
              background: "rgba(13,13,13,0.9)",
              border: "1px solid rgba(0,163,255,0.15)",
            }}
          >
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                type="button"
                data-ocid={`apy.timeframe.${tf}`}
                onClick={() => setTimeframe(tf)}
                className="px-3 min-h-[36px] rounded text-xs font-mono font-semibold transition-smooth tracking-widest"
                style={{
                  background:
                    timeframe === tf ? "rgba(0,163,255,0.2)" : "transparent",
                  color: timeframe === tf ? "#00A3FF" : "#909090",
                  border:
                    timeframe === tf
                      ? "1px solid rgba(0,163,255,0.5)"
                      : "1px solid transparent",
                  boxShadow:
                    timeframe === tf ? "0 0 10px rgba(0,163,255,0.25)" : "none",
                }}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Pool selector checklist */}
        <div
          className="px-4 pt-3 pb-2 flex flex-wrap gap-2 max-h-[160px] overflow-y-auto"
          style={{ borderBottom: "1px solid rgba(0,163,255,0.08)" }}
        >
          {filteredPools.map((pool) => {
            const selected = selectedPoolIds.has(pool.id);
            const colorIdx = chartPools.findIndex((p) => p.id === pool.id);
            const lineColor =
              colorIdx >= 0 ? getPoolColor(pool, colorIdx) : undefined;
            return (
              <button
                key={pool.id}
                type="button"
                data-ocid={`apy.pool_toggle.${pool.id}`}
                onClick={() => togglePool(pool.id)}
                className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium transition-smooth"
                style={{
                  background: selected
                    ? lineColor
                      ? `${lineColor}18`
                      : "rgba(0,163,255,0.12)"
                    : "rgba(13,13,13,0.6)",
                  border: selected
                    ? `1px solid ${lineColor ?? "#00A3FF"}55`
                    : "1px solid rgba(255,255,255,0.06)",
                  color: selected ? (lineColor ?? "#00A3FF") : "#909090",
                  boxShadow:
                    selected && lineColor ? `0 0 8px ${lineColor}25` : "none",
                }}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{
                    background:
                      selected && lineColor
                        ? lineColor
                        : "rgba(255,255,255,0.12)",
                    boxShadow:
                      selected && lineColor ? `0 0 6px ${lineColor}99` : "none",
                  }}
                />
                <span>{pool.name}</span>
                <span className="font-mono" style={{ opacity: 0.7 }}>
                  {pool.apy.current.toFixed(1)}%
                </span>
              </button>
            );
          })}
        </div>

        {/* Chart */}
        <div className="px-2 pt-4 pb-4" data-ocid="apy.chart">
          {isLoading ? (
            <SkeletonChart />
          ) : chartPools.length === 0 ? (
            <div
              data-ocid="apy.chart.empty_state"
              className="flex flex-col items-center justify-center h-[220px] gap-3 text-center px-4"
            >
              <svg
                className="w-12 h-12"
                style={{ color: "rgba(0,163,255,0.25)" }}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                aria-hidden="true"
              >
                <path
                  d="M3 3v18h18"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M7 16l4-5 4 3 4-6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <p
                className="text-sm font-semibold tracking-widest uppercase"
                style={{ color: "#e0e0e0" }}
              >
                Select pools to compare APY trends
              </p>
              <p
                className="text-xs max-w-xs"
                style={{ color: "rgba(144,144,144,0.7)" }}
              >
                Choose up to 5 pools from the list above to visualize their APY
                performance over time.
              </p>
              <a
                href="/pools"
                data-ocid="apy.empty_state.browse_pools_link"
                className="mt-1 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold uppercase tracking-widest transition-smooth"
                style={{
                  background: "rgba(0,163,255,0.1)",
                  border: "1px solid rgba(0,163,255,0.35)",
                  color: "#00A3FF",
                  boxShadow: "0 0 12px rgba(0,163,255,0.12)",
                }}
              >
                Browse Pools
              </a>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={isMobile ? 220 : 320}>
              <LineChart
                data={chartData}
                margin={{ top: 8, right: 24, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(0,163,255,0.08)"
                  vertical={false}
                />
                <XAxis
                  dataKey="time"
                  tick={{
                    fill: "#606060",
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                  }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{
                    fill: "#606060",
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                  }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `${v}%`}
                  width={48}
                />
                <Tooltip
                  content={
                    <CustomTooltip
                      poolMap={poolMap}
                      chartData={chartData}
                      timeframe={timeframe}
                    />
                  }
                  cursor={{ stroke: "rgba(0,163,255,0.25)", strokeWidth: 1 }}
                />
                <Legend
                  formatter={(value: string) => {
                    const pool = poolMap[value];
                    const poolIdx = chartPools.findIndex((p) => p.id === value);
                    const change = poolTimeframeChange[value] ?? 0;
                    const changeSign = change >= 0 ? "+" : "";
                    return (
                      <span
                        style={{
                          color: "#909090",
                          fontSize: 10,
                          fontFamily: "var(--font-mono)",
                          letterSpacing: "0.05em",
                          textTransform: "uppercase",
                        }}
                      >
                        {pool?.name ?? value}
                        {poolIdx >= 0 && (
                          <span
                            style={{
                              marginLeft: 4,
                              color: change >= 0 ? "#00FF88" : "#ff4466",
                              textShadow:
                                change >= 0
                                  ? "0 0 6px rgba(0,255,136,0.5)"
                                  : "0 0 6px rgba(255,68,102,0.5)",
                            }}
                          >
                            {change >= 0 ? "↑" : "↓"}
                            {changeSign}
                            {Math.abs(change).toFixed(2)}% ({timeframe})
                          </span>
                        )}
                      </span>
                    );
                  }}
                  iconType="circle"
                  iconSize={7}
                  wrapperStyle={{ paddingTop: 12 }}
                />
                {chartPools.map((pool, idx) => {
                  const color = getPoolColor(pool, idx);
                  return (
                    <Line
                      key={pool.id}
                      type="monotone"
                      dataKey={pool.id}
                      stroke={color}
                      strokeWidth={idx === 0 ? 2.5 : 2}
                      dot={false}
                      isAnimationActive={true}
                      animationDuration={800}
                      activeDot={{
                        r: 5,
                        strokeWidth: 0,
                        fill: color,
                        style: { filter: `drop-shadow(0 0 6px ${color})` },
                      }}
                      style={{ filter: `drop-shadow(0 0 3px ${color}66)` }}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Stats table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: "rgba(13,13,13,0.85)",
          border: "1px solid rgba(0,163,255,0.15)",
          backdropFilter: "blur(10px)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
        }}
      >
        <div
          className="px-5 py-4"
          style={{ borderBottom: "1px solid rgba(0,163,255,0.12)" }}
        >
          <h2
            className="text-sm font-semibold uppercase tracking-widest"
            style={{ color: "#e0e0e0" }}
          >
            APY Stats
          </h2>
          <p
            className="text-xs mt-0.5 tracking-wide"
            style={{ color: "#909090" }}
          >
            {filteredPools.length} pools sorted by current APY
          </p>
        </div>

        {isLoading ? (
          <div className="p-4">
            <SkeletonTable rows={6} />
          </div>
        ) : (
          <div className="overflow-x-auto" data-ocid="apy.stats_table">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(0,163,255,0.1)" }}>
                  {[
                    "Pool",
                    "Protocol",
                    "Current APY",
                    "1D Change",
                    "7D Avg",
                    "30D Avg",
                  ].map((col) => (
                    <th
                      key={col}
                      className={cn(
                        "px-4 py-3 text-xs font-medium uppercase tracking-widest",
                        col !== "Pool" && col !== "Protocol"
                          ? "text-right"
                          : "text-left",
                      )}
                      style={{ color: "#606060" }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedTablePools.map((pool, idx) => {
                  const isSelected = selectedPoolIds.has(pool.id);
                  const colorIdx = chartPools.findIndex(
                    (p) => p.id === pool.id,
                  );
                  const lineColor =
                    colorIdx >= 0 ? getPoolColor(pool, colorIdx) : null;
                  return (
                    <tr
                      key={pool.id}
                      data-ocid={`apy.table_row.${idx + 1}`}
                      className="transition-smooth"
                      style={{
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                        background: isSelected
                          ? "rgba(0,163,255,0.04)"
                          : "transparent",
                      }}
                      onMouseEnter={(e) => {
                        (
                          e.currentTarget as HTMLTableRowElement
                        ).style.background = "rgba(0,163,255,0.07)";
                      }}
                      onMouseLeave={(e) => {
                        (
                          e.currentTarget as HTMLTableRowElement
                        ).style.background = isSelected
                          ? "rgba(0,163,255,0.04)"
                          : "transparent";
                      }}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {isSelected && lineColor && (
                            <span
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{
                                background: lineColor,
                                boxShadow: `0 0 5px ${lineColor}99`,
                              }}
                            />
                          )}
                          {(!isSelected || !lineColor) && (
                            <span
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ background: "rgba(255,255,255,0.1)" }}
                            />
                          )}
                          <span
                            className="font-medium tracking-wide"
                            style={{ color: "#e0e0e0" }}
                          >
                            {pool.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <ProtocolBadge protocol={pool.protocol} size="sm" />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className="font-mono font-semibold"
                          style={{
                            color: "#00A3FF",
                            textShadow: "0 0 8px rgba(0,163,255,0.5)",
                          }}
                        >
                          {formatAPY(pool.apy.current)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <ChangeCell value={pool.apy.day1Change} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className="font-mono"
                          style={{ color: "#909090" }}
                        >
                          {formatAPY(pool.apy.day7Avg)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className="font-mono"
                          style={{ color: "#909090" }}
                        >
                          {formatAPY(pool.apy.day30Avg)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
