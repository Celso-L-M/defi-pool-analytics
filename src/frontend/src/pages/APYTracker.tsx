import { EmptyState, ErrorState, LoadingState } from "@/components/DataStates";
import { DemoBadge } from "@/components/DemoBadge";
import { ProtocolBadge } from "@/components/ProtocolBadge";
import { RiskBadge } from "@/components/RiskBadge";
import { Button } from "@/components/ui/button";
import { usePoolHistory, usePools } from "@/hooks/useLiveData";
import { cn } from "@/lib/utils";
import type { Pool, PoolHistoryPoint, Protocol } from "@/types/defi";
import { ArrowDownRight, ArrowUpRight, Check, Minus } from "lucide-react";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type RangeDays = 7 | 30 | 90;
type ProtocolFilter = "all" | Protocol;

const RANGES: RangeDays[] = [7, 30, 90];
const MAX_SELECTED = 5;
const TABLE_PAGE = 25;
const DAY_MS = 86_400_000;

const PROTOCOL_TABS: { value: ProtocolFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "uniswap", label: "Uniswap" },
  { value: "pancakeswap", label: "PancakeSwap" },
  { value: "raydium", label: "Raydium" },
  { value: "icp", label: "ICP" },
];

const LINE_COLORS = [
  "oklch(var(--chart-1))",
  "oklch(var(--chart-2))",
  "oklch(var(--chart-5))",
  "oklch(var(--chart-4))",
  "oklch(var(--chart-3))",
];

const fmtApy = (v: number) => `${v.toFixed(2)}%`;
const AXIS_TICK = {
  fill: "oklch(var(--muted-foreground))",
  fontSize: 10,
  fontFamily: "var(--font-mono)",
};

interface RangeStats {
  start: number;
  end: number;
  change: number;
  avg: number;
  days: number;
}

function sliceRange(
  series: PoolHistoryPoint[],
  cutoff: number,
): PoolHistoryPoint[] {
  return series.filter((p) => p.timestamp >= cutoff);
}

function computeStats(points: PoolHistoryPoint[]): RangeStats | null {
  if (points.length < 2) return null;
  const start = points[0].apy;
  const end = points[points.length - 1].apy;
  const avg = points.reduce((sum, p) => sum + p.apy, 0) / points.length;
  return { start, end, change: end - start, avg, days: points.length };
}

function ChangeValue({ value }: { value: number }) {
  const flat = Math.abs(value) < 0.005;
  const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-mono text-xs font-semibold tabular-nums",
        flat
          ? "text-muted-foreground"
          : value > 0
            ? "text-success"
            : "text-destructive",
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {value > 0 ? "+" : value < 0 ? "-" : ""}
      {Math.abs(value).toFixed(2)} pp
    </span>
  );
}

interface TooltipEntry {
  dataKey?: string | number;
  value?: number;
  color?: string;
}

