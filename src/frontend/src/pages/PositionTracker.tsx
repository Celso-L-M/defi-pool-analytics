import type { Position as SavedPosition, TrackedWallet } from "@/backend";
import { EmptyState, ErrorState } from "@/components/DataStates";
import { DemoBadge } from "@/components/DemoBadge";
import { SignInPrompt } from "@/components/SignInPrompt";
import { SkeletonTable } from "@/components/SkeletonLoaders";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MOCK_POSITIONS } from "@/data/mockData";
import { useAuth } from "@/hooks/useAuth";
import { usePools } from "@/hooks/useLiveData";
import {
  useAddPosition,
  useAddWallet,
  usePositions,
  useRemovePosition,
  useRemoveWallet,
  useUpdatePosition,
  useWallets,
} from "@/hooks/useQueries";
import { cn } from "@/lib/utils";
import { useDefiStore } from "@/store/useDefiStore";
import type { PollingInterval } from "@/store/useDefiStore";
import { exportCSV, exportPDF } from "@/utils/exportUtils";
import { toast } from "@/utils/toast";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  FileText,
  FlaskConical,
  Loader2,
  Pencil,
  PlusCircle,
  RefreshCw,
  Save,
  SearchX,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

// ── Types ────────────────────────────────────────────────────────────────────
type RowSource = "live" | "saved" | "demo" | "wallet";

interface TrackerRow {
  key: string;
  name: string;
  subtitle: string;
  venue: string;
  source: RowSource;
  poolId: string | null;
  currentValueUSD: number | null;
  entryValueUSD: number | null;
  feesUSD: number | null;
  ilPercent: number | null;
  apy: number | null;
  pnlUSD: number | null;
  entryDate: Date | null;
  note: string | null;
  saved: SavedPosition | null;
}

interface LiveResult {
  rows: TrackerRow[];
  unavailable: string[];
}

// ── Wallet address detection ─────────────────────────────────────────────────
const ETH_RE = /^0x[0-9a-fA-F]{40}$/;
const SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const ICP_ACCOUNT_RE = /^[0-9a-fA-F]{64}$/;
const ICP_PRINCIPAL_RE = /^[a-z2-7]{1,5}(-[a-z2-7]{1,5})+$/;

type WalletChain = "ETH" | "SOL" | "ICP";

function detectChain(addr: string): WalletChain | null {
  if (ETH_RE.test(addr)) return "ETH";
  if (ICP_PRINCIPAL_RE.test(addr) || ICP_ACCOUNT_RE.test(addr)) return "ICP";
  if (SOL_RE.test(addr)) return "SOL";
  return null;
}

function isQueryable(chain: string, address: string): boolean {
  return chain === "ICP" && ICP_PRINCIPAL_RE.test(address);
}

function shortAddress(addr: string): string {
  return addr.length > 16 ? `${addr.slice(0, 7)}\u2026${addr.slice(-5)}` : addr;
}

function walletKey(w: TrackedWallet): string {
  return `${w.chain}:${w.address}`;
}

const SELF_KEY = "self";
const NA_HINT =
  "Not available from the public ICPSwap and KongSwap APIs for this position.";

// ── Raw public API shapes ────────────────────────────────────────────────────
interface IcpSwapPosition {
  poolId?: string;
  token0Symbol?: string;
  token1Symbol?: string;
  token0Price?: number;
  token1Price?: number;
  unclaimedFees0?: number;
  unclaimedFees1?: number;
  depositedToken0?: number;
  depositedToken1?: number;
}

interface KongPosition {
  pool_id?: string;
  symbol_0?: string;
  symbol_1?: string;
  usd_value?: number;
  fees_0?: number;
  fees_1?: number;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function tokenUsd(amount: number | null, price: number | null): number | null {
  if (amount === null) return null;
  if (amount === 0) return 0;
  return price === null ? null : amount * price;
}

function sumOrNull(parts: (number | null)[]): number | null {
  let total = 0;
  for (const part of parts) {
    if (part === null) return null;
    total += part;
  }
  return total;
}

function pairName(a: string | undefined, b: string | undefined, id: string) {
  return a && b ? `${a}/${b}` : id;
}

function mapIcpSwap(raw: IcpSwapPosition, idx: number): TrackerRow {
  const poolId = raw.poolId ?? null;
  const price0 = finite(raw.token0Price);
  const price1 = finite(raw.token1Price);
  const current = sumOrNull([
    tokenUsd(finite(raw.depositedToken0), price0),
    tokenUsd(finite(raw.depositedToken1), price1),
  ]);
  const fees = sumOrNull([
    tokenUsd(finite(raw.unclaimedFees0), price0),
    tokenUsd(finite(raw.unclaimedFees1), price1),
  ]);
  return {
    key: `live-icpswap-${poolId ?? "pool"}-${idx}`,
    name: pairName(
      raw.token0Symbol,
      raw.token1Symbol,
      poolId ?? "Unnamed pool",
    ),
    subtitle: poolId ?? "Pool id not provided",
    venue: "ICPSwap",
    source: "live",
    poolId,
    currentValueUSD: current,
    entryValueUSD: null,
    feesUSD: fees,
    ilPercent: null,
    apy: null,
    pnlUSD: null,
    entryDate: null,
    note: null,
    saved: null,
  };
}

function mapKong(raw: KongPosition, idx: number): TrackerRow {
  const poolId = raw.pool_id ?? null;
  const fees0 = finite(raw.fees_0);
  const fees1 = finite(raw.fees_1);
  // Kong reports fees as token amounts, so only a zero total is a known USD value.
  const feesUSD = fees0 === 0 && fees1 === 0 ? 0 : null;
  return {
    key: `live-kong-${poolId ?? "pool"}-${idx}`,
    name: pairName(raw.symbol_0, raw.symbol_1, poolId ?? "Unnamed pool"),
    subtitle: poolId ?? "Pool id not provided",
    venue: "KongSwap",
    source: "live",
    poolId,
    currentValueUSD: finite(raw.usd_value),
    entryValueUSD: null,
    feesUSD,
    ilPercent: null,
    apy: null,
    pnlUSD: null,
    entryDate: null,
    note: null,
    saved: null,
  };
}

function extractItems<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    const inner = (data as { data?: unknown }).data;
    if (Array.isArray(inner)) return inner as T[];
  }
  return [];
}

