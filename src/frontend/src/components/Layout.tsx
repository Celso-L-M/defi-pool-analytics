import { AIAssistant } from "@/components/AIAssistant";
import { OnboardingTour } from "@/components/OnboardingTour";
import { Sidebar } from "@/components/Sidebar";
import { cn } from "@/lib/utils";
import { useDefiStore } from "@/store/useDefiStore";
import {
  Link,
  useLocation,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import {
  BarChart2,
  Calculator,
  GitCompare,
  LayoutDashboard,
  Search,
  TrendingUp,
  Waves,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

const BOTTOM_NAV_ITEMS = [
  {
    path: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
    ocid: "bottom_nav.dashboard",
  },
  { path: "/pools", label: "Pools", icon: Waves, ocid: "bottom_nav.pools" },
  {
    path: "/apy-tracker",
    label: "APY",
    icon: TrendingUp,
    ocid: "bottom_nav.apy",
  },
  {
    path: "/il-calculator",
    label: "IL Calc",
    icon: Calculator,
    ocid: "bottom_nav.il",
  },
  {
    path: "/pool-comparison",
    label: "Compare",
    icon: GitCompare,
    ocid: "bottom_nav.comparison",
  },
  {
    path: "/derivatives",
    label: "Deriv",
    icon: BarChart2,
    ocid: "bottom_nav.derivatives",
  },
];

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { globalSearch, setGlobalSearch } = useDefiStore();
  const [shortcutBadge, setShortcutBadge] = useState<string | null>(null);

  // Scroll to top on every route change
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname drives scroll reset
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  // Keyboard shortcuts Alt+1–6
  useEffect(() => {
    const ROUTE_MAP: Record<string, { path: string; label: string }> = {
      "1": { path: "/", label: "Dashboard" },
      "2": { path: "/pools", label: "Pool Explorer" },
      "3": { path: "/apy-tracker", label: "APY Tracker" },
      "4": { path: "/il-calculator", label: "IL Calculator" },
      "5": { path: "/pool-comparison", label: "Pool Comparison" },
      "6": { path: "/derivatives", label: "Derivatives" },
    };
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      const entry = ROUTE_MAP[e.key];
      if (!entry) return;
      e.preventDefault();
      navigate({
        to: entry.path as
          | "/"
          | "/pools"
          | "/apy-tracker"
          | "/il-calculator"
          | "/pool-comparison"
          | "/derivatives",
      });
      setShortcutBadge(`Alt+${e.key} → ${entry.label}`);
      setTimeout(() => setShortcutBadge(null), 1800);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [navigate]);

  return (
    <div
      className="flex h-screen w-full overflow-hidden"
      style={{ background: "#0D0D0D" }}
    >
      {/* Desktop sidebar — sticky, hidden on mobile */}
      <div className="hidden md:flex flex-shrink-0 sticky top-0 h-screen self-start transition-smooth">
        <Sidebar />
      </div>

      {/* Main content column */}
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        {/* Global header bar with search */}
        <header
          data-ocid="layout.header"
          className="hidden md:flex flex-shrink-0 items-center gap-3 px-4 py-2.5 border-b"
          style={{
            background: "rgba(8, 8, 14, 0.92)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            borderColor: "rgba(0,163,255,0.1)",
            boxShadow: "0 1px 0 rgba(0,163,255,0.06)",
          }}
        >
          <div className="relative flex-1 max-w-lg">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
              style={{ color: "rgba(0,163,255,0.5)" }}
            />
            <input
              data-ocid="layout.search_input"
              type="text"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              placeholder="Search pools by name or pair..."
              className="w-full bg-transparent rounded-md pl-8 pr-3 py-1.5 text-[11.5px] font-mono outline-none transition-all duration-200"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(0,163,255,0.18)",
                color: "rgba(255,255,255,0.85)",
              }}
              onFocus={(e) => {
                (e.currentTarget as HTMLInputElement).style.borderColor =
                  "rgba(0,163,255,0.55)";
                (e.currentTarget as HTMLInputElement).style.boxShadow =
                  "0 0 0 2px rgba(0,163,255,0.12), 0 0 12px rgba(0,163,255,0.1)";
              }}
              onBlur={(e) => {
                (e.currentTarget as HTMLInputElement).style.borderColor =
                  "rgba(0,163,255,0.18)";
                (e.currentTarget as HTMLInputElement).style.boxShadow = "";
              }}
            />
          </div>
          <div
            className="text-[9px] font-mono uppercase tracking-[0.15em] flex-shrink-0"
            style={{ color: "rgba(0,163,255,0.35)" }}
          >
            Alt+1–6 shortcuts
          </div>
        </header>

        {/* Page content */}
        <main
          data-ocid="layout.main"
          className="flex-1 overflow-y-auto overflow-x-hidden transition-smooth"
          style={{
            background: "#0D0D0D",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
        >
          <div className="pb-16 md:pb-0">{children}</div>
        </main>

        {/* Footer — desktop only */}
        <footer
          className="hidden md:flex flex-shrink-0 py-2 px-4 items-center justify-center border-t"
          style={{
            background: "oklch(0.06 0.02 260 / 0.95)",
            borderColor: "oklch(0.7 0.2 210 / 0.12)",
            backdropFilter: "blur(12px)",
          }}
        >
          <p
            className="text-[10px] font-mono uppercase tracking-[0.12em]"
            style={{ color: "rgba(255,255,255,0.3)" }}
          >
            &copy; {new Date().getFullYear()}. Built with love using{" "}
            <a
              href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(typeof window !== "undefined" ? window.location.hostname : "")}`}
              target="_blank"
              rel="noreferrer"
              className="transition-smooth hover:underline"
              style={{ color: "rgba(0,163,255,0.75)" }}
            >
              caffeine.ai
            </a>
          </p>
        </footer>
      </div>

      {/* Mobile Bottom Navigation — only on mobile (<md) */}
      <nav
        data-ocid="bottom_nav.panel"
        className="fixed bottom-0 left-0 right-0 z-40 md:hidden"
        style={{
          background: "rgba(10, 10, 16, 0.92)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderTop: "1px solid rgba(0,163,255,0.15)",
          boxShadow:
            "0 -4px 24px rgba(0,0,0,0.4), 0 -1px 0 rgba(0,163,255,0.08)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
        aria-label="Main navigation"
      >
        <div className="flex items-stretch h-16">
          {BOTTOM_NAV_ITEMS.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                data-ocid={item.ocid}
                className="relative flex flex-1 flex-col items-center justify-center gap-0.5 min-w-0 min-h-[44px] transition-smooth"
                style={{
                  color: isActive ? "#00A3FF" : "rgba(255,255,255,0.35)",
                }}
              >
                {/* Active top indicator */}
                {isActive && (
                  <span
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] rounded-full"
                    style={{
                      background: "#00A3FF",
                      boxShadow: "0 0 8px 2px rgba(0,163,255,0.6)",
                    }}
                  />
                )}
                <div
                  className="flex items-center justify-center w-7 h-7"
                  style={
                    isActive
                      ? { filter: "drop-shadow(0 0 6px rgba(0,163,255,0.7))" }
                      : {}
                  }
                >
                  <Icon className="w-4.5 h-4.5 flex-shrink-0" />
                </div>
                <span
                  className="uppercase font-mono font-semibold tracking-[0.06em] truncate max-w-full px-0.5"
                  style={{ fontSize: "8px" }}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* AI Assistant floating panel */}
      <AIAssistant />

      {/* Onboarding tour — rendered once at layout level */}
      <OnboardingTour />

      {/* Keyboard shortcut toast badge */}
      {shortcutBadge && (
        <div
          data-ocid="layout.shortcut_toast"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[9998] px-4 py-2 rounded-full font-mono text-xs font-semibold pointer-events-none animate-in fade-in zoom-in-90 duration-150"
          style={{
            background: "rgba(0,163,255,0.18)",
            border: "1px solid rgba(0,163,255,0.45)",
            color: "#00A3FF",
            backdropFilter: "blur(12px)",
            boxShadow: "0 0 16px rgba(0,163,255,0.25)",
          }}
        >
          {shortcutBadge}
        </div>
      )}
    </div>
  );
}
