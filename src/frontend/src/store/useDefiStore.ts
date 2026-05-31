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

/** Per-section polling intervals (seconds). */
export type SectionPollingKey =
  | "pools"
  | "poolComparison"
  | "apyTracker"
  | "dashboard";

const DEFAULT_SECTION_POLLING: Record<SectionPollingKey, PollingInterval> = {
  pools: 30,
  poolComparison: 30,
  apyTracker: 60,
  dashboard: 30,
};

const LS_SECTION_POLLING = "defi_section_polling";

function readSectionPolling(): Record<SectionPollingKey, PollingInterval> {
  const raw = safeLocalStorage.get(LS_SECTION_POLLING);
  if (!raw) return { ...DEFAULT_SECTION_POLLING };
  try {
    const parsed = JSON.parse(raw) as Record<
      SectionPollingKey,
      PollingInterval
    >;
    // Validate each key
    const validIntervals = new Set<PollingInterval>([10, 30, 60]);
    const merged = { ...DEFAULT_SECTION_POLLING };
    for (const k of Object.keys(
      DEFAULT_SECTION_POLLING,
    ) as SectionPollingKey[]) {
      if (validIntervals.has(parsed[k])) merged[k] = parsed[k];
    }
    return merged;
  } catch {
    return { ...DEFAULT_SECTION_POLLING };
  }
}

interface DefiStore {
  globalSearch: string;
  setGlobalSearch: (q: string) => void;
  onboardingDone: boolean;
  setOnboardingDone: (done: boolean) => void;
  dismissedErrors: string[];
  dismissError: (id: string) => void;
  selectedProtocol: Protocol | "all";
  sortConfig: SortConfig;
  pollingInterval: PollingInterval;
  selectedPoolIds: string[];
  sidebarCollapsed: boolean;
  /** Per-section configurable polling intervals */
  sectionPollingIntervals: Record<SectionPollingKey, PollingInterval>;
  /** Unix timestamp (ms) per data source of last successful fetch */
  lastUpdatedBySource: Record<string, number>;
  setSelectedProtocol: (protocol: Protocol | "all") => void;
  setSortConfig: (config: SortConfig) => void;
  setPollingInterval: (interval: PollingInterval) => void;
  setSectionPollingInterval: (
    section: SectionPollingKey,
    interval: PollingInterval,
  ) => void;
  setLastUpdatedBySource: (source: string, timestamp: number) => void;
  togglePoolSelection: (poolId: string) => void;
  clearPoolSelection: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useDefiStore = create<DefiStore>((set) => ({
  globalSearch: "",
  setGlobalSearch: (q) => set({ globalSearch: q }),

  onboardingDone: (() => {
    try {
      return localStorage.getItem("defi_tour_completed") === "1";
    } catch {
      return false;
    }
  })(),
  setOnboardingDone: (done) => {
    set({ onboardingDone: done });
    if (done) safeLocalStorage.set("defi_tour_completed", "1");
    else safeLocalStorage.remove("defi_tour_completed");
  },

  dismissedErrors: [],
  dismissError: (id) =>
    set((state) => ({ dismissedErrors: [...state.dismissedErrors, id] })),

  selectedProtocol: "all",
  sortConfig: { key: "tvl", direction: "desc" },
  pollingInterval: readPollingInterval(),
  selectedPoolIds: [],
  sidebarCollapsed: readSidebarCollapsed(),
  sectionPollingIntervals: readSectionPolling(),
  lastUpdatedBySource: {},

  setSelectedProtocol: (protocol) => set({ selectedProtocol: protocol }),

  setSortConfig: (config) => set({ sortConfig: config }),

  setPollingInterval: (interval) => {
    set({ pollingInterval: interval });
    safeLocalStorage.set(LS_POLLING_INTERVAL, JSON.stringify(interval));
  },

  setSectionPollingInterval: (section, interval) =>
    set((state) => {
      const next = { ...state.sectionPollingIntervals, [section]: interval };
      safeLocalStorage.set(LS_SECTION_POLLING, JSON.stringify(next));
      return { sectionPollingIntervals: next };
    }),

  setLastUpdatedBySource: (source, timestamp) =>
    set((state) => ({
      lastUpdatedBySource: {
        ...state.lastUpdatedBySource,
        [source]: timestamp,
      },
    })),

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
