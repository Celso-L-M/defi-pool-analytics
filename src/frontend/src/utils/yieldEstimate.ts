export interface EarningsSplit {
  base: number;
  reward: number;
  total: number;
}

export interface YieldEstimate {
  daily: EarningsSplit;
  monthly: EarningsSplit;
  yearly: EarningsSplit;
}

const DAYS_PER_YEAR = 365;
const MONTHS_PER_YEAR = 12;

function split(
  deposit: number,
  baseApy: number,
  rewardApy: number,
  periodsPerYear: number,
): EarningsSplit {
  const base = (deposit * baseApy) / 100 / periodsPerYear;
  const reward = (deposit * rewardApy) / 100 / periodsPerYear;
  return { base, reward, total: base + reward };
}

/**
 * Projects simple (non-compounding) earnings for a deposit in USD. The APY
 * percentages are annual rates and are assumed to stay constant.
 */
export function estimateYield(
  deposit: number,
  baseApy: number,
  rewardApy: number,
): YieldEstimate {
  const amount = Number.isFinite(deposit) && deposit > 0 ? deposit : 0;
  const base = Number.isFinite(baseApy) ? Math.max(0, baseApy) : 0;
  const reward = Number.isFinite(rewardApy) ? Math.max(0, rewardApy) : 0;
  return {
    daily: split(amount, base, reward, DAYS_PER_YEAR),
    monthly: split(amount, base, reward, MONTHS_PER_YEAR),
    yearly: split(amount, base, reward, 1),
  };
}
