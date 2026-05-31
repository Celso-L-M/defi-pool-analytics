import { Breadcrumb } from "@/components/Breadcrumb";
import { HELP_TERMS, HelpIcon } from "@/components/HelpIcon";
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
import type { ILCalculatorInput, ILCalculatorResult } from "@/types/defi";
import {
  AlertCircle,
  Calculator,
  CheckCircle2,
  Info,
  KeyRound,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useState } from "react";
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

const PRESETS = [
  {
    id: "eth-usdc",
    label: "ETH/USDC 50/50",
    description: "Classic stablecoin pair",
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
    description: "Correlated volatile pair",
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
    description: "High-volatility pair",
    values: {
      token0Name: "SOL",
      token1Name: "USDC",
      token0InitialPrice: 148,
      token0CurrentPrice: 185,
      token1InitialPrice: 1,
      token1CurrentPrice: 1,
      initialLiquidity: 5000,
      feeTier: "0.25",
      daysInPool: 7,
    },
  },
  {
    id: "icp-ckbtc",
    label: "ICP/ckBTC",
    description: "ICP Principal pair",
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
    description: "Uniswap governance token",
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
    description: "PancakeSwap native pair",
    values: {
      token0Name: "CAKE",
      token1Name: "BNB",
      token0InitialPrice: 2.8,
      token0CurrentPrice: 3.4,
      token1InitialPrice: 580,
      token1CurrentPrice: 640,
      initialLiquidity: 6000,
      feeTier: "0.25",
      daysInPool: 30,
    },
  },
  {
    id: "ray-sol",
    label: "RAY/SOL",
    description: "Raydium liquidity pair",
    values: {
      token0Name: "RAY",
      token1Name: "SOL",
      token0InitialPrice: 1.8,
      token0CurrentPrice: 2.3,
      token1InitialPrice: 148,
      token1CurrentPrice: 185,
      initialLiquidity: 4000,
      feeTier: "0.25",
      daysInPool: 7,
    },
  },
];

// ─── IL Calculation ───────────────────────────────────────────────────────────

interface CalcInput extends ILCalculatorInput {
  initialLiquidity: number;
}

function calculateIL(input: CalcInput): ILCalculatorResult {
  const {
    token0PriceEntry,
    token0PriceCurrent,
    token1PriceEntry,
    token1PriceCurrent,
  } = input;

  const priceRatioEntry = token0PriceEntry / token1PriceEntry;
  const priceRatioCurrent = token0PriceCurrent / token1PriceCurrent;
  const k = priceRatioCurrent / priceRatioEntry;

  // IL formula: 2*sqrt(k)/(1+k) - 1
  const ilFactor = (2 * Math.sqrt(k)) / (1 + k) - 1;
  const ilPercent = ilFactor * 100;

  // HODL value: hold both tokens at 50/50 entry split
  const hodlValue =
    input.initialLiquidity * 0.5 * (token0PriceCurrent / token0PriceEntry) +
    input.initialLiquidity * 0.5 * (token1PriceCurrent / token1PriceEntry);

  // Pool value after IL
  const poolValue =
    input.initialLiquidity *
    (1 + ilFactor) *
    Math.sqrt(
      (token0PriceCurrent / token0PriceEntry) *
        (token1PriceCurrent / token1PriceEntry),
    );

  const ilUSD = Math.max(0, hodlValue - poolValue);

  // Estimated fees: use fee rate and volume approximation
  const annualFeeAPY = input.feeRate * 365 * 0.5;
  const dailyFeeRate = annualFeeAPY / 365 / 100;
  const feesEarned = input.initialLiquidity * dailyFeeRate * input.daysInPool;

  const netPnL = feesEarned - ilUSD;
  const breakEvenDays =
    ilUSD > 0 && dailyFeeRate > 0
      ? Math.ceil(ilUSD / (input.initialLiquidity * dailyFeeRate))
      : 0;

  return {
    ilPercent: Math.abs(ilPercent),
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
  icpPrincipal: string;
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
  icpPrincipal: "",
};

// ─── Glass card style helper ──────────────────────────────────────────────────

const glassCard: React.CSSProperties = {
  background: "rgba(13,13,13,0.85)",
  border: "1px solid rgba(0,163,255,0.18)",
  backdropFilter: "blur(10px)",
  boxShadow: "0 0 24px rgba(0,163,255,0.06), 0 8px 32px rgba(0,0,0,0.4)",
};

const inputStyle: React.CSSProperties = {
  background: "rgba(13,13,13,0.9)",
  border: "1px solid rgba(0,163,255,0.18)",
  color: "#e0e0e0",
  outline: "none",
  transition: "border-color 0.2s, box-shadow 0.2s",
};

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
  hodlValue,
  poolValue,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; fill: string }>;
  hodlValue?: number;
  poolValue?: number;
}) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  const isHodl =
    entry.name === "Fees Earned" ? false : entry.name === "IL Loss";
  // Compute percentage difference vs the other bar
  const otherVal = entry.name === "HODL Value" ? poolValue : hodlValue;
  const pct =
    otherVal && otherVal !== 0
      ? (((entry.value - otherVal) / Math.abs(otherVal)) * 100).toFixed(1)
      : null;
  void isHodl;
  return (
    <div
      className="rounded-lg p-3 min-w-[160px]"
      style={{
        background: "rgba(0,0,0,0.82)",
        border: "1px solid rgba(0,163,255,0.3)",
        backdropFilter: "blur(12px)",
        boxShadow: "0 0 16px rgba(0,163,255,0.15), 0 8px 24px rgba(0,0,0,0.5)",
      }}
    >
      <p
        className="font-mono text-xs font-semibold tracking-wider uppercase mb-1.5"
        style={{ color: "#909090" }}
      >
        {entry.name}
      </p>
      <p
        className="font-mono text-sm font-bold"
        style={{
          color: entry.fill,
          textShadow: `0 0 8px ${entry.fill}99`,
        }}
      >
        $
        {Math.abs(entry.value).toLocaleString("en-US", {
          maximumFractionDigits: 2,
        })}
      </p>
      {pct !== null && (
        <p
          className="mt-1 text-xs font-mono"
          style={{ color: Number(pct) >= 0 ? "#00FF88" : "#ff4466" }}
        >
          {Number(pct) >= 0 ? "+" : ""}
          {pct}% vs other
        </p>
      )}
    </div>
  );
}

