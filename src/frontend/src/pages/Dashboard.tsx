import { EmptyState, ErrorState, LoadingState } from "@/components/DataStates";
import { DemoBadge } from "@/components/DemoBadge";
import { ProtocolBadge } from "@/components/ProtocolBadge";
import { RiskBadge } from "@/components/RiskBadge";
import { SignInPrompt } from "@/components/SignInPrompt";
import { Button } from "@/components/ui/button";
import { PROTOCOL_METADATA } from "@/data/mockData";
import { useAuth } from "@/hooks/useAuth";
import { usePoolHistory, usePools, useTokenPrices } from "@/hooks/useLiveData";
import { usePositions } from "@/hooks/useQueries";
import { cn } from "@/lib/utils";
import type { Pool } from "@/types/defi";
import { toast } from "@/utils/toast";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowUpRight,
  BarChart2,
  Check,
  ChevronDown,
  Coins,
  Copy,
  Droplets,
  HandCoins,
  LayoutDashboard,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Trophy,
  Waves,
} from "lucide-react";
import {
  type ComponentType,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ─── Constants and helpers ───────────────────────────────────────────────────

const PROTOCOL_STYLE: Record<string, { fill: string; bg: string }> = {
  uniswap: { fill: "fill-chart-5", bg: "bg-chart-5" },
  pancakeswap: { fill: "fill-chart-4", bg: "bg-chart-4" },
  raydium: { fill: "fill-chart-3", bg: "bg-chart-3" },
  icp: { fill: "fill-chart-1", bg: "bg-chart-1" },
};
const FALLBACK_STYLE = { fill: "fill-chart-2", bg: "bg-chart-2" };

const TICKERS = [
  { id: "bitcoin", symbol: "BTC" },
  { id: "ethereum", symbol: "ETH" },
  { id: "solana", symbol: "SOL" },
  { id: "binancecoin", symbol: "BNB" },
  { id: "internet-computer", symbol: "ICP" },
];
const TICKER_IDS = TICKERS.map((t) => t.id);

const DONATION_ADDRESSES = [
  {
    network: "Ethereum",
    symbol: "ETH",
    address: "0xF9b0322aF671b9a0Df371dE59784602df3967628",
    icon: "Ξ",
  },
  {
    network: "Bitcoin",
    symbol: "BTC",
    address: "bc1qfmvw6eqh5tgs28qep786prr9gea7gxkhe4vhwt",
    icon: "₿",
  },
  {
    network: "Internet Computer",
    symbol: "ICP",
    address: "8048e0925e9d5b5c2a21379e4cc0d2a523f883429409318ece63ab913b46a33d",
    icon: "∞",
  },
] as const;

const LABEL_CLASS =
  "text-[10px] font-bold uppercase tracking-[2px] font-mono text-muted-foreground";

function formatUSD(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function formatPrice(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n >= 100 ? 0 : 2,
  });
}

function signed(n: number, digits = 1): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

function trendClass(n: number): string {
  return n >= 0 ? "text-accent" : "text-destructive";
}

/** Entry amount grown at the pool's current APY since the entry date. */
function estimateValue(
  amountUsd: number,
  entryNs: bigint,
  apy: number,
): number {
  const entryMs = Number(entryNs / 1_000_000n);
  const years = Math.max(0, Date.now() - entryMs) / (365 * 86_400_000);
  return amountUsd * (1 + (apy / 100) * years);
}

// ─── Shared building blocks ──────────────────────────────────────────────────

function Panel({
  children,
  className,
  ocid,
}: { children: ReactNode; className?: string; ocid?: string }) {
  return (
    <section
      data-ocid={ocid}
      className={cn("glass-card rounded-xl overflow-hidden", className)}
    >
      {children}
    </section>
  );
}

function SectionHeading({
  icon: Icon,
  label,
  badge,
  action,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  badge?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Icon className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
      <h2 className={LABEL_CLASS}>{label}</h2>
      {badge}
      <div className="ml-1 hidden h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent sm:block" />
      {action}
    </div>
  );
}