async function fetchFirstOk<T>(
  urls: string[],
): Promise<{ reached: boolean; items: T[] }> {
  let reached = false;
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const data: unknown = await res.json();
      reached = true;
      const items = extractItems<T>(data);
      if (items.length > 0) return { reached, items };
    } catch {
      // try the next endpoint
    }
  }
  return { reached, items: [] };
}

async function fetchLivePositions(principal: string): Promise<LiveResult> {
  const p = encodeURIComponent(principal);
  const [icp, kong] = await Promise.all([
    fetchFirstOk<IcpSwapPosition>([
      `https://uvevg-iyaaa-aaaak-ac27q-cai.raw.icp0.io/position?principal=${p}`,
      `https://api.icpswap.com/v3/user/positions?principal=${p}`,
    ]),
    fetchFirstOk<KongPosition>([
      `https://kongswap.io/api/positions/${p}`,
      `https://api.kongswap.io/user/positions?principal=${p}`,
    ]),
  ]);
  if (!icp.reached && !kong.reached) {
    throw new Error("Neither ICPSwap nor KongSwap responded.");
  }
  const unavailable: string[] = [];
  if (!icp.reached) unavailable.push("ICPSwap");
  if (!kong.reached) unavailable.push("KongSwap");
  return {
    rows: [...icp.items.map(mapIcpSwap), ...kong.items.map(mapKong)],
    unavailable,
  };
}

// ── Row building ─────────────────────────────────────────────────────────────
function timestampToDate(ts: bigint): Date | null {
  const date = new Date(Number(ts / 1_000_000n));
  return Number.isNaN(date.getTime()) ? null : date;
}

interface PoolApy {
  id: string;
  poolId?: string;
  apy: { current: number };
}

function buildRows(
  saved: SavedPosition[],
  live: TrackerRow[],
  pools: PoolApy[],
): TrackerRow[] {
  const used = new Set<string>();
  const rows: TrackerRow[] = saved.map((p) => {
    const match = live.find((l) => l.poolId !== null && l.poolId === p.poolId);
    if (match) used.add(match.key);
    const current = match ? match.currentValueUSD : null;
    const pool = pools.find((x) => x.id === p.poolId || x.poolId === p.poolId);
    return {
      key: `saved-${p.id.toString()}`,
      name: p.displayName,
      subtitle: p.symbol,
      venue: match ? match.venue : "Saved",
      source: "saved",
      poolId: p.poolId,
      currentValueUSD: current,
      entryValueUSD: p.amountUsd,
      feesUSD: match ? match.feesUSD : null,
      ilPercent: null,
      apy: pool ? pool.apy.current : null,
      pnlUSD: current === null ? null : current - p.amountUsd,
      entryDate: timestampToDate(p.entryTimestamp),
      note: p.notes ?? null,
      saved: p,
    };
  });
  for (const l of live) if (!used.has(l.key)) rows.push(l);
  return rows;
}

function buildDemoRows(): TrackerRow[] {
  return MOCK_POSITIONS.map((e) => ({
    key: `demo-${e.position.id}`,
    name: e.position.poolName,
    subtitle: `${e.position.token0Symbol}/${e.position.token1Symbol}`,
    venue: e.position.protocol,
    source: "demo",
    poolId: e.position.poolId,
    currentValueUSD: e.position.currentValueUSD,
    entryValueUSD: e.position.entryValueUSD,
    feesUSD: e.position.feesEarned,
    ilPercent: e.position.ilPercent,
    apy: e.pool.apy.current,
    pnlUSD: e.netPnL,
    entryDate: new Date(e.position.entryDate),
    note: null,
    saved: null,
  }));
}

// ── Formatting ───────────────────────────────────────────────────────────────
function formatUSD(val: number, compact = false): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: compact && Math.abs(val) >= 1_000 ? 1 : 2,
    notation: compact && Math.abs(val) >= 1_000 ? "compact" : "standard",
  }).format(val);
}

function formatPct(val: number): string {
  return `${val >= 0 ? "+" : ""}${val.toFixed(2)}%`;
}

function plain(val: number | null): string {
  return val === null ? "N/A" : val.toFixed(2);
}

function ilUSD(row: TrackerRow): number | null {
  if (row.ilPercent === null || row.currentValueUSD === null) return null;
  return (row.ilPercent / 100) * row.currentValueUSD;
}

function pnlPct(row: TrackerRow): number | null {
  if (row.pnlUSD === null || row.entryValueUSD === null) return null;
  return row.entryValueUSD > 0 ? (row.pnlUSD / row.entryValueUSD) * 100 : null;
}

function totalOf(
  rows: TrackerRow[],
  pick: (r: TrackerRow) => number | null,
): { total: number | null; known: number } {
  let total = 0;
  let known = 0;
  for (const row of rows) {
    const value = pick(row);
    if (value !== null) {
      total += value;
      known += 1;
    }
  }
  return { total: known === 0 ? null : total, known };
}

function dateInputValue(date: Date | null): string {
  const d = date ?? new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

const SOURCE_LABEL: Record<RowSource, string> = {
  live: "Live",
  saved: "Saved",
  demo: "Demo",
  wallet: "Stored",
};

// ── Small presentational pieces ──────────────────────────────────────────────
function SourceBadge({ source }: { source: RowSource }) {
  if (source === "demo") return <DemoBadge />;
  const tone =
    source === "live"
      ? "border-success/40 bg-success/10 text-success"
      : source === "saved"
        ? "border-primary/40 bg-primary/10 text-primary"
        : "border-border bg-muted text-muted-foreground";
  return (
    <span
      data-ocid="position_tracker.source_badge"
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-px font-mono text-[10px] font-semibold uppercase tracking-wider",
        tone,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {SOURCE_LABEL[source]}
    </span>
  );
}

function NA() {
  return (
    <span className="font-mono text-xs text-muted-foreground" title={NA_HINT}>
      N/A
    </span>
  );
}

function ValueCell({
  children,
  demo,
  className,
}: { children: React.ReactNode; demo: boolean; className?: string }) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className={cn("font-mono text-[13px] font-semibold", className)}>
        {children}
      </span>
      {demo && <DemoBadge label="Demo" className="px-1 text-[9px]" />}
    </div>
  );
}

