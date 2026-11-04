import { ErrorState, LoadingState } from "@/components/DataStates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTokenPrices } from "@/hooks/useLiveData";
import { cn } from "@/lib/utils";
import type { ILCalculatorInput, ILCalculatorResult } from "@/types/defi";
import { useIsFetching } from "@tanstack/react-query";
import {
  AlertCircle,
  Calculator,
  Info,
  Radio,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ─── Constants ───────────────────────────────────────────────────────────────

const FEE_TIERS = [
  { value: "0.01", label: "0.01% — Stable pairs" },
  { value: "0.05", label: "0.05% — Stable pairs" },
  { value: "0.30", label: "0.30% — Most pairs" },
  { value: "1.00", label: "1.00% — Exotic pairs" },
];

/** Assumed daily trading volume as a share of the liquidity provided. */
const DAILY_VOLUME_RATIO = 0.5;

/** Token symbols the live price action can resolve to CoinGecko coin ids. */
const COIN_IDS: Record<string, string> = {
  ETH: "ethereum",
  WETH: "ethereum",
  BTC: "bitcoin",
  WBTC: "bitcoin",
  CKBTC: "bitcoin",
  SOL: "solana",
  ICP: "internet-computer",
  BNB: "binancecoin",
  USDC: "usd-coin",
  USDT: "tether",
  UNI: "uniswap",
  CAKE: "pancakeswap-token",
  RAY: "raydium",
};

const SUPPORTED_SYMBOLS = Object.keys(COIN_IDS).join(", ");

const PRESETS = [
  {
    id: "eth-usdc",
    label: "ETH/USDC 50/50",
    values: {
      token0Name: "ETH",
      token1Name: "USDC",
      token0InitialPrice: 3200,
      token0CurrentPrice: 3840,
      token1InitialPrice: 1,
      token1CurrentPrice: 1,
      initialLiquidity: 10000,
      feeTier: "0.05",
      daysInPool: 30,
    },
  },
  {
    id: "btc-eth",
    label: "BTC/ETH",
    values: {
      token0Name: "WBTC",
      token1Name: "ETH",
      token0InitialPrice: 62000,
      token0CurrentPrice: 68200,
      token1InitialPrice: 3200,
      token1CurrentPrice: 3840,
      initialLiquidity: 20000,
      feeTier: "0.30",
      daysInPool: 14,
    },
  },
  {
    id: "sol-usdc",
    label: "SOL/USDC",
    values: {
      token0Name: "SOL",
      token1Name: "USDC",
      token0InitialPrice: 148,
      token0CurrentPrice: 185,
      token1InitialPrice: 1,
      token1CurrentPrice: 1,
      initialLiquidity: 5000,
      feeTier: "0.30",
      daysInPool: 7,
    },
  },
  {
    id: "icp-ckbtc",
    label: "ICP/ckBTC",
    values: {
      token0Name: "ICP",
      token1Name: "ckBTC",
      token0InitialPrice: 12.5,
      token0CurrentPrice: 14.2,
      token1InitialPrice: 62000,
      token1CurrentPrice: 68200,
      initialLiquidity: 8000,
      feeTier: "0.30",
      daysInPool: 21,
    },
  },
  {
    id: "uni-usdc",
    label: "UNI/USDC",
    values: {
      token0Name: "UNI",
      token1Name: "USDC",
      token0InitialPrice: 7.5,
      token0CurrentPrice: 9.2,
      token1InitialPrice: 1,
      token1CurrentPrice: 1,
      initialLiquidity: 5000,
      feeTier: "0.30",
      daysInPool: 14,
    },
  },
  {
    id: "cake-bnb",
    label: "CAKE/BNB",
    values: {
      token0Name: "CAKE",
      token1Name: "BNB",
      token0InitialPrice: 2.8,
      token0CurrentPrice: 3.4,
      token1InitialPrice: 580,
      token1CurrentPrice: 640,
      initialLiquidity: 6000,
      feeTier: "0.30",
      daysInPool: 30,
    },
  },
  {
    id: "ray-sol",
    label: "RAY/SOL",
    values: {
      token0Name: "RAY",
      token1Name: "SOL",
      token0InitialPrice: 1.8,
      token0CurrentPrice: 2.3,
      token1InitialPrice: 148,
      token1CurrentPrice: 185,
      initialLiquidity: 4000,
      feeTier: "0.30",
      daysInPool: 7,
    },
  },
];

// ─── IL Calculation ───────────────────────────────────────────────────────────

interface CalcInput extends ILCalculatorInput {
  initialLiquidity: number;
}

function calculateIL(input: CalcInput): ILCalculatorResult {
  const r0 = input.token0PriceCurrent / input.token0PriceEntry;
  const r1 = input.token1PriceCurrent / input.token1PriceEntry;
  const k = r0 / r1;

  // IL formula: 2*sqrt(k)/(1+k) - 1
  const ilFactor = (2 * Math.sqrt(k)) / (1 + k) - 1;

  // HODL value: hold both tokens at the 50/50 entry split
  const hodlValue = input.initialLiquidity * 0.5 * (r0 + r1);
  const poolValue = hodlValue * (1 + ilFactor);
  const ilUSD = Math.max(0, hodlValue - poolValue);

  const dailyFees = input.initialLiquidity * input.feeRate * DAILY_VOLUME_RATIO;
  const feesEarned = dailyFees * input.daysInPool;
  const netPnL = feesEarned - ilUSD;
  const breakEvenDays =
    ilUSD > 0 && dailyFees > 0 ? Math.ceil(ilUSD / dailyFees) : 0;

  return {
    ilPercent: Math.abs(ilFactor * 100),
    ilUSD,
    hodlValue,
    poolValue,
    feesEarned,
    netPnL,
    breakEvenDays,
  };
}

// ─── Form State ───────────────────────────────────────────────────────────────

interface FormValues {
  token0Name: string;
  token1Name: string;
  token0InitialPrice: string;
  token0CurrentPrice: string;
  token1InitialPrice: string;
  token1CurrentPrice: string;
  initialLiquidity: string;
  feeTier: string;
  daysInPool: string;
}

const DEFAULT_FORM: FormValues = {
  token0Name: "",
  token1Name: "",
  token0InitialPrice: "",
  token0CurrentPrice: "",
  token1InitialPrice: "",
  token1CurrentPrice: "",
  initialLiquidity: "",
  feeTier: "0.30",
  daysInPool: "",
};

const LIVE_FIELDS: ReadonlyArray<keyof FormValues> = [
  "token0Name",
  "token1Name",
  "token0InitialPrice",
  "token0CurrentPrice",
  "token1InitialPrice",
  "token1CurrentPrice",
];

interface LiveTarget {
  symbol0: string;
  symbol1: string;
  id0: string;
  id1: string;
}

interface LiveInfo {
  symbol0: string;
  symbol1: string;
  at: Date;
}

function parseNum(value: string): number {
  return value.trim() === "" ? Number.NaN : Number(value);
}

function formatPrice(value: number): string {
  return String(Number(value.toPrecision(6)));
}

const fmtUsd = (value: number) =>
  value.toLocaleString("en-US", { maximumFractionDigits: 2 });

// ─── Shared styles ────────────────────────────────────────────────────────────

const panelClass = "overflow-hidden rounded-xl border border-border bg-card";
const panelHeaderClass = "border-b border-border px-5 py-4";
const panelTitleClass =
  "text-sm font-semibold uppercase tracking-widest text-foreground";
const fieldLabelClass =
  "block text-xs font-medium uppercase tracking-widest text-muted-foreground";
const fieldInputClass = "font-mono text-sm";

const BAR_FILL: Record<string, string> = {
  "Fees Earned": "fill-accent",
  "IL Loss": "fill-primary",
};

// ─── Chart tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number }>;
}) {
  if (!active || !payload?.length) return null;
  const isFees = payload[0].name === "Fees Earned";
  return (
    <div className="rounded-lg border border-border bg-popover p-3 shadow-elevated">
      <p className="font-mono text-sm font-semibold tracking-wide text-popover-foreground">
        {payload[0].name}
      </p>
      <p
        className={cn(
          "font-mono text-sm",
          isFees ? "text-accent" : "text-primary",
        )}
      >
        ${fmtUsd(Math.abs(payload[0].value))}
      </p>
    </div>
  );
}

