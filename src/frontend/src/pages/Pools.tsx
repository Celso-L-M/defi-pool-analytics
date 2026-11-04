import { EmptyState, ErrorState } from "@/components/DataStates";
import { DemoBadge } from "@/components/DemoBadge";
import { PoolCard, formatUsd } from "@/components/PoolCard";
import { RiskBadge } from "@/components/RiskBadge";
import { SignInPrompt } from "@/components/SignInPrompt";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { PROTOCOL_METADATA } from "@/data/mockData";
import { useAuth } from "@/hooks/useAuth";
import { usePoolHistory, usePools } from "@/hooks/useLiveData";
import {
  useAddToWatchlist,
  useRemoveFromWatchlist,
  useWatchlist,
} from "@/hooks/useQueries";
import { cn } from "@/lib/utils";
import { useDefiStore } from "@/store/useDefiStore";
import type { Pool, Protocol } from "@/types/defi";
import { computeRiskScore } from "@/utils/riskScore";
import { Search, SearchX, Star, Waves } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type SortKey = "tvl" | "apy" | "volume" | "risk";
type Range = "7d" | "30d" | "90d" | "all";

const SORT_LABELS: Record<SortKey, string> = {
  tvl: "TVL (high to low)",
  apy: "APY (high to low)",
  volume: "Volume 24h (high to low)",
  risk: "Risk (low to high)",
};

const RANGES: { id: Range; label: string; days: number }[] = [
  { id: "7d", label: "7D", days: 7 },
  { id: "30d", label: "30D", days: 30 },
  { id: "90d", label: "90D", days: 90 },
  { id: "all", label: "All", days: Number.POSITIVE_INFINITY },
];

const PROTOCOL_FILTERS: { id: Protocol | "all"; label: string }[] = [
  { id: "all", label: "All protocols" },
  ...Object.entries(PROTOCOL_METADATA).map(([id, meta]) => ({
    id: id as Protocol,
    label: meta.name,
  })),
];

const GRID = "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3";

function toEntry(pool: Pool) {
  return {
    poolId: pool.poolId ?? pool.id,
    displayName: pool.name,
    chain: pool.chain,
    symbol: `${pool.token0}-${pool.token1}`,
    project: pool.project ?? pool.protocol,
  };
}

interface ChartTipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  format: (value: number) => string;
}

function ChartTip({ active, payload, label, format }: ChartTipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-popover-foreground shadow-md">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-mono text-sm font-semibold">
        {format(payload[0].value)}
      </p>
    </div>
  );
}

interface HistoryChartProps {
  title: string;
  data: Array<{ date: string; value: number }>;
  format: (value: number) => string;
  lineClass: string;
  ocid: string;
}

