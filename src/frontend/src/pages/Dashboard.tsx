import { Breadcrumb } from "@/components/Breadcrumb";
import { DataSourceBadge } from "@/components/DataSourceBadge";
import { PercentChange } from "@/components/PercentChange";
import { ProtocolBadge } from "@/components/ProtocolBadge";
import { MOCK_POOLS, MOCK_POSITIONS, PROTOCOL_METADATA } from "@/data/mockData";
import { cn } from "@/lib/utils";
import type { Pool, Protocol } from "@/types/defi";
import { toast } from "@/utils/toast";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowUpRight,
  BarChart2,
  Droplets,
  Flame,
  LayoutDashboard,
  Star,
  TrendingDown,
  TrendingUp,
  Trophy,
  Waves,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

// ─── Constants ───────────────────────────────────────────────────────────────

const ELECTRIC_BLUE = "#00A3FF";
const NEON_GREEN = "#00FF88";
const DANGER_RED = "#FF4466";

const PROTOCOL_COLORS: Record<Protocol, string> = {
  uniswap: "#ec4899",
  pancakeswap: "#f59e0b",
  raydium: "#a855f7",
  icp: ELECTRIC_BLUE,
};

const GLASS_TOOLTIP_STYLE = {
  background: "rgba(13,13,13,0.95)",
  border: `1px solid ${ELECTRIC_BLUE}40`,
  borderRadius: 10,
  fontSize: 12,
  color: "#e0e0e0",
  backdropFilter: "blur(12px)",
  boxShadow: `0 0 20px ${ELECTRIC_BLUE}20`,
};

// Mock KPI change values — positive/negative per requirement
const KPI_CHANGES = {
  tvl: 2.3,
  volume: -1.1,
  fees: 4.2,
  apy: 0.5,
};

// Simulated last-updated timestamp ("just now" on load)
const LAST_UPDATED = new Date(Date.now() - 45_000);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatUSD(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function useSimulatedLoading(delayMs = 900): boolean {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);
  return loading;
}

// ─── Glass Card Primitive ────────────────────────────────────────────────────