function ChartTooltip({
  active,
  payload,
  label,
  names,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  names: Record<string, string>;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[180px] rounded-md border border-border bg-popover p-3 shadow-elevated">
      <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      {payload.map((entry) => (
        <div
          key={String(entry.dataKey)}
          className="flex items-center justify-between gap-4 py-0.5 text-xs"
        >
          <span className="flex min-w-0 items-center gap-1.5 text-foreground">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: entry.color }}
            />
            <span className="truncate">
              {names[String(entry.dataKey)] ?? entry.dataKey}
            </span>
          </span>
          <span className="font-mono font-semibold tabular-nums text-foreground">
            {typeof entry.value === "number" ? fmtApy(entry.value) : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

const panel = "rounded-lg border border-border bg-card";
const segmentBtn =
  "min-h-[32px] rounded px-3 font-mono text-xs font-semibold uppercase tracking-wider transition-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function APYTrackerPage() {
  const pools = usePools();
  const [protocol, setProtocol] = useState<ProtocolFilter>("all");
  const [range, setRange] = useState<RangeDays>(30);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    const list =
      protocol === "all"
        ? pools.data
        : pools.data.filter((p) => p.protocol === protocol);
    return [...list].sort((a, b) => b.apy.current - a.apy.current);
  }, [pools.data, protocol]);

  const selectedIds = useMemo(() => {
    const valid = (picked ?? []).filter((id) =>
      filtered.some((p) => p.id === id),
    );
    if (picked !== null && valid.length > 0) return valid;
    return filtered.slice(0, MAX_SELECTED).map((p) => p.id);
  }, [picked, filtered]);

  const selectedPools = useMemo(
    () =>
      selectedIds
        .map((id) => filtered.find((p) => p.id === id))
        .filter((p): p is Pool => p !== undefined),
    [selectedIds, filtered],
  );

  const poolKey = (i: number) => {
    const p = selectedPools[i];
    return p ? (p.poolId ?? p.id) : undefined;
  };
  const histories = [
    usePoolHistory(poolKey(0)),
    usePoolHistory(poolKey(1)),
    usePoolHistory(poolKey(2)),
    usePoolHistory(poolKey(3)),
    usePoolHistory(poolKey(4)),
  ].slice(0, selectedPools.length);

  const latest = Math.max(
    0,
    ...histories.map((h) => h.data[h.data.length - 1]?.timestamp ?? 0),
  );
  const cutoff = latest - range * DAY_MS;
  const ranged = selectedPools.map((pool, i) => ({
    pool,
    points: sliceRange(histories[i].data, cutoff),
  }));

  const byDate = new Map<string, Record<string, number | string>>();
  const statsById = new Map<string, RangeStats>();
  for (const { pool, points } of ranged) {
    for (const p of points) {
      const row = byDate.get(p.date) ?? { date: p.date };
      row[pool.id] = Number(p.apy.toFixed(2));
      byDate.set(p.date, row);
    }
    const s = computeStats(points);
    if (s) statsById.set(pool.id, s);
  }
  const chartData = [...byDate.values()].sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );

  const names = useMemo(
    () => Object.fromEntries(selectedPools.map((p) => [p.id, p.name])),
    [selectedPools],
  );

  const historyLoading = histories.some((h) => h.isLoading);
  const historyFailed = histories.filter(
    (h) => h.isError && h.data.length === 0,
  );
  const historyDemo = histories.some((h) => h.isDemo && h.data.length > 0);
  const showDemo = pools.isDemo || historyDemo;
  const availableDays = Math.max(0, ...ranged.map((r) => r.points.length));

  const retryHistory = () => {
    for (const h of historyFailed) h.refetch();
  };

  const toggle = (id: string) => {
    const base = selectedIds;
    if (base.includes(id)) {
      if (base.length > 1) setPicked(base.filter((x) => x !== id));
    } else if (base.length < MAX_SELECTED) {
      setPicked([...base, id]);
    }
  };

  const chooseProtocol = (value: ProtocolFilter) => {
    setProtocol(value);
    setPicked(null);
    setShowAll(false);
  };

  const colorOf = (id: string) => {
    const idx = selectedIds.indexOf(id);
    return idx >= 0 ? LINE_COLORS[idx] : undefined;
  };

  const tablePools = showAll ? filtered : filtered.slice(0, TABLE_PAGE);

  return (
    <div data-ocid="apy.page" className="space-y-6 p-4 sm:p-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-bold uppercase tracking-widest text-foreground">
            APY <span className="text-primary">Tracker</span>
          </h1>
          {showDemo && <DemoBadge />}
        </div>
        <p className="text-sm tracking-wide text-muted-foreground">
          Yield history from DefiLlama for the pools you select, over 7, 30 or
          90 days.
        </p>
      </header>

      <div
        data-ocid="apy.protocol_filter"
        className="flex w-fit flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1"
      >
        {PROTOCOL_TABS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            data-ocid={`apy.protocol_tab.${value}`}
            aria-pressed={protocol === value}
            onClick={() => chooseProtocol(value)}
            className={cn(
              segmentBtn,
              "font-body tracking-wider",
              protocol === value
                ? "bg-primary/15 text-primary ring-1 ring-primary/40"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {pools.isLoading ? (
        <LoadingState label="Loading pools from DefiLlama…" />
      ) : (
        <>
          {pools.isError && (
            <ErrorState
              title={
                pools.isDemo
                  ? "Live pool data is unavailable"
                  : "Could not refresh pool data"
              }
              message={
                pools.isDemo
                  ? "Showing labelled demo pools instead. Retry to load live data."
                  : "Showing the last loaded data. Retry to refresh."
              }
              onRetry={pools.refetch}
            />
          )}

          {filtered.length === 0 ? (
            <EmptyState
              title="No pools for this protocol"
              description="Try another protocol filter to see APY history."
              action={
                protocol !== "all" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-ocid="apy.clear_filter_button"
                    onClick={() => chooseProtocol("all")}
                  >
                    Show all protocols
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <section className={panel} data-ocid="apy.chart_panel">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
                  <div>
                    <h2 className="text-sm font-semibold uppercase tracking-widest text-foreground">
                      APY trend
                    </h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Up to {MAX_SELECTED} pools · {availableDays} daily points
                      in range
                    </p>
                  </div>
                  <div
                    data-ocid="apy.range_toggle"
                    className="flex items-center gap-1 rounded-md border border-border bg-background p-0.5"
                  >
                    {RANGES.map((d) => (
                      <button
                        key={d}
                        type="button"
                        data-ocid={`apy.range.${d}`}
                        aria-pressed={range === d}
                        onClick={() => setRange(d)}
                        className={cn(
                          segmentBtn,
                          range === d
                            ? "bg-primary/20 text-primary ring-1 ring-primary/50"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {d}D
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex max-h-[132px] flex-wrap gap-2 overflow-y-auto border-b border-border px-4 py-3">
                  {filtered.slice(0, 16).map((pool) => {
                    const on = selectedIds.includes(pool.id);
                    const color = colorOf(pool.id);
                    const locked = !on && selectedIds.length >= MAX_SELECTED;
                    return (
                      <button
                        key={pool.id}
                        type="button"
                        data-ocid={`apy.pool_toggle.${pool.id}`}
                        aria-pressed={on}
                        disabled={locked}
                        title={
                          locked
                            ? `Deselect a pool first (max ${MAX_SELECTED})`
                            : undefined
                        }
                        onClick={() => toggle(pool.id)}
                        className={cn(
                          "inline-flex min-h-[28px] items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                          on
                            ? "border-primary/40 bg-primary/10 text-foreground"
                            : "border-border text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full bg-muted"
                          style={color ? { background: color } : undefined}
                        />
                        <span className="max-w-[140px] truncate">
                          {pool.name}
                        </span>
                        <span className="font-mono text-muted-foreground">
                          {pool.apy.current.toFixed(1)}%
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="px-2 py-4" data-ocid="apy.chart">
                  {historyLoading && chartData.length === 0 ? (
                    <LoadingState label="Loading pool history…" />
                  ) : chartData.length === 0 && historyFailed.length > 0 ? (
                    <ErrorState
                      title="Could not load APY history"
                      message="DefiLlama history is unreachable for the selected pools."
                      onRetry={retryHistory}
                    />
                  ) : chartData.length === 0 ? (
                    <EmptyState
                      title="No history in this range"
                      description="The selected pools have no APY history yet. Pick other pools or a longer range."
                    />
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart
                          data={chartData}
                          margin={{ top: 8, right: 24, left: 0, bottom: 0 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="oklch(var(--border))"
                            vertical={false}
                          />
                          <XAxis
                            dataKey="date"
                            tick={AXIS_TICK}
                            tickFormatter={(v: string) => v.slice(5)}
                            axisLine={false}
                            tickLine={false}
                            minTickGap={32}
                          />
                          <YAxis
                            tick={AXIS_TICK}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(v: number) => `${v}%`}
                            width={52}
                          />
                          <Tooltip
                            content={<ChartTooltip names={names} />}
                            cursor={{ stroke: "oklch(var(--primary) / 0.3)" }}
                          />
                          {selectedPools.map((pool, idx) => (
                            <Line
                              key={pool.id}
                              type="monotone"
                              dataKey={pool.id}
                              stroke={LINE_COLORS[idx]}
                              strokeWidth={2}
                              dot={false}
                              connectNulls
                              isAnimationActive={false}
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                      {historyFailed.length > 0 && (
                        <p
                          data-ocid="apy.history_partial_error"
                          className="mt-2 px-3 text-xs text-warning"
                        >
                          History failed for {historyFailed.length} selected
                          pool{historyFailed.length > 1 ? "s" : ""}.{" "}
                          <button
                            type="button"
                            data-ocid="apy.history_retry_button"
                            onClick={retryHistory}
                            className="underline underline-offset-2"
                          >
                            Retry
                          </button>
                        </p>
                      )}
                    </>
                  )}
                </div>
              </section>

              <section
                className={cn(panel, "overflow-hidden")}
                data-ocid="apy.stats_panel"
              >
                <div className="border-b border-border px-5 py-4">
                  <h2 className="text-sm font-semibold uppercase tracking-widest text-foreground">
                    APY stats
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {filtered.length} pools by current APY · change and average
                    cover the last {range} days of the selected pools
                  </p>
                </div>
                <div className="overflow-x-auto" data-ocid="apy.stats_table">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b border-border text-xs uppercase tracking-widest text-muted-foreground">
                        <th className="w-10 px-4 py-3 text-left font-medium">
                          <span className="sr-only">Chart</span>
                        </th>
                        <th className="px-4 py-3 text-left font-medium">
                          Pool
                        </th>
                        <th className="px-4 py-3 text-left font-medium">
                          Protocol
                        </th>
                        <th className="px-4 py-3 text-left font-medium">
                          Risk
                        </th>
                        <th className="px-4 py-3 text-right font-medium">
                          Current APY
                        </th>
                        <th className="px-4 py-3 text-right font-medium">
                          {range}D change
                        </th>
                        <th className="px-4 py-3 text-right font-medium">
                          {range}D avg
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {tablePools.map((pool, idx) => {
                        const on = selectedIds.includes(pool.id);
                        const stats = statsById.get(pool.id);
                        const color = colorOf(pool.id);
                        const locked =
                          !on && selectedIds.length >= MAX_SELECTED;
                        return (
                          <tr
                            key={pool.id}
                            data-ocid={`apy.table_row.${idx + 1}`}
                            className={cn(
                              "border-b border-border/50 transition-smooth hover:bg-muted/40",
                              on && "bg-primary/5",
                            )}
                          >
                            <td className="px-4 py-2">
                              <button
                                type="button"
                                data-ocid={`apy.row_toggle.${idx + 1}`}
                                aria-pressed={on}
                                aria-label={`${on ? "Remove" : "Add"} ${pool.name} ${on ? "from" : "to"} chart`}
                                disabled={locked}
                                onClick={() => toggle(pool.id)}
                                className="flex h-6 w-6 items-center justify-center rounded border border-border text-primary-foreground transition-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
                                style={
                                  color ? { background: color } : undefined
                                }
                              >
                                {on && <Check className="h-3.5 w-3.5" />}
                              </button>
                            </td>
                            <td className="px-4 py-2">
                              <span className="block max-w-[200px] truncate font-medium text-foreground">
                                {pool.name}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {pool.chain}
                              </span>
                            </td>
                            <td className="px-4 py-2">
                              <ProtocolBadge
                                protocol={pool.protocol}
                                size="sm"
                              />
                            </td>
                            <td className="px-4 py-2">
                              <RiskBadge
                                pool={pool}
                                history={
                                  on
                                    ? histories[selectedIds.indexOf(pool.id)]
                                        ?.data
                                    : undefined
                                }
                              />
                            </td>
                            <td className="px-4 py-2 text-right font-mono font-semibold tabular-nums text-primary">
                              {fmtApy(pool.apy.current)}
                            </td>
                            <td className="px-4 py-2 text-right">
                              {stats ? (
                                <ChangeValue value={stats.change} />
                              ) : (
                                <span
                                  className="font-mono text-xs text-muted-foreground"
                                  title={
                                    on
                                      ? "Not enough history in this range"
                                      : "Add this pool to the chart to compute change"
                                  }
                                >
                                  —
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-right font-mono tabular-nums text-muted-foreground">
                              {stats ? fmtApy(stats.avg) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {filtered.length > TABLE_PAGE && (
                  <div className="flex justify-center border-t border-border p-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      data-ocid="apy.show_all_button"
                      onClick={() => setShowAll((v) => !v)}
                    >
                      {showAll
                        ? `Show top ${TABLE_PAGE}`
                        : `Show all ${filtered.length} pools`}
                    </Button>
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default APYTrackerPage;
