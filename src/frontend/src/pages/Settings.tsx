import { type Settings, Theme } from "@/backend";
import { ErrorState } from "@/components/DataStates";
import { SignInPrompt } from "@/components/SignInPrompt";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import {
  themeToBackend,
  useDeleteAllMyData,
  useHasVerifiedEmail,
  useSettings,
  useUpdateSettings,
} from "@/hooks/useQueries";
import { type ThemePreference, useDefiStore } from "@/store/useDefiStore";
import {
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  Mail,
  MailWarning,
  Trash2,
} from "lucide-react";
import { type ReactNode, useState } from "react";

const THEME_OPTIONS: { value: ThemePreference; label: string; hint: string }[] =
  [
    { value: "dark", label: "Dark", hint: "Terminal look" },
    { value: "light", label: "Light", hint: "Bright surfaces" },
    { value: "auto", label: "Auto", hint: "Match your system" },
  ];

function themeFromBackend(theme: Theme): ThemePreference {
  return theme === Theme.light
    ? "light"
    : theme === Theme.auto
      ? "auto"
      : "dark";
}

function Section({
  title,
  description,
  ocid,
  children,
}: {
  title: string;
  description: string;
  ocid: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-section" data-ocid={ocid}>
      <header className="settings-section-header">
        <h2 className="font-display text-base font-semibold">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </header>
      {children}
    </section>
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-4" data-ocid="settings.loading_state">
      {["preferences", "identity", "data"].map((id) => (
        <Skeleton key={id} className="h-36 w-full" />
      ))}
    </div>
  );
}

