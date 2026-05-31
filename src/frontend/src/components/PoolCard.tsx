import { PercentChange } from "@/components/PercentChange";
import { ProtocolBadge } from "@/components/ProtocolBadge";
import { Sparkline } from "@/components/Sparkline";
import { cn } from "@/lib/utils";
import type { Pool } from "@/types/defi";
import { ChevronDown, ChevronUp, Droplets } from "lucide-react";
import React, { useMemo, useState } from "react";

interface PoolCardProps {
  pool: Pool;
  selected?: boolean;
  onSelect?: (id: string) => void;
  index?: number;
}

function formatTVL(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

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
      textShadow: "0 0 8px rgba(255,170,0,0.4)",
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

/** Generate 7-point sparkline data from apyTrend or synthesize from current APY */
function getSparklineData(pool: Pool): number[] {
  const points = pool.apyTrend?.day7;
  if (points && points.length >= 2) {
    // Use last 7 points
    return points.slice(-7).map((p) => p.apy);
  }
  // Synthesize 7 data points from current APY with slight noise
  return Array.from({ length: 7 }, (_, i) => {
    const progress = i / 6;
    const base = pool.apy.current;
    const change = pool.apy.day1Change;
    return Math.max(
      0.1,
      base - change * (1 - progress) + (Math.random() - 0.5) * base * 0.08,
    );
  });
}

export const PoolCard = React.memo(function PoolCard({
  pool,
  selected = false,
  onSelect,
  index = 0,
}: PoolCardProps) {
  const [hovered, setHovered] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const ilConfig = IL_RISK_CONFIG[pool.ilRisk];
  const apyChange = pool.apy.day1Change;
  const isUp = apyChange >= 0;

  const sparklineData = useMemo(() => getSparklineData(pool), [pool]);
  const sparklineColor = isUp ? "#00FF88" : "#FF4466";

  const cardStyle: React.CSSProperties = {
    background: "rgba(13,13,13,0.8)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    border: selected
      ? "1px solid rgba(0,163,255,0.5)"
      : hovered
        ? "1px solid rgba(0,163,255,0.35)"
        : "1px solid rgba(0,163,255,0.15)",
    boxShadow: hovered
      ? selected
        ? "0 8px 32px rgba(0,163,255,0.2), 0 0 0 1px rgba(0,163,255,0.15)"
        : "0 8px 24px rgba(0,163,255,0.12), 0 0 0 1px rgba(0,163,255,0.1)"
      : selected
        ? "0 4px 20px rgba(0,163,255,0.15)"
        : "0 2px 8px rgba(0,0,0,0.4)",
    transform: hovered
      ? "translateY(-2px) scale(1.01)"
      : "translateY(0) scale(1)",
    transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
    borderRadius: "12px",
    cursor: onSelect ? "pointer" : "default",
    overflow: "hidden",
  };

  const animationDelay = `${index * 60}ms`;

  return (
    <button
      type="button"
      data-ocid={`pool.item.${index + 1}`}
      onClick={() => onSelect?.(pool.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ ...cardStyle, width: "100%", textAlign: "left", animationDelay }}
      className={cn("min-h-[44px] animate-slide-in")}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{
                background: "rgba(0,163,255,0.1)",
                border: "1px solid rgba(0,163,255,0.2)",
              }}
            >
              <Droplets className="w-4 h-4" style={{ color: "#00A3FF" }} />
            </div>
            <div className="min-w-0">
              <p
                className="font-display font-semibold truncate text-sm"
                style={{ color: "#e0e0e0" }}
              >
                {pool.name}
              </p>
              {/* Chain — visible on md+, hidden on mobile unless expanded */}
              <p
                className="truncate uppercase hidden md:block"
                style={{
                  color: "#606060",
                  letterSpacing: "0.06em",
                  fontSize: "10px",
                }}
              >
                {pool.chain}
              </p>
            </div>
          </div>
          {/* Protocol badge — hidden on mobile unless expanded */}
          <div className="hidden md:block flex-shrink-0">
            <ProtocolBadge protocol={pool.protocol} size="sm" />
          </div>
        </div>

        {/* Critical metrics — always visible */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          {/* TVL */}
          <div>
            <p
              className="uppercase mb-0.5"
              style={{
                color: "#606060",
                fontSize: "10px",
                letterSpacing: "0.06em",
              }}
            >
              TVL
            </p>
            <p
              className="font-mono text-sm font-medium"
              style={{
                color: "#00A3FF",
                textShadow: "0 0 8px rgba(0,163,255,0.4)",
              }}
            >
              {formatTVL(pool.stats.tvl)}
            </p>
          </div>

          {/* APY with PercentChange + Sparkline */}
          <div>
            <p
              className="uppercase mb-0.5"
              style={{
                color: "#606060",
                fontSize: "10px",
                letterSpacing: "0.06em",
              }}
            >
              APY
            </p>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 min-w-0">
                <p
                  className="font-mono text-sm font-bold"
                  style={{
                    color: "#00FF88",
                    textShadow: "0 0 10px rgba(0,255,136,0.6)",
                  }}
                >
                  {pool.apy.current.toFixed(1)}%
                </p>
                <PercentChange value={apyChange} size="sm" />
              </div>
              <div className="flex-shrink-0">
                <Sparkline
                  data={sparklineData}
                  color={sparklineColor}
                  width={56}
                  height={28}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Extended metrics — always visible on md+, hidden on mobile unless expanded */}
        <div
          className={cn(
            "grid grid-cols-2 gap-3 mb-3 transition-all duration-300",
            expanded ? "block md:grid" : "hidden md:grid",
          )}
        >
          <div>
            <p
              className="uppercase mb-0.5"
              style={{
                color: "#606060",
                fontSize: "10px",
                letterSpacing: "0.06em",
              }}
            >
              Volume 24h
            </p>
            <p className="font-mono text-sm" style={{ color: "#909090" }}>
              {formatTVL(pool.stats.volume24h)}
            </p>
          </div>
          <div>
            <p
              className="uppercase mb-0.5"
              style={{
                color: "#606060",
                fontSize: "10px",
                letterSpacing: "0.06em",
              }}
            >
              Fees 24h
            </p>
            <p className="font-mono text-sm" style={{ color: "#909090" }}>
              {formatTVL(pool.stats.fees24h)}
            </p>
          </div>

          {/* Protocol + Chain on mobile when expanded */}
          <div className="md:hidden">
            <p
              className="uppercase mb-0.5"
              style={{
                color: "#606060",
                fontSize: "10px",
                letterSpacing: "0.06em",
              }}
            >
              Protocol
            </p>
            <ProtocolBadge protocol={pool.protocol} size="sm" />
          </div>
          <div className="md:hidden">
            <p
              className="uppercase mb-0.5"
              style={{
                color: "#606060",
                fontSize: "10px",
                letterSpacing: "0.06em",
              }}
            >
              Chain
            </p>
            <p
              className="font-mono text-xs uppercase"
              style={{ color: "#808080", letterSpacing: "0.05em" }}
            >
              {pool.chain}
            </p>
          </div>
        </div>

        {/* Footer — always visible */}
        <div className="flex items-center justify-between">
          <span
            className="inline-flex items-center rounded-full text-xs px-2 py-0.5 font-medium"
            style={ilConfig.style}
          >
            {ilConfig.label}
          </span>
          <p
            className="font-mono text-xs hidden md:block"
            style={{ color: "#505050" }}
          >
            {(pool.stats.feeRate * 100).toFixed(2)}% fee
          </p>
          {/* Show More / Less toggle — mobile only */}
          <button
            type="button"
            data-ocid={`pool.item.${index + 1}.toggle`}
            className="flex items-center gap-0.5 text-xs font-medium md:hidden transition-colors duration-200"
            style={{ color: expanded ? "#00A3FF" : "#505050" }}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((prev) => !prev);
            }}
            aria-label={expanded ? "Show less" : "Show more"}
          >
            {expanded ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                Less
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                More
              </>
            )}
          </button>
        </div>

        {/* IL risk and fee on mobile when expanded */}
        {expanded && (
          <div className="mt-2 flex items-center justify-between md:hidden">
            <p className="font-mono text-xs" style={{ color: "#505050" }}>
              {(pool.stats.feeRate * 100).toFixed(2)}% fee
            </p>
          </div>
        )}

        {selected && (
          <div
            className="mt-2 w-full text-center text-xs font-medium py-1 rounded-md"
            style={{
              background: "rgba(0,163,255,0.1)",
              border: "1px solid rgba(0,163,255,0.3)",
              color: "#00A3FF",
              textShadow: "0 0 8px rgba(0,163,255,0.5)",
              letterSpacing: "0.05em",
            }}
          >
            SELECTED FOR COMPARISON
          </div>
        )}
      </div>
    </button>
  );
});
