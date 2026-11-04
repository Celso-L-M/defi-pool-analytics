export type Protocol = "uniswap" | "pancakeswap" | "raydium" | "icp";

export type ILRisk = "low" | "medium" | "high";

export interface APYDataPoint {
  date: string;
  apy: number;
}

export interface APYTrend {
  day1: number;
  day7: APYDataPoint[];
  day30: APYDataPoint[];
}

export interface PoolStats {
  tvl: number;
  volume24h: number;
  fees24h: number;
  feeRate: number;
}

export interface Pool {
  id: string;
  name: string;
  token0: string;
  token1: string;
  protocol: Protocol;
  stats: PoolStats;
  apy: {
    current: number;
    day1Change: number;
    day7Avg: number;
    day30Avg: number;
  };
  apyTrend: APYTrend;
  ilRisk: ILRisk;
  chain: string;
  address: string;
  /** DefiLlama pool UUID. Absent on demo pools, whose `id` is the key. */
  poolId?: string;
  /** Real project slug, for example "uniswap-v3" (protocol is a coarse bucket). */
  project?: string;
  apyBase?: number;
  apyReward?: number;
  stablecoin?: boolean;
  /** Standard deviation of APY changes reported by DefiLlama. */
  sigma?: number;
}

/** One daily point of per-pool history (live or demo). */
export interface PoolHistoryPoint {
  date: string;
  timestamp: number;
  apy: number;
  apyBase: number;
  apyReward: number;
  tvlUsd: number;
}

export interface TokenPrice {
  usd: number;
  change24h: number;
}

export interface Position {
  id: string;
  poolId: string;
  poolName: string;
  protocol: Protocol;
  token0Amount: number;
  token1Amount: number;
  token0Symbol: string;
  token1Symbol: string;
  entryValueUSD: number;
  currentValueUSD: number;
  earnings: number;
  ilPercent: number;
  feesEarned: number;
  entryDate: string;
  dataSource?: "live" | "demo";
}

export interface PositionTrackerEntry {
  position: Position;
  pool: Pool;
  netPnL: number;
  isProfit: boolean;
}

export interface ProtocolMetadata {
  id: Protocol;
  name: string;
  chain: string;
  chainId: number;
  color: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  logoSymbol: string;
}

export interface SortConfig {
  key: keyof Pool | "tvl" | "apy" | "volume" | "fees" | "ilRisk";
  direction: "asc" | "desc";
}

export interface ILCalculatorInput {
  token0Amount: number;
  token1Amount: number;
  token0PriceEntry: number;
  token1PriceEntry: number;
  token0PriceCurrent: number;
  token1PriceCurrent: number;
  feeRate: number;
  daysInPool: number;
}

export interface ILCalculatorResult {
  ilPercent: number;
  ilUSD: number;
  hodlValue: number;
  poolValue: number;
  feesEarned: number;
  netPnL: number;
  breakEvenDays: number;
}
