/**
 * poolDataService.ts
 * Fetches live pool data from ICPSwap and KongSwap REST APIs.
 * Implements 5-minute TTL client-side cache, retry logic (max 2 retries, 1s backoff),
 * and falls back to mock data when APIs are unreachable.
 */

import { MOCK_POOLS } from "@/data/mockData";
import type { Pool } from "@/types/defi";
import { computeDailyCompoundAPY, computeSimpleAPY } from "@/utils/apyUtils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DataSource = "live" | "cached" | "demo";

interface CacheEntry<T> {
  data: T;
  fetchedAt: number; // unix ms
}

// ─── Cache (module-level singleton) ──────────────────────────────────────────

const TTL_MS = 5 * 60 * 1_000; // 5 minutes
const cache = new Map<string, CacheEntry<Pool[]>>();

function isFresh(entry: CacheEntry<Pool[]>): boolean {
  return Date.now() - entry.fetchedAt < TTL_MS;
}

// ─── Retry helper ─────────────────────────────────────────────────────────────

async function fetchWithRetry(
  url: string,
  maxRetries = 2,
  backoffMs = 1_000,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }
  }
  throw lastError;
}

// ─── ICPSwap normalisation ────────────────────────────────────────────────────

interface ICPSwapPoolRaw {
  pool: string; // canister id / address
  token0Symbol?: string;
  token1Symbol?: string;
  token0?: string;
  token1?: string;
  tvlUSD?: number;
  volumeUSD?: number;
  feeTier?: number; // e.g. 3000 = 0.30 %
  apr?: number;
}

function normaliseICPSwapPool(raw: ICPSwapPoolRaw, idx: number): Pool {
  const sym0 = raw.token0Symbol ?? raw.token0 ?? "T0";
  const sym1 = raw.token1Symbol ?? raw.token1 ?? "T1";
  const tvl = raw.tvlUSD ?? 0;
  const vol24h = raw.volumeUSD ?? 0;
  const feeRate = raw.feeTier ? raw.feeTier / 1_000_000 : 0.003;
  const fees24h = vol24h * feeRate;
  const effectiveAPY = computeDailyCompoundAPY(fees24h, tvl);
  const simpleAPY = computeSimpleAPY(feeRate, vol24h, tvl);
  const currentAPY = raw.apr ?? effectiveAPY;

  return {
    id: `icpswap-${raw.pool ?? idx}`,
    name: `${sym0}/${sym1}`,
    token0: sym0,
    token1: sym1,
    protocol: "icp",
    chain: "Internet Computer",
    address: raw.pool ?? "",
    stats: { tvl, volume24h: vol24h, fees24h, feeRate },
    apy: {
      current: Number(currentAPY.toFixed(2)),
      day1Change: 0,
      day7Avg: Number(simpleAPY.toFixed(2)),
      day30Avg: Number(simpleAPY.toFixed(2)),
    },
    apyTrend: { day1: currentAPY, day7: [], day30: [] },
    ilRisk: tvl < 500_000 ? "high" : tvl < 5_000_000 ? "medium" : "low",
    dataSource: "live" as DataSource,
    lastUpdated: Date.now(),
    securityScore: 75,
    compoundingFrequency: "Daily (ICPSwap)",
  };
}

// ─── KongSwap normalisation ───────────────────────────────────────────────────

interface KongSwapPoolRaw {
  symbol?: string; // e.g. "ICP_ckBTC"
  address?: string;
  tvl?: number;
  rolling_24h_volume?: number;
  rolling_24h_apy?: number;
  fee?: number; // e.g. 0.003
}

function normaliseKongSwapPool(raw: KongSwapPoolRaw, idx: number): Pool {
  const parts = (raw.symbol ?? "T0_T1").split("_");
  const sym0 = parts[0] ?? "T0";
  const sym1 = parts[1] ?? "T1";
  const tvl = raw.tvl ?? 0;
  const vol24h = raw.rolling_24h_volume ?? 0;
  const feeRate = raw.fee ?? 0.003;
  const fees24h = vol24h * feeRate;
  const effectiveAPY = computeDailyCompoundAPY(fees24h, tvl);
  const simpleAPY = computeSimpleAPY(feeRate, vol24h, tvl);
  const currentAPY = raw.rolling_24h_apy ?? effectiveAPY;

  return {
    id: `kongswap-${raw.address ?? idx}`,
    name: `${sym0}/${sym1}`,
    token0: sym0,
    token1: sym1,
    protocol: "icp",
    chain: "Internet Computer",
    address: raw.address ?? "",
    stats: { tvl, volume24h: vol24h, fees24h, feeRate },
    apy: {
      current: Number(currentAPY.toFixed(2)),
      day1Change: 0,
      day7Avg: Number(simpleAPY.toFixed(2)),
      day30Avg: Number(simpleAPY.toFixed(2)),
    },
    apyTrend: { day1: currentAPY, day7: [], day30: [] },
    ilRisk: tvl < 500_000 ? "high" : tvl < 5_000_000 ? "medium" : "low",
    dataSource: "live" as DataSource,
    lastUpdated: Date.now(),
    securityScore: 72,
    compoundingFrequency: "Daily (KongSwap)",
  };
}

