import { cn } from "@/lib/utils";

interface DemoBadgeProps {
  className?: string;
  label?: string;
}

/** Visible marker for any figure that is demo or fallback data. */
export function DemoBadge({ className, label = "Demo data" }: DemoBadgeProps) {
  return (
    <span
      data-ocid="demo_badge"
      className={cn("demo-badge", className)}
      title="This is sample data, not a live market figure."
    >
      {label}
    </span>
  );
}

export default DemoBadge;
