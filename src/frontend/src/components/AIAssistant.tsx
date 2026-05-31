import { MOCK_POOLS, MOCK_POSITIONS } from "@/data/mockData";
import { safeLocalStorage } from "@/store/useDefiStore";
import type { Pool } from "@/types/defi";
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  BarChart2,
  Brain,
  ChevronDown,
  Clock,
  Copy,
  Download,
  Info,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "../utils/toast";

// ─── Helpers ─────────────────────────────────────────────────────────────────────────────

function fmt$(n: number, decimals = 0) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

function fmtPct(n: number, decimals = 1) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(decimals)}%`;
}

function daysSince(dateStr: string): number {
  const ms = Date.now() - new Date(dateStr).getTime();
  return Math.max(1, Math.floor(ms / 86_400_000));
}

function timeAgo(ts: number): string {
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function isValidPrincipal(id: string): boolean {
  // ICP principal: 5-char base32 groups separated by hyphens.
  // Most segments are exactly 5 chars, but the final checksum segment
  // can be 2–5 chars (e.g. the canonical principal ends in 'qae' = 3 chars).
  return /^[a-z0-9]{5}(-[a-z0-9]{2,5}){4,28}$/i.test(id.trim());
}

// ─── Types ─────────────────────────────────────────────────────────────────────────────────

type Severity = "high-risk" | "warning" | "opportunity" | "info";
type RecommendationType = "hold" | "move" | "convert";
type TabId = "insights" | "ask" | "history" | "yield" | "portfolio";
type RiskPreference = "conservative" | "moderate" | "aggressive";

interface Insight {
  id: string;
  severity: Severity;
  title: string;
  description: string;
  icon: "shield" | "alert" | "trend" | "info" | "zap" | "check";
  poolName?: string;
  recommendationType?: RecommendationType;
  confidence?: number;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AIHistoryEntry {
  id: string;
  timestamp: number;
  poolName: string;
  recommendationType: RecommendationType;
  confidence: number;
  reasoning: string;
  insightId: string;
}

interface PoolAllocation {
  pool: Pool;
  score: number;
  allocation: number;
  volatilityScore: number;
  tvlScore: number;
  ilScore: number;
}

interface TrackedPosition {
  poolName: string;
  assetPair: string;
  usdValue: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  feesEarned: number;
  daysInPosition: number;
  currentAPY: number;
  protocol: string;
  ilRisk: string;
  tvlPct: number;
  dataSource: "live" | "demo";
  staked?: boolean;
  liquidity?: number;
}

const LS_AI_HISTORY = "defi_ai_history";

// ─── Insight engine ──────────────────────────────────────────────────────────────────────────

function buildInsights(
  pools: Pool[],
  entries: typeof MOCK_POSITIONS,
): Insight[] {
  const insights: Insight[] = [];
  const positions = entries.map((e) => e.position);

  for (const pos of positions) {
    if (pos.ilPercent < -5) {
      const offsetting =
        pos.feesEarned > Math.abs(pos.currentValueUSD * (pos.ilPercent / 100));
      insights.push({
        id: `il-high-${pos.id}`,
        severity: "high-risk",
        icon: "shield",
        poolName: pos.poolName,
        recommendationType: offsetting ? "hold" : "move",
        confidence: offsetting ? 72 : 85,
        title: `High IL: ${pos.poolName}`,
        description: `Your ${pos.poolName} position has ${fmtPct(pos.ilPercent)} impermanent loss (${fmt$(Math.abs(pos.currentValueUSD * (pos.ilPercent / 100)), 0)}). Fees earned (${fmt$(pos.feesEarned, 0)}) ${offsetting ? "are offsetting" : "are NOT yet covering"} the loss.`,
      });
    }
  }

  for (const pool of pools) {
    if (pool.apy.day1Change < 0 && pool.apy.current > pool.apy.day30Avg * 1.2) {
      insights.push({
        id: `apy-reversal-${pool.id}`,
        severity: "warning",
        icon: "alert",
        poolName: pool.name,
        recommendationType: "move",
        confidence: 68,
        title: `APY Cooling: ${pool.name}`,
        description: `${pool.name} APY is ${pool.apy.current.toFixed(1)}% (well above 30d avg of ${pool.apy.day30Avg.toFixed(1)}%), but dropped ${Math.abs(pool.apy.day1Change).toFixed(1)}% today. Potential mean reversion ahead.`,
      });
    }
  }

  const bestOpp = pools
    .filter((p) => p.ilRisk === "low" && p.apy.day1Change > 0)
    .sort((a, b) => b.apy.current - a.apy.current)[0];
  if (bestOpp) {
    insights.push({
      id: "best-opp",
      severity: "opportunity",
      icon: "trend",
      poolName: bestOpp.name,
      recommendationType: "convert",
      confidence: 78,
      title: `Top Low-Risk Opportunity: ${bestOpp.name}`,
      description: `${bestOpp.name} on ${bestOpp.chain} offers ${bestOpp.apy.current.toFixed(1)}% APY with low IL risk and a ${fmtPct(bestOpp.apy.day1Change)} daily trend. Strong risk-adjusted pick.`,
    });
  }

  for (const pos of positions) {
    const days = daysSince(pos.entryDate);
    const dailyFeeRate = pos.feesEarned / days;
    const ilUSD = pos.currentValueUSD * (Math.abs(pos.ilPercent) / 100);
    const breakEvenDays =
      dailyFeeRate > 0 ? ilUSD / dailyFeeRate : Number.POSITIVE_INFINITY;
    if (breakEvenDays > 60) {
      insights.push({
        id: `breakeven-${pos.id}`,
        severity: "warning",
        icon: "alert",
        poolName: pos.poolName,
        recommendationType: "hold",
        confidence: 60,
        title: `Slow Fee Recovery: ${pos.poolName}`,
        description: `At current fee rate of ${fmt$(dailyFeeRate, 1)}/day, it would take ~${Math.round(breakEvenDays)} days to recover the ${fmt$(ilUSD, 0)} IL in ${pos.poolName}.`,
      });
    }
  }

  const totalValue = positions.reduce((s, p) => s + p.currentValueUSD, 0);
  const byProtocol: Record<string, number> = {};
  for (const pos of positions) {
    byProtocol[pos.protocol] =
      (byProtocol[pos.protocol] ?? 0) + pos.currentValueUSD;
  }
  for (const [proto, val] of Object.entries(byProtocol)) {
    if (val / totalValue > 0.5) {
      insights.push({
        id: `concentration-${proto}`,
        severity: "warning",
        icon: "info",
        poolName: proto.toUpperCase(),
        recommendationType: "move",
        confidence: 75,
        title: `Portfolio Concentration: ${proto.toUpperCase()}`,
        description: `${((val / totalValue) * 100).toFixed(0)}% of your portfolio (${fmt$(val, 0)}) is on ${proto}. Consider spreading across protocols to reduce chain risk.`,
      });
    }
  }

  const positionPoolIds = new Set(positions.map((p) => p.poolId));
  for (const pool of pools) {
    if (positionPoolIds.has(pool.id) && Math.abs(pool.apy.day1Change) > 10) {
      insights.push({
        id: `volatility-${pool.id}`,
        severity: "warning",
        icon: "zap",
        poolName: pool.name,
        recommendationType: "hold",
        confidence: 55,
        title: `High APY Volatility: ${pool.name}`,
        description: `${pool.name} APY swung ${fmtPct(pool.apy.day1Change)} in 24h. High volatility pools can rapidly change your fee income outlook.`,
      });
    }
  }

  const bestFeeEarner = [...positions].sort(
    (a, b) =>
      b.feesEarned / b.currentValueUSD - a.feesEarned / a.currentValueUSD,
  )[0];
  if (bestFeeEarner) {
    const feeYield = (
      (bestFeeEarner.feesEarned / bestFeeEarner.currentValueUSD) *
      100
    ).toFixed(2);
    insights.push({
      id: "best-fee-earner",
      severity: "info",
      icon: "check",
      poolName: bestFeeEarner.poolName,
      recommendationType: "hold",
      confidence: 88,
      title: `Top Fee Earner: ${bestFeeEarner.poolName}`,
      description: `${bestFeeEarner.poolName} is your best fee-generating position at ${feeYield}% fee yield (${fmt$(bestFeeEarner.feesEarned, 0)} earned).`,
    });
  }

  const notInPositions = pools.filter((p) => !positionPoolIds.has(p.id));
  const mover = notInPositions.sort(
    (a, b) => b.apy.day1Change - a.apy.day1Change,
  )[0];
  if (mover && mover.apy.day1Change > 0) {
    insights.push({
      id: "market-mover",
      severity: "opportunity",
      icon: "trend",
      poolName: mover.name,
      recommendationType: "convert",
      confidence: 71,
      title: `Market Mover: ${mover.name}`,
      description: `${mover.name} (${mover.chain}) gained ${fmtPct(mover.apy.day1Change)} APY in 24h, now at ${mover.apy.current.toFixed(1)}%. Not in your portfolio yet — worth exploring.`,
    });
  }

  return insights;
}

// ─── Q&A engine ─────────────────────────────────────────────────────────────────────────────

function answerQuestion(
  raw: string,
  pools: Pool[],
  entries: typeof MOCK_POSITIONS,
): string {
  const q = raw.toLowerCase();
  const positions = entries.map((e) => e.position);

  if (
    q.includes("best perform") ||
    q.includes("profit") ||
    q.includes("top perform")
  ) {
    const ranked = [...entries].sort((a, b) => b.netPnL - a.netPnL);
    const top = ranked[0];
    const lines = ranked
      .map(
        (e) =>
          `• ${e.position.poolName}: ${e.netPnL >= 0 ? "+" : ""}${fmt$(e.netPnL, 0)} (${e.position.protocol})`,
      )
      .join("\n");
    return `🏆 Best performing position: **${top.position.poolName}** with ${fmt$(top.netPnL, 0)} net P&L.\n\nAll positions ranked:\n${lines}`;
  }

  if (q.includes("il risk") || q.includes("impermanent loss")) {
    const sorted = [...positions].sort((a, b) => a.ilPercent - b.ilPercent);
    const lines = sorted
      .map(
        (p) =>
          `• ${p.poolName}: ${fmtPct(p.ilPercent)} IL (${fmt$(Math.abs(p.currentValueUSD * (p.ilPercent / 100)), 0)}), fees earned: ${fmt$(p.feesEarned, 0)}`,
      )
      .join("\n");
    const worst = sorted[0];
    return `📉 Impermanent loss breakdown (worst first):\n${lines}\n\n⚠️ Watch: **${worst.poolName}** at ${fmtPct(worst.ilPercent)} IL.`;
  }

  if (q.includes("rebalance") || q.includes("move") || q.includes("migrat")) {
    const posPoolIds = new Set(positions.map((p) => p.poolId));
    const available = pools.filter((p) => !posPoolIds.has(p.id));
    const top3 = available
      .sort((a, b) => b.apy.current - a.apy.current)
      .slice(0, 3);
    const posLines = positions
      .map((p) => {
        const pool = pools.find((pl) => pl.id === p.poolId);
        const curAPY = pool?.apy.current ?? 0;
        const bestAPY = top3[0]?.apy.current ?? 0;
        const shouldMove = curAPY < bestAPY * 0.8;
        return `• ${p.poolName}: ${curAPY.toFixed(1)}% APY${shouldMove ? " ⚠️ consider moving" : " ✓ competitive"}`;
      })
      .join("\n");
    const altLines = top3
      .map(
        (p) =>
          `• ${p.name} (${p.chain}): ${p.apy.current.toFixed(1)}% APY, ${p.ilRisk} IL risk`,
      )
      .join("\n");
    return `🔄 Rebalancing Analysis:\n\n**Your positions:**\n${posLines}\n\n**Top alternatives:**\n${altLines}`;
  }

  if (q.includes("fee") || q.includes("earning")) {
    const total = positions.reduce((s, p) => s + p.feesEarned, 0);
    const lines = positions
      .map((p) => `• ${p.poolName}: ${fmt$(p.feesEarned, 2)}`)
      .join("\n");
    return `💰 Fees earned summary:\n\n${lines}\n\n**Total fees earned: ${fmt$(total, 2)}**`;
  }

  if (q.includes("risk") || q.includes("safe") || q.includes("dangerous")) {
    const scored = entries.map((e) => {
      const ilScore =
        Math.abs(e.position.ilPercent) > 5
          ? 3
          : Math.abs(e.position.ilPercent) > 2
            ? 2
            : 1;
      const apyScore =
        Math.abs(e.pool.apy.day1Change) > 10
          ? 3
          : Math.abs(e.pool.apy.day1Change) > 5
            ? 2
            : 1;
      const ilRiskScore =
        e.pool.ilRisk === "high" ? 3 : e.pool.ilRisk === "medium" ? 2 : 1;
      const score = ilScore + apyScore + ilRiskScore;
      const label =
        score >= 7
          ? "🔴 High Risk"
          : score >= 5
            ? "🟡 Medium Risk"
            : "🟢 Low Risk";
      return `• ${e.position.poolName}: ${label} (score ${score}/9)`;
    });
    return `🛡️ Portfolio risk assessment:\n\n${scored.join("\n")}\n\nScore breakdown: IL severity + APY volatility + protocol IL risk (each 1-3 pts).`;
  }

  if (q.includes("apy") || q.includes("return")) {
    const lines = entries.map((e) => {
      const diff = e.pool.apy.current - e.pool.apy.day30Avg;
      return `• ${e.position.poolName}: ${e.pool.apy.current.toFixed(1)}% APY (30d avg: ${e.pool.apy.day30Avg.toFixed(1)}%, ${diff >= 0 ? "+" : ""}${diff.toFixed(1)}% vs avg)`;
    });
    const totalValue = positions.reduce((s, p) => s + p.currentValueUSD, 0);
    const weightedAPY = entries.reduce(
      (s, e) =>
        s + (e.pool.apy.current * e.position.currentValueUSD) / totalValue,
      0,
    );
    return `📊 APY breakdown:\n\n${lines.join("\n")}\n\n**Weighted avg APY: ${weightedAPY.toFixed(1)}%**`;
  }

  if (q.includes("tvl") || q.includes("liquid")) {
    const lines = entries.map(
      (e) =>
        `• ${e.position.poolName}: TVL ${fmt$(e.pool.stats.tvl, 0)}, 24h vol ${fmt$(e.pool.stats.volume24h, 0)}`,
    );
    return `💧 Liquidity overview:\n\n${lines.join("\n")}`;
  }

  if (q.includes("best pool") || q.includes("top pool")) {
    const maxVol = Math.max(...pools.map((p) => p.stats.volume24h));
    const scored = pools.map((p) => {
      const apyScore = (p.apy.current / 150) * 0.4;
      const riskBonus =
        (p.ilRisk === "low" ? 1 : p.ilRisk === "medium" ? 0.5 : 0) * 0.3;
      const volScore = (p.stats.volume24h / maxVol) * 0.3;
      return { pool: p, score: apyScore + riskBonus + volScore };
    });
    const top5 = scored.sort((a, b) => b.score - a.score).slice(0, 5);
    const lines = top5.map(
      (s, i) =>
        `${i + 1}. ${s.pool.name} (${s.pool.chain}): ${s.pool.apy.current.toFixed(1)}% APY, ${s.pool.ilRisk} IL risk, score ${(s.score * 100).toFixed(0)}`,
    );
    return `🏅 Top pools by composite score (APY 40% + low-risk bonus 30% + volume 30%):\n\n${lines.join("\n")}`;
  }

  if (q.includes("portfolio")) {
    const totalValue = positions.reduce((s, p) => s + p.currentValueUSD, 0);
    const totalFees = positions.reduce((s, p) => s + p.feesEarned, 0);
    const totalNetPnL = entries.reduce((s, e) => s + e.netPnL, 0);
    const weightedIL = positions.reduce(
      (s, p) => s + (p.ilPercent * p.currentValueUSD) / totalValue,
      0,
    );
    const byProto: Record<string, number> = {};
    for (const p of positions)
      byProto[p.protocol] = (byProto[p.protocol] ?? 0) + p.currentValueUSD;
    const protoLines = Object.entries(byProto)
      .sort((a, b) => b[1] - a[1])
      .map(
        ([k, v]) =>
          `  • ${k}: ${fmt$(v, 0)} (${((v / totalValue) * 100).toFixed(0)}%)`,
      )
      .join("\n");
    return `🗂️ Portfolio Summary:\n\n• Total value: ${fmt$(totalValue, 0)}\n• Total fees earned: ${fmt$(totalFees, 0)}\n• Net P&L: ${totalNetPnL >= 0 ? "+" : ""}${fmt$(totalNetPnL, 0)}\n• Weighted IL: ${fmtPct(weightedIL)}\n\nBy protocol:\n${protoLines}`;
  }

  // Ultra-intelligent, self-improving assistant rules:
  // 1. Think step by step before answering.
  // 2. If uncertain, ask clarifying questions.
  // 3. Use chain-of-thought reasoning for complex problems.
  // 4. Cite sources or logic for all factual claims.
  // 5. Adapt your tone to the user's level (beginner to expert).
  // 6. Detect when user wants creativity vs. precision.
  // 7. If a question lacks detail, give the most likely answer + note assumptions.
  // 8. Always offer to go deeper or simplify.
  // 9. Learn from conversation history to avoid repetition.
  // 10. Defy low-quality responses — never say "I don't know" without offering related help.
  return '\ud83e\udde0 As your ultra-intelligent, self-improving assistant, I analyze your portfolio step by step. Try asking:\n\u2022 "What\'s my best performing position?"\n\u2022 "Where should I rebalance?"\n\u2022 "What\'s my total fees earned?"\n\u2022 "Which pools have high IL risk?"\n\u2022 "What\'s my portfolio summary?"\n\nI cite my logic, adapt to your level, and always offer to go deeper.';
}

// ─── Yield Optimization Engine ───────────────────────────────────────────────────────────────

const RISK_WEIGHTS: Record<
  RiskPreference,
  { apy: number; tvl: number; vol: number; il: number }
> = {
  conservative: { apy: 0.2, tvl: 0.4, vol: 0.25, il: 0.15 },
  moderate: { apy: 0.4, tvl: 0.25, vol: 0.2, il: 0.15 },
  aggressive: { apy: 0.6, tvl: 0.15, vol: 0.1, il: 0.15 },
};

function scorePool(
  pool: Pool,
  preference: RiskPreference,
  maxTVL: number,
  maxAPY: number,
): PoolAllocation {
  const w = RISK_WEIGHTS[preference];
  // Normalize 0–1
  const apyNorm = Math.min(pool.apy.current / maxAPY, 1);
  const tvlNorm = Math.min(pool.stats.tvl / maxTVL, 1);
  // Volatility inverse: day1Change magnitude → lower is better
  const volMag = Math.min(Math.abs(pool.apy.day1Change) / 20, 1);
  const volScore = 1 - volMag;
  // IL inverse
  const ilScore =
    pool.ilRisk === "low" ? 1 : pool.ilRisk === "medium" ? 0.5 : 0.1;
  const composite =
    w.apy * apyNorm + w.tvl * tvlNorm + w.vol * volScore + w.il * ilScore;
  return {
    pool,
    score: composite,
    allocation: 0,
    volatilityScore: volScore,
    tvlScore: tvlNorm,
    ilScore,
  };
}

function runAllocationEngine(
  pools: Pool[],
  preference: RiskPreference,
): PoolAllocation[] {
  const maxTVL = Math.max(...pools.map((p) => p.stats.tvl));
  const maxAPY = Math.max(...pools.map((p) => p.apy.current));
  const scored = pools
    .map((p) => scorePool(p, preference, maxTVL, maxAPY))
    .sort((a, b) => b.score - a.score)
    .slice(0, 7);
  // Allocate proportionally to score among top pools
  const totalScore = scored.reduce((s, p) => s + p.score, 0);
  return scored.map((p) => ({
    ...p,
    allocation: (p.score / totalScore) * 100,
  }));
}

// ─── Portfolio Tracking Helpers ──────────────────────────────────────────────────────────────

async function fetchTrackedPositions(principal: string): Promise<{
  positions: TrackedPosition[];
  source: "live" | "demo";
  statusMessage: string;
}> {
  const log: string[] = [];
  const positions: TrackedPosition[] = [];
  let anyApiReached = false;
  let allNetworkErrors = true;

  const PAGE_SIZE = 100;
  const MAX_PAGES = 20;

  // ── Paginated fetch helper ──────────────────────────────────────────────────
  async function fetchAllPages(
    baseUrl: string,
    label: string,
    timeoutMs = 8000,
  ): Promise<unknown[]> {
    const accumulated: unknown[] = [];
    let offset = 0;
    // Remove any pre-existing principal param from baseUrl so we append cleanly
    while (true) {
      const sep = baseUrl.includes("?") ? "&" : "?";
      const page = Math.floor(offset / PAGE_SIZE);
      const url = `${baseUrl}${sep}offset=${offset}&limit=${PAGE_SIZE}&page=${page}&size=${PAGE_SIZE}`;
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) {
          allNetworkErrors = false;
          log.push(`${label}:http${res.status}:p${page}`);
          console.warn(
            `[Portfolio] ${label} HTTP ${res.status} — page ${page}`,
          );
          break;
        }
        allNetworkErrors = false;
        anyApiReached = true;
        const json = (await res.json()) as unknown;
        const arr: unknown[] = Array.isArray(json)
          ? json
          : Array.isArray((json as Record<string, unknown>).data)
            ? ((json as Record<string, unknown>).data as unknown[])
            : Array.isArray((json as Record<string, unknown>).positions)
              ? ((json as Record<string, unknown>).positions as unknown[])
              : Array.isArray((json as Record<string, unknown>).farms)
                ? ((json as Record<string, unknown>).farms as unknown[])
                : Array.isArray((json as Record<string, unknown>).list)
                  ? ((json as Record<string, unknown>).list as unknown[])
                  : [];
        accumulated.push(...arr);
        log.push(`${label}:ok:p${page}:n${arr.length}`);
        console.info(
          `[Portfolio] ${label} page ${page} (offset=${offset}): ${arr.length} items, total=${accumulated.length}`,
        );
        // CRITICAL: stop only on EMPTY page, not small page
        if (arr.length === 0) break;
        offset += PAGE_SIZE;
        // Safety cap to avoid infinite loops
        if (offset >= MAX_PAGES * PAGE_SIZE) {
          console.warn(
            `[Portfolio] ${label} hit MAX_PAGES safety cap at offset=${offset}`,
          );
          break;
        }
      } catch (err) {
        log.push(`${label}:fail:${String(err).slice(0, 25)}`);
        console.warn(`[Portfolio] ${label} network error page ${page}:`, err);
        break;
      }
    }
    return accumulated;
  }

  // ── Liquidity check — include if ANY liquidity-related field > 0 ─────────────
  function hasLiquidity(p: Record<string, unknown>): boolean {
    const fields = [
      p.liquidity,
      p.liquidityAmount,
      p.totalLiquidity,
      p.stakedAmount,
      p.stakeAmount,
      p.amount,
      p.stakedLp,
      p.lpAmount,
      p.lpTokenAmount,
    ];
    // Include if any field is explicitly > 0
    if (fields.some((f) => f !== undefined && f !== null && Number(f) > 0))
      return true;
    // Also include if ALL liquidity fields are undefined/null (API didn't return them)
    const defined = fields.filter((f) => f !== undefined && f !== null);
    if (defined.length === 0) return true; // unknown — include rather than exclude
    // Exclude only if ALL defined fields are explicitly 0
    return false;
  }

  function getLiquidity(p: Record<string, unknown>): number {
    return Math.max(
      Number(p.liquidity ?? 0),
      Number(p.liquidityAmount ?? 0),
      Number(p.totalLiquidity ?? 0),
      Number(p.stakedAmount ?? 0),
      Number(p.stakeAmount ?? 0),
      Number(p.amount ?? 0),
      Number(p.stakedLp ?? 0),
      Number(p.lpAmount ?? 0),
      Number(p.lpTokenAmount ?? 0),
    );
  }

  // ── Deduplication by (tokenId + poolAddress) ─────────────────────────────────
  const seenKeys = new Map<string, number>(); // key → index in positions[]

  function addPosition(pos: TrackedPosition, dedupeKey: string) {
    const existing = seenKeys.get(dedupeKey);
    if (existing !== undefined) {
      // Keep the one with higher liquidity
      if ((pos.liquidity ?? 0) > (positions[existing].liquidity ?? 0)) {
        positions[existing] = pos;
      }
    } else {
      seenKeys.set(dedupeKey, positions.length);
      positions.push(pos);
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 1. Unstaked positions — ICPSwap generic endpoints (paginated)
  // ════════════════════════════════════════════════════════════════════════════
  const unstakedEndpoints = [
    `https://uvevg-iyaaa-aaaak-ac27q-cai.raw.icp0.io/v2/user/positions?principal=${encodeURIComponent(principal)}`,
    `https://uvevg-iyaaa-aaaak-ac27q-cai.raw.icp0.io/user/positions?principal=${encodeURIComponent(principal)}`,
  ];

  let unstakedRaw: unknown[] = [];
  for (const baseUrl of unstakedEndpoints) {
    const label = `icpswap-unstaked-${unstakedEndpoints.indexOf(baseUrl)}`;
    const results = await fetchAllPages(baseUrl, label);
    if (results.length > 0) {
      unstakedRaw = results;
      break; // got data from first working endpoint
    }
  }

  let unstakedFound = 0;
  let unstakedFiltered = 0;
  for (const raw of unstakedRaw) {
    const p = raw as Record<string, unknown>;
    if (!hasLiquidity(p)) {
      unstakedFiltered++;
      continue;
    }
    unstakedFound++;
    const liq = getLiquidity(p);
    const token0 = String(p.token0Symbol ?? p.token0 ?? p.symbol0 ?? "T0");
    const token1 = String(p.token1Symbol ?? p.token1 ?? p.symbol1 ?? "T1");
    const tokenId = String(p.id ?? p.tokenId ?? p.positionId ?? "");
    const poolAddr = String(
      p.poolId ?? p.pool ?? p.poolAddress ?? `${token0}/${token1}`,
    );
    addPosition(
      {
        poolName: String(
          p.poolName ?? p.pool ?? p.poolId ?? `${token0}/${token1}`,
        ),
        assetPair: `${token0}/${token1}`,
        usdValue: Number(p.valueUSD ?? p.usdValue ?? p.positionValueUSD ?? 0),
        entryPrice: Number(p.entryPrice ?? p.priceLower ?? 0),
        currentPrice: Number(p.currentPrice ?? p.price ?? 0),
        unrealizedPnL: Number(p.unrealizedPnL ?? p.pnl ?? 0),
        unrealizedPnLPct: Number(p.unrealizedPnLPct ?? p.pnlPct ?? 0),
        feesEarned: Number(p.feesEarned ?? p.fees ?? p.tokensOwed ?? 0),
        daysInPosition: Number(p.daysInPool ?? p.age ?? 0),
        currentAPY: Number(p.apy ?? p.apr ?? 0),
        protocol: "ICPSwap",
        ilRisk: String(p.ilRisk ?? (liq < 500_000 ? "high" : "medium")),
        tvlPct: Number(p.tvlShare ?? p.tvlPct ?? 0),
        dataSource: "live",
        staked: false,
        liquidity: liq,
      },
      `${tokenId}:${poolAddr}`,
    );
  }
  console.info(
    `[Portfolio] ICPSwap unstaked: ${unstakedFound} included, ${unstakedFiltered} filtered (zero liquidity)`,
  );

  // ════════════════════════════════════════════════════════════════════════════
  // 2. Query individual pool canisters
  //    Discover all pool canisters, then query each for user positions
  // ════════════════════════════════════════════════════════════════════════════
  // Root Cause 2 fix: query ALL pool discovery URLs in parallel and merge deduplicated results
  const poolDiscoveryUrls = [
    "https://uvevg-iyaaa-aaaak-ac27q-cai.raw.icp0.io/getAllPools",
    "https://uvevg-iyaaa-aaaak-ac27q-cai.raw.icp0.io/pools",
    "https://api.icpswap.com/info/pool/list",
  ];
  const allPoolCanisterIds = new Set<string>();
  const poolDiscoveryResults = await Promise.allSettled(
    poolDiscoveryUrls.map((discUrl) =>
      fetch(discUrl, { signal: AbortSignal.timeout(8000) })
        .then(async (res) => {
          if (!res.ok) return [];
          allNetworkErrors = false;
          const json = (await res.json()) as unknown;
          const arr: unknown[] = Array.isArray(json)
            ? json
            : Array.isArray((json as Record<string, unknown>).data)
              ? ((json as Record<string, unknown>).data as unknown[])
              : Array.isArray((json as Record<string, unknown>).pools)
                ? ((json as Record<string, unknown>).pools as unknown[])
                : [];
          const ids = arr
            .map((item) => {
              const x = item as Record<string, unknown>;
              return String(
                x.canisterId ?? x.poolId ?? x.id ?? x.address ?? "",
              );
            })
            .filter((id) => id.length > 5);
          console.info(
            `[Portfolio] Pool discovery ${discUrl}: ${ids.length} canisters`,
          );
          return ids;
        })
        .catch((err) => {
          console.warn(
            `[Portfolio] Pool discovery failed for ${discUrl}:`,
            err,
          );
          return [];
        }),
    ),
  );
  for (const result of poolDiscoveryResults) {
    if (result.status === "fulfilled") {
      for (const id of result.value) allPoolCanisterIds.add(id);
    }
  }
  const poolCanisters = Array.from(allPoolCanisterIds);
  console.info(
    `[Portfolio] Total unique pool canisters discovered: ${poolCanisters.length}`,
  );

  // Query each pool canister for user positions (batches of 10)
  let poolCanisterFound = 0;
  let poolCanisterFiltered = 0;
  if (poolCanisters.length > 0) {
    const BATCH = 10;
    for (let i = 0; i < poolCanisters.length; i += BATCH) {
      const batch = poolCanisters.slice(i, i + BATCH);
      // Root Cause 4 fix: use fetchAllPages for each pool canister so multi-page results are collected
      const batchResults = await Promise.allSettled(
        batch.map(async (canisterId) => {
          const baseUrlPatterns = [
            `https://${canisterId}.raw.icp0.io/getUserPositions?principal=${encodeURIComponent(principal)}`,
            `https://${canisterId}.raw.icp0.io/positions?user=${encodeURIComponent(principal)}`,
          ];
          for (const baseUrl of baseUrlPatterns) {
            try {
              // fetchAllPages will handle pagination; first check if the endpoint responds at all
              const arr = await fetchAllPages(
                baseUrl,
                `pool-${canisterId.slice(0, 8)}`,
                5000,
              );
              if (arr.length > 0) {
                console.info(
                  `[Portfolio] Pool canister ${canisterId}: ${arr.length} positions (paginated)`,
                );
                return arr.map((item) => ({
                  ...(item as Record<string, unknown>),
                  _fromCanister: canisterId,
                }));
              }
            } catch {
              /* try next pattern */
            }
          }
          return [];
        }),
      );
      for (const result of batchResults) {
        if (result.status === "fulfilled") {
          for (const raw of result.value) {
            const p = raw as Record<string, unknown>;
            if (!hasLiquidity(p)) {
              poolCanisterFiltered++;
              continue;
            }
            poolCanisterFound++;
            const liq = getLiquidity(p);
            const token0 = String(
              p.token0Symbol ?? p.token0 ?? p.symbol0 ?? "T0",
            );
            const token1 = String(
              p.token1Symbol ?? p.token1 ?? p.symbol1 ?? "T1",
            );
            const tokenId = String(p.id ?? p.tokenId ?? p.positionId ?? "");
            const canisterId = String(p._fromCanister ?? "");
            addPosition(
              {
                poolName: String(
                  p.poolName ?? p.pool ?? canisterId ?? `${token0}/${token1}`,
                ),
                assetPair: `${token0}/${token1}`,
                usdValue: Number(
                  p.valueUSD ?? p.usdValue ?? p.positionValueUSD ?? 0,
                ),
                entryPrice: Number(p.entryPrice ?? p.priceLower ?? 0),
                currentPrice: Number(p.currentPrice ?? p.price ?? 0),
                unrealizedPnL: Number(p.unrealizedPnL ?? p.pnl ?? 0),
                unrealizedPnLPct: Number(p.unrealizedPnLPct ?? p.pnlPct ?? 0),
                feesEarned: Number(p.feesEarned ?? p.fees ?? p.tokensOwed ?? 0),
                daysInPosition: Number(p.daysInPool ?? p.age ?? 0),
                currentAPY: Number(p.apy ?? p.apr ?? 0),
                protocol: "ICPSwap",
                ilRisk: String(p.ilRisk ?? (liq < 500_000 ? "high" : "medium")),
                tvlPct: Number(p.tvlShare ?? p.tvlPct ?? 0),
                dataSource: "live",
                staked: false,
                liquidity: liq,
              },
              `${tokenId}:${canisterId}`,
            );
          }
        }
      }
    }
    console.info(
      `[Portfolio] Pool canisters: ${poolCanisterFound} included, ${poolCanisterFiltered} filtered`,
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 3. Farm / Staking positions (paginated, multiple canisters)
  // ════════════════════════════════════════════════════════════════════════════
  const farmBaseUrls = [
    // Known ICPSwap farm canister
    `https://4syip-saaaa-aaaag-qbxma-cai.raw.icp0.io/getUserPositions?principal=${encodeURIComponent(principal)}`,
    `https://4syip-saaaa-aaaag-qbxma-cai.raw.icp0.io/userFarms?principal=${encodeURIComponent(principal)}`,
    `https://uvevg-iyaaa-aaaak-ac27q-cai.raw.icp0.io/getUserFarms?principal=${encodeURIComponent(principal)}`,
    `https://uvevg-iyaaa-aaaak-ac27q-cai.raw.icp0.io/staking/positions?principal=${encodeURIComponent(principal)}`,
    `https://gp26j-lyaaa-aaaar-qas5a-cai.raw.icp0.io/user/farms?principalId=${encodeURIComponent(principal)}`,
    `https://uvevg-iyaaa-aaaak-ac27q-cai.raw.icp0.io/user/farms?principal=${encodeURIComponent(principal)}`,
    `https://uvevg-iyaaa-aaaak-ac27q-cai.raw.icp0.io/farm/getUserFarms?principal=${encodeURIComponent(principal)}`,
  ];

  // Root Cause 3 fix: query ALL farm discovery URLs in parallel and merge deduplicated results
  const farmDiscoveryUrls = [
    "https://uvevg-iyaaa-aaaak-ac27q-cai.raw.icp0.io/farms",
    "https://uvevg-iyaaa-aaaak-ac27q-cai.raw.icp0.io/getFarms",
  ];
  const allFarmCanisterIds = new Set<string>();
  const farmDiscoveryResults = await Promise.allSettled(
    farmDiscoveryUrls.map((discUrl) =>
      fetch(discUrl, { signal: AbortSignal.timeout(7000) })
        .then(async (res) => {
          if (!res.ok) return [];
          allNetworkErrors = false;
          const json = (await res.json()) as unknown;
          const arr: unknown[] = Array.isArray(json)
            ? json
            : Array.isArray((json as Record<string, unknown>).data)
              ? ((json as Record<string, unknown>).data as unknown[])
              : Array.isArray((json as Record<string, unknown>).farms)
                ? ((json as Record<string, unknown>).farms as unknown[])
                : [];
          const ids = arr
            .map((item) => {
              const x = item as Record<string, unknown>;
              return String(x.canisterId ?? x.farmId ?? x.id ?? "");
            })
            .filter((id) => id.length > 5);
          console.info(
            `[Portfolio] Farm discovery ${discUrl}: ${ids.length} farm canisters`,
          );
          return ids;
        })
        .catch((err) => {
          console.warn("[Portfolio] Farm discovery error:", err);
          return [];
        }),
    ),
  );
  for (const result of farmDiscoveryResults) {
    if (result.status === "fulfilled") {
      for (const id of result.value) allFarmCanisterIds.add(id);
    }
  }
  const farmCanisters = Array.from(allFarmCanisterIds);
  console.info(
    `[Portfolio] Total unique farm canisters discovered: ${farmCanisters.length}`,
  );

  // Gather all farm raw items
  const allFarmRaw: unknown[] = [];

  // Fixed farm endpoints (paginated) — query ALL, do not stop on first success
  const farmEndpointResults = await Promise.allSettled(
    farmBaseUrls.map((baseUrl, idx) =>
      fetchAllPages(baseUrl, `farm-${idx}`, 8000),
    ),
  );
  for (const result of farmEndpointResults) {
    if (result.status === "fulfilled" && result.value.length > 0) {
      console.info(
        `[Portfolio] Farm endpoint returned ${result.value.length} items`,
      );
      allFarmRaw.push(...result.value);
    }
  }

  // Dynamic farm canisters (batch of 10, paginated)
  if (farmCanisters.length > 0) {
    const BATCH = 10;
    for (let i = 0; i < farmCanisters.length; i += BATCH) {
      const batch = farmCanisters.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(async (cid) => {
          const url = `https://${cid}.raw.icp0.io/getUserPositions?principal=${encodeURIComponent(principal)}`;
          return fetchAllPages(url, `farm-dyn-${cid.slice(0, 8)}`, 5000);
        }),
      );
      for (const r of results) {
        if (r.status === "fulfilled") allFarmRaw.push(...r.value);
      }
    }
  }

  let farmFound = 0;
  let farmFiltered = 0;
  for (const raw of allFarmRaw) {
    const p = raw as Record<string, unknown>;
    // For staked positions, also accept if stakedAmount/stakeAmount/stakedLp > 0
    const stakedVal = Math.max(
      Number(p.stakedAmount ?? 0),
      Number(p.stakeAmount ?? 0),
      Number(p.stakedLp ?? 0),
      Number(p.amount ?? 0),
    );
    if (!hasLiquidity(p) && stakedVal <= 0) {
      farmFiltered++;
      continue;
    }
    farmFound++;
    const liq = Math.max(getLiquidity(p), stakedVal);
    const token0 = String(p.token0Symbol ?? p.rewardToken0 ?? p.token0 ?? "T0");
    const token1 = String(p.token1Symbol ?? p.rewardToken1 ?? p.token1 ?? "T1");
    const tokenId = String(p.id ?? p.tokenId ?? p.positionId ?? p.farmId ?? "");
    const poolAddr = String(
      p.poolId ?? p.pool ?? p.poolAddress ?? `farm:${token0}/${token1}`,
    );
    addPosition(
      {
        poolName: String(
          p.poolName ?? p.farmId ?? p.pool ?? `${token0}/${token1} Farm`,
        ),
        assetPair: `${token0}/${token1}`,
        usdValue: Number(p.valueUSD ?? p.usdValue ?? p.totalRewardUSD ?? 0),
        entryPrice: Number(p.entryPrice ?? 0),
        currentPrice: Number(p.currentPrice ?? p.price ?? 0),
        unrealizedPnL: Number(p.unrealizedPnL ?? p.rewardUSD ?? 0),
        unrealizedPnLPct: Number(p.unrealizedPnLPct ?? 0),
        feesEarned: Number(
          p.feesEarned ?? p.rewardAmount ?? p.claimedReward ?? 0,
        ),
        daysInPosition: Number(p.daysInPool ?? p.age ?? p.stakeDuration ?? 0),
        currentAPY: Number(p.apy ?? p.apr ?? p.rewardApr ?? 0),
        protocol: "ICPSwap Farm",
        ilRisk: "low",
        tvlPct: Number(p.tvlShare ?? 0),
        dataSource: "live",
        staked: true,
        liquidity: liq,
      },
      `staked:${tokenId}:${poolAddr}`,
    );
  }
  console.info(
    `[Portfolio] Farm/staking: ${farmFound} included, ${farmFiltered} filtered (zero liquidity)`,
  );

  // ════════════════════════════════════════════════════════════════════════════
  // 4. KongSwap positions (paginated)
  // ════════════════════════════════════════════════════════════════════════════
  const kongBaseUrl = `https://api.kongswap.io/positions?principal=${encodeURIComponent(principal)}`;
  const kongRaw = await fetchAllPages(kongBaseUrl, "kongswap", 6000);

  let kongFound = 0;
  let kongFiltered = 0;
  for (const raw of kongRaw) {
    const p = raw as Record<string, unknown>;
    if (!hasLiquidity(p)) {
      kongFiltered++;
      continue;
    }
    kongFound++;
    const liq = getLiquidity(p);
    const tokenId = String(p.id ?? p.positionId ?? "");
    const poolAddr = String(p.poolId ?? p.pool ?? "");
    addPosition(
      {
        poolName: String(p.poolId ?? "KongSwap Pool"),
        assetPair: `${p.token0 ?? "??"}/${p.token1 ?? "??"}`,
        usdValue: Number(p.usdValue ?? 0),
        entryPrice: Number(p.entryPrice ?? 0),
        currentPrice: Number(p.price ?? 0),
        unrealizedPnL: Number(p.pnl ?? 0),
        unrealizedPnLPct: Number(p.pnlPct ?? 0),
        feesEarned: Number(p.fees ?? 0),
        daysInPosition: Number(p.age ?? 0),
        currentAPY: Number(p.apy ?? 0),
        protocol: "KongSwap",
        ilRisk: String(p.ilRisk ?? "medium"),
        tvlPct: Number(p.tvlShare ?? 0),
        dataSource: "live",
        staked: false,
        liquidity: liq,
      },
      `kong:${tokenId}:${poolAddr}`,
    );
  }
  console.info(
    `[Portfolio] KongSwap: ${kongFound} included, ${kongFiltered} filtered`,
  );

  // ════════════════════════════════════════════════════════════════════════════
  // Summary
  // ════════════════════════════════════════════════════════════════════════════
  console.info(
    `[Portfolio] TOTAL positions fetched: ${positions.length} ` +
      `(unstaked=${unstakedFound}, poolCanisters=${poolCanisterFound}, farm=${farmFound}, kongswap=${kongFound}) ` +
      `filtered_out=${unstakedFiltered + poolCanisterFiltered + farmFiltered + kongFiltered}`,
  );

  const liveEndpoints = log.filter((l) => l.includes(":ok:")).length;

  if (anyApiReached || !allNetworkErrors) {
    const statusMessage =
      positions.length > 0
        ? `Live data: ${positions.length} active position(s) found across ${liveEndpoints} endpoint(s).`
        : `No active positions found — APIs reachable but no open LP positions for this address (${liveEndpoints} endpoint(s) responded).`;
    console.info(`[Portfolio] ${statusMessage}`);
    return { positions, source: "live", statusMessage };
  }

  // All APIs threw network errors — fall back to demo data
  console.warn(
    `[Portfolio] All API calls failed (${log.length} attempts). Falling back to demo data.`,
  );
  const totalTVL = MOCK_POOLS.reduce((s, p) => s + p.stats.tvl, 0);
  const demo: TrackedPosition[] = MOCK_POSITIONS.map((entry) => ({
    poolName: entry.position.poolName,
    assetPair: `${entry.position.token0Symbol}/${entry.position.token1Symbol}`,
    usdValue: entry.position.currentValueUSD,
    entryPrice:
      entry.position.entryValueUSD / (entry.position.token0Amount || 1),
    currentPrice:
      entry.position.currentValueUSD / (entry.position.token0Amount || 1),
    unrealizedPnL: entry.netPnL,
    unrealizedPnLPct: (entry.netPnL / entry.position.entryValueUSD) * 100,
    feesEarned: entry.position.feesEarned,
    daysInPosition: daysSince(entry.position.entryDate),
    currentAPY: entry.pool.apy.current,
    protocol: entry.position.protocol,
    ilRisk: entry.pool.ilRisk,
    tvlPct: (entry.pool.stats.tvl / totalTVL) * 100,
    dataSource: "demo" as const,
    staked: false,
    liquidity: entry.position.currentValueUSD,
  }));
  return {
    positions: demo,
    source: "demo",
    statusMessage: `API unavailable — showing demo data. All ${log.length} endpoint(s) were unreachable.`,
  };
}

