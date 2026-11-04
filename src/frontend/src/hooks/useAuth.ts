import { useInternetIdentity } from "@caffeineai/core-infrastructure";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

export function shortenPrincipal(text: string): string {
  return text.length <= 13 ? text : `${text.slice(0, 5)}…${text.slice(-3)}`;
}

/** Sign-in state, principal text and logout that also clears cached data. */
export function useAuth() {
  const {
    identity,
    login,
    clear,
    isAuthenticated,
    isInitializing,
    isLoggingIn,
    isLoginError,
    loginError,
  } = useInternetIdentity();
  const queryClient = useQueryClient();

  const principalText = useMemo(
    () => (identity ? identity.getPrincipal().toText() : ""),
    [identity],
  );

  const logout = useCallback(() => {
    clear();
    queryClient.removeQueries({ queryKey: ["backend"] });
  }, [clear, queryClient]);

  return {
    isAuthenticated,
    isInitializing,
    isLoggingIn,
    isLoginError,
    loginError,
    login,
    logout,
    principalText,
    shortPrincipal: shortenPrincipal(principalText),
  };
}
