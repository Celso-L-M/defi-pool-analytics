import { EmptyState, ErrorState, LoadingState } from "@/components/DataStates";
import { DemoBadge } from "@/components/DemoBadge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDefiStore } from "@/store/useDefiStore";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ─── Types ───────────────────────────────────────────────────────────────────

type PerpSymbol = "BTCUSDT" | "ETHUSDT" | "BNBUSDT" | "SOLUSDT";
type Period = "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "12h" | "1d";

interface FundingRateEntry {
  fundingTime: number;
  fundingRate: string;
}
interface OpenInterestEntry {
  timestamp: number;
  sumOpenInterestValue: string;
}
interface LongShortEntry {
  timestamp: number;
  longAccount: string;
  shortAccount: string;
}

/** One normalized chart row: `ts` is epoch ms, `value` the plotted figure. */
interface Point {
  ts: number;
  value: number;
  /** Only used by the long/short panel. */
  short?: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const BASE_URL = "https://fapi.binance.com";
const SYMBOLS: PerpSymbol[] = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"];
const PERIODS: Period[] = [
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "6h",
  "12h",
  "1d",
];
const SYMBOL_LABELS: Record<PerpSymbol, string> = {
  BTCUSDT: "BTC",
  ETHUSDT: "ETH",
  BNBUSDT: "BNB",
  SOLUSDT: "SOL",
};
const PERIOD_MS: Record<Period, number> = {
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "2h": 7_200_000,
  "4h": 14_400_000,
  "6h": 21_600_000,
  "12h": 43_200_000,
  "1d": 86_400_000,
};
const FUNDING_STEP_MS = 8 * 3_600_000;
/** Fixed anchor so the demo dataset is identical on every render. */
const DEMO_END_MS = Date.UTC(2025, 0, 15, 12, 0, 0);
const DEMO_BASE_OI: Record<PerpSymbol, number> = {
  BTCUSDT: 7.4e9,
  ETHUSDT: 3.1e9,
  BNBUSDT: 6.2e8,
  SOLUSDT: 1.9e9,
};
const DEMO_SEED: Record<PerpSymbol, number> = {
  BTCUSDT: 0.4,
  ETHUSDT: 1.3,
  BNBUSDT: 2.1,
  SOLUSDT: 2.9,
};

// ─── Formatting ──────────────────────────────────────────────────────────────

function formatUsd(val: number): string {
  if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
  return `$${val.toFixed(0)}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function formatTick(ts: number, withDate: boolean): string {
  const d = new Date(ts);
  const clock = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return withDate ? `${d.getMonth() + 1}/${d.getDate()} ${clock}` : clock;
}

// ─── Data fetching ───────────────────────────────────────────────────────────

const retryDelay = (attempt: number) => Math.min(1000 * 2 ** attempt, 8000);

async function fetchRows(
  path: string,
  signal: AbortSignal,
): Promise<unknown[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Binance responded with HTTP ${res.status}`);
    const json: unknown = await res.json();
    if (!Array.isArray(json)) throw new Error("Unexpected Binance response");
    return json;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}

function cleanPoints(points: Point[]): Point[] {
  return points.filter(
    (p) => Number.isFinite(p.ts) && Number.isFinite(p.value),
  );
}

function fetchFunding(symbol: PerpSymbol, signal: AbortSignal) {
  return fetchRows(
    `/fapi/v1/fundingRate?symbol=${symbol}&limit=100`,
    signal,
  ).then((rows) =>
    cleanPoints(
      (rows as FundingRateEntry[]).map((e) => ({
        ts: e.fundingTime,
        value: Number.parseFloat(e.fundingRate) * 100,
      })),
    ),
  );
}

function fetchOpenInterest(
  symbol: PerpSymbol,
  period: Period,
  signal: AbortSignal,
) {
  return fetchRows(
    `/futures/data/openInterestHist?symbol=${symbol}&period=${period}&limit=50`,
    signal,
  ).then((rows) =>
    cleanPoints(
      (rows as OpenInterestEntry[]).map((e) => ({
        ts: e.timestamp,
        value: Number.parseFloat(e.sumOpenInterestValue),
      })),
    ),
  );
}

function fetchLongShort(
  symbol: PerpSymbol,
  period: Period,
  signal: AbortSignal,
) {
  return fetchRows(
    `/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=${period}&limit=50`,
    signal,
  ).then((rows) =>
    cleanPoints(
      (rows as LongShortEntry[]).map((e) => ({
        ts: e.timestamp,
        value: Number.parseFloat(e.longAccount) * 100,
        short: Number.parseFloat(e.shortAccount) * 100,
      })),
    ),
  );
}

// ─── Deterministic demo datasets (no randomness) ─────────────────────────────