function GlassCard({
  children,
  className,
  ocid,
  hover = true,
}: {
  children: React.ReactNode;
  className?: string;
  ocid?: string;
  hover?: boolean;
}) {
  return (
    <div
      data-ocid={ocid}
      className={cn(
        "rounded-xl overflow-hidden",
        "border transition-all duration-300 ease-out",
        hover && [
          "hover:-translate-y-0.5 hover:scale-[1.01]",
          "hover:border-[rgba(0,163,255,0.4)]",
          "hover:shadow-[0_0_24px_rgba(0,163,255,0.12),0_8px_24px_-4px_rgba(0,0,0,0.3)]",
        ],
        className,
      )}
      style={{
        background: "rgba(13,13,13,0.8)",
        borderColor: "rgba(0,163,255,0.15)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
    >
      {children}
    </div>
  );
}

// ─── Section Heading ─────────────────────────────────────────────────────────

function SectionHeading({
  icon: Icon,
  label,
  iconColor,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  iconColor?: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <span
        style={{ color: iconColor ?? ELECTRIC_BLUE }}
        className="flex-shrink-0 flex"
      >
        <Icon className="w-3.5 h-3.5" />
      </span>
      <span
        className="text-[10px] font-bold uppercase tracking-[2px] font-mono"
        style={{ color: "#909090" }}
      >
        {label}
      </span>
      <div
        className="flex-1 h-px ml-1"
        style={{
          background: `linear-gradient(to right, ${iconColor ?? ELECTRIC_BLUE}40, transparent)`,
        }}
      />
    </div>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

interface KPICardProps {
  label: string;
  value: string;
  change: number;
  icon: React.ComponentType<{ className?: string }>;
  ocid: string;
  glowColor?: "blue" | "green" | "neutral";
  source:
    | "ICPSwap"
    | "KongSwap"
    | "Uniswap"
    | "PancakeSwap"
    | "Raydium"
    | "Binance"
    | "Mock";
  visible?: boolean;
}

function KPICard({
  label,
  value,
  change,
  icon: Icon,
  ocid,
  glowColor = "neutral",
  source,
  visible,
}: KPICardProps) {
  const glowStyle =
    glowColor === "green"
      ? {
          textShadow: `0 0 10px ${NEON_GREEN}99, 0 0 20px ${NEON_GREEN}55`,
          color: NEON_GREEN,
        }
      : glowColor === "blue"
        ? {
            textShadow: `0 0 10px ${ELECTRIC_BLUE}99, 0 0 20px ${ELECTRIC_BLUE}55`,
            color: ELECTRIC_BLUE,
          }
        : { color: "#e0e0e0" };

  return (
    <GlassCard ocid={ocid} hover>
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <p
            className="text-[10px] font-bold uppercase tracking-[1.5px] font-mono"
            style={{ color: "#909090" }}
          >
            {label}
          </p>
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{
              background: `${glowColor === "green" ? NEON_GREEN : ELECTRIC_BLUE}15`,
              border: `1px solid ${glowColor === "green" ? NEON_GREEN : ELECTRIC_BLUE}30`,
            }}
          >
            <span
              style={{
                color: glowColor === "green" ? NEON_GREEN : ELECTRIC_BLUE,
              }}
              className="flex"
            >
              <Icon className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>

        {/* Value with transition */}
        <p
          className={cn(
            "font-mono text-3xl md:text-4xl font-bold tracking-tight transition-all duration-300",
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1",
          )}
          style={glowStyle}
        >
          {value}
        </p>

        {/* Percent change indicator */}
        <div className="flex items-center gap-2 mt-1.5">
          <PercentChange value={change} size="sm" />
          <span className="text-xs" style={{ color: "#909090" }}>
            vs yesterday
          </span>
        </div>

        {/* Data source badge */}
        <div
          className="mt-2 pt-2"
          style={{ borderTop: "1px solid rgba(0,163,255,0.08)" }}
        >
          <DataSourceBadge
            source={source}
            lastUpdated={LAST_UPDATED}
            showTimestamp
          />
        </div>
      </div>
    </GlassCard>
  );
}

// ─── Top Performer Feature Card ───────────────────────────────────────────────

function TopPerformerCard({
  pool,
  type,
  visible,
}: {
  pool: Pool;
  type: "apy" | "volume";
  visible: boolean;
}) {
  const isAPY = type === "apy";
  const accentColor = isAPY ? NEON_GREEN : ELECTRIC_BLUE;
  const label = isAPY ? "Best APY" : "Highest Volume";
  const metricLabel = isAPY ? "APY" : "24h Volume";
  const metricValue = isAPY
    ? `${pool.apy.current.toFixed(1)}%`
    : formatUSD(pool.stats.volume24h);
  const Icon = isAPY ? Trophy : Flame;
  const ocid = isAPY
    ? "dashboard.top_performer.apy"
    : "dashboard.top_performer.volume";

  return (
    <div
      data-ocid={ocid}
      className="relative rounded-xl overflow-hidden p-5 transition-all duration-300"
      style={{
        background: `linear-gradient(135deg, rgba(13,13,13,0.92) 0%, ${accentColor}08 100%)`,
        border: `1px solid ${accentColor}35`,
        boxShadow: `0 0 30px ${accentColor}12, inset 0 1px 0 ${accentColor}18`,
        backdropFilter: "blur(12px)",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.boxShadow = `0 0 40px ${accentColor}22, inset 0 1px 0 ${accentColor}25`;
        el.style.borderColor = `${accentColor}55`;
        el.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.boxShadow = `0 0 30px ${accentColor}12, inset 0 1px 0 ${accentColor}18`;
        el.style.borderColor = `${accentColor}35`;
        el.style.transform = "";
      }}
    >
      {/* Decorative corner glow */}
      <div
        className="absolute top-0 right-0 w-24 h-24 rounded-full pointer-events-none"
        style={{
          background: `radial-gradient(circle, ${accentColor}18 0%, transparent 70%)`,
          transform: "translate(30%, -30%)",
        }}
      />

      <div className="flex items-start justify-between mb-3">
        <div>
          <span
            className="text-[10px] font-bold uppercase tracking-[2px] font-mono"
            style={{ color: "#909090" }}
          >
            {label}
          </span>
          <div className="flex items-center gap-2 mt-1">
            <ProtocolBadge protocol={pool.protocol} size="sm" />
            <span className="text-xs" style={{ color: "#909090" }}>
              {pool.chain}
            </span>
          </div>
        </div>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: `${accentColor}15`,
            border: `1px solid ${accentColor}35`,
          }}
        >
          <Icon className="w-4 h-4" style={{ color: accentColor }} />
        </div>
      </div>

      <p className="font-medium text-base mb-1" style={{ color: "#e0e0e0" }}>
        {pool.name}
      </p>

      <p
        className={cn(
          "font-mono text-3xl font-bold tracking-tight transition-all duration-300",
          visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
        )}
        style={{
          color: accentColor,
          textShadow: `0 0 16px ${accentColor}80, 0 0 32px ${accentColor}40`,
        }}
      >
        {metricValue}
      </p>

      <div className="flex items-center gap-3 mt-2">
        <span
          className="text-[10px] font-mono uppercase tracking-wide"
          style={{ color: "#909090" }}
        >
          {metricLabel}
        </span>
        {isAPY && <PercentChange value={pool.apy.day1Change} size="sm" />}
      </div>
    </div>
  );
}

// ─── Top APY Pool Row ────────────────────────────────────────────────────────

function TopAPYPoolRow({ pool, rank }: { pool: Pool; rank: number }) {
  const isUp = pool.apy.day1Change >= 0;
  return (
    <div
      data-ocid={`dashboard.top_apy.item.${rank}`}
      className="flex items-center gap-3 py-2.5 px-3 rounded-lg transition-all duration-200 group cursor-default"
      style={{ borderBottom: "1px solid rgba(0,163,255,0.06)" }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background =
          "rgba(0,163,255,0.06)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = "transparent";
      }}
    >
      <span
        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 font-mono"
        style={{
          background:
            rank <= 2 ? `${ELECTRIC_BLUE}20` : "rgba(255,255,255,0.05)",
          color: rank <= 2 ? ELECTRIC_BLUE : "#909090",
          border:
            rank <= 2
              ? `1px solid ${ELECTRIC_BLUE}40`
              : "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {rank}
      </span>
      <div className="flex-1 min-w-0">
        <p
          className="font-medium text-sm truncate"
          style={{ color: "#e0e0e0" }}
        >
          {pool.name}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <ProtocolBadge protocol={pool.protocol} size="sm" />
          <span className="text-xs" style={{ color: "#909090" }}>
            {pool.chain}
          </span>
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <p
          className="font-mono text-sm font-bold"
          style={{ color: NEON_GREEN, textShadow: `0 0 8px ${NEON_GREEN}80` }}
        >
          {pool.apy.current.toFixed(1)}%
        </p>
        <div
          className="flex items-center justify-end gap-0.5 text-xs font-mono"
          style={{ color: isUp ? NEON_GREEN : DANGER_RED }}
        >
          {isUp ? (
            <TrendingUp className="w-3 h-3" />
          ) : (
            <TrendingDown className="w-3 h-3" />
          )}
          {isUp ? "+" : ""}
          {pool.apy.day1Change.toFixed(1)}%
        </div>
      </div>
      <div className="text-right flex-shrink-0 hidden sm:block">
        <p className="font-mono text-xs" style={{ color: ELECTRIC_BLUE }}>
          {formatUSD(pool.stats.tvl)}
        </p>
        <p
          className="text-[10px] uppercase tracking-wide"
          style={{ color: "#909090" }}
        >
          TVL
        </p>
      </div>
    </div>
  );
}

// ─── Market Mover Row ────────────────────────────────────────────────────────

function MarketMoverRow({
  pool,
  rank,
  type,
}: { pool: Pool; rank: number; type: "gainer" | "loser" }) {
  const isGainer = type === "gainer";
  const change = pool.apy.day1Change;
  return (
    <div
      data-ocid={`dashboard.mover_${type}.${rank}`}
      className="flex items-center justify-between py-2 px-3 rounded-lg transition-all duration-200 cursor-default"
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background =
          "rgba(255,255,255,0.04)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = "transparent";
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <ProtocolBadge protocol={pool.protocol} size="sm" />
        <span
          className="font-medium text-sm truncate"
          style={{ color: "#e0e0e0" }}
        >
          {pool.name}
        </span>
      </div>
      <div
        className="flex items-center gap-1 font-mono text-sm font-semibold flex-shrink-0"
        style={{
          color: isGainer ? NEON_GREEN : DANGER_RED,
          textShadow: isGainer
            ? `0 0 6px ${NEON_GREEN}60`
            : `0 0 6px ${DANGER_RED}60`,
        }}
      >
        {isGainer ? (
          <TrendingUp className="w-3.5 h-3.5" />
        ) : (
          <TrendingDown className="w-3.5 h-3.5" />
        )}
        {isGainer ? "+" : ""}
        {change.toFixed(1)}%
      </div>
    </div>
  );
}

// ─── Pie Legend ───────────────────────────────────────────────────────────────

function PieLegend({
  data,
}: { data: { name: string; value: number; color: string; pct: number }[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3">
      {data.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 min-w-0">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{
              background: entry.color,
              boxShadow: `0 0 4px ${entry.color}80`,
            }}
          />
          <div className="min-w-0">
            <p
              className="text-xs font-medium truncate"
              style={{ color: "#e0e0e0" }}
            >
              {entry.name}
            </p>
            <p className="text-[10px] font-mono" style={{ color: "#909090" }}>
              {entry.pct.toFixed(1)}%
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Glass Skeleton ───────────────────────────────────────────────────────────

function GlassSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("rounded-lg animate-pulse", className)}
      style={{ background: "rgba(0,163,255,0.05)" }}
    />
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const loading = useSimulatedLoading(950);
  const [dataVisible, setDataVisible] = useState(false);

  // Trigger smooth fade-in after load
  useEffect(() => {
    if (!loading) {
      const t = setTimeout(() => setDataVisible(true), 60);
      return () => clearTimeout(t);
    }
  }, [loading]);

  const stats = useMemo(() => {
    const totalTVL = MOCK_POOLS.reduce((s, p) => s + p.stats.tvl, 0);
    const totalVolume = MOCK_POOLS.reduce((s, p) => s + p.stats.volume24h, 0);
    const totalFees = MOCK_POOLS.reduce((s, p) => s + p.stats.fees24h, 0);
    const avgAPY =
      MOCK_POOLS.reduce((s, p) => s + p.apy.current, 0) / MOCK_POOLS.length;
    const bestPool = [...MOCK_POOLS].sort(
      (a, b) => b.apy.current - a.apy.current,
    )[0];
    const highestVolumePool = [...MOCK_POOLS].sort(
      (a, b) => b.stats.volume24h - a.stats.volume24h,
    )[0];
    return {
      totalTVL,
      totalVolume,
      totalFees,
      avgAPY,
      poolCount: MOCK_POOLS.length,
      bestPool,
      highestVolumePool,
    };
  }, []);

  const tvlByProtocol = useMemo(() => {
    const total = MOCK_POOLS.reduce((s, p) => s + p.stats.tvl, 0);
    return (Object.keys(PROTOCOL_METADATA) as Protocol[]).map((proto) => {
      const value = MOCK_POOLS.filter((p) => p.protocol === proto).reduce(
        (s, p) => s + p.stats.tvl,
        0,
      );
      return {
        name: PROTOCOL_METADATA[proto].name,
        value,
        color: PROTOCOL_COLORS[proto],
        pct: (value / total) * 100,
      };
    });
  }, []);

  const portfolioAllocation = useMemo(() => {
    const total = MOCK_POSITIONS.reduce(
      (s, e) => s + e.position.currentValueUSD,
      0,
    );
    const byProtocol: Record<string, number> = {};
    for (const e of MOCK_POSITIONS) {
      byProtocol[e.position.protocol] =
        (byProtocol[e.position.protocol] ?? 0) + e.position.currentValueUSD;
    }
    return (Object.keys(byProtocol) as Protocol[]).map((proto) => ({
      name: PROTOCOL_METADATA[proto]?.name ?? proto,
      value: byProtocol[proto],
      color: PROTOCOL_COLORS[proto],
      pct: (byProtocol[proto] / total) * 100,
    }));
  }, []);

  const topAPYPools = useMemo(
    () =>
      [...MOCK_POOLS].sort((a, b) => b.apy.current - a.apy.current).slice(0, 5),
    [],
  );

  const apyTrendData = useMemo(
    () => MOCK_POOLS[0].apyTrend.day30.slice(-14),
    [],
  );

  const gainers = useMemo(
    () =>
      [...MOCK_POOLS]
        .sort((a, b) => b.apy.day1Change - a.apy.day1Change)
        .slice(0, 4),
    [],
  );

  const losers = useMemo(
    () =>
      [...MOCK_POOLS]
        .sort((a, b) => a.apy.day1Change - b.apy.day1Change)
        .slice(0, 4),
    [],
  );

  const poolsEmpty = !loading && MOCK_POOLS.length === 0;

  const kpis: KPICardProps[] = [
    {
      label: "Total TVL",
      value: formatUSD(stats.totalTVL),
      change: KPI_CHANGES.tvl,
      icon: Waves,
      ocid: "dashboard.kpi.1",
      glowColor: "blue",
      source: "Mock",
    },
    {
      label: "24h Volume",
      value: formatUSD(stats.totalVolume),
      change: KPI_CHANGES.volume,
      icon: Activity,
      ocid: "dashboard.kpi.2",
      glowColor: "neutral",
      source: "Mock",
    },
    {
      label: "24h Fees",
      value: formatUSD(stats.totalFees),
      change: KPI_CHANGES.fees,
      icon: Droplets,
      ocid: "dashboard.kpi.3",
      glowColor: "green",
      source: "Mock",
    },
    {
      label: "Best Pool APY",
      value: `${stats.bestPool.apy.current.toFixed(1)}%`,
      change: KPI_CHANGES.apy,
      icon: Trophy,
      ocid: "dashboard.kpi.4",
      glowColor: "green",
      source: "Mock",
    },
  ];

  return (
    <div
      data-ocid="dashboard.page"
      className="p-4 md:p-6 space-y-6"
      style={{ background: "#0D0D0D", minHeight: "100%" }}
    >
      {/* ── Top Bar ── */}
      <div className="flex items-center flex-wrap gap-3">
        <Breadcrumb items={[{ label: "Home" }]} />
        <div
          className="w-2 h-2 rounded-full animate-pulse"
          style={{
            background: NEON_GREEN,
            boxShadow: `0 0 8px ${NEON_GREEN}`,
          }}
        />
        <span
          className="text-[10px] font-bold uppercase tracking-[2px] font-mono"
          style={{ color: "#909090" }}
        >
          Live Market Data
        </span>
      </div>

      {/* ── Hero Banner ── */}
      <div
        className="relative rounded-xl overflow-hidden"
        style={{
          border: `1px solid ${ELECTRIC_BLUE}25`,
          boxShadow: `0 0 40px ${ELECTRIC_BLUE}08, inset 0 1px 0 ${ELECTRIC_BLUE}15`,
          backgroundImage:
            "url(/assets/generated/defi-dashboard-hero.dim_1600x900.jpg)",
          backgroundSize: "cover",
          backgroundPosition: "center top",
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, rgba(13,13,13,0.92) 0%, rgba(0,163,255,0.04) 50%, rgba(13,13,13,0.88) 100%)",
            backdropFilter: "blur(2px)",
          }}
        />
        <div className="relative p-5 md:p-8">
          <div className="flex items-center gap-2 mb-2">
            <LayoutDashboard
              className="w-4 h-4"
              style={{ color: ELECTRIC_BLUE }}
            />
            <span
              className="text-[10px] font-bold uppercase tracking-[2px] font-mono"
              style={{ color: "#909090" }}
            >
              Overview
            </span>
          </div>
          <h1
            className="font-mono text-2xl md:text-3xl font-bold mb-1.5 tracking-tight"
            style={{
              color: "#e0e0e0",
              textShadow: `0 0 30px ${ELECTRIC_BLUE}20`,
            }}
          >
            DeFi Pool Analytics
          </h1>
          <p
            className="text-sm md:text-base max-w-xl"
            style={{ color: "#909090" }}
          >
            Real-time liquidity intelligence across Uniswap, PancakeSwap,
            Raydium &amp; ICP
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            {(Object.keys(PROTOCOL_METADATA) as Protocol[]).map((p) => (
              <ProtocolBadge key={p} protocol={p} showChain />
            ))}
          </div>
        </div>
      </div>

      {/* ── Empty State ── */}
      {poolsEmpty && (
        <GlassCard ocid="dashboard.empty_state" hover={false}>
          <div className="flex flex-col items-center justify-center py-14 text-center gap-3">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{
                background: `${ELECTRIC_BLUE}10`,
                border: `1px solid ${ELECTRIC_BLUE}25`,
              }}
            >
              <Droplets className="w-7 h-7" style={{ color: ELECTRIC_BLUE }} />
            </div>
            <div>
              <p
                className="font-semibold text-base"
                style={{ color: "#e0e0e0" }}
              >
                No pool data available
              </p>
              <p className="text-sm mt-1 max-w-xs" style={{ color: "#909090" }}>
                Data will appear here once connected to live feeds
              </p>
            </div>
          </div>
        </GlassCard>
      )}

      {/* ── Top Performers Section ── */}
      {!loading && (
        <div data-ocid="dashboard.top_performers.section">
          <div className="flex items-center gap-2 mb-3">
            <Star className="w-4 h-4" style={{ color: "#f59e0b" }} />
            <span
              className="text-xl font-semibold tracking-tight"
              style={{ color: "#e0e0e0" }}
            >
              Top Performers
            </span>
            <div
              className="flex-1 h-px ml-2"
              style={{
                background:
                  "linear-gradient(to right, rgba(245,158,11,0.3), transparent)",
              }}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TopPerformerCard
              pool={stats.bestPool}
              type="apy"
              visible={dataVisible}
            />
            <TopPerformerCard
              pool={stats.highestVolumePool}
              type="volume"
              visible={dataVisible}
            />
          </div>
        </div>
      )}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <GlassSkeleton className="h-40" />
          <GlassSkeleton className="h-40" />
        </div>
      )}

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {loading
          ? Array.from({ length: 4 }, (_, i) => (
              <GlassSkeleton key={i.toString()} className="h-36" />
            ))
          : kpis.map((kpi) => (
              <KPICard key={kpi.label} {...kpi} visible={dataVisible} />
            ))}
      </div>

      {/* ── Charts Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* APY Trend */}
        <GlassCard className="lg:col-span-1">
          <div className="p-4 pb-2">
            <SectionHeading icon={Activity} label="APY Trend — 14 days" />
            <p className="text-xs mt-0.5" style={{ color: "#909090" }}>
              ETH/USDC (Uniswap)
            </p>
          </div>
          <div className="px-2 pb-3">
            {loading ? (
              <div
                data-ocid="dashboard.apy_chart.loading_state"
                className="mt-2 px-2"
              >
                <GlassSkeleton className="h-[160px]" />
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart
                    data={apyTrendData}
                    margin={{ top: 4, right: 8, bottom: 0, left: -24 }}
                  >
                    <defs>
                      <linearGradient id="apyGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor={ELECTRIC_BLUE}
                          stopOpacity={0.2}
                        />
                        <stop
                          offset="95%"
                          stopColor={ELECTRIC_BLUE}
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" hide />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={GLASS_TOOLTIP_STYLE}
                      formatter={(v: number) => [`${v.toFixed(1)}%`, "APY"]}
                      labelStyle={{ color: "#909090" }}
                      itemStyle={{ color: ELECTRIC_BLUE }}
                    />
                    <Area
                      type="monotone"
                      dataKey="apy"
                      stroke={ELECTRIC_BLUE}
                      strokeWidth={2}
                      fill="url(#apyGrad)"
                      dot={false}
                      activeDot={{
                        r: 4,
                        fill: ELECTRIC_BLUE,
                        stroke: "#0D0D0D",
                        strokeWidth: 2,
                      }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
                <div className="px-2 pt-1 flex items-center justify-between">
                  <DataSourceBadge
                    source="Uniswap"
                    lastUpdated={LAST_UPDATED}
                  />
                </div>
              </>
            )}
          </div>
        </GlassCard>

        {/* Protocol Distribution */}
        <GlassCard>
          <div className="p-4 pb-2">
            <SectionHeading
              icon={BarChart2}
              label="TVL by Protocol"
              iconColor={NEON_GREEN}
            />
            <p className="text-xs mt-0.5" style={{ color: "#909090" }}>
              Distribution across chains
            </p>
          </div>
          <div className="px-4 pb-4">
            {loading ? (
              <div data-ocid="dashboard.tvl_chart.loading_state">
                <div
                  className="h-32 w-32 mx-auto rounded-full animate-pulse mt-2"
                  style={{ background: "rgba(0,163,255,0.05)" }}
                />
                <div className="grid grid-cols-2 gap-2 mt-4">
                  {[1, 2, 3, 4].map((i) => (
                    <GlassSkeleton key={i} className="h-4" />
                  ))}
                </div>
              </div>
            ) : (
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
                      strokeWidth={0}
                    >
                      {tvlByProtocol.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={entry.color}
                          style={{
                            filter: `drop-shadow(0 0 4px ${entry.color}80)`,
                          }}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={GLASS_TOOLTIP_STYLE}
                      formatter={(v: number) => [formatUSD(v), "TVL"]}
                      itemStyle={{ color: NEON_GREEN }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <PieLegend data={tvlByProtocol} />
                <div className="mt-3 flex gap-1.5 flex-wrap">
                  <DataSourceBadge
                    source="ICPSwap"
                    lastUpdated={LAST_UPDATED}
                  />
                  <DataSourceBadge
                    source="Uniswap"
                    lastUpdated={LAST_UPDATED}
                  />
                </div>
              </>
            )}
          </div>
        </GlassCard>

        {/* Portfolio Allocation */}
        <GlassCard>
          <div className="p-4 pb-2">
            <SectionHeading
              icon={Zap}
              label="Portfolio Allocation"
              iconColor="#f59e0b"
            />
            <p className="text-xs mt-0.5" style={{ color: "#909090" }}>
              Your positions by protocol
            </p>
          </div>
          <div className="px-4 pb-4">
            {loading ? (
              <div data-ocid="dashboard.portfolio_chart.loading_state">
                <div
                  className="h-32 w-32 mx-auto rounded-full animate-pulse mt-2"
                  style={{ background: "rgba(0,163,255,0.05)" }}
                />
                <div className="grid grid-cols-2 gap-2 mt-4">
                  {[1, 2, 3].map((i) => (
                    <GlassSkeleton key={i} className="h-4" />
                  ))}
                </div>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={130}>
                  <PieChart>
                    <Pie
                      data={portfolioAllocation}
                      cx="50%"
                      cy="50%"
                      innerRadius={38}
                      outerRadius={58}
                      paddingAngle={3}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {portfolioAllocation.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={entry.color}
                          style={{
                            filter: `drop-shadow(0 0 4px ${entry.color}80)`,
                          }}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={GLASS_TOOLTIP_STYLE}
                      formatter={(v: number) => [formatUSD(v), "Value"]}
                      itemStyle={{ color: NEON_GREEN }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <PieLegend data={portfolioAllocation} />
                <div className="mt-3">
                  <DataSourceBadge
                    source="KongSwap"
                    lastUpdated={LAST_UPDATED}
                  />
                </div>
              </>
            )}
          </div>
        </GlassCard>
      </div>

      {/* ── Top APY Pools + Market Movers ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Top 5 by APY */}
        <GlassCard>
          <div className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <SectionHeading
                icon={Trophy}
                label="Top 5 by APY"
                iconColor="#f59e0b"
              />
              <Link
                to="/pools"
                data-ocid="dashboard.top_apy.view_all_link"
                className="text-xs font-mono flex items-center gap-0.5 transition-all duration-200"
                style={{ color: ELECTRIC_BLUE }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.textShadow =
                    `0 0 8px ${ELECTRIC_BLUE}80`;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.textShadow =
                    "none";
                }}
              >
                View all <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
          <div className="px-2 pb-3">
            {loading ? (
              <div
                data-ocid="dashboard.top_apy.loading_state"
                className="space-y-2 px-2"
              >
                {[1, 2, 3, 4, 5].map((i) => (
                  <GlassSkeleton key={i} className="h-12" />
                ))}
              </div>
            ) : (
              <div data-ocid="dashboard.top_apy.list">
                {topAPYPools.map((pool, i) => (
                  <TopAPYPoolRow key={pool.id} pool={pool} rank={i + 1} />
                ))}
              </div>
            )}
          </div>
        </GlassCard>

        {/* Market Movers */}
        <GlassCard>
          <div className="p-4 pb-2">
            <SectionHeading icon={Activity} label="Market Movers" />
          </div>
          <div className="px-2 pb-3">
            {loading ? (
              <div
                data-ocid="dashboard.movers.loading_state"
                className="space-y-2 px-2"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <GlassSkeleton key={i} className="h-9" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                <div>
                  <p
                    className="text-[10px] font-bold uppercase tracking-[1.5px] font-mono px-3 pb-1 flex items-center gap-1"
                    style={{ color: NEON_GREEN }}
                  >
                    <TrendingUp className="w-3 h-3" /> Top Gainers
                  </p>
                  {gainers.map((pool, i) => (
                    <MarketMoverRow
                      key={pool.id}
                      pool={pool}
                      rank={i + 1}
                      type="gainer"
                    />
                  ))}
                </div>
                <div>
                  <p
                    className="text-[10px] font-bold uppercase tracking-[1.5px] font-mono px-3 pb-1 flex items-center gap-1"
                    style={{ color: DANGER_RED }}
                  >
                    <TrendingDown className="w-3 h-3" /> Top Losers
                  </p>
                  {losers.map((pool, i) => (
                    <MarketMoverRow
                      key={pool.id}
                      pool={pool}
                      rank={i + 1}
                      type="loser"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </GlassCard>
      </div>

      {/* ── Active Positions ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity
              className="w-3.5 h-3.5"
              style={{ color: ELECTRIC_BLUE }}
            />
            <span
              className="text-xl font-semibold"
              style={{ color: "#e0e0e0" }}
            >
              Active Positions
            </span>
            <div
              className="h-px w-12"
              style={{
                background: `linear-gradient(to right, ${ELECTRIC_BLUE}40, transparent)`,
              }}
            />
          </div>
          <Link
            to="/pools"
            data-ocid="dashboard.positions.view_all_link"
            className="text-xs font-mono flex items-center gap-0.5 transition-all duration-200"
            style={{ color: ELECTRIC_BLUE }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.textShadow =
                `0 0 8px ${ELECTRIC_BLUE}80`;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.textShadow = "none";
            }}
          >
            View all <ArrowUpRight className="w-3 h-3" />
          </Link>
        </div>
        {loading ? (
          <div
            data-ocid="dashboard.positions.loading_state"
            className="space-y-2"
          >
            {[1, 2, 3].map((i) => (
              <GlassSkeleton key={i} className="h-16" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {MOCK_POSITIONS.slice(0, 3).map((entry, i) => (
              <div
                key={entry.position.id}
                data-ocid={`dashboard.position.${i + 1}`}
                className="rounded-xl p-3 sm:p-4 transition-all duration-300 cursor-default"
                style={{
                  background: "rgba(13,13,13,0.8)",
                  border: "1px solid rgba(0,163,255,0.12)",
                  backdropFilter: "blur(10px)",
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.borderColor = `${ELECTRIC_BLUE}35`;
                  el.style.transform = "translateY(-1px)";
                  el.style.boxShadow = `0 0 20px ${ELECTRIC_BLUE}10, 0 4px 12px rgba(0,0,0,0.2)`;
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.borderColor = "rgba(0,163,255,0.12)";
                  el.style.transform = "";
                  el.style.boxShadow = "";
                }}
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <ProtocolBadge
                      protocol={entry.position.protocol}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p
                        className="font-medium text-sm truncate"
                        style={{ color: "#e0e0e0" }}
                      >
                        {entry.position.poolName}
                      </p>
                      <p className="text-xs" style={{ color: "#909090" }}>
                        {entry.position.token0Symbol}/
                        {entry.position.token1Symbol}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 sm:gap-6 text-sm flex-shrink-0">
                    <div className="text-right">
                      <p
                        className="text-[10px] uppercase tracking-wide font-mono"
                        style={{ color: "#909090" }}
                      >
                        Value
                      </p>
                      <p
                        className={cn(
                          "font-mono font-semibold transition-all duration-300",
                          dataVisible ? "opacity-100" : "opacity-0",
                        )}
                        style={{
                          color: ELECTRIC_BLUE,
                          textShadow: `0 0 8px ${ELECTRIC_BLUE}60`,
                        }}
                      >
                        {formatUSD(entry.position.currentValueUSD)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className="text-[10px] uppercase tracking-wide font-mono"
                        style={{ color: "#909090" }}
                      >
                        P&amp;L
                      </p>
                      <p
                        className={cn(
                          "font-mono font-semibold transition-all duration-300",
                          dataVisible ? "opacity-100" : "opacity-0",
                        )}
                        style={{
                          color: entry.isProfit ? NEON_GREEN : DANGER_RED,
                          textShadow: entry.isProfit
                            ? `0 0 8px ${NEON_GREEN}60`
                            : `0 0 8px ${DANGER_RED}60`,
                        }}
                      >
                        {entry.isProfit ? "+" : ""}
                        {formatUSD(entry.netPnL)}
                      </p>
                    </div>
                    <div className="text-right hidden sm:block">
                      <p
                        className="text-[10px] uppercase tracking-wide font-mono"
                        style={{ color: "#909090" }}
                      >
                        IL
                      </p>
                      <p className="font-mono" style={{ color: "#f59e0b" }}>
                        {entry.position.ilPercent.toFixed(1)}%
                      </p>
                    </div>
                    <div className="text-right hidden sm:block">
                      <p
                        className="text-[10px] uppercase tracking-wide font-mono"
                        style={{ color: "#909090" }}
                      >
                        Fees
                      </p>
                      <p
                        className="font-mono"
                        style={{
                          color: NEON_GREEN,
                          textShadow: `0 0 6px ${NEON_GREEN}50`,
                        }}
                      >
                        +{formatUSD(entry.position.feesEarned)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
