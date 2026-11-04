import type { ImportBatch, PositionInput } from "@/backend";
import { MOCK_POOLS } from "@/data/mockData";
import { useAuth } from "@/hooks/useAuth";
import { useImportLocalData } from "@/hooks/useQueries";
import { safeLocalStorage } from "@/store/useDefiStore";
import { useCallback, useMemo, useState } from "react";

const WATCHLIST_KEYS = ["defi_watchlist", "watchlist"];
const WALLET_KEYS = ["trackedWallets"];
const POSITION_KEYS = ["defi_positions", "positions"];
const DISMISS_PREFIX = "defi_import_dismissed_";

function readArray(keys: string[]): unknown[] {
  const out: unknown[] = [];
  for (const key of keys) {
    const raw = safeLocalStorage.get(key);
    if (!raw) continue;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) out.push(...parsed);
    } catch {
      // Ignore unreadable legacy data.
    }
  }
  return out;
}

function walletChain(address: string): string {
  if (/^0x[0-9a-fA-F]{40}$/.test(address)) return "ETH";
  if (/^[0-9a-fA-F]{64}$/.test(address)) return "ICP";
  if (/^[a-z0-9]{5}(-[a-z0-9]{5}){4,}$/i.test(address)) return "ICP";
  return "SOL";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Reads the watchlist, tracked wallets and positions of the earlier version. */
export function readLocalBatch(): ImportBatch {
  const watchlist = readArray(WATCHLIST_KEYS)
    .filter((v): v is string => typeof v === "string")
    .map((poolId) => {
      const pool = MOCK_POOLS.find((p) => p.id === poolId);
      return {
        poolId,
        displayName: pool?.name ?? poolId,
        symbol: pool ? `${pool.token0}-${pool.token1}` : poolId,
        project: pool?.protocol ?? "",
        chain: pool?.chain ?? "",
      };
    });

  const wallets = readArray(WALLET_KEYS)
    .filter((v): v is string => typeof v === "string")
    .map((address) => ({ address, chain: walletChain(address) }));

  const positions: PositionInput[] = [];
  for (const item of readArray(POSITION_KEYS)) {
    if (!isRecord(item)) continue;
    const poolId = String(item.poolId ?? "");
    const amount = Number(item.amountUsd ?? item.entryValueUSD ?? 0);
    if (!poolId || !Number.isFinite(amount) || amount <= 0) continue;
    const when = Date.parse(String(item.entryDate ?? ""));
    positions.push({
      poolId,
      displayName: String(item.displayName ?? item.poolName ?? poolId),
      symbol: String(item.symbol ?? ""),
      amountUsd: amount,
      entryTimestamp:
        BigInt(Number.isNaN(when) ? Date.now() : when) * 1_000_000n,
      notes: typeof item.notes === "string" ? item.notes : undefined,
    });
  }
  return { watchlist, wallets, positions };
}

function localCount(batch: ImportBatch): number {
  return batch.watchlist.length + batch.wallets.length + batch.positions.length;
}

/** Offer to move the earlier local-only data into the signed-in account. */
export function useLocalImportOffer() {
  const { isAuthenticated, principalText } = useAuth();
  const importMutation = useImportLocalData();
  const dismissKey = `${DISMISS_PREFIX}${principalText}`;
  const [version, setVersion] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: version forces a re-read after import or dismiss
  const batch = useMemo(
    () => (isAuthenticated ? readLocalBatch() : null),
    [isAuthenticated, version],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: version forces a re-read after dismiss
  const dismissed = useMemo(
    () => safeLocalStorage.get(dismissKey) === "1",
    [dismissKey, version],
  );
  const count = batch ? localCount(batch) : 0;

  const dismiss = useCallback(() => {
    safeLocalStorage.set(dismissKey, "1");
    setVersion((v) => v + 1);
  }, [dismissKey]);

  const importNow = useCallback(
    (onDone?: (added: number) => void) => {
      if (!batch) return;
      importMutation.mutate(batch, {
        onSuccess: (summary) => {
          for (const key of [
            ...WATCHLIST_KEYS,
            ...WALLET_KEYS,
            ...POSITION_KEYS,
          ]) {
            safeLocalStorage.remove(key);
          }
          setVersion((v) => v + 1);
          onDone?.(
            Number(
              summary.watchlistAdded +
                summary.walletsAdded +
                summary.positionsAdded,
            ),
          );
        },
      });
    },
    [batch, importMutation],
  );

  return {
    shouldOffer: isAuthenticated && count > 0 && !dismissed,
    count,
    dismiss,
    importNow,
    isImporting: importMutation.isPending,
    error: importMutation.error,
  };
}
