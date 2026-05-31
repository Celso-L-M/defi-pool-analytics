import { Breadcrumb } from "@/components/Breadcrumb";
import { DataSourceBadge } from "@/components/DataSourceBadge";
import { ErrorBanner } from "@/components/ErrorBanner";
import { HELP_TERMS, HelpIcon } from "@/components/HelpIcon";
import { useDefiStore } from "@/store/useDefiStore";
import { useCallback, useEffect, useRef, useState } from "react";
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

type DerivSymbol = "BTCUSDT" | "ETHUSDT" | "BNBUSDT" | "SOLUSDT";
type Period = "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "12h" | "1d";

interface FundingRateEntry {
  fundingTime: number;
  fundingRate: string;
  symbol: string;
}

interface OpenInterestEntry {
  timestamp: number;
  sumOpenInterest: string;
  sumOpenInterestValue: string;
  symbol: string;
}

interface LongShortEntry {
  timestamp: number;
  longShortRatio: string;
  longAccount: string;
  shortAccount: string;
  symbol: string;
}

interface FundingRateChartPoint {
  time: string;
  rate: number;
  rawTs?: number;
}

interface OpenInterestChartPoint {
  time: string;
  oi: number;
  rawTs?: number;
}

interface LongShortChartPoint {
  time: string;
  longRatio: number;
  rawTs?: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SYMBOLS: DerivSymbol[] = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"];
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

const SYMBOL_LABELS: Record<DerivSymbol, string> = {
  BTCUSDT: "BTC",
  ETHUSDT: "ETH",
  BNBUSDT: "BNB",
  SOLUSDT: "SOL",
};

const REFRESH_INTERVAL = 30_000;

const BREADCRUMB_ITEMS = [
  { label: "Home", href: "/" },
  { label: "Derivatives" },
];

// Error banner IDs
const ERR_FUNDING = "derivatives.funding_rate_error";
const ERR_OI = "derivatives.open_interest_error";
const ERR_LS = "derivatives.ls_ratio_error";

// ─── Binance API Rate Limiter ────────────────────────────────────────────────

const binanceRateLimiter = (() => {
  const WINDOW_MS = 60_000;
  const MAX_WEIGHT = 6_000;
  const log: Array<{ ts: number; weight: number }> = [];

  function pruneOld() {
    const cutoff = Date.now() - WINDOW_MS;
    while (log.length > 0 && log[0].ts < cutoff) {
      log.shift();
    }
  }

  function usedWeight(): number {
    pruneOld();
    return log.reduce((sum, e) => sum + e.weight, 0);
  }

  async function schedule(weight = 1): Promise<void> {
    while (true) {
      pruneOld();
      const used = log.reduce((sum, e) => sum + e.weight, 0);
      if (used + weight <= MAX_WEIGHT) {
        log.push({ ts: Date.now(), weight });
        return;
      }
      const oldestTs = log[0]?.ts ?? Date.now();
      const waitMs = oldestTs + WINDOW_MS - Date.now() + 10;
      await new Promise<void>((resolve) =>
        setTimeout(resolve, waitMs > 0 ? waitMs : 50),
      );
    }
  }

  return { schedule, usedWeight };
})();

// ─── Utility helpers ─────────────────────────────────────────────────────────

function formatOI(val: number): string {
  if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
  return `$${val.toFixed(0)}`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function formatSecondsAgo(lastUpdated: Date | null): string {
  if (!lastUpdated) return "";
  const diffS = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
  if (diffS < 60) return `${diffS}s ago`;
  const diffM = Math.floor(diffS / 60);
  if (diffM < 60) return `${diffM}m ago`;
  return `${Math.floor(diffM / 60)}h ago`;
}

// ─── Custom chart tooltips ────────────────────────────────────────────────────

interface FundingTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  symbol: string;
}

function FundingTooltip({
  active,
  payload,
  label,
  symbol,
}: FundingTooltipProps) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  const isPos = val >= 0;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs font-mono"
      style={{
        background: "rgba(8,8,18,0.97)",
        border: "1px solid rgba(0,163,255,0.4)",
        backdropFilter: "blur(10px)",
        color: "rgba(255,255,255,0.85)",
        boxShadow: "0 0 12px rgba(0,163,255,0.2)",
      }}
    >
      <div style={{ color: "rgba(0,163,255,0.7)" }}>
        {symbol} · {label}
      </div>
      <div
        className="font-semibold mt-0.5"
        style={{ color: isPos ? "#00FF88" : "#FF4466" }}
      >
        Funding Rate: {isPos ? "+" : ""}
        {val.toFixed(4)}%
      </div>
    </div>
  );
}

