/**
 * riskScoringUtils.ts
 * Structured risk scoring for DeFi liquidity pools.
 * Returns a RiskScore with sub-scores and an overall rating.
 */

import type { Pool, RiskScore } from "@/types/defi";

// ─── Scoring helpers (all 0–100, higher = lower risk) ────────────────────────

/**
 * TVL stability score.
 * Higher TVL → more stable → lower risk.
 */
function scoreTVLStability(tvl: number): number {
  if (tvl >= 100_000_000) return 95;
  if (tvl >= 50_000_000) return 85;
  if (tvl >= 10_000_000) return 70;
  if (tvl >= 5_000_000) return 55;
  if (tvl >= 1_000_000) return 40;
  if (tvl >= 100_000) return 25;
  return 10;
}

/**
 * Token concentration score.
 * Stablecoin or blue-chip pairs get a high (safe) score.
 */
function scoreTokenConcentration(token0: string, token1: string): number {
  const stables = new Set(["USDC", "USDT", "BUSD", "DAI", "FRAX", "TUSD"]);
  const bluechips = new Set([
    "ETH",
    "WBTC",
    "BTC",
    "BNB",
    "SOL",
    "ICP",
    "ckBTC",
    "ckETH",
  ]);

  const t0 = token0.toUpperCase();
  const t1 = token1.toUpperCase();

  const bothStable = stables.has(t0) && stables.has(t1);
  const oneStable = stables.has(t0) || stables.has(t1);
  const bothBlue = bluechips.has(t0) && bluechips.has(t1);
  const oneBlue = bluechips.has(t0) || bluechips.has(t1);

  if (bothStable) return 95;
  if (oneStable && oneBlue) return 80;
  if (bothBlue) return 70;
  if (oneStable) return 60;
  if (oneBlue) return 45;
  return 30;
}

/**
 * IL risk score derived from the pool's declared ilRisk field.
 * Inversion: low IL risk = high score.
 */
function scoreILRisk(ilRisk: Pool["ilRisk"]): number {
  switch (ilRisk) {
    case "low":
      return 85;
    case "medium":
      return 55;
    case "high":
      return 20;
    default:
      return 30;
  }
}

/**
 * Protocol age / maturity score.
 * Well-established protocols get a higher score.
 */
function scoreProtocolAge(protocol: string): number {
  const scores: Record<string, number> = {
    uniswap: 95,
    pancakeswap: 85,
    raydium: 75,
    icp: 65,
    icpswap: 60,
    kongswap: 55,
  };
  return scores[protocol.toLowerCase()] ?? 40;
}

// ─── Public function ──────────────────────────────────────────────────────────

/**
 * Computes a structured risk score for a pool.
 * All sub-scores are 0–100 (higher = safer).
 * overallScore is a weighted average.
 * overallRating maps the score to "low" | "medium" | "high" risk.
 */
export function computeRiskScore(pool: Pool): RiskScore {
  const tvlStabilityScore = scoreTVLStability(pool.stats.tvl);
  const tokenConcentrationScore = scoreTokenConcentration(
    pool.token0,
    pool.token1,
  );
  const ilRiskScore = scoreILRisk(pool.ilRisk);
  const protocolAgeScore = scoreProtocolAge(pool.protocol);

  // Weights: TVL 30%, token safety 25%, IL risk 30%, protocol maturity 15%
  const overallScore = Math.round(
    tvlStabilityScore * 0.3 +
      tokenConcentrationScore * 0.25 +
      ilRiskScore * 0.3 +
      protocolAgeScore * 0.15,
  );

  let overallRating: RiskScore["overallRating"];
  if (overallScore >= 65) {
    overallRating = "low";
  } else if (overallScore >= 40) {
    overallRating = "medium";
  } else {
    overallRating = "high";
  }

  return {
    tvlStabilityScore,
    tokenConcentrationScore,
    ilRiskScore,
    protocolAgeScore,
    overallScore,
    overallRating,
  };
}

/**
 * Returns a colour token (Tailwind class) matching the risk rating.
 */
export function riskRatingColor(rating: RiskScore["overallRating"]): string {
  switch (rating) {
    case "low":
      return "text-green-400";
    case "medium":
      return "text-yellow-400";
    case "high":
      return "text-red-400";
  }
}

/**
 * Returns a short label for the overall rating.
 */
export function riskRatingLabel(score: number): string {
  if (score >= 65) return "Low Risk";
  if (score >= 40) return "Medium Risk";
  return "High Risk";
}
