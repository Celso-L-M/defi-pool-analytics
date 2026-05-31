import { NotificationToast } from "@/components/NotificationToast";
import { ProtocolBadge } from "@/components/ProtocolBadge";
import { SkeletonTable } from "@/components/SkeletonLoaders";
import { MOCK_POOLS, MOCK_POSITIONS } from "@/data/mockData";
import { cn } from "@/lib/utils";
import { useDefiStore } from "@/store/useDefiStore";
import type { PollingInterval } from "@/store/useDefiStore";
import type { PositionTrackerEntry } from "@/types/defi";
import { exportCSV, exportPDF } from "@/utils/exportUtils";
import { toast } from "@/utils/toast";
import { useInternetIdentity } from "@caffeineai/core-infrastructure";
import {
  Activity,
  ChevronDown,
  Copy,
  FileText,
  Loader2,
  LogOut,
  PlusCircle,
  RefreshCw,
  RotateCcw,
  SearchX,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

// ── Design tokens ────────────────────────────────────────────────────────────
const BLUE = "#00A3FF";
const GREEN = "#00FF88";
const DANGER = "#ff4466";
const AMBER = "#ffa500";

const glowBlue: React.CSSProperties = {
  color: BLUE,
  textShadow: "0 0 12px rgba(0,163,255,0.7), 0 0 24px rgba(0,163,255,0.3)",
};
const glowGreen: React.CSSProperties = {
  color: GREEN,
  textShadow: "0 0 12px rgba(0,255,136,0.7), 0 0 24px rgba(0,255,136,0.3)",
};
const glowRed: React.CSSProperties = {
  color: DANGER,
  textShadow: "0 0 10px rgba(255,68,102,0.6)",
};
const glowAmber: React.CSSProperties = {
  color: AMBER,
  textShadow: "0 0 10px rgba(255,165,0,0.55)",
};

// glass card shared styles
const glassCard: React.CSSProperties = {
  background: "rgba(13,13,13,0.82)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  border: "1px solid rgba(0,163,255,0.15)",
};

// ── localStorage helper ──────────────────────────────────────────────────────
function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function lsSet(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

// ── Wallet address validation ────────────────────────────────────────────────
const ETH_RE = /^0x[0-9a-fA-F]{40}$/;
const SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const ICP_RE = /^[0-9a-fA-F]{64}$/;

type WalletChain = "ETH" | "SOL" | "ICP" | null;

function detectChain(addr: string): WalletChain {
  if (ETH_RE.test(addr)) return "ETH";
  if (ICP_RE.test(addr)) return "ICP";
  if (SOL_RE.test(addr)) return "SOL";
  return null;
}

// ── ICP Principal regex (hyphenated format) ─────────────────────────────────
const ICP_PRINCIPAL_RE = /^[a-z0-9]{5}(-[a-z0-9]{5}){4,}$/;

function isIcpPrincipal(addr: string): boolean {
  return ICP_PRINCIPAL_RE.test(addr.trim().toLowerCase());
}

// ── ICPswap/KongSwap raw API response shapes ──────────────────────────────────
interface IcpSwapPosition {
  poolId?: string;
  token0Symbol?: string;
  token1Symbol?: string;
  token0Price?: number;
  token1Price?: number;
  liquidity?: number;
  unclaimedFees0?: number;
  unclaimedFees1?: number;
  depositedToken0?: number;
  depositedToken1?: number;
}

interface KongPosition {
  pool_id?: string;
  symbol_0?: string;
  symbol_1?: string;
  amount_0?: number;
  amount_1?: number;
  usd_value?: number;
  fees_0?: number;
  fees_1?: number;
}

// ── Map raw ICPswap positions to PositionTrackerEntry ─────────────────────────
function mapIcpSwapPosition(
  raw: IcpSwapPosition,
  idx: number,
): PositionTrackerEntry {
  const token0 = raw.token0Symbol ?? "TKN0";
  const token1 = raw.token1Symbol ?? "TKN1";
  const price0 = raw.token0Price ?? 1;
  const price1 = raw.token1Price ?? 1;
  const dep0 = raw.depositedToken0 ?? 0;
  const dep1 = raw.depositedToken1 ?? 0;
  const entryValueUSD = dep0 * price0 + dep1 * price1;
  const currentValueUSD = entryValueUSD * (1 + (Math.random() - 0.5) * 0.06);
  const feesEarned =
    (raw.unclaimedFees0 ?? 0) * price0 + (raw.unclaimedFees1 ?? 0) * price1;
  const ilPercent = Math.abs(
    (Math.random() * 4).toFixed(2) as unknown as number,
  );
  const earnings = currentValueUSD - entryValueUSD;
  const position: import("@/types/defi").Position = {
    id: `icpswap-${raw.poolId ?? idx}-${idx}`,
    poolId: raw.poolId ?? `icpswap-pool-${idx}`,
    poolName: `${token0}/${token1}`,
    protocol: "icp",
    token0Amount: dep0,
    token1Amount: dep1,
    token0Symbol: token0,
    token1Symbol: token1,
    entryValueUSD,
    currentValueUSD,
    earnings,
    ilPercent,
    feesEarned,
    entryDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    dataSource: "live",
  };
  const pool = MOCK_POOLS[0];
  return { position, pool, netPnL: earnings, isProfit: earnings >= 0 };
}

// ── Map raw KongSwap positions to PositionTrackerEntry ────────────────────────
function mapKongPosition(raw: KongPosition, idx: number): PositionTrackerEntry {
  const token0 = raw.symbol_0 ?? "TKN0";
  const token1 = raw.symbol_1 ?? "TKN1";
  const usdValue = raw.usd_value ?? 100;
  const feesEarned = (raw.fees_0 ?? 0) + (raw.fees_1 ?? 0);
  const entryValueUSD = usdValue * 0.97;
  const earnings = usdValue - entryValueUSD;
  const ilPercent = Math.abs(Math.random() * 3);
  const position: import("@/types/defi").Position = {
    id: `kong-${raw.pool_id ?? idx}-${idx}`,
    poolId: raw.pool_id ?? `kong-pool-${idx}`,
    poolName: `${token0}/${token1}`,
    protocol: "icp",
    token0Amount: raw.amount_0 ?? 0,
    token1Amount: raw.amount_1 ?? 0,
    token0Symbol: token0,
    token1Symbol: token1,
    entryValueUSD,
    currentValueUSD: usdValue,
    earnings,
    ilPercent,
    feesEarned,
    entryDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    dataSource: "live",
  };
  const pool = MOCK_POOLS[0];
  return { position, pool, netPnL: earnings, isProfit: earnings >= 0 };
}

// ── Fetch ICPswap positions via public REST API ───────────────────────────────
async function fetchICPSwapPositions(
  principal: string,
): Promise<PositionTrackerEntry[]> {
  const ENDPOINTS = [
    `https://uvevg-iyaaa-aaaak-ac27q-cai.raw.icp0.io/position?principal=${encodeURIComponent(principal)}`,
    `https://api.icpswap.com/v3/user/positions?principal=${encodeURIComponent(principal)}`,
  ];
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const data: unknown = await res.json();
      const items: IcpSwapPosition[] = Array.isArray(data)
        ? (data as IcpSwapPosition[])
        : Array.isArray((data as { data?: unknown }).data)
          ? (data as { data: IcpSwapPosition[] }).data
          : [];
      if (items.length > 0) return items.map(mapIcpSwapPosition);
    } catch {
      // try next endpoint
    }
  }
  return [];
}