function SettingsContent() {
  const { principalText } = useAuth();
  const settingsQuery = useSettings();
  const emailQuery = useHasVerifiedEmail();
  const update = useUpdateSettings();
  const deleteAll = useDeleteAllMyData();
  const setTheme = useDefiStore((s) => s.setTheme);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (settingsQuery.isLoading) return <SettingsSkeleton />;
  if (settingsQuery.isError || !settingsQuery.data) {
    return (
      <ErrorState
        title="Could not load your settings"
        message={
          settingsQuery.error instanceof Error
            ? settingsQuery.error.message
            : "Check your connection and try again."
        }
        onRetry={() => void settingsQuery.refetch()}
      />
    );
  }

  // Optimistic view: while a save is in flight, show the values being saved.
  const current: Settings =
    update.isPending && update.variables
      ? update.variables
      : settingsQuery.data;

  function save(next: Settings, previousTheme: ThemePreference) {
    setSaveError(null);
    setTheme(themeFromBackend(next.theme));
    update.mutate(next, {
      onError: (error) => {
        setTheme(previousTheme);
        setSaveError(
          error instanceof Error ? error.message : "Could not save settings.",
        );
      },
    });
  }

  const currentTheme = themeFromBackend(current.theme);

  async function copyPrincipal() {
    try {
      await navigator.clipboard.writeText(principalText);
      setCopied(true);
      setCopyFailed(false);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyFailed(true);
    }
  }

  function confirmDelete() {
    deleteAll.mutate(undefined, {
      onSuccess: () => setConfirmOpen(false),
    });
  }

  return (
    <div className="space-y-4">
      <div
        className="min-h-5 text-xs"
        aria-live="polite"
        data-ocid="settings.save_status"
      >
        {update.isPending ? (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Saving changes…
          </span>
        ) : saveError ? (
          <span
            role="alert"
            className="text-destructive"
            data-ocid="settings.error_state"
          >
            {saveError} Your previous settings were kept.
          </span>
        ) : update.isSuccess ? (
          <span
            className="inline-flex items-center gap-1.5 text-primary"
            data-ocid="settings.success_state"
          >
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            Settings saved
          </span>
        ) : null}
      </div>

      <Section
        title="Preferences"
        description="Saved to your account and restored on every device."
        ocid="settings.preferences.section"
      >
        <div className="settings-row">
          <div className="min-w-0">
            <Label htmlFor="email-alerts" className="text-sm font-medium">
              Email alerts
            </Label>
            <p className="text-xs text-muted-foreground">
              Send an email when one of your alert rules triggers.
            </p>
          </div>
          <Switch
            id="email-alerts"
            data-ocid="settings.email_alerts.switch"
            checked={current.emailAlertsEnabled}
            onCheckedChange={(checked) =>
              save({ ...current, emailAlertsEnabled: checked }, currentTheme)
            }
          />
        </div>
        <div className="settings-row">
          <div className="min-w-0">
            <Label htmlFor="auto-refresh" className="text-sm font-medium">
              Auto-refresh data
            </Label>
            <p className="text-xs text-muted-foreground">
              Keep pool, APY and market tables up to date in the background.
            </p>
          </div>
          <Switch
            id="auto-refresh"
            data-ocid="settings.auto_refresh.switch"
            checked={current.autoRefreshEnabled}
            onCheckedChange={(checked) =>
              save({ ...current, autoRefreshEnabled: checked }, currentTheme)
            }
          />
        </div>
        <div className="settings-row flex-col items-stretch sm:flex-row sm:items-center">
          <div className="min-w-0">
            <p className="text-sm font-medium" id="theme-label">
              Theme
            </p>
            <p className="text-xs text-muted-foreground">
              Applied immediately.
            </p>
          </div>
          <RadioGroup
            aria-labelledby="theme-label"
            className="grid grid-cols-3 gap-2"
            value={currentTheme}
            onValueChange={(value) =>
              save(
                { ...current, theme: themeToBackend(value as ThemePreference) },
                currentTheme,
              )
            }
            data-ocid="settings.theme.radio"
          >
            {THEME_OPTIONS.map((option) => (
              <Label
                key={option.value}
                htmlFor={`theme-${option.value}`}
                data-ocid={`settings.theme_${option.value}.radio`}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm transition-colors hover:bg-muted/60 has-[:checked]:border-primary has-[:checked]:bg-primary/10"
              >
                <RadioGroupItem
                  id={`theme-${option.value}`}
                  value={option.value}
                />
                <span title={option.hint}>{option.label}</span>
              </Label>
            ))}
          </RadioGroup>
        </div>
      </Section>

      <Section
        title="Identity"
        description="Your Internet Identity principal owns all saved data."
        ocid="settings.identity.section"
      >
        <div className="settings-row flex-col items-stretch sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Principal</p>
            <p
              className="mt-1 break-all font-mono text-xs text-muted-foreground"
              data-ocid="settings.principal.text"
            >
              {principalText}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-ocid="settings.copy_principal.button"
            onClick={() => void copyPrincipal()}
          >
            {copied ? (
              <Check className="mr-1.5 h-4 w-4" aria-hidden />
            ) : (
              <Copy className="mr-1.5 h-4 w-4" aria-hidden />
            )}
            {copied ? "Copied" : copyFailed ? "Copy failed" : "Copy principal"}
          </Button>
        </div>
        <div className="settings-row">
          <div className="min-w-0">
            <p className="text-sm font-medium">Verified email</p>
            <p className="text-xs text-muted-foreground">
              Required to deliver email alerts.
            </p>
          </div>
          <div data-ocid="settings.verified_email.panel" aria-live="polite">
            {emailQuery.isLoading ? (
              <Skeleton className="h-5 w-28" />
            ) : emailQuery.isError ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-ocid="settings.email_retry.button"
                onClick={() => void emailQuery.refetch()}
              >
                Retry
              </Button>
            ) : emailQuery.data ? (
              <span className="inline-flex items-center gap-1.5 text-sm text-primary">
                <Mail className="h-4 w-4" aria-hidden />
                Email available
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <MailWarning className="h-4 w-4" aria-hidden />
                No verified email
              </span>
            )}
          </div>
        </div>
      </Section>

      <Section
        title="Your data"
        description="Watchlist, positions, wallets, alert rules and alert history."
        ocid="settings.data.section"
      >
        <div className="settings-row flex-col items-stretch sm:flex-row sm:items-center">
          <div className="min-w-0">
            <p className="text-sm font-medium">Delete my saved data</p>
            <p className="text-xs text-muted-foreground">
              Permanently removes everything stored for this identity. Your
              preferences stay.
            </p>
            {deleteAll.isSuccess && !confirmOpen && (
              <p
                className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-primary"
                data-ocid="settings.delete.success_state"
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                All saved data was deleted.
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            data-ocid="settings.delete_data.open_modal_button"
            onClick={() => {
              deleteAll.reset();
              setConfirmOpen(true);
            }}
          >
            <Trash2 className="mr-1.5 h-4 w-4" aria-hidden />
            Delete my saved data
          </Button>
        </div>
      </Section>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!deleteAll.isPending) setConfirmOpen(open);
        }}
      >
        <AlertDialogContent data-ocid="settings.delete.dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all saved data?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes your watchlist, positions, tracked
              wallets, alert rules and alert history. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteAll.isError && (
            <p
              role="alert"
              className="text-sm text-destructive"
              data-ocid="settings.delete.error_state"
            >
              {deleteAll.error instanceof Error
                ? deleteAll.error.message
                : "Deletion failed."}{" "}
              Nothing was removed — try again.
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel
              type="button"
              disabled={deleteAll.isPending}
              data-ocid="settings.delete.cancel_button"
            >
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteAll.isPending}
              data-ocid="settings.delete.confirm_button"
              onClick={confirmDelete}
            >
              {deleteAll.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="mr-1.5 h-4 w-4" aria-hidden />
              )}
              {deleteAll.isPending
                ? "Deleting…"
                : deleteAll.isError
                  ? "Retry delete"
                  : "Delete everything"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function SettingsPage() {
  const { isAuthenticated, isInitializing } = useAuth();
  return (
    <div
      className="mx-auto max-w-3xl space-y-4 p-4 md:p-6"
      data-ocid="settings.page"
    >
      <div>
        <h1 className="font-display text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Preferences, identity and data controls.
        </p>
      </div>
      {isInitializing ? (
        <SettingsSkeleton />
      ) : isAuthenticated ? (
        <SettingsContent />
      ) : (
        <SignInPrompt feature="your settings" />
      )}
    </div>
  );
}

export default SettingsPage;
