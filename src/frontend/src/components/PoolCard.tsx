import { ProtocolBadge } from "@/components/ProtocolBadge";
import { RiskBadge } from "@/components/RiskBadge";
import { cn } from "@/lib/utils";
import type { Pool } from "@/types/defi";
import { Droplets, Star, TrendingDown, TrendingUp } from "lucide-react";
import React from "react";

interface PoolCardProps {
  pool: Pool;
  selected?: boolean;
  /** True when the pool is on the signed-in user's watchlist. */
  watched?: boolean;
  /** Disables the star while a watchlist change is being saved. */
  watchPending?: boolean;
  onSelect?: (id: string) => void;
  onToggleWatch?: (pool: Pool) => void;
  index?: number;
}

export function formatUsd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function Stat({
  label,
  children,
}: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

export const PoolCard = React.memo(function PoolCard({
  pool,
  selected = false,
  watched = false,
  watchPending = false,
  onSelect,
  onToggleWatch,
  index = 0,
}: PoolCardProps) {
  const apyChange = pool.apy.day1Change;
  const isUp = apyChange >= 0;
  const position = index + 1;

  return (
    <article
      data-ocid={`pool.item.${position}`}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-lg border bg-card text-card-foreground transition-colors duration-200",
        selected
          ? "border-primary"
          : "border-border hover:border-primary/60 focus-within:border-primary/60",
      )}
    >
      <button
        type="button"
        data-ocid={`pool.open_button.${position}`}
        onClick={() => onSelect?.(pool.id)}
        className="block min-h-[44px] w-full p-4 pb-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Open details for ${pool.name} on ${pool.chain}`}
      >
        <div className="mb-3 flex items-start justify-between gap-2 pr-9">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
              <Droplets className="h-4 w-4 text-primary" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-semibold text-foreground">
                {pool.name}
              </p>
              <p className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
                {pool.chain}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Stat label="TVL">
            <p className="font-mono text-sm font-medium text-foreground">
              {formatUsd(pool.stats.tvl)}
            </p>
          </Stat>
          <Stat label="APY">
            <div className="flex items-center gap-1">
              <p className="font-mono text-sm font-bold text-accent">
                {pool.apy.current.toFixed(1)}%
              </p>
              <span
                className={cn(
                  "flex items-center gap-0.5 font-mono text-xs",
                  isUp ? "text-success" : "text-destructive",
                )}
              >
                {isUp ? (
                  <TrendingUp className="h-3 w-3" aria-hidden />
                ) : (
                  <TrendingDown className="h-3 w-3" aria-hidden />
                )}
                {Math.abs(apyChange).toFixed(1)}%
              </span>
            </div>
          </Stat>
          <Stat label="Volume 24h">
            <p className="font-mono text-sm text-muted-foreground">
              {formatUsd(pool.stats.volume24h)}
            </p>
          </Stat>
          <Stat label="Fees 24h">
            <p className="font-mono text-sm text-muted-foreground">
              {formatUsd(pool.stats.fees24h)}
            </p>
          </Stat>
        </div>
      </button>

      <div className="mt-auto flex items-center justify-between gap-2 px-4 pb-4 pt-2">
        <div className="flex min-w-0 items-center gap-2">
          <RiskBadge pool={pool} />
          <ProtocolBadge protocol={pool.protocol} size="sm" />
        </div>
        {selected && (
          <span className="text-[10px] font-medium uppercase tracking-wider text-primary">
            In comparison
          </span>
        )}
      </div>

      <button
        type="button"
        data-ocid={`pool.watch_toggle.${position}`}
        aria-pressed={watched}
        aria-label={
          watched
            ? `Remove ${pool.name} from watchlist`
            : `Add ${pool.name} to watchlist`
        }
        disabled={watchPending}
        onClick={() => onToggleWatch?.(pool)}
        className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      >
        <Star
          className={cn("h-4 w-4", watched && "fill-warning stroke-warning")}
          aria-hidden
        />
      </button>
    </article>
  );
});