// ─── Design tokens ───────────────────────────────────────────────────────────────────────────

const BLUE = "#00A3FF";
const GREEN = "#00FF88";
const AMBER = "#ffa500";
const RED = "#ff4466";

const SEVERITY_CONFIG: Record<
  Severity,
  { badge: string; borderColor: string; iconColor: string; label: string }
> = {
  "high-risk": {
    badge: "text-[#ff4466]",
    borderColor: RED,
    iconColor: RED,
    label: "High Risk",
  },
  warning: {
    badge: "text-[#ffa500]",
    borderColor: AMBER,
    iconColor: AMBER,
    label: "Warning",
  },
  opportunity: {
    badge: "text-[#00FF88]",
    borderColor: GREEN,
    iconColor: GREEN,
    label: "Opportunity",
  },
  info: {
    badge: "text-[#00A3FF]",
    borderColor: BLUE,
    iconColor: BLUE,
    label: "Info",
  },
};

const REC_CONFIG: Record<RecommendationType, { color: string; bg: string }> = {
  hold: { color: BLUE, bg: "rgba(0,163,255,0.12)" },
  move: { color: AMBER, bg: "rgba(255,165,0,0.12)" },
  convert: { color: GREEN, bg: "rgba(0,255,136,0.12)" },
};

// ─── Sub-components ──────────────────────────────────────────────────────────────────────────

