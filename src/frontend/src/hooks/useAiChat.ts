import { createActor } from "@/backend";
import { useAuth } from "@/hooks/useAuth";
import { useActor } from "@caffeineai/core-infrastructure";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type ChatRole = "system" | "user" | "assistant";
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface InferenceCredentials {
  baseUrl: string;
  apiKey: string;
  expiresAt: string;
}

type StreamChat = (
  messages: ChatMessage[],
  onToken: (text: string) => void,
  signal?: AbortSignal,
) => Promise<string>;

/**
 * Frontend-direct Caffeine Inference client. The key is kept in memory only,
 * renewed once when the gateway answers 401, and replies stream token by token.
 */
function createInferenceChat(
  getCredentials: () => Promise<InferenceCredentials>,
): StreamChat {
  let current: Promise<InferenceCredentials> | null = null;
  const credentials = (renew: boolean) => {
    if (renew || !current) {
      const next = getCredentials();
      current = next;
      next.catch(() => {
        if (current === next) current = null;
      });
    }
    return current;
  };

  return async (messages, onToken, signal) => {
    for (let attempt = 0; ; attempt++) {
      const { baseUrl, apiKey } = await credentials(attempt > 0);
      const response = await fetch(
        `${baseUrl.replace(/\/+$/, "")}/v1/chat/completions`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ model: "router", messages, stream: true }),
          signal,
        },
      );
      if (response.status === 401 && attempt === 0) continue;
      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(
          body?.error?.message ?? `Inference failed: HTTP ${response.status}`,
        );
      }
      let text = "";
      let buffer = "";
      const reader = response.body
        .pipeThrough(new TextDecoderStream())
        .getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const data = line.startsWith("data:") ? line.slice(5).trim() : "";
          if (!data || data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data) as {
              choices?: { delta?: { content?: string } }[];
            };
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              text += delta;
              onToken(delta);
            }
          } catch {
            // Ignore a malformed keep-alive line.
          }
        }
      }
      if (!text) throw new Error("The assistant returned no text");
      return text;
    }
  };
}

/**
 * The single shared AI chat client. Ready once the user is signed in and the
 * actor exists. `send` streams a reply, calling `onToken` for every chunk
 * (the per-call callback wins over the one passed to the hook).
 */
export function useAiChat(onToken?: (text: string) => void) {
  const { actor } = useActor(createActor);
  const { isAuthenticated } = useAuth();
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  const chat = useMemo<StreamChat | null>(
    () =>
      actor && isAuthenticated
        ? createInferenceChat(() => actor.getInferenceCredentials())
        : null,
    [actor, isAuthenticated],
  );

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async (
      messages: ChatMessage[],
      perCallOnToken?: (text: string) => void,
    ): Promise<string | null> => {
      if (!chat) {
        setError(new Error("Sign in to use the AI assistant."));
        return null;
      }
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setError(null);
      setIsStreaming(true);
      try {
        return await chat(
          messages,
          (token) => (perCallOnToken ?? onTokenRef.current)?.(token),
          controller.signal,
        );
      } catch (e) {
        if (controller.signal.aborted) return null;
        setError(
          e instanceof Error ? e : new Error("Assistant request failed"),
        );
        return null;
      } finally {
        if (abortRef.current === controller) setIsStreaming(false);
      }
    },
    [chat],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  return { send, cancel, isReady: chat !== null, isStreaming, error };
}
