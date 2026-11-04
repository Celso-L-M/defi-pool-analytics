import {
  type AlertRuleInput,
  type ApiError,
  type EvaluationSummary,
  type ImportBatch,
  type PositionInput,
  type Settings,
  Theme,
  type TrackedWallet,
  type WatchlistEntry,
  type backendInterface,
  createActor,
} from "@/backend";
import { useAuth } from "@/hooks/useAuth";
import { type ThemePreference, useDefiStore } from "@/store/useDefiStore";
import { useActor } from "@caffeineai/core-infrastructure";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

// ─── Shared plumbing ─────────────────────────────────────────────────────────

type ApiResult<T> =
  | { __kind__: "ok"; ok: T }
  | { __kind__: "err"; err: ApiError };

function describeApiError(error: ApiError): string {
  switch (error.__kind__) {
    case "notFound":
      return "That item no longer exists.";
    case "invalid":
      return error.invalid;
    case "limitReached":
      return `Limit reached (${error.limitReached.toString()} allowed).`;
  }
}

function unwrap<T>(result: ApiResult<T>): T {
  if (result.__kind__ === "ok") return result.ok;
  throw new Error(describeApiError(result.err));
}

function useBackend() {
  const { actor, isFetching } = useActor(createActor);
  const { isAuthenticated, principalText } = useAuth();
  return {
    actor,
    enabled: !!actor && !isFetching && isAuthenticated,
    scope: principalText,
  };
}

function useBackendQuery<T>(
  name: string,
  load: (actor: backendInterface) => Promise<T>,
  refetchInterval?: number,
) {
  const { actor, enabled, scope } = useBackend();
  return useQuery({
    queryKey: ["backend", scope, name],
    queryFn: async () => {
      if (!actor) throw new Error("Backend is not ready");
      return load(actor);
    },
    enabled,
    refetchInterval: enabled ? refetchInterval : undefined,
  });
}

function useBackendMutation<V, R>(
  run: (actor: backendInterface, variables: V) => Promise<R>,
  invalidate: string[],
  after?: (result: R, variables: V) => void,
) {
  const { actor, scope } = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (variables: V) => {
      if (!actor) throw new Error("Backend is not ready");
      return run(actor, variables);
    },
    onSuccess: (result, variables) => {
      for (const name of invalidate) {
        void queryClient.invalidateQueries({
          queryKey: ["backend", scope, name],
        });
      }
      after?.(result, variables);
    },
  });
}

const THEME_FROM_BACKEND: Record<Theme, ThemePreference> = {
  [Theme.dark]: "dark",
  [Theme.light]: "light",
  [Theme.auto]: "auto",
};

/** Maps a store theme preference to the backend Theme variant. */
export function themeToBackend(theme: ThemePreference): Theme {
  return theme === "light"
    ? Theme.light
    : theme === "auto"
      ? Theme.auto
      : Theme.dark;
}

const ALERT_KEYS = ["alertRules", "alertHistory", "unreadAlerts"];

// ─── Settings ────────────────────────────────────────────────────────────────

export function useSettings() {
  return useBackendQuery("settings", (a) => a.getSettings());
}

export function useUpdateSettings() {
  const setTheme = useDefiStore((s) => s.setTheme);
  const setAutoRefresh = useDefiStore((s) => s.setAutoRefresh);
  return useBackendMutation(
    async (actor, value: Settings) => {
      await actor.updateSettings(value);
      return value;
    },
    ["settings"],
    (value) => {
      setTheme(THEME_FROM_BACKEND[value.theme]);
      setAutoRefresh(value.autoRefreshEnabled);
    },
  );
}

/** Copies backend settings into the local store whenever they load. */
export function useSettingsSync() {
  const { data } = useSettings();
  const setTheme = useDefiStore((s) => s.setTheme);
  const setAutoRefresh = useDefiStore((s) => s.setAutoRefresh);
  useEffect(() => {
    if (!data) return;
    setTheme(THEME_FROM_BACKEND[data.theme]);
    setAutoRefresh(data.autoRefreshEnabled);
  }, [data, setTheme, setAutoRefresh]);
}

export function useHasVerifiedEmail() {
  return useBackendQuery("verifiedEmail", (a) => a.hasVerifiedEmail());
}

// ─── Watchlist ───────────────────────────────────────────────────────────────

