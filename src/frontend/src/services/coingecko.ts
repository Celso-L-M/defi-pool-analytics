import type { TokenPrice } from "@/types/defi";

const PRICE_URL = "https://api.coingecko.com/api/v3/simple/price";

interface CoinGeckoEntry {
  usd?: number;
  usd_24h_change?: number;
}

/** Fetches USD prices and 24h change for CoinGecko coin ids (no API key). */
export async function fetchTokenPrices(
  ids: string[],
  signal?: AbortSignal,
): Promise<Record<string, TokenPrice>> {
  if (ids.length === 0) return {};
  const url = `${PRICE_URL}?ids=${encodeURIComponent(ids.join(","))}&vs_currencies=usd&include_24hr_change=true`;
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`CoinGecko request failed (HTTP ${response.status})`);
  }
  const json = (await response.json()) as Record<string, CoinGeckoEntry>;
  const result: Record<string, TokenPrice> = {};
  for (const id of ids) {
    const entry = json[id];
    if (entry && typeof entry.usd === "number") {
      result[id] = { usd: entry.usd, change24h: entry.usd_24h_change ?? 0 };
    }
  }
  return result;
}

/** Fixed illustrative prices, only ever shown with the Demo data label. */
export const DEMO_TOKEN_PRICES: Record<string, TokenPrice> = {
  bitcoin: { usd: 65000, change24h: 0.8 },
  ethereum: { usd: 3200, change24h: 1.2 },
  tether: { usd: 1, change24h: 0 },
  "usd-coin": { usd: 1, change24h: 0 },
  solana: { usd: 150, change24h: -0.6 },
  binancecoin: { usd: 580, change24h: 0.3 },
  "internet-computer": { usd: 11, change24h: 2.1 },
  uniswap: { usd: 8, change24h: -1.4 },
  "pancakeswap-token": { usd: 2.5, change24h: 0.9 },
  raydium: { usd: 2, change24h: 1.7 },
};