function ilTone(ilPct: number): string {
  if (ilPct > 5) return "text-destructive";
  if (ilPct >= 1) return "text-warning";
  return "text-success";
}

interface StatCardProps {
  label: string;
  value: number | null;
  sub?: string;
  tone: "primary" | "success" | "danger";
  icon: React.ReactNode;
  demo: boolean;
  ocid: string;
}

function StatCard({
  label,
  value,
  sub,
  tone,
  icon,
  demo,
  ocid,
}: StatCardProps) {
  const toneText =
    tone === "success"
      ? "text-success"
      : tone === "danger"
        ? "text-destructive"
        : "text-primary";
  const toneBg =
    tone === "success"
      ? "bg-success/10 text-success"
      : tone === "danger"
        ? "bg-destructive/10 text-destructive"
        : "bg-primary/10 text-primary";
  return (
    <div
      data-ocid={ocid}
      className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
    >
      <div
        className={cn(
          "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg",
          toneBg,
        )}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {value === null ? (
          <p
            className="mt-0.5 font-mono text-lg font-bold text-muted-foreground"
            title={NA_HINT}
          >
            N/A
          </p>
        ) : (
          <p
            className={cn(
              "mt-0.5 truncate font-mono text-lg font-bold",
              toneText,
            )}
          >
            {formatUSD(value, true)}
          </p>
        )}
        {sub && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>
        )}
        {demo && <DemoBadge className="mt-1" />}
      </div>
    </div>
  );
}

