import { AIAssistant } from "@/components/AIAssistant";
import { AlertBell } from "@/components/AlertBell";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LocalImportBanner } from "@/components/LocalImportBanner";
import { Sidebar } from "@/components/Sidebar";
import { NAV_ITEMS, isActivePath } from "@/components/navItems";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { useSettingsSync } from "@/hooks/useQueries";
import { cn } from "@/lib/utils";
import { useDefiStore } from "@/store/useDefiStore";
import { Link, useRouterState } from "@tanstack/react-router";
import { LogIn, LogOut, MoreHorizontal, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

const PRIMARY_ITEMS = NAV_ITEMS.filter((item) => item.primary);
const MORE_ITEMS = NAV_ITEMS.filter((item) => !item.primary);

function useApplyTheme() {
  const theme = useDefiStore((s) => s.theme);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "auto" && media.matches);
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
    };
    apply();
    if (theme !== "auto") return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
}

function AuthControls() {
  const {
    isAuthenticated,
    isInitializing,
    isLoggingIn,
    login,
    logout,
    shortPrincipal,
  } = useAuth();
  if (isAuthenticated) {
    return (
      <div className="flex items-center gap-2">
        <span
          data-ocid="header.principal"
          className="hidden rounded border border-border bg-muted/40 px-2 py-1 font-mono text-[11px] text-muted-foreground sm:inline"
          title="Your Internet Identity principal"
        >
          {shortPrincipal}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-ocid="header.sign_out_button"
          onClick={logout}
          className="h-8 gap-1.5"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </div>
    );
  }
  return (
    <Button
      type="button"
      size="sm"
      data-ocid="header.sign_in_button"
      onClick={login}
      disabled={isInitializing || isLoggingIn}
      className="h-8 gap-1.5"
    >
      <LogIn className="h-3.5 w-3.5" aria-hidden />
      {isLoggingIn ? "Signing in…" : "Sign in"}
    </Button>
  );
}

function MobileNav({ pathname }: { pathname: string }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE_ITEMS.some((item) =>
    isActivePath(pathname, item.path),
  );

  const tabClass = (active: boolean) =>
    cn(
      "relative flex min-h-[44px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 transition-smooth",
      active ? "text-primary" : "text-muted-foreground",
    );

  return (
    <>
      <nav
        data-ocid="bottom_nav.panel"
        aria-label="Main navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-primary/20 bg-card/95 backdrop-blur-xl md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex h-16 items-stretch">
          {PRIMARY_ITEMS.map((item) => {
            const active = isActivePath(pathname, item.path);
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                data-ocid={`bottom_${item.ocid}`}
                aria-current={active ? "page" : undefined}
                className={tabClass(active)}
              >
                {active && (
                  <span className="absolute left-1/2 top-0 h-[2px] w-8 -translate-x-1/2 rounded-full bg-primary" />
                )}
                <Icon className="h-5 w-5" />
                <span className="max-w-full truncate px-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider">
                  {item.shortLabel}
                </span>
              </Link>
            );
          })}
          <button
            type="button"
            data-ocid="bottom_nav.more_button"
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen(true)}
            className={tabClass(moreActive)}
          >
            <MoreHorizontal className="h-5 w-5" />
            <span className="font-mono text-[9px] font-semibold uppercase tracking-wider">
              More
            </span>
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          data-ocid="bottom_nav.more_sheet"
          className="rounded-t-xl border-primary/20 pb-6"
        >
          <SheetHeader>
            <SheetTitle className="font-display">More pages</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-2 px-4">
            {MORE_ITEMS.map((item) => {
              const active = isActivePath(pathname, item.path);
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  data-ocid={`more_${item.ocid}`}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-lg border p-2 text-center transition-smooth",
                    active
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border bg-muted/30 text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-[11px] font-medium leading-tight">
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useSettingsSync();
  useApplyTheme();

  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname drives scroll reset
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <div className="hidden flex-shrink-0 transition-smooth md:flex">
        <Sidebar />
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header
          data-ocid="layout.header"
          className="flex h-12 flex-shrink-0 items-center justify-between gap-3 border-b border-primary/15 bg-card/80 px-3 backdrop-blur-xl md:justify-end md:px-4"
        >
          <div className="flex items-center gap-2 md:hidden">
            <Zap className="h-4 w-4 text-primary" aria-hidden />
            <span className="font-display text-sm font-bold tracking-tight">
              DeFi Analytics
            </span>
          </div>
          <div className="flex items-center gap-2">
            <AlertBell />
            <AuthControls />
          </div>
        </header>

        <LocalImportBanner />

        <main
          data-ocid="layout.main"
          className="flex-1 overflow-y-auto overflow-x-hidden bg-background"
        >
          <div className="pb-16 md:pb-0">
            <ErrorBoundary key={pathname}>{children}</ErrorBoundary>
          </div>
        </main>

        <footer className="hidden flex-shrink-0 items-center justify-center border-t border-primary/15 bg-card/80 px-4 py-2 backdrop-blur-xl md:flex">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            &copy; {new Date().getFullYear()}. Built with love using{" "}
            <a
              href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              caffeine.ai
            </a>
          </p>
        </footer>
      </div>

      <MobileNav pathname={pathname} />
      <AIAssistant />
    </div>
  );
}
