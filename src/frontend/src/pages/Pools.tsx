import { Breadcrumb } from "@/components/Breadcrumb";
import { PoolCard } from "@/components/PoolCard";
import { SkeletonCard } from "@/components/SkeletonLoaders";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { MOCK_POOLS, PROTOCOL_METADATA } from "@/data/mockData";
import { useDefiStore } from "@/store/useDefiStore";
import type { Pool, Protocol } from "@/types/defi";
import {
  Info,
  Search,
  SearchX,
  TrendingDown,
  TrendingUp,
  Waves,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const ALL_PROTOCOLS = ["all", ...Object.keys(PROTOCOL_METADATA)] as const;

type TrendPeriod = "1d" | "7d" | "30d";

const IL_RISK_CONFIG = {
  low: {
    label: "Low IL",
    style: {
      background: "rgba(0,255,136,0.08)",
      border: "1px solid rgba(0,255,136,0.25)",
      color: "#00FF88",
      textShadow: "0 0 8px rgba(0,255,136,0.4)",
    },
  },
  medium: {
    label: "Med IL",
    style: {
      background: "rgba(255,170,0,0.08)",
      border: "1px solid rgba(255,170,0,0.25)",
      color: "#FFAA00",
    },
  },
  high: {
    label: "High IL",
    style: {
      background: "rgba(255,68,102,0.08)",
      border: "1px solid rgba(255,68,102,0.25)",
      color: "#FF4466",
      textShadow: "0 0 8px rgba(255,68,102,0.4)",
    },
  },
};

function formatTVL(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function APYTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "rgba(13,13,13,0.95)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(0,163,255,0.25)",
        borderRadius: "8px",
        padding: "8px 12px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
      }}
    >
      <p style={{ color: "#606060", fontSize: "11px", marginBottom: "2px" }}>
        {label}
      </p>
      <p
        className="font-mono text-sm font-semibold"
        style={{ color: "#00FF88", textShadow: "0 0 8px rgba(0,255,136,0.6)" }}
      >
        {payload[0].value.toFixed(2)}% APY
      </p>
    </div>
  );
}

