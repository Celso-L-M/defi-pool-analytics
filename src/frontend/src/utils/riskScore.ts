import type { Pool, PoolHistoryPoint } from "@/types/defi";

export type RiskLevel = "low" | "medium" | "high";

export interface RiskFactor {
  key: "tvl" | "volatility" | "rewards" | "stablecoin" | "impermanentLoss";
  label: string;
  /** Points this factor adds to the raw risk total. */
  points: number;
  /** Largest value this factor can add. */
  maxPoints: number;
  impact: RiskLevel;
  explanation: string;
}

export interface RiskScore {
  /** 1 (safest) to 10 (riskiest). */
  score: number;
  level: RiskLevel;
  factors: RiskFactor[];
}

const MAX_RAW = 3 + 2.5 + 2 + 1.2 + 1.5;

function impactOf(points: number, max: number): RiskLevel {
  const ratio = max === 0 ? 0 : points / max;
  if (ratio >= 0.6) return "high";
  if (ratio >= 0.3) return "medium";
  return "low";
}

function money(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return `$${Math.round(value / 1e3)}K`;
}

function tvlFactor(pool: Pool): RiskFactor {
  const tvl = pool.stats.tvl;
  const points =
    tvl >= 1e9 ? 0 : tvl >= 1e8 ? 0.5 : tvl >= 1e7 ? 1.2 : tvl >= 1e6 ? 2 : 3;
  return {
    key: "tvl",
    label: "TVL size",
    points,
    maxPoints: 3,
    impact: impactOf(points, 3),
    explanation:
      points <= 0.5
        ? `Deep liquidity (${money(tvl)} TVL) makes exits and price moves easier to absorb.`
        : `Only ${money(tvl)} TVL; thinner pools are easier to move and harder to exit.`,
  };
}

/** Coefficient of variation of the APY series, or null when too short. */
function apyVariation(history?: PoolHistoryPoint[]): number | null {
  if (!history || history.length < 7) return null;
  const values = history.slice(-30).map((p) => p.apy);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean <= 0) return null;
  const variance =
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function volatilityFactor(
  pool: Pool,
  history?: PoolHistoryPoint[],
): RiskFactor {
  const cv = apyVariation(history);
  let points: number;
  let basis: string;
  if (cv !== null) {
    points = Math.min(2.5, cv * 5);
    basis = `APY swung about ${(cv * 100).toFixed(0)}% around its 30-day mean.`;
  } else if (pool.sigma !== undefined) {
    points = Math.min(2.5, pool.sigma * 5);
    basis = `DefiLlama reports an APY deviation (sigma) of ${pool.sigma.toFixed(2)}.`;
  } else {
    const drift =
      pool.apy.day30Avg > 0
        ? Math.abs(pool.apy.current - pool.apy.day30Avg) / pool.apy.day30Avg
        : 0;
    points = Math.min(2.5, drift * 5);
    basis = `Current APY sits ${(drift * 100).toFixed(0)}% from its 30-day average.`;
  }
  return {
    key: "volatility",
    label: "APY volatility",
    points,
    maxPoints: 2.5,
    impact: impactOf(points, 2.5),
    explanation:
      points < 0.75
        ? `Stable yield. ${basis}`
        : `Yield moves a lot, so returns are hard to plan. ${basis}`,
  };
}

function rewardFactor(pool: Pool): RiskFactor {
  const base = pool.apyBase ?? 0;
  const reward = pool.apyReward ?? 0;
  const total = base + reward;
  const share = total > 0 ? reward / total : 0;
  const points = share * 2;
  return {
    key: "rewards",
    label: "Reward vs base APY",
    points,
    maxPoints: 2,
    impact: impactOf(points, 2),
    explanation:
      share >= 0.5
        ? `${(share * 100).toFixed(0)}% of the yield comes from token rewards, which can be cut or lose value.`
        : share > 0
          ? `${(share * 100).toFixed(0)}% of the yield is token rewards; the rest comes from fees.`
          : "Yield comes from trading fees or interest, not emissions.",
  };
}

function stablecoinFactor(pool: Pool): RiskFactor {
  const stable = pool.stablecoin === true;
  const points = stable ? 0 : 1.2;
  return {
    key: "stablecoin",
    label: "Stablecoin vs volatile",
    points,
    maxPoints: 1.2,
    impact: stable ? "low" : "high",
    explanation: stable
      ? "Stablecoin pool: principal is pegged to a dollar value."
      : "Volatile assets: the principal value can move sharply with the market.",
  };
}

function ilFactor(pool: Pool): RiskFactor {
  const stable = pool.stablecoin === true;
  const points = stable
    ? 0
    : pool.ilRisk === "high"
      ? 1.5
      : pool.ilRisk === "medium"
        ? 0.8
        : 0;
  return {
    key: "impermanentLoss",
    label: "Impermanent loss",
    points,
    maxPoints: 1.5,
    impact: impactOf(points, 1.5),
    explanation:
      points === 0
        ? "Assets track each other closely, so impermanent loss exposure is small."
        : `${pool.ilRisk === "high" ? "High" : "Moderate"} impermanent loss exposure if the two assets diverge in price.`,
  };
}

export function riskLevelFromScore(score: number): RiskLevel {
  if (score <= 3) return "low";
  if (score <= 6) return "medium";
  return "high";
}

/** Scores a pool from 1 to 10 and lists the factors driving the result. */
export function computeRiskScore(
  pool: Pool,
  history?: PoolHistoryPoint[],
): RiskScore {
  const factors = [
    tvlFactor(pool),
    volatilityFactor(pool, history),
    rewardFactor(pool),
    stablecoinFactor(pool),
    ilFactor(pool),
  ];
  const raw = factors.reduce((sum, f) => sum + f.points, 0);
  const score = Math.min(10, Math.max(1, Math.round(1 + (raw * 9) / MAX_RAW)));
  const main = [...factors].sort((a, b) => b.points - a.points).slice(0, 3);
  return { score, level: riskLevelFromScore(score), factors: main };
}