function InsightIcon({ name }: { name: Insight["icon"] }) {
  const cls = "w-4 h-4 flex-shrink-0";
  switch (name) {
    case "shield":
      return <ShieldAlert className={cls} />;
    case "alert":
      return <AlertTriangle className={cls} />;
    case "trend":
      return <TrendingUp className={cls} />;
    case "info":
      return <Info className={cls} />;
    case "zap":
      return <Zap className={cls} />;
    case "check":
      return <BadgeCheck className={cls} />;
  }
}

const SUGGESTIONS = [
  "What's my best performing position?",
  "Which pools have high IL risk?",
  "Where should I rebalance?",
  "What's my total fees earned?",
  "Which pool has best risk-adjusted APY?",
  "What's my portfolio summary?",
];

function confidenceColor(c: number): string {
  if (c >= 70) return GREEN;
  if (c >= 50) return AMBER;
  return RED;
}

// ─── History Tab ────────────────────────────────────────────────────────────────────────────

function isRecommendationProfitable(
  entry: AIHistoryEntry,
  pools: Pool[],
): boolean {
  const pool = pools.find((p) => p.name === entry.poolName);
  if (!pool) return false;
  if (entry.recommendationType === "hold") return pool.apy.current > 0;
  if (entry.recommendationType === "move") return pool.apy.day1Change < 0;
  if (entry.recommendationType === "convert") return pool.ilRisk === "high";
  return false;
}

