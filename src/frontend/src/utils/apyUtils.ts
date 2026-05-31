/**
 * apyUtils.ts
 * APY calculation utilities with per-protocol compounding logic.
 *
 * Compounding formulas:
 *   ICPSwap / KongSwap  → effectiveAPY = (1 + fees24h/TVL)^365 - 1  (daily compound)
 *   Uniswap / PancakeSwap → simpleAPY = feeRate * volume24h / tvl * 365
 *   Raydium             → simpleAPY + daily compound provided for reference
 */

import type { Protocol } from "@/types/defi";

export interface APYBreakdown {
  simpleAPY: number; // annualised, no compounding
  effectiveAPY: number; // annualised, with compounding
  compoundingLabel: string;
}

/**
 * Daily-compounding APY.
 * effectiveAPY = (1 + dailyReturn)^365 - 1
 * where dailyReturn = fees24h / tvl  (expressed as a decimal)
 */
export function computeDailyCompoundAPY(fees24h: number, tvl: number): number {
  if (tvl <= 0) return 0;
  const dailyReturn = fees24h / tvl;
  return ((1 + dailyReturn) ** 365 - 1) * 100;
}

/**
 * Simple (non-compounding) APY.
 * simpleAPY = feeRate * volume24h / tvl * 365
 */
export function computeSimpleAPY(
  feeRate: number,
  volume24h: number,
  tvl: number,
): number {
  if (tvl <= 0) return 0;
  return ((feeRate * volume24h) / tvl) * 365 * 100;
}

/**
 * Returns both simpleAPY and effectiveAPY plus a human-readable label
 * that describes the compounding frequency used for the given protocol.
 */
export function computeAPYBreakdown(
  protocol: Protocol | string,
  feeRate: number,
  volume24h: number,
  fees24h: number,
  tvl: number,
): APYBreakdown {
  // Fallback: derive fees24h from feeRate × volume if not supplied
  const resolvedFees = fees24h > 0 ? fees24h : feeRate * volume24h;

  const simpleAPY = computeSimpleAPY(feeRate, volume24h, tvl);
  const effectiveAPY = computeDailyCompoundAPY(resolvedFees, tvl);

  switch (protocol) {
    case "icp":
    case "icpswap":
    case "kongswap":
      return {
        simpleAPY,
        effectiveAPY,
        compoundingLabel: "Daily compound (ICP-native)",
      };

    case "raydium":
      return {
        simpleAPY,
        effectiveAPY,
        compoundingLabel: "Daily compound (Raydium)",
      };

    case "uniswap":
      return {
        simpleAPY,
        effectiveAPY: simpleAPY, // Uniswap v3 positions don't auto-compound
        compoundingLabel: "Simple (Uniswap v3 — manual reinvest)",
      };

    case "pancakeswap":
      return {
        simpleAPY,
        effectiveAPY: simpleAPY, // PancakeSwap standard pools are manual
        compoundingLabel: "Simple (PancakeSwap — manual reinvest)",
      };

    default:
      return {
        simpleAPY,
        effectiveAPY,
        compoundingLabel: "Daily compound (generic)",
      };
  }
}

/**
 * Human-friendly APY label for UI display.
 * Shows effectiveAPY for protocols with auto-compounding.
 */
export function formatAPYLabel(
  protocol: Protocol | string,
  simpleAPY: number,
  effectiveAPY: number,
): string {
  const autoCompound = ["icp", "icpswap", "kongswap", "raydium"];
  const apy = autoCompound.includes(protocol) ? effectiveAPY : simpleAPY;
  return `${apy.toFixed(2)}%`;
}