// ─── Field helper ─────────────────────────────────────────────────────────────

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className={fieldLabelClass}>
        {label}
      </Label>
      {children}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ILCalculatorPage() {
  const [form, setForm] = useState<FormValues>(DEFAULT_FORM);
  const [result, setResult] = useState<ILCalculatorResult | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [showFormula, setShowFormula] = useState(false);
  const [target, setTarget] = useState<LiveTarget | null>(null);
  const [pendingApply, setPendingApply] = useState(false);
  const [liveInfo, setLiveInfo] = useState<LiveInfo | null>(null);
  const [liveIssue, setLiveIssue] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const prices = useTokenPrices(target ? [target.id0, target.id1] : []);
  const fetchingPrices =
    useIsFetching({ queryKey: ["token-prices"] }) > 0 && target !== null;
  const liveLoading = target !== null && (prices.isLoading || fetchingPrices);
  const liveFailed = target !== null && !liveLoading && prices.isError;

  const { data: priceData, isError: priceError } = prices;

  // Apply fetched prices to the form once they arrive for a pending request.
  useEffect(() => {
    if (!pendingApply || !target || liveLoading || priceError) return;
    const p0 = priceData[target.id0];
    const p1 = priceData[target.id1];
    setPendingApply(false);
    if (!p0 || !p1) {
      setLiveIssue(
        "CoinGecko returned no price for one of the tokens. Enter prices manually.",
      );
      return;
    }
    const entryOf = (usd: number, change: number) =>
      change > -99.9 ? usd / (1 + change / 100) : usd;
    setForm((prev) => ({
      ...prev,
      token0Name: target.symbol0,
      token1Name: target.symbol1,
      token0CurrentPrice: formatPrice(p0.usd),
      token0InitialPrice: formatPrice(entryOf(p0.usd, p0.change24h)),
      token1CurrentPrice: formatPrice(p1.usd),
      token1InitialPrice: formatPrice(entryOf(p1.usd, p1.change24h)),
    }));
    setLiveInfo({
      symbol0: target.symbol0,
      symbol1: target.symbol1,
      at: new Date(),
    });
    setResult(null);
  }, [pendingApply, target, liveLoading, priceError, priceData]);

  const resetLive = () => {
    setTarget(null);
    setPendingApply(false);
    setLiveInfo(null);
    setLiveIssue(null);
  };

  const setField = (field: keyof FormValues, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setActivePreset(null);
    setResult(null);
    if (LIVE_FIELDS.includes(field)) resetLive();
  };

  const applyPreset = (presetId: string) => {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const v = preset.values;
    setForm({
      token0Name: v.token0Name,
      token1Name: v.token1Name,
      token0InitialPrice: String(v.token0InitialPrice),
      token0CurrentPrice: String(v.token0CurrentPrice),
      token1InitialPrice: String(v.token1InitialPrice),
      token1CurrentPrice: String(v.token1CurrentPrice),
      initialLiquidity: String(v.initialLiquidity),
      feeTier: v.feeTier,
      daysInPool: String(v.daysInPool),
    });
    setActivePreset(presetId);
    setResult(null);
    resetLive();
  };

  const handleUseLivePrices = () => {
    const symbol0 = form.token0Name.trim().toUpperCase() || "ETH";
    const symbol1 = form.token1Name.trim().toUpperCase() || "USDC";
    const id0 = COIN_IDS[symbol0];
    const id1 = COIN_IDS[symbol1];
    setLiveInfo(null);
    if (!id0 || !id1) {
      const unknown = [!id0 && symbol0, !id1 && symbol1]
        .filter(Boolean)
        .join(", ");
      setTarget(null);
      setPendingApply(false);
      setLiveIssue(
        `No live price source for ${unknown}. Supported: ${SUPPORTED_SYMBOLS}. You can still type prices manually.`,
      );
      return;
    }
    setLiveIssue(null);
    setPendingApply(true);
    setActivePreset(null);
    const same = target?.id0 === id0 && target?.id1 === id1;
    setTarget({ symbol0, symbol1, id0, id1 });
    if (same) prices.refetch();
  };

  const handleRetry = () => {
    setPendingApply(true);
    prices.refetch();
  };

  const handleCalculate = () => {
    setResult(
      calculateIL({
        token0Amount: 0,
        token1Amount: 0,
        token0PriceEntry: Number(form.token0InitialPrice),
        token1PriceEntry: Number(form.token1InitialPrice),
        token0PriceCurrent: Number(form.token0CurrentPrice),
        token1PriceCurrent: Number(form.token1CurrentPrice),
        feeRate: Number(form.feeTier) / 100,
        daysInPool: Number(form.daysInPool),
        initialLiquidity: Number(form.initialLiquidity),
      }),
    );
  };

  const positiveFields = [
    form.token0InitialPrice,
    form.token0CurrentPrice,
    form.token1InitialPrice,
    form.token1CurrentPrice,
    form.initialLiquidity,
  ];
  const days = parseNum(form.daysInPool);
  const isFormValid =
    positiveFields.every((v) => parseNum(v) > 0) &&
    Number.isFinite(days) &&
    days >= 0;

  const chartData = result
    ? [
        { name: "Fees Earned", value: result.feesEarned },
        { name: "IL Loss", value: result.ilUSD },
      ]
    : [];

  const netPositive = result ? result.netPnL >= 0 : true;

  return (
    <div data-ocid="il-calculator.page" className="min-h-full bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/30 bg-primary/10">
              <Calculator className="h-5 w-5 text-primary" aria-hidden />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-bold uppercase tracking-widest text-foreground">
                Impermanent Loss <span className="text-primary">Calc</span>
              </h1>
              <div className="mt-1 h-0.5 w-32 rounded-full bg-gradient-to-r from-primary to-transparent" />
              <p className="mt-1 text-sm tracking-wide text-muted-foreground">
                Estimate IL exposure and compare fee earnings against potential
                losses
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
        {/* Preset Buttons */}
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Quick Presets
            </p>
            <span
              className="demo-badge"
              data-ocid="il-calculator.presets.demo_badge"
            >
              Demo data
            </span>
            <span className="text-xs text-muted-foreground">
              Illustrative scenarios, not market quotes
            </span>
          </div>
          <div
            className="flex flex-wrap gap-2 sm:gap-2.5"
            data-ocid="il-calculator.presets"
          >
            {PRESETS.map((preset) => {
              const active = activePreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.id)}
                  data-ocid={`il-calculator.preset.${preset.id}`}
                  aria-pressed={active}
                  className={cn(
                    "transition-smooth flex min-h-[38px] items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold uppercase tracking-wider focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "border-primary/60 bg-primary/15 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  <Zap
                    className={cn(
                      "h-3 w-3 flex-shrink-0",
                      active ? "text-primary" : "text-muted-foreground",
                    )}
                    aria-hidden
                  />
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Input Form */}
          <div className="space-y-5">
            {/* Token Prices card */}
            <div className={panelClass}>
              <div
                className={cn(
                  panelHeaderClass,
                  "flex flex-wrap items-center justify-between gap-3",
                )}
              >
                <h2 className={panelTitleClass}>Token Prices</h2>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleUseLivePrices}
                  disabled={liveLoading}
                  data-ocid="il-calculator.use-live-prices.button"
                  className="gap-2 border-primary/50 text-primary hover:bg-primary/10 hover:text-primary"
                >
                  <Radio className="h-4 w-4" aria-hidden />
                  {liveLoading ? "Fetching…" : "Use live prices"}
                </Button>
              </div>

              <div className="space-y-5 p-5">
                <div aria-live="polite" className="space-y-3">
                  {liveLoading && (
                    <LoadingState
                      label="Fetching live prices from CoinGecko…"
                      className="py-4"
                    />
                  )}
                  {liveFailed && (
                    <div className="space-y-2">
                      <ErrorState
                        title="Live prices unavailable"
                        message="CoinGecko could not be reached. Enter prices manually below, or retry."
                        onRetry={handleRetry}
                        className="py-4"
                      />
                      <p
                        className="text-xs text-muted-foreground"
                        data-ocid="il-calculator.live.manual_hint"
                      >
                        Manual entry still works: type entry and current prices
                        and press Calculate.
                      </p>
                    </div>
                  )}
                  {liveIssue && !liveLoading && (
                    <p
                      role="alert"
                      data-ocid="il-calculator.live.error_state"
                      className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-foreground"
                    >
                      <AlertCircle
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive"
                        aria-hidden
                      />
                      {liveIssue}
                    </p>
                  )}
                  {liveInfo && !liveLoading && !liveFailed && (
                    <div
                      data-ocid="il-calculator.live.success_state"
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2"
                    >
                      <span className="live-badge">Live · CoinGecko</span>
                      <span className="text-xs text-foreground">
                        {liveInfo.symbol0}/{liveInfo.symbol1} filled at{" "}
                        {liveInfo.at.toLocaleTimeString()}
                      </span>
                    </div>
                  )}
                  <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    Set the token symbols, then use live prices. Current is the
                    live USD price; Entry is the price 24h ago derived from
                    CoinGecko's 24h change. Edit Entry to match your deposit.
                  </p>
                </div>

                {/* Token A */}
                <div className="space-y-3">
                  <div className="inline-flex items-center rounded border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
                    Token A
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Field id="il-token0-name" label="Symbol">
                      <Input
                        id="il-token0-name"
                        className={fieldInputClass}
                        placeholder="ETH"
                        value={form.token0Name}
                        onChange={(e) => setField("token0Name", e.target.value)}
                        data-ocid="il-calculator.token0-name.input"
                      />
                    </Field>
                    <Field id="il-token0-entry" label="Entry Price ($)">
                      <Input
                        id="il-token0-entry"
                        className={fieldInputClass}
                        type="number"
                        min="0"
                        step="any"
                        placeholder="3200"
                        value={form.token0InitialPrice}
                        onChange={(e) =>
                          setField("token0InitialPrice", e.target.value)
                        }
                        data-ocid="il-calculator.token0-initial-price.input"
                      />
                    </Field>
                    <Field id="il-token0-current" label="Current Price ($)">
                      <Input
                        id="il-token0-current"
                        className={fieldInputClass}
                        type="number"
                        min="0"
                        step="any"
                        placeholder="3840"
                        value={form.token0CurrentPrice}
                        onChange={(e) =>
                          setField("token0CurrentPrice", e.target.value)
                        }
                        data-ocid="il-calculator.token0-current-price.input"
                      />
                    </Field>
                  </div>
                </div>

                <div className="h-px bg-border" />

                {/* Token B */}
                <div className="space-y-3">
                  <div className="inline-flex items-center rounded border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-widest text-accent">
                    Token B
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Field id="il-token1-name" label="Symbol">
                      <Input
                        id="il-token1-name"
                        className={fieldInputClass}
                        placeholder="USDC"
                        value={form.token1Name}
                        onChange={(e) => setField("token1Name", e.target.value)}
                        data-ocid="il-calculator.token1-name.input"
                      />
                    </Field>
                    <Field id="il-token1-entry" label="Entry Price ($)">
                      <Input
                        id="il-token1-entry"
                        className={fieldInputClass}
                        type="number"
                        min="0"
                        step="any"
                        placeholder="1"
                        value={form.token1InitialPrice}
                        onChange={(e) =>
                          setField("token1InitialPrice", e.target.value)
                        }
                        data-ocid="il-calculator.token1-initial-price.input"
                      />
                    </Field>
                    <Field id="il-token1-current" label="Current Price ($)">
                      <Input
                        id="il-token1-current"
                        className={fieldInputClass}
                        type="number"
                        min="0"
                        step="any"
                        placeholder="1"
                        value={form.token1CurrentPrice}
                        onChange={(e) =>
                          setField("token1CurrentPrice", e.target.value)
                        }
                        data-ocid="il-calculator.token1-current-price.input"
                      />
                    </Field>
                  </div>
                </div>
              </div>
            </div>

            {/* Pool Parameters card */}
            <div className={panelClass}>
              <div className={panelHeaderClass}>
                <h2 className={panelTitleClass}>Pool Parameters</h2>
              </div>
              <div className="space-y-4 p-5">
                <Field id="il-liquidity" label="Initial Liquidity (USD)">
                  <Input
                    id="il-liquidity"
                    className={fieldInputClass}
                    type="number"
                    min="0"
                    step="any"
                    placeholder="10000"
                    value={form.initialLiquidity}
                    onChange={(e) =>
                      setField("initialLiquidity", e.target.value)
                    }
                    data-ocid="il-calculator.initial-liquidity.input"
                  />
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field id="il-fee-tier" label="Fee Tier">
                    <Select
                      value={form.feeTier}
                      onValueChange={(v) => setField("feeTier", v)}
                    >
                      <SelectTrigger
                        id="il-fee-tier"
                        className="w-full font-mono text-sm"
                        data-ocid="il-calculator.fee-tier.select"
                      >
                        <SelectValue placeholder="Select fee" />
                      </SelectTrigger>
                      <SelectContent>
                        {FEE_TIERS.map((tier) => (
                          <SelectItem
                            key={tier.value}
                            value={tier.value}
                            className="font-mono text-xs"
                          >
                            {tier.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field id="il-days" label="Days in Pool">
                    <Input
                      id="il-days"
                      className={fieldInputClass}
                      type="number"
                      min="0"
                      step="1"
                      placeholder="30"
                      value={form.daysInPool}
                      onChange={(e) => setField("daysInPool", e.target.value)}
                      data-ocid="il-calculator.days-in-pool.input"
                    />
                  </Field>
                </div>

                <Button
                  type="button"
                  className="mt-2 w-full gap-2 py-5 text-sm font-semibold uppercase tracking-widest"
                  disabled={!isFormValid}
                  onClick={handleCalculate}
                  data-ocid="il-calculator.calculate.submit_button"
                >
                  <Calculator className="h-4 w-4" aria-hidden />
                  Calculate Impermanent Loss
                </Button>
                {!isFormValid && (
                  <p className="text-center text-xs text-muted-foreground">
                    Enter positive prices and liquidity, plus days in pool, to
                    calculate.
                  </p>
                )}
              </div>
            </div>

            {/* Formula Info */}
            <div className={panelClass}>
              <button
                type="button"
                className="transition-smooth flex w-full items-center justify-between px-5 py-4 text-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setShowFormula((v) => !v)}
                aria-expanded={showFormula}
                data-ocid="il-calculator.formula-info.toggle"
              >
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-primary" aria-hidden />
                  <span className="text-sm font-medium uppercase tracking-wider">
                    How IL is Calculated
                  </span>
                </div>
                <span className="text-xs uppercase tracking-widest text-muted-foreground">
                  {showFormula ? "Hide" : "Show"}
                </span>
              </button>
              {showFormula && (
                <div className="space-y-3 border-t border-border px-5 pb-5 text-sm">
                  <div className="mt-4 rounded-lg border border-primary/25 bg-primary/5 p-3">
                    <p className="mb-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                      IL Formula
                    </p>
                    <p className="font-mono text-primary">
                      IL = 2√k / (1+k) − 1
                    </p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      where k = (P0_current / P0_entry) / (P1_current /
                      P1_entry)
                    </p>
                  </div>
                  <ul className="space-y-2">
                    {[
                      "IL occurs when the price ratio between tokens changes after you deposit.",
                      "AMMs rebalance your holdings automatically as prices diverge.",
                      "Stablecoin pairs (e.g. USDC/USDT) have near-zero IL risk.",
                      `Fees assume daily volume of ${DAILY_VOLUME_RATIO * 100}% of your liquidity at the chosen fee tier; real volume varies.`,
                    ].map((text) => (
                      <li
                        key={text}
                        className="flex gap-2 text-xs text-muted-foreground"
                      >
                        <span className="text-primary">›</span>
                        {text}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Results */}
          <div className="space-y-6">
            {!result ? (
              <div
                data-ocid="il-calculator.results.empty_state"
                className="state-panel state-panel-empty min-h-[280px]"
              >
                <span className="state-icon">
                  <Calculator className="h-5 w-5" aria-hidden />
                </span>
                <div className="space-y-1">
                  <p className="text-base font-semibold uppercase tracking-widest text-foreground">
                    No results yet
                  </p>
                  <p className="text-sm">
                    Fill in token prices, or use live prices, then Calculate
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs font-semibold uppercase tracking-widest text-primary">
                    Results
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                {/* Result Metrics */}
                <div className={panelClass}>
                  <div
                    className={cn(
                      panelHeaderClass,
                      "flex items-center justify-between",
                    )}
                  >
                    <h2 className={panelTitleClass}>Summary</h2>
                    <div
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded border px-3 py-1 text-xs font-semibold uppercase tracking-wider",
                        netPositive
                          ? "border-accent/40 bg-accent/10 text-accent"
                          : "border-destructive/40 bg-destructive/10 text-destructive",
                      )}
                    >
                      {netPositive ? (
                        <TrendingUp className="h-3 w-3" aria-hidden />
                      ) : (
                        <TrendingDown className="h-3 w-3" aria-hidden />
                      )}
                      Net {netPositive ? "Profit" : "Loss"}
                    </div>
                  </div>

                  <div
                    className="grid grid-cols-2 gap-3 p-5"
                    data-ocid="il-calculator.results.section"
                  >
                    <div className="col-span-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4">
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">
                        Impermanent Loss %
                      </p>
                      <p className="glow-destructive mt-1 font-mono text-4xl font-bold text-destructive">
                        -{result.ilPercent.toFixed(2)}%
                      </p>
                    </div>

                    <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-4">
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">
                        IL Dollar Loss
                      </p>
                      <p className="mt-1 font-mono text-xl font-bold text-destructive">
                        -${fmtUsd(result.ilUSD)}
                      </p>
                    </div>

                    <div className="rounded-xl border border-accent/30 bg-accent/5 p-4">
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">
                        Fees Earned (est.)
                      </p>
                      <p className="mt-1 font-mono text-xl font-bold text-accent">
                        +${fmtUsd(result.feesEarned)}
                      </p>
                    </div>

                    <div className="rounded-xl border border-border bg-muted/50 p-4">
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">
                        HODL Value
                      </p>
                      <p className="mt-1 font-mono text-lg font-semibold text-foreground">
                        ${fmtUsd(result.hodlValue)}
                      </p>
                    </div>

                    <div className="rounded-xl border border-border bg-muted/50 p-4">
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">
                        Pool Value
                      </p>
                      <p className="mt-1 font-mono text-lg font-semibold text-foreground">
                        ${fmtUsd(result.poolValue)}
                      </p>
                    </div>

                    <div
                      className={cn(
                        "col-span-2 rounded-xl border p-4",
                        netPositive
                          ? "border-accent/30 bg-accent/10"
                          : "border-destructive/30 bg-destructive/10",
                      )}
                    >
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">
                        Net P&amp;L
                      </p>
                      <p
                        className={cn(
                          "mt-1 font-mono text-2xl font-bold",
                          netPositive ? "text-accent" : "text-destructive",
                        )}
                      >
                        {netPositive ? "+" : "-"}$
                        {fmtUsd(Math.abs(result.netPnL))}
                      </p>
                    </div>
                  </div>

                  {result.breakEvenDays > 0 && (
                    <div className="mx-5 mb-5 flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3">
                      <AlertCircle
                        className="h-4 w-4 shrink-0 text-primary"
                        aria-hidden
                      />
                      <p className="text-sm text-muted-foreground">
                        You need approximately{" "}
                        <span className="font-mono font-semibold text-primary">
                          {result.breakEvenDays} days
                        </span>{" "}
                        in this pool to break even from fees vs IL.
                      </p>
                    </div>
                  )}
                </div>

                {/* Bar Chart */}
                <div className={panelClass}>
                  <div className={panelHeaderClass}>
                    <h2 className={panelTitleClass}>Fee vs IL Comparison</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Estimated fees earned vs impermanent loss
                    </p>
                  </div>
                  <div className="p-5">
                    <div
                      data-ocid="il-calculator.chart.section"
                      className="[&_.recharts-cartesian-grid_line]:stroke-border [&_.recharts-text]:fill-muted-foreground"
                    >
                      <ResponsiveContainer
                        width="100%"
                        height={isMobile ? 180 : 240}
                      >
                        <BarChart
                          data={chartData}
                          margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            vertical={false}
                          />
                          <XAxis
                            dataKey="name"
                            tick={{ fontSize: 11, fontWeight: 600 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tickFormatter={(v: number) =>
                              `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                            }
                            tick={{ fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip
                            content={<ChartTooltip />}
                            cursor={{ fillOpacity: 0.08 }}
                          />
                          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                            {chartData.map((entry) => (
                              <Cell
                                key={entry.name}
                                className={BAR_FILL[entry.name]}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-3 flex items-center justify-center gap-6">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-sm bg-accent" />
                        <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                          Fees Earned
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-sm bg-primary" />
                        <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                          IL Loss
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
