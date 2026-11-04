import { MOCK_POOLS, PROTOCOL_METADATA } from "@/data/mockData";
import { usePools } from "@/hooks/useLiveData";
import type { Pool } from "@/types/defi";
import { useMemo } from "react";

export interface Farm {
  id: string;
  name: string;
  project: string;
  chain: string;
  tvl: number;
  baseApy: number;
  rewardApy: number;
  totalApy: number;
  /** Reward APY as a fraction (0 to 1) of total APY. */
  rewardShare: number;
  stablecoin: boolean;
  /** Pool carrying the resolved APY split, for risk scoring. */
  pool: Pool;
}

export interface YieldFarmsResult {
  farms: Farm[];
  chains: string[];
  isDemo: boolean;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

const STABLE_SYMBOLS = new Set(["USDC", "USDT", "DAI", "BUSD", "USDP", "FRAX"]);

/** Stable pseudo-random reward share (20% to 59%) for a demo pool id. */
function demoRewardShare(id: string): number {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return 0.2 + (hash % 40) / 100;
}

function toFarm(pool: Pool, demo: boolean): Farm | null {
  const current = pool.apy.current;
  if (!Number.isFinite(current) || current <= 0) return null;

  let rewardApy = pool.apyReward ?? 0;
  let baseApy = pool.apyBase ?? Math.max(0, current - rewardApy);
  if (demo && rewardApy <= 0) {
    rewardApy = current * demoRewardShare(pool.id);
    baseApy = current - rewardApy;
  }
  if (!(rewardApy > 0)) return null;

  const totalApy = baseApy + rewardApy;
  const stablecoin =
    pool.stablecoin ??
    (STABLE_SYMBOLS.has(pool.token0) && STABLE_SYMBOLS.has(pool.token1));
  return {
    id: pool.id,
    name: pool.name,
    project:
      pool.project ?? PROTOCOL_METADATA[pool.protocol]?.name ?? pool.protocol,
    chain: pool.chain,
    tvl: pool.stats.tvl,
    baseApy,
    rewardApy,
    totalApy,
    rewardShare: totalApy > 0 ? rewardApy / totalApy : 0,
    stablecoin,
    pool: { ...pool, apyBase: baseApy, apyReward: rewardApy, stablecoin },
  };
}

/** Pools with reward APY above zero, derived from the shared pools query. */
export function useYieldFarms(): YieldFarmsResult {
  const pools = usePools();
  const { data, isDemo } = pools;

  const farms = useMemo(() => {
    const source = isDemo && data.length === 0 ? MOCK_POOLS : data;
    return source
      .map((pool) => toFarm(pool, isDemo))
      .filter((farm): farm is Farm => farm !== null);
  }, [data, isDemo]);

  const chains = useMemo(
    () =>
      [...new Set(farms.map((f) => f.chain))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [farms],
  );

  return {
    farms,
    chains,
    isDemo,
    isLoading: pools.isLoading,
    isError: pools.isError,
    refetch: pools.refetch,
  };
}
