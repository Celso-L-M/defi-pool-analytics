import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { LogIn, ShieldCheck } from "lucide-react";

interface SignInPromptProps {
  /** What the user is trying to save, e.g. "your watchlist". */
  feature?: string;
  className?: string;
}

/** Shared prompt shown when a signed-out user tries to save something. */
export function SignInPrompt({
  feature = "your data",
  className,
}: SignInPromptProps) {
  const { login, isLoggingIn } = useAuth();
  return (
    <div
      data-ocid="sign_in_prompt"
      className={cn("state-panel state-panel-empty", className)}
    >
      <span className="state-icon">
        <ShieldCheck className="h-5 w-5" aria-hidden />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">
          Sign in to save {feature}
        </p>
        <p className="text-xs">
          Your saved items are stored privately against your Internet Identity.
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        data-ocid="sign_in_prompt.button"
        onClick={login}
        disabled={isLoggingIn}
      >
        <LogIn className="mr-1.5 h-4 w-4" aria-hidden />
        {isLoggingIn ? "Signing in…" : "Sign in"}
      </Button>
    </div>
  );
}

export default SignInPrompt;