function demoFunding(symbol: PerpSymbol): Point[] {
  const seed = DEMO_SEED[symbol];
  return Array.from({ length: 100 }, (_, i) => ({
    ts: DEMO_END_MS - (99 - i) * FUNDING_STEP_MS,
    value:
      0.008 + 0.006 * Math.sin(i * 0.28 + seed) + 0.003 * Math.cos(i * 0.9),
  }));
}

function demoOpenInterest(symbol: PerpSymbol, period: Period): Point[] {
  const seed = DEMO_SEED[symbol];
  return Array.from({ length: 50 }, (_, i) => ({
    ts: DEMO_END_MS - (49 - i) * PERIOD_MS[period],
    value:
      DEMO_BASE_OI[symbol] *
      (1 + 0.04 * Math.sin(i * 0.22 + seed) + 0.0015 * i),
  }));
}

function demoLongShort(symbol: PerpSymbol, period: Period): Point[] {
  const seed = DEMO_SEED[symbol];
  return Array.from({ length: 50 }, (_, i) => {
    const long = 52 + 5 * Math.sin(i * 0.3 + seed) + 1.5 * Math.cos(i * 0.8);
    return {
      ts: DEMO_END_MS - (49 - i) * PERIOD_MS[period],
      value: long,
      short: 100 - long,
    };
  });
}

// ─── Panel data hook ─────────────────────────────────────────────────────────

interface PanelData {
  points: Point[];
  isLoading: boolean;
  isError: boolean;
  isDemo: boolean;
  isRefetching: boolean;
  updatedAt: number;
  retry: () => void;
  showDemo: () => void;
  backToLive: () => void;
}

/** Live Binance rows via TanStack Query; demo rows only after an explicit user choice. */
function usePanelData(
  queryKey: readonly string[],
  queryFn: (signal: AbortSignal) => Promise<Point[]>,
  demoPoints: () => Point[],
): PanelData {
  const autoRefresh = useDefiStore((s) => s.autoRefresh);
  const pollingInterval = useDefiStore((s) => s.pollingInterval);
  const [demoOn, setDemoOn] = useState(false);
  const query = useQuery({
    queryKey: ["derivatives", ...queryKey],
    queryFn: ({ signal }) => queryFn(signal),
    enabled: !demoOn,
    staleTime: 15_000,
    gcTime: 10 * 60_000,
    retry: 2,
    retryDelay,
    refetchInterval: autoRefresh ? pollingInterval * 1000 : false,
    refetchOnWindowFocus: false,
  });
  const isDemo = demoOn;
  return {
    points: isDemo ? demoPoints() : (query.data ?? []),
    isLoading: !isDemo && query.isLoading,
    isError: !isDemo && query.isError,
    isDemo,
    isRefetching: query.isFetching && !query.isLoading,
    updatedAt: query.dataUpdatedAt,
    retry: () => {
      void query.refetch();
    },
    showDemo: () => setDemoOn(true),
    backToLive: () => setDemoOn(false),
  };
}

// ─── Shared UI ───────────────────────────────────────────────────────────────