// ─── Fetch ICPSwap pools ───────────────────────────────────────────────────────

async function fetchICPSwapPools(): Promise<Pool[]> {
  const cacheKey = "icpswap";
  const cached = cache.get(cacheKey);
  if (cached && isFresh(cached)) {
    return cached.data.map((p) => ({
      ...p,
      dataSource: "cached" as DataSource,
    }));
  }

  const res = await fetchWithRetry("https://api.icpswap.com/info/pool/list");
  const json = (await res.json()) as
    | { data?: ICPSwapPoolRaw[] }
    | ICPSwapPoolRaw[];
  const rawList: ICPSwapPoolRaw[] = Array.isArray(json)
    ? json
    : ((json as { data?: ICPSwapPoolRaw[] }).data ?? []);

  const pools = rawList.map(normaliseICPSwapPool);
  cache.set(cacheKey, { data: pools, fetchedAt: Date.now() });
  return pools;
}

// ─── Fetch KongSwap pools ──────────────────────────────────────────────────────

async function fetchKongSwapPools(): Promise<Pool[]> {
  const cacheKey = "kongswap";
  const cached = cache.get(cacheKey);
  if (cached && isFresh(cached)) {
    return cached.data.map((p) => ({
      ...p,
      dataSource: "cached" as DataSource,
    }));
  }

  const res = await fetchWithRetry("https://api.kongswap.io/pools");
  const json = (await res.json()) as
    | { pools?: KongSwapPoolRaw[] }
    | KongSwapPoolRaw[];
  const rawList: KongSwapPoolRaw[] = Array.isArray(json)
    ? json
    : ((json as { pools?: KongSwapPoolRaw[] }).pools ?? []);

  const pools = rawList.map(normaliseKongSwapPool);
  cache.set(cacheKey, { data: pools, fetchedAt: Date.now() });
  return pools;
}

// ─── Public API ────────────────────────────────────────────────────────────────

export interface PoolFetchResult {
  pools: Pool[];
  source: DataSource;
  fetchedAt: number;
  error?: string;
}

/**
 * Fetches live ICP-native pools from ICPSwap + KongSwap, merged and de-duped.
 * Falls back to demo data (MOCK_POOLS filtered to protocol="icp") on failure.
 */
export async function fetchICPPools(): Promise<PoolFetchResult> {
  const results = await Promise.allSettled([
    fetchICPSwapPools(),
    fetchKongSwapPools(),
  ]);

  const combined: Pool[] = [];
  let anyLive = false;

  for (const result of results) {
    if (result.status === "fulfilled") {
      combined.push(...result.value);
      if (result.value.some((p) => p.dataSource === "live")) anyLive = true;
    }
  }

  if (combined.length > 0) {
    const deduped = deduplicatePools(combined);
    return {
      pools: deduped,
      source: anyLive ? "live" : "cached",
      fetchedAt: Date.now(),
    };
  }

  // Both failed → return mock ICP pools tagged as demo
  const demoPools = MOCK_POOLS.filter((p) => p.protocol === "icp").map((p) => ({
    ...p,
    dataSource: "demo" as DataSource,
    lastUpdated: Date.now(),
    securityScore: p.securityScore ?? 60,
    compoundingFrequency: p.compoundingFrequency ?? "Daily",
  }));

  return {
    pools: demoPools,
    source: "demo",
    fetchedAt: Date.now(),
    error: "Live APIs unreachable — showing demo data.",
  };
}

/**
 * Returns all pools: live ICP-native pools merged with mocked pools for
 * Uniswap, PancakeSwap, and Raydium (tagged demo).
 */
export async function fetchAllPools(): Promise<PoolFetchResult> {
  const icpResult = await fetchICPPools();

  const demoOther = MOCK_POOLS.filter((p) => p.protocol !== "icp").map((p) => ({
    ...p,
    dataSource: "demo" as DataSource,
    lastUpdated: Date.now(),
    securityScore: p.securityScore ?? 70,
    compoundingFrequency: p.compoundingFrequency ?? "Annual",
  }));

  return {
    pools: [...icpResult.pools, ...demoOther],
    source: icpResult.source,
    fetchedAt: icpResult.fetchedAt,
    error: icpResult.error,
  };
}

/** Returns the cached entry age (ms) for a given source key, or null if not cached. */
export function getCacheAge(key: "icpswap" | "kongswap"): number | null {
  const entry = cache.get(key);
  return entry ? Date.now() - entry.fetchedAt : null;
}

/** Removes duplicate pools by address, preferring live over cached over demo. */
function deduplicatePools(pools: Pool[]): Pool[] {
  const seen = new Map<string, Pool>();
  const priority: Record<DataSource, number> = { live: 2, cached: 1, demo: 0 };

  for (const pool of pools) {
    const key = pool.address || pool.id;
    const existing = seen.get(key);
    if (
      !existing ||
      priority[pool.dataSource ?? "demo"] >
        priority[existing.dataSource ?? "demo"]
    ) {
      seen.set(key, pool);
    }
  }
  return Array.from(seen.values());
}