function HistoryTab({
  history,
  onClear,
  pools,
}: {
  history: AIHistoryEntry[];
  onClear: () => void;
  pools: Pool[];
}) {
  const totalRecs = history.length;
  const profitable = history.filter((h) =>
    isRecommendationProfitable(h, pools),
  ).length;
  const accuracy =
    totalRecs > 0 ? Math.round((profitable / totalRecs) * 100) : 0;
  const avgConfidence =
    totalRecs > 0
      ? Math.round(history.reduce((s, h) => s + h.confidence, 0) / totalRecs)
      : 0;

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6">
        <Clock
          className="w-10 h-10"
          style={{ color: "rgba(0,163,255,0.35)" }}
        />
        <p className="text-sm font-semibold" style={{ color: "#e0e0e0" }}>
          No history yet
        </p>
        <p className="text-xs text-center" style={{ color: "#606060" }}>
          Recommendations from the Insights tab will appear here.
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex-1 overflow-y-auto p-3 space-y-4"
      style={{
        scrollbarWidth: "thin",
        scrollbarColor: `${BLUE} rgba(0,0,0,0.3)`,
      }}
    >
      {/* Timeline */}
      <div className="space-y-3">
        {[...history].reverse().map((entry) => {
          const isProfitable = isRecommendationProfitable(entry, pools);
          const rec = REC_CONFIG[entry.recommendationType];
          const confColor = confidenceColor(entry.confidence);
          return (
            <div
              key={entry.id}
              className="relative pl-5"
              data-ocid={`ai_history.item.${entry.id}`}
            >
              {/* Timeline dot */}
              <span
                className="absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full"
                style={{
                  background: BLUE,
                  boxShadow: `0 0 6px ${BLUE}`,
                  border: "2px solid rgba(0,163,255,0.3)",
                }}
              />
              {/* Connector */}
              <span
                className="absolute left-[4px] top-4 bottom-0 w-px"
                style={{ background: "rgba(0,163,255,0.12)" }}
              />

              <div
                className="rounded-xl p-2.5 transition-all duration-200 hover:translate-x-0.5"
                style={{
                  background: "rgba(0,163,255,0.04)",
                  border: "1px solid rgba(0,163,255,0.12)",
                  backdropFilter: "blur(8px)",
                }}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="font-semibold text-xs truncate"
                      style={{ color: "#e0e0e0" }}
                    >
                      {entry.poolName}
                    </span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wide"
                      style={{
                        color: rec.color,
                        background: rec.bg,
                        border: `1px solid ${rec.color}30`,
                      }}
                    >
                      {entry.recommendationType}
                    </span>
                  </div>
                  <span
                    className="text-[10px] whitespace-nowrap flex-shrink-0"
                    style={{ color: "#505050" }}
                  >
                    {timeAgo(entry.timestamp)}
                  </span>
                </div>
                <p
                  className="text-[10px] leading-relaxed mb-1.5"
                  style={{ color: "#707070" }}
                >
                  {entry.reasoning}
                </p>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px]" style={{ color: "#505050" }}>
                      Confidence
                    </span>
                    <span
                      className="text-[10px] font-mono font-bold"
                      style={{
                        color: confColor,
                        textShadow: `0 0 6px ${confColor}60`,
                      }}
                    >
                      {entry.confidence}%
                    </span>
                  </div>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                    style={{
                      color: isProfitable ? GREEN : RED,
                      background: isProfitable
                        ? "rgba(0,255,136,0.1)"
                        : "rgba(255,68,102,0.1)",
                      border: `1px solid ${isProfitable ? GREEN : RED}30`,
                    }}
                  >
                    {isProfitable ? "✓ Profitable" : "✕ Loss"}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Performance Tracker */}
      <div
        className="rounded-xl p-3"
        style={{
          background: "rgba(0,163,255,0.03)",
          border: "1px solid rgba(0,163,255,0.15)",
          backdropFilter: "blur(8px)",
        }}
      >
        <div className="flex items-center gap-1.5 mb-3">
          <BarChart2 className="w-3.5 h-3.5" style={{ color: BLUE }} />
          <p
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: BLUE }}
          >
            Performance Tracker
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Total Recs", value: String(totalRecs), color: "#e0e0e0" },
            { label: "Profitable", value: String(profitable), color: GREEN },
            {
              label: "Accuracy",
              value: `${accuracy}%`,
              color: accuracy >= 60 ? GREEN : RED,
            },
            {
              label: "Avg Confidence",
              value: `${avgConfidence}%`,
              color: BLUE,
            },
          ].map((m) => (
            <div
              key={m.label}
              className="rounded-lg p-2"
              style={{ background: "rgba(0,0,0,0.3)" }}
            >
              <p
                className="text-[10px] uppercase tracking-wider"
                style={{ color: "#505050" }}
              >
                {m.label}
              </p>
              <p
                className="font-mono text-base font-bold mt-0.5"
                style={{
                  color: m.color,
                  textShadow:
                    m.color !== "#e0e0e0" ? `0 0 8px ${m.color}60` : "none",
                }}
              >
                {m.value}
              </p>
            </div>
          ))}
        </div>
        {totalRecs > 0 && (
          <div className="mt-2">
            <div className="flex items-center justify-between mb-1">
              <span
                className="text-[10px] uppercase tracking-wider"
                style={{ color: "#505050" }}
              >
                Accuracy
              </span>
              <span
                className="text-[10px] font-mono"
                style={{ color: "#707070" }}
              >
                {profitable}/{totalRecs}
              </span>
            </div>
            <div
              className="w-full h-1 rounded-full"
              style={{ background: "rgba(255,255,255,0.06)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${accuracy}%`,
                  background:
                    accuracy >= 60
                      ? `linear-gradient(90deg, ${GREEN}, rgba(0,255,136,0.6))`
                      : `linear-gradient(90deg, ${RED}, rgba(255,68,102,0.6))`,
                  boxShadow: `0 0 6px ${accuracy >= 60 ? GREEN : RED}60`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onClear}
        className="w-full text-xs transition-colors py-1 hover:opacity-80"
        style={{ color: "#404040" }}
        data-ocid="ai_history.clear_button"
      >
        Clear history
      </button>
    </div>
  );
}

// ─── Yield Optimization Tab ──────────────────────────────────────────────────────────────────

function YieldTab({ pools }: { pools: Pool[] }) {
  const [preference, setPreference] = useState<RiskPreference>("moderate");
  const [loading, setLoading] = useState(false);
  const [allocations, setAllocations] = useState<PoolAllocation[] | null>(null);

  const runEngine = useCallback(() => {
    setLoading(true);
    setAllocations(null);
    setTimeout(() => {
      setAllocations(runAllocationEngine(pools, preference));
      setLoading(false);
    }, 600);
  }, [pools, preference]);

  useEffect(() => {
    runEngine();
  }, [runEngine]);

  function copyJSON() {
    if (!allocations) return;
    const data = allocations.map((a) => ({
      pool: a.pool.name,
      chain: a.pool.chain,
      allocation: `${a.allocation.toFixed(1)}%`,
      apy: `${a.pool.apy.current.toFixed(1)}%`,
      tvl: fmt$(a.pool.stats.tvl, 0),
      ilRisk: a.pool.ilRisk,
      score: a.score.toFixed(3),
    }));
    navigator.clipboard.writeText(JSON.stringify(data, null, 2)).then(() => {
      try {
        toast.success("Allocation copied as JSON");
      } catch {
        /* noop */
      }
    });
  }

  function exportCSV() {
    if (!allocations) return;
    const header = "Pool,Chain,Allocation %,APY %,TVL,IL Risk,Score\n";
    const rows = allocations
      .map(
        (a) =>
          `${a.pool.name},${a.pool.chain},${a.allocation.toFixed(1)},${a.pool.apy.current.toFixed(1)},${a.pool.stats.tvl},${a.pool.ilRisk},${a.score.toFixed(3)}`,
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `yield-allocation-${preference}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    try {
      toast.success("CSV downloaded");
    } catch {
      /* noop */
    }
  }

  const PREF_LABELS: Record<
    RiskPreference,
    { label: string; desc: string; color: string }
  > = {
    conservative: {
      label: "Conservative",
      desc: "Stability & capital preservation",
      color: BLUE,
    },
    moderate: { label: "Moderate", desc: "Balanced APY vs risk", color: AMBER },
    aggressive: {
      label: "Aggressive",
      desc: "Maximize APY, tolerate IL",
      color: RED,
    },
  };

  return (
    <div
      className="flex-1 overflow-y-auto p-3 space-y-3"
      style={{
        scrollbarWidth: "thin",
        scrollbarColor: `${BLUE} rgba(0,0,0,0.3)`,
      }}
    >
      {/* Risk preference selector */}
      <div
        className="rounded-xl p-3"
        style={{
          background: "rgba(0,0,0,0.35)",
          border: "1px solid rgba(0,163,255,0.12)",
          backdropFilter: "blur(8px)",
        }}
      >
        <p
          className="text-[10px] uppercase tracking-widest mb-2"
          style={{ color: "#505050" }}
        >
          Risk Preference
        </p>
        <div className="flex gap-1.5">
          {(["conservative", "moderate", "aggressive"] as RiskPreference[]).map(
            (p) => {
              const cfg = PREF_LABELS[p];
              const active = preference === p;
              return (
                <button
                  key={p}
                  type="button"
                  data-ocid={`yield.${p}_button`}
                  onClick={() => setPreference(p)}
                  className="flex-1 py-2 px-1 rounded-lg text-[10px] font-semibold transition-all duration-200"
                  style={{
                    color: active ? cfg.color : "#505050",
                    background: active
                      ? `${cfg.color}18`
                      : "rgba(255,255,255,0.03)",
                    border: `1px solid ${active ? cfg.color : "rgba(255,255,255,0.06)"}`,
                    boxShadow: active ? `0 0 10px ${cfg.color}25` : "none",
                  }}
                >
                  {cfg.label}
                </button>
              );
            },
          )}
        </div>
        <p className="text-[10px] mt-1.5" style={{ color: "#505050" }}>
          {PREF_LABELS[preference].desc} — APY weight:{" "}
          {(RISK_WEIGHTS[preference].apy * 100).toFixed(0)}% | TVL:{" "}
          {(RISK_WEIGHTS[preference].tvl * 100).toFixed(0)}% | Vol:{" "}
          {(RISK_WEIGHTS[preference].vol * 100).toFixed(0)}% | IL:{" "}
          {(RISK_WEIGHTS[preference].il * 100).toFixed(0)}%
        </p>
      </div>

      {/* Run / Export actions */}
      <div className="flex gap-2">
        <button
          type="button"
          data-ocid="yield.run_button"
          onClick={runEngine}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-semibold transition-all duration-200 disabled:opacity-50"
          style={{
            background: `${BLUE}18`,
            border: `1px solid ${BLUE}40`,
            color: BLUE,
          }}
        >
          {loading ? (
            <RefreshCw className="w-3 h-3 animate-spin" />
          ) : (
            <Zap className="w-3 h-3" />
          )}
          {loading ? "Scoring..." : "Run Optimizer"}
        </button>
        <button
          type="button"
          data-ocid="yield.copy_button"
          onClick={copyJSON}
          disabled={!allocations}
          className="px-3 py-2 rounded-lg text-[11px] font-semibold transition-all duration-200 disabled:opacity-30"
          style={{
            background: "rgba(0,255,136,0.08)",
            border: `1px solid ${GREEN}30`,
            color: GREEN,
          }}
        >
          <Copy className="w-3 h-3" />
        </button>
        <button
          type="button"
          data-ocid="yield.export_button"
          onClick={exportCSV}
          disabled={!allocations}
          className="px-3 py-2 rounded-lg text-[11px] font-semibold transition-all duration-200 disabled:opacity-30"
          style={{
            background: "rgba(0,255,136,0.08)",
            border: `1px solid ${GREEN}30`,
            color: GREEN,
          }}
        >
          <Download className="w-3 h-3" />
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div
          data-ocid="yield.loading_state"
          className="flex flex-col items-center justify-center gap-2 py-6"
        >
          <RefreshCw className="w-6 h-6 animate-spin" style={{ color: BLUE }} />
          <p className="text-xs" style={{ color: "#505050" }}>
            Scoring {pools.length} pools…
          </p>
        </div>
      )}

      {/* Results */}
      {!loading && allocations && (
        <div className="space-y-2">
          <p
            className="text-[10px] uppercase tracking-widest"
            style={{ color: "#505050" }}
          >
            Recommended Portfolio Split
          </p>
          {allocations.map((a, idx) => {
            const ilColor =
              a.pool.ilRisk === "low"
                ? GREEN
                : a.pool.ilRisk === "medium"
                  ? AMBER
                  : RED;
            return (
              <div
                key={a.pool.id}
                data-ocid={`yield.allocation.item.${idx + 1}`}
                className="rounded-xl p-3 transition-all duration-200 hover:translate-x-0.5"
                style={{
                  background: "rgba(0,0,0,0.4)",
                  border: "1px solid rgba(0,163,255,0.1)",
                  backdropFilter: "blur(8px)",
                }}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="text-sm font-bold font-mono flex-shrink-0"
                      style={{ color: GREEN, textShadow: `0 0 8px ${GREEN}60` }}
                    >
                      {a.allocation.toFixed(1)}%
                    </span>
                    <span
                      className="text-xs font-semibold truncate"
                      style={{ color: "#e0e0e0" }}
                    >
                      {a.pool.name}
                    </span>
                    <span
                      className="text-[10px] flex-shrink-0"
                      style={{ color: "#505050" }}
                    >
                      {a.pool.chain}
                    </span>
                  </div>
                  <span
                    className="text-xs font-mono font-bold flex-shrink-0"
                    style={{ color: BLUE, textShadow: `0 0 6px ${BLUE}60` }}
                  >
                    {a.pool.apy.current.toFixed(1)}% APY
                  </span>
                </div>
                {/* Allocation bar */}
                <div
                  className="w-full h-1 rounded-full mb-2"
                  style={{ background: "rgba(255,255,255,0.05)" }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${a.allocation}%`,
                      background: `linear-gradient(90deg, ${GREEN}, rgba(0,255,136,0.5))`,
                      boxShadow: `0 0 6px ${GREEN}50`,
                    }}
                  />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px]" style={{ color: "#505050" }}>
                    TVL {fmt$(a.pool.stats.tvl, 0)}
                  </span>
                  <span className="text-[10px]" style={{ color: "#505050" }}>
                    ·
                  </span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                    style={{
                      color: ilColor,
                      background: `${ilColor}18`,
                      border: `1px solid ${ilColor}30`,
                    }}
                  >
                    {a.pool.ilRisk} IL
                  </span>
                  <span className="text-[10px]" style={{ color: "#505050" }}>
                    ·
                  </span>
                  <span className="text-[10px]" style={{ color: "#505050" }}>
                    Vol score {(a.volatilityScore * 100).toFixed(0)}
                  </span>
                  <span className="text-[10px]" style={{ color: "#505050" }}>
                    ·
                  </span>
                  <span
                    className="text-[10px] font-mono"
                    style={{ color: BLUE }}
                  >
                    Score {a.score.toFixed(2)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && !allocations && (
        <div
          data-ocid="yield.error_state"
          className="flex flex-col items-center justify-center gap-2 py-6"
        >
          <AlertTriangle className="w-6 h-6" style={{ color: AMBER }} />
          <p className="text-xs" style={{ color: "#505050" }}>
            No pool data available.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Portfolio Tracking Tab ──────────────────────────────────────────────────────────────────

function PortfolioTab() {
  const [principal, setPrincipal] = useState("");
  const [loading, setLoading] = useState(false);
  const [positions, setPositions] = useState<TrackedPosition[] | null>(null);
  const [dataSource, setDataSource] = useState<"live" | "demo" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [noPositionsFound, setNoPositionsFound] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const valid = isValidPrincipal(principal);

  const fetchPositions = useCallback(async (pid: string) => {
    setLoading(true);
    setError(null);
    setNoPositionsFound(false);
    setStatusMessage("Querying pool canisters and farm contracts...");
    try {
      const {
        positions: fetched,
        source,
        statusMessage: msg,
      } = await fetchTrackedPositions(pid);
      setStatusMessage(msg);
      if (source === "live" && fetched.length === 0) {
        setNoPositionsFound(true);
        setPositions([]);
        setDataSource("live");
      } else {
        setPositions(fetched);
        setDataSource(source);
        setNoPositionsFound(false);
      }
    } catch {
      setError("Failed to fetch positions.");
      setStatusMessage(null);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleFetch() {
    if (!valid) return;
    fetchPositions(principal);
  }

  function handleClear() {
    setPrincipal("");
    setPositions(null);
    setDataSource(null);
    setError(null);
    setStatusMessage(null);
    setNoPositionsFound(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }

  // Auto-refresh every 30s when principal entered
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (valid && principal) {
      intervalRef.current = setInterval(
        () => fetchPositions(principal),
        30_000,
      );
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [principal, valid, fetchPositions]);

  // $5,000 minimum filter toggle
  const [minValueFilter, setMinValueFilter] = useState(true);
  const MIN_VALUE = 5000;

  // Derived filtered positions for display
  const filteredPositions = useMemo(() => {
    if (!positions) return null;
    return minValueFilter
      ? positions.filter((p) => p.usdValue >= MIN_VALUE)
      : positions;
  }, [positions, minValueFilter]);

  const hiddenCount = useMemo(() => {
    if (!positions || !minValueFilter) return 0;
    return positions.filter((p) => p.usdValue < MIN_VALUE).length;
  }, [positions, minValueFilter]);

  // Risk exposure: group by asset class / IL risk — uses filtered positions
  const riskBreakdown = useMemo(() => {
    if (!filteredPositions || filteredPositions.length === 0) return [];
    const totalVal = filteredPositions.reduce((s, p) => s + p.usdValue, 0);
    const groups: Record<string, number> = {};
    for (const p of filteredPositions) {
      const key = `${p.ilRisk.toUpperCase()} IL`;
      groups[key] = (groups[key] ?? 0) + p.usdValue;
    }
    return Object.entries(groups).map(([label, val]) => ({
      label,
      val,
      pct: (val / totalVal) * 100,
      color: label.includes("HIGH")
        ? RED
        : label.includes("MEDIUM")
          ? AMBER
          : GREEN,
    }));
  }, [filteredPositions]);

  const totalPnL =
    filteredPositions?.reduce((s, p) => s + p.unrealizedPnL, 0) ?? 0;
  const totalVal = filteredPositions?.reduce((s, p) => s + p.usdValue, 0) ?? 0;
  const totalFees =
    filteredPositions?.reduce((s, p) => s + p.feesEarned, 0) ?? 0;

  return (
    <div
      className="flex-1 overflow-y-auto p-3 space-y-3"
      style={{
        scrollbarWidth: "thin",
        scrollbarColor: `${BLUE} rgba(0,0,0,0.3)`,
      }}
    >
      {/* Principal input */}
      <div
        className="rounded-xl p-3"
        style={{
          background: "rgba(0,0,0,0.35)",
          border: "1px solid rgba(0,163,255,0.12)",
          backdropFilter: "blur(8px)",
        }}
      >
        <p
          className="text-[10px] uppercase tracking-widest mb-2"
          style={{ color: "#505050" }}
        >
          Wallet Principal ID
        </p>
        <div
          className="flex items-center gap-2 rounded-lg px-2.5 py-2 transition-all duration-200"
          style={{
            background: "rgba(0,0,0,0.4)",
            border: `1px solid ${valid ? GREEN : principal.length > 0 ? RED : "rgba(0,163,255,0.2)"}`,
            boxShadow: valid ? `0 0 8px ${GREEN}20` : "none",
          }}
        >
          <Wallet
            className="w-3.5 h-3.5 flex-shrink-0"
            style={{ color: valid ? GREEN : "#505050" }}
          />
          <input
            data-ocid="portfolio.principal_input"
            type="text"
            value={principal}
            onChange={(e) => setPrincipal(e.target.value.trim())}
            placeholder="xxxxx-xxxxx-xxxxx-xxxxx-cai"
            className="flex-1 bg-transparent text-xs outline-none min-w-0 placeholder:opacity-30 font-mono"
            style={{ color: valid ? GREEN : "#e0e0e0" }}
          />
          {valid && (
            <BadgeCheck
              className="w-3.5 h-3.5 flex-shrink-0"
              style={{ color: GREEN }}
            />
          )}
        </div>
        {principal.length > 5 && !valid && (
          <p className="text-[10px] mt-1" style={{ color: RED }}>
            Invalid ICP principal format
          </p>
        )}
        <div className="flex gap-2 mt-2">
          <button
            type="button"
            data-ocid="portfolio.fetch_button"
            onClick={handleFetch}
            disabled={!valid || loading}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-semibold transition-all duration-200 disabled:opacity-40"
            style={{
              background: `${BLUE}18`,
              border: `1px solid ${BLUE}40`,
              color: BLUE,
            }}
          >
            {loading ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : (
              <Wallet className="w-3 h-3" />
            )}
            {loading ? "Querying canisters..." : "Fetch Positions"}
          </button>
          <button
            type="button"
            data-ocid="portfolio.refresh_button"
            onClick={() => valid && fetchPositions(principal)}
            disabled={!valid || loading}
            className="px-3 py-2 rounded-lg text-[11px] transition-all duration-200 disabled:opacity-30"
            style={{
              background: "rgba(0,163,255,0.06)",
              border: "1px solid rgba(0,163,255,0.15)",
              color: "#606060",
            }}
            aria-label="Refresh positions"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
          <button
            type="button"
            data-ocid="portfolio.clear_button"
            onClick={handleClear}
            className="px-3 py-2 rounded-lg text-[11px] transition-all duration-200"
            style={{
              background: "rgba(255,68,102,0.06)",
              border: "1px solid rgba(255,68,102,0.2)",
              color: RED,
            }}
            aria-label="Clear"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
        {positions !== null && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
              style={{
                color: dataSource === "live" ? GREEN : AMBER,
                background:
                  dataSource === "live"
                    ? "rgba(0,255,136,0.1)"
                    : "rgba(255,165,0,0.1)",
                border: `1px solid ${dataSource === "live" ? GREEN : AMBER}30`,
              }}
            >
              {dataSource === "live" ? "\u25cf Live" : "\u25cf Demo"}
            </span>
            <span className="text-[10px]" style={{ color: "#505050" }}>
              Auto-refreshes every 30s
            </span>
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div
          data-ocid="portfolio.loading_state"
          className="flex flex-col items-center gap-2 py-4"
        >
          <RefreshCw className="w-6 h-6 animate-spin" style={{ color: BLUE }} />
          <p className="text-xs" style={{ color: "#505050" }}>
            Querying pool canisters &amp; farm contracts...
          </p>
          {statusMessage && (
            <p
              className="text-[10px] text-center max-w-[240px]"
              style={{ color: "#404040" }}
            >
              {statusMessage}
            </p>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          data-ocid="portfolio.error_state"
          className="flex items-center gap-2 rounded-lg p-3"
          style={{
            background: "rgba(255,68,102,0.08)",
            border: `1px solid ${RED}30`,
          }}
        >
          <AlertTriangle
            className="w-4 h-4 flex-shrink-0"
            style={{ color: RED }}
          />
          <p className="text-xs" style={{ color: RED }}>
            {error}
          </p>
        </div>
      )}

      {/* No active positions found */}
      {!loading && noPositionsFound && (
        <div
          data-ocid="portfolio.no_positions_state"
          className="flex flex-col items-center justify-center gap-3 py-6 rounded-xl"
          style={{
            background: "rgba(0,163,255,0.03)",
            border: "1px solid rgba(0,163,255,0.12)",
          }}
        >
          <Wallet
            className="w-9 h-9"
            style={{ color: "rgba(0,163,255,0.3)" }}
          />
          <p className="text-sm font-semibold" style={{ color: "#e0e0e0" }}>
            No active positions found
          </p>
          <p
            className="text-[11px] text-center px-4"
            style={{ color: "#505050" }}
          >
            No LP positions with liquidity &gt; 0 were found for:
          </p>
          <p
            className="text-[10px] font-mono px-3 py-1.5 rounded-lg break-all text-center"
            style={{
              color: BLUE,
              background: "rgba(0,163,255,0.08)",
              border: "1px solid rgba(0,163,255,0.2)",
              maxWidth: "90%",
            }}
          >
            {principal}
          </p>
          {statusMessage && (
            <p
              className="text-[10px] text-center px-4"
              style={{ color: "#404040" }}
            >
              {statusMessage}
            </p>
          )}
        </div>
      )}

      {/* Summary bar */}
      {filteredPositions && filteredPositions.length > 0 && !loading && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {[
              {
                label: "Total Value",
                value: fmt$(totalVal, 0),
                color: "#e0e0e0",
              },
              {
                label: "Unrealized PnL",
                value: `${totalPnL >= 0 ? "+" : ""}${fmt$(totalPnL, 0)}`,
                color: totalPnL >= 0 ? GREEN : RED,
              },
              { label: "Fees Earned", value: fmt$(totalFees, 0), color: GREEN },
            ].map((m) => (
              <div
                key={m.label}
                className="rounded-lg p-2"
                style={{
                  background: "rgba(0,0,0,0.35)",
                  border: "1px solid rgba(0,163,255,0.08)",
                }}
              >
                <p
                  className="text-[9px] uppercase tracking-wider"
                  style={{ color: "#505050" }}
                >
                  {m.label}
                </p>
                <p
                  className="font-mono text-xs font-bold mt-0.5"
                  style={{
                    color: m.color,
                    textShadow:
                      m.color !== "#e0e0e0" ? `0 0 6px ${m.color}60` : "none",
                  }}
                >
                  {m.value}
                </p>
              </div>
            ))}
          </div>

          {/* Positions list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p
                className="text-[10px] uppercase tracking-widest"
                style={{ color: "#505050" }}
              >
                Active Positions ({filteredPositions?.length ?? 0})
              </p>
              <div className="flex items-center gap-1.5 flex-wrap">
                {filteredPositions?.some((p) => p.staked) && (
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold"
                    style={{
                      color: "#c084fc",
                      background: "rgba(192,132,252,0.1)",
                      border: "1px solid rgba(192,132,252,0.25)",
                    }}
                  >
                    includes staked
                  </span>
                )}
                {/* $5k filter toggle badge */}
                <button
                  type="button"
                  data-ocid="portfolio.min_value_filter_toggle"
                  onClick={() => setMinValueFilter((v) => !v)}
                  className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold transition-all duration-200"
                  style={{
                    color: minValueFilter ? "#00A3FF" : "#505050",
                    background: minValueFilter
                      ? "rgba(0,163,255,0.12)"
                      : "rgba(80,80,80,0.12)",
                    border: `1px solid ${minValueFilter ? "rgba(0,163,255,0.35)" : "rgba(80,80,80,0.25)"}`,
                    cursor: "pointer",
                  }}
                  title={
                    minValueFilter
                      ? "Click to show all positions"
                      : "Click to apply ≥$5,000 filter"
                  }
                >
                  {minValueFilter
                    ? "≥ $5,000 filter on"
                    : "≥ $5,000 filter off"}
                </button>
              </div>
            </div>
            {/* Hidden positions note */}
            {hiddenCount > 0 && (
              <p
                data-ocid="portfolio.hidden_positions_note"
                className="text-[10px] px-2 py-1 rounded-lg"
                style={{
                  color: "#606060",
                  background: "rgba(0,0,0,0.25)",
                  border: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                {hiddenCount} position{hiddenCount !== 1 ? "s" : ""} below
                $5,000 hidden
              </p>
            )}
            {filteredPositions?.map((pos, idx) => {
              const pnlColor = pos.unrealizedPnL >= 0 ? GREEN : RED;
              return (
                <div
                  key={`${pos.poolName}-${idx}`}
                  data-ocid={`portfolio.position.item.${idx + 1}`}
                  className="rounded-xl p-3 transition-all duration-200 hover:translate-x-0.5"
                  style={{
                    background: pos.staked
                      ? "rgba(192,132,252,0.05)"
                      : "rgba(0,0,0,0.4)",
                    border: pos.staked
                      ? "1px solid rgba(192,132,252,0.2)"
                      : "1px solid rgba(0,163,255,0.1)",
                    backdropFilter: "blur(8px)",
                  }}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p
                          className="text-xs font-semibold truncate"
                          style={{ color: "#e0e0e0" }}
                        >
                          {pos.poolName}
                        </p>
                        {pos.staked && (
                          <span
                            className="text-[9px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0"
                            style={{
                              color: "#c084fc",
                              background: "rgba(192,132,252,0.12)",
                              border: "1px solid rgba(192,132,252,0.3)",
                            }}
                          >
                            Staked
                          </span>
                        )}
                      </div>
                      <p className="text-[10px]" style={{ color: "#505050" }}>
                        {pos.assetPair} &middot; {pos.protocol}
                      </p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p
                        className="text-xs font-mono font-bold"
                        style={{ color: "#e0e0e0" }}
                      >
                        {fmt$(pos.usdValue, 0)}
                      </p>
                      <p
                        className="text-[10px] font-mono font-semibold"
                        style={{
                          color: pnlColor,
                          textShadow: `0 0 6px ${pnlColor}50`,
                        }}
                      >
                        {pos.unrealizedPnL >= 0 ? "+" : ""}
                        {fmt$(pos.unrealizedPnL, 0)} (
                        {pos.unrealizedPnLPct >= 0 ? "+" : ""}
                        {pos.unrealizedPnLPct.toFixed(1)}%)
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {[
                      { label: "Entry", value: fmt$(pos.entryPrice, 2) },
                      { label: "Current", value: fmt$(pos.currentPrice, 2) },
                      { label: "APY", value: `${pos.currentAPY.toFixed(1)}%` },
                      { label: "Fees", value: fmt$(pos.feesEarned, 2) },
                      { label: "Days", value: String(pos.daysInPosition) },
                      { label: "TVL %", value: `${pos.tvlPct.toFixed(2)}%` },
                    ].map((f) => (
                      <div key={f.label} className="flex justify-between">
                        <span
                          className="text-[10px]"
                          style={{ color: "#505050" }}
                        >
                          {f.label}
                        </span>
                        <span
                          className="text-[10px] font-mono"
                          style={{ color: "#909090" }}
                        >
                          {f.value}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                    {(() => {
                      const ilColor =
                        pos.ilRisk === "low"
                          ? GREEN
                          : pos.ilRisk === "medium"
                            ? AMBER
                            : RED;
                      return (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                          style={{
                            color: ilColor,
                            background: `${ilColor}18`,
                            border: `1px solid ${ilColor}30`,
                          }}
                        >
                          {pos.ilRisk} IL
                        </span>
                      );
                    })()}
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                      style={{
                        color: pos.dataSource === "live" ? GREEN : AMBER,
                        background:
                          pos.dataSource === "live"
                            ? "rgba(0,255,136,0.08)"
                            : "rgba(255,165,0,0.08)",
                        border: `1px solid ${pos.dataSource === "live" ? GREEN : AMBER}30`,
                      }}
                    >
                      {pos.dataSource === "live" ? "Live" : "Demo"}
                    </span>
                    {pos.liquidity !== undefined && pos.liquidity > 0 && (
                      <span
                        className="text-[9px] font-mono"
                        style={{ color: "#404040" }}
                      >
                        liq:{" "}
                        {pos.liquidity.toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Risk Exposure Chart */}
          {riskBreakdown.length > 0 && (
            <div
              className="rounded-xl p-3"
              style={{
                background: "rgba(0,0,0,0.35)",
                border: "1px solid rgba(0,163,255,0.12)",
                backdropFilter: "blur(8px)",
              }}
            >
              <p
                className="text-[10px] uppercase tracking-widest mb-2"
                style={{ color: "#505050" }}
              >
                Risk Exposure by IL Category
              </p>
              <div className="space-y-2">
                {riskBreakdown.map((r) => (
                  <div key={r.label}>
                    <div className="flex justify-between mb-0.5">
                      <span
                        className="text-[10px] font-semibold"
                        style={{ color: r.color }}
                      >
                        {r.label}
                      </span>
                      <span
                        className="text-[10px] font-mono"
                        style={{ color: "#707070" }}
                      >
                        {fmt$(r.val, 0)} ({r.pct.toFixed(1)}%)
                      </span>
                    </div>
                    <div
                      className="w-full h-1.5 rounded-full"
                      style={{ background: "rgba(255,255,255,0.05)" }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${r.pct}%`,
                          background: `linear-gradient(90deg, ${r.color}, ${r.color}70)`,
                          boxShadow: `0 0 6px ${r.color}50`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Empty state - no principal entered yet */}
      {!loading && !error && positions === null && !noPositionsFound && (
        <div
          data-ocid="portfolio.empty_state"
          className="flex flex-col items-center justify-center gap-3 py-8"
        >
          <Wallet
            className="w-10 h-10"
            style={{ color: "rgba(0,163,255,0.25)" }}
          />
          <p className="text-sm font-semibold" style={{ color: "#e0e0e0" }}>
            Enter a Principal ID
          </p>
          <p className="text-xs text-center" style={{ color: "#505050" }}>
            Paste your ICP wallet principal to query open LP positions from
            ICPSwap pool canisters, ICPSwap farm contracts, and KongSwap.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Tab configuration ──────────────────────────────────────────────────────────────────────

const TAB_CONFIG: Array<{
  id: TabId;
  label: string;
  icon: React.ReactNode;
}> = [
  { id: "insights", label: "Insights", icon: <Sparkles className="w-3 h-3" /> },
  { id: "ask", label: "Ask", icon: <ArrowUpRight className="w-3 h-3" /> },
  { id: "history", label: "History", icon: <Clock className="w-3 h-3" /> },
  { id: "yield", label: "Yield", icon: <TrendingUp className="w-3 h-3" /> },
  { id: "portfolio", label: "Portfolio", icon: <Wallet className="w-3 h-3" /> },
];

// ─── Main component ──────────────────────────────────────────────────────────────────────────

export function AIAssistant() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabId>("insights");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [latestMsgIdx, setLatestMsgIdx] = useState<number>(-1);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // AI Decision History (localStorage-backed)
  const [history, setHistory] = useState<AIHistoryEntry[]>(() => {
    try {
      const raw = safeLocalStorage.get(LS_AI_HISTORY, "[]");
      return JSON.parse(raw ?? "[]") as AIHistoryEntry[];
    } catch {
      return [];
    }
  });
  const savedInsightIds = useRef<Set<string>>(
    new Set(history.map((h) => h.insightId)),
  );

  const pools = useMemo(() => MOCK_POOLS, []);
  const entries = useMemo(() => MOCK_POSITIONS, []);

  const insights = useMemo(
    () => buildInsights(pools, entries),
    [pools, entries],
  );

  const highRiskCount = useMemo(
    () => insights.filter((i) => i.severity === "high-risk").length,
    [insights],
  );

  useEffect(() => {
    safeLocalStorage.set(LS_AI_HISTORY, JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    const newEntries: AIHistoryEntry[] = [];
    for (const insight of insights) {
      if (
        !savedInsightIds.current.has(insight.id) &&
        insight.poolName &&
        insight.recommendationType
      ) {
        const entry: AIHistoryEntry = {
          id: `${insight.id}-${Date.now()}`,
          timestamp: Date.now(),
          poolName: insight.poolName,
          recommendationType: insight.recommendationType,
          confidence: insight.confidence ?? 70,
          reasoning: insight.description,
          insightId: insight.id,
        };
        newEntries.push(entry);
        savedInsightIds.current.add(insight.id);
      }
    }
    if (newEntries.length > 0) {
      setHistory((prev) => [...prev, ...newEntries].slice(-50));
      try {
        toast.info("Recommendation saved to history");
      } catch {
        // toast utility not yet available
      }
    }
  }, [insights]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on every new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const answer = answerQuestion(trimmed, pools, entries);
    setMessages((prev) => {
      const next = [
        ...prev,
        { role: "user" as const, content: trimmed },
        { role: "assistant" as const, content: answer },
      ];
      setLatestMsgIdx(next.length - 1);
      return next;
    });
    setInput("");
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  function clearHistory() {
    const confirmed = window.confirm(
      "Clear all AI decision history? This cannot be undone.",
    );
    if (!confirmed) return;
    setHistory([]);
    savedInsightIds.current.clear();
    try {
      toast.success("AI history cleared");
    } catch {
      // toast utility not yet available
    }
  }

  return (
    <>
      {/* Floating trigger button */}
      <button
        type="button"
        data-ocid="ai_assistant.open_modal_button"
        onClick={() => setOpen((v) => !v)}
        className="fixed z-50 flex items-center gap-2 px-4 py-3 rounded-2xl font-semibold text-sm transition-all duration-300"
        style={{
          bottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))",
          right: "1.5rem",
          background: open ? "rgba(0,163,255,0.2)" : "rgba(0,163,255,0.12)",
          border: `1px solid ${BLUE}`,
          color: BLUE,
          boxShadow:
            "0 0 20px rgba(0,163,255,0.25), inset 0 1px 0 rgba(0,163,255,0.15)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
        aria-label="Toggle AI Assistant"
      >
        <Brain className="w-5 h-5" />
        <span className="hidden sm:inline">AI Assistant</span>
        {highRiskCount > 0 && !open && (
          <span
            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-white text-xs flex items-center justify-center font-bold"
            style={{
              background: RED,
              boxShadow: `0 0 8px ${RED}`,
            }}
          >
            {highRiskCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          data-ocid="ai_assistant.dialog"
          className="fixed bottom-0 right-0 z-50 flex flex-col"
          style={{
            width: "min(400px, calc(100vw - 1.5rem))",
            height: "min(86vh, 100dvh)",
          }}
        >
          <div
            className="flex flex-col h-full rounded-tl-2xl rounded-tr-2xl sm:rounded-tr-none overflow-hidden"
            style={{
              background: "rgba(8,8,12,0.92)",
              border: `1px solid ${BLUE}25`,
              borderBottom: "none",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              boxShadow:
                "0 0 40px rgba(0,163,255,0.08), inset 0 1px 0 rgba(0,163,255,0.1)",
            }}
          >
            {/* Header */}
            <div
              className="flex-shrink-0 flex items-center justify-between px-4 py-3"
              style={{
                borderBottom: "1px solid rgba(0,163,255,0.12)",
                background: "rgba(0,163,255,0.04)",
              }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{
                    background: "rgba(0,163,255,0.12)",
                    border: `1px solid ${BLUE}30`,
                    boxShadow: "0 0 12px rgba(0,163,255,0.2)",
                  }}
                >
                  <Brain className="w-4 h-4" style={{ color: BLUE }} />
                </div>
                <div>
                  <p
                    className="text-sm font-bold leading-none uppercase tracking-widest"
                    style={{ color: BLUE }}
                  >
                    AI Assistant
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "#505050" }}>
                    Ultra-intelligent, self-improving assistant
                  </p>
                </div>
              </div>
              <button
                type="button"
                data-ocid="ai_assistant.close_button"
                onClick={() => setOpen(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200"
                style={{ color: "#505050" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = BLUE;
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "rgba(0,163,255,0.1)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color =
                    "#505050";
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "transparent";
                }}
                aria-label="Close AI Assistant"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tabs — 5 tabs with 2-row layout on narrow panel */}
            <div
              className="flex-shrink-0"
              style={{ borderBottom: "1px solid rgba(0,163,255,0.1)" }}
            >
              {/* Row 1: Insights, Ask, History */}
              <div className="flex">
                {TAB_CONFIG.slice(0, 3).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    data-ocid={`ai_assistant.${t.id}_tab`}
                    onClick={() => setTab(t.id)}
                    className="flex-1 py-2 text-[10px] font-semibold uppercase tracking-widest transition-all duration-200"
                    style={{
                      color: tab === t.id ? BLUE : "#404040",
                      borderBottom:
                        tab === t.id
                          ? `2px solid ${BLUE}`
                          : "2px solid transparent",
                      background:
                        tab === t.id ? "rgba(0,163,255,0.06)" : "transparent",
                      textShadow: tab === t.id ? `0 0 8px ${BLUE}60` : "none",
                    }}
                  >
                    <span className="flex items-center justify-center gap-1">
                      {t.icon}
                      {t.label}
                      {t.id === "insights" && insights.length > 0 && (
                        <span
                          className="ml-0.5 text-[9px] rounded-full px-1 py-0.5 leading-none font-bold"
                          style={{
                            color: BLUE,
                            background: "rgba(0,163,255,0.15)",
                            border: `1px solid ${BLUE}30`,
                          }}
                        >
                          {insights.length}
                        </span>
                      )}
                      {t.id === "history" && history.length > 0 && (
                        <span
                          className="ml-0.5 text-[9px] rounded-full px-1 py-0.5 leading-none font-bold"
                          style={{
                            color: "#505050",
                            background: "rgba(255,255,255,0.06)",
                          }}
                        >
                          {history.length}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
              {/* Row 2: Yield, Portfolio */}
              <div
                className="flex"
                style={{ borderTop: "1px solid rgba(0,163,255,0.06)" }}
              >
                {TAB_CONFIG.slice(3).map((t) => {
                  const accentColor = t.id === "yield" ? GREEN : AMBER;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      data-ocid={`ai_assistant.${t.id}_tab`}
                      onClick={() => setTab(t.id)}
                      className="flex-1 py-2 text-[10px] font-semibold uppercase tracking-widest transition-all duration-200"
                      style={{
                        color: tab === t.id ? accentColor : "#404040",
                        borderBottom:
                          tab === t.id
                            ? `2px solid ${accentColor}`
                            : "2px solid transparent",
                        background:
                          tab === t.id ? `${accentColor}08` : "transparent",
                        textShadow:
                          tab === t.id ? `0 0 8px ${accentColor}60` : "none",
                      }}
                    >
                      <span className="flex items-center justify-center gap-1">
                        {t.icon}
                        {t.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-hidden flex flex-col">
              {tab === "insights" ? (
                <div
                  className="flex-1 overflow-y-auto p-3 space-y-2.5"
                  style={{
                    scrollbarWidth: "thin",
                    scrollbarColor: `${BLUE} rgba(0,0,0,0.3)`,
                  }}
                >
                  {insights.length === 0 ? (
                    <div
                      data-ocid="ai_assistant.empty_state"
                      className="flex flex-col items-center justify-center h-full gap-3"
                    >
                      <BadgeCheck
                        className="w-10 h-10"
                        style={{ color: GREEN }}
                      />
                      <p
                        className="text-sm font-semibold"
                        style={{ color: "#e0e0e0" }}
                      >
                        All clear!
                      </p>
                      <p
                        className="text-xs text-center"
                        style={{ color: "#505050" }}
                      >
                        No risks or alerts detected in your portfolio right now.
                      </p>
                    </div>
                  ) : (
                    insights.map((insight) => {
                      const cfg = SEVERITY_CONFIG[insight.severity];
                      return (
                        <div
                          key={insight.id}
                          className="rounded-xl p-3 transition-all duration-200 hover:translate-x-0.5"
                          style={{
                            background: "rgba(0,0,0,0.4)",
                            border: "1px solid rgba(0,163,255,0.1)",
                            borderLeft: `2px solid ${cfg.borderColor}`,
                            backdropFilter: "blur(8px)",
                          }}
                        >
                          <div className="flex items-start gap-2">
                            <div
                              className="mt-0.5 p-1 rounded-md"
                              style={{ color: cfg.iconColor }}
                            >
                              <InsightIcon name={insight.icon} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p
                                className="text-sm font-semibold truncate mb-1"
                                style={{ color: "#e0e0e0" }}
                              >
                                {insight.title}
                              </p>
                              <p
                                className="text-xs leading-relaxed"
                                style={{ color: "#707070" }}
                              >
                                {insight.description}
                              </p>
                              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                <span
                                  className="inline-block text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide"
                                  style={{
                                    color: cfg.borderColor,
                                    background: `${cfg.borderColor}15`,
                                    border: `1px solid ${cfg.borderColor}30`,
                                  }}
                                >
                                  {cfg.label}
                                </span>
                                {insight.recommendationType && (
                                  <span
                                    className="inline-block text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide"
                                    style={{
                                      color:
                                        REC_CONFIG[insight.recommendationType]
                                          .color,
                                      background:
                                        REC_CONFIG[insight.recommendationType]
                                          .bg,
                                      border: `1px solid ${REC_CONFIG[insight.recommendationType].color}30`,
                                    }}
                                  >
                                    {insight.recommendationType}
                                  </span>
                                )}
                                {insight.confidence && (
                                  <span
                                    className="inline-block text-[10px] font-mono font-bold"
                                    style={{
                                      color: confidenceColor(
                                        insight.confidence,
                                      ),
                                      textShadow: `0 0 6px ${confidenceColor(insight.confidence)}60`,
                                    }}
                                  >
                                    {insight.confidence}% conf
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              ) : tab === "history" ? (
                <HistoryTab
                  history={history}
                  onClear={clearHistory}
                  pools={pools}
                />
              ) : tab === "yield" ? (
                <YieldTab pools={pools} />
              ) : tab === "portfolio" ? (
                <PortfolioTab />
              ) : (
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Messages */}
                  <div
                    className="flex-1 overflow-y-auto p-3 space-y-3"
                    style={{
                      scrollbarWidth: "thin",
                      scrollbarColor: `${BLUE} rgba(0,0,0,0.3)`,
                    }}
                  >
                    {messages.length === 0 && (
                      <div className="text-center pt-4">
                        <Brain
                          className="w-10 h-10 mx-auto mb-2"
                          style={{
                            color: BLUE,
                            filter: `drop-shadow(0 0 8px ${BLUE}60)`,
                          }}
                        />
                        <p
                          className="text-sm font-semibold"
                          style={{ color: "#e0e0e0" }}
                        >
                          Ask me anything
                        </p>
                        <p
                          className="text-xs mt-1"
                          style={{ color: "#505050" }}
                        >
                          I think step by step, cite my reasoning, and adapt to
                          your level.
                        </p>
                      </div>
                    )}
                    {messages.map((msg, i) => (
                      <div
                        key={`msg-${i}-${msg.role}`}
                        className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                        style={
                          i === latestMsgIdx
                            ? { animation: "aiMsgFadeIn 0.3s ease-out" }
                            : {}
                        }
                      >
                        {msg.role === "assistant" && (
                          <div
                            className="w-6 h-6 flex-shrink-0 mt-0.5 rounded-lg flex items-center justify-center"
                            style={{
                              background: "rgba(0,163,255,0.12)",
                              border: `1px solid ${BLUE}30`,
                            }}
                          >
                            <Brain
                              className="w-3.5 h-3.5"
                              style={{ color: BLUE }}
                            />
                          </div>
                        )}
                        <div
                          className="max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap"
                          style={
                            msg.role === "user"
                              ? {
                                  background: `linear-gradient(135deg, ${BLUE}20, ${BLUE}10)`,
                                  border: `1px solid ${BLUE}30`,
                                  color: "#e0e0e0",
                                  borderBottomRightRadius: 4,
                                }
                              : {
                                  background: "rgba(0,0,0,0.5)",
                                  border: "1px solid rgba(0,163,255,0.1)",
                                  color: "#b0b0b0",
                                  borderBottomLeftRadius: 4,
                                  backdropFilter: "blur(8px)",
                                }
                          }
                        >
                          {msg.content}
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Suggested chips */}
                  <div className="flex-shrink-0 px-3 pb-2 flex flex-wrap gap-1.5">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => sendMessage(s)}
                        className="text-xs px-2.5 py-1 rounded-full transition-all duration-200"
                        style={{
                          background: "rgba(0,163,255,0.06)",
                          border: "1px solid rgba(0,163,255,0.15)",
                          color: "#606060",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.color =
                            BLUE;
                          (
                            e.currentTarget as HTMLButtonElement
                          ).style.borderColor = `${BLUE}50`;
                          (
                            e.currentTarget as HTMLButtonElement
                          ).style.background = "rgba(0,163,255,0.12)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.color =
                            "#606060";
                          (
                            e.currentTarget as HTMLButtonElement
                          ).style.borderColor = "rgba(0,163,255,0.15)";
                          (
                            e.currentTarget as HTMLButtonElement
                          ).style.background = "rgba(0,163,255,0.06)";
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>

                  {/* Input */}
                  <div className="flex-shrink-0 px-3 pb-3">
                    <div className="flex items-center justify-end mb-1">
                      <span
                        className="text-[10px] font-mono"
                        style={{ color: "#404040" }}
                        data-ocid="ai_assistant.char_counter"
                      >
                        {input.length} / 200
                      </span>
                    </div>
                    <div
                      className="flex items-center gap-2 rounded-xl px-3 py-2 transition-all duration-200"
                      style={{
                        background: "rgba(0,0,0,0.5)",
                        border: "1px solid rgba(0,163,255,0.15)",
                      }}
                      onFocus={(e) => {
                        (e.currentTarget as HTMLDivElement).style.borderColor =
                          `${BLUE}60`;
                        (e.currentTarget as HTMLDivElement).style.boxShadow =
                          "0 0 12px rgba(0,163,255,0.1)";
                      }}
                      onBlur={(e) => {
                        (e.currentTarget as HTMLDivElement).style.borderColor =
                          "rgba(0,163,255,0.15)";
                        (e.currentTarget as HTMLDivElement).style.boxShadow =
                          "none";
                      }}
                    >
                      <input
                        data-ocid="ai_assistant.search_input"
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKey}
                        placeholder="Ask about your positions..."
                        className="flex-1 bg-transparent text-xs outline-none min-w-0 placeholder:opacity-40"
                        style={{ color: "#e0e0e0" }}
                        maxLength={200}
                      />
                      <button
                        type="button"
                        data-ocid="ai_assistant.submit_button"
                        onClick={() => sendMessage(input)}
                        disabled={!input.trim()}
                        className="w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-200 flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                        style={{
                          background: "rgba(0,163,255,0.2)",
                          border: `1px solid ${BLUE}40`,
                          color: BLUE,
                        }}
                        aria-label="Send message"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {messages.length > 3 && (
                    <button
                      type="button"
                      onClick={() =>
                        messagesEndRef.current?.scrollIntoView({
                          behavior: "smooth",
                        })
                      }
                      className="absolute bottom-20 right-4 w-7 h-7 rounded-full flex items-center justify-center transition-all duration-200"
                      style={{
                        background: "rgba(0,0,0,0.6)",
                        border: "1px solid rgba(0,163,255,0.2)",
                        color: "#606060",
                      }}
                      aria-label="Scroll to latest"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