function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  labels,
  ocid,
  label,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
  labels?: Record<T, string>;
  ocid: string;
  label: string;
}) {
  return (
    <fieldset
      className="m-0 flex min-w-0 flex-wrap gap-1 border-0 p-0"
      aria-label={label}
      data-ocid={`${ocid}.tab`}
    >
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={value === o}
          data-ocid={`${ocid}.${o.toLowerCase()}`}
          onClick={() => onChange(o)}
          className={cn(
            "min-h-7 rounded border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === o
              ? "border-primary/45 bg-primary/15 text-primary"
              : "border-border bg-muted/30 text-muted-foreground hover:text-foreground",
          )}
        >
          {labels ? labels[o] : o}
        </button>
      ))}
    </fieldset>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string | number;
  format: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 font-mono text-xs text-popover-foreground">
      <div className="text-primary">{label}</div>
      <div className="font-semibold">{format(payload[0].value)}</div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  ocid,
  data,
  controls,
  summary,
  children,
}: {
  title: string;
  subtitle: string;
  ocid: string;
  data: PanelData;
  controls: ReactNode;
  summary?: ReactNode;
  children: ReactNode;
}) {
  const { isLoading, isError, isDemo, points, isRefetching, updatedAt } = data;
  const showError = isError && points.length === 0;
  return (
    <section className="glass-card rounded-lg p-5" data-ocid={`${ocid}.panel`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="mb-0.5 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            {title}
          </h2>
          <p className="font-mono text-[10px] text-muted-foreground">
            {subtitle}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDemo ? (
            <>
              <DemoBadge />
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-ocid={`${ocid}.live_button`}
                onClick={data.backToLive}
              >
                Try live data
              </Button>
            </>
          ) : (
            <>
              <span className="rounded border border-primary/20 bg-primary/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-primary/80">
                {updatedAt > 0
                  ? `Live · ${formatTick(updatedAt, false)}`
                  : "Live feed"}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Refresh ${title}`}
                data-ocid={`${ocid}.refresh_button`}
                onClick={data.retry}
              >
                <RefreshCw
                  className={cn("h-4 w-4", isRefetching && "animate-spin")}
                  aria-hidden
                />
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">{controls}</div>

      {isLoading ? (
        <LoadingState
          label={`Loading ${title.toLowerCase()}…`}
          className="h-64"
        />
      ) : showError ? (
        <ErrorState
          title="Binance data unavailable"
          message="The request failed or was blocked by your network or browser. Retry, or view a clearly labeled demo dataset."
          onRetry={data.retry}
          className="min-h-64"
        />
      ) : points.length === 0 ? (
        <EmptyState
          title="No data returned"
          description="Binance returned no rows for this selection. Try another symbol or period."
          className="h-64"
        />
      ) : (
        <>
          {summary}
          {isError && !isDemo && (
            <p
              className="mb-2 font-mono text-[10px] text-warning"
              data-ocid={`${ocid}.stale_notice`}
            >
              Latest refresh failed — showing the last live values.
            </p>
          )}
          {children}
        </>
      )}

      {showError && (
        <div className="mt-3 flex justify-center">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-ocid={`${ocid}.demo_button`}
            onClick={data.showDemo}
          >
            Show demo data instead
          </Button>
        </div>
      )}
    </section>
  );
}

const AXIS_TICK = { className: "fill-muted-foreground", fontSize: 9 };

function BigValue({
  value,
  caption,
  className,
  ocid,
}: {
  value: string;
  caption: string;
  className: string;
  ocid: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline gap-3">
      <span
        className={cn("font-mono text-4xl font-bold", className)}
        data-ocid={ocid}
      >
        {value}
      </span>
      <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
        {caption}
      </span>
    </div>
  );
}

// ─── Panel 1: Funding rate ───────────────────────────────────────────────────

function FundingRatePanel() {
  const [symbol, setSymbol] = useState<PerpSymbol>("BTCUSDT");
  const data = usePanelData(
    ["funding", symbol],
    (signal) => fetchFunding(symbol, signal),
    () => demoFunding(symbol),
  );
  const rows = data.points.map((p) => ({
    time: formatTick(p.ts, true),
    value: p.value,
  }));
  const current = rows.length > 0 ? rows[rows.length - 1].value : 0;
  const positive = current >= 0;

  return (
    <Panel
      title="Funding Rate Tracker"
      subtitle="Perpetual futures funding, last 100 settlements"
      ocid="derivatives.funding_rate"
      data={data}
      controls={
        <ChipGroup
          options={SYMBOLS}
          value={symbol}
          onChange={setSymbol}
          labels={SYMBOL_LABELS}
          ocid="derivatives.funding_rate.symbol"
          label="Funding rate symbol"
        />
      }
      summary={
        <BigValue
          ocid="derivatives.funding_rate.current"
          value={`${positive ? "+" : ""}${current.toFixed(4)}%`}
          caption={`${SYMBOL_LABELS[symbol]} 8h funding`}
          className={
            positive ? "text-success" : "text-destructive glow-destructive"
          }
        />
      }
    >
      <div
        className={cn("h-52", positive ? "text-success" : "text-destructive")}
        data-ocid="derivatives.funding_rate.chart"
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={rows}
            margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="frGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="currentColor" stopOpacity={0.3} />
                <stop offset="95%" stopColor="currentColor" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              className="stroke-border"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="time"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              interval={Math.floor(rows.length / 6)}
            />
            <YAxis
              tickFormatter={(v: number) => `${v.toFixed(3)}%`}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={55}
            />
            <Tooltip
              content={<ChartTooltip format={(v) => `${v.toFixed(4)}%`} />}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="currentColor"
              strokeWidth={1.5}
              fill="url(#frGrad)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

// ─── Panel 2: Open interest ──────────────────────────────────────────────────

function OpenInterestPanel() {
  const [symbol, setSymbol] = useState<PerpSymbol>("BTCUSDT");
  const [period, setPeriod] = useState<Period>("1h");
  const data = usePanelData(
    ["open-interest", symbol, period],
    (signal) => fetchOpenInterest(symbol, period, signal),
    () => demoOpenInterest(symbol, period),
  );
  const rows = data.points.map((p) => ({
    time: formatTick(p.ts, true),
    value: p.value,
  }));
  const current = rows.length > 0 ? rows[rows.length - 1].value : 0;

  return (
    <Panel
      title="Open Interest"
      subtitle="Historical open interest in USD"
      ocid="derivatives.open_interest"
      data={data}
      controls={
        <>
          <ChipGroup
            options={SYMBOLS}
            value={symbol}
            onChange={setSymbol}
            labels={SYMBOL_LABELS}
            ocid="derivatives.open_interest.symbol"
            label="Open interest symbol"
          />
          <ChipGroup
            options={PERIODS}
            value={period}
            onChange={setPeriod}
            ocid="derivatives.open_interest.period"
            label="Open interest period"
          />
        </>
      }
      summary={
        <BigValue
          ocid="derivatives.open_interest.current"
          value={formatUsd(current)}
          caption={`${SYMBOL_LABELS[symbol]} notional`}
          className="text-primary glow-primary"
        />
      }
    >
      <div
        className="h-52 text-primary"
        data-ocid="derivatives.open_interest.chart"
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={rows}
            margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="oiGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="currentColor" stopOpacity={0.25} />
                <stop offset="95%" stopColor="currentColor" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              className="stroke-border"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="time"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              interval={Math.floor(rows.length / 6)}
            />
            <YAxis
              domain={["dataMin", "dataMax"]}
              tickFormatter={(v: number) => formatUsd(v)}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={60}
            />
            <Tooltip content={<ChartTooltip format={formatUsd} />} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="currentColor"
              strokeWidth={1.5}
              fill="url(#oiGrad)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

// ─── Panel 3: Long / short ratio ─────────────────────────────────────────────

function LongShortPanel() {
  const [symbol, setSymbol] = useState<PerpSymbol>("BTCUSDT");
  const [period, setPeriod] = useState<Period>("1h");
  const data = usePanelData(
    ["long-short", symbol, period],
    (signal) => fetchLongShort(symbol, period, signal),
    () => demoLongShort(symbol, period),
  );
  const rows = data.points.map((p) => ({
    time: formatTick(p.ts, true),
    value: p.value,
  }));
  const last = data.points[data.points.length - 1];
  const longPct = last?.value ?? 50;
  const shortPct = last?.short ?? 100 - longPct;

  return (
    <Panel
      title="Long / Short Ratio"
      subtitle="Global account ratio"
      ocid="derivatives.ls_ratio"
      data={data}
      controls={
        <>
          <ChipGroup
            options={SYMBOLS}
            value={symbol}
            onChange={setSymbol}
            labels={SYMBOL_LABELS}
            ocid="derivatives.ls_ratio.symbol"
            label="Long short symbol"
          />
          <ChipGroup
            options={PERIODS}
            value={period}
            onChange={setPeriod}
            ocid="derivatives.ls_ratio.period"
            label="Long short period"
          />
        </>
      }
      summary={
        <div className="mb-4" data-ocid="derivatives.ls_ratio.gauge">
          <div className="mb-1.5 flex items-center justify-between font-mono text-sm font-bold">
            <span className="text-success">{longPct.toFixed(1)}% LONG</span>
            <span className="text-destructive">
              {shortPct.toFixed(1)}% SHORT
            </span>
          </div>
          <div
            className="h-4 w-full overflow-hidden rounded-full bg-destructive/25"
            role="meter"
            aria-label={`Long ${longPct.toFixed(1)} percent, short ${shortPct.toFixed(1)} percent`}
            aria-valuenow={Math.round(longPct)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-success/70 transition-[width] duration-500"
              style={{ width: `${Math.min(100, Math.max(0, longPct))}%` }}
            />
          </div>
        </div>
      }
    >
      <div className="h-52 text-success" data-ocid="derivatives.ls_ratio.chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={rows}
            margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              className="stroke-border"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="time"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              interval={Math.floor(rows.length / 6)}
            />
            <YAxis
              domain={["dataMin - 2", "dataMax + 2"]}
              tickFormatter={(v: number) => `${v.toFixed(0)}%`}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip
              content={<ChartTooltip format={(v) => `${v.toFixed(2)}% long`} />}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="currentColor"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function DerivativesPage() {
  return (
    <div className="w-full bg-background" data-ocid="derivatives.page">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        <header className="mb-8">
          <div className="mb-1 flex items-center gap-3">
            <div className="h-6 w-1 rounded-full bg-gradient-to-b from-primary to-accent" />
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              Derivatives Analytics
            </h1>
          </div>
          <p className="ml-4 font-mono text-xs uppercase tracking-[0.15em] text-primary/70">
            Perpetual futures data from Binance public endpoints
          </p>
        </header>
        <div className="flex flex-col gap-6">
          <FundingRatePanel />
          <OpenInterestPanel />
          <LongShortPanel />
        </div>
      </div>
    </div>
  );
}