function RefreshProgressBar({
  interval,
  updatedAt,
}: { interval: number; updatedAt: number }) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (!updatedAt) return;
    const tick = () => {
      const elapsed = (Date.now() - updatedAt) / 1000;
      setProgress(Math.min((elapsed / interval) * 100, 100));
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [interval, updatedAt]);
  return (
    <div
      className="h-0.5 w-20 overflow-hidden rounded bg-primary/10"
      aria-hidden
    >
      <div
        className="h-full bg-primary transition-[width] duration-200 ease-linear"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

// ── Position row ─────────────────────────────────────────────────────────────
interface PositionRowProps {
  row: TrackerRow;
  index: number;
  onSave: (row: TrackerRow) => void;
  onEdit: (row: TrackerRow) => void;
  onRemove: (row: TrackerRow) => void;
}

function PositionRow({
  row,
  index,
  onSave,
  onEdit,
  onRemove,
}: PositionRowProps) {
  const demo = row.source === "demo";
  const il = ilUSD(row);
  const pct = pnlPct(row);
  return (
    <tr
      data-ocid={`position.item.${index + 1}`}
      className="border-b border-border/60 transition-colors hover:bg-primary/5"
    >
      <td className="py-3 pl-4 pr-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="max-w-[200px] truncate text-[13px] font-medium text-foreground">
            {row.name}
          </span>
          <SourceBadge source={row.source} />
        </div>
        <span className="block max-w-[240px] truncate text-[11px] text-muted-foreground">
          {row.subtitle}
        </span>
        {row.note && (
          <span className="block max-w-[240px] truncate text-[11px] italic text-muted-foreground">
            {row.note}
          </span>
        )}
      </td>
      <td className="px-2 py-3 text-xs capitalize text-muted-foreground">
        {row.venue}
      </td>
      <td className="px-2 py-3 text-right">
        {row.currentValueUSD === null ? (
          <NA />
        ) : (
          <ValueCell demo={demo} className="text-primary">
            {formatUSD(row.currentValueUSD)}
          </ValueCell>
        )}
      </td>
      <td className="px-2 py-3 text-right">
        {row.entryValueUSD === null ? (
          <NA />
        ) : (
          <ValueCell demo={demo} className="text-muted-foreground">
            {formatUSD(row.entryValueUSD)}
          </ValueCell>
        )}
      </td>
      <td className="px-2 py-3 text-right">
        {row.feesUSD === null ? (
          <NA />
        ) : (
          <ValueCell demo={demo} className="text-success">
            +{formatUSD(row.feesUSD)}
          </ValueCell>
        )}
      </td>
      <td className="px-2 py-3 text-right">
        {il === null || row.ilPercent === null ? (
          <NA />
        ) : (
          <ValueCell demo={demo} className={ilTone(row.ilPercent)}>
            {formatUSD(il)}
            <span className="block text-[11px] font-normal opacity-75">
              {formatPct(row.ilPercent)}
            </span>
          </ValueCell>
        )}
      </td>
      <td className="px-2 py-3 text-right">
        {row.apy === null ? (
          <NA />
        ) : (
          <ValueCell
            demo={demo}
            className={row.apy > 10 ? "text-success" : "text-primary"}
          >
            {row.apy.toFixed(1)}%
          </ValueCell>
        )}
      </td>
      <td className="px-2 py-3 text-right">
        {row.pnlUSD === null ? (
          <NA />
        ) : (
          <ValueCell
            demo={demo}
            className={row.pnlUSD >= 0 ? "text-success" : "text-destructive"}
          >
            {formatUSD(row.pnlUSD)}
            {pct !== null && (
              <span className="block text-[11px] font-normal opacity-75">
                {formatPct(pct)}
              </span>
            )}
          </ValueCell>
        )}
      </td>
      <td className="py-3 pl-2 pr-4 text-right">
        {row.source === "live" && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-ocid={`position.save_button.${index + 1}`}
            onClick={() => onSave(row)}
          >
            <Save className="mr-1 h-3.5 w-3.5" aria-hidden />
            Save
          </Button>
        )}
        {row.source === "saved" && (
          <div className="flex justify-end gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`Edit ${row.name}`}
              data-ocid={`position.edit_button.${index + 1}`}
              onClick={() => onEdit(row)}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`Remove ${row.name}`}
              data-ocid={`position.delete_button.${index + 1}`}
              onClick={() => onRemove(row)}
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" aria-hidden />
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
}

// ── Add wallet dialog ────────────────────────────────────────────────────────
interface AddWalletDialogProps {
  existing: TrackedWallet[];
  signedIn: boolean;
  onClose: () => void;
  onAdded: (wallet: TrackedWallet) => void;
}

function AddWalletDialog({
  existing,
  signedIn,
  onClose,
  onAdded,
}: AddWalletDialogProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const addWallet = useAddWallet();
  const trimmed = value.trim();
  const preview = trimmed ? detectChain(trimmed) : null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmed) {
      setError("Enter a wallet address.");
      return;
    }
    const chain = detectChain(trimmed);
    if (!chain) {
      setError(
        "Unrecognised address. Expected ETH (0x + 40 hex), Solana (base58) or ICP (principal or 64-hex account id).",
      );
      return;
    }
    if (existing.some((w) => w.chain === chain && w.address === trimmed)) {
      setError("This wallet is already tracked.");
      return;
    }
    const wallet: TrackedWallet = { chain, address: trimmed };
    addWallet.mutate(wallet, {
      onSuccess: () => {
        toast.success(`${chain} wallet saved to your account`);
        onAdded(wallet);
        onClose();
      },
      onError: (err) => setError(err.message),
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-ocid="add_wallet.dialog" className="max-w-md">
        <DialogHeader>
          <DialogTitle>Track a wallet</DialogTitle>
          <DialogDescription>
            Wallets are saved to your account. Positions are fetched for ICP
            principals; ETH and Solana wallets are stored with values shown as
            N/A.
          </DialogDescription>
        </DialogHeader>
        {!signedIn ? (
          <SignInPrompt feature="tracked wallets" />
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="wallet-addr">Wallet address</Label>
              <div className="relative">
                <Input
                  id="wallet-addr"
                  value={value}
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="0x… / Solana base58 / ICP principal"
                  className="pr-14 font-mono text-xs"
                  data-ocid="add_wallet.input"
                  onChange={(e) => {
                    setValue(e.target.value);
                    setError(null);
                  }}
                />
                {preview && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-bold">
                    {preview}
                  </span>
                )}
              </div>
              {error && (
                <p
                  role="alert"
                  data-ocid="add_wallet.field_error"
                  className="text-xs text-destructive"
                >
                  {error}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                data-ocid="add_wallet.cancel_button"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1"
                data-ocid="add_wallet.submit_button"
                disabled={addWallet.isPending}
              >
                {addWallet.isPending ? "Saving\u2026" : "Track wallet"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Add / edit / save position dialog ────────────────────────────────────────
interface PositionDialogProps {
  mode: "add" | "edit" | "save";
  row: TrackerRow | null;
  signedIn: boolean;
  onClose: () => void;
}

function PositionDialog({ mode, row, signedIn, onClose }: PositionDialogProps) {
  const [name, setName] = useState(row?.name ?? "");
  const [symbol, setSymbol] = useState(row?.saved?.symbol ?? "");
  const [poolId, setPoolId] = useState(row?.poolId ?? "");
  const [amount, setAmount] = useState(() => {
    if (mode === "edit" && row?.entryValueUSD != null) {
      return String(row.entryValueUSD);
    }
    if (mode === "save" && row?.currentValueUSD != null) {
      return row.currentValueUSD.toFixed(2);
    }
    return "";
  });
  const [date, setDate] = useState(() =>
    dateInputValue(mode === "edit" ? (row?.entryDate ?? null) : null),
  );
  const [notes, setNotes] = useState(row?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const addPosition = useAddPosition();
  const updatePosition = useUpdatePosition();
  const pending = addPosition.isPending || updatePosition.isPending;

  const title =
    mode === "edit"
      ? "Edit saved position"
      : mode === "save"
        ? "Save position to account"
        : "Add a position";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amountUsd = Number(amount);
    const when = new Date(`${date}T00:00:00`);
    if (!name.trim() || !symbol.trim() || !poolId.trim()) {
      setError("Name, symbol and pool id are required.");
      return;
    }
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      setError("Enter the amount invested in USD as a positive number.");
      return;
    }
    if (Number.isNaN(when.getTime())) {
      setError("Choose a valid entry date.");
      return;
    }
    const input = {
      displayName: name.trim(),
      symbol: symbol.trim(),
      poolId: poolId.trim(),
      amountUsd,
      entryTimestamp: BigInt(when.getTime()) * 1_000_000n,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    const handlers = {
      onSuccess: () => {
        toast.success(
          mode === "edit" ? "Position updated" : "Position saved to account",
        );
        onClose();
      },
      onError: (err: Error) => setError(err.message),
    };
    if (mode === "edit" && row?.saved) {
      updatePosition.mutate({ id: row.saved.id, input }, handlers);
    } else {
      addPosition.mutate(input, handlers);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-ocid="position_form.dialog" className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Saved positions are stored privately in your account. Current values
            appear only when a live ICPSwap or KongSwap position with the same
            pool id is found.
          </DialogDescription>
        </DialogHeader>
        {!signedIn ? (
          <SignInPrompt feature="positions" />
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="pos-name">Display name</Label>
                <Input
                  id="pos-name"
                  value={name}
                  data-ocid="position_form.name_input"
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ICP/ckBTC"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pos-symbol">Symbol</Label>
                <Input
                  id="pos-symbol"
                  value={symbol}
                  data-ocid="position_form.symbol_input"
                  onChange={(e) => setSymbol(e.target.value)}
                  placeholder="ICP-ckBTC"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pos-pool">Pool id</Label>
                <Input
                  id="pos-pool"
                  value={poolId}
                  className="font-mono text-xs"
                  data-ocid="position_form.pool_input"
                  onChange={(e) => setPoolId(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pos-amount">Amount invested (USD)</Label>
                <Input
                  id="pos-amount"
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={amount}
                  data-ocid="position_form.amount_input"
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pos-date">Entry date</Label>
                <Input
                  id="pos-date"
                  type="date"
                  value={date}
                  data-ocid="position_form.date_input"
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="pos-notes">Notes (optional)</Label>
                <Input
                  id="pos-notes"
                  value={notes}
                  data-ocid="position_form.notes_input"
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
            {error && (
              <p
                role="alert"
                data-ocid="position_form.error_state"
                className="text-xs text-destructive"
              >
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                data-ocid="position_form.cancel_button"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1"
                data-ocid="position_form.submit_button"
                disabled={pending}
              >
                {pending
                  ? "Saving\u2026"
                  : mode === "edit"
                    ? "Save changes"
                    : "Save position"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Polling options ──────────────────────────────────────────────────────────
const POLLING_OPTIONS: { value: PollingInterval; label: string }[] = [
  { value: 10, label: "10s" },
  { value: 30, label: "30s" },
  { value: 60, label: "60s" },
];

const NOTICE =
  "rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground";

// ── Main page ────────────────────────────────────────────────────────────────
export function PositionTrackerPage() {
  const auth = useAuth();
  const pollingInterval = useDefiStore((s) => s.pollingInterval);
  const setPollingInterval = useDefiStore((s) => s.setPollingInterval);

  const [demoMode, setDemoMode] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [walletDialog, setWalletDialog] = useState(false);
  const [positionDialog, setPositionDialog] = useState<{
    mode: "add" | "edit" | "save";
    row: TrackerRow | null;
  } | null>(null);
  const [removeTarget, setRemoveTarget] = useState<TrackerRow | null>(null);
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);

  const walletsQuery = useWallets();
  const savedQuery = usePositions();
  const removeWallet = useRemoveWallet();
  const removePosition = useRemovePosition();
  const poolsResult = usePools();

  const wallets = walletsQuery.data ?? [];
  const selectedWallet = wallets.find((w) => walletKey(w) === selectedKey);
  const useSelf =
    !selectedWallet &&
    auth.isAuthenticated &&
    auth.principalText !== "" &&
    (selectedKey === null || selectedKey === SELF_KEY);

  const target: { chain: string; address: string } | null = selectedWallet
    ? { chain: selectedWallet.chain, address: selectedWallet.address }
    : useSelf
      ? { chain: "ICP", address: auth.principalText }
      : null;
  const liveAddress =
    !demoMode && target && isQueryable(target.chain, target.address)
      ? target.address
      : null;

  const liveQuery = useQuery({
    queryKey: ["position-tracker", "live", liveAddress],
    queryFn: () => {
      if (!liveAddress) throw new Error("No ICP principal selected.");
      return fetchLivePositions(liveAddress);
    },
    enabled: liveAddress !== null,
    refetchInterval: pollingInterval * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const rows = useMemo<TrackerRow[]>(() => {
    if (demoMode) return buildDemoRows();
    const pools = poolsResult.isDemo ? [] : poolsResult.data;
    const built = buildRows(
      savedQuery.data ?? [],
      liveQuery.data?.rows ?? [],
      pools,
    );
    if (
      selectedWallet &&
      !isQueryable(selectedWallet.chain, selectedWallet.address)
    ) {
      built.push({
        key: `wallet-${walletKey(selectedWallet)}`,
        name: `${selectedWallet.chain} wallet`,
        subtitle: shortAddress(selectedWallet.address),
        venue: selectedWallet.chain,
        source: "wallet",
        poolId: null,
        currentValueUSD: null,
        entryValueUSD: null,
        feesUSD: null,
        ilPercent: null,
        apy: null,
        pnlUSD: null,
        entryDate: null,
        note:
          selectedWallet.chain === "ICP"
            ? "Account ids cannot be queried; track the principal instead."
            : `${selectedWallet.chain} is not covered by the public ICPSwap and KongSwap APIs.`,
        saved: null,
      });
    }
    return built;
  }, [
    demoMode,
    savedQuery.data,
    liveQuery.data,
    poolsResult.isDemo,
    poolsResult.data,
    selectedWallet,
  ]);

  const updatedAt = demoMode
    ? 0
    : Math.max(liveQuery.dataUpdatedAt, savedQuery.dataUpdatedAt);
  const isRefreshing =
    !demoMode &&
    ((liveQuery.isFetching && !liveQuery.isLoading) ||
      (savedQuery.isFetching && !savedQuery.isLoading));
  const isInitialLoading =
    !demoMode && (liveQuery.isLoading || savedQuery.isLoading);

  function refreshAll() {
    if (liveAddress) void liveQuery.refetch();
    if (auth.isAuthenticated) {
      void savedQuery.refetch();
      void walletsQuery.refetch();
    }
  }

  function chooseWallet(key: string) {
    setSelectedKey((prev) => (prev === key ? null : key));
  }

  function handleRemoveWallet(wallet: TrackedWallet) {
    removeWallet.mutate(wallet, {
      onSuccess: () => {
        if (selectedKey === walletKey(wallet)) setSelectedKey(null);
        toast.success("Wallet removed from your account");
      },
      onError: (err) => toast.error(err.message),
    });
  }

  function confirmRemovePosition() {
    const toRemove = removeTarget;
    if (!toRemove?.saved) return;
    removePosition.mutate(toRemove.saved.id, {
      onSuccess: () => toast.success("Position removed"),
      onError: (err) => toast.error(err.message),
    });
    setRemoveTarget(null);
  }

  // Summary figures cover only positions whose values are actually known.
  const valueTotal = totalOf(rows, (r) => r.currentValueUSD);
  const feesTotal = totalOf(rows, (r) => r.feesUSD);
  const ilTotal = totalOf(rows, ilUSD);
  const pnlTotal = totalOf(rows, (r) => r.pnlUSD);
  const pnlBase = totalOf(rows, (r) =>
    r.pnlUSD === null ? null : r.entryValueUSD,
  );
  const pnlPercent =
    pnlTotal.total !== null && pnlBase.total !== null && pnlBase.total > 0
      ? (pnlTotal.total / pnlBase.total) * 100
      : null;
  const coverage = (known: number) =>
    rows.length > 0 && known < rows.length
      ? `${known} of ${rows.length} positions`
      : undefined;

  const dataLabel = (r: TrackerRow) => SOURCE_LABEL[r.source];

  function exportRows(): string[][] {
    return rows.map((r) => [
      r.name,
      r.venue,
      dataLabel(r),
      plain(r.currentValueUSD),
      plain(r.entryValueUSD),
      plain(r.feesUSD),
      plain(r.ilPercent),
      plain(r.apy),
      plain(r.pnlUSD),
    ]);
  }

  const EXPORT_HEADERS = [
    "Pool",
    "Venue",
    "Data",
    "Current Value (USD)",
    "Initial Value (USD)",
    "Fees Earned (USD)",
    "IL %",
    "APY %",
    "P&L (USD)",
  ];

  async function handleExportCSV() {
    setExporting("csv");
    await new Promise<void>((r) => setTimeout(r, 200));
    const stamp = new Date().toISOString().slice(0, 10);
    exportCSV(
      `${demoMode ? "demo-" : ""}positions-${stamp}.csv`,
      EXPORT_HEADERS,
      exportRows(),
    );
    setExporting(null);
    toast.success("Positions exported to CSV");
  }

  async function handleExportPDF() {
    setExporting("pdf");
    await new Promise<void>((r) => setTimeout(r, 200));
    const date = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const fmt = (v: number | null) => (v === null ? "N/A" : formatUSD(v));
    const summary = [
      { label: "Total Portfolio Value", value: fmt(valueTotal.total) },
      { label: "Total Fees Earned", value: fmt(feesTotal.total) },
      { label: "Total IL", value: fmt(ilTotal.total) },
      {
        label: "Net P&L",
        value: pnlTotal.total === null ? "N/A" : formatUSD(pnlTotal.total),
      },
    ];
    exportPDF({
      title: demoMode
        ? "DeFi Pool Analytics – Position Report (Demo data)"
        : "DeFi Pool Analytics – Position Report",
      date,
      walletAddress: demoMode
        ? "Demo data"
        : (target?.address ?? "Not selected"),
      summary,
      sections: [
        {
          title: "Portfolio Summary",
          rows: [
            ...summary,
            {
              label: "P&L %",
              value: pnlPercent === null ? "N/A" : formatPct(pnlPercent),
            },
            { label: "Positions", value: String(rows.length) },
          ],
        },
      ],
      tableHeaders: EXPORT_HEADERS,
      tableRows: exportRows(),
    });
    setExporting(null);
    toast.success("PDF report generated");
  }

  const lastRefreshedStr = updatedAt
    ? new Date(updatedAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "\u2014";

  const unsupportedTarget =
    !demoMode && target !== null && !isQueryable(target.chain, target.address);
  const partialLive = liveQuery.data?.unavailable ?? [];
  const columnHeader =
    "px-2 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap";

  return (
    <div className="px-4 pb-8" data-ocid="position_tracker.page">
      {walletDialog && (
        <AddWalletDialog
          existing={wallets}
          signedIn={auth.isAuthenticated}
          onClose={() => setWalletDialog(false)}
          onAdded={(w) => {
            setDemoMode(false);
            setSelectedKey(walletKey(w));
          }}
        />
      )}
      {positionDialog && (
        <PositionDialog
          key={positionDialog.row?.key ?? "new-position"}
          mode={positionDialog.mode}
          row={positionDialog.row}
          signedIn={auth.isAuthenticated}
          onClose={() => setPositionDialog(null)}
        />
      )}
      <AlertDialog
        open={removeTarget !== null}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
      >
        <AlertDialogContent data-ocid="remove_position.dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this saved position?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget?.name} will be deleted from your account on every
              device. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-ocid="remove_position.cancel_button">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              data-ocid="remove_position.confirm_button"
              onClick={confirmRemovePosition}
            >
              Remove position
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Header */}
      <div className="pb-5 pt-6">
        <div className="mb-1 flex items-center gap-2.5">
          <div className="h-5 w-[3px] rounded bg-primary" aria-hidden />
          <h1 className="font-display text-[13px] font-bold uppercase tracking-[0.18em] text-primary">
            Position Tracker
          </h1>
        </div>
        <p className="pl-[13px] text-xs tracking-wide text-muted-foreground">
          Monitor liquidity positions from public ICPSwap and KongSwap data.
          Figures the public APIs do not provide are shown as N/A.
        </p>
      </div>

      {/* Wallets */}
      <section
        aria-label="Tracked wallets"
        className="mb-5 rounded-xl border border-border bg-card p-4"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[11px] uppercase tracking-wider text-muted-foreground">
            Wallets
          </span>
          <Button
            type="button"
            size="sm"
            data-ocid="position_tracker.add_wallet_button"
            onClick={() => setWalletDialog(true)}
          >
            <PlusCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Add wallet
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-ocid="position_tracker.add_position_button"
            onClick={() => setPositionDialog({ mode: "add", row: null })}
          >
            <PlusCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Add position
          </Button>
          {!auth.isAuthenticated && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              data-ocid="position_tracker.sign_in_button"
              onClick={auth.login}
              disabled={auth.isLoggingIn}
            >
              <Zap className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              {auth.isLoggingIn ? "Signing in\u2026" : "Sign in to save"}
            </Button>
          )}
        </div>

        <div
          className="mt-3 flex flex-wrap items-center gap-1.5"
          data-ocid="tracked_wallets.list"
        >
          {auth.isAuthenticated && (
            <WalletChip
              label="My principal"
              chain="ICP"
              title={auth.principalText}
              active={useSelf}
              onSelect={() => setSelectedKey(SELF_KEY)}
            />
          )}
          {wallets.map((w) => (
            <WalletChip
              key={walletKey(w)}
              label={shortAddress(w.address)}
              chain={w.chain}
              title={w.address}
              active={selectedKey === walletKey(w)}
              onSelect={() => chooseWallet(walletKey(w))}
              onRemove={() => handleRemoveWallet(w)}
              removing={removeWallet.isPending}
            />
          ))}
          {auth.isAuthenticated && walletsQuery.isLoading && (
            <span className="text-xs text-muted-foreground" aria-live="polite">
              Loading wallets…
            </span>
          )}
          {auth.isAuthenticated &&
            !walletsQuery.isLoading &&
            !walletsQuery.isError &&
            wallets.length === 0 && (
              <span
                data-ocid="tracked_wallets.empty_state"
                className="text-xs text-muted-foreground"
              >
                No saved wallets yet. Add one to track it across devices.
              </span>
            )}
          {walletsQuery.isError && (
            <span
              role="alert"
              data-ocid="tracked_wallets.error_state"
              className="flex items-center gap-2 text-xs text-destructive"
            >
              Could not load your wallets.
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-ocid="tracked_wallets.retry_button"
                onClick={() => void walletsQuery.refetch()}
              >
                Retry
              </Button>
            </span>
          )}
          {!auth.isAuthenticated && (
            <span className="text-xs text-muted-foreground">
              Sign in to save wallets and positions to your account.
            </span>
          )}
        </div>
      </section>

      {/* Controls */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <fieldset className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5">
          <legend className="sr-only">Polling interval</legend>
          <Activity className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Refresh
          </span>
          {POLLING_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={pollingInterval === value}
              data-ocid={`position_tracker.poll_${value}s`}
              onClick={() => setPollingInterval(value)}
              className={cn(
                "rounded-md border px-2.5 py-0.5 text-[11px] transition-colors",
                pollingInterval === value
                  ? "border-primary bg-primary font-bold text-primary-foreground"
                  : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </fieldset>

        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              isRefreshing ? "animate-pulse bg-primary" : "bg-success",
            )}
            aria-hidden
          />
          <span className="font-mono text-[11px] text-muted-foreground">
            {lastRefreshedStr}
          </span>
          <RefreshProgressBar
            interval={pollingInterval}
            updatedAt={updatedAt}
          />
        </div>

        <Button
          type="button"
          size="sm"
          variant="outline"
          data-ocid="position_tracker.refresh_button"
          onClick={refreshAll}
          disabled={demoMode || isRefreshing}
        >
          <RefreshCw
            className={cn("mr-1.5 h-3.5 w-3.5", isRefreshing && "animate-spin")}
            aria-hidden
          />
          Refresh
        </Button>

        <Button
          type="button"
          size="sm"
          variant={demoMode ? "default" : "outline"}
          aria-pressed={demoMode}
          data-ocid="position_tracker.demo_toggle"
          onClick={() => setDemoMode((v) => !v)}
        >
          <FlaskConical className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          {demoMode ? "Exit demo data" : "Preview demo data"}
        </Button>

        <Button
          type="button"
          size="sm"
          variant="outline"
          data-ocid="position_tracker.export_csv_button"
          onClick={() => void handleExportCSV()}
          disabled={rows.length === 0 || exporting !== null}
        >
          {exporting === "csv" ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <FileText className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          )}
          CSV
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-ocid="position_tracker.export_pdf_button"
          onClick={() => void handleExportPDF()}
          disabled={rows.length === 0 || exporting !== null}
        >
          {exporting === "pdf" ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <FileText className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          )}
          PDF
        </Button>
      </div>

      {demoMode && (
        <div
          data-ocid="position_tracker.demo_banner"
          className="mb-5 flex flex-wrap items-center gap-2 rounded-md border border-demo/50 bg-demo/10 px-3 py-2 text-xs text-foreground"
        >
          <DemoBadge />
          You chose to preview sample positions. Every figure below is demo
          data, not your holdings or a live market value.
        </div>
      )}

      {/* Summary */}
      <div
        className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4"
        data-ocid="position_tracker.summary_bar"
      >
        <StatCard
          ocid="position_tracker.stat.value"
          label="Portfolio value"
          value={valueTotal.total}
          sub={coverage(valueTotal.known)}
          tone="primary"
          demo={demoMode}
          icon={<Wallet className="h-4 w-4" aria-hidden />}
        />
        <StatCard
          ocid="position_tracker.stat.fees"
          label="Fees earned"
          value={feesTotal.total}
          sub={coverage(feesTotal.known)}
          tone="success"
          demo={demoMode}
          icon={<TrendingUp className="h-4 w-4" aria-hidden />}
        />
        <StatCard
          ocid="position_tracker.stat.il"
          label="Impermanent loss"
          value={ilTotal.total === null ? null : Math.abs(ilTotal.total)}
          sub={coverage(ilTotal.known)}
          tone="danger"
          demo={demoMode}
          icon={<TrendingDown className="h-4 w-4" aria-hidden />}
        />
        <StatCard
          ocid="position_tracker.stat.pnl"
          label="Net P&L"
          value={pnlTotal.total}
          sub={
            pnlPercent !== null
              ? formatPct(pnlPercent)
              : coverage(pnlTotal.known)
          }
          tone={
            pnlTotal.total !== null && pnlTotal.total < 0 ? "danger" : "success"
          }
          demo={demoMode}
          icon={
            pnlTotal.total !== null && pnlTotal.total < 0 ? (
              <TrendingDown className="h-4 w-4" aria-hidden />
            ) : (
              <TrendingUp className="h-4 w-4" aria-hidden />
            )
          }
        />
      </div>

      {/* Table card */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-3.5 w-0.5 rounded bg-primary" aria-hidden />
            <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-foreground">
              Positions
            </h2>
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-px text-[10px] font-semibold text-primary">
              {rows.length}
            </span>
            {target && !demoMode && (
              <span
                className="hidden truncate font-mono text-[11px] text-muted-foreground sm:inline"
                title={target.address}
              >
                {target.chain} · {shortAddress(target.address)}
              </span>
            )}
          </div>
          {isRefreshing && (
            <span
              data-ocid="position_tracker.loading_state"
              className="flex items-center gap-1.5 text-[11px] text-primary"
            >
              <RefreshCw className="h-3 w-3 animate-spin" aria-hidden />
              Updating…
            </span>
          )}
        </div>

        {!demoMode && (
          <div className="space-y-2 px-4 pt-3 empty:hidden">
            {unsupportedTarget && target && (
              <p
                className={NOTICE}
                data-ocid="position_tracker.unsupported_notice"
              >
                {target.chain === "ICP"
                  ? "ICP account ids cannot be queried. Track the wallet's principal to load positions."
                  : `${target.chain} wallets are stored on your account, but the public ICPSwap and KongSwap APIs do not cover ${target.chain}, so values are N/A.`}
              </p>
            )}
            {partialLive.length > 0 && (
              <p className={NOTICE} data-ocid="position_tracker.partial_notice">
                {partialLive.join(" and ")} did not respond. Results may be
                incomplete.
              </p>
            )}
            {liveQuery.isError && rows.length > 0 && (
              <div
                role="alert"
                data-ocid="position_tracker.live_error"
                className={cn(NOTICE, "flex flex-wrap items-center gap-2")}
              >
                Live refresh failed: {liveQuery.error.message}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  data-ocid="position_tracker.live_retry_button"
                  onClick={() => void liveQuery.refetch()}
                >
                  Retry
                </Button>
              </div>
            )}
          </div>
        )}

        {isInitialLoading && rows.length === 0 ? (
          <div className="p-4" data-ocid="position_tracker.table_loading">
            <SkeletonTable rows={4} />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4" data-ocid="position_tracker.empty_wrapper">
            {savedQuery.isError ? (
              <ErrorState
                title="Could not load your saved positions"
                message={savedQuery.error.message}
                onRetry={() => void savedQuery.refetch()}
              />
            ) : liveQuery.isError ? (
              <ErrorState
                title="Could not load live positions"
                message={`${liveQuery.error.message} The public APIs may be unreachable from this browser.`}
                onRetry={() => void liveQuery.refetch()}
              />
            ) : (
              <EmptyState
                icon={
                  target ? (
                    <SearchX className="h-5 w-5" aria-hidden />
                  ) : (
                    <Wallet className="h-5 w-5" aria-hidden />
                  )
                }
                title={
                  target
                    ? "No positions found"
                    : auth.isAuthenticated
                      ? "Nothing tracked yet"
                      : "Sign in to track positions"
                }
                description={
                  target
                    ? "This wallet has no active liquidity positions on ICPSwap or KongSwap, and nothing is saved yet."
                    : auth.isAuthenticated
                      ? "Add a wallet or a position to start tracking, or preview the layout with demo data."
                      : "Sign in to save wallets and positions, or preview the layout with clearly labelled demo data."
                }
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    {auth.isAuthenticated ? (
                      <Button
                        type="button"
                        size="sm"
                        data-ocid="position_tracker.empty_add_button"
                        onClick={() => setWalletDialog(true)}
                      >
                        Add wallet
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        data-ocid="position_tracker.empty_sign_in_button"
                        onClick={auth.login}
                        disabled={auth.isLoggingIn}
                      >
                        {auth.isLoggingIn ? "Signing in\u2026" : "Sign in"}
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      data-ocid="position_tracker.empty_demo_button"
                      onClick={() => setDemoMode(true)}
                    >
                      Preview demo data
                    </Button>
                  </div>
                }
              />
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            {savedQuery.isError && !demoMode && (
              <div className="px-4 pt-3">
                <ErrorState
                  title="Could not load your saved positions"
                  message={savedQuery.error.message}
                  onRetry={() => void savedQuery.refetch()}
                />
              </div>
            )}
            <table
              className="w-full min-w-[960px] border-collapse text-[13px]"
              data-ocid="position_tracker.table"
            >
              <thead className="sticky top-0 bg-muted/40">
                <tr className="border-b border-border">
                  <th className={cn(columnHeader, "pl-4 text-left")}>Pool</th>
                  <th className={cn(columnHeader, "text-left")}>Venue</th>
                  <th className={cn(columnHeader, "text-right")}>Current</th>
                  <th className={cn(columnHeader, "text-right")}>Initial</th>
                  <th className={cn(columnHeader, "text-right")}>Fees</th>
                  <th className={cn(columnHeader, "text-right")}>IL</th>
                  <th className={cn(columnHeader, "text-right")}>APY</th>
                  <th className={cn(columnHeader, "text-right")}>P&amp;L</th>
                  <th className={cn(columnHeader, "pr-4 text-right")}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <PositionRow
                    key={row.key}
                    row={row}
                    index={i}
                    onSave={(r) => setPositionDialog({ mode: "save", row: r })}
                    onEdit={(r) => setPositionDialog({ mode: "edit", row: r })}
                    onRemove={setRemoveTarget}
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

// ── Wallet chip ──────────────────────────────────────────────────────────────
function WalletChip({
  label,
  chain,
  title,
  active,
  onSelect,
  onRemove,
  removing,
}: {
  label: string;
  chain: string;
  title: string;
  active: boolean;
  onSelect: () => void;
  onRemove?: () => void;
  removing?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-full border py-1 pl-2 pr-1.5 text-[11px] transition-colors",
        active
          ? "border-primary/60 bg-primary/10 text-primary"
          : "border-border bg-muted/40 text-muted-foreground",
      )}
    >
      <button
        type="button"
        data-ocid="tracked_wallet.select_button"
        aria-pressed={active}
        title={title}
        onClick={onSelect}
        className="flex items-center gap-1.5 font-mono"
      >
        <span className="text-[9px] font-bold uppercase tracking-wider opacity-70">
          {chain}
        </span>
        {label}
      </button>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove wallet ${label}`}
          data-ocid="tracked_wallet.remove_button"
          disabled={removing}
          onClick={onRemove}
          className="rounded-full p-0.5 transition-colors hover:text-destructive disabled:opacity-50"
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      )}
    </div>
  );
}
