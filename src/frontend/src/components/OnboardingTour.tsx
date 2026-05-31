import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const TOUR_KEY = "defi_tour_completed";

interface TourStep {
  title: string;
  icon: string;
  description: string;
  tip: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    title: "Dashboard Overview",
    icon: "📊",
    description:
      "Your command center for DeFi analytics. Get at-a-glance metrics for TVL, APY leaders, and protocol health across all supported chains.",
    tip: "Hover any metric card to see 24h change details.",
  },
  {
    title: "Pool Explorer",
    icon: "🔍",
    description:
      "Browse and sort all liquidity pools across Uniswap, PancakeSwap, Raydium, ICPSwap, and KongSwap. Filter by protocol, TVL, APY, or IL risk.",
    tip: "Click a column header to re-sort the pool table instantly.",
  },
  {
    title: "APY Tracker",
    icon: "📈",
    description:
      "Track yield performance over time with interactive charts. Compare 7-day and 30-day APY trends across multiple pools side by side.",
    tip: "Select up to 4 pools in Pool Explorer to compare on this chart.",
  },
  {
    title: "IL Calculator",
    icon: "⚖️",
    description:
      "Calculate your exact impermanent loss for any price movement scenario. Input entry prices, current prices, and fee earnings to get your net P&L.",
    tip: "Enter your ICP principal to auto-load live positions from ICPSwap and KongSwap.",
  },
  {
    title: "Pool Comparator",
    icon: "⚡",
    description:
      "Compare up to 4 pools side by side with APY charts, fee breakdowns, and risk scores. Smart filters highlight high-yield and at-risk pools automatically.",
    tip: "Enable the yield efficiency filter to surface pools with Volume/TVL > 0.5.",
  },
  {
    title: "AI Assistant",
    icon: "🤖",
    description:
      "An ultra-intelligent DeFi assistant that reads live dashboard data. Ask it anything about yield optimization, risk assessment, or pool analysis.",
    tip: "Try the Yield Optimization tab to get a personalized pool allocation based on your risk tolerance.",
  },
];

export function OnboardingTour() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      const done = localStorage.getItem(TOUR_KEY);
      if (!done) setVisible(true);
    } catch {
      // storage blocked — skip tour
    }
  }, []);

  const dismiss = useCallback((markDone = true) => {
    setVisible(false);
    if (markDone) {
      try {
        localStorage.setItem(TOUR_KEY, "1");
      } catch {
        /* ignore */
      }
    }
  }, []);

  const next = useCallback(() => {
    if (step < TOUR_STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      dismiss();
    }
  }, [step, dismiss]);

  const prev = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [visible, dismiss, next, prev]);

  if (!visible) return null;

  const current = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;

  return (
    <dialog
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-transparent w-full h-full max-w-full max-h-full m-0"
      aria-label="Welcome tour"
      data-ocid="onboarding_tour.dialog"
      open
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => dismiss()}
        onKeyDown={(e) => e.key === "Escape" && dismiss()}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md glass-card border border-[#00A3FF]/30 rounded-2xl shadow-[0_0_40px_rgba(0,163,255,0.2)] overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        {/* Header bar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/20">
          <span className="text-xs font-mono text-[#00A3FF]/80 tracking-widest uppercase">
            Welcome Tour
          </span>
          <button
            type="button"
            onClick={() => dismiss()}
            aria-label="Close tour"
            data-ocid="onboarding_tour.close_button"
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors duration-200 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00A3FF]/60"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step content */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl" role="img" aria-hidden="true">
              {current.icon}
            </span>
            <h2 className="text-lg font-semibold text-foreground leading-tight">
              {current.title}
            </h2>
          </div>

          <p className="text-sm text-foreground/80 leading-relaxed mb-4">
            {current.description}
          </p>

          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-[#00A3FF]/08 border border-[#00A3FF]/20">
            <span className="text-[#00A3FF] text-xs mt-0.5 flex-shrink-0">
              💡
            </span>
            <p className="text-xs text-[#00A3FF]/90 leading-relaxed">
              {current.tip}
            </p>
          </div>
        </div>

        {/* Footer: dots + navigation */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border/20">
          {/* Progress dots */}
          <div
            className="flex items-center gap-1.5"
            aria-label={`Step ${step + 1} of ${TOUR_STEPS.length}`}
          >
            {TOUR_STEPS.map((tourStep, i) => (
              <button
                key={tourStep.title}
                type="button"
                onClick={() => setStep(i)}
                aria-label={`Go to step ${i + 1}`}
                data-ocid={`onboarding_tour.dot.${i + 1}`}
                className={`rounded-full transition-all duration-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00A3FF]/60 ${
                  i === step
                    ? "w-5 h-2 bg-[#00A3FF] shadow-[0_0_6px_rgba(0,163,255,0.6)]"
                    : "w-2 h-2 bg-muted-foreground/30 hover:bg-muted-foreground/60"
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => dismiss()}
              data-ocid="onboarding_tour.skip_button"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors duration-200 px-2 py-1 rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border"
            >
              Skip
            </button>

            {step > 0 && (
              <button
                type="button"
                onClick={prev}
                data-ocid="onboarding_tour.prev_button"
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-border/40 hover:border-[#00A3FF]/40 hover:bg-[#00A3FF]/10 text-muted-foreground hover:text-[#00A3FF] transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00A3FF]/60"
                aria-label="Previous step"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={next}
              data-ocid="onboarding_tour.next_button"
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#00A3FF] text-[#0D0D0D] text-sm font-semibold hover:bg-[#00A3FF]/90 hover:shadow-[0_0_12px_rgba(0,163,255,0.5)] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00A3FF]/60"
            >
              {isLast ? "Done" : "Next"}
              {!isLast && <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
