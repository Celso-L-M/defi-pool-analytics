import { NAV_ITEMS, isActivePath } from "@/components/navItems";
import { PROTOCOL_METADATA } from "@/data/mockData";
import { cn } from "@/lib/utils";
import { useDefiStore } from "@/store/useDefiStore";
import { Link, useLocation } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Zap } from "lucide-react";

const PROTOCOLS = Object.values(PROTOCOL_METADATA);

function LogoMark() {
  return (
    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-primary/35 bg-primary/15 text-primary shadow-[0_0_12px_oklch(var(--primary)/0.25)]">
      <Zap className="h-4 w-4" aria-hidden />
    </div>
  );
}

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useDefiStore();
  const location = useLocation();

  return (
    <aside
      data-ocid="sidebar.panel"
      className={cn(
        "relative flex h-full flex-col overflow-hidden border-r border-primary/15 bg-sidebar text-sidebar-foreground transition-smooth",
        sidebarCollapsed ? "w-16" : "w-64",
      )}
    >
      <div className="pointer-events-none absolute bottom-0 right-0 top-0 w-px bg-gradient-to-b from-transparent via-primary/30 to-transparent" />

      <div
        className={cn(
          "flex flex-shrink-0 items-center border-b border-primary/15",
          sidebarCollapsed ? "justify-center p-4" : "justify-between px-4 py-4",
        )}
      >
        {sidebarCollapsed ? (
          <LogoMark />
        ) : (
          <div className="flex min-w-0 items-center gap-2.5">
            <LogoMark />
            <div className="min-w-0">
              <span className="block font-display text-sm font-bold tracking-tight text-foreground">
                DeFi Analytics
              </span>
              <span className="block font-mono text-[9px] uppercase tracking-[0.15em] text-primary">
                Terminal
              </span>
            </div>
          </div>
        )}
        <button
          type="button"
          data-ocid="sidebar.toggle"
          onClick={toggleSidebar}
          className={cn(
            "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground transition-smooth hover:bg-primary/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            sidebarCollapsed && "absolute right-1 top-1",
          )}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronLeft className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      <nav
        aria-label="Primary"
        className="flex-1 space-y-0.5 overflow-y-auto p-2"
      >
        {!sidebarCollapsed && (
          <p className="px-3 pb-2 pt-3 font-mono text-[9px] uppercase tracking-[0.2em] text-primary/70">
            Navigation
          </p>
        )}
        {NAV_ITEMS.map((item) => {
          const isActive = isActivePath(location.pathname, item.path);
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              data-ocid={item.ocid}
              aria-current={isActive ? "page" : undefined}
              title={sidebarCollapsed ? item.label : undefined}
              className={cn(
                "relative flex min-h-[40px] items-center overflow-hidden rounded-md border-l-[3px] text-[11px] font-medium transition-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                sidebarCollapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5",
                isActive
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-transparent text-muted-foreground hover:bg-primary/5 hover:text-primary",
              )}
            >
              <Icon
                className={cn(
                  "flex-shrink-0",
                  sidebarCollapsed ? "h-5 w-5" : "h-4 w-4",
                )}
                aria-hidden
              />
              {!sidebarCollapsed && (
                <span className="truncate text-[10.5px] font-semibold uppercase tracking-[0.07em]">
                  {item.label}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {!sidebarCollapsed && (
        <div className="border-t border-primary/15 p-3">
          <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-primary/70">
            Protocols
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PROTOCOLS.map((proto) => (
              <span
                key={proto.id}
                className={cn(
                  "rounded px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider",
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