interface OITooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  symbol: string;
}

function OITooltip({ active, payload, label, symbol }: OITooltipProps) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs font-mono"
      style={{
        background: "rgba(8,8,18,0.97)",
        border: "1px solid rgba(0,163,255,0.4)",
        backdropFilter: "blur(10px)",
        color: "rgba(255,255,255,0.85)",
        boxShadow: "0 0 12px rgba(0,163,255,0.2)",
      }}
    >
      <div style={{ color: "rgba(0,163,255,0.7)" }}>
        {symbol} · {label}
      </div>
      <div className="font-semibold mt-0.5" style={{ color: "#00A3FF" }}>
        Open Interest: {formatOI(val)}
      </div>
    </div>
  );
}

interface LSTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  symbol: string;
}

function LSTooltip({ active, payload, label, symbol }: LSTooltipProps) {
  if (!active || !payload?.length) return null;
  const longPct = payload[0].value;
  const shortPct = 100 - longPct;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs font-mono"
      style={{
        background: "rgba(8,8,18,0.97)",
        border: "1px solid rgba(0,163,255,0.4)",
        backdropFilter: "blur(10px)",
        color: "rgba(255,255,255,0.85)",
        boxShadow: "0 0 12px rgba(0,163,255,0.2)",
      }}
    >
      <div style={{ color: "rgba(0,163,255,0.7)" }}>
        {symbol} · {label}
      </div>
      <div className="font-semibold mt-0.5" style={{ color: "#00FF88" }}>
        Long: {longPct.toFixed(2)}%
      </div>
      <div className="font-semibold" style={{ color: "#FF4466" }}>
        Short: {shortPct.toFixed(2)}%
      </div>
    </div>
  );
}

// ─── Shared UI atoms ─────────────────────────────────────────────────────────