function ViewAllLink({ to, ocid }: { to: string; ocid: string }) {
  return (
    <Link
      to={to}
      data-ocid={ocid}
      className="ml-auto flex items-center gap-0.5 font-mono text-xs text-primary transition-smooth hover:underline"
    >
      View all <ArrowUpRight className="h-3 w-3" />
    </Link>
  );
}

interface ChartTipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ value?: number | string; name?: string | number }>;
  label?: string | number;
  seriesName: string;
  format: (value: number) => string;
}

function ChartTip({
  active,
  payload,
  label,
  seriesName,
  format,
}: ChartTipProps) {
  const item = payload?.[0];
  if (!active || !item || typeof item.value !== "number") return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-elevated">
      {label !== undefined && (
        <p className="mb-0.5 font-mono text-muted-foreground">{label}</p>
      )}
      <p className="font-mono font-semibold">
        {item.name ?? seriesName}: {format(item.value)}
      </p>
    </div>
  );
}

interface KPICardProps {
  label: string;
  value: string;
  sub: ReactNode;
  icon: ComponentType<{ className?: string }>;
  ocid: string;
  tone: "primary" | "accent" | "neutral";
}

function KPICard({ label, value, sub, icon: Icon, ocid, tone }: KPICardProps) {
  return (
    <Panel ocid={ocid} className="card-hover">
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className={LABEL_CLASS}>{label}</p>
          <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
            <Icon className="h-3.5 w-3.5" />
          </span>
        </div>
        <p
          className={cn(
            "font-mono text-2xl font-bold tracking-tight",
            tone === "primary" && "primary-glow",
            tone === "accent" && "accent-glow",
            tone === "neutral" && "text-foreground",
          )}
        >
          {value}
        </p>
        <div className="mt-1.5 text-xs text-muted-foreground">{sub}</div>
      </div>
    </Panel>
  );
}

function KPISkeletons() {
  return Array.from({ length: 4 }, (_, i) => `kpi-skeleton-${i}`).map((id) => (
    <div key={id} className="skeleton h-28" />
  ));
}

// ─── Rows ────────────────────────────────────────────────────────────────────

function TopAPYPoolRow({
  pool,
  rank,
  history,
}: {
  pool: Pool;
  rank: number;
  history?: Parameters<typeof RiskBadge>[0]["history"];
}) {
  const change = pool.apy.day1Change;
  return (
    <div
      data-ocid={`dashboard.top_apy.item.${rank}`}
      className="flex items-center gap-3 rounded-lg border-b border-border/40 px-3 py-2.5 transition-smooth hover:bg-muted/50"
    >
      <span
        className={cn(
          "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border font-mono text-[10px] font-bold",
          rank <= 2
            ? "border-primary/40 bg-primary/15 text-primary"
            : "border-border bg-muted text-muted-foreground",
        )}
      >
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {pool.name}
        </p>
        <div className="mt-0.5 flex items-center gap-1.5">
          <ProtocolBadge protocol={pool.protocol} size="sm" />
          <span className="truncate text-xs text-muted-foreground">
            {pool.chain}
          </span>
        </div>
      </div>
      <div className="flex-shrink-0 text-right">
        <p className="accent-glow font-mono text-sm">
          {pool.apy.current.toFixed(1)}%
        </p>
        <p className={cn("font-mono text-xs", trendClass(change))}>
          {signed(change)}
        </p>
      </div>
      <div className="hidden flex-shrink-0 text-right sm:block">
        <p className="font-mono text-xs text-primary">
          {formatUSD(pool.stats.tvl)}
        </p>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          TVL
        </p>
      </div>
      <RiskBadge pool={pool} history={history} className="flex-shrink-0" />
    </div>
  );
}