function PoolDetailDrawer({
  pool,
  onClose,
}: { pool: Pool; onClose: () => void }) {
  const [period, setPeriod] = useState<TrendPeriod>("7d");
  const ilConfig = IL_RISK_CONFIG[pool.ilRisk];
  const meta = PROTOCOL_METADATA[pool.protocol];

  const chartData = useMemo(() => {
    if (period === "1d") {
      return Array.from({ length: 24 }, (_, i) => ({
        date: `${String(i).padStart(2, "0")}:00`,
        apy: Math.max(
          0.5,
          pool.apy.current + (Math.random() - 0.5) * pool.apy.current * 0.15,
        ),
      }));
    }
    if (period === "7d") return pool.apyTrend.day7;
    return pool.apyTrend.day30;
  }, [period, pool]);

  const displayAPY =
    period === "1d"
      ? pool.apy.current
      : period === "7d"
        ? pool.apy.day7Avg
        : pool.apy.day30Avg;

  const apyChange = pool.apy.day1Change;
  const isUp = apyChange >= 0;

  const stats = [
    { label: "TVL", value: formatTVL(pool.stats.tvl) },
    { label: "Volume 24h", value: formatTVL(pool.stats.volume24h) },
    { label: "Fees 24h", value: formatTVL(pool.stats.fees24h) },
    { label: "Fee Rate", value: `${(pool.stats.feeRate * 100).toFixed(2)}%` },
    { label: "APY 7d Avg", value: `${pool.apy.day7Avg.toFixed(1)}%` },
    { label: "APY 30d Avg", value: `${pool.apy.day30Avg.toFixed(1)}%` },
  ];

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        data-ocid="pool.detail.sheet"
        className="w-full sm:max-w-lg overflow-y-auto"
        style={{
          background: "rgba(10,10,10,0.98)",
          backdropFilter: "blur(20px)",
          borderLeft: "1px solid rgba(0,163,255,0.2)",
        }}
      >
        <SheetHeader className="pb-4">
          <div className="flex items-center justify-between">
            <SheetTitle
              className="font-display text-lg font-bold"
              style={{ color: "#e0e0e0" }}
            >
              {pool.name}
            </SheetTitle>
            <SheetClose asChild>
              <Button
                variant="ghost"
                size="icon"
                data-ocid="pool.detail.close_button"
                className="h-8 w-8"
                style={{ color: "#606060" }}
              >
                <X className="w-4 h-4" />
              </Button>
            </SheetClose>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="inline-flex items-center rounded-full text-xs px-2 py-0.5 font-medium"
              style={{
                background: "rgba(0,163,255,0.1)",
                border: "1px solid rgba(0,163,255,0.3)",
                color: "#00A3FF",
              }}
            >
              {meta.name} · {pool.chain}
            </span>
            <span
              className="inline-flex items-center rounded-full text-xs px-2 py-0.5 font-medium"
              style={ilConfig.style}
            >
              {ilConfig.label} Risk
            </span>
          </div>
        </SheetHeader>

        <div
          className="mb-5"
          style={{ borderTop: "1px solid rgba(0,163,255,0.1)" }}
        />

        {/* APY Hero */}
        <div
          className="rounded-xl p-4 mb-5"
          style={{
            background: "rgba(0,255,136,0.04)",
            border: "1px solid rgba(0,255,136,0.15)",
          }}
        >
          <div className="flex items-start justify-between mb-1">
            <p
              className="text-xs uppercase tracking-wider"
              style={{ color: "#606060", letterSpacing: "0.08em" }}
            >
              Current APY
            </p>
            <span
              className="flex items-center gap-0.5 text-xs font-medium"
              style={{
                color: isUp ? "#00FF88" : "#FF4466",
                textShadow: isUp
                  ? "0 0 6px rgba(0,255,136,0.5)"
                  : "0 0 6px rgba(255,68,102,0.5)",
              }}
            >
              {isUp ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              {isUp ? "+" : ""}
              {apyChange.toFixed(1)}% 24h
            </span>
          </div>
          <p
            className="font-mono text-3xl font-bold"
            style={{
              color: "#00FF88",
              textShadow: "0 0 20px rgba(0,255,136,0.7)",
            }}
          >
            {displayAPY.toFixed(1)}
            <span
              className="text-lg ml-1"
              style={{ color: "rgba(0,255,136,0.6)" }}
            >
              %
            </span>
          </p>
        </div>

        {/* Period tabs */}
        <div className="flex items-center gap-1 mb-3">
          <p
            className="text-xs uppercase mr-auto"
            style={{ color: "#505050", letterSpacing: "0.08em" }}
          >
            APY Trend
          </p>
          {(["1d", "7d", "30d"] as TrendPeriod[]).map((p) => (
            <button
              key={p}
              type="button"
              data-ocid={`pool.detail.trend.${p}`}
              onClick={() => setPeriod(p)}
              className="px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-200"
              style={{
                background:
                  period === p ? "rgba(0,163,255,0.15)" : "transparent",
                border:
                  period === p
                    ? "1px solid rgba(0,163,255,0.4)"
                    : "1px solid rgba(255,255,255,0.08)",
                color: period === p ? "#00A3FF" : "#606060",
                textShadow:
                  period === p ? "0 0 8px rgba(0,163,255,0.5)" : "none",
              }}
            >
              {p}
            </button>
          ))}
        </div>

        {/* APY Chart */}
        <div className="h-44 mb-5">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.04)"
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "#505050" }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{
                  fontSize: 10,
                  fill: "#505050",
                  fontFamily: "Geist Mono, monospace",
                }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `${v.toFixed(0)}%`}
              />
              <Tooltip content={<APYTooltip />} />
              <Line
                type="monotone"
                dataKey="apy"
                stroke="#00A3FF"
                strokeWidth={2}
                dot={false}
                activeDot={{
                  r: 4,
                  fill: "#00A3FF",
                  strokeWidth: 0,
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div
          className="mb-4"
          style={{ borderTop: "1px solid rgba(0,163,255,0.1)" }}
        />

        {/* Pool stats grid */}
        <div className="grid grid-cols-2 gap-3">
          {stats.map(({ label, value }) => (
            <div
              key={label}
              className="rounded-lg px-3 py-2.5"
              style={{
                background: "rgba(0,163,255,0.04)",
                border: "1px solid rgba(0,163,255,0.1)",
              }}
            >
              <p
                className="text-xs uppercase mb-0.5"
                style={{
                  color: "#505050",
                  letterSpacing: "0.06em",
                  fontSize: "10px",
                }}
              >
                {label}
              </p>
              <p
                className="font-mono text-sm font-semibold"
                style={{ color: "#c0c0c0" }}
              >
                {value}
              </p>
            </div>
          ))}
        </div>

        <div
          className="mt-4 rounded-lg px-3 py-2.5"
          style={{
            background: "rgba(0,163,255,0.04)",
            border: "1px solid rgba(0,163,255,0.1)",
          }}
        >
          <p
            className="text-xs uppercase mb-0.5"
            style={{
              color: "#505050",
              letterSpacing: "0.06em",
              fontSize: "10px",
            }}
          >
            Contract Address
          </p>
          <p
            className="font-mono text-xs break-all"
            style={{ color: "#505050" }}
          >
            {pool.address}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function PoolsPage() {
  const {
    selectedProtocol,
    setSelectedProtocol,
    selectedPoolIds,
    globalSearch,
  } = useDefiStore();
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedPool, setSelectedPool] = useState<Pool | null>(null);

  // Sync global search → local search on mount and changes
  useEffect(() => {
    if (globalSearch) setSearch(globalSearch);
  }, [globalSearch]);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  const filtered = useMemo(() => {
    return MOCK_POOLS.filter((p) => {
      const matchProto =
        selectedProtocol === "all" || p.protocol === selectedProtocol;
      const matchSearch =
        search === "" ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.token0.toLowerCase().includes(search.toLowerCase()) ||
        p.token1.toLowerCase().includes(search.toLowerCase());
      return matchProto && matchSearch;
    });
  }, [selectedProtocol, search]);

  const handleClearFilters = () => {
    setSearch("");
    setSelectedProtocol("all");
  };

  const handlePoolClick = (id: string) => {
    const pool = MOCK_POOLS.find((p) => p.id === id);
    if (pool) setSelectedPool(pool);
  };

  const hasActiveFilters = search !== "" || selectedProtocol !== "all";

  return (
    <div data-ocid="pools.page" className="p-6 space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb
        items={[{ label: "Home", href: "/" }, { label: "Pool Explorer" }]}
      />

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: "rgba(0,163,255,0.1)",
              border: "1px solid rgba(0,163,255,0.25)",
            }}
          >
            <Waves className="w-5 h-5" style={{ color: "#00A3FF" }} />
          </div>
          <div>
            <h1
              className="font-display text-xl font-bold"
              style={{ color: "#e0e0e0" }}
            >
              Pool Explorer
            </h1>
            <p
              className="text-sm uppercase"
              style={{
                color: "#505050",
                letterSpacing: "0.05em",
                fontSize: "11px",
              }}
            >
              {MOCK_POOLS.length} pools · 4 protocols
            </p>
          </div>
        </div>
        {selectedPoolIds.length > 0 && (
          <span
            className="text-xs px-3 py-1 rounded-full font-medium hidden sm:flex"
            style={{
              background: "rgba(0,163,255,0.1)",
              border: "1px solid rgba(0,163,255,0.3)",
              color: "#00A3FF",
            }}
          >
            {selectedPoolIds.length} selected
          </span>
        )}
      </div>

      {/* Protocol filter tabs */}
      <div
        data-ocid="pools.protocol_tabs"
        className="flex items-center gap-1.5 flex-wrap"
      >
        {ALL_PROTOCOLS.map((proto) => {
          const meta =
            proto === "all" ? null : PROTOCOL_METADATA[proto as Protocol];
          const isActive = selectedProtocol === proto;
          return (
            <button
              key={proto}
              type="button"
              data-ocid={`pools.filter.${proto}`}
              onClick={() => setSelectedProtocol(proto as Protocol | "all")}
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200"
              style={{
                background: isActive
                  ? "rgba(0,163,255,0.15)"
                  : "rgba(255,255,255,0.03)",
                border: isActive
                  ? "1px solid rgba(0,163,255,0.4)"
                  : "1px solid rgba(255,255,255,0.07)",
                color: isActive ? "#00A3FF" : "#707070",
                textShadow: isActive ? "0 0 8px rgba(0,163,255,0.5)" : "none",
                letterSpacing: "0.02em",
              }}
            >
              {proto === "all" ? "All Protocols" : meta?.name}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
          style={{ color: searchFocused ? "#00A3FF" : "#505050" }}
        />
        <input
          data-ocid="pools.search_input"
          placeholder="Search pools by name or token…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          className="w-full pl-9 pr-4 py-2.5 rounded-lg text-sm font-mono outline-none transition-all duration-200"
          style={{
            background: "rgba(13,13,13,0.8)",
            backdropFilter: "blur(8px)",
            border: searchFocused
              ? "1px solid rgba(0,163,255,0.5)"
              : "1px solid rgba(0,163,255,0.15)",
            boxShadow: searchFocused
              ? "0 0 0 2px rgba(0,163,255,0.1), 0 0 20px rgba(0,163,255,0.08)"
              : "none",
            color: "#c0c0c0",
          }}
        />
      </div>

      {/* Results count */}
      {!loading && (
        <p
          className="text-xs -mt-2 uppercase"
          style={{ color: "#505050", letterSpacing: "0.05em" }}
        >
          Showing <span style={{ color: "#e0e0e0" }}>{filtered.length}</span>{" "}
          pool
          {filtered.length !== 1 ? "s" : ""}
          {selectedProtocol !== "all" && (
            <>
              {" "}
              on{" "}
              <span style={{ color: "#e0e0e0" }}>
                {PROTOCOL_METADATA[selectedProtocol as Protocol]?.name}
              </span>
            </>
          )}
        </p>
      )}

      {/* Pool grid */}
      {loading ? (
        <div
          data-ocid="pools.loading_state"
          className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4"
        >
          {["sk1", "sk2", "sk3", "sk4", "sk5", "sk6"].map((k) => (
            <SkeletonCard key={k} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div
          data-ocid="pools.empty_state"
          className="flex flex-col items-center justify-center py-20 text-center"
        >
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mb-5"
            style={{
              background: "rgba(0,163,255,0.05)",
              border: "1px solid rgba(0,163,255,0.15)",
              boxShadow: "0 0 40px rgba(0,163,255,0.06)",
            }}
          >
            {hasActiveFilters ? (
              <SearchX className="w-9 h-9" style={{ color: "#404040" }} />
            ) : (
              <Info className="w-9 h-9" style={{ color: "#404040" }} />
            )}
          </div>
          <p
            className="font-display text-lg font-semibold mb-2"
            style={{ color: "#c0c0c0" }}
          >
            No pools found
          </p>
          <p
            className="text-sm max-w-sm leading-relaxed mb-5"
            style={{ color: "#505050" }}
          >
            {hasActiveFilters
              ? "Try adjusting your filter or search term, or clear filters to see all pools."
              : "Pool data is currently unavailable. Please check back later."}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              data-ocid="pools.empty_state.clear_button"
              className="px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200"
              style={{
                background: "rgba(0,163,255,0.1)",
                border: "1px solid rgba(0,163,255,0.3)",
                color: "#00A3FF",
                boxShadow: "0 0 16px rgba(0,163,255,0.08)",
              }}
              onClick={handleClearFilters}
            >
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <div className="relative">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((pool, i) => (
              <PoolCard
                key={pool.id}
                pool={pool}
                index={i}
                selected={selectedPoolIds.includes(pool.id)}
                onSelect={handlePoolClick}
              />
            ))}
          </div>
          <p
            className="mt-3 text-center text-xs sm:hidden select-none"
            style={{ color: "#404040" }}
          >
            ← Scroll to explore more pools →
          </p>
        </div>
      )}

      {/* Pool detail drawer */}
      {selectedPool && (
        <PoolDetailDrawer
          pool={selectedPool}
          onClose={() => setSelectedPool(null)}
        />
      )}
    </div>
  );
}
