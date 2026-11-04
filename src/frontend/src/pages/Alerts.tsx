import {
  type AlertHistoryEntry,
  AlertMetric,
  type AlertRule,
  type AlertRuleInput,
} from "@/backend";
import { EmptyState, ErrorState, LoadingState } from "@/components/DataStates";
import { DemoBadge } from "@/components/DemoBadge";
import { SignInPrompt } from "@/components/SignInPrompt";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { usePools } from "@/hooks/useLiveData";
import {
  useAlertHistory,
  useAlertRules,
  useClearAlertHistory,
  useCreateAlertRule,
  useDeleteAlertRule,
  useEvaluateAlertsNow,
  useHasVerifiedEmail,
  useMarkAlertRead,
  useMarkAllAlertsRead,
  useSetAlertRuleEnabled,
  useSettings,
  useUpdateAlertRule,
} from "@/hooks/useQueries";
import { cn } from "@/lib/utils";
import {
  ALERT_METRIC_LABELS,
  alertThresholdText,
  formatRelativeTime,
} from "@/utils/alerts";
import { Link } from "@tanstack/react-router";
import {
  BellRing,
  Check,
  CheckCheck,
  Mail,
  MailWarning,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";

const MAX_RULES = 25;
const MAX_POOL_RESULTS = 40;

const METRICS = [
  AlertMetric.apyBelow,
  AlertMetric.apyAbove,
  AlertMetric.tvlDropPercent,
];

interface PickedPool {
  poolId: string;
  poolLabel: string;
}

// ─── Rule form (create + edit) ───────────────────────────────────────────────

interface RuleFormProps {
  rule: AlertRule | null;
  onClose: () => void;
}

function RuleForm({ rule, onClose }: RuleFormProps) {
  const pools = usePools();
  const create = useCreateAlertRule();
  const update = useUpdateAlertRule();
  const [picked, setPicked] = useState<PickedPool | null>(
    rule ? { poolId: rule.poolId, poolLabel: rule.poolLabel } : null,
  );
  const [search, setSearch] = useState("");
  const [metric, setMetric] = useState<AlertMetric>(
    rule?.metric ?? AlertMetric.apyBelow,
  );
  const [threshold, setThreshold] = useState(
    rule ? String(rule.threshold) : "",
  );
  const [formError, setFormError] = useState<string | null>(null);
  const mutation = rule ? update : create;

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? pools.data.filter((p) =>
          `${p.name} ${p.project ?? ""} ${p.protocol} ${p.chain}`
            .toLowerCase()
            .includes(q),
        )
      : pools.data;
    return list.slice(0, MAX_POOL_RESULTS);
  }, [pools.data, search]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(threshold);
    if (!picked) return setFormError("Choose a pool to watch.");
    if (threshold.trim() === "" || !Number.isFinite(value) || value <= 0)
      return setFormError("Enter a threshold greater than 0.");
    if (metric === AlertMetric.tvlDropPercent && value > 100)
      return setFormError("A TVL drop cannot be more than 100%.");
    setFormError(null);
    const input: AlertRuleInput = { ...picked, metric, threshold: value };
    const done = { onSuccess: onClose };
    if (rule) update.mutate({ id: rule.id, input }, done);
    else create.mutate(input, done);
  };

  const unit = metric === AlertMetric.tvlDropPercent ? "% drop" : "% APY";

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="alert-pool-search">Pool</Label>
        {picked && (
          <p
            data-ocid="alerts.selected_pool"
            className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 font-mono text-xs text-foreground"
          >
            {picked.poolLabel}
          </p>
        )}
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="alert-pool-search"
            data-ocid="alerts.pool_search_input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by pair, protocol or chain"
            className="pl-8"
            autoComplete="off"
          />
        </div>
        {pools.isDemo && <DemoBadge />}
        <div
          data-ocid="alerts.pool_list"
          className="max-h-44 overflow-y-auto rounded-md border border-border bg-background"
        >
          {pools.isLoading ? (
            <p className="p-3 text-xs text-muted-foreground">Loading pools…</p>
          ) : matches.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">
              No pools match your search.
            </p>
          ) : (
            <ul>
              {matches.map((pool) => {
                const poolId = pool.poolId ?? pool.id;
                const poolLabel = `${pool.name} · ${pool.project ?? pool.protocol} · ${pool.chain}`;
                const active = picked?.poolId === poolId;
                return (
                  <li key={pool.id}>
                    <button
                      type="button"
                      onClick={() => setPicked({ poolId, poolLabel })}
                      aria-pressed={active}
                      className={cn(
                        "flex min-h-9 w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                        active && "bg-primary/15 text-primary",
                      )}
                    >
                      <span className="min-w-0 truncate font-mono">
                        {poolLabel}
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        {pool.apy.current.toFixed(2)}% APY
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {pools.isError && !pools.isDemo && (
          <p className="text-xs text-warning">
            Live pools could not be refreshed. Showing cached pools.
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="alert-metric">Condition</Label>
          <Select
            value={metric}
            onValueChange={(v) => setMetric(v as AlertMetric)}
          >
            <SelectTrigger id="alert-metric" data-ocid="alerts.metric_select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METRICS.map((m) => (
                <SelectItem key={m} value={m}>
                  {ALERT_METRIC_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="alert-threshold">Threshold ({unit})</Label>
          <Input
            id="alert-threshold"
            data-ocid="alerts.threshold_input"
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            placeholder={metric === AlertMetric.tvlDropPercent ? "20" : "5"}
            className="font-mono"
          />
        </div>
      </div>

      {(formError || mutation.error) && (
        <p
          role="alert"
          data-ocid="alerts.form_error"
          className="text-xs text-destructive"
        >
          {formError ?? mutation.error?.message}
        </p>
      )}

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          data-ocid="alerts.cancel_button"
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          data-ocid="alerts.save_button"
          disabled={mutation.isPending}
        >
          {mutation.isPending
            ? "Saving…"
            : rule
              ? "Save changes"
              : "Create alert"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ─── Rule card ───────────────────────────────────────────────────────────────

function ruleState(rule: AlertRule): { label: string; className: string } {
  if (!rule.enabled)
    return {
      label: "Disabled",
      className: "border-border text-muted-foreground",
    };
  if (!rule.armed)
    return {
      label: rule.lastTriggeredAt
        ? `Triggered ${formatRelativeTime(rule.lastTriggeredAt)}`
        : "Triggered",
      className: "border-warning/50 bg-warning/10 text-warning",
    };
  return {
    label: "Armed",
    className: "border-success/50 bg-success/10 text-success",
  };
}

interface RuleCardProps {
  rule: AlertRule;
  index: number;
  onEdit: (rule: AlertRule) => void;
  onDelete: (rule: AlertRule) => void;
}

function RuleCard({ rule, index, onEdit, onDelete }: RuleCardProps) {
  const toggle = useSetAlertRuleEnabled();
  const state = ruleState(rule);
  return (
    <li
      data-ocid={`alerts.rule.item.${index}`}
      className="rounded-lg border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="truncate font-mono text-sm font-medium text-foreground">
            {rule.poolLabel}
          </p>
          <p className="text-xs text-muted-foreground">
            {ALERT_METRIC_LABELS[rule.metric]}{" "}
            <span className="font-mono text-foreground">
              {alertThresholdText(rule.metric, rule.threshold).replace(
                " APY",
                "",
              )}
            </span>
            {rule.metric === AlertMetric.tvlDropPercent ? "" : " APY"}
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge
              variant="outline"
              data-ocid={`alerts.rule.status.${index}`}
              className={cn("font-mono text-[11px]", state.className)}
            >
              {state.label}
            </Badge>
            {rule.enabled && !rule.armed && (
              <span className="text-[11px] text-muted-foreground">
                Re-arms after the pool recovers
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={rule.enabled}
            disabled={toggle.isPending}
            aria-label={`${rule.enabled ? "Disable" : "Enable"} alert for ${rule.poolLabel}`}
            data-ocid={`alerts.rule.toggle.${index}`}
            onCheckedChange={(enabled) =>
              toggle.mutate({ id: rule.id, enabled })
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Edit alert for ${rule.poolLabel}`}
            data-ocid={`alerts.rule.edit_button.${index}`}
            onClick={() => onEdit(rule)}
          >
            <Pencil className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Delete alert for ${rule.poolLabel}`}
            data-ocid={`alerts.rule.delete_button.${index}`}
            className="text-destructive hover:text-destructive"
            onClick={() => onDelete(rule)}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
      {toggle.error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {toggle.error.message}
        </p>
      )}
    </li>
  );
}

// ─── Email notice ────────────────────────────────────────────────────────────

function EmailNotice() {
  const verified = useHasVerifiedEmail();
  const settings = useSettings();
  const hasEmail = verified.data === true;
  const emailOn = settings.data?.emailAlertsEnabled === true;
  return (
    <section
      data-ocid="alerts.email_notice"
      className="flex gap-3 rounded-lg border border-border bg-card p-4"
    >
      <span className="mt-0.5 text-primary">
        {hasEmail ? (
          <Mail className="h-5 w-5" aria-hidden />
        ) : (
          <MailWarning className="h-5 w-5 text-warning" aria-hidden />
        )}
      </span>
      <div className="min-w-0 space-y-1 text-sm">
        <p className="font-medium text-foreground">Email alerts</p>
        <p className="text-xs text-muted-foreground">
          Every triggered alert shows up in the list below. When email alerts
          are switched on in{" "}
          <Link
            to="/settings"
            className="text-primary underline underline-offset-2"
            data-ocid="alerts.settings_link"
          >
            Settings
          </Link>
          , it is also emailed once per breach to the verified email from your
          sign-in. We never ask you to type an address.
        </p>
        <p className="text-xs" data-ocid="alerts.email_status">
          {verified.isLoading ? (
            <span className="text-muted-foreground">
              Checking for a verified email…
            </span>
          ) : verified.isError ? (
            <span className="text-warning">
              Could not check your verified email right now.
            </span>
          ) : hasEmail ? (
            <span className="text-success">
              Verified email available
              {settings.data
                ? emailOn
                  ? " · Email alerts are on"
                  : " · Email alerts are off in Settings"
                : ""}
            </span>
          ) : (
            <span className="text-warning">
              No verified email available from your sign-in, so alerts stay
              in-app only.
            </span>
          )}
        </p>
      </div>
    </section>
  );
}

// ─── Triggered list ──────────────────────────────────────────────────────────

function describeEntry(entry: AlertHistoryEntry): string {
  const observed = entry.observedValue.toFixed(2);
  switch (entry.metric) {
    case AlertMetric.apyBelow:
      return `APY ${observed}% fell below ${entry.threshold}%`;
    case AlertMetric.apyAbove:
      return `APY ${observed}% rose above ${entry.threshold}%`;
    case AlertMetric.tvlDropPercent:
      return `TVL dropped ${observed}% (limit ${entry.threshold}%)`;
  }
}

function HistorySection() {
  const history = useAlertHistory();
  const markRead = useMarkAlertRead();
  const markAll = useMarkAllAlertsRead();
  const clear = useClearAlertHistory();
  const [confirmClear, setConfirmClear] = useState(false);

  const entries = useMemo(
    () =>
      [...(history.data ?? [])].sort((a, b) =>
        a.triggeredAt === b.triggeredAt
          ? 0
          : a.triggeredAt < b.triggeredAt
            ? 1
            : -1,
      ),
    [history.data],
  );
  const unread = entries.filter((e) => !e.read).length;

  return (
    <section className="space-y-3" data-ocid="alerts.history_section">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">
          Triggered alerts
          {unread > 0 && (
            <span className="ml-2 rounded-full bg-primary px-2 py-0.5 font-mono text-xs text-primary-foreground">
              {unread} unread
            </span>
          )}
        </h2>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-ocid="alerts.mark_all_read_button"
            disabled={unread === 0 || markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            <CheckCheck className="mr-1.5 h-4 w-4" aria-hidden />
            Mark all read
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-ocid="alerts.clear_button"
            disabled={entries.length === 0 || clear.isPending}
            onClick={() => setConfirmClear(true)}
          >
            <Trash2 className="mr-1.5 h-4 w-4" aria-hidden />
            Clear
          </Button>
        </div>
      </div>

      {history.isLoading ? (
        <LoadingState label="Loading triggered alerts…" />
      ) : history.isError ? (
        <ErrorState
          title="Could not load triggered alerts"
          message={history.error.message}
          onRetry={() => void history.refetch()}
        />
      ) : entries.length === 0 ? (
        <EmptyState
          title="Nothing has triggered yet"
          description="When a pool crosses one of your thresholds it will appear here."
          icon={<BellRing className="h-5 w-5" aria-hidden />}
        />
      ) : (
        <ul className="space-y-2" data-ocid="alerts.history_list">
          {entries.map((entry, i) => (
            <li
              key={entry.id.toString()}
              data-ocid={`alerts.history.item.${i + 1}`}
              className={cn(
                "flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3",
                entry.read
                  ? "border-border opacity-80"
                  : "border-primary/50 border-l-4 border-l-primary bg-primary/5",
              )}
            >
              <div className="min-w-0 space-y-0.5">
                <p className="truncate font-mono text-sm text-foreground">
                  {entry.poolLabel}
                </p>
                <p className="text-xs text-muted-foreground">
                  {describeEntry(entry)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {formatRelativeTime(entry.triggeredAt)}
                  {entry.emailSent ? " · Emailed" : " · In-app only"}
                </p>
              </div>
              {!entry.read && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  data-ocid={`alerts.history.mark_read_button.${i + 1}`}
                  disabled={markRead.isPending}
                  onClick={() => markRead.mutate(entry.id)}
                >
                  <Check className="mr-1.5 h-4 w-4" aria-hidden />
                  Mark read
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {(markRead.error || markAll.error || clear.error) && (
        <p role="alert" className="text-xs text-destructive">
          {(markRead.error ?? markAll.error ?? clear.error)?.message}
        </p>
      )}

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent data-ocid="alerts.clear_dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Clear triggered alerts?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes all {entries.length} entries from your list. Your
              alert rules stay as they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-ocid="alerts.clear_cancel_button">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              data-ocid="alerts.clear_confirm_button"
              onClick={() => clear.mutate()}
            >
              Clear list
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

// ─── Signed-in view ──────────────────────────────────────────────────────────

type FormTarget = { mode: "create" } | { mode: "edit"; rule: AlertRule };

function AlertsWorkspace() {
  const rules = useAlertRules();
  const evaluate = useEvaluateAlertsNow();
  const remove = useDeleteAlertRule();
  const [form, setForm] = useState<FormTarget | null>(null);
  const [toDelete, setToDelete] = useState<AlertRule | null>(null);

  const list = rules.data ?? [];
  const atLimit = list.length >= MAX_RULES;
  const summary = evaluate.data;

  return (
    <div className="space-y-6">
      <EmailNotice />

      <section className="space-y-3" data-ocid="alerts.rules_section">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">
            Your alert rules
            <span className="ml-2 font-mono text-xs text-muted-foreground">
              {list.length}/{MAX_RULES}
            </span>
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-ocid="alerts.evaluate_button"
              disabled={evaluate.isPending || list.length === 0}
              onClick={() => evaluate.mutate()}
            >
              <Play className="mr-1.5 h-4 w-4" aria-hidden />
              {evaluate.isPending ? "Checking…" : "Check my alerts now"}
            </Button>
            <Button
              type="button"
              size="sm"
              data-ocid="alerts.new_button"
              disabled={atLimit}
              onClick={() => setForm({ mode: "create" })}
            >
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              New alert
            </Button>
          </div>
        </div>

        {atLimit && (
          <p
            data-ocid="alerts.limit_message"
            className="rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-xs text-warning"
          >
            You have reached the limit of {MAX_RULES} alert rules. Delete a rule
            to add another.
          </p>
        )}

        {summary && (
          <output
            data-ocid="alerts.evaluate_result"
            className="block rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-foreground"
          >
            Checked {summary.rulesEvaluated.toString()} rule
            {summary.rulesEvaluated === 1n ? "" : "s"} ·{" "}
            {summary.triggered.toString()} triggered
            {summary.failedPools > 0n
              ? ` · ${summary.failedPools.toString()} pool${summary.failedPools === 1n ? "" : "s"} could not be read`
              : ""}
          </output>
        )}
        {evaluate.error && (
          <p
            role="alert"
            data-ocid="alerts.evaluate_error"
            className="text-xs text-destructive"
          >
            Check failed: {evaluate.error.message}
          </p>
        )}

        {rules.isLoading ? (
          <LoadingState label="Loading your alert rules…" />
        ) : rules.isError ? (
          <ErrorState
            title="Could not load your alert rules"
            message={rules.error.message}
            onRetry={() => void rules.refetch()}
          />
        ) : list.length === 0 ? (
          <EmptyState
            title="No alert rules yet"
            description="Pick a pool and a threshold to be told when its APY or TVL moves."
            icon={<BellRing className="h-5 w-5" aria-hidden />}
            action={
              <Button
                type="button"
                size="sm"
                data-ocid="alerts.empty_create_button"
                onClick={() => setForm({ mode: "create" })}
              >
                <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                Create your first alert
              </Button>
            }
          />
        ) : (
          <ul className="space-y-2" data-ocid="alerts.rules_list">
            {list.map((rule, i) => (
              <RuleCard
                key={rule.id.toString()}
                rule={rule}
                index={i + 1}
                onEdit={(r) => setForm({ mode: "edit", rule: r })}
                onDelete={setToDelete}
              />
            ))}
          </ul>
        )}
      </section>

      <HistorySection />

      <Dialog
        open={form !== null}
        onOpenChange={(open) => {
          if (!open) setForm(null);
        }}
      >
        <DialogContent data-ocid="alerts.rule_dialog" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {form?.mode === "edit" ? "Edit alert" : "New alert"}
            </DialogTitle>
            <DialogDescription>
              Choose a pool, a condition and a threshold.
            </DialogDescription>
          </DialogHeader>
          {form && (
            <RuleForm
              key={form.mode === "edit" ? form.rule.id.toString() : "new"}
              rule={form.mode === "edit" ? form.rule : null}
              onClose={() => setForm(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null);
        }}
      >
        <AlertDialogContent data-ocid="alerts.delete_dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this alert?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete
                ? `${toDelete.poolLabel} will no longer be monitored.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-ocid="alerts.delete_cancel_button">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              data-ocid="alerts.delete_confirm_button"
              onClick={() => {
                if (toDelete) remove.mutate(toDelete.id);
                setToDelete(null);
              }}
            >
              Delete alert
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {remove.error && (
        <p role="alert" className="text-xs text-destructive">
          {remove.error.message}
        </p>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function AlertsPage() {
  const { isAuthenticated, isInitializing } = useAuth();
  return (
    <div
      data-ocid="alerts.page"
      className="mx-auto max-w-4xl space-y-6 p-4 md:p-6"
    >
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold">Alerts</h1>
        <p className="text-sm text-muted-foreground">
          Get told when a pool's APY or TVL crosses a line you set.
        </p>
      </header>
      {isInitializing ? (
        <LoadingState label="Checking your session…" />
      ) : isAuthenticated ? (
        <AlertsWorkspace />
      ) : (
        <SignInPrompt feature="your alert rules" />
      )}
    </div>
  );
}

export default AlertsPage;
