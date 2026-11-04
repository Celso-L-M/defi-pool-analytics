import type { Protocol, SortConfig } from "@/types/defi";
import { create } from "zustand";

// ─── Safe localStorage helper ─────────────────────────────────────────────────
// Wraps every localStorage call so the app keeps working in incognito mode,
// when cookies/storage are blocked, or when the storage quota is exceeded.

export const safeLocalStorage = {
  get: (key: string, fallback: string | null = null): string | null => {
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set: (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn("[Store] localStorage.setItem failed:", e);
    }
  },
  remove: (key: string): void => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

// ─── Persistence helpers ──────────────────────────────────────────────────────

const LS_POLLING_INTERVAL = "defi_polling_interval";
const LS_SIDEBAR_COLLAPSED = "defi_sidebar_collapsed";
const LS_THEME = "defi_theme";
const LS_AUTO_REFRESH = "defi_auto_refresh";

export type ThemePreference = "dark" | "light" | "auto";

function readTheme(): ThemePreference {
  const raw = safeLocalStorage.get(LS_THEME);
  return raw === "light" || raw === "auto" ? raw : "dark";
}

function readAutoRefresh(): boolean {
  return safeLocalStorage.get(LS_AUTO_REFRESH) !== "false";
}

function readPollingInterval(): PollingInterval {
  const raw = safeLocalStorage.get(LS_POLLING_INTERVAL);
  if (!raw) return 30;
  try {
    const parsed = JSON.parse(raw) as number;
    if (parsed === 10 || parsed === 30 || parsed === 60) return parsed;
    console.warn("[Store] Invalid pollingInterval in localStorage:", parsed);
    return 30;
  } catch (e) {
    console.warn(
      "[Store] Failed to parse pollingInterval from localStorage:",
      e,
    );
    return 30;
  }
}

function readSidebarCollapsed(): boolean {
  const raw = safeLocalStorage.get(LS_SIDEBAR_COLLAPSED);
  if (!raw) return false;
  try {
    return JSON.parse(raw) as boolean;
  } catch (e) {
    console.warn(
      "[Store] Failed to parse sidebarCollapsed from localStorage:",
      e,
    );
    return false;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type PollingInterval = 10 | 30 | 60;

interface DefiStore {
  selectedProtocol: Protocol | "all";
  sortConfig: SortConfig;
  pollingInterval: PollingInterval;
  selectedPoolIds: string[];
  sidebarCollapsed: boolean;
  /** Mirrors the backend settings when signed in; local copy otherwise. */
  theme: ThemePreference;
  autoRefresh: boolean;
  setTheme: (theme: ThemePreference) => void;
  setAutoRefresh: (enabled: boolean) => void;
  setSelectedProtocol: (protocol: Protocol | "all") => void;
  setSortConfig: (config: SortConfig) => void;
  setPollingInterval: (interval: PollingInterval) => void;
  togglePoolSelection: (poolId: string) => void;
  clearPoolSelection: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useDefiStore = create<DefiStore>((set) => ({
  selectedProtocol: "all",
  sortConfig: { key: "tvl", direction: "desc" },
  pollingInterval: readPollingInterval(),
  selectedPoolIds: [],
  sidebarCollapsed: readSidebarCollapsed(),
  theme: readTheme(),
  autoRefresh: readAutoRefresh(),

  setTheme: (theme) => {
    set({ theme });
    safeLocalStorage.set(LS_THEME, theme);
  },

  setAutoRefresh: (enabled) => {
    set({ autoRefresh: enabled });
    safeLocalStorage.set(LS_AUTO_REFRESH, String(enabled));
  },

  setSelectedProtocol: (protocol) => set({ selectedProtocol: protocol }),

  setSortConfig: (config) => set({ sortConfig: config }),

  setPollingInterval: (interval) => {
    set({ pollingInterval: interval });
    safeLocalStorage.set(LS_POLLING_INTERVAL, JSON.stringify(interval));
  },

  togglePoolSelection: (poolId) =>
    set((state) => {
      const isSelected = state.selectedPoolIds.includes(poolId);
      if (isSelected) {
        return {
          selectedPoolIds: state.selectedPoolIds.filter((id) => id !== poolId),
        };
      }
      if (state.selectedPoolIds.length >= 4) {
        return { selectedPoolIds: [...state.selectedPoolIds.slice(1), poolId] };
      }
      return { selectedPoolIds: [...state.selectedPoolIds, poolId] };
    }),

  clearPoolSelection: () => set({ selectedPoolIds: [] }),

  setSidebarCollapsed: (collapsed) => {
    set({ sidebarCollapsed: collapsed });
    safeLocalStorage.set(LS_SIDEBAR_COLLAPSED, JSON.stringify(collapsed));
  },

  toggleSidebar: () =>
    set((state) => {
      const next = !state.sidebarCollapsed;
      safeLocalStorage.set(LS_SIDEBAR_COLLAPSED, JSON.stringify(next));
      return { sidebarCollapsed: next };
    }),
}));