function HistoryChart({
  title,
  data,
  format,
  lineClass,
  ocid,
}: HistoryChartProps) {
  return (
    <div data-ocid={ocid}>
      <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <div className="h-40 text-muted-foreground">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              className="stroke-border"
            />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "currentColor" }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={32}
            />
            <YAxis
              width={52}
              tick={{ fontSize: 10, fill: "currentColor" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={format}
              domain={["auto", "auto"]}
            />
            <Tooltip content={<ChartTip format={format} />} />
            <Line
              type="monotone"
              dataKey="value"
              className={lineClass}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, className: "fill-foreground" }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

interface DrawerProps {
  pool: Pool;
  watched: boolean;
  wantsSignIn: boolean;
  onToggleWatch: (pool: Pool) => void;
  onClose: () => void;
  pending: boolean;
  error: string | null;
}

function PoolDetailDrawer({
  pool,
  watched,
  wantsSignIn,
  onToggleWatch,
  onClose,
  pending,
  error,
}: DrawerProps) {
  const [range, setRange] = useState<Range>("30d");
  const history = usePoolHistory(pool.poolId ?? pool.id);
  const protocolName = PROTOCOL_METADATA[pool.protocol]?.name ?? pool.protocol;

  const points = useMemo(() => {
    const days = RANGES.find((r) => r.id === range)?.days ?? 30;
    return Number.isFinite(days) ? history.data.slice(-days) : history.data;
  }, [history.data, range]);

  const apySeries = useMemo(
    () => points.map((p) => ({ date: p.date.slice(5), value: p.apy })),
    [points],
  );
  const tvlSeries = useMemo(
    () => points.map((p) => ({ date: p.date.slice(5), value: p.tvlUsd })),
    [points],
  );
  const risk = useMemo(
    () => computeRiskScore(pool, history.data),
    [pool, history.data],
  );

  const stats = [
    { label: "TVL", value: formatUsd(pool.stats.tvl) },
    { label: "Volume 24h", value: formatUsd(pool.stats.volume24h) },
    { label: "Fees 24h", value: formatUsd(pool.stats.fees24h) },
    { label: "APY 7d avg", value: `${pool.apy.day7Avg.toFixed(1)}%` },
    { label: "APY 30d avg", value: `${pool.apy.day30Avg.toFixed(1)}%` },
    { label: "Fee rate", value: `${(pool.stats.feeRate * 100).toFixed(2)}%` },
  ];

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        data-ocid="pool.detail.sheet"
        className="w-full gap-5 overflow-y-auto border-border bg-background p-5 sm:max-w-lg"
      >
        <SheetHeader className="p-0 pr-8">
          <SheetTitle className="font-display text-lg text-foreground">
            {pool.name}
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            {protocolName} · {pool.chain}
          </SheetDescription>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <RiskBadge pool={pool} history={history.data} />
            {history.isDemo && <DemoBadge />}
          </div>
        </SheetHeader>

        <div className="space-y-2">
          <Button
            type="button"
            variant={watched ? "secondary" : "default"}
            size="sm"
            data-ocid="pool.detail.watch_button"
            disabled={pending}
            onClick={() => onToggleWatch(pool)}
          >
            <Star
              className={cn("mr-1.5 h-4 w-4", watched && "fill-warning")}
              aria-hidden
            />
            {pending
              ? "Saving…"
              : watched
                ? "Remove from watchlist"
                : "Add to watchlist"}
          </Button>
          {error && (
            <p
              role="alert"
              data-ocid="pool.detail.watch_error"
              className="text-xs text-destructive"
            >
              {error}
            </p>
          )}
          {wantsSignIn && <SignInPrompt feature="your watchlist" />}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Current APY
          </p>
          <p className="font-mono text-3xl font-bold text-accent">
            {pool.apy.current.toFixed(2)}%
          </p>
          {(pool.apyBase !== undefined || pool.apyReward !== undefined) && (
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              Base {(pool.apyBase ?? 0).toFixed(2)}% · Rewards{" "}
              {(pool.apyReward ?? 0).toFixed(2)}%
            </p>
          )}
        </div>

        <section aria-label="Risk assessment" data-ocid="pool.detail.risk">
          <div className="mb-2 flex items-baseline justify-between">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Risk score
            </p>
            <p className="font-mono text-sm text-foreground">
              {risk.score}/10 · {risk.level}
            </p>
          </div>
          <div className={cn("risk-meter mb-3", `risk-meter-${risk.level}`)}>
            <span style={{ width: `${risk.score * 10}%` }} />
          </div>
          <ul className="space-y-2">
            {risk.factors.map((factor) => (
              <li key={factor.key} className="text-xs leading-snug">
                <span className="font-medium text-foreground">
                  {factor.label}:{" "}
                </span>
                <span className="text-muted-foreground">
                  {factor.explanation}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="History" className="space-y-4">
          <fieldset className="m-0 flex min-w-0 items-center gap-1 border-0 p-0">
            <legend className="sr-only">History range</legend>
            <p className="mr-auto text-xs uppercase tracking-wider text-muted-foreground">
              History
            </p>
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                data-ocid={`pool.detail.range.${r.id}`}
                aria-pressed={range === r.id}
                onClick={() => setRange(r.id)}
                className={cn(
                  "min-h-[28px] rounded-md border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  range === r.id
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {r.label}
              </button>
            ))}
          </fieldset>

          {history.isLoading ? (
            <div data-ocid="pool.detail.loading_state" className="space-y-3">
              <Skeleton className="h-40 w-full bg-muted" />
              <Skeleton className="h-40 w-full bg-muted" />
            </div>
          ) : history.isError && history.data.length === 0 ? (
            <ErrorState
              title="History unavailable"
              message="Could not load this pool's APY and TVL history."
              onRetry={history.refetch}
            />
          ) : points.length === 0 ? (
            <EmptyState
              title="No history yet"
              description="This pool has no daily history to chart."
            />
          ) : (
            <>
              <HistoryChart
                ocid="pool.detail.apy_chart"
                title="APY"
                data={apySeries}
                format={(v) => `${v.toFixed(1)}%`}
                lineClass="stroke-accent"
              />
              <HistoryChart
                ocid="pool.detail.tvl_chart"
                title="TVL"
                data={tvlSeries}
                format={formatUsd}
                lineClass="stroke-primary"
              />
            </>
          )}
        </section>

        <div className="grid grid-cols-2 gap-3">
          {stats.map(({ label, value }) => (
            <div
              key={label}
              className="rounded-lg border border-border bg-card px-3 py-2.5"
            >
              <p className="mb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                {label}
              </p>
              <p className="font-mono text-sm font-semibold text-foreground">
                {value}
              </p>
            </div>
          ))}
        </div>
        <p className="break-all font-mono text-[11px] text-muted-foreground">
          {pool.address}
        </p>
      </SheetContent>
    </Sheet>
  );
}

export function PoolsPage() {
  const selectedProtocol = useDefiStore((s) => s.selectedProtocol);
  const setSelectedProtocol = useDefiStore((s) => s.setSelectedProtocol);
  const selectedPoolIds = useDefiStore((s) => s.selectedPoolIds);
  const { isAuthenticated } = useAuth();
  const pools = usePools();
  const watchlist = useWatchlist();
  const addWatch = useAddToWatchlist();
  const removeWatch = useRemoveFromWatchlist();

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("tvl");
  const [stableOnly, setStableOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [signInFor, setSignInFor] = useState<string | null>(null);
  const [watchError, setWatchError] = useState<string | null>(null);

  const watchedIds = useMemo(
    () => new Set((watchlist.data ?? []).map((w) => w.poolId)),
    [watchlist.data],
  );
  const isWatched = useCallback(
    (pool: Pool) => watchedIds.has(pool.poolId ?? pool.id),
    [watchedIds],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = pools.data.filter((p) => {
      if (selectedProtocol !== "all" && p.protocol !== selectedProtocol)
        return false;
      if (stableOnly && !p.stablecoin) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.token0.toLowerCase().includes(q) ||
        p.token1.toLowerCase().includes(q) ||
        p.chain.toLowerCase().includes(q)
      );
    });
    const scored = rows.map((pool) => ({
      pool,
      risk: sort === "risk" ? computeRiskScore(pool).score : 0,
    }));
    scored.sort((a, b) => {
      switch (sort) {
        case "apy":
          return b.pool.apy.current - a.pool.apy.current;
        case "volume":
          return b.pool.stats.volume24h - a.pool.stats.volume24h;
        case "risk":
          return a.risk - b.risk || b.pool.stats.tvl - a.pool.stats.tvl;
        default:
          return b.pool.stats.tvl - a.pool.stats.tvl;
      }
    });
    return scored.map((s) => s.pool);
  }, [pools.data, selectedProtocol, search, stableOnly, sort]);

  const openPool = useMemo(
    () => pools.data.find((p) => p.id === openId) ?? null,
    [pools.data, openId],
  );

  const toggleWatch = useCallback(
    (pool: Pool) => {
      setWatchError(null);
      if (!isAuthenticated) {
        setOpenId(pool.id);
        setSignInFor(pool.id);
        return;
      }
      const onError = (e: Error) => setWatchError(e.message);
      if (isWatched(pool)) {
        removeWatch.mutate(pool.poolId ?? pool.id, { onError });
      } else {
        addWatch.mutate(toEntry(pool), { onError });
      }
    },
    [isAuthenticated, isWatched, addWatch, removeWatch],
  );

  const closeDrawer = () => {
    setOpenId(null);
    setSignInFor(null);
    setWatchError(null);
  };

  const hasFilters = search !== "" || selectedProtocol !== "all" || stableOnly;
  const resetFilters = () => {
    setSearch("");
    setStableOnly(false);
    setSelectedProtocol("all");
  };
  const watchPending = addWatch.isPending || removeWatch.isPending;
  const showError = pools.isError && pools.isDemo;

  return (
    <div data-ocid="pools.page" className="space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
            <Waves className="h-5 w-5 text-primary" aria-hidden />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-foreground">
              Pool Explorer
            </h1>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {pools.isLoading
                ? "Loading pools"
                : `${pools.data.length} pools tracked`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {pools.isDemo && <DemoBadge />}
          {selectedPoolIds.length > 0 && (
            <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              {selectedPoolIds.length} in comparison
            </span>
          )}
        </div>
      </header>

      <fieldset
        data-ocid="pools.protocol_tabs"
        className="m-0 flex min-w-0 flex-wrap items-center gap-1.5 border-0 p-0"
      >
        <legend className="sr-only">Filter by protocol</legend>
        {PROTOCOL_FILTERS.map((f) => {
          const active = selectedProtocol === f.id;
          return (
            <button
              key={f.id}
              type="button"
              data-ocid={`pools.filter.${f.id}`}
              aria-pressed={active}
              onClick={() => setSelectedProtocol(f.id)}
              className={cn(
                "min-h-[36px] rounded-md border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          );
        })}
      </fieldset>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            data-ocid="pools.search_input"
            type="search"
            aria-label="Search pools"
            placeholder="Search by pool, token or chain…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-input bg-card py-2.5 pl-9 pr-4 font-mono text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger
            data-ocid="pools.sort_select"
            aria-label="Sort pools"
            className="w-full bg-card sm:w-56"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
              <SelectItem key={key} value={key}>
                {SORT_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          type="button"
          data-ocid="pools.stable_toggle"
          aria-pressed={stableOnly}
          onClick={() => setStableOnly((v) => !v)}
          className={cn(
            "min-h-[36px] rounded-md border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            stableOnly
              ? "border-primary bg-primary/15 text-primary"
              : "border-border bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          Stablecoins only
        </button>
      </div>

      {watchError && !openPool && (
        <p
          role="alert"
          data-ocid="pools.watch_error"
          className="text-sm text-destructive"
        >
          {watchError}
        </p>
      )}

      {showError && (
        <ErrorState
          title="Live pool data is unavailable"
          message="DefiLlama could not be reached, so demo pools are shown below. Retry to load live data."
          onRetry={pools.refetch}
        />
      )}

      {pools.isLoading ? (
        <div data-ocid="pools.loading_state" className={GRID}>
          {Array.from({ length: 6 }, (_, i) => `pool-skeleton-${i}`).map(
            (id) => (
              <Skeleton key={id} className="h-44 rounded-lg bg-muted" />
            ),
          )}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<SearchX className="h-5 w-5" aria-hidden />}
          title="No pools found"
          description={
            hasFilters
              ? "No pool matches the current search and filters."
              : "No pool data is available right now."
          }
          action={
            hasFilters ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-ocid="pools.clear_filters_button"
                onClick={resetFilters}
              >
                Clear filters
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-ocid="pools.refresh_button"
                onClick={pools.refetch}
              >
                Refresh
              </Button>
            )
          }
        />
      ) : (
        <>
          <p
            data-ocid="pools.result_count"
            className="text-xs uppercase tracking-wider text-muted-foreground"
          >
            Showing <span className="text-foreground">{filtered.length}</span>{" "}
            pool
            {filtered.length === 1 ? "" : "s"}
          </p>
          <div data-ocid="pools.list" className={GRID}>
            {filtered.map((pool, i) => (
              <PoolCard
                key={pool.id}
                pool={pool}
                index={i}
                selected={selectedPoolIds.includes(pool.id)}
                watched={isWatched(pool)}
                watchPending={watchPending}
                onSelect={setOpenId}
                onToggleWatch={toggleWatch}
              />
            ))}
          </div>
        </>
      )}

      {openPool && (
        <PoolDetailDrawer
          pool={openPool}
          watched={isWatched(openPool)}
          wantsSignIn={!isAuthenticated && signInFor === openPool.id}
          onToggleWatch={toggleWatch}
          onClose={closeDrawer}
          pending={watchPending}
          error={watchError}
        />
      )}
    </div>
  );
}
