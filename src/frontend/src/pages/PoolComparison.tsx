import { EmptyState, ErrorState, LoadingState } from "@/components/DataStates";
import { DemoBadge } from "@/components/DemoBadge";
import { RiskBadge } from "@/components/RiskBadge";
import { SignInPrompt } from "@/components/SignInPrompt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { type LiveResult, usePoolHistory, usePools } from "@/hooks/useLiveData";
import {
  useAddToWatchlist,
  useRemoveFromWatchlist,
  useWatchlist,
} from "@/hooks/useQueries";
import { cn } from "@/lib/utils";
import { useDefiStore } from "@/store/useDefiStore";
import type { Pool, PoolHistoryPoint } from "@/types/defi";
import { exportCSV, exportPDF } from "@/utils/exportUtils";
import { computeRiskScore } from "@/utils/riskScore";
import { toast } from "@/utils/toast";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  Check,
  FileText,
  Link2,
  Plus,
  RefreshCw,
  Search,
  Star,
  TriangleAlert,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
  XAxis,
  YAxis,
} from "recharts";
import type {
  NameType,
  ValueType,
} from "recharts/types/component/DefaultTooltipContent";

const MAX_POOLS = 4;
const HISTORY_DAYS = 90;

const SERIES = [
  { line: "stroke-chart-1", dot: "bg-chart-1" },
  { line: "stroke-chart-2", dot: "bg-chart-2" },
  { line: "stroke-chart-4", dot: "bg-chart-4" },
  { line: "stroke-chart-5", dot: "bg-chart-5" },
] as const;

const CHART_STYLE =
  "[&_.recharts-cartesian-grid_line]:stroke-border [&_.recharts-cartesian-axis-line]:stroke-border [&_.recharts-cartesian-axis-tick-line]:stroke-border [&_.recharts-cartesian-axis-tick-value]:fill-muted-foreground";

function usd(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function pct(value: number): string {
  return `${value.toFixed(2)}%`;
}

function parseIds(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (id) seen.add(id);
  }
  return [...seen];
}

function poolKey(pool: Pool): string {
  return pool.poolId ?? pool.id;
}

interface MetricRow {
  key: string;
  label: string;
  value: (pool: Pool) => number;
  format: (value: number) => string;
  better: "high" | "low";
}

const METRICS: MetricRow[] = [
  {
    key: "apy",
    label: "APY (now)",
    value: (p) => p.apy.current,
    format: pct,
    better: "high",
  },
  {
    key: "apy7d",
    label: "APY 7d avg",
    value: (p) => p.apy.day7Avg,
    format: pct,
    better: "high",
  },
  {
    key: "apy30d",
    label: "APY 30d avg",
    value: (p) => p.apy.day30Avg,
    format: pct,
    better: "high",
  },
  {
    key: "tvl",
    label: "TVL",
    value: (p) => p.stats.tvl,
    format: usd,
    better: "high",
  },
  {
    key: "volume",
    label: "24h volume",
    value: (p) => p.stats.volume24h,
    format: usd,
    better: "high",
  },
  {
    key: "fees",
    label: "Est. 24h fees",
    value: (p) => p.stats.fees24h,
    format: usd,
    better: "high",
  },
];

function bestIndex(values: number[], better: "high" | "low"): number {
  if (values.length < 2 || new Set(values).size < 2) return -1;
  const target = better === "high" ? Math.max(...values) : Math.min(...values);
  return values.indexOf(target);
}