function GlassCard({
  children,
  className = "",
}: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border ${className}`}
      style={{
        background: "rgba(255,255,255,0.04)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderColor: "rgba(0,163,255,0.15)",
        boxShadow:
          "0 4px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
    >
      {children}
    </div>
  );
}

function SymbolTabs({
  value,
  onChange,
}: {
  value: DerivSymbol;
  onChange: (s: DerivSymbol) => void;
}) {
  return (
    <div className="flex gap-1" data-ocid="derivatives.symbol_tabs">
      {SYMBOLS.map((s) => (
        <button
          key={s}
          type="button"
          data-ocid={`derivatives.symbol.${s.toLowerCase()}`}
          onClick={() => onChange(s)}
          className="px-3 py-1.5 rounded-md text-[10px] font-mono font-semibold uppercase tracking-wider transition-all duration-200"
          style={{
            background:
              value === s ? "rgba(0,163,255,0.18)" : "rgba(255,255,255,0.04)",
            color: value === s ? "#00A3FF" : "rgba(255,255,255,0.4)",
            border: `1px solid ${value === s ? "rgba(0,163,255,0.45)" : "rgba(255,255,255,0.08)"}`,
            boxShadow: value === s ? "0 0 8px rgba(0,163,255,0.25)" : "none",
            minHeight: "44px",
          }}
        >
          {SYMBOL_LABELS[s]}
        </button>
      ))}
    </div>
  );
}

function PeriodTabs({
  value,
  onChange,
}: {
  value: Period;
  onChange: (p: Period) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1" data-ocid="derivatives.period_tabs">
      {PERIODS.map((p) => (
        <button
          key={p}
          type="button"
          data-ocid={`derivatives.period.${p}`}
          onClick={() => onChange(p)}
          className="px-2 py-1.5 rounded text-[9px] font-mono font-semibold uppercase tracking-wider transition-all duration-200"
          style={{
            background:
              value === p ? "rgba(0,255,136,0.12)" : "rgba(255,255,255,0.03)",
            color: value === p ? "#00FF88" : "rgba(255,255,255,0.35)",
            border: `1px solid ${value === p ? "rgba(0,255,136,0.3)" : "rgba(255,255,255,0.06)"}`,
            minHeight: "36px",
          }}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div
        className="h-4 rounded w-1/3"
        style={{ background: "rgba(255,255,255,0.06)" }}
      />
      <div
        className="h-48 rounded-lg"
        style={{ background: "rgba(255,255,255,0.04)" }}
      />
    </div>
  );
}

function RefreshBadge({ countdown }: { countdown: number }) {
  return (
    <span
      className="text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded"
      style={{
        background: "rgba(0,163,255,0.08)",
        color: "rgba(0,163,255,0.55)",
        border: "1px solid rgba(0,163,255,0.15)",
      }}
    >
      Refresh in {countdown}s
    </span>
  );
}

function LastUpdatedText({ lastUpdated }: { lastUpdated: Date | null }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  if (!lastUpdated) return null;
  return (
    <span
      className="text-[9px] font-mono"
      style={{ color: "rgba(255,255,255,0.3)" }}
    >
      Last updated {formatSecondsAgo(lastUpdated)}
    </span>
  );
}

// ─── useCountdown ─────────────────────────────────────────────────────────────

function useCountdown(interval: number) {
  const [countdown, setCountdown] = useState(Math.floor(interval / 1000));
  useEffect(() => {
    setCountdown(Math.floor(interval / 1000));
    const timer = setInterval(() => {
      setCountdown((c) => (c <= 1 ? Math.floor(interval / 1000) : c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [interval]);
  return countdown;
}

// ─── Panel 1: Funding Rate Tracker ───────────────────────────────────────────

function FundingRateTracker() {
  const [symbol, setSymbol] = useState<DerivSymbol>("BTCUSDT");
  const [data, setData] = useState<FundingRateChartPoint[]>([]);
  const [currentRate, setCurrentRate] = useState<number | null>(null);
  const [prevRate, setPrevRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const countdown = useCountdown(REFRESH_INTERVAL);
  const { dismissedErrors, dismissError } = useDefiStore();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      await binanceRateLimiter.schedule(1);
      const res = await fetch(
        `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=100`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (!res.ok) throw new Error("HTTP error");
      const json: FundingRateEntry[] = await res.json();
      if (!Array.isArray(json) || json.length === 0) throw new Error("Empty");
      const points: FundingRateChartPoint[] = json.map((e) => ({
        time: formatTime(e.fundingTime),
        rate: Number.parseFloat(e.fundingRate) * 100,
        rawTs: e.fundingTime,
      }));
      setPrevRate(currentRate);
      setData(points);
      setCurrentRate(points[points.length - 1].rate);
      setLastUpdated(new Date());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [symbol, currentRate]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [fetchData]);

  const isPositive = (currentRate ?? 0) >= 0;
  const rateColor = isPositive ? "#00FF88" : "#FF4466";
  const rateGlow = isPositive
    ? "0 0 12px rgba(0,255,136,0.7), 0 0 24px rgba(0,255,136,0.35)"
    : "0 0 12px rgba(255,68,102,0.7), 0 0 24px rgba(255,68,102,0.35)";

  const changePct =
    prevRate !== null && currentRate !== null && prevRate !== 0
      ? ((currentRate - prevRate) / Math.abs(prevRate)) * 100
      : null;
  const changeIsUp = (changePct ?? 0) >= 0;

  const showErrorBanner = error && !dismissedErrors.includes(ERR_FUNDING);

  return (
    <GlassCard>
      <div className="p-5">
        {/* Error banner */}
        {showErrorBanner && (
          <div className="mb-4">
            <ErrorBanner
              message="Binance data unavailable — retrying in 30s"
              source="Binance"
              type="error"
              onDismiss={() => dismissError(ERR_FUNDING)}
            />
          </div>
        )}

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <h2
                className="text-xs font-mono uppercase tracking-[0.18em] font-semibold"
                style={{ color: "#00A3FF" }}
              >
                Funding Rate Tracker
              </h2>
              <HelpIcon term="FundingRate" />
            </div>
            <p
              className="text-[10px] font-mono"
              style={{ color: "rgba(255,255,255,0.3)" }}
            >
              Perpetual futures funding — refreshes every 30s
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <RefreshBadge countdown={countdown} />
            <DataSourceBadge
              source="Binance"
              lastUpdated={lastUpdated}
              status={error ? "cached" : lastUpdated ? "live" : "cached"}
            />
            <LastUpdatedText lastUpdated={lastUpdated} />
          </div>
        </div>

        {/* Symbol tabs */}
        <div className="mb-4">
          <SymbolTabs
            value={symbol}
            onChange={(s) => {
              setPrevRate(null);
              setCurrentRate(null);
              setSymbol(s);
            }}
          />
        </div>

        {/* Current rate big display */}
        {!loading && !error && currentRate !== null && (
          <div className="flex items-baseline gap-3 mb-5">
            <span
              className="text-4xl font-mono font-bold"
              style={{ color: rateColor, textShadow: rateGlow }}
              data-ocid="derivatives.funding_rate.current"
            >
              {isPositive ? "+" : ""}
              {currentRate.toFixed(4)}%
            </span>
            <span
              className="text-xs font-mono uppercase tracking-wider"
              style={{
                color: isPositive
                  ? "rgba(0,255,136,0.55)"
                  : "rgba(255,68,102,0.55)",
              }}
            >
              {SYMBOL_LABELS[symbol]} 8h funding
            </span>
            {/* Percentage change indicator */}
            {changePct !== null && (
              <span
                className="text-xs font-mono font-semibold flex items-center gap-0.5"
                style={{ color: changeIsUp ? "#00FF88" : "#FF4466" }}
              >
                {changeIsUp ? "▲" : "▼"}
                {Math.abs(changePct).toFixed(2)}%
              </span>
            )}
          </div>
        )}

        {/* Chart or loading/error */}
        {loading ? (
          <LoadingSkeleton />
        ) : error ? (
          <div
            className="flex flex-col items-center justify-center h-48 rounded-lg gap-2"
            style={{
              background: "rgba(255,68,102,0.06)",
              border: "1px solid rgba(255,68,102,0.2)",
            }}
            data-ocid="derivatives.funding_rate.error_state"
          >
            <span className="text-2xl">⚠️</span>
            <p
              className="text-sm font-mono"
              style={{ color: "rgba(255,68,102,0.9)" }}
            >
              Funding rate data temporarily unavailable
            </p>
          </div>
        ) : (
          <div
            className="min-h-[200px]"
            data-ocid="derivatives.funding_rate.chart"
          >
            <ResponsiveContainer width="100%" minHeight={200} height={220}>
              <AreaChart
                data={data}
                margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="frGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={rateColor} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={rateColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.05)"
                  vertical={false}
                />
                <XAxis
                  dataKey="time"
                  tick={{
                    fill: "rgba(255,255,255,0.3)",
                    fontSize: 9,
                    fontFamily: "Geist Mono",
                  }}
                  tickLine={false}
                  axisLine={false}
                  interval={Math.floor(data.length / 6)}
                />
                <YAxis
                  tickFormatter={(v: number) => `${v.toFixed(3)}%`}
                  tick={{
                    fill: "rgba(255,255,255,0.3)",
                    fontSize: 9,
                    fontFamily: "Geist Mono",
                  }}
                  tickLine={false}
                  axisLine={false}
                  width={55}
                />
                <Tooltip
                  content={<FundingTooltip symbol={SYMBOL_LABELS[symbol]} />}
                />
                <Area
                  type="monotone"
                  dataKey="rate"
                  stroke={rateColor}
                  strokeWidth={1.5}
                  fill="url(#frGrad)"
                  dot={{ r: 0 }}
                  activeDot={{
                    r: 8,
                    strokeWidth: 2,
                    stroke: rateColor,
                    fill: "rgba(8,8,18,0.9)",
                  }}
                  isAnimationActive={true}
                  animationDuration={300}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </GlassCard>
  );
}

// ─── Panel 2: Open Interest Chart ────────────────────────────────────────────

function OpenInterestChart() {
  const [symbol, setSymbol] = useState<DerivSymbol>("BTCUSDT");
  const [period, setPeriod] = useState<Period>("1h");
  const [data, setData] = useState<OpenInterestChartPoint[]>([]);
  const [currentOI, setCurrentOI] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const countdown = useCountdown(REFRESH_INTERVAL);
  const { dismissedErrors, dismissError } = useDefiStore();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      await binanceRateLimiter.schedule(1);
      const res = await fetch(
        `https://fapi.binance.com/futures/data/openInterestHist?symbol=${symbol}&period=${period}&limit=50`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (!res.ok) throw new Error("HTTP error");
      const json: OpenInterestEntry[] = await res.json();
      if (!Array.isArray(json) || json.length === 0) throw new Error("Empty");
      const points: OpenInterestChartPoint[] = json.map((e) => ({
        time: formatDate(e.timestamp),
        oi: Number.parseFloat(e.sumOpenInterestValue),
        rawTs: e.timestamp,
      }));
      setData(points);
      setCurrentOI(points[points.length - 1].oi);
      setLastUpdated(new Date());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [symbol, period]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [fetchData]);

  const showErrorBanner = error && !dismissedErrors.includes(ERR_OI);

  return (
    <GlassCard>
      <div className="p-5">
        {/* Error banner */}
        {showErrorBanner && (
          <div className="mb-4">
            <ErrorBanner
              message="Binance data unavailable — retrying in 30s"
              source="Binance"
              type="error"
              onDismiss={() => dismissError(ERR_OI)}
            />
          </div>
        )}

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <h2
                className="text-xs font-mono uppercase tracking-[0.18em] font-semibold"
                style={{ color: "#00A3FF" }}
              >
                Open Interest
              </h2>
            </div>
            <p
              className="text-[10px] font-mono"
              style={{ color: "rgba(255,255,255,0.3)" }}
            >
              Historical OI in USD — refreshes every 30s
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <RefreshBadge countdown={countdown} />
            <DataSourceBadge
              source="Binance"
              lastUpdated={lastUpdated}
              status={error ? "cached" : lastUpdated ? "live" : "cached"}
            />
            <LastUpdatedText lastUpdated={lastUpdated} />
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-3 mb-4">
          <SymbolTabs value={symbol} onChange={setSymbol} />
          <PeriodTabs value={period} onChange={setPeriod} />
        </div>

        {/* Current OI big display */}
        {!loading && !error && currentOI !== null && (
          <div className="flex items-baseline gap-3 mb-5">
            <span
              className="text-4xl font-mono font-bold"
              style={{
                color: "#00A3FF",
                textShadow:
                  "0 0 12px rgba(0,163,255,0.7), 0 0 24px rgba(0,163,255,0.35)",
              }}
              data-ocid="derivatives.open_interest.current"
            >
              {formatOI(currentOI)}
            </span>
            <span
              className="text-xs font-mono uppercase tracking-wider"
              style={{ color: "rgba(0,163,255,0.55)" }}
            >
              {SYMBOL_LABELS[symbol]} notional
            </span>
          </div>
        )}

        {/* Chart */}
        {loading ? (
          <LoadingSkeleton />
        ) : error ? (
          <div
            className="flex flex-col items-center justify-center h-48 rounded-lg gap-2"
            style={{
              background: "rgba(255,68,102,0.06)",
              border: "1px solid rgba(255,68,102,0.2)",
            }}
            data-ocid="derivatives.open_interest.error_state"
          >
            <span className="text-2xl">⚠️</span>
            <p
              className="text-sm font-mono"
              style={{ color: "rgba(255,68,102,0.9)" }}
            >
              Open interest data temporarily unavailable
            </p>
          </div>
        ) : (
          <div
            className="min-h-[200px]"
            data-ocid="derivatives.open_interest.chart"
          >
            <ResponsiveContainer width="100%" minHeight={200} height={220}>
              <AreaChart
                data={data}
                margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="oiGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00A3FF" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#00A3FF" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.05)"
                  vertical={false}
                />
                <XAxis
                  dataKey="time"
                  tick={{
                    fill: "rgba(255,255,255,0.3)",
                    fontSize: 9,
                    fontFamily: "Geist Mono",
                  }}
                  tickLine={false}
                  axisLine={false}
                  interval={Math.floor(data.length / 6)}
                />
                <YAxis
                  tickFormatter={(v: number) => formatOI(v)}
                  tick={{
                    fill: "rgba(255,255,255,0.3)",
                    fontSize: 9,
                    fontFamily: "Geist Mono",
                  }}
                  tickLine={false}
                  axisLine={false}
                  width={60}
                />
                <Tooltip
                  content={<OITooltip symbol={SYMBOL_LABELS[symbol]} />}
                />
                <Area
                  type="monotone"
                  dataKey="oi"
                  stroke="#00A3FF"
                  strokeWidth={1.5}
                  fill="url(#oiGrad)"
                  dot={{ r: 0 }}
                  activeDot={{
                    r: 8,
                    strokeWidth: 2,
                    stroke: "#00A3FF",
                    fill: "rgba(8,8,18,0.9)",
                  }}
                  isAnimationActive={true}
                  animationDuration={300}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </GlassCard>
  );
}

// ─── Panel 3: Long/Short Ratio ────────────────────────────────────────────────

function LongShortPanel() {
  const [symbol, setSymbol] = useState<DerivSymbol>("BTCUSDT");
  const [period, setPeriod] = useState<Period>("1h");
  const [data, setData] = useState<LongShortChartPoint[]>([]);
  const [current, setCurrent] = useState<{
    long: number;
    short: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const countdown = useCountdown(REFRESH_INTERVAL);
  const { dismissedErrors, dismissError } = useDefiStore();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      await binanceRateLimiter.schedule(1);
      const res = await fetch(
        `https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=${period}&limit=50`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (!res.ok) throw new Error("HTTP error");
      const json: LongShortEntry[] = await res.json();
      if (!Array.isArray(json) || json.length === 0) throw new Error("Empty");
      const points: LongShortChartPoint[] = json.map((e) => ({
        time: formatDate(e.timestamp),
        longRatio: Number.parseFloat(e.longAccount) * 100,
        rawTs: e.timestamp,
      }));
      setData(points);
      const last = json[json.length - 1];
      setCurrent({
        long: Number.parseFloat(last.longAccount) * 100,
        short: Number.parseFloat(last.shortAccount) * 100,
      });
      setLastUpdated(new Date());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [symbol, period]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [fetchData]);

  const longPct = current?.long ?? 50;
  const shortPct = current?.short ?? 50;
  const longDominant = longPct >= 50;
  const showErrorBanner = error && !dismissedErrors.includes(ERR_LS);

  return (
    <GlassCard>
      <div className="p-5">
        {/* Error banner */}
        {showErrorBanner && (
          <div className="mb-4">
            <ErrorBanner
              message="Binance data unavailable — retrying in 30s"
              source="Binance"
              type="error"
              onDismiss={() => dismissError(ERR_LS)}
            />
          </div>
        )}

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <h2
                className="text-xs font-mono uppercase tracking-[0.18em] font-semibold"
                style={{ color: "#00A3FF" }}
              >
                Long / Short Ratio
              </h2>
              <HelpIcon term="LongShortRatio" />
            </div>
            <p
              className="text-[10px] font-mono"
              style={{ color: "rgba(255,255,255,0.3)" }}
            >
              Global account ratio — refreshes every 30s
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <RefreshBadge countdown={countdown} />
            <DataSourceBadge
              source="Binance"
              lastUpdated={lastUpdated}
              status={error ? "cached" : lastUpdated ? "live" : "cached"}
            />
            <LastUpdatedText lastUpdated={lastUpdated} />
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-3 mb-4">
          <SymbolTabs value={symbol} onChange={setSymbol} />
          <PeriodTabs value={period} onChange={setPeriod} />
        </div>

        {/* Current ratio gauge */}
        {!loading && !error && current !== null && (
          <div className="mb-5" data-ocid="derivatives.ls_ratio.gauge">
            <div className="flex justify-between items-center mb-1.5">
              <span
                className="text-sm font-mono font-bold"
                style={{
                  color: "#00FF88",
                  textShadow: "0 0 10px rgba(0,255,136,0.6)",
                }}
              >
                {longPct.toFixed(1)}% LONG
              </span>
              <span
                className="text-sm font-mono font-bold"
                style={{
                  color: "#FF4466",
                  textShadow: "0 0 10px rgba(255,68,102,0.6)",
                }}
              >
                {shortPct.toFixed(1)}% SHORT
              </span>
            </div>
            <div
              className="w-full h-4 rounded-full overflow-hidden"
              style={{ background: "rgba(255,68,102,0.2)" }}
              role="meter"
              aria-label={`Long ${longPct.toFixed(1)}% Short ${shortPct.toFixed(1)}%`}
              aria-valuenow={Math.round(longPct)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${longPct}%`,
                  background: longDominant
                    ? "linear-gradient(90deg, rgba(0,255,136,0.8) 0%, rgba(0,255,136,0.5) 100%)"
                    : "linear-gradient(90deg, rgba(0,255,136,0.5) 0%, rgba(0,255,136,0.3) 100%)",
                  boxShadow: "2px 0 8px rgba(0,255,136,0.4)",
                }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span
                className="text-[9px] font-mono"
                style={{ color: "rgba(0,255,136,0.5)" }}
              >
                ↑ LONGS
              </span>
              <span
                className="text-[9px] font-mono"
                style={{ color: "rgba(255,68,102,0.5)" }}
              >
                SHORTS ↓
              </span>
            </div>
          </div>
        )}

        {/* Chart */}
        {loading ? (
          <LoadingSkeleton />
        ) : error ? (
          <div
            className="flex flex-col items-center justify-center h-48 rounded-lg gap-2"
            style={{
              background: "rgba(255,68,102,0.06)",
              border: "1px solid rgba(255,68,102,0.2)",
            }}
            data-ocid="derivatives.ls_ratio.error_state"
          >
            <span className="text-2xl">⚠️</span>
            <p
              className="text-sm font-mono"
              style={{ color: "rgba(255,68,102,0.9)" }}
            >
              Long/Short data temporarily unavailable
            </p>
          </div>
        ) : (
          <div className="min-h-[200px]" data-ocid="derivatives.ls_ratio.chart">
            <ResponsiveContainer width="100%" minHeight={200} height={220}>
              <LineChart
                data={data}
                margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.05)"
                  vertical={false}
                />
                <XAxis
                  dataKey="time"
                  tick={{
                    fill: "rgba(255,255,255,0.3)",
                    fontSize: 9,
                    fontFamily: "Geist Mono",
                  }}
                  tickLine={false}
                  axisLine={false}
                  interval={Math.floor(data.length / 6)}
                />
                <YAxis
                  domain={[30, 70]}
                  tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                  tick={{
                    fill: "rgba(255,255,255,0.3)",
                    fontSize: 9,
                    fontFamily: "Geist Mono",
                  }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <Tooltip
                  content={<LSTooltip symbol={SYMBOL_LABELS[symbol]} />}
                />
                <Line
                  type="monotone"
                  dataKey="longRatio"
                  stroke="#00FF88"
                  strokeWidth={1.5}
                  dot={{ r: 0 }}
                  activeDot={{
                    r: 8,
                    strokeWidth: 2,
                    stroke: "#00FF88",
                    fill: "rgba(8,8,18,0.9)",
                  }}
                  isAnimationActive={true}
                  animationDuration={300}
                  style={{ filter: "drop-shadow(0 0 4px rgba(0,255,136,0.5))" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </GlassCard>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function DerivativesPage() {
  return (
    <div
      className="min-h-screen w-full"
      style={{ background: "#0D0D0D" }}
      data-ocid="derivatives.page"
    >
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
        {/* Breadcrumb */}
        <div className="mb-5">
          <Breadcrumb items={BREADCRUMB_ITEMS} />
        </div>

        {/* Page header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <div
              className="w-1 h-6 rounded-full"
              style={{
                background: "linear-gradient(180deg, #00A3FF 0%, #00FF88 100%)",
                boxShadow: "0 0 8px rgba(0,163,255,0.6)",
              }}
            />
            <h1
              className="text-2xl font-display font-bold tracking-tight"
              style={{
                color: "rgba(255,255,255,0.95)",
                textShadow: "0 0 20px rgba(0,163,255,0.2)",
              }}
            >
              Derivatives Analytics
            </h1>
          </div>
          <p
            className="text-xs font-mono uppercase tracking-[0.15em] ml-4"
            style={{ color: "rgba(0,163,255,0.55)" }}
          >
            Live perpetual futures data via Binance
          </p>
        </div>

        {/* Three panels stacked vertically */}
        <div className="flex flex-col gap-6">
          <FundingRateTracker />
          <OpenInterestChart />
          <LongShortPanel />
        </div>
      </div>
    </div>
  );
}
