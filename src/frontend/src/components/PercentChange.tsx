import { TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";

interface PercentChangeProps {
  value: number;
  size?: "sm" | "md" | "lg";
}

const SIZE_CLASSES = {
  sm: { text: "text-xs", icon: "w-3 h-3", gap: "gap-0.5" },
  md: { text: "text-sm", icon: "w-3.5 h-3.5", gap: "gap-1" },
  lg: { text: "text-base", icon: "w-4 h-4", gap: "gap-1" },
};

export function PercentChange({ value, size = "sm" }: PercentChangeProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const isPositive = value >= 0;
  const absValue = Math.abs(value);
  const { text, icon, gap } = SIZE_CLASSES[size];

  const colorClass = isPositive ? "text-[#00FF88]" : "text-red-400";
  const shadowStyle = isPositive
    ? { textShadow: "0 0 8px rgba(0,255,136,0.6)" }
    : { textShadow: "0 0 8px rgba(239,68,68,0.6)" };

  const Icon = isPositive ? TrendingUp : TrendingDown;

  return (
    <span
      data-ocid="percent_change"
      className={`inline-flex items-center font-mono font-semibold ${colorClass} ${text} ${gap} transition-all duration-300 ${
        mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
      }`}
      style={mounted ? shadowStyle : undefined}
      aria-label={`${isPositive ? "+" : "-"}${absValue.toFixed(2)}%`}
    >
      <Icon className={icon} aria-hidden="true" />
      <span>{absValue.toFixed(2)}%</span>
    </span>
  );
}