// ─── GlowInput: input with electric blue focus glow ──────────────────────────

function GlowInput({
  id,
  type,
  placeholder,
  value,
  onChange,
  "data-ocid": dataOcid,
  className,
}: {
  id?: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  "data-ocid"?: string;
  className?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      id={id}
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      data-ocid={dataOcid}
      className={`rounded-lg px-3 py-2.5 w-full text-sm font-mono transition-smooth placeholder:text-[#444] ${className ?? ""}`}
      style={{
        ...inputStyle,
        borderColor: focused ? "rgba(0,163,255,0.6)" : "rgba(0,163,255,0.18)",
        boxShadow: focused
          ? "0 0 0 2px rgba(0,163,255,0.12), 0 0 12px rgba(0,163,255,0.1)"
          : "none",
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ILCalculatorPage() {
  const [form, setForm] = useState<FormValues>(DEFAULT_FORM);
  const [result, setResult] = useState<ILCalculatorResult | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [showFormula, setShowFormula] = useState(false);
  const isMobile = useIsMobile();

  const setField = (field: keyof FormValues, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setActivePreset(null);
    setResult(null);
  };

  const applyPreset = (presetId: string) => {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setForm({
      token0Name: preset.values.token0Name,
      token1Name: preset.values.token1Name,
      token0InitialPrice: String(preset.values.token0InitialPrice),
      token0CurrentPrice: String(preset.values.token0CurrentPrice),
      token1InitialPrice: String(preset.values.token1InitialPrice),
      token1CurrentPrice: String(preset.values.token1CurrentPrice),
      initialLiquidity: String(preset.values.initialLiquidity),
      feeTier: preset.values.feeTier,
      daysInPool: String(preset.values.daysInPool),
      icpPrincipal: form.icpPrincipal,
    });
    setActivePreset(presetId);
    setResult(null);
  };

  const handleCalculate = () => {
    const input: CalcInput = {
      token0Amount: 0,
      token1Amount: 0,
      token0PriceEntry: Number(form.token0InitialPrice),
      token1PriceEntry: Number(form.token1InitialPrice),
      token0PriceCurrent: Number(form.token0CurrentPrice),
      token1PriceCurrent: Number(form.token1CurrentPrice),
      feeRate: Number(form.feeTier) / 100,
      daysInPool: Number(form.daysInPool),
      initialLiquidity: Number(form.initialLiquidity),
    };
    setResult(calculateIL(input));
  };

  const isFormValid =
    form.token0InitialPrice &&
    form.token0CurrentPrice &&
    form.token1InitialPrice &&
    form.token1CurrentPrice &&
    form.initialLiquidity &&
    form.daysInPool;

  // Dynamic bar chart colors: HODL = blue, Pool = green if pool>hodl else red
  const poolBetter = result ? result.poolValue >= result.hodlValue : false;
  const chartData = result
    ? [
        { name: "HODL Value", value: result.hodlValue, fill: "#00A3FF" },
        {
          name: "Pool Value",
          value: result.poolValue,
          fill: poolBetter ? "#00FF88" : "#FF4466",
        },
      ]
    : [];

  return (
    <div
      data-ocid="il-calculator.page"
      style={{ background: "#0D0D0D", minHeight: "100%" }}
    >
      {/* Header */}
      <div
        className="px-6 py-6"
        style={{
          background: "rgba(13,13,13,0.9)",
          borderBottom: "1px solid rgba(0,163,255,0.15)",
          backdropFilter: "blur(8px)",
        }}
      >
        <div className="mx-auto max-w-6xl">
          {/* Breadcrumb */}
          <div className="mb-4">
            <Breadcrumb
              items={[{ label: "Home", href: "/" }, { label: "IL Calculator" }]}
            />
          </div>
          <div className="flex items-center gap-4">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-xl"
              style={{
                background: "rgba(0,163,255,0.12)",
                border: "1px solid rgba(0,163,255,0.3)",
                boxShadow: "0 0 16px rgba(0,163,255,0.15)",
              }}
            >
              <Calculator
                className="h-5 w-5"
                style={{
                  color: "#00A3FF",
                  filter: "drop-shadow(0 0 4px rgba(0,163,255,0.6))",
                }}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1
                  className="font-display text-2xl font-bold tracking-widest uppercase"
                  style={{ color: "#e0e0e0" }}
                >
                  Impermanent Loss{" "}
                  <span
                    style={{
                      color: "#00A3FF",
                      textShadow: "0 0 16px rgba(0,163,255,0.5)",
                    }}
                  >
                    Calc
                  </span>
                </h1>
                <HelpIcon term="ImpermanentLoss" />
              </div>
              <div
                className="mt-1 h-0.5 w-32 rounded-full"
                style={{
                  background:
                    "linear-gradient(90deg, #00A3FF 0%, transparent 100%)",
                  boxShadow: "0 0 8px rgba(0,163,255,0.6)",
                }}
              />
              <p
                className="text-sm mt-1 tracking-wide"
                style={{ color: "#909090" }}
              >
                Estimate IL exposure and compare fee earnings against potential
                losses
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
        {/* ICP Identity input */}
        <div
          className="rounded-xl p-4"
          style={{
            background: "rgba(13,13,13,0.8)",
            border:
              form.icpPrincipal &&
              /^[a-z0-9]{5}(-[a-z0-9]{5}){4,}(-[a-z0-9]{3})?$/.test(
                form.icpPrincipal.trim(),
              )
                ? "1px solid rgba(0,255,136,0.3)"
                : "1px solid rgba(0,163,255,0.15)",
            backdropFilter: "blur(8px)",
            boxShadow:
              form.icpPrincipal &&
              /^[a-z0-9]{5}(-[a-z0-9]{5}){4,}(-[a-z0-9]{3})?$/.test(
                form.icpPrincipal.trim(),
              )
                ? "0 0 12px rgba(0,255,136,0.08)"
                : "none",
            transition: "border-color 0.2s, box-shadow 0.2s",
          }}
        >
          {/* Section header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div
                className="flex h-6 w-6 items-center justify-center rounded"
                style={{
                  background: "rgba(0,163,255,0.1)",
                  border: "1px solid rgba(0,163,255,0.25)",
                }}
              >
                <KeyRound
                  className="h-3.5 w-3.5"
                  style={{
                    color: "#00A3FF",
                    filter: "drop-shadow(0 0 4px rgba(0,163,255,0.5))",
                  }}
                />
              </div>
              <label
                htmlFor="il-icp-principal"
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: "#c0c0c0" }}
              >
                ICP Identity
              </label>
            </div>
            {form.icpPrincipal &&
              /^[a-z0-9]{5}(-[a-z0-9]{5}){4,}(-[a-z0-9]{3})?$/.test(
                form.icpPrincipal.trim(),
              ) && (
                <div className="flex items-center gap-1.5">
                  <CheckCircle2
                    className="h-3.5 w-3.5"
                    style={{
                      color: "#00FF88",
                      filter: "drop-shadow(0 0 4px rgba(0,255,136,0.5))",
                    }}
                  />
                  <span
                    className="text-xs font-mono uppercase tracking-widest"
                    style={{ color: "#00FF88" }}
                  >
                    Valid Principal
                  </span>
                </div>
              )}
          </div>

          <GlowInput
            id="il-icp-principal"
            type="text"
            placeholder="xxxxx-xxxxx-xxxxx-cai"
            value={form.icpPrincipal}
            onChange={(e) => setField("icpPrincipal", e.target.value)}
            data-ocid="il-calculator.icp-principal.input"
          />

          {/* Helper text */}
          <div className="mt-2.5 flex items-start gap-2">
            <Info
              className="h-3.5 w-3.5 mt-0.5 shrink-0"
              style={{ color: "rgba(0,163,255,0.5)" }}
            />
            <p className="text-xs leading-relaxed" style={{ color: "#606060" }}>
              Enter your ICP principal to auto-load active ICPswap and KongSwap
              positions into the calculator. Your identity is never stored or
              transmitted beyond the on-chain canister lookup.
            </p>
          </div>
        </div>

        {/* Preset Buttons */}
        <div>
          <p
            className="mb-3 text-xs font-semibold uppercase tracking-widest"
            style={{ color: "#606060" }}
          >
            Quick Presets
          </p>
          <div
            className="flex flex-wrap gap-2 sm:gap-2.5"
            data-ocid="il-calculator.presets"
          >
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.id)}
                data-ocid={`il-calculator.preset.${preset.id}`}
                className="flex min-h-[38px] items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-smooth uppercase tracking-wider"
                style={{
                  background:
                    activePreset === preset.id
                      ? "rgba(0,163,255,0.18)"
                      : "rgba(13,13,13,0.8)",
                  border:
                    activePreset === preset.id
                      ? "1px solid rgba(0,163,255,0.5)"
                      : "1px solid rgba(0,163,255,0.15)",
                  color: activePreset === preset.id ? "#00A3FF" : "#909090",
                  boxShadow:
                    activePreset === preset.id
                      ? "0 0 12px rgba(0,163,255,0.2)"
                      : "none",
                }}
              >
                <Zap
                  className="h-3 w-3 flex-shrink-0"
                  style={{
                    color: activePreset === preset.id ? "#00A3FF" : "#606060",
                  }}
                />
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Input Form */}
          <div className="space-y-5">
            {/* Token Prices card */}
            <div className="rounded-xl overflow-hidden" style={glassCard}>
              <div
                className="px-5 py-4"
                style={{ borderBottom: "1px solid rgba(0,163,255,0.1)" }}
              >
                <h2
                  className="text-sm font-semibold uppercase tracking-widest"
                  style={{ color: "#e0e0e0" }}
                >
                  Token Prices
                </h2>
              </div>
              <div className="p-5 space-y-5">
                {/* Token A */}
                <div className="space-y-3">
                  <div
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold uppercase tracking-widest"
                    style={{
                      background: "rgba(0,163,255,0.1)",
                      border: "1px solid rgba(0,163,255,0.3)",
                      color: "#00A3FF",
                    }}
                  >
                    Token A
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label
                        className="text-xs uppercase tracking-widest block"
                        style={{ color: "#606060" }}
                      >
                        Symbol
                      </Label>
                      <GlowInput
                        placeholder="ETH"
                        value={form.token0Name}
                        onChange={(e) => setField("token0Name", e.target.value)}
                        data-ocid="il-calculator.token0-name.input"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label
                        className="text-xs uppercase tracking-widest block"
                        style={{ color: "#606060" }}
                      >
                        Entry Price ($)
                      </Label>
                      <GlowInput
                        type="number"
                        placeholder="3200"
                        value={form.token0InitialPrice}
                        onChange={(e) =>
                          setField("token0InitialPrice", e.target.value)
                        }
                        data-ocid="il-calculator.token0-initial-price.input"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label
                        className="text-xs uppercase tracking-widest block"
                        style={{ color: "#606060" }}
                      >
                        Current Price ($)
                      </Label>
                      <GlowInput
                        type="number"
                        placeholder="3840"
                        value={form.token0CurrentPrice}
                        onChange={(e) =>
                          setField("token0CurrentPrice", e.target.value)
                        }
                        data-ocid="il-calculator.token0-current-price.input"
                      />
                    </div>
                  </div>
                </div>

                <div
                  className="h-px"
                  style={{ background: "rgba(0,163,255,0.08)" }}
                />

                {/* Token B */}
                <div className="space-y-3">
                  <div
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold uppercase tracking-widest"
                    style={{
                      background: "rgba(0,255,136,0.08)",
                      border: "1px solid rgba(0,255,136,0.25)",
                      color: "#00FF88",
                    }}
                  >
                    Token B
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label
                        className="text-xs uppercase tracking-widest block"
                        style={{ color: "#606060" }}
                      >
                        Symbol
                      </Label>
                      <GlowInput
                        placeholder="USDC"
                        value={form.token1Name}
                        onChange={(e) => setField("token1Name", e.target.value)}
                        data-ocid="il-calculator.token1-name.input"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label
                        className="text-xs uppercase tracking-widest block"
                        style={{ color: "#606060" }}
                      >
                        Entry Price ($)
                      </Label>
                      <GlowInput
                        type="number"
                        placeholder="1"
                        value={form.token1InitialPrice}
                        onChange={(e) =>
                          setField("token1InitialPrice", e.target.value)
                        }
                        data-ocid="il-calculator.token1-initial-price.input"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label
                        className="text-xs uppercase tracking-widest block"
                        style={{ color: "#606060" }}
                      >
                        Current Price ($)
                      </Label>
                      <GlowInput
                        type="number"
                        placeholder="1"
                        value={form.token1CurrentPrice}
                        onChange={(e) =>
                          setField("token1CurrentPrice", e.target.value)
                        }
                        data-ocid="il-calculator.token1-current-price.input"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Pool Parameters card */}
            <div className="rounded-xl overflow-hidden" style={glassCard}>
              <div
                className="px-5 py-4"
                style={{ borderBottom: "1px solid rgba(0,163,255,0.1)" }}
              >
                <h2
                  className="text-sm font-semibold uppercase tracking-widest"
                  style={{ color: "#e0e0e0" }}
                >
                  Pool Parameters
                </h2>
              </div>
              <div className="p-5 space-y-4">
                <div className="space-y-1.5">
                  <Label
                    className="text-xs uppercase tracking-widest block"
                    style={{ color: "#606060" }}
                  >
                    Initial Liquidity (USD)
                  </Label>
                  <GlowInput
                    type="number"
                    placeholder="10000"
                    value={form.initialLiquidity}
                    onChange={(e) =>
                      setField("initialLiquidity", e.target.value)
                    }
                    data-ocid="il-calculator.initial-liquidity.input"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <Label
                        className="text-xs uppercase tracking-widest block"
                        style={{ color: "#606060" }}
                      >
                        Fee Tier
                      </Label>
                    </div>
                    <Select
                      value={form.feeTier}
                      onValueChange={(v) => setField("feeTier", v)}
                    >
                      <SelectTrigger
                        className="w-full rounded-lg px-3 py-2.5 text-sm font-mono h-auto"
                        style={inputStyle}
                        data-ocid="il-calculator.fee-tier.select"
                      >
                        <SelectValue placeholder="Select fee" />
                      </SelectTrigger>
                      <SelectContent
                        style={{
                          background: "rgba(13,13,13,0.97)",
                          border: "1px solid rgba(0,163,255,0.25)",
                          backdropFilter: "blur(12px)",
                        }}
                      >
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
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <Label
                        className="text-xs uppercase tracking-widest block"
                        style={{ color: "#606060" }}
                      >
                        Fee APY
                      </Label>
                      <HelpIcon term="APY" />
                    </div>
                    <GlowInput
                      type="number"
                      placeholder="30"
                      value={form.daysInPool}
                      onChange={(e) => setField("daysInPool", e.target.value)}
                      data-ocid="il-calculator.days-in-pool.input"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  className="mt-2 w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold uppercase tracking-widest transition-smooth"
                  disabled={!isFormValid}
                  onClick={handleCalculate}
                  data-ocid="il-calculator.calculate.submit_button"
                  style={{
                    background: isFormValid
                      ? "linear-gradient(135deg, rgba(0,163,255,0.25) 0%, rgba(0,163,255,0.1) 100%)"
                      : "rgba(13,13,13,0.5)",
                    border: isFormValid
                      ? "1px solid rgba(0,163,255,0.5)"
                      : "1px solid rgba(255,255,255,0.06)",
                    color: isFormValid ? "#00A3FF" : "#444",
                    boxShadow: isFormValid
                      ? "0 0 20px rgba(0,163,255,0.15), inset 0 1px 0 rgba(0,163,255,0.1)"
                      : "none",
                    cursor: isFormValid ? "pointer" : "not-allowed",
                  }}
                >
                  <Calculator
                    className="h-4 w-4"
                    style={{
                      filter: isFormValid
                        ? "drop-shadow(0 0 4px rgba(0,163,255,0.6))"
                        : "none",
                    }}
                  />
                  Calculate Impermanent Loss
                </button>
              </div>
            </div>

            {/* Formula Info */}
            <div className="rounded-xl overflow-hidden" style={glassCard}>
              <button
                type="button"
                className="flex w-full items-center justify-between px-5 py-4 transition-smooth"
                onClick={() => setShowFormula((v) => !v)}
                data-ocid="il-calculator.formula-info.toggle"
                style={{ color: "#e0e0e0" }}
              >
                <div className="flex items-center gap-2">
                  <Info
                    className="h-4 w-4"
                    style={{
                      color: "#00A3FF",
                      filter: "drop-shadow(0 0 4px rgba(0,163,255,0.5))",
                    }}
                  />
                  <span className="text-sm font-medium uppercase tracking-wider">
                    How IL is Calculated
                  </span>
                </div>
                <span
                  className="text-xs uppercase tracking-widest"
                  style={{ color: "#606060" }}
                >
                  {showFormula ? "Hide" : "Show"}
                </span>
              </button>
              {showFormula && (
                <div
                  className="px-5 pb-5 space-y-3 text-sm"
                  style={{ borderTop: "1px solid rgba(0,163,255,0.08)" }}
                >
                  <div
                    className="mt-4 rounded-lg p-3"
                    style={{
                      background: "rgba(0,163,255,0.05)",
                      border: "1px solid rgba(0,163,255,0.15)",
                    }}
                  >
                    <p
                      className="mb-1 font-mono text-xs uppercase tracking-widest"
                      style={{ color: "#606060" }}
                    >
                      IL Formula
                    </p>
                    <p
                      className="font-mono"
                      style={{
                        color: "#00A3FF",
                        textShadow: "0 0 8px rgba(0,163,255,0.4)",
                      }}
                    >
                      IL = 2√k / (1+k) − 1
                    </p>
                    <p
                      className="mt-1 font-mono text-xs"
                      style={{ color: "#606060" }}
                    >
                      where k = (P1_current / P1_entry) / (P0_current /
                      P0_entry)
                    </p>
                  </div>
                  <ul className="space-y-2">
                    {[
                      "IL occurs when the price ratio between tokens changes after you deposit.",
                      "AMMs rebalance your holdings automatically as prices diverge.",
                      "Stablecoin pairs (e.g. USDC/USDT) have near-zero IL risk.",
                      "Fees earned can offset IL — compare in the chart to find your break-even.",
                    ].map((text) => (
                      <li
                        key={text}
                        className="flex gap-2 text-xs"
                        style={{ color: "#909090" }}
                      >
                        <span style={{ color: "#00A3FF" }}>›</span>
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
                className="rounded-xl flex flex-col items-center justify-center gap-4 text-center"
                style={{
                  ...glassCard,
                  minHeight: 320,
                  padding: 48,
                }}
              >
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-full"
                  style={{
                    background: "rgba(0,163,255,0.08)",
                    border: "1px solid rgba(0,163,255,0.2)",
                    boxShadow: "0 0 24px rgba(0,163,255,0.08)",
                  }}
                >
                  <Calculator
                    className="h-8 w-8"
                    style={{ color: "rgba(0,163,255,0.4)" }}
                  />
                </div>
                <div>
                  <p
                    className="text-base font-semibold uppercase tracking-widest mb-2"
                    style={{ color: "#e0e0e0" }}
                  >
                    Calculate Your IL
                  </p>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: "#606060" }}
                  >
                    Enter token prices and amounts above to calculate your
                    impermanent loss
                  </p>
                </div>
                <div
                  className="rounded-lg px-4 py-3 text-left max-w-xs"
                  style={{
                    background: "rgba(0,163,255,0.05)",
                    border: "1px solid rgba(0,163,255,0.15)",
                  }}
                >
                  <p
                    className="text-xs font-semibold uppercase tracking-widest mb-1"
                    style={{ color: "#00A3FF" }}
                  >
                    What is IL?
                  </p>
                  <p
                    className="text-xs leading-relaxed"
                    style={{ color: "#909090" }}
                  >
                    Impermanent Loss occurs when the price of your deposited
                    tokens changes compared to when you deposited them in an AMM
                    liquidity pool. The greater the price divergence, the larger
                    the loss relative to simply holding.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Results label divider */}
                <div className="flex items-center gap-3">
                  <div
                    className="h-px flex-1"
                    style={{ background: "rgba(0,163,255,0.15)" }}
                  />
                  <span
                    className="text-xs font-semibold uppercase tracking-widest"
                    style={{ color: "#00A3FF" }}
                  >
                    Results
                  </span>
                  <div
                    className="h-px flex-1"
                    style={{ background: "rgba(0,163,255,0.15)" }}
                  />
                </div>

                {/* Result Metrics */}
                <div className="rounded-xl overflow-hidden" style={glassCard}>
                  <div
                    className="px-5 py-4 flex items-center justify-between"
                    style={{ borderBottom: "1px solid rgba(0,163,255,0.1)" }}
                  >
                    <h2
                      className="text-sm font-semibold uppercase tracking-widest"
                      style={{ color: "#e0e0e0" }}
                    >
                      Summary
                    </h2>
                    <div
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold uppercase tracking-wider"
                      style={{
                        background:
                          result.netPnL >= 0
                            ? "rgba(0,255,136,0.1)"
                            : "rgba(255,68,102,0.1)",
                        border:
                          result.netPnL >= 0
                            ? "1px solid rgba(0,255,136,0.3)"
                            : "1px solid rgba(255,68,102,0.3)",
                        color: result.netPnL >= 0 ? "#00FF88" : "#ff4466",
                      }}
                    >
                      {result.netPnL >= 0 ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      Net {result.netPnL >= 0 ? "Profit" : "Loss"}
                    </div>
                  </div>

                  <div
                    className="grid grid-cols-2 gap-3 p-5"
                    data-ocid="il-calculator.results.section"
                  >
                    {/* IL % — prominent with dynamic color */}
                    <div
                      className="rounded-xl p-4 col-span-2"
                      style={{
                        background: poolBetter
                          ? "rgba(0,255,136,0.06)"
                          : "rgba(255,68,102,0.06)",
                        border: poolBetter
                          ? "1px solid rgba(0,255,136,0.2)"
                          : "1px solid rgba(255,68,102,0.2)",
                      }}
                    >
                      <p
                        className="text-xs uppercase tracking-widest"
                        style={{ color: "#606060" }}
                      >
                        Impermanent Loss %
                      </p>
                      <p
                        className="mt-1 font-mono text-2xl font-bold"
                        style={{
                          color: poolBetter ? "#00FF88" : "#ff4466",
                          textShadow: poolBetter
                            ? "0 0 16px rgba(0,255,136,0.6), 0 0 32px rgba(0,255,136,0.3)"
                            : "0 0 16px rgba(255,68,102,0.6), 0 0 32px rgba(255,68,102,0.3)",
                        }}
                      >
                        {poolBetter ? "+" : "-"}
                        {result.ilPercent.toFixed(2)}%
                      </p>
                      <p
                        className="mt-0.5 text-xs"
                        style={{ color: "#606060" }}
                      >
                        {poolBetter
                          ? "Pool is outperforming HODL strategy"
                          : "Pool is underperforming vs HODL strategy"}
                      </p>
                    </div>

                    <div
                      className="rounded-xl p-4"
                      style={{
                        background: "rgba(255,68,102,0.04)",
                        border: "1px solid rgba(255,68,102,0.12)",
                      }}
                    >
                      <p
                        className="text-xs uppercase tracking-widest"
                        style={{ color: "#606060" }}
                      >
                        IL Dollar Loss
                      </p>
                      <p
                        className="mt-1 font-mono text-xl font-bold"
                        style={{
                          color: "#ff4466",
                          textShadow: "0 0 10px rgba(255,68,102,0.5)",
                        }}
                      >
                        -$
                        {result.ilUSD.toLocaleString("en-US", {
                          maximumFractionDigits: 2,
                        })}
                      </p>
                    </div>

                    <div
                      className="rounded-xl p-4"
                      style={{
                        background: "rgba(0,255,136,0.04)",
                        border: "1px solid rgba(0,255,136,0.12)",
                      }}
                    >
                      <p
                        className="text-xs uppercase tracking-widest"
                        style={{ color: "#606060" }}
                      >
                        Fees Earned (est.)
                      </p>
                      <p
                        className="mt-1 font-mono text-xl font-bold"
                        style={{
                          color: "#00FF88",
                          textShadow: "0 0 10px rgba(0,255,136,0.5)",
                        }}
                      >
                        +$
                        {result.feesEarned.toLocaleString("en-US", {
                          maximumFractionDigits: 2,
                        })}
                      </p>
                    </div>

                    <div
                      className="rounded-xl p-4"
                      style={{
                        background: "rgba(0,163,255,0.04)",
                        border: "1px solid rgba(0,163,255,0.12)",
                      }}
                    >
                      <p
                        className="text-xs uppercase tracking-widest"
                        style={{ color: "#606060" }}
                      >
                        HODL Value
                      </p>
                      <p
                        className="mt-1 font-mono text-lg font-semibold"
                        style={{
                          color: "#00A3FF",
                          textShadow: "0 0 8px rgba(0,163,255,0.4)",
                        }}
                      >
                        $
                        {result.hodlValue.toLocaleString("en-US", {
                          maximumFractionDigits: 2,
                        })}
                      </p>
                    </div>

                    <div
                      className="rounded-xl p-4"
                      style={{
                        background: poolBetter
                          ? "rgba(0,255,136,0.04)"
                          : "rgba(255,68,102,0.04)",
                        border: poolBetter
                          ? "1px solid rgba(0,255,136,0.12)"
                          : "1px solid rgba(255,68,102,0.12)",
                      }}
                    >
                      <p
                        className="text-xs uppercase tracking-widest"
                        style={{ color: "#606060" }}
                      >
                        Pool Value
                      </p>
                      <p
                        className="mt-1 font-mono text-lg font-semibold"
                        style={{
                          color: poolBetter ? "#00FF88" : "#ff4466",
                          textShadow: poolBetter
                            ? "0 0 8px rgba(0,255,136,0.4)"
                            : "0 0 8px rgba(255,68,102,0.4)",
                        }}
                      >
                        $
                        {result.poolValue.toLocaleString("en-US", {
                          maximumFractionDigits: 2,
                        })}
                      </p>
                    </div>

                    <div
                      className="rounded-xl p-4 col-span-2"
                      style={{
                        background:
                          result.netPnL >= 0
                            ? "rgba(0,255,136,0.06)"
                            : "rgba(255,68,102,0.06)",
                        border:
                          result.netPnL >= 0
                            ? "1px solid rgba(0,255,136,0.2)"
                            : "1px solid rgba(255,68,102,0.2)",
                      }}
                    >
                      <p
                        className="text-xs uppercase tracking-widest"
                        style={{ color: "#606060" }}
                      >
                        Net P&amp;L
                      </p>
                      <p
                        className="mt-1 font-mono text-2xl font-bold"
                        style={{
                          color: result.netPnL >= 0 ? "#00FF88" : "#ff4466",
                          textShadow:
                            result.netPnL >= 0
                              ? "0 0 12px rgba(0,255,136,0.5)"
                              : "0 0 12px rgba(255,68,102,0.5)",
                        }}
                      >
                        {result.netPnL >= 0 ? "+" : ""}$
                        {result.netPnL.toLocaleString("en-US", {
                          maximumFractionDigits: 2,
                        })}
                      </p>
                    </div>
                  </div>

                  {result.breakEvenDays > 0 && (
                    <div
                      className="mx-5 mb-5 flex items-center gap-2 rounded-lg px-4 py-3"
                      style={{
                        background: "rgba(0,163,255,0.06)",
                        border: "1px solid rgba(0,163,255,0.2)",
                      }}
                    >
                      <AlertCircle
                        className="h-4 w-4 shrink-0"
                        style={{ color: "#00A3FF" }}
                      />
                      <p className="text-sm" style={{ color: "#909090" }}>
                        You need approximately{" "}
                        <span
                          className="font-semibold font-mono"
                          style={{
                            color: "#00A3FF",
                            textShadow: "0 0 8px rgba(0,163,255,0.5)",
                          }}
                        >
                          {result.breakEvenDays} days
                        </span>{" "}
                        in this pool to break even from fees vs IL.
                      </p>
                    </div>
                  )}
                </div>

                {/* Bar Chart */}
                <div className="rounded-xl overflow-hidden" style={glassCard}>
                  <div
                    className="px-5 py-4"
                    style={{ borderBottom: "1px solid rgba(0,163,255,0.1)" }}
                  >
                    <h2
                      className="text-sm font-semibold uppercase tracking-widest"
                      style={{ color: "#e0e0e0" }}
                    >
                      HODL vs Pool Value
                    </h2>
                    <p className="text-xs mt-0.5" style={{ color: "#606060" }}>
                      HODL strategy (blue) vs LP pool value (
                      {poolBetter
                        ? "green = outperforming"
                        : "red = underperforming"}
                      )
                    </p>
                  </div>
                  <div className="p-5">
                    <div data-ocid="il-calculator.chart.section">
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
                            stroke="rgba(0,163,255,0.08)"
                            vertical={false}
                          />
                          <XAxis
                            dataKey="name"
                            tick={{
                              fill: "#606060",
                              fontSize: 11,
                              fontFamily: "var(--font-mono)",
                              fontWeight: 600,
                            }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tickFormatter={(v: number) =>
                              `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                            }
                            tick={{
                              fill: "#606060",
                              fontSize: 10,
                              fontFamily: "var(--font-mono)",
                            }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip
                            content={
                              <ChartTooltip
                                hodlValue={result.hodlValue}
                                poolValue={result.poolValue}
                              />
                            }
                          />
                          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                            {chartData.map((entry) => (
                              <Cell
                                key={entry.name}
                                fill={entry.fill}
                                style={{
                                  filter: `drop-shadow(0 0 8px ${entry.fill}66)`,
                                }}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-3 flex items-center justify-center gap-6">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-sm"
                          style={{
                            background: "#00A3FF",
                            boxShadow: "0 0 6px rgba(0,163,255,0.6)",
                          }}
                        />
                        <span
                          className="text-xs uppercase tracking-widest font-mono"
                          style={{ color: "#909090" }}
                        >
                          HODL Value
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-sm"
                          style={{
                            background: poolBetter ? "#00FF88" : "#FF4466",
                            boxShadow: poolBetter
                              ? "0 0 6px rgba(0,255,136,0.6)"
                              : "0 0 6px rgba(255,68,102,0.6)",
                          }}
                        />
                        <span
                          className="text-xs uppercase tracking-widest font-mono"
                          style={{ color: "#909090" }}
                        >
                          Pool Value
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
