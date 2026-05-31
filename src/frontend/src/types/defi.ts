/** Breadcrumb navigation item */
export interface BreadcrumbItem {
  label: string;
  href?: string;
}

/** Data source information with freshness status */
export interface DataSourceInfo {
  source: string;
  lastUpdated: Date | null;
  status: "live" | "cached" | "demo";
}

/** Union of all defined help term keys */
export type HelpTermKey =
  | "APY"
  | "TVL"
  | "ImpermanentLoss"
  | "FundingRate"
  | "LongShortRatio";

export type Protocol = "uniswap" | "pancakeswap" | "raydium" | "icp";

export type ILRisk = "low" | "medium" | "high";

/** Indicates where the pool data originated from. */
export type DataSourceStatus = "live" | "cached" | "demo";

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
  /** Data freshness indicator — set by poolDataService */
  dataSource?: DataSourceStatus;
  /** Unix timestamp (ms) of last successful data fetch */
  lastUpdated?: number;
  /** 0–100 security / audit score */
  securityScore?: number;
  /** Human-readable compounding frequency label */
  compoundingFrequency?: string;
}

/** Structured risk assessment for a pool. All sub-scores 0–100 (higher = safer). */
export interface RiskScore {
  tvlStabilityScore: number;
  tokenConcentrationScore: number;
  ilRiskScore: number;
  protocolAgeScore: number;
  overallScore: number;
  overallRating: "low" | "medium" | "high";
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
