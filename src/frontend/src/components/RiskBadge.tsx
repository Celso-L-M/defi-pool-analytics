import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Pool, PoolHistoryPoint } from "@/types/defi";
import { computeRiskScore } from "@/utils/riskScore";
import { useMemo } from "react";

interface RiskBadgeProps {
  pool: Pool;
  history?: PoolHistoryPoint[];
  className?: string;
}

const LEVEL_LABEL = { low: "Low", medium: "Medium", high: "High" } as const;

/** Risk score badge (1 to 10) with an explanation of the main factors. */
export function RiskBadge({ pool, history, className }: RiskBadgeProps) {
  const risk = useMemo(() => computeRiskScore(pool, history), [pool, history]);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-ocid="risk_badge"
          className={cn("risk-badge", `risk-badge-${risk.level}`, className)}
          aria-label={`Risk ${risk.score} of 10, ${LEVEL_LABEL[risk.level]}`}
        >
          <span className="tabular-nums">{risk.score}/10</span>
          <span>{LEVEL_LABEL[risk.level]}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs space-y-2 p-3">
        <p className="text-xs font-semibold">
          {LEVEL_LABEL[risk.level]} risk · {risk.score} of 10
        </p>
        <div className={cn("risk-meter", `risk-meter-${risk.level}`)}>
          <span style={{ width: `${risk.score * 10}%` }} />
        </div>
        <ul className="space-y-1.5">
          {risk.factors.map((factor) => (
            <li key={factor.key} className="text-xs leading-snug">
              <span className="font-medium">{factor.label}: </span>
              {factor.explanation}
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

export default RiskBadge;
