import { PROTOCOL_METADATA } from "@/data/mockData";
import { cn } from "@/lib/utils";
import { useDefiStore } from "@/store/useDefiStore";
import { Link, useLocation } from "@tanstack/react-router";
import {
  BarChart2,
  Calculator,
  ChevronLeft,
  ChevronRight,
  GitCompare,
  LayoutDashboard,
  TrendingUp,
  Waves,
  Zap,
} from "lucide-react";

const NAV_ITEMS = [
  {
    path: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
    ocid: "nav.dashboard_link",
  },
  {
    path: "/pools",
    label: "Pool Explorer",
    icon: Waves,
    ocid: "nav.pools_link",
  },
  {
    path: "/apy-tracker",
    label: "APY Tracker",
    icon: TrendingUp,
    ocid: "nav.apy_link",
  },
  {
    path: "/il-calculator",
    label: "IL Calculator",
    icon: Calculator,
    ocid: "nav.il_link",
  },
  {
    path: "/pool-comparison",
    label: "Pool Comparison",
    icon: GitCompare,
    ocid: "nav.comparison_link",
  },
  {
    path: "/derivatives",
    label: "Derivatives",
    icon: BarChart2,
    ocid: "nav.derivatives_link",
  },
];

const PROTOCOLS = Object.values(PROTOCOL_METADATA);

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useDefiStore();
  const location = useLocation();

  return (
    <aside
      data-ocid="sidebar.panel"
      className={cn(
        "flex flex-col h-full border-r transition-smooth overflow-hidden relative",
        "bg-[oklch(0.06_0.02_260/0.95)] backdrop-blur-xl",
        "border-[oklch(0.7_0.2_210/0.15)]",
        sidebarCollapsed ? "w-16" : "w-64",
      )}
      style={{
        background:
          "linear-gradient(180deg, oklch(0.07 0.02 260 / 0.97) 0%, oklch(0.05 0.01 260 / 0.95) 100%)",
        backdropFilter: "blur(20px)",
        boxShadow:
          "4px 0 24px -4px rgba(0,163,255,0.08), inset -1px 0 0 oklch(0.7 0.2 210 / 0.12)",
      }}
    >
      {/* Subtle vertical glow strip */}
      <div
        className="absolute right-0 top-0 bottom-0 w-px"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, rgba(0,163,255,0.25) 40%, rgba(0,255,136,0.15) 70%, transparent 100%)",
        }}
      />

      {/* Logo */}
      <div
        className={cn(
          "flex items-center border-b flex-shrink-0",
          "border-[oklch(0.7_0.2_210/0.12)]",
          sidebarCollapsed ? "justify-center p-4" : "justify-between px-4 py-4",
        )}
      >
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{
                background:
                  "linear-gradient(135deg, rgba(0,163,255,0.25) 0%, rgba(0,163,255,0.1) 100%)",
                border: "1px solid rgba(0,163,255,0.35)",
                boxShadow:
                  "0 0 12px rgba(0,163,255,0.3), inset 0 1px 0 rgba(255,255,255,0.05)",
              }}
            >
              <Zap
                className="w-4 h-4"
                style={{
                  color: "#00A3FF",
                  filter: "drop-shadow(0 0 4px rgba(0,163,255,0.8))",
                }}
              />
            </div>
            <div className="min-w-0">
              <span
                className="font-display font-bold text-sm block tracking-tight"
                style={{
                  color: "rgba(255,255,255,0.95)",
                  letterSpacing: "-0.01em",
                }}
              >
                DeFi Analytics
              </span>
              <span
                className="text-[9px] uppercase tracking-[0.15em] font-mono block"
                style={{ color: "rgba(0,163,255,0.7)" }}
              >
                Terminal
              </span>
            </div>
          </div>
        )}
        {sidebarCollapsed && (
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{
              background:
                "linear-gradient(135deg, rgba(0,163,255,0.25) 0%, rgba(0,163,255,0.1) 100%)",
              border: "1px solid rgba(0,163,255,0.35)",
              boxShadow: "0 0 12px rgba(0,163,255,0.3)",
            }}
          >
            <Zap
              className="w-4 h-4"
              style={{
                color: "#00A3FF",
                filter: "drop-shadow(0 0 4px rgba(0,163,255,0.8))",
              }}
            />
          </div>
        )}
        <button
          type="button"
          data-ocid="sidebar.toggle"
          onClick={toggleSidebar}
          className={cn(
            "flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center transition-smooth",
            "hover:bg-[rgba(0,163,255,0.1)]",
          )}
          style={{ color: "rgba(255,255,255,0.35)" }}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {!sidebarCollapsed && (
          <p
            className="text-[9px] font-mono uppercase px-3 pt-3 pb-2 tracking-[0.2em]"
            style={{ color: "rgba(0,163,255,0.5)" }}
          >
            Navigation
          </p>
        )}
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              data-ocid={item.ocid}
              className={cn(
                "relative flex items-center rounded-md transition-smooth text-[11px] font-medium min-h-[40px] overflow-hidden",
                sidebarCollapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5",
              )}
              style={
                isActive
                  ? {
                      background:
                        "linear-gradient(90deg, rgba(0,163,255,0.12) 0%, rgba(0,163,255,0.04) 100%)",
                      color: "#00A3FF",
                      borderLeft: "3px solid #00A3FF",
                      boxShadow: "inset 0 0 20px rgba(0,163,255,0.05)",
                    }
                  : {
                      color: "rgba(255,255,255,0.5)",
                      borderLeft: "3px solid transparent",
                    }
              }
              onMouseEnter={(e) => {
                if (!isActive) {
                  const el = e.currentTarget as HTMLElement;
                  el.style.background = "rgba(0,163,255,0.06)";
                  el.style.color = "rgba(0,163,255,0.85)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  const el = e.currentTarget as HTMLElement;
                  el.style.background = "";
                  el.style.color = "rgba(255,255,255,0.5)";
                }
              }}
              title={sidebarCollapsed ? item.label : undefined}
            >
              {/* Active indicator glow */}
              {isActive && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-px h-3/4"
                  style={{
                    background: "#00A3FF",
                    boxShadow: "0 0 8px 2px rgba(0,163,255,0.6)",
                  }}
                />
              )}
              <Icon
                className={cn(
                  "flex-shrink-0",
                  sidebarCollapsed ? "w-5 h-5" : "w-4 h-4",
                )}
                style={
                  isActive
                    ? { filter: "drop-shadow(0 0 4px rgba(0,163,255,0.7))" }
                    : {}
                }
              />
              {!sidebarCollapsed && (
                <span
                  className="truncate uppercase tracking-[0.06em] font-semibold"
                  style={{ fontSize: "10.5px", letterSpacing: "0.07em" }}
                >
                  {item.label}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Protocol badges */}
      {!sidebarCollapsed && (
        <div
          className="p-3 border-t"
          style={{ borderColor: "oklch(0.7 0.2 210 / 0.12)" }}
        >
          <p
            className="text-[9px] font-mono uppercase tracking-[0.2em] mb-2"
            style={{ color: "rgba(0,163,255,0.5)" }}
          >
            Protocols
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PROTOCOLS.map((proto) => (
              <span
                key={proto.id}
                className={cn(
                  "text-[9px] px-2 py-0.5 rounded font-mono font-medium uppercase tracking-wider",
                  proto.bgClass,
                  proto.textClass,
                  proto.borderClass,
                )}
              >
                {proto.logoSymbol}
              </span>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
