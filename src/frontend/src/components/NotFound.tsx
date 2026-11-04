import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { Compass } from "lucide-react";

/** Friendly 404 shown for any unknown route. */
export function NotFound() {
  return (
    <div
      data-ocid="not_found"
      className="flex min-h-[60vh] items-center justify-center p-6"
    >
      <div className="state-panel max-w-md">
        <span className="state-icon">
          <Compass className="h-5 w-5" aria-hidden />
        </span>
        <p className="font-mono text-xs uppercase tracking-widest text-primary">
          Error 404
        </p>
        <h1 className="font-display text-xl font-semibold text-foreground">
          This page does not exist
        </h1>
        <p className="text-sm">
          The link may be outdated or mistyped. Head back to the dashboard to
          keep exploring pools.
        </p>
        <Button asChild data-ocid="not_found.dashboard_link">
          <Link to="/">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}

export default NotFound;
