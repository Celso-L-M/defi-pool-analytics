import type { ILRisk, Pool, PoolHistoryPoint, Protocol } from "@/types/defi";

const POOLS_URL = "https://yields.llama.fi/pools";
const CHART_URL = "https://yields.llama.fi/chart";

/** Pools below this TVL are dropped as too small to analyse. */
export const MIN_TVL_USD = 1_000_000;
/** Maximum number of pools kept after sorting by TVL. */
export const MAX_POOLS = 300;

interface LlamaPool {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apy?: number | null;
  apyBase?: number | null;
  apyReward?: number | null;
  apyPct1D?: number | null;
  apyBase7d?: number | null;
  apyMean30d?: number | null;
  stablecoin?: boolean | null;
  ilRisk?: string | null;
  sigma?: number | null;
  volumeUsd1d?: number | null;
  poolMeta?: string | null;
  outlier?: boolean | null;
  underlyingTokens?: string[] | null;
}

interface LlamaChartPoint {
  timestamp: string;
  tvlUsd?: number | null;
  apy?: number | null;
  apyBase?: number | null;
  apyReward?: number | null;
}

async function fetchLlama<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`DefiLlama request failed (HTTP ${response.status})`);
  }
  const json = (await response.json()) as { status?: string; data?: T };
  if (!json.data) throw new Error("DefiLlama returned no data");
  return json.data;
}

function protocolFor(project: string, chain: string): Protocol {
  const p = project.toLowerCase();
  if (p.startsWith("uniswap")) return "uniswap";
  if (p.startsWith("pancakeswap")) return "pancakeswap";
  if (p.startsWith("raydium")) return "raydium";
  if (p.startsWith("icpswap") || chain === "Internet Computer") return "icp";
  if (chain === "BSC") return "pancakeswap";
  if (chain === "Solana") return "raydium";
  return "uniswap";
}

function ilRiskFor(p: LlamaPool, apy: number): ILRisk {
  if (p.stablecoin || p.ilRisk !== "yes") return "low";
  return apy > 50 || (p.sigma ?? 0) > 0.15 ? "high" : "medium";
}

function feeRateFrom(meta?: string | null): number {
  const match = meta?.match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? Number.parseFloat(match[1]) : 0;
}

export function mapLlamaPool(p: LlamaPool): Pool {
  const base = p.apyBase ?? 0;
  const reward = p.apyReward ?? 0;
  const apy = p.apy ?? base + reward;
  const parts = p.symbol.split("-").filter(Boolean);
  const feeRate = feeRateFrom(p.poolMeta);
  const volume = p.volumeUsd1d ?? 0;
  return {
    id: p.pool,
    poolId: p.pool,
    name: parts.length > 0 ? parts.join("/") : p.symbol,
    token0: parts[0] ?? p.symbol,
    token1: parts[1] ?? "—",
    protocol: protocolFor(p.project, p.chain),
    project: p.project,
    chain: p.chain,
    address: p.underlyingTokens?.[0] ?? "",
    stats: {
      tvl: p.tvlUsd,
      volume24h: volume,
      fees24h: (volume * feeRate) / 100,
      feeRate,
    },
    apy: {
      current: apy,
      day1Change: p.apyPct1D ?? 0,
      day7Avg: p.apyBase7d != null ? p.apyBase7d + reward : apy,
      day30Avg: p.apyMean30d ?? apy,
    },
    apyTrend: { day1: apy, day7: [], day30: [] },
    ilRisk: ilRiskFor(p, apy),
    apyBase: base,
    apyReward: reward,
    stablecoin: p.stablecoin === true,
    sigma: p.sigma ?? undefined,
  };
}

/** Fetches DefiLlama pools, keeps the largest well-sized ones. */
export async function fetchPools(signal?: AbortSignal): Promise<Pool[]> {
  const raw = await fetchLlama<LlamaPool[]>(POOLS_URL, signal);
  if (!Array.isArray(raw)) throw new Error("Unexpected DefiLlama response");
  return raw
    .filter(
      (p) =>
        typeof p.tvlUsd === "number" &&
        p.tvlUsd >= MIN_TVL_USD &&
        p.outlier !== true &&
        Number.isFinite(p.apy ?? (p.apyBase ?? 0) + (p.apyReward ?? 0)),
    )
    .sort((a, b) => b.tvlUsd - a.tvlUsd)
    .slice(0, MAX_POOLS)
    .map(mapLlamaPool);
}

/** Fetches daily APY and TVL history for one pool (last year at most). */
export async function fetchPoolHistory(
  poolId: string,
  signal?: AbortSignal,
): Promise<PoolHistoryPoint[]> {
  const raw = await fetchLlama<LlamaChartPoint[]>(
    `${CHART_URL}/${encodeURIComponent(poolId)}`,
    signal,
  );
  if (!Array.isArray(raw)) throw new Error("Unexpected DefiLlama response");
  return raw.slice(-365).map((point) => {
    const time = new Date(point.timestamp);
    return {
      date: time.toISOString().slice(0, 10),
      timestamp: time.getTime(),
      apy: point.apy ?? 0,
      apyBase: point.apyBase ?? 0,
      apyReward: point.apyReward ?? 0,
      tvlUsd: point.tvlUsd ?? 0,
    };
  });
}
