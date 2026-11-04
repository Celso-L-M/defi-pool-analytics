import {
  BarChart2,
  Bell,
  Calculator,
  GitCompare,
  LayoutDashboard,
  Settings,
  Sprout,
  TrendingUp,
  Wallet,
  Wallet2,
  Waves,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  path: string;
  label: string;
  /** Short label for the mobile bar. */
  shortLabel: string;
  icon: LucideIcon;
  ocid: string;
  /** True when the item sits in the mobile bottom bar; others go to More. */
  primary: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  {
    path: "/",
    label: "Dashboard",
    shortLabel: "Home",
    icon: LayoutDashboard,
    ocid: "nav.dashboard_link",
    primary: true,
  },
  {
    path: "/pools",
    label: "Pool Explorer",
    shortLabel: "Pools",
    icon: Waves,
    ocid: "nav.pools_link",
    primary: true,
  },
  {
    path: "/apy-tracker",
    label: "APY Tracker",
    shortLabel: "APY",
    icon: TrendingUp,
    ocid: "nav.apy_link",
    primary: false,
  },
  {
    path: "/il-calculator",
    label: "IL Calculator",
    shortLabel: "IL Calc",
    icon: Calculator,
    ocid: "nav.il_link",
    primary: false,
  },
  {
    path: "/pool-comparison",
    label: "Pool Comparison",
    shortLabel: "Compare",
    icon: GitCompare,
    ocid: "nav.comparison_link",
    primary: false,
  },
  {
    path: "/derivatives",
    label: "Derivatives",
    shortLabel: "Deriv",
    icon: BarChart2,
    ocid: "nav.derivatives_link",
    primary: false,
  },
  {
    path: "/position-tracker",
    label: "Position Tracker",
    shortLabel: "Tracker",
    icon: Wallet2,
    ocid: "nav.position_tracker_link",
    primary: false,
  },
  {
    path: "/yield-farming",
    label: "Yield Farming",
    shortLabel: "Farms",
    icon: Sprout,
    ocid: "nav.yield_farming_link",
    primary: false,
  },
  {
    path: "/alerts",
    label: "Alerts",
    shortLabel: "Alerts",
    icon: Bell,
    ocid: "nav.alerts_link",
    primary: true,
  },
  {
    path: "/portfolio",
    label: "Portfolio",
    shortLabel: "Portfolio",
    icon: Wallet,
    ocid: "nav.portfolio_link",
    primary: true,
  },
  {
    path: "/settings",
    label: "Settings",
    shortLabel: "Settings",
    icon: Settings,
    ocid: "nav.settings_link",
    primary: false,
  },
];

export function isActivePath(current: string, path: string): boolean {
  return path === "/"
    ? current === "/"
    : current === path || current.startsWith(`${path}/`);
}