export function useWatchlist() {
  return useBackendQuery("watchlist", (a) => a.listWatchlist());
}

export function useAddToWatchlist() {
  return useBackendMutation(
    async (a, entry: WatchlistEntry) => unwrap(await a.addToWatchlist(entry)),
    ["watchlist"],
  );
}

export function useRemoveFromWatchlist() {
  return useBackendMutation(
    (a, poolId: string) => a.removeFromWatchlist(poolId),
    ["watchlist"],
  );
}

// ─── Positions ───────────────────────────────────────────────────────────────

export function usePositions() {
  return useBackendQuery("positions", (a) => a.listPositions());
}

export function useAddPosition() {
  return useBackendMutation(
    async (a, input: PositionInput) => unwrap(await a.addPosition(input)),
    ["positions"],
  );
}

export function useUpdatePosition() {
  return useBackendMutation(
    async (a, args: { id: bigint; input: PositionInput }) =>
      unwrap(await a.updatePosition(args.id, args.input)),
    ["positions"],
  );
}

export function useRemovePosition() {
  return useBackendMutation(
    (a, id: bigint) => a.removePosition(id),
    ["positions"],
  );
}

// ─── Wallets ─────────────────────────────────────────────────────────────────

export function useWallets() {
  return useBackendQuery("wallets", (a) => a.listWallets());
}

export function useAddWallet() {
  return useBackendMutation(
    async (a, wallet: TrackedWallet) => unwrap(await a.addWallet(wallet)),
    ["wallets"],
  );
}

export function useRemoveWallet() {
  return useBackendMutation(
    (a, wallet: TrackedWallet) => a.removeWallet(wallet.chain, wallet.address),
    ["wallets"],
  );
}

// ─── Import and delete ───────────────────────────────────────────────────────

export function useImportLocalData() {
  return useBackendMutation(
    (a, batch: ImportBatch) => a.importLocalData(batch),
    ["watchlist", "positions", "wallets"],
  );
}

export function useDeleteAllMyData() {
  const { actor, scope } = useBackend();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!actor) throw new Error("Backend is not ready");
      await actor.deleteAllMyData();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["backend", scope] });
    },
  });
}

// ─── Alert rules ─────────────────────────────────────────────────────────────

export function useAlertRules() {
  return useBackendQuery("alertRules", (a) => a.listAlertRules());
}

export function useCreateAlertRule() {
  return useBackendMutation(
    async (a, input: AlertRuleInput) => unwrap(await a.createAlertRule(input)),
    ALERT_KEYS,
  );
}

export function useUpdateAlertRule() {
  return useBackendMutation(
    async (a, args: { id: bigint; input: AlertRuleInput }) =>
      unwrap(await a.updateAlertRule(args.id, args.input)),
    ALERT_KEYS,
  );
}

export function useSetAlertRuleEnabled() {
  return useBackendMutation(
    async (a, args: { id: bigint; enabled: boolean }) =>
      unwrap(await a.setAlertRuleEnabled(args.id, args.enabled)),
    ALERT_KEYS,
  );
}

export function useDeleteAlertRule() {
  return useBackendMutation(
    (a, id: bigint) => a.deleteAlertRule(id),
    ALERT_KEYS,
  );
}

export function useEvaluateAlertsNow() {
  return useBackendMutation<void, EvaluationSummary>(
    (a) => a.evaluateMyAlertsNow(),
    ALERT_KEYS,
  );
}

// ─── Alert history ───────────────────────────────────────────────────────────

export function useAlertHistory() {
  return useBackendQuery("alertHistory", (a) => a.listAlertHistory(), 60_000);
}

export function useUnreadAlertCount() {
  return useBackendQuery("unreadAlerts", (a) => a.unreadAlertCount(), 60_000);
}

export function useMarkAlertRead() {
  return useBackendMutation(
    (a, id: bigint) => a.markAlertRead(id),
    ["alertHistory", "unreadAlerts"],
  );
}

export function useMarkAllAlertsRead() {
  return useBackendMutation<void, void>(
    (a) => a.markAllAlertsRead(),
    ["alertHistory", "unreadAlerts"],
  );
}

export function useClearAlertHistory() {
  return useBackendMutation<void, void>(
    (a) => a.clearAlertHistory(),
    ["alertHistory", "unreadAlerts"],
  );
}
