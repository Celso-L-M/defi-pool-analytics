import { MOCK_POOLS } from "@/data/mockData";
import { DEMO_TOKEN_PRICES, fetchTokenPrices } from "@/services/coingecko";
import { fetchPoolHistory, fetchPools } from "@/services/defillama";
import { useDefiStore } from "@/store/useDefiStore";
import type { Pool, PoolHistoryPoint, TokenPrice } from "@/types/defi";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

const POOLS_STALE_MS = 5 * 60_000;
const retryDelay = (attempt: number) => Math.min(1000 * 2 ** attempt, 8000);

function useRefreshMs(minMs: number): number | false {
  const autoRefresh = useDefiStore((s) => s.autoRefresh);
  const pollingInterval = useDefiStore((s) => s.pollingInterval);
  return autoRefresh ? Math.max(pollingInterval * 1000, minMs) : false;
}

export interface LiveResult<T> {
  data: T;
  isLoading: boolean;
  /** True when the live source failed (even if cached or demo data is shown). */
  isError: boolean;
  refetch: () => void;
  /** True when `data` is the deterministic demo fallback. */
  isDemo: boolean;
}

/** Live DefiLlama pools; falls back to demo pools when the request fails. */
export function usePools(): LiveResult<Pool[]> {
  const refetchInterval = useRefreshMs(5 * 60_000);
  const query = useQuery({
    queryKey: ["pools", "defillama"],
    queryFn: ({ signal }) => fetchPools(signal),
    staleTime: POOLS_STALE_MS,
    gcTime: 30 * 60_000,
    retry: 2,
    retryDelay,
    refetchInterval,
    refetchOnWindowFocus: false,
  });
  const useDemo = !query.data && query.isError;
  return {
    data: query.data ?? (useDemo ? MOCK_POOLS : []),
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => {
      void query.refetch();
    },
    isDemo: useDemo,
  };
}

/** One pool from the shared pools cache, matched by its id or DefiLlama id. */
export function usePool(id: string | undefined): LiveResult<Pool | undefined> {
  const pools = usePools();
  const pool = useMemo(
    () => pools.data.find((p) => p.id === id || p.poolId === id),
    [pools.data, id],
  );
  return { ...pools, data: pool };
}

const MOCK_IDS = new Set(MOCK_POOLS.map((p) => p.id));

function demoHistory(poolId: string): PoolHistoryPoint[] {
  const pool = MOCK_POOLS.find((p) => p.id === poolId);
  if (!pool) return [];
  return pool.apyTrend.day30.map((point) => ({
    date: point.date,
    timestamp: new Date(`${point.date}T00:00:00Z`).getTime(),
    apy: point.apy,
    apyBase: point.apy,
    apyReward: 0,
    tvlUsd: pool.stats.tvl,
  }));
}

/** Daily APY and TVL history of a pool; demo pools use deterministic data. */
export function usePoolHistory(
  poolId: string | undefined,
): LiveResult<PoolHistoryPoint[]> {
  const isMock = poolId !== undefined && MOCK_IDS.has(poolId);
  const query = useQuery({
    queryKey: ["pool-history", poolId],
    queryFn: ({ signal }) => fetchPoolHistory(poolId ?? "", signal),
    enabled: !!poolId && !isMock,
    staleTime: 15 * 60_000,
    retry: 2,
    retryDelay,
    refetchOnWindowFocus: false,
  });
  const demo = useMemo(
    () =>
      poolId && (isMock || (!query.data && query.isError))
        ? demoHistory(poolId)
        : [],
    [poolId, isMock, query.data, query.isError],
  );
  const useDemo = isMock || (!query.data && query.isError);
  return {
    data: query.data ?? demo,
    isLoading: !isMock && query.isLoading,
    isError: query.isError,
    refetch: () => {
      void query.refetch();
    },
    isDemo: useDemo,
  };
}

/** USD prices for CoinGecko coin ids; falls back to labelled demo prices. */
export function useTokenPrices(
  ids: string[],
): LiveResult<Record<string, TokenPrice>> {
  const key = [...ids].sort().join(",");
  const refetchInterval = useRefreshMs(30_000);
  const query = useQuery({
    queryKey: ["token-prices", key],
    queryFn: ({ signal }) =>
      fetchTokenPrices(key ? key.split(",") : [], signal),
    enabled: key.length > 0,
    staleTime: 30_000,
    retry: 2,
    retryDelay,
    refetchInterval,
    refetchOnWindowFocus: false,
  });
  const useDemo = !query.data && query.isError;
  const demo = useMemo(() => {
    const out: Record<string, TokenPrice> = {};
    for (const id of key ? key.split(",") : []) {
      if (DEMO_TOKEN_PRICES[id]) out[id] = DEMO_TOKEN_PRICES[id];
    }
    return out;
  }, [key]);
  return {
    data: query.data ?? (useDemo ? demo : {}),
    isLoading: key.length > 0 && query.isLoading,
    isError: query.isError,
    refetch: () => {
      void query.refetch();
    },
    isDemo: useDemo,
  };
}
