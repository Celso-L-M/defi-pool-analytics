import { DemoBadge } from "@/components/DemoBadge";
import { SignInPrompt } from "@/components/SignInPrompt";
import { Button } from "@/components/ui/button";
import { useAiChat } from "@/hooks/useAiChat";
import type { ChatMessage } from "@/hooks/useAiChat";
import { useAuth } from "@/hooks/useAuth";
import { usePools } from "@/hooks/useLiveData";
import { usePositions, useWatchlist } from "@/hooks/useQueries";
import { cn } from "@/lib/utils";
import { useDefiStore } from "@/store/useDefiStore";
import type { Pool } from "@/types/defi";
import { computeRiskScore } from "@/utils/riskScore";
import {
  AlertTriangle,
  Brain,
  RefreshCw,
  Send,
  Square,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ─── Prompt grounding ────────────────────────────────────────────────────────

const TOP_POOL_COUNT = 12;
const MAX_HISTORY_MESSAGES = 12;

interface UiMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
}

function money(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function describePool(pool: Pool): string {
  const risk = computeRiskScore(pool);
  return [
    `${pool.name}`,
    `project ${pool.project ?? pool.protocol}`,
    `chain ${pool.chain}`,
    `APY ${pool.apy.current.toFixed(2)}% (30d avg ${pool.apy.day30Avg.toFixed(2)}%)`,
    `TVL ${money(pool.stats.tvl)}`,
    `risk ${risk.score}/10 ${risk.level}`,
    pool.stablecoin ? "stablecoin" : "volatile assets",
  ].join(" | ");
}

function matchPool(pools: Pool[], poolId: string): Pool | undefined {
  return pools.find((p) => p.id === poolId || p.poolId === poolId);
}

function entryDate(timestampNs: bigint): string {
  const date = new Date(Number(timestampNs / 1_000_000n));
  return Number.isNaN(date.getTime())
    ? "unknown date"
    : date.toISOString().slice(0, 10);
}

interface PromptSource {
  pools: Pool[];
  isDemo: boolean;
  isLoading: boolean;
  focus: Pool | undefined;
  watchlist: ReturnType<typeof useWatchlist>["data"];
  positions: ReturnType<typeof usePositions>["data"];
}

function buildSystemPrompt(src: PromptSource): string {
  const top = [...src.pools]
    .sort((a, b) => b.stats.tvl - a.stats.tvl)
    .slice(0, TOP_POOL_COUNT);
  const lines: string[] = [
    "You are the assistant inside a DeFi yield and pool analytics dashboard.",
    "Answer ONLY from the data below. If something is not in the data, say it is missing instead of guessing or inventing numbers.",
    "Keep answers concise: short paragraphs or a few bullets, no more than about 150 words unless asked.",
    "Never present anything as financial advice; point out risks and trade-offs.",
    src.isDemo
      ? "DATA SOURCE: DEMO data (live sources failed). Say so when giving figures."
      : "DATA SOURCE: live DefiLlama pool data.",
    src.isLoading ? "Pool data is still loading, so it may be incomplete." : "",
    "",
    `TOP POOLS BY TVL (${top.length}):`,
    ...(top.length > 0
      ? top.map((p, i) => `${i + 1}. ${describePool(p)}`)
      : ["No pool data is available."]),
  ];

  if (src.focus) {
    lines.push("", `POOL SELECTED BY THE USER: ${describePool(src.focus)}`);
  }

  lines.push("", "USER WATCHLIST:");
  if (!src.watchlist || src.watchlist.length === 0) {
    lines.push("Empty or not loaded.");
  } else {
    for (const entry of src.watchlist) {
      const pool = matchPool(src.pools, entry.poolId);
      lines.push(
        pool
          ? `- ${describePool(pool)}`
          : `- ${entry.displayName} | project ${entry.project} | chain ${entry.chain} | no current pool data loaded`,
      );
    }
  }

  lines.push("", "USER POSITIONS:");
  if (!src.positions || src.positions.length === 0) {
    lines.push("Empty or not loaded.");
  } else {
    for (const pos of src.positions) {
      const pool = matchPool(src.pools, pos.poolId);
      lines.push(
        `- ${pos.displayName} (${pos.symbol}) | invested ${money(pos.amountUsd)} on ${entryDate(pos.entryTimestamp)}${
          pool
            ? ` | now APY ${pool.apy.current.toFixed(2)}%, TVL ${money(pool.stats.tvl)}, risk ${computeRiskScore(pool).score}/10 ${computeRiskScore(pool).level}`
            : " | no current pool data loaded"
        }`,
      );
    }
  }
  return lines.filter((l, i, all) => l !== "" || all[i - 1] !== "").join("\n");
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AIAssistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [useFocus, setUseFocus] = useState(true);
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);

  const { isAuthenticated } = useAuth();
  const { send, cancel, isReady, isStreaming, error } = useAiChat();
  const pools = usePools();
  const watchlist = useWatchlist();
  const positions = usePositions();
  const selectedPoolIds = useDefiStore((s) => s.selectedPoolIds);

  const focusId = selectedPoolIds[selectedPoolIds.length - 1];
  const focusPool = useMemo(
    () => (focusId ? matchPool(pools.data, focusId) : undefined),
    [pools.data, focusId],
  );

  const systemPrompt = useMemo(
    () =>
      buildSystemPrompt({
        pools: pools.data,
        isDemo: pools.isDemo,
        isLoading: pools.isLoading,
        focus: useFocus ? focusPool : undefined,
        watchlist: watchlist.data,
        positions: positions.data,
      }),
    [
      pools.data,
      pools.isDemo,
      pools.isLoading,
      useFocus,
      focusPool,
      watchlist.data,
      positions.data,
    ],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on every message update
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, isStreaming]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const run = useCallback(
    async (history: UiMessage[]) => {
      const replyId = nextId.current++;
      setMessages([
        ...history,
        { id: replyId, role: "assistant", content: "" },
      ]);
      const payload: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        ...history
          .slice(-MAX_HISTORY_MESSAGES)
          .map((m) => ({ role: m.role, content: m.content })),
      ];
      await send(payload, (token) =>
        setMessages((prev) =>
          prev.map((m) =>
            m.id === replyId ? { ...m, content: m.content + token } : m,
          ),
        ),
      );
      // Drop an empty reply (error or stopped before any text arrived).
      setMessages((prev) =>
        prev.filter((m) => m.id !== replyId || m.content.length > 0),
      );
    },
    [send, systemPrompt],
  );

  const ask = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming || !isReady) return;
      setInput("");
      void run([
        ...messages,
        { id: nextId.current++, role: "user", content: trimmed },
      ]);
    },
    [isStreaming, isReady, messages, run],
  );

  const retry = useCallback(() => {
    if (isStreaming || messages.length === 0) return;
    void run(messages);
  }, [isStreaming, messages, run]);

  const clear = useCallback(() => {
    cancel();
    setMessages([]);
  }, [cancel]);

  const chips = [
    "Explain the top pool",
    "Compare my watchlist pools",
    "Review my positions",
    ...(focusPool && useFocus ? [`Explain the risk of ${focusPool.name}`] : []),
  ];
  const lastMessage = messages[messages.length - 1];
  const waitingForFirstToken =
    isStreaming && lastMessage?.role === "assistant" && !lastMessage.content;
  const showError =
    !!error &&
    !isStreaming &&
    messages.length > 0 &&
    lastMessage?.role === "user";

  return (
    <>
      <button
        type="button"
        data-ocid="ai_assistant.open_modal_button"
        aria-label={open ? "Close AI assistant" : "Open AI assistant"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] right-4 z-50 flex min-h-[44px] items-center gap-2 rounded-full border border-primary/60 bg-card px-4 text-sm font-semibold text-primary shadow-lg transition-smooth hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:bottom-6 md:right-6",
          open && "bg-primary/15",
        )}
      >
        <Brain className="h-5 w-5" aria-hidden />
        <span className="hidden sm:inline">AI Assistant</span>
      </button>

      {open && (
        <section
          data-ocid="ai_assistant.dialog"
          aria-label="AI assistant"
          className="ai-panel fixed bottom-[calc(8rem+env(safe-area-inset-bottom,0px))] right-4 z-50 h-[min(36rem,calc(100dvh-10rem))] w-[min(26rem,calc(100vw-2rem))] overflow-hidden md:bottom-24 md:right-6"
        >
          <header className="ai-panel-header flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Brain className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              <h2 className="truncate font-mono text-xs font-bold uppercase tracking-[0.14em] text-primary">
                AI Assistant
              </h2>
              {pools.isDemo && <DemoBadge />}
            </div>
            <div className="flex items-center gap-1">
              {isReady && messages.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  aria-label="Clear conversation"
                  data-ocid="ai_assistant.delete_button"
                  onClick={clear}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                aria-label="Close AI assistant"
                data-ocid="ai_assistant.close_button"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </header>

          {!isReady ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
              {isAuthenticated ? (
                <output
                  data-ocid="ai_assistant.loading_state"
                  className="block text-sm text-muted-foreground"
                >
                  Connecting the assistant…
                </output>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Signing in enables the AI assistant. It reads the pools,
                    watchlist and positions you see and answers questions about
                    them.
                  </p>
                  <SignInPrompt feature="AI insights" />
                </>
              )}
            </div>
          ) : (
            <>
              <div
                className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"
                aria-live="polite"
                data-ocid="ai_assistant.list"
              >
                {messages.length === 0 && (
                  <div
                    data-ocid="ai_assistant.empty_state"
                    className="space-y-1 pt-4 text-center"
                  >
                    <Brain
                      className="mx-auto h-8 w-8 text-primary"
                      aria-hidden
                    />
                    <p className="text-sm font-medium text-foreground">
                      Ask about the pools on screen
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Answers use only your loaded pools, watchlist and
                      positions.
                    </p>
                  </div>
                )}
                {messages.map((m, i) => (
                  <div
                    key={m.id}
                    data-ocid={`ai_assistant.item.${i + 1}`}
                    className={cn(
                      "ai-msg whitespace-pre-wrap break-words",
                      m.role === "user" ? "ai-msg-user" : "ai-msg-assistant",
                    )}
                  >
                    {m.content}
                  </div>
                ))}
                {waitingForFirstToken && (
                  <output
                    data-ocid="ai_assistant.loading_state"
                    className="ai-typing ai-msg-assistant block self-start rounded-xl px-3 py-3"
                    aria-label="Assistant is thinking"
                  >
                    <span />
                    <span />
                    <span />
                  </output>
                )}
                {showError && (
                  <div
                    data-ocid="ai_assistant.error_state"
                    role="alert"
                    className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-foreground"
                  >
                    <AlertTriangle
                      className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="break-words">{error?.message}</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8"
                        data-ocid="ai_assistant.secondary_button"
                        onClick={retry}
                      >
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                        Retry
                      </Button>
                    </div>
                  </div>
                )}
                <div ref={endRef} />
              </div>

              <div className="shrink-0 space-y-2 border-t border-border/50 p-3">
                <div className="flex flex-wrap gap-1.5">
                  {chips.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      className="ai-chip min-h-[28px] disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={isStreaming}
                      data-ocid="ai_assistant.secondary_button"
                      onClick={() => ask(chip)}
                    >
                      {chip}
                    </button>
                  ))}
                </div>

                {focusPool && (
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={useFocus}
                      onChange={(e) => setUseFocus(e.target.checked)}
                      className="h-3.5 w-3.5 accent-primary"
                      data-ocid="ai_assistant.checkbox"
                    />
                    <Target
                      className="h-3.5 w-3.5 shrink-0 text-primary"
                      aria-hidden
                    />
                    <span className="min-w-0 truncate">
                      Focus on selected pool:{" "}
                      <span className="font-mono text-foreground">
                        {focusPool.name}
                      </span>
                    </span>
                  </label>
                )}

                <form
                  className="flex items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    ask(input);
                  }}
                >
                  <label htmlFor="ai-assistant-input" className="sr-only">
                    Ask the AI assistant
                  </label>
                  <textarea
                    id="ai-assistant-input"
                    rows={1}
                    value={input}
                    maxLength={500}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        ask(input);
                      }
                    }}
                    placeholder="Ask about pools, risk, positions…"
                    data-ocid="ai_assistant.textarea"
                    className="max-h-24 min-h-[40px] flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  {isStreaming ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 shrink-0"
                      aria-label="Stop response"
                      data-ocid="ai_assistant.cancel_button"
                      onClick={cancel}
                    >
                      <Square className="h-4 w-4" aria-hidden />
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      size="icon"
                      className="h-10 w-10 shrink-0"
                      aria-label="Send message"
                      disabled={input.trim().length === 0}
                      data-ocid="ai_assistant.submit_button"
                    >
                      <Send className="h-4 w-4" aria-hidden />
                    </Button>
                  )}
                </form>
                <p
                  data-ocid="ai_assistant.disclaimer"
                  className="text-[10px] leading-snug text-muted-foreground"
                >
                  AI responses are generated from on-screen data and are not
                  financial advice. Verify before you act.
                </p>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}

export default AIAssistant;
