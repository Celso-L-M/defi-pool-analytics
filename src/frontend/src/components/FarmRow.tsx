import { formatUsd } from "@/components/PoolCard";
import { RiskBadge } from "@/components/RiskBadge";
import { Button } from "@/components/ui/button";
import type { Farm } from "@/hooks/useYieldFarms";
import { cn } from "@/lib/utils";
import { Calculator } from "lucide-react";
import type { ReactNode } from "react";

function Cell({
  label,
  className,
  children,
}: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="mb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground lg:hidden">
        {label}
      </p>
      {children}
    </div>
  );
}

export const FARM_GRID =
  "lg:grid-cols-[minmax(0,2fr)_0.9fr_0.9fr_0.9fr_1.3fr_0.9fr_0.9fr_auto]";

interface FarmRowProps {
  farm: Farm;
  index: number;
  selected: boolean;
  onEstimate: (id: string) => void;
}

export function FarmRow({ farm, index, selected, onEstimate }: FarmRowProps) {
  const pct = Math.round(farm.rewardShare * 100);
  return (
    <li
      data-ocid={`yield.row.${index}`}
      className={cn(
        "grid grid-cols-2 items-center gap-x-4 gap-y-3 rounded-lg border bg-card p-4 transition-colors sm:grid-cols-4 lg:gap-y-0 lg:rounded-none lg:border-0 lg:border-b lg:border-border lg:bg-transparent lg:px-4 lg:py-3",
        FARM_GRID,
        selected ? "border-primary/60 lg:bg-primary/5" : "border-border",
      )}
    >
      <Cell label="Farm" className="col-span-2 sm:col-span-4 lg:col-span-1">
        <p className="truncate font-display text-sm font-semibold text-foreground">
          {farm.name}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {farm.project} · {farm.chain}
          {farm.stablecoin ? " · Stable" : ""}
        </p>
      </Cell>
      <Cell label="TVL">
        <p className="font-mono text-sm text-foreground lg:text-right">
          {formatUsd(farm.tvl)}
        </p>
      </Cell>
      <Cell label="Base APY">
        <p className="font-mono text-sm text-primary lg:text-right">
          {farm.baseApy.toFixed(2)}%
        </p>
      </Cell>
      <Cell label="Reward APY">
        <p className="font-mono text-sm text-accent lg:text-right">
          {farm.rewardApy.toFixed(2)}%
        </p>
      </Cell>
      <Cell label="Reward share" className="col-span-2 sm:col-span-1">
        <div className="flex items-center gap-2">
          <div
            className="flex h-2 min-w-[48px] flex-1 overflow-hidden rounded-full bg-muted"
            aria-hidden
          >
            <span
              className="h-full bg-primary"
              style={{ width: `${100 - pct}%` }}
            />
            <span className="h-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
          <span className="w-10 text-right font-mono text-xs text-foreground">
            {pct}%
          </span>
        </div>
      </Cell>
      <Cell label="Total APY">
        <p className="font-mono text-base font-bold text-foreground lg:text-right">
          {farm.totalApy.toFixed(2)}%
        </p>
      </Cell>
      <Cell label="Risk">
        <RiskBadge pool={farm.pool} />
      </Cell>
      <div className="col-span-2 sm:col-span-4 lg:col-span-1">
        <Button
          type="button"
          size="sm"
          variant={selected ? "secondary" : "outline"}
          data-ocid={`yield.estimate_button.${index}`}
          aria-label={`Estimate earnings for ${farm.name} on ${farm.chain}`}
          onClick={() => onEstimate(farm.id)}
          className="w-full lg:w-auto"
        >
          <Calculator className="mr-1.5 h-4 w-4" aria-hidden />
          Estimate
        </Button>
      </div>
    </li>
  );
}
