import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "@/hooks/useAuth";
import {
  useAlertHistory,
  useMarkAlertRead,
  useMarkAllAlertsRead,
  useUnreadAlertCount,
} from "@/hooks/useQueries";
import {
  ALERT_METRIC_LABELS,
  alertThresholdText,
  formatRelativeTime,
} from "@/utils/alerts";
import { Link } from "@tanstack/react-router";
import { Bell, BellRing, CheckCheck } from "lucide-react";
import { useState } from "react";

const MAX_ITEMS = 8;

/** Header bell: unread count plus the latest triggered alerts. */
export function AlertBell() {
  const { isAuthenticated, login, isLoggingIn } = useAuth();
  const [open, setOpen] = useState(false);
  const unread = useUnreadAlertCount();
  const history = useAlertHistory();
  const markRead = useMarkAlertRead();
  const markAll = useMarkAllAlertsRead();

  const count = Number(unread.data ?? 0n);
  const items = (history.data ?? [])
    .slice()
    .sort((a, b) => (a.triggeredAt < b.triggeredAt ? 1 : -1))
    .slice(0, MAX_ITEMS);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-ocid="alert_bell.button"
          aria-label={
            count > 0 ? `Alerts, ${count} unread` : "Alerts, none unread"
          }
          className="relative"
        >
          {count > 0 ? (
            <BellRing className="h-4 w-4 animate-bell-ring text-alert-triggered" />
          ) : (
            <Bell className="h-4 w-4" />
          )}
          {count > 0 && (
            <span className="bell-dot">{count > 99 ? "99+" : count}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        data-ocid="alert_bell.popover"
        className="notif-list w-80 max-w-[calc(100vw-1.5rem)] p-0"
      >
        <div className="flex items-center justify-between border-b border-border/40 px-4 py-2.5">
          <p className="font-display text-sm font-semibold">Triggered alerts</p>
          {isAuthenticated && count > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-ocid="alert_bell.mark_all_button"
              disabled={markAll.isPending}
              onClick={() => markAll.mutate()}
              className="h-7 gap-1 px-2 text-xs"
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden />
              Mark all read
            </Button>
          )}
        </div>

        {!isAuthenticated ? (
          <div className="space-y-3 px-4 py-6 text-center">
            <p className="text-xs text-muted-foreground">
              Sign in to see alerts triggered by your rules.
            </p>
            <Button
              type="button"
              size="sm"
              data-ocid="alert_bell.sign_in_button"
              onClick={login}
              disabled={isLoggingIn}
            >
              {isLoggingIn ? "Signing in…" : "Sign in"}
            </Button>
          </div>
        ) : history.isError ? (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">
            Could not load alerts. They will retry shortly.
          </p>
        ) : items.length === 0 ? (
          <p
            data-ocid="alert_bell.empty_state"
            className="px-4 py-6 text-center text-xs text-muted-foreground"
          >
            No alerts have triggered yet.
          </p>
        ) : (
          <ul className="max-h-80 overflow-y-auto">
            {items.map((entry) => (
              <li
                key={entry.id.toString()}
                className="notif-item"
                data-unread={!entry.read}
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="truncate text-sm font-medium">
                    {entry.poolLabel}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {ALERT_METRIC_LABELS[entry.metric]}{" "}
                    {alertThresholdText(entry.metric, entry.threshold)} · now{" "}
                    {entry.observedValue.toFixed(2)}%
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatRelativeTime(entry.triggeredAt)}
                  </p>
                </div>
                {!entry.read && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 px-2 text-xs"
                    disabled={markRead.isPending}
                    onClick={() => markRead.mutate(entry.id)}
                  >
                    Mark read
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-border/40 px-4 py-2.5 text-right">
          <Link
            to="/alerts"
            data-ocid="alert_bell.alerts_link"
            onClick={() => setOpen(false)}
            className="text-xs font-medium text-primary hover:underline"
          >
            Manage alerts
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default AlertBell;