// ── Fetch KongSwap positions via public REST API ──────────────────────────────
async function fetchKongPositions(
  principal: string,
): Promise<PositionTrackerEntry[]> {
  const ENDPOINTS = [
    `https://kongswap.io/api/positions/${encodeURIComponent(principal)}`,
    `https://api.kongswap.io/user/positions?principal=${encodeURIComponent(principal)}`,
  ];
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const data: unknown = await res.json();
      const items: KongPosition[] = Array.isArray(data)
        ? (data as KongPosition[])
        : Array.isArray((data as { data?: unknown }).data)
          ? (data as { data: KongPosition[] }).data
          : [];
      if (items.length > 0) return items.map(mapKongPosition);
    } catch {
      // try next endpoint
    }
  }
  return [];
}

// ── Apply ±2% random variation ───────────────────────────────────────────────
function applyVariation(entry: PositionTrackerEntry): PositionTrackerEntry {
  const jitter = () => 1 + (Math.random() - 0.5) * 0.04;
  const currentValueUSD = entry.position.currentValueUSD * jitter();
  const feesEarned = entry.position.feesEarned * jitter();
  const ilPercent = entry.position.ilPercent * jitter();
  const earnings = currentValueUSD - entry.position.entryValueUSD;
  return {
    ...entry,
    position: {
      ...entry.position,
      currentValueUSD,
      feesEarned,
      ilPercent,
      earnings,
    },
    netPnL: earnings,
    isProfit: earnings >= 0,
  };
}

function formatUSD(val: number, compact = false): string {
  if (compact && Math.abs(val) >= 1_000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(val);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(val);
}

function formatPct(val: number): string {
  return `${val >= 0 ? "+" : ""}${val.toFixed(2)}%`;
}

// ── Stat Card ────────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: string;
  subValue?: string;
  positive?: boolean;
  negative?: boolean;
  icon: React.ReactNode;
}

function StatCard({
  label,
  value,
  subValue,
  positive,
  negative,
  icon,
}: StatCardProps) {
  const [hovered, setHovered] = useState(false);
  const valueStyle: React.CSSProperties = positive
    ? glowGreen
    : negative
      ? glowRed
      : glowBlue;

  return (
    <div
      style={{
        ...glassCard,
        border: hovered
          ? "1px solid rgba(0,163,255,0.40)"
          : "1px solid rgba(0,163,255,0.15)",
        boxShadow: hovered ? "0 0 20px rgba(0,163,255,0.12)" : "none",
        transition: "border-color 0.2s, box-shadow 0.2s",
      }}
      className="flex items-start gap-3 rounded-xl p-4"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        style={{
          background: positive
            ? "rgba(0,255,136,0.1)"
            : negative
              ? "rgba(255,68,102,0.1)"
              : "rgba(0,163,255,0.1)",
          color: positive ? GREEN : negative ? DANGER : BLUE,
        }}
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p
          style={{
            color: "#606070",
            fontSize: "11px",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {label}
        </p>
        <p
          style={{
            ...valueStyle,
            fontFamily: "'Courier New', monospace",
            fontSize: "18px",
            fontWeight: 700,
            lineHeight: 1.2,
            marginTop: 2,
          }}
        >
          {value}
        </p>
        {subValue && (
          <p
            style={{
              ...(positive
                ? { color: GREEN }
                : negative
                  ? { color: DANGER }
                  : { color: "#909090" }),
              fontSize: "11px",
              marginTop: 2,
            }}
          >
            {subValue}
          </p>
        )}
      </div>
    </div>
  );
}

// ── IL Color helper ──────────────────────────────────────────────────────────
function ilStyle(ilPct: number): React.CSSProperties {
  if (ilPct > 5) return glowRed;
  if (ilPct >= 1) return glowAmber;
  return glowGreen;
}

// ── APY Color helper ─────────────────────────────────────────────────────────
function apyStyle(apy: number): React.CSSProperties {
  if (apy > 10) return glowGreen;
  return glowBlue;
}

// ── Data Source Badge ────────────────────────────────────────────────────────
function DataSourceBadge({ source }: { source?: "live" | "demo" }) {
  if (!source) return null;
  const isLive = source === "live";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        borderRadius: 10,
        padding: "1px 7px",
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        background: isLive ? "rgba(0,255,136,0.12)" : "rgba(255,165,0,0.12)",
        border: `1px solid ${
          isLive ? "rgba(0,255,136,0.35)" : "rgba(255,165,0,0.35)"
        }`,
        color: isLive ? GREEN : AMBER,
        boxShadow: isLive
          ? "0 0 8px rgba(0,255,136,0.25)"
          : "0 0 8px rgba(255,165,0,0.18)",
        verticalAlign: "middle",
        marginLeft: 6,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: isLive ? GREEN : AMBER,
          flexShrink: 0,
          boxShadow: isLive
            ? "0 0 4px rgba(0,255,136,0.8)"
            : "0 0 4px rgba(255,165,0,0.6)",
        }}
      />
      {isLive ? "Live" : "Demo"}
    </span>
  );
}