function MoverColumn({
  title,
  pools,
  type,
}: { title: string; pools: Pool[]; type: "gainer" | "loser" }) {
  const Icon = type === "gainer" ? TrendingUp : TrendingDown;
  return (
    <div>
      <p
        className={cn(
          "flex items-center gap-1 px-3 pb-1 font-mono text-[10px] font-bold uppercase tracking-[1.5px]",
          type === "gainer" ? "text-accent" : "text-destructive",
        )}
      >
        <Icon className="h-3 w-3" /> {title}
      </p>
      {pools.length === 0 && (
        <p className="px-3 py-2 text-xs text-muted-foreground">
          No {type === "gainer" ? "gainers" : "losers"} in the last 24h.
        </p>
      )}
      {pools.map((pool, i) => (
        <div
          key={pool.id}
          data-ocid={`dashboard.mover_${type}.${i + 1}`}
          className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 transition-smooth hover:bg-muted/50"
        >
          <div className="flex min-w-0 items-center gap-2">
            <ProtocolBadge protocol={pool.protocol} size="sm" />
            <span className="truncate text-sm font-medium text-foreground">
              {pool.name}
            </span>
          </div>
          <span
            className={cn(
              "flex-shrink-0 font-mono text-sm font-semibold",
              trendClass(pool.apy.day1Change),
            )}
          >
            {signed(pool.apy.day1Change)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Donation ────────────────────────────────────────────────────────────────

function DonationButton() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const handleCopy = useCallback(async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(address);
      toast.success("Address copied to clipboard");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Copy failed — please copy manually");
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={ref}
      className="relative inline-block"
      data-ocid="dashboard.donate.panel"
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-ocid="dashboard.donate.open_modal_button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="gap-2 border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
      >
        <HandCoins className="h-4 w-4" />
        Support / Donate
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </Button>
      {open && (
        <div
          data-ocid="dashboard.donate.dialog"
          className="absolute right-0 top-full z-50 mt-2 w-[min(90vw,360px)] space-y-3 rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-elevated"
        >
          <p className={LABEL_CLASS}>Choose a network to donate</p>
          {DONATION_ADDRESSES.map((item) => {
            const isCopied = copied === item.address;
            return (
              <div
                key={item.symbol}
                data-ocid={`dashboard.donate.${item.symbol.toLowerCase()}_row`}
                className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/40 p-3"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                    {item.icon}
                  </span>
                  <span className="text-sm font-semibold">{item.network}</span>
                  <span className="ml-auto rounded bg-primary/15 px-1.5 py-0.5 font-mono text-xs text-primary">
                    {item.symbol}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <code
                    className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground"
                    title={item.address}
                  >
                    {item.address}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    data-ocid={`dashboard.donate.${item.symbol.toLowerCase()}_copy`}
                    onClick={() => handleCopy(item.address)}
                    aria-label={`Copy ${item.symbol} address`}
                    className="h-7 w-7 flex-shrink-0"
                  >
                    {isCopied ? (
                      <Check className="h-3.5 w-3.5 text-accent" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
                {isCopied && (
                  <p
                    data-ocid={`dashboard.donate.${item.symbol.toLowerCase()}_success_state`}
                    className="font-mono text-xs font-medium text-accent"
                  >
                    ✓ Address copied!
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const pools = usePools();
  const prices = useTokenPrices(TICKER_IDS);
  const positions = usePositions();
  const { isAuthenticated, isInitializing } = useAuth();

  const topTvlPool = useMemo(
    () =>
      pools.data.reduce<Pool | undefined>(
        (best, p) => (!best || p.stats.tvl > best.stats.tvl ? p : best),
        undefined,
      ),
    [pools.data],
  );
  const history = usePoolHistory(topTvlPool?.poolId ?? topTvlPool?.id);

  const stats = useMemo(() => {
    const list = pools.data;
    if (list.length === 0) return null;
    const totalTVL = list.reduce((s, p) => s + p.stats.tvl, 0);
    const avgAPY = list.reduce((s, p) => s + p.apy.current, 0) / list.length;
    const avgChange =
      list.reduce((s, p) => s + p.apy.day1Change, 0) / list.length;
    const best = list.reduce((a, b) => (b.apy.current > a.apy.current ? b : a));
    const protocols = new Set(list.map((p) => p.protocol)).size;
    return { totalTVL, avgAPY, avgChange, best, protocols, count: list.length };
  }, [pools.data]);

  const tvlByProtocol = useMemo(() => {
    const totals = new Map<string, number>();
    for (const p of pools.data) {
      totals.set(p.protocol, (totals.get(p.protocol) ?? 0) + p.stats.tvl);
    }
    const sum = [...totals.values()].reduce((a, b) => a + b, 0);
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([proto, value]) => ({
        key: proto,
        name: PROTOCOL_METADATA[proto]?.name ?? proto,
        value,
        pct: sum > 0 ? (value / sum) * 100 : 0,
        style: PROTOCOL_STYLE[proto] ?? FALLBACK_STYLE,
      }));
  }, [pools.data]);

  const topAPYPools = useMemo(
    () =>
      [...pools.data].sort((a, b) => b.apy.current - a.apy.current).slice(0, 5),
    [pools.data],
  );
  const gainers = useMemo(
    () =>
      pools.data
        .filter((p) => p.apy.day1Change > 0)
        .sort((a, b) => b.apy.day1Change - a.apy.day1Change)
        .slice(0, 4),
    [pools.data],
  );
  const losers = useMemo(
    () =>
      pools.data
        .filter((p) => p.apy.day1Change < 0)
        .sort((a, b) => a.apy.day1Change - b.apy.day1Change)
        .slice(0, 4),
    [pools.data],
  );

  const chartData = useMemo(
    () => history.data.slice(-30).map((h) => ({ date: h.date, apy: h.apy })),
    [history.data],
  );

  const poolLookup = useMemo(() => {
    const map = new Map<string, Pool>();
    for (const p of pools.data) {
      map.set(p.id, p);
      if (p.poolId) map.set(p.poolId, p);
    }
    return map;
  }, [pools.data]);

  const positionRows = useMemo(
    () =>
      (positions.data ?? [])
        .map((pos) => {
          const pool = poolLookup.get(pos.poolId);
          const apy = pool?.apy.current ?? 0;
          return {
            pos,
            pool,
            estimated: estimateValue(pos.amountUsd, pos.entryTimestamp, apy),
          };
        })
        .sort((a, b) => b.estimated - a.estimated),
    [positions.data, poolLookup],
  );
  const positionsTotal = positionRows.reduce((s, r) => s + r.estimated, 0);

  const poolsEmpty =
    !pools.isLoading && !pools.isError && pools.data.length === 0;
  const poolsFailed = pools.isError && pools.data.length === 0;
  const demoBadge = pools.isDemo ? <DemoBadge /> : null;
  const positionsLoading =
    isInitializing ||
    (isAuthenticated && positions.data === undefined && !positions.isError);
  const priceRows = TICKERS.filter((t) => prices.data[t.id]);

  return (
    <div data-ocid="dashboard.page" className="space-y-6 p-4 md:p-6">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {pools.isDemo ? (
            <DemoBadge />
          ) : (
            <span className="live-badge">Live market data</span>
          )}
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Source: DefiLlama and CoinGecko public APIs
          </span>
        </div>
        <DonationButton />
      </div>

      {/* Fallback / failure banner */}
      {pools.isError && pools.data.length > 0 && (
        <div
          data-ocid="dashboard.demo_banner"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-warning/60 bg-warning/10 px-4 py-3 text-sm"
        >
          {pools.isDemo && <DemoBadge />}
          <span className="min-w-0 flex-1 text-foreground">
            {pools.isDemo
              ? "The live DefiLlama feed could not be reached, so every pool figure below is demo data."
              : "The latest DefiLlama refresh failed. Showing the last successfully loaded live data."}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-ocid="dashboard.demo_banner.retry_button"
            onClick={pools.refetch}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Retry live data
          </Button>
        </div>
      )}

      {/* Hero */}
      <div className="relative overflow-hidden rounded-xl border border-primary/25">
        <img
          src="/assets/generated/defi-dashboard-hero.dim_1600x900.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-top"
        />
        <div className="absolute inset-0 bg-background/85" />
        <div className="relative p-5 md:p-8">
          <div className="mb-2 flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4 text-primary" />
            <span className={LABEL_CLASS}>Overview</span>
          </div>
          <h1 className="mb-1.5 font-mono text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            DeFi Pool Analytics
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground md:text-base">
            Liquidity intelligence across Uniswap, PancakeSwap, Raydium &amp;
            ICP
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.keys(PROTOCOL_METADATA).map((p) => (
              <ProtocolBadge
                key={p}
                protocol={p as Pool["protocol"]}
                showChain
              />
            ))}
          </div>
        </div>
      </div>

      {poolsFailed && (
        <ErrorState
          title="Pool data unavailable"
          message="DefiLlama could not be reached. Check your connection and try again."
          onRetry={pools.refetch}
        />
      )}
      {poolsEmpty && (
        <EmptyState
          title="No pool data available"
          description="No pools matched the current filters from the data source."
          icon={<Droplets className="h-5 w-5" aria-hidden />}
        />
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        {pools.isLoading && <KPISkeletons />}
        {stats && (
          <>
            <KPICard
              ocid="dashboard.kpi.1"
              label="Tracked TVL"
              value={formatUSD(stats.totalTVL)}
              icon={Waves}
              tone="primary"
              sub={
                <span className="flex flex-wrap items-center gap-1.5">
                  across {stats.count} pools {demoBadge}
                </span>
              }
            />
            <KPICard
              ocid="dashboard.kpi.2"
              label="Pools tracked"
              value={String(stats.count)}
              icon={Droplets}
              tone="neutral"
              sub={`${stats.protocols} protocol groups`}
            />
            <KPICard
              ocid="dashboard.kpi.3"
              label="Average APY"
              value={`${stats.avgAPY.toFixed(1)}%`}
              icon={TrendingUp}
              tone="accent"
              sub={
                <span className={trendClass(stats.avgChange)}>
                  {signed(stats.avgChange)} avg 24h change
                </span>
              }
            />
            <KPICard
              ocid="dashboard.kpi.4"
              label="Best pool APY"
              value={`${stats.best.apy.current.toFixed(1)}%`}
              icon={Trophy}
              tone="accent"
              sub={<span className="block truncate">{stats.best.name}</span>}
            />
          </>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-3">
        <Panel ocid="dashboard.apy_chart.panel">
          <div className="space-y-0.5 p-4 pb-2">
            <SectionHeading
              icon={Activity}
              label="APY trend · 30 days"
              badge={history.isDemo ? <DemoBadge /> : null}
            />
            <p className="truncate text-xs text-muted-foreground">
              {topTvlPool
                ? `${topTvlPool.name} · largest pool by TVL (${formatUSD(topTvlPool.stats.tvl)})`
                : "Largest pool by TVL"}
            </p>
          </div>
          <div className="px-2 pb-4">
            {(pools.isLoading || history.isLoading) && (
              <LoadingState label="Loading APY history…" className="m-2 py-8" />
            )}
            {!pools.isLoading &&
              history.isError &&
              history.data.length === 0 && (
                <ErrorState
                  title="APY history unavailable"
                  onRetry={history.refetch}
                  className="m-2 py-6"
                />
              )}
            {!pools.isLoading &&
              !history.isLoading &&
              !history.isError &&
              chartData.length < 2 && (
                <EmptyState
                  title="No APY history yet"
                  description="This pool has no daily history to chart."
                  className="m-2 py-8"
                />
              )}
            {chartData.length >= 2 && (
              <div className="text-primary">
                <ResponsiveContainer width="100%" height={170}>
                  <AreaChart
                    data={chartData}
                    margin={{ top: 4, right: 8, bottom: 0, left: 8 }}
                  >
                    <defs>
                      <linearGradient id="apyGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor="currentColor"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="currentColor"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      minTickGap={36}
                      tick={{
                        className:
                          "fill-muted-foreground font-mono text-[10px]",
                      }}
                    />
                    <YAxis hide domain={["auto", "auto"]} />
                    <Tooltip
                      content={
                        <ChartTip
                          seriesName="APY"
                          format={(v) => `${v.toFixed(2)}%`}
                        />
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey="apy"
                      stroke="currentColor"
                      strokeWidth={2}
                      fill="url(#apyGrad)"
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </Panel>

        <Panel ocid="dashboard.tvl_chart.panel">
          <div className="space-y-0.5 p-4 pb-2">
            <SectionHeading
              icon={BarChart2}
              label="TVL by protocol"
              badge={demoBadge}
            />
            <p className="text-xs text-muted-foreground">
              Share of tracked liquidity
            </p>
          </div>
          <div className="px-4 pb-4">
            {pools.isLoading && (
              <LoadingState label="Loading TVL…" className="py-8" />
            )}
            {tvlByProtocol.length > 0 && (
              <>
                <ResponsiveContainer width="100%" height={130}>
                  <PieChart>
                    <Pie
                      data={tvlByProtocol}
                      cx="50%"
                      cy="50%"
                      innerRadius={38}
                      outerRadius={58}
                      paddingAngle={3}
                      dataKey="value"
                      nameKey="name"
                      strokeWidth={0}
                    >
                      {tvlByProtocol.map((entry) => (
                        <Cell key={entry.key} className={entry.style.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={<ChartTip seriesName="TVL" format={formatUSD} />}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                  {tvlByProtocol.map((entry) => (
                    <li
                      key={entry.key}
                      className="flex min-w-0 items-center gap-2"
                    >
                      <span
                        className={cn(
                          "h-2 w-2 flex-shrink-0 rounded-full",
                          entry.style.bg,
                        )}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-foreground">
                          {entry.name}
                        </p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {entry.pct.toFixed(1)}% · {formatUSD(entry.value)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </Panel>

        <Panel ocid="dashboard.prices.panel">
          <div className="space-y-0.5 p-4 pb-2">
            <SectionHeading
              icon={Coins}
              label="Token prices"
              badge={prices.isDemo ? <DemoBadge /> : null}
            />
            <p className="text-xs text-muted-foreground">USD, 24h change</p>
          </div>
          <div className="px-2 pb-3">
            {prices.isLoading && (
              <LoadingState label="Loading prices…" className="m-2 py-8" />
            )}
            {prices.isError && priceRows.length === 0 && (
              <ErrorState
                title="Prices unavailable"
                onRetry={prices.refetch}
                className="m-2 py-6"
              />
            )}
            {priceRows.length > 0 && (
              <ul data-ocid="dashboard.prices.list">
                {priceRows.map((t, i) => {
                  const price = prices.data[t.id];
                  return (
                    <li
                      key={t.id}
                      data-ocid={`dashboard.prices.item.${i + 1}`}
                      className="flex items-center justify-between rounded-lg px-3 py-2 transition-smooth hover:bg-muted/50"
                    >
                      <span className="font-mono text-sm font-semibold text-foreground">
                        {t.symbol}
                      </span>
                      <span className="text-right">
                        <span className="block font-mono text-sm text-foreground">
                          {formatPrice(price.usd)}
                        </span>
                        <span
                          className={cn(
                            "block font-mono text-xs",
                            trendClass(price.change24h),
                          )}
                        >
                          {signed(price.change24h, 2)}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Panel>
      </div>

      {/* Top APY + movers */}
      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-2">
        <Panel ocid="dashboard.top_apy.panel">
          <div className="p-4 pb-2">
            <SectionHeading
              icon={Trophy}
              label="Top 5 by APY"
              badge={demoBadge}
              action={
                <ViewAllLink
                  to="/pools"
                  ocid="dashboard.top_apy.view_all_link"
                />
              }
            />
          </div>
          <div className="px-2 pb-3">
            {pools.isLoading && (
              <LoadingState label="Loading pools…" className="m-2 py-8" />
            )}
            {topAPYPools.length > 0 && (
              <div data-ocid="dashboard.top_apy.list">
                {topAPYPools.map((pool, i) => (
                  <TopAPYPoolRow
                    key={pool.id}
                    pool={pool}
                    rank={i + 1}
                    history={
                      pool.id === topTvlPool?.id ? history.data : undefined
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </Panel>

        <Panel ocid="dashboard.movers.panel">
          <div className="p-4 pb-2">
            <SectionHeading
              icon={Activity}
              label="Biggest movers · 24h APY"
              badge={demoBadge}
            />
          </div>
          <div className="px-2 pb-3">
            {pools.isLoading && (
              <LoadingState label="Loading movers…" className="m-2 py-8" />
            )}
            {pools.data.length > 0 && (
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                <MoverColumn
                  title="Top gainers"
                  pools={gainers}
                  type="gainer"
                />
                <MoverColumn title="Top losers" pools={losers} type="loser" />
              </div>
            )}
          </div>
        </Panel>
      </div>

      {/* Positions preview */}
      <Panel ocid="dashboard.positions.panel">
        <div className="space-y-1 p-4 pb-2">
          <SectionHeading
            icon={Activity}
            label="My positions"
            badge={
              isAuthenticated && positionRows.length > 0 ? demoBadge : null
            }
            action={
              <ViewAllLink
                to="/position-tracker"
                ocid="dashboard.positions.view_all_link"
              />
            }
          />
          {isAuthenticated && positionRows.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Estimated total{" "}
              <span className="font-mono font-semibold text-primary">
                {formatUSD(positionsTotal)}
              </span>{" "}
              across {positionRows.length} saved position
              {positionRows.length === 1 ? "" : "s"}. Estimates grow the entry
              amount at each pool&apos;s current APY.
            </p>
          )}
        </div>
        <div className="space-y-2 p-4 pt-2">
          {!isInitializing && !isAuthenticated && (
            <SignInPrompt feature="your positions" />
          )}
          {isAuthenticated && positionsLoading && (
            <LoadingState label="Loading your positions…" className="py-8" />
          )}
          {isInitializing && (
            <LoadingState label="Checking your session…" className="py-8" />
          )}
          {isAuthenticated && positions.isError && (
            <ErrorState
              title="Could not load your positions"
              onRetry={() => {
                void positions.refetch();
              }}
            />
          )}
          {isAuthenticated &&
            !positionsLoading &&
            !positions.isError &&
            positionRows.length === 0 && (
              <EmptyState
                title="No saved positions yet"
                description="Add a position in the tracker to see its estimated value here."
                icon={<Droplets className="h-5 w-5" aria-hidden />}
                action={
                  <Button
                    asChild
                    size="sm"
                    data-ocid="dashboard.positions.add_button"
                  >
                    <Link to="/position-tracker">Add a position</Link>
                  </Button>
                }
              />
            )}
          {isAuthenticated &&
            positionRows.slice(0, 3).map(({ pos, pool, estimated }, i) => {
              const gain = estimated - pos.amountUsd;
              return (
                <div
                  key={pos.id.toString()}
                  data-ocid={`dashboard.position.${i + 1}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3 transition-smooth hover:border-primary/40"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {pool && (
                      <ProtocolBadge protocol={pool.protocol} size="sm" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {pos.displayName}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {pos.symbol}
                        {pool
                          ? ` · ${pool.apy.current.toFixed(1)}% APY`
                          : " · pool not in feed"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-5 text-right">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                        Invested
                      </p>
                      <p className="font-mono text-sm text-foreground">
                        {formatUSD(pos.amountUsd)}
                      </p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                        Est. value
                      </p>
                      <p className="primary-glow font-mono text-sm">
                        {formatUSD(estimated)}
                      </p>
                    </div>
                    <div className="hidden sm:block">
                      <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                        Est. yield
                      </p>
                      <p className={cn("font-mono text-sm", trendClass(gain))}>
                        {gain >= 0 ? "+" : ""}
                        {formatUSD(gain)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </Panel>
    </div>
  );
}

export default DashboardPage;
