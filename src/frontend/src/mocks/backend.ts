import type { backendInterface } from "../backend";
import { Theme } from "../backend";

export const mockBackend = {
  getSettings: async () => ({
    theme: Theme.dark,
    emailAlertsEnabled: false,
    autoRefreshEnabled: true,
  }),
  hasVerifiedEmail: async () => false,
  listWatchlist: async () => [],
  listPositions: async () => [],
  listWallets: async () => [],
  listAlertRules: async () => [],
  listAlertHistory: async () => [],
  unreadAlertCount: async () => BigInt(0),
} satisfies Pick<
  backendInterface,
  | "getSettings"
  | "hasVerifiedEmail"
  | "listWatchlist"
  | "listPositions"
  | "listWallets"
  | "listAlertRules"
  | "listAlertHistory"
  | "unreadAlertCount"
>;