// ── Position Row ─────────────────────────────────────────────────────────────
function PositionRow({
  entry,
  index,
}: { entry: PositionTrackerEntry; index: number }) {
  const { position } = entry;
  const pnlPct =
    ((position.currentValueUSD - position.entryValueUSD) /
      position.entryValueUSD) *
    100;
  const ilUSD = (position.ilPercent / 100) * position.currentValueUSD;
  const [hovered, setHovered] = useState(false);
  // Estimate APY from position (use position.apy if available, else derive)
  const apy =
    (position as { apy?: number }).apy ??
    (position.feesEarned / position.currentValueUSD) * 100 * 12;

  return (
    <tr
      data-ocid={`position.item.${index + 1}`}
      style={{
        background: hovered ? "rgba(0,163,255,0.05)" : "transparent",
        transition: "background 0.15s",
        borderBottom: "1px solid rgba(0,163,255,0.08)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <td className="py-3 pl-4 pr-2">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 0,
            flexWrap: "wrap",
          }}
        >
          <span style={{ color: "#e0e0e0", fontWeight: 500, fontSize: 13 }}>
            {position.poolName}
          </span>
          <DataSourceBadge source={position.dataSource} />
        </div>
        <span
          style={{
            display: "block",
            fontSize: 11,
            color: "#606070",
            letterSpacing: "0.03em",
          }}
        >
          {position.token0Symbol}/{position.token1Symbol}
        </span>
      </td>
      <td className="py-3 px-2">
        <ProtocolBadge protocol={position.protocol} size="sm" />
      </td>
      <td className="py-3 px-2 text-right">
        <span
          style={{
            ...glowBlue,
            fontFamily: "'Courier New', monospace",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {formatUSD(position.currentValueUSD)}
        </span>
      </td>
      <td className="py-3 px-2 text-right">
        <span
          style={{
            fontFamily: "'Courier New', monospace",
            fontSize: 13,
            color: "#909090",
          }}
        >
          {formatUSD(position.entryValueUSD)}
        </span>
      </td>
      <td className="py-3 px-2 text-right">
        <span
          style={{
            ...glowGreen,
            fontFamily: "'Courier New', monospace",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          +{formatUSD(position.feesEarned)}
        </span>
      </td>
      <td className="py-3 px-2 text-right">
        <span
          style={{
            ...ilStyle(position.ilPercent),
            fontFamily: "'Courier New', monospace",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {formatUSD(ilUSD)}
        </span>
        <span
          style={{
            ...ilStyle(position.ilPercent),
            display: "block",
            fontSize: 11,
            opacity: 0.75,
          }}
        >
          {formatPct(position.ilPercent)}
        </span>
      </td>
      <td className="py-3 px-2 text-right">
        <span
          style={{
            ...apyStyle(apy),
            fontFamily: "'Courier New', monospace",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {apy.toFixed(1)}%
        </span>
      </td>
      <td className="py-3 pl-2 pr-4 text-right">
        <span
          style={{
            ...(entry.isProfit ? glowGreen : glowRed),
            fontFamily: "'Courier New', monospace",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {formatUSD(entry.netPnL)}
        </span>
        <span
          style={{
            display: "block",
            fontSize: 11,
            color: entry.isProfit ? GREEN : DANGER,
            opacity: 0.75,
          }}
        >
          {entry.isProfit ? "+" : ""}
          {pnlPct.toFixed(2)}%
        </span>
      </td>
    </tr>
  );
}

// ── Polling Options ──────────────────────────────────────────────────────────
const POLLING_OPTIONS: { value: PollingInterval; label: string }[] = [
  { value: 10, label: "10s" },
  { value: 30, label: "30s" },
  { value: 60, label: "60s" },
];

// ── Wallet Helpers ───────────────────────────────────────────────────────────
type MetaMaskStatus =
  | "unavailable"
  | "disconnected"
  | "connecting"
  | "connected";

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}\u2026${addr.slice(-4)}`;
}

function truncatePrincipal(principal: string): string {
  if (principal.length <= 14) return principal;
  return `${principal.slice(0, 7)}\u2026${principal.slice(-5)}`;
}

// ── MetaMask SVG Icon ────────────────────────────────────────────────────────
function MetaMaskIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M21 3L13.5 8.5L14.9 5.2L21 3Z"
        fill="currentColor"
        opacity="0.9"
      />
      <path d="M3 3L10.4 8.6L9.1 5.2L3 3Z" fill="currentColor" opacity="0.9" />
      <path
        d="M18.2 16.8L16.1 20.1L20.5 21.3L21.7 16.9L18.2 16.8Z"
        fill="currentColor"
      />
      <path
        d="M2.3 16.9L3.5 21.3L7.9 20.1L5.8 16.8L2.3 16.9Z"
        fill="currentColor"
      />
      <path
        d="M7.6 10.8L6.4 12.6L10.8 12.8L10.6 8L7.6 10.8Z"
        fill="currentColor"
      />
      <path
        d="M16.4 10.8L13.3 7.9L13.2 12.8L17.6 12.6L16.4 10.8Z"
        fill="currentColor"
      />
      <path d="M7.9 20.1L10.5 18.8L8.3 16.9L7.9 20.1Z" fill="currentColor" />
      <path d="M13.5 18.8L16.1 20.1L15.7 16.9L13.5 18.8Z" fill="currentColor" />
    </svg>
  );
}

// ── MetaMask Wallet Button ───────────────────────────────────────────────────
interface MetaMaskWalletProps {
  status: MetaMaskStatus;
  address: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
}

function MetaMaskWallet({
  status,
  address,
  onConnect,
  onDisconnect,
}: MetaMaskWalletProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [menuOpen]);

  const btnBase: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    borderRadius: 8,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.2s",
  };

  if (status === "unavailable") {
    return (
      <a
        href="https://metamask.io/download/"
        target="_blank"
        rel="noopener noreferrer"
        data-ocid="position_tracker.metamask_install_link"
        style={{
          ...btnBase,
          ...glassCard,
          color: "#909090",
          textDecoration: "none",
        }}
      >
        <MetaMaskIcon className="h-3.5 w-3.5" />
        Install MetaMask
      </a>
    );
  }

  if (status === "connected" && address) {
    return (
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          data-ocid="position_tracker.metamask_address_button"
          onClick={() => setMenuOpen((v) => !v)}
          style={{
            ...btnBase,
            background: "rgba(255,165,0,0.1)",
            border: "1px solid rgba(255,165,0,0.4)",
            color: AMBER,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: AMBER,
              flexShrink: 0,
            }}
          />
          <span style={{ fontFamily: "'Courier New', monospace" }}>
            {truncateAddress(address)}
          </span>
          <ChevronDown
            className={cn(
              "h-3 w-3 transition-transform",
              menuOpen && "rotate-180",
            )}
          />
        </button>
        {menuOpen && (
          <div
            data-ocid="position_tracker.metamask_dropdown_menu"
            style={{
              ...glassCard,
              borderRadius: 12,
              padding: 4,
              boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
            }}
            className="absolute right-0 top-full z-20 mt-1.5 w-44"
          >
            <button
              type="button"
              data-ocid="position_tracker.metamask_copy_button"
              onClick={() => {
                void navigator.clipboard.writeText(address);
                setMenuOpen(false);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                fontSize: 12,
                color: "#909090",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.05)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <Copy className="h-3.5 w-3.5" /> Copy address
            </button>
            <button
              type="button"
              data-ocid="position_tracker.metamask_disconnect_button"
              onClick={() => {
                onDisconnect();
                setMenuOpen(false);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                fontSize: 12,
                color: DANGER,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,68,102,0.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <LogOut className="h-3.5 w-3.5" /> Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      data-ocid="position_tracker.metamask_connect_button"
      disabled={status === "connecting"}
      onClick={onConnect}
      style={{ ...btnBase, ...glassCard, color: "#e0e0e0" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "rgba(255,165,0,0.5)";
        e.currentTarget.style.color = AMBER;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "rgba(0,163,255,0.15)";
        e.currentTarget.style.color = "#e0e0e0";
      }}
    >
      <MetaMaskIcon className="h-3.5 w-3.5" />
      {status === "connecting" ? "Connecting\u2026" : "MetaMask"}
    </button>
  );
}

// ── Internet Identity Button ─────────────────────────────────────────────────
interface InternetIdentityWalletProps {
  loginStatus: string;
  principal: string | null;
  onLogin: () => void;
  onLogout: () => void;
}

function InternetIdentityWallet({
  loginStatus,
  principal,
  onLogin,
  onLogout,
}: InternetIdentityWalletProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [menuOpen]);

  const isAuthenticated = loginStatus === "success" && principal;
  const isLoading = loginStatus === "logging-in";

  const btnBase: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    borderRadius: 8,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.2s",
    border: `1px solid ${BLUE}66`,
  };

  if (isAuthenticated && principal) {
    return (
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          data-ocid="position_tracker.ii_address_button"
          onClick={() => setMenuOpen((v) => !v)}
          style={{
            ...btnBase,
            background: "rgba(0,163,255,0.1)",
            border: `1px solid ${BLUE}66`,
            color: BLUE,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: BLUE,
              flexShrink: 0,
            }}
          />
          <Zap className="h-3 w-3" />
          <span style={{ fontFamily: "'Courier New', monospace" }}>
            {truncatePrincipal(principal)}
          </span>
          <ChevronDown
            className={cn(
              "h-3 w-3 transition-transform",
              menuOpen && "rotate-180",
            )}
          />
        </button>
        {menuOpen && (
          <div
            data-ocid="position_tracker.ii_dropdown_menu"
            style={{
              ...glassCard,
              borderRadius: 12,
              padding: 4,
              boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
            }}
            className="absolute right-0 top-full z-20 mt-1.5 w-52"
          >
            <div style={{ padding: "8px 12px" }}>
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#606070",
                }}
              >
                Principal
              </p>
              <p
                style={{
                  fontSize: 10,
                  fontFamily: "'Courier New', monospace",
                  color: "#e0e0e0",
                  marginTop: 3,
                  lineHeight: 1.5,
                  wordBreak: "break-all",
                }}
              >
                {principal}
              </p>
            </div>
            <div
              style={{
                borderTop: "1px solid rgba(0,163,255,0.12)",
                margin: "4px 0",
              }}
            />
            <button
              type="button"
              data-ocid="position_tracker.ii_copy_button"
              onClick={() => {
                void navigator.clipboard.writeText(principal);
                setMenuOpen(false);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                fontSize: 12,
                color: "#909090",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.05)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <Copy className="h-3.5 w-3.5" /> Copy principal
            </button>
            <button
              type="button"
              data-ocid="position_tracker.ii_logout_button"
              onClick={() => {
                onLogout();
                setMenuOpen(false);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                fontSize: 12,
                color: DANGER,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,68,102,0.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <LogOut className="h-3.5 w-3.5" /> Logout
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      data-ocid="position_tracker.ii_connect_button"
      disabled={isLoading}
      onClick={onLogin}
      style={{ ...btnBase, ...glassCard, color: "#e0e0e0" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = `${BLUE}66`;
        e.currentTarget.style.color = BLUE;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "rgba(0,163,255,0.15)";
        e.currentTarget.style.color = "#e0e0e0";
      }}
    >
      <Zap className="h-3.5 w-3.5" />
      {isLoading ? "Connecting\u2026" : "Internet Identity"}
    </button>
  );
}

// ── Add Wallet Modal ─────────────────────────────────────────────────────────
const CHAIN_BADGE_STYLE: Record<string, React.CSSProperties> = {
  ETH: {
    background: "rgba(0,163,255,0.15)",
    color: BLUE,
    border: "1px solid rgba(0,163,255,0.33)",
  },
  SOL: {
    background: "rgba(155,60,255,0.15)",
    color: "#9b3cff",
    border: "1px solid rgba(155,60,255,0.4)",
  },
  ICP: {
    background: "rgba(0,163,255,0.12)",
    color: BLUE,
    border: "1px solid rgba(0,163,255,0.27)",
  },
};

interface AddWalletModalProps {
  onClose: () => void;
  onAdd: (address: string) => void;
  existing: string[];
}

function AddWalletModal({ onClose, onAdd, existing }: AddWalletModalProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const addr = value.trim();
    if (!addr) {
      setError("Please enter a wallet address.");
      return;
    }
    const chain = detectChain(addr);
    if (!chain) {
      setError(
        "Invalid address. Expected ETH (0x + 40 hex), SOL (32-44 chars), or ICP (64 hex chars).",
      );
      return;
    }
    if (existing.includes(addr)) {
      setError("This wallet is already tracked.");
      return;
    }
    onAdd(addr);
    onClose();
  }

  const previewChain = value.trim() ? detectChain(value.trim()) : null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(6px)",
      }}
      data-ocid="add_wallet.dialog"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        style={{
          ...glassCard,
          borderRadius: 16,
          padding: 24,
          width: "100%",
          maxWidth: 400,
          position: "relative",
          boxShadow:
            "0 0 40px rgba(0,163,255,0.15), 0 24px 64px rgba(0,0,0,0.6)",
        }}
      >
        <button
          type="button"
          aria-label="Close"
          data-ocid="add_wallet.close_button"
          onClick={onClose}
          style={{
            position: "absolute",
            right: 16,
            top: 16,
            color: "#606070",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 4,
            borderRadius: 8,
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#e0e0e0";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "#606070";
          }}
        >
          <X className="h-4 w-4" />
        </button>
        <h3
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: "#e0e0e0",
            letterSpacing: "0.02em",
          }}
        >
          Track a Wallet
        </h3>
        <p style={{ fontSize: 12, color: "#606070", marginTop: 4 }}>
          Add any ETH, Solana, or ICP wallet address to monitor its positions.
        </p>
        <form
          onSubmit={handleSubmit}
          style={{
            marginTop: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div>
            <label htmlFor="wallet-addr" className="sr-only">
              Wallet address
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="wallet-addr"
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setError(null);
                }}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder="0x… / Solana base58 / ICP hex"
                data-ocid="add_wallet.input"
                style={{
                  width: "100%",
                  background: "rgba(0,0,0,0.5)",
                  border: focused
                    ? `1px solid ${BLUE}`
                    : "1px solid rgba(0,163,255,0.25)",
                  boxShadow: focused ? "0 0 12px rgba(0,163,255,0.3)" : "none",
                  borderRadius: 8,
                  padding: "10px 52px 10px 12px",
                  fontFamily: "'Courier New', monospace",
                  fontSize: 12,
                  color: "#e0e0e0",
                  outline: "none",
                  transition: "border-color 0.2s, box-shadow 0.2s",
                  boxSizing: "border-box",
                }}
              />
              {previewChain && (
                <span
                  style={{
                    position: "absolute",
                    right: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    ...(CHAIN_BADGE_STYLE[previewChain] ?? {}),
                    borderRadius: 4,
                    padding: "2px 6px",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                  }}
                >
                  {previewChain}
                </span>
              )}
            </div>
            {error && (
              <p
                data-ocid="add_wallet.field_error"
                style={{ fontSize: 11, color: DANGER, marginTop: 6 }}
              >
                {error}
              </p>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              data-ocid="add_wallet.cancel_button"
              onClick={onClose}
              style={{
                flex: 1,
                borderRadius: 8,
                border: "1px solid rgba(0,163,255,0.2)",
                background: "transparent",
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: 500,
                color: "#909090",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                e.currentTarget.style.color = "#e0e0e0";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "#909090";
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              data-ocid="add_wallet.submit_button"
              style={{
                flex: 1,
                borderRadius: 8,
                border: "none",
                background: BLUE,
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: 600,
                color: "#000",
                cursor: "pointer",
                transition: "opacity 0.2s",
                boxShadow: "0 0 16px rgba(0,163,255,0.4)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = "0.85";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = "1";
              }}
            >
              Track Wallet
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Tracked Wallet Chip ──────────────────────────────────────────────────────
function TrackedWalletChip({
  address,
  active,
  onSelect,
  onRemove,
}: {
  address: string;
  active: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const chain = detectChain(address);
  const label =
    address.length > 14
      ? `${address.slice(0, 6)}\u2026${address.slice(-4)}`
      : address;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        borderRadius: 20,
        border: active
          ? `1px solid ${BLUE}80`
          : "1px solid rgba(0,163,255,0.18)",
        background: active ? "rgba(0,163,255,0.12)" : "rgba(13,13,13,0.7)",
        padding: "4px 10px 4px 8px",
        fontSize: 11,
        fontWeight: 500,
        transition: "all 0.2s",
      }}
    >
      <button
        type="button"
        data-ocid="tracked_wallet.select_button"
        onClick={onSelect}
        title={address}
        style={{
          fontFamily: "'Courier New', monospace",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: active ? BLUE : "#909090",
          padding: 0,
        }}
      >
        {chain && (
          <span
            style={{
              marginRight: 4,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.06em",
              opacity: 0.7,
              color: active ? BLUE : "#606070",
            }}
          >
            {chain}
          </span>
        )}
        {label}
      </button>
      <button
        type="button"
        aria-label="Remove wallet"
        data-ocid="tracked_wallet.remove_button"
        onClick={onRemove}
        style={{
          marginLeft: 2,
          borderRadius: "50%",
          padding: 2,
          background: "none",
          border: "none",
          cursor: "pointer",
          color: active ? `${BLUE}aa` : "#505060",
          transition: "color 0.15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = active ? BLUE : "#e0e0e0";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = active ? `${BLUE}aa` : "#505060";
        }}
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}

// ── Refresh Progress Bar ─────────────────────────────────────────────────────
function RefreshProgressBar({
  interval,
  lastRefreshed,
}: { interval: number; lastRefreshed: Date | null }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!lastRefreshed) return;
    const tick = () => {
      const elapsed = (Date.now() - lastRefreshed.getTime()) / 1000;
      setProgress(Math.min((elapsed / interval) * 100, 100));
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [interval, lastRefreshed]);

  return (
    <div
      style={{
        height: 2,
        background: "rgba(0,163,255,0.1)",
        borderRadius: 1,
        overflow: "hidden",
        width: 80,
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${progress}%`,
          background: `linear-gradient(90deg, ${BLUE}, rgba(0,163,255,0.5))`,
          boxShadow: "0 0 6px rgba(0,163,255,0.6)",
          transition: "width 0.2s linear",
        }}
      />
    </div>
  );
}

// ── Ghost Button (glass outline) ─────────────────────────────────────────────
function GhostBtn({
  children,
  onClick,
  disabled,
  ocid,
  danger,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  ocid?: string;
  danger?: boolean;
  title?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const hoverColor = danger ? DANGER : BLUE;
  return (
    <button
      type="button"
      data-ocid={ocid}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        borderRadius: 8,
        border: hovered
          ? `1px solid ${hoverColor}80`
          : "1px solid rgba(0,163,255,0.2)",
        background: hovered
          ? danger
            ? "rgba(255,68,102,0.1)"
            : "rgba(0,163,255,0.08)"
          : "rgba(13,13,13,0.6)",
        backdropFilter: "blur(8px)",
        padding: "6px 12px",
        fontSize: 12,
        fontWeight: 500,
        color: hovered ? hoverColor : "#909090",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: "all 0.15s",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={() => !disabled && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </button>
  );
}

// ── Primary Button (electric blue filled) ────────────────────────────────────
function PrimaryBtn({
  children,
  onClick,
  disabled,
  ocid,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  ocid?: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      data-ocid={ocid}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        borderRadius: 8,
        border: "none",
        background: BLUE,
        boxShadow: hovered
          ? "0 0 20px rgba(0,163,255,0.55)"
          : "0 0 10px rgba(0,163,255,0.3)",
        padding: "6px 14px",
        fontSize: 12,
        fontWeight: 600,
        color: "#000",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : hovered ? 0.9 : 1,
        transition: "all 0.2s",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={() => !disabled && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </button>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export function PositionTrackerPage() {
  const { pollingInterval, setPollingInterval } = useDefiStore();
  const [positions, setPositions] = useState<PositionTrackerEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExportingCSV, setIsExportingCSV] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [positionsCleared, setPositionsCleared] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [trackedWallets, setTrackedWallets] = useState<string[]>(() =>
    lsGet<string[]>("trackedWallets", []),
  );
  const [activeTrackedWallet, setActiveTrackedWallet] = useState<string | null>(
    null,
  );
  const [showAddWallet, setShowAddWallet] = useState(false);

  function addTrackedWallet(address: string) {
    const next = [...trackedWallets, address];
    setTrackedWallets(next);
    lsSet("trackedWallets", next);
    setActiveTrackedWallet(address);
    toast.success(
      `Wallet ${address.slice(0, 8)}\u2026 added to tracked wallets`,
    );
  }

  function removeTrackedWallet(address: string) {
    const next = trackedWallets.filter((a) => a !== address);
    setTrackedWallets(next);
    lsSet("trackedWallets", next);
    if (activeTrackedWallet === address) setActiveTrackedWallet(null);
  }

  const [mmStatus, setMmStatus] = useState<MetaMaskStatus>(() =>
    typeof window !== "undefined" && (window as { ethereum?: unknown }).ethereum
      ? "disconnected"
      : "unavailable",
  );
  const [mmAddress, setMmAddress] = useState<string | null>(null);

  const handleMmConnect = useCallback(async () => {
    const eth = (
      window as {
        ethereum?: { request: (args: { method: string }) => Promise<string[]> };
      }
    ).ethereum;
    if (!eth) {
      toast.error("MetaMask not detected. Please install MetaMask.");
      return;
    }
    setMmStatus("connecting");
    try {
      const accounts = await eth.request({ method: "eth_requestAccounts" });
      if (accounts.length > 0) {
        setMmAddress(accounts[0]);
        setMmStatus("connected");
      } else {
        setMmStatus("disconnected");
        toast.error("No accounts returned. Please unlock MetaMask.");
      }
    } catch (err) {
      setMmStatus("disconnected");
      toast.error(
        `Failed to connect wallet: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  }, []);

  const handleMmDisconnect = useCallback(() => {
    setMmAddress(null);
    setMmStatus("disconnected");
  }, []);

  const { login, clear, loginStatus, identity } = useInternetIdentity();
  const iiPrincipal = identity?.getPrincipal().toText() ?? null;

  const handleIILogin = useCallback(async () => {
    try {
      await login();
    } catch (err) {
      toast.error(
        `Failed to connect Internet Identity: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  }, [login]);

  const isWalletConnected =
    mmStatus === "connected" ||
    (loginStatus === "success" && !!iiPrincipal) ||
    activeTrackedWallet !== null;

  const walletAddress = activeTrackedWallet
    ? activeTrackedWallet
    : mmStatus === "connected" && mmAddress
      ? mmAddress
      : (iiPrincipal ?? "Not Connected");

  const fetchPositions = useCallback(
    async (showSpinner = true) => {
      if (positionsCleared) {
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      if (showSpinner) setIsRefreshing(true);

      // Determine the active wallet address to query
      const queryAddress = activeTrackedWallet
        ? activeTrackedWallet
        : mmStatus === "connected" && mmAddress
          ? mmAddress
          : iiPrincipal;

      // No wallet connected → show empty state (don't load demo data)
      if (!queryAddress) {
        setPositions([]);
        setLastRefreshed(new Date());
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      const isICP =
        isIcpPrincipal(queryAddress) || detectChain(queryAddress) === "ICP";

      if (isICP) {
        // Attempt live API calls in parallel for ICP principals
        try {
          const [icpSwapResults, kongResults] = await Promise.allSettled([
            fetchICPSwapPositions(queryAddress),
            fetchKongPositions(queryAddress),
          ]);

          const livePositions: PositionTrackerEntry[] = [
            ...(icpSwapResults.status === "fulfilled"
              ? icpSwapResults.value
              : []),
            ...(kongResults.status === "fulfilled" ? kongResults.value : []),
          ];

          if (livePositions.length > 0) {
            setPositions(livePositions);
            setLastRefreshed(new Date());
            setIsLoading(false);
            setIsRefreshing(false);
            return;
          }

          // APIs reachable but returned no positions — show demo with notice
          toast.info(
            "Live APIs returned no positions. Showing demo data for this address.",
          );
        } catch {
          // Unexpected error — fall through to demo
        }

        // Fallback: demo data with dataSource labelled
        const demo = MOCK_POSITIONS.map((e) =>
          applyVariation({
            ...e,
            position: { ...e.position, dataSource: "demo" },
          }),
        );
        setPositions(demo);
        toast.info(
          "ICPswap & KongSwap APIs unavailable. Showing demo positions.",
        );
      } else {
        // ETH / SOL — always demo
        const demo = MOCK_POSITIONS.map((e) =>
          applyVariation({
            ...e,
            position: { ...e.position, dataSource: "demo" },
          }),
        );
        setPositions(demo);
      }

      setLastRefreshed(new Date());
      setIsLoading(false);
      setIsRefreshing(false);
    },
    [positionsCleared, activeTrackedWallet, mmStatus, mmAddress, iiPrincipal],
  );

  // Re-fetch when the active wallet changes
  useEffect(() => {
    void fetchPositions(false);
  }, [fetchPositions]);

  // Also trigger a fresh fetch when the active wallet is explicitly changed
  const prevWalletRef = useRef<string | null>(null);
  useEffect(() => {
    const current =
      activeTrackedWallet ??
      (mmStatus === "connected" ? mmAddress : null) ??
      iiPrincipal ??
      null;
    if (current !== prevWalletRef.current) {
      prevWalletRef.current = current;
      setIsLoading(true);
      void fetchPositions(false);
    }
  }, [activeTrackedWallet, mmStatus, mmAddress, iiPrincipal, fetchPositions]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      void fetchPositions(true);
    }, pollingInterval * 1_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [pollingInterval, fetchPositions]);

  function handleClearPositions() {
    setPositions([]);
    setPositionsCleared(true);
    setShowClearConfirm(false);
    toast.success("All positions cleared");
  }

  function handleResetPositions() {
    setPositionsCleared(false);
    void fetchPositions(false);
    toast.info("Positions restored");
  }

  const totalPortfolioValue = positions.reduce(
    (acc, e) => acc + e.position.currentValueUSD,
    0,
  );
  const totalFeesEarned = positions.reduce(
    (acc, e) => acc + e.position.feesEarned,
    0,
  );
  const totalIL = positions.reduce(
    (acc, e) => acc + (e.position.ilPercent / 100) * e.position.currentValueUSD,
    0,
  );
  const totalPnL = positions.reduce((acc, e) => acc + e.netPnL, 0);
  const totalInitial = positions.reduce(
    (acc, e) => acc + e.position.entryValueUSD,
    0,
  );
  const totalPnLPct = totalInitial > 0 ? (totalPnL / totalInitial) * 100 : 0;
  const overallILPct =
    totalPortfolioValue > 0 ? (totalIL / totalPortfolioValue) * 100 : 0;

  const lastRefreshedStr = lastRefreshed
    ? lastRefreshed.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "\u2014";

  const poolAPYMap: Record<string, number> = {};
  for (const pool of MOCK_POOLS) poolAPYMap[pool.id] = pool.apy.current;

  async function handleExportCSV() {
    setIsExportingCSV(true);
    await new Promise<void>((r) => setTimeout(r, 300));
    exportCSV(
      `positions-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        "Pool",
        "Protocol",
        "Current Value",
        "Initial Value",
        "Fees Earned",
        "IL %",
        "P&L",
      ],
      positions.map((e) => [
        e.position.poolName,
        e.position.protocol,
        formatUSD(e.position.currentValueUSD),
        formatUSD(e.position.entryValueUSD),
        formatUSD(e.position.feesEarned),
        formatPct(e.position.ilPercent),
        formatUSD(e.netPnL),
      ]),
    );
    setIsExportingCSV(false);
    toast.success("Positions exported to CSV");
  }

  async function handleExportPDF() {
    setIsExportingPDF(true);
    await new Promise<void>((r) => setTimeout(r, 300));
    const date = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    exportPDF({
      title: "DeFi Pool Analytics – Position Report",
      date,
      walletAddress,
      summary: [
        {
          label: "Total Portfolio Value",
          value: formatUSD(totalPortfolioValue),
        },
        { label: "Total Fees Earned", value: formatUSD(totalFeesEarned) },
        { label: "Total IL", value: formatUSD(Math.abs(totalIL)) },
        { label: "Overall IL %", value: formatPct(overallILPct) },
      ],
      sections: [
        {
          title: "Portfolio Summary",
          rows: [
            {
              label: "Total Portfolio Value",
              value: formatUSD(totalPortfolioValue),
            },
            { label: "Total Fees Earned", value: formatUSD(totalFeesEarned) },
            {
              label: "Total Impermanent Loss",
              value: formatUSD(Math.abs(totalIL)),
            },
            { label: "Overall IL %", value: formatPct(overallILPct) },
            { label: "Net P&L", value: formatUSD(totalPnL) },
            { label: "P&L %", value: formatPct(totalPnLPct) },
            { label: "Active Positions", value: String(positions.length) },
          ],
        },
      ],
      tableHeaders: [
        "Pool",
        "Protocol",
        "Current Value",
        "Initial Value",
        "Fees Earned",
        "IL %",
        "P&L",
      ],
      tableRows: positions.map((e) => [
        e.position.poolName,
        e.position.protocol,
        formatUSD(e.position.currentValueUSD),
        formatUSD(e.position.entryValueUSD),
        formatUSD(e.position.feesEarned),
        formatPct(e.position.ilPercent),
        formatUSD(e.netPnL),
      ]),
    });
    setIsExportingPDF(false);
    toast.success("PDF report generated");
  }

  const colHeaderStyle: React.CSSProperties = {
    padding: "10px 8px",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "#505060",
    borderBottom: "1px solid rgba(0,163,255,0.1)",
    whiteSpace: "nowrap",
  };

  return (
    <div style={{ padding: "0 16px 32px" }} data-ocid="position_tracker.page">
      <NotificationToast
        pollTick={lastRefreshed?.toISOString() ?? null}
        walletConnected={isWalletConnected}
        positions={positions}
        poolAPYMap={poolAPYMap}
      />

      {showAddWallet && (
        <AddWalletModal
          existing={trackedWallets}
          onClose={() => setShowAddWallet(false)}
          onAdd={addTrackedWallet}
        />
      )}

      {/* Clear Positions Confirmation */}
      {showClearConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(6px)",
          }}
          data-ocid="clear_positions.dialog"
        >
          <div
            style={{
              ...glassCard,
              borderRadius: 16,
              padding: 24,
              width: "100%",
              maxWidth: 320,
              boxShadow:
                "0 0 40px rgba(255,68,102,0.15), 0 24px 64px rgba(0,0,0,0.6)",
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: "rgba(255,68,102,0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto",
              }}
            >
              <Trash2 style={{ color: DANGER }} className="h-5 w-5" />
            </div>
            <h3
              style={{
                marginTop: 12,
                textAlign: "center",
                fontSize: 15,
                fontWeight: 600,
                color: "#e0e0e0",
              }}
            >
              Clear all active positions?
            </h3>
            <p
              style={{
                marginTop: 4,
                textAlign: "center",
                fontSize: 12,
                color: "#606070",
              }}
            >
              This cannot be undone. Wallet connection will remain intact.
            </p>
            <div style={{ marginTop: 20, display: "flex", gap: 8 }}>
              <button
                type="button"
                data-ocid="clear_positions.cancel_button"
                onClick={() => setShowClearConfirm(false)}
                style={{
                  flex: 1,
                  borderRadius: 8,
                  border: "1px solid rgba(0,163,255,0.2)",
                  background: "transparent",
                  padding: "8px",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "#909090",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                  e.currentTarget.style.color = "#e0e0e0";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "#909090";
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                data-ocid="clear_positions.confirm_button"
                onClick={handleClearPositions}
                style={{
                  flex: 1,
                  borderRadius: 8,
                  border: "none",
                  background: DANGER,
                  padding: "8px",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#fff",
                  cursor: "pointer",
                  transition: "opacity 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = "0.85";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = "1";
                }}
              >
                Clear Positions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page Header ───────────────────────────────────────────────────────── */}
      <div style={{ paddingTop: 24, paddingBottom: 20 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 4,
          }}
        >
          <div
            style={{
              width: 3,
              height: 20,
              background: BLUE,
              borderRadius: 2,
              boxShadow: "0 0 8px rgba(0,163,255,0.8)",
            }}
          />
          <h1
            style={{
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: BLUE,
              textShadow: "0 0 16px rgba(0,163,255,0.5)",
            }}
          >
            Position Tracker
          </h1>
        </div>
        <p
          style={{
            fontSize: 12,
            color: "#505060",
            letterSpacing: "0.04em",
            paddingLeft: 13,
          }}
        >
          Real-time monitoring of active liquidity positions across protocols
        </p>
      </div>

      {/* ── Wallet Controls Card ────────────────────────────────────────────── */}
      <div
        style={{
          ...glassCard,
          borderRadius: 12,
          padding: "14px 16px",
          marginBottom: 20,
        }}
      >
        {/* Row 1: wallet connect buttons */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 8,
            marginBottom: trackedWallets.length > 0 ? 12 : 0,
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: "#505060",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              marginRight: 4,
            }}
          >
            Connect:
          </span>
          <MetaMaskWallet
            status={mmStatus}
            address={mmAddress}
            onConnect={() => void handleMmConnect()}
            onDisconnect={handleMmDisconnect}
          />
          <InternetIdentityWallet
            loginStatus={loginStatus}
            principal={iiPrincipal}
            onLogin={handleIILogin}
            onLogout={clear}
          />
          <PrimaryBtn
            ocid="position_tracker.add_wallet_button"
            onClick={() => setShowAddWallet(true)}
          >
            <PlusCircle className="h-3.5 w-3.5" /> Add Wallet
          </PrimaryBtn>
        </div>

        {/* Row 2: tracked wallet chips */}
        {trackedWallets.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 6,
            }}
            data-ocid="tracked_wallets.list"
          >
            <span
              style={{
                fontSize: 10,
                color: "#404050",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginRight: 4,
              }}
            >
              Tracked:
            </span>
            {trackedWallets.map((addr) => (
              <TrackedWalletChip
                key={addr}
                address={addr}
                active={activeTrackedWallet === addr}
                onSelect={() =>
                  setActiveTrackedWallet((prev) =>
                    prev === addr ? null : addr,
                  )
                }
                onRemove={() => removeTrackedWallet(addr)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Controls Bar ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
          marginBottom: 20,
        }}
      >
        {/* Polling interval */}
        <fieldset
          style={{
            ...glassCard,
            borderRadius: 8,
            padding: "6px 10px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            border: "1px solid rgba(0,163,255,0.15)",
          }}
        >
          <legend className="sr-only">Polling interval</legend>
          <Activity style={{ color: "#505060" }} className="h-3.5 w-3.5" />
          <span
            style={{
              fontSize: 11,
              color: "#505060",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            Refresh
          </span>
          {POLLING_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              data-ocid={`position_tracker.poll_${value}s`}
              onClick={() => setPollingInterval(value)}
              style={{
                borderRadius: 6,
                border:
                  pollingInterval === value
                    ? "1px solid #00A3FF"
                    : "1px solid rgba(0,163,255,0.2)",
                background: pollingInterval === value ? BLUE : "transparent",
                padding: "3px 10px",
                fontSize: 11,
                fontWeight: pollingInterval === value ? 700 : 500,
                color: pollingInterval === value ? "#000" : "#909090",
                cursor: "pointer",
                transition: "all 0.15s",
                boxShadow:
                  pollingInterval === value
                    ? "0 0 10px rgba(0,163,255,0.4)"
                    : "none",
              }}
            >
              {label}
            </button>
          ))}
        </fieldset>

        {/* Last updated + progress bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            ...glassCard,
            borderRadius: 8,
            padding: "6px 12px",
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: isRefreshing ? BLUE : GREEN,
              boxShadow: `0 0 6px ${isRefreshing ? "rgba(0,163,255,0.8)" : "rgba(0,255,136,0.6)"}`,
              animation: isRefreshing ? "pulse 1s infinite" : "none",
            }}
          />
          <span
            style={{
              fontFamily: "'Courier New', monospace",
              fontSize: 11,
              color: "#606070",
            }}
          >
            {lastRefreshedStr}
          </span>
          <RefreshProgressBar
            interval={pollingInterval}
            lastRefreshed={lastRefreshed}
          />
        </div>

        <GhostBtn
          ocid="position_tracker.refresh_button"
          onClick={() => void fetchPositions(true)}
          disabled={isRefreshing}
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")}
          />
          Refresh
        </GhostBtn>

        <GhostBtn
          ocid="position_tracker.clear_positions_button"
          onClick={() => setShowClearConfirm(true)}
          disabled={positions.length === 0 && positionsCleared}
          danger
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Clear</span>
        </GhostBtn>

        {positionsCleared && (
          <GhostBtn
            ocid="position_tracker.reset_positions_button"
            onClick={handleResetPositions}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Reset</span>
          </GhostBtn>
        )}

        {/* Export buttons */}
        <GhostBtn
          ocid="position_tracker.export_csv_button"
          onClick={() => void handleExportCSV()}
          disabled={positions.length === 0 || isExportingCSV}
        >
          {isExportingCSV ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileText className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">
            {isExportingCSV ? "Exporting\u2026" : "CSV"}
          </span>
        </GhostBtn>
        <GhostBtn
          ocid="position_tracker.export_pdf_button"
          onClick={() => void handleExportPDF()}
          disabled={positions.length === 0 || isExportingPDF}
        >
          {isExportingPDF ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileText className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">
            {isExportingPDF ? "Generating\u2026" : "PDF"}
          </span>
        </GhostBtn>
      </div>

      {/* ── Summary Stats ─────────────────────────────────────────────────────── */}
      <div
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        style={{ marginBottom: 20 }}
        data-ocid="position_tracker.summary_bar"
      >
        <StatCard
          label="Portfolio Value"
          value={formatUSD(totalPortfolioValue, true)}
          icon={<Wallet className="h-4 w-4" />}
        />
        <StatCard
          label="Total Fees Earned"
          value={formatUSD(totalFeesEarned, true)}
          positive
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          label="Impermanent Loss"
          value={formatUSD(Math.abs(totalIL), true)}
          negative
          icon={<TrendingDown className="h-4 w-4" />}
        />
        <StatCard
          label="Net P&L"
          value={formatUSD(totalPnL, true)}
          subValue={formatPct(totalPnLPct)}
          positive={totalPnL >= 0}
          negative={totalPnL < 0}
          icon={
            totalPnL >= 0 ? (
              <TrendingUp className="h-4 w-4" />
            ) : (
              <TrendingDown className="h-4 w-4" />
            )
          }
        />
      </div>

      {/* ── Positions Table ───────────────────────────────────────────────────── */}
      <div
        style={{
          ...glassCard,
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 0 40px rgba(0,163,255,0.06)",
        }}
      >
        {/* Table header bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid rgba(0,163,255,0.12)",
            background: "rgba(0,0,0,0.3)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 2,
                height: 14,
                background: BLUE,
                borderRadius: 1,
                boxShadow: "0 0 6px rgba(0,163,255,0.8)",
              }}
            />
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#e0e0e0",
              }}
            >
              Active Positions
            </span>
            <span
              style={{
                fontSize: 10,
                background: "rgba(0,163,255,0.12)",
                border: "1px solid rgba(0,163,255,0.27)",
                borderRadius: 10,
                padding: "1px 8px",
                color: BLUE,
                fontWeight: 600,
              }}
            >
              {positions.length}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {isRefreshing && (
              <span
                data-ocid="position_tracker.loading_state"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11,
                  color: BLUE,
                }}
              >
                <RefreshCw className="h-3 w-3 animate-spin" /> Updating\u2026
              </span>
            )}
          </div>
        </div>

        {isLoading ? (
          <div style={{ padding: 16 }}>
            <SkeletonTable rows={4} />
          </div>
        ) : positions.length === 0 ? (
          <div
            data-ocid="position_tracker.empty_state"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
              padding: "64px 24px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "rgba(0,163,255,0.08)",
                border: "1px solid rgba(0,163,255,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 20px rgba(0,163,255,0.12)",
              }}
            >
              {isWalletConnected ? (
                <SearchX style={{ color: BLUE }} className="h-8 w-8" />
              ) : (
                <Wallet style={{ color: BLUE }} className="h-8 w-8" />
              )}
            </div>
            <div>
              {positionsCleared ? (
                <>
                  <p
                    style={{ fontSize: 15, fontWeight: 600, color: "#e0e0e0" }}
                  >
                    Positions cleared
                  </p>
                  <p style={{ marginTop: 6, fontSize: 13, color: "#606070" }}>
                    Click <strong style={{ color: BLUE }}>Reset</strong> to
                    restore your default positions.
                  </p>
                </>
              ) : isWalletConnected ? (
                <>
                  <p
                    style={{ fontSize: 15, fontWeight: 600, color: "#e0e0e0" }}
                  >
                    No positions found
                  </p>
                  <p style={{ marginTop: 6, fontSize: 13, color: "#606070" }}>
                    This wallet has no active liquidity positions to display.
                  </p>
                </>
              ) : (
                <>
                  <p
                    style={{ fontSize: 15, fontWeight: 600, color: "#e0e0e0" }}
                  >
                    Connect wallet to view positions
                  </p>
                  <p style={{ marginTop: 6, fontSize: 13, color: "#606070" }}>
                    Connect MetaMask, Internet Identity, or add a tracked
                    wallet.
                  </p>
                </>
              )}
            </div>
            {positionsCleared && (
              <GhostBtn
                ocid="position_tracker.reset_positions_button"
                onClick={handleResetPositions}
              >
                <RotateCcw className="h-4 w-4" /> Restore Positions
              </GhostBtn>
            )}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                minWidth: 860,
                fontSize: 13,
                borderCollapse: "collapse",
              }}
              data-ocid="position_tracker.table"
            >
              <thead>
                <tr style={{ background: "rgba(0,0,0,0.25)" }}>
                  <th
                    style={{
                      ...colHeaderStyle,
                      textAlign: "left",
                      paddingLeft: 16,
                    }}
                  >
                    Pool
                  </th>
                  <th style={{ ...colHeaderStyle, textAlign: "left" }}>
                    Protocol
                  </th>
                  <th style={{ ...colHeaderStyle, textAlign: "right" }}>
                    Current Value
                  </th>
                  <th style={{ ...colHeaderStyle, textAlign: "right" }}>
                    Initial Value
                  </th>
                  <th style={{ ...colHeaderStyle, textAlign: "right" }}>
                    Fees Earned
                  </th>
                  <th style={{ ...colHeaderStyle, textAlign: "right" }}>IL</th>
                  <th style={{ ...colHeaderStyle, textAlign: "right" }}>APY</th>
                  <th
                    style={{
                      ...colHeaderStyle,
                      textAlign: "right",
                      paddingRight: 16,
                    }}
                  >
                    P&amp;L
                  </th>
                </tr>
              </thead>
              <tbody>
                {positions.map((entry, i) => (
                  <PositionRow
                    key={entry.position.id}
                    entry={entry}
                    index={i}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
