import { useCallback, useEffect, useRef, useState } from "react";

export type HelpTermKey =
  | "APY"
  | "TVL"
  | "ImpermanentLoss"
  | "FundingRate"
  | "LongShortRatio";

export const HELP_TERMS: Record<
  HelpTermKey,
  { title: string; description: string }
> = {
  APY: {
    title: "APY",
    description:
      "Annual Percentage Yield — the expected yearly return from providing liquidity, including trading fees.",
  },
  TVL: {
    title: "TVL",
    description:
      "Total Value Locked — the total USD value of assets currently deposited in a liquidity pool.",
  },
  ImpermanentLoss: {
    title: "Impermanent Loss",
    description:
      "Impermanent Loss — the temporary loss in value compared to simply holding tokens, caused by price ratio changes in a liquidity pool.",
  },
  FundingRate: {
    title: "Funding Rate",
    description:
      "Funding Rate — a periodic payment between long and short traders in perpetual futures contracts to keep prices near spot.",
  },
  LongShortRatio: {
    title: "Long/Short Ratio",
    description:
      "Long/Short Ratio — the proportion of traders currently holding long vs short positions on a perpetual contract.",
  },
};

interface HelpIconProps {
  term?: HelpTermKey;
  description?: string;
  variant?: "sm" | "md";
}

export function HelpIcon({ term, description, variant = "sm" }: HelpIconProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<"top" | "bottom">("top");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const termData = term ? HELP_TERMS[term] : null;
  const resolvedTitle = termData?.title ?? term ?? "";
  const resolvedDescription = description ?? termData?.description ?? "";

  const sizeClasses =
    variant === "sm" ? "w-3.5 h-3.5 text-[9px]" : "w-4.5 h-4.5 text-[11px]";

  const computePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPosition(rect.top < 120 ? "bottom" : "top");
  }, []);

  const show = useCallback(() => {
    computePosition();
    setVisible(true);
  }, [computePosition]);

  const hide = useCallback(() => setVisible(false), []);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: MouseEvent) => {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !popoverRef.current?.contains(e.target as Node)
      ) {
        hide();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [visible, hide]);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [visible, hide]);

  return (
    <span className="relative inline-flex items-center">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Help: ${resolvedTitle}`}
        aria-expanded={visible}
        data-ocid="help_icon.toggle"
        onClick={() => (visible ? hide() : show())}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className={`inline-flex items-center justify-center rounded-full border border-[#00A3FF]/40 bg-[#00A3FF]/10 text-[#00A3FF] font-bold cursor-pointer transition-all duration-200 hover:bg-[#00A3FF]/20 hover:border-[#00A3FF]/70 hover:shadow-[0_0_8px_rgba(0,163,255,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00A3FF]/60 ${sizeClasses}`}
      >
        ?
      </button>

      {visible && (
        <div
          ref={popoverRef}
          role="tooltip"
          data-ocid="help_icon.popover"
          className={`absolute z-50 left-1/2 -translate-x-1/2 w-56 rounded-lg glass-card border border-[#00A3FF]/30 px-3 py-2.5 shadow-[0_0_16px_rgba(0,163,255,0.2)] animate-in fade-in duration-150 ${
            position === "top" ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          {resolvedTitle && (
            <p className="text-[11px] font-semibold text-[#00A3FF] mb-1 leading-tight">
              {resolvedTitle}
            </p>
          )}
          <p className="text-[11px] text-foreground/80 leading-relaxed">
            {resolvedDescription}
          </p>
        </div>
      )}
    </span>
  );
}