function HistoryTooltip({
  active,
  payload,
  label,
  names,
}: TooltipProps<ValueType, NameType> & { names: string[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground">
      <p className="mb-1 font-mono text-muted-foreground">{label}</p>
      {payload.map((entry) => {
        const idx = Number(String(entry.dataKey).slice(1));
        return (
          <p key={String(entry.dataKey)} className="flex items-center gap-2">
            <span
              className={cn("h-2 w-2 rounded-full", SERIES[idx]?.dot)}
              aria-hidden
            />
            <span className="max-w-[10rem] truncate">{names[idx]}</span>
            <span className="ml-auto pl-3 font-mono tabular-nums">
              {typeof entry.value === "number" ? pct(entry.value) : "—"}
            </span>
          </p>
        );
      })}
    </div>
  );
}

interface HistoryChartProps {
  pools: Pool[];
  histories: LiveResult<PoolHistoryPoint[]>[];
}

function HistoryChart({ pools, histories }: HistoryChartProps) {
  const names = pools.map((p) => p.name);
  const rows = new Map<string, Record<string, string | number>>();
  histories.forEach((history, i) => {
    for (const point of history.data.slice(-HISTORY_DAYS)) {
      const row = rows.get(point.date) ?? { date: point.date };
      row[`p${i}`] = point.apy;
      rows.set(point.date, row);
    }
  });
  const data = [...rows.values()].sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );
  const anyDemo = histories.some((h) => h.isDemo);
  const loading = histories.some((h) => h.isLoading);
  const failed = histories
    .map((h, i) => ({ h, pool: pools[i] }))
    .filter(({ h }) => h.isError);

  return (
    <section
      data-ocid="comparison.history_panel"
      className="rounded-lg border border-border bg-card p-4"
      aria-labelledby="history-heading"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2
            id="history-heading"
            className="font-display text-sm font-semibold uppercase tracking-wider"
          >
            APY history · last {HISTORY_DAYS} days
          </h2>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {pools.map((pool, i) => (
              <li key={pool.id} className="flex items-center gap-1.5">
                <span
                  className={cn("h-2 w-2 rounded-full", SERIES[i].dot)}
                  aria-hidden
                />
                <span className="max-w-[12rem] truncate">{pool.name}</span>
              </li>
            ))}
          </ul>
        </div>
        {anyDemo && <DemoBadge />}
      </div>

      {failed.map(({ h, pool }) => (
        <div
          key={pool.id}
          data-ocid="comparison.history_error"
          role="alert"
          className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs"
        >
          <span>
            Live history for <strong>{pool.name}</strong> could not be loaded
            {h.isDemo ? "; showing demo history where available." : "."}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-ocid="comparison.history_retry_button"
            onClick={h.refetch}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Retry
          </Button>
        </div>
      ))}

      {loading && data.length === 0 ? (
        <LoadingState label="Loading APY history…" />
      ) : data.length === 0 ? (
        <EmptyState
          title="No APY history available"
          description="The data source returned no daily history for the selected pools."
        />
      ) : (
        <div className={cn("h-72 w-full", CHART_STYLE)}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: string) => v.slice(5)}
                minTickGap={28}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                width={52}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip
                content={(props) => <HistoryTooltip {...props} names={names} />}
              />
              {pools.map((pool, i) => (
                <Line
                  key={pool.id}
                  type="monotone"
                  dataKey={`p${i}`}
                  className={SERIES[i].line}
                  strokeWidth={2}
                  dot={false}
                  activeDot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

export function PoolComparisonPage() {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const pools = usePools();
  const watchlist = useWatchlist();
  const addWatch = useAddToWatchlist();
  const removeWatch = useRemoveFromWatchlist();

  const rawParam = search.pools == null ? "" : String(search.pools);
  const requested = useMemo(() => parseIds(rawParam), [rawParam]);
  const selectedIds = useMemo(() => requested.slice(0, MAX_POOLS), [requested]);
  const ignoredIds = useMemo(() => requested.slice(MAX_POOLS), [requested]);

  const setSelection = useCallback(
    (next: string[]) => {
      void navigate({
        to: "/pool-comparison",
        search: { pools: next.length > 0 ? next.join(",") : undefined },
        replace: true,
      });
    },
    [navigate],
  );

  // A selection made elsewhere (Pools page) moves into the URL once on arrival.
  const adopted = useRef(false);
  useEffect(() => {
    if (adopted.current) return;
    adopted.current = true;
    if (selectedIds.length > 0) return;
    const stored = useDefiStore.getState().selectedPoolIds;
    if (stored.length > 0) setSelection(stored.slice(0, MAX_POOLS));
  }, [selectedIds, setSelection]);

  // The URL is the source of truth; mirror it into the store.
  useEffect(() => {
    useDefiStore.setState({ selectedPoolIds: selectedIds });
  }, [selectedIds]);

  const { selectedPools, missingIds } = useMemo(() => {
    const found: Pool[] = [];
    const missing: string[] = [];
    for (const id of selectedIds) {
      const match = pools.data.find((p) => p.id === id || p.poolId === id);
      if (match) found.push(match);
      else missing.push(id);
    }
    return { selectedPools: found, missingIds: missing };
  }, [selectedIds, pools.data]);

  const showMissing = !pools.isLoading && missingIds.length > 0;

  const h0 = usePoolHistory(selectedPools[0]?.id);
  const h1 = usePoolHistory(selectedPools[1]?.id);
  const h2 = usePoolHistory(selectedPools[2]?.id);
  const h3 = usePoolHistory(selectedPools[3]?.id);
  const histories = [h0, h1, h2, h3].slice(0, selectedPools.length);

  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const copyTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pools.data
      .filter((p) => !selectedIds.includes(p.id))
      .filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.chain.toLowerCase().includes(q) ||
          (p.project ?? p.protocol).toLowerCase().includes(q),
      )
      .sort((a, b) => b.stats.tvl - a.stats.tvl)
      .slice(0, 8);
  }, [pools.data, selectedIds, query]);

  const watchedKeys = useMemo(
    () => new Set((watchlist.data ?? []).map((entry) => entry.poolId)),
    [watchlist.data],
  );

  const isFull = selectedIds.length >= MAX_POOLS;
  const watchBusy = addWatch.isPending || removeWatch.isPending;

  function addPool(pool: Pool) {
    if (isFull) return;
    setSelection([...selectedIds, pool.id]);
    setQuery("");
  }

  function removeId(id: string) {
    setSelection(selectedIds.filter((x) => x !== id));
  }

  function dropMissing() {
    setSelection(selectedIds.filter((id) => !missingIds.includes(id)));
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast.success("Comparison link copied");
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 3000);
    } catch {
      toast.error("Could not copy. Copy the address from the browser bar.");
    }
  }

  function toggleWatch(pool: Pool) {
    if (!isAuthenticated) {
      setShowSignIn(true);
      return;
    }
    const key = poolKey(pool);
    if (watchedKeys.has(key)) {
      removeWatch.mutate(key, {
        onSuccess: () => toast.info(`${pool.name} removed from watchlist`),
        onError: () => toast.error("Could not update the watchlist"),
      });
      return;
    }
    addWatch.mutate(
      {
        poolId: key,
        displayName: pool.name,
        chain: pool.chain,
        symbol:
          [pool.token0, pool.token1].filter((t) => t && t !== "—").join("-") ||
          pool.name,
        project: pool.project ?? pool.protocol,
      },
      {
        onSuccess: () => toast.success(`${pool.name} added to watchlist`),
        onError: (error) => toast.error(error.message),
      },
    );
  }

  function exportRows() {
    return selectedPools.map((pool, i) => {
      const risk = computeRiskScore(pool, histories[i]?.data);
      return { pool, risk };
    });
  }

  function handleExportCSV() {
    const source = pools.isDemo ? "Demo data" : "Live (DefiLlama)";
    const ok = exportCSV(
      `pool-comparison-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        "Pool",
        "Project",
        "Chain",
        "TVL (USD)",
        "24h volume (USD)",
        "Est. 24h fees (USD)",
        "APY now (%)",
        "APY 7d avg (%)",
        "APY 30d avg (%)",
        "Risk score (1-10)",
        "Risk level",
        "Pool ID",
        "Data source",
      ],
      exportRows().map(({ pool, risk }) => [
        pool.name,
        pool.project ?? pool.protocol,
        pool.chain,
        pool.stats.tvl.toFixed(0),
        pool.stats.volume24h.toFixed(0),
        pool.stats.fees24h.toFixed(0),
        pool.apy.current.toFixed(2),
        pool.apy.day7Avg.toFixed(2),
        pool.apy.day30Avg.toFixed(2),
        String(risk.score),
        risk.level,
        poolKey(pool),
        source,
      ]),
    );
    if (ok) toast.success("Comparison exported to CSV");
    else toast.error("CSV export failed");
  }

  function handleExportPDF() {
    const rows = exportRows();
    const best = [...selectedPools].sort(
      (a, b) => b.apy.current - a.apy.current,
    )[0];
    const totalTvl = selectedPools.reduce((sum, p) => sum + p.stats.tvl, 0);
    const ok = exportPDF({
      title: `Pool Comparison Report${pools.isDemo ? " (Demo data)" : ""}`,
      date: new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      subtitle: "Pool Comparison Report",
      metaLabel: "Data source:",
      walletAddress: pools.isDemo ? "Demo data" : "Live data via DefiLlama",
      summary: [
        { label: "Pools compared", value: String(selectedPools.length) },
        { label: "Highest APY", value: best ? pct(best.apy.current) : "N/A" },
        { label: "Combined TVL", value: usd(totalTvl) },
        { label: "Data", value: pools.isDemo ? "Demo" : "Live" },
      ],
      sections: rows.map(({ pool, risk }) => ({
        title: `${pool.name} · risk ${risk.score}/10 (${risk.level})`,
        rows: risk.factors.map((f) => ({
          label: f.label,
          value: `${f.impact} · ${f.explanation}`,
        })),
      })),
      tableHeaders: [
        "Pool",
        "Chain",
        "TVL",
        "Volume 24h",
        "Fees 24h",
        "APY",
        "APY 7d",
        "APY 30d",
        "Risk",
      ],
      tableRows: rows.map(({ pool, risk }) => [
        pool.name,
        pool.chain,
        usd(pool.stats.tvl),
        usd(pool.stats.volume24h),
        usd(pool.stats.fees24h),
        pct(pool.apy.current),
        pct(pool.apy.day7Avg),
        pct(pool.apy.day30Avg),
        `${risk.score}/10`,
      ]),
    });
    if (ok) toast.success("Comparison report opened for printing");
    else toast.error("Allow pop-ups for this site to generate the PDF report");
  }

  const hasSelection = selectedPools.length > 0;
  const riskScores = selectedPools.map(
    (pool, i) => computeRiskScore(pool, histories[i]?.data).score,
  );

  return (
    <div className="space-y-6 px-4 py-6 md:px-6" data-ocid="comparison.page">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl font-bold tracking-tight">
              Pool Comparison
            </h1>
            {pools.isDemo && <DemoBadge />}
          </div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Compare up to {MAX_POOLS} pools side by side · selection lives in
            the page link
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-ocid="comparison.copy_link_button"
            onClick={() => void copyLink()}
            disabled={!hasSelection && selectedIds.length === 0}
          >
            {copied ? (
              <Check className="mr-1.5 h-4 w-4 text-success" aria-hidden />
            ) : (
              <Link2 className="mr-1.5 h-4 w-4" aria-hidden />
            )}
            {copied ? "Link copied" : "Copy link"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-ocid="comparison.export_csv_button"
            onClick={handleExportCSV}
            disabled={!hasSelection}
          >
            <FileText className="mr-1.5 h-4 w-4" aria-hidden />
            Export CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-ocid="comparison.export_pdf_button"
            onClick={handleExportPDF}
            disabled={!hasSelection}
          >
            <FileText className="mr-1.5 h-4 w-4" aria-hidden />
            Export PDF
          </Button>
        </div>
      </header>

      <output className="sr-only" aria-live="polite">
        {copied ? "Comparison link copied to clipboard" : ""}
      </output>

      {pools.isError && (
        <ErrorState
          title="Live pool data unavailable"
          message={
            pools.isDemo
              ? "DefiLlama could not be reached. Demo pools are shown instead and are labelled as demo data."
              : "The latest refresh failed. Showing the most recently loaded pools."
          }
          onRetry={pools.refetch}
        />
      )}

      {showMissing && (
        <div
          data-ocid="comparison.missing_ids"
          role="alert"
          className="flex flex-col gap-3 rounded-lg border border-warning/50 bg-warning/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <TriangleAlert
              className="mt-0.5 h-4 w-4 shrink-0 text-warning"
              aria-hidden
            />
            <p className="min-w-0 break-words">
              {missingIds.length === 1
                ? "This pool identifier from the link was not found in the loaded pool list: "
                : "These pool identifiers from the link were not found in the loaded pool list: "}
              {missingIds.map((id, i) => (
                <span key={id}>
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                    {id}
                  </code>
                  {i < missingIds.length - 1 ? ", " : ""}
                </span>
              ))}
              .{" "}
              {hasSelection
                ? "The remaining pools are shown below."
                : "Search below to pick other pools."}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-ocid="comparison.remove_missing_button"
            onClick={dropMissing}
          >
            Remove from link
          </Button>
        </div>
      )}

      {ignoredIds.length > 0 && (
        <p
          data-ocid="comparison.ignored_ids"
          className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground"
        >
          Only the first {MAX_POOLS} pools in the link are compared. Ignored:{" "}
          <span className="font-mono">{ignoredIds.join(", ")}</span>
        </p>
      )}

      {showSignIn && !isAuthenticated && (
        <SignInPrompt feature="your pool watchlist" />
      )}

      {pools.isLoading ? (
        <LoadingState label="Loading live pools from DefiLlama…" />
      ) : pools.data.length === 0 ? (
        <EmptyState
          title="No pools available"
          description="The data source returned no pools to compare."
          action={
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-ocid="comparison.reload_button"
              onClick={pools.refetch}
            >
              <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />
              Reload pools
            </Button>
          }
        />
      ) : (
        <>
          <section
            data-ocid="comparison.picker"
            className="space-y-3 rounded-lg border border-border bg-card p-4"
            aria-labelledby="picker-heading"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2
                id="picker-heading"
                className="font-display text-sm font-semibold uppercase tracking-wider"
              >
                Add pools ({selectedIds.length}/{MAX_POOLS})
              </h2>
              {hasSelection && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  data-ocid="comparison.clear_button"
                  onClick={() => setSelection([])}
                >
                  Clear selection
                </Button>
              )}
            </div>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by token pair, project or chain"
                aria-label="Search pools to compare"
                data-ocid="comparison.search_input"
                className="pl-9"
              />
            </div>
            {isFull && (
              <p className="text-xs text-muted-foreground">
                Four pools selected. Remove one to add another.
              </p>
            )}
            {candidates.length === 0 ? (
              <p
                data-ocid="comparison.no_results"
                className="py-2 text-sm text-muted-foreground"
              >
                No pools match “{query}”.
              </p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {candidates.map((pool, i) => (
                  <li key={pool.id}>
                    <button
                      type="button"
                      data-ocid={`comparison.candidate.${i + 1}`}
                      onClick={() => addPool(pool)}
                      disabled={isFull}
                      className="flex w-full items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-left text-sm transition-colors hover:border-primary hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Plus
                        className="h-4 w-4 shrink-0 text-primary"
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {pool.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {pool.project ?? pool.protocol} · {pool.chain}
                        </span>
                      </span>
                      <span className="text-right font-mono text-xs tabular-nums">
                        <span className="block text-accent">
                          {pct(pool.apy.current)}
                        </span>
                        <span className="block text-muted-foreground">
                          {usd(pool.stats.tvl)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {!hasSelection ? (
            <EmptyState
              title={
                selectedIds.length > 0
                  ? "None of the linked pools could be found"
                  : "No pools selected"
              }
              description="Pick two to four pools above to compare APY, TVL, volume, fees, risk and APY history."
            />
          ) : (
            <>
              <section
                data-ocid="comparison.table"
                className="overflow-x-auto rounded-lg border border-border bg-card"
                aria-label="Pool comparison table"
              >
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th
                        scope="col"
                        className="sticky left-0 w-32 bg-muted p-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                      >
                        Metric
                      </th>
                      {selectedPools.map((pool, i) => {
                        const watched = watchedKeys.has(poolKey(pool));
                        return (
                          <th
                            key={pool.id}
                            scope="col"
                            className="min-w-[180px] p-3 text-left align-top font-normal"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={cn(
                                      "h-2.5 w-2.5 shrink-0 rounded-full",
                                      SERIES[i].dot,
                                    )}
                                    aria-hidden
                                  />
                                  <span className="truncate font-display font-semibold">
                                    {pool.name}
                                  </span>
                                </div>
                                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                  {pool.project ?? pool.protocol} · {pool.chain}
                                </p>
                              </div>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 shrink-0"
                                aria-label={`Remove ${pool.name} from comparison`}
                                data-ocid={`comparison.remove_button.${i + 1}`}
                                onClick={() => removeId(pool.id)}
                              >
                                <X className="h-4 w-4" aria-hidden />
                              </Button>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant={watched ? "secondary" : "outline"}
                              className="mt-2"
                              aria-pressed={watched}
                              data-ocid={`comparison.watch_button.${i + 1}`}
                              onClick={() => toggleWatch(pool)}
                              disabled={watchBusy || pools.isDemo}
                              title={
                                pools.isDemo
                                  ? "Demo pools cannot be saved to a watchlist"
                                  : undefined
                              }
                            >
                              <Star
                                className={cn(
                                  "mr-1.5 h-3.5 w-3.5",
                                  watched && "fill-current text-accent",
                                )}
                                aria-hidden
                              />
                              {watched ? "Watching" : "Watch"}
                            </Button>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {METRICS.map((metric) => {
                      const values = selectedPools.map(metric.value);
                      const best = bestIndex(values, metric.better);
                      return (
                        <tr
                          key={metric.key}
                          data-ocid={`comparison.row.${metric.key}`}
                          className="border-b border-border/60"
                        >
                          <th
                            scope="row"
                            className="sticky left-0 bg-card p-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
                          >
                            {metric.label}
                          </th>
                          {values.map((value, i) => (
                            <td
                              key={selectedPools[i].id}
                              className={cn(
                                "p-3 font-mono tabular-nums",
                                i === best && "font-semibold text-accent",
                              )}
                            >
                              {metric.format(value)}
                              {i === best && (
                                <span className="ml-2 text-[10px] uppercase tracking-wider">
                                  best
                                </span>
                              )}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                    <tr data-ocid="comparison.row.risk">
                      <th
                        scope="row"
                        className="sticky left-0 bg-card p-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
                      >
                        Risk score
                      </th>
                      {selectedPools.map((pool, i) => (
                        <td key={pool.id} className="p-3">
                          <RiskBadge pool={pool} history={histories[i]?.data} />
                          {i === bestIndex(riskScores, "low") && (
                            <span className="ml-2 text-[10px] uppercase tracking-wider text-accent">
                              lowest
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </section>
              <p className="text-xs text-muted-foreground">
                Hover or focus a risk badge to see the factors behind the score.
                Fees are estimated from 24h volume and the pool fee tier.
              </p>

              <HistoryChart pools={selectedPools} histories={histories} />
            </>
          )}
        </>
      )}
    </div>
  );
}
