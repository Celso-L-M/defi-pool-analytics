import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Farm } from "@/hooks/useYieldFarms";
import { estimateYield } from "@/utils/yieldEstimate";
import type { EarningsSplit } from "@/utils/yieldEstimate";
import { Calculator } from "lucide-react";
import { useId, useMemo } from "react";

const usd = (value: number) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2,
  });

interface FarmEstimatorProps {
  farms: Farm[];
  farm: Farm | undefined;
  amount: string;
  onFarmChange: (id: string) => void;
  onAmountChange: (value: string) => void;
}

const PERIODS = [
  { key: "daily", label: "Daily" },
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly" },
] as const;

function Split({ value }: { value: EarningsSplit }) {
  return (
    <dl className="mt-2 space-y-1 text-xs">
      <div className="flex justify-between gap-2">
        <dt className="text-muted-foreground">Base</dt>
        <dd className="font-mono text-primary">{usd(value.base)}</dd>
      </div>
      <div className="flex justify-between gap-2">
        <dt className="text-muted-foreground">Rewards</dt>
        <dd className="font-mono text-accent">{usd(value.reward)}</dd>
      </div>
    </dl>
  );
}

export function FarmEstimator({
  farms,
  farm,
  amount,
  onFarmChange,
  onAmountChange,
}: FarmEstimatorProps) {
  const amountId = useId();
  const deposit = Number.parseFloat(amount);
  const valid = Number.isFinite(deposit) && deposit > 0;
  const estimate = useMemo(
    () =>
      farm
        ? estimateYield(valid ? deposit : 0, farm.baseApy, farm.rewardApy)
        : null,
    [farm, deposit, valid],
  );

  return (
    <section
      id="yield-estimator"
      aria-label="Earnings estimator"
      data-ocid="yield.estimator"
      className="scroll-mt-4 rounded-lg border border-primary/30 bg-card p-4 sm:p-5"
    >
      <div className="mb-4 flex items-center gap-2">
        <Calculator className="h-4 w-4 text-primary" aria-hidden />
        <h2 className="font-display text-base font-semibold text-foreground">
          Earnings estimator
        </h2>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-1.5">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Farm
          </span>
          <Select value={farm?.id ?? ""} onValueChange={onFarmChange}>
            <SelectTrigger
              data-ocid="yield.farm_select"
              aria-label="Select a farm"
              className="w-full bg-background"
            >
              <SelectValue placeholder="Select a farm" />
            </SelectTrigger>
            <SelectContent>
              {farms.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name} · {f.project} · {f.chain} · {f.totalApy.toFixed(1)}%
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor={amountId}
            className="text-[11px] uppercase tracking-wider text-muted-foreground"
          >
            Deposit (USD)
          </label>
          <input
            id={amountId}
            data-ocid="yield.amount_input"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 font-mono text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="1000"
          />
        </div>
      </div>

      {!valid && (
        <p
          data-ocid="yield.amount_error"
          role="alert"
          className="mt-2 text-xs text-destructive"
        >
          Enter a deposit amount greater than zero to see estimates.
        </p>
      )}

      {farm && estimate && valid && (
        <div className="mt-4">
          <p className="mb-2 font-mono text-xs text-muted-foreground">
            {farm.name} on {farm.chain}: {farm.baseApy.toFixed(2)}% base +{" "}
            {farm.rewardApy.toFixed(2)}% rewards = {farm.totalApy.toFixed(2)}%
            APY
          </p>
          <div
            className="grid gap-3 sm:grid-cols-3"
            data-ocid="yield.estimate_results"
          >
            {PERIODS.map(({ key, label }) => (
              <div
                key={key}
                data-ocid={`yield.estimate.${key}`}
                className="rounded-lg border border-border bg-background p-3"
              >
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {label} earnings
                </p>
                <p className="font-mono text-xl font-bold text-accent">
                  {usd(estimate[key].total)}
                </p>
                <Split value={estimate[key]} />
              </div>
            ))}
          </div>
        </div>
      )}

      <p
        data-ocid="yield.estimate_disclaimer"
        className="mt-4 text-[11px] leading-snug text-muted-foreground"
      >
        Projections only. They assume the current APY stays constant, use simple
        interest with no compounding, and ignore fees, price changes and
        impermanent loss. Reward APY depends on incentive tokens whose value can
        change or end at any time.
      </p>
    </section>
  );
}
