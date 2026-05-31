import { PROTOCOL_METADATA } from "@/data/mockData";
import { cn } from "@/lib/utils";
import type { Protocol } from "@/types/defi";
import React from "react";

interface ProtocolBadgeProps {
  protocol: Protocol;
  size?: "sm" | "md" | "lg";
  showChain?: boolean;
  className?: string;
}

export const ProtocolBadge = React.memo(function ProtocolBadge({
  protocol,
  size = "md",
  showChain = false,
  className,
}: ProtocolBadgeProps) {
  const meta = PROTOCOL_METADATA[protocol];
  if (!meta) return null;

  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5 gap-1 max-w-[80px]",
    md: "text-xs px-2 py-1 gap-1.5 max-w-[120px]",
    lg: "text-sm px-3 py-1.5 gap-2 max-w-[160px]",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium shrink-0 overflow-hidden transition-all duration-200",
        sizeClasses[size],
        className,
      )}
      style={{
        background: "rgba(0,163,255,0.1)",
        border: "1px solid rgba(0,163,255,0.3)",
        color: "#00A3FF",
        letterSpacing: "0.02em",
      }}
    >
      <span className="font-bold shrink-0">{meta.logoSymbol}</span>
      {showChain && <span className="opacity-70 truncate">· {meta.chain}</span>}
    </span>
  );
});
