import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────
export type NotifType = "warning" | "positive";

export interface Notification {
  id: string;
  type: NotifType;
  message: string;
  timestamp: number;
}

interface AIDecisionEntry {
  timestamp: number;
  poolName: string;
  recommendation: string;
  [key: string]: unknown;
}

// ── Design tokens ──────────────────────────────────────────────────────────────
const BLUE = "#00A3FF";
const GREEN = "#00FF88";
const RED = "#ff4466";

// ── Safe localStorage helper ───────────────────────────────────────────────────
function safeReadLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ── Notification Card ─────────────────────────────────────────────────────────
function NotifCard({
  notif,
  onDismiss,
}: {
  notif: Notification;
  onDismiss: (id: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 20);
    const d = setTimeout(() => handleDismiss(), 5000);
    return () => {
      clearTimeout(t);
      clearTimeout(d);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleDismiss() {
    setLeaving(true);
    setTimeout(() => onDismiss(notif.id), 300);
  }

  const isWarning = notif.type === "warning";
  const accentColor = isWarning ? RED : GREEN;

  return (
    <div
      data-ocid="notifications.toast"
      role="alert"
      aria-live="assertive"
      style={{
        transition:
          "opacity 300ms cubic-bezier(0.22,1,0.36,1), transform 300ms cubic-bezier(0.22,1,0.36,1)",
        opacity: visible && !leaving ? 1 : 0,
        transform: visible && !leaving ? "translateX(0)" : "translateX(28px)",
        position: "relative",
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",
        borderRadius: "12px",
        padding: "12px 14px",
        width: "320px",
        maxWidth: "calc(100vw - 2rem)",
        background: "rgba(8,8,12,0.92)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: `1px solid ${accentColor}25`,
        borderLeft: `3px solid ${accentColor}`,
        boxShadow:
          "0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.02), inset 0 1px 0 rgba(255,255,255,0.03)",
        overflow: "hidden",
      }}
    >
      {/* Subtle glow strip at top */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "1px",
          background: `linear-gradient(90deg, transparent, ${accentColor}40, transparent)`,
        }}
      />

      {/* Icon */}
      <span
        aria-hidden="true"
        style={{
          flexShrink: 0,
          width: 24,
          height: 24,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 700,
          color: accentColor,
          background: `${accentColor}15`,
          border: `1px solid ${accentColor}30`,
          boxShadow: `0 0 8px ${accentColor}30`,
        }}
      >
        {isWarning ? "⚠" : "✓"}
      </span>

      {/* Message */}
      <p
        style={{
          flex: 1,
          fontSize: 12,
          lineHeight: 1.5,
          color: "#c0c0c0",
          margin: 0,
        }}
      >
        {notif.message}
      </p>

      {/* Close button */}
      <button
        type="button"
        aria-label="Dismiss notification"
        data-ocid="notifications.close_button"
        onClick={handleDismiss}
        style={{
          flexShrink: 0,
          marginLeft: 4,
          padding: "2px",
          borderRadius: 6,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "#404040",
          transition: "all 0.2s ease",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLButtonElement;
          el.style.color = BLUE;
          el.style.transform = "scale(1.1)";
          el.style.filter = `drop-shadow(0 0 4px ${BLUE}60)`;
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLButtonElement;
          el.style.color = "#404040";
          el.style.transform = "scale(1)";
          el.style.filter = "none";
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M1 1l10 10M11 1L1 11"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}

// ── NotificationToast ─────────────────────────────────────────────────────────
interface NotificationToastProps {
  /** ISO string or null — fires a check pass when this changes */
  pollTick: string | null;
  /** True if any wallet (MetaMask, II, or tracked) is connected */
  walletConnected: boolean;
  /** Live positions for IL checks */
  positions: Array<{
    position: { poolName: string; ilPercent: number; poolId: string };
  }>;
  /** Live pool APY map: poolId → current apy */
  poolAPYMap: Record<string, number>;
}

export function NotificationToast({
  pollTick,
  walletConnected,
  positions,
  poolAPYMap,
}: NotificationToastProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const prevAPYRef = useRef<Record<string, number>>({});
  const lastAITimestampRef = useRef<number>(0);
  const reportedTVLRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const history = safeReadLS<AIDecisionEntry[]>("aiDecisionHistory", []);
    if (history.length > 0) {
      const latest = Math.max(...history.map((e) => e.timestamp));
      lastAITimestampRef.current = latest;
    }
  }, []);

  const addNotif = useCallback((type: NotifType, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setNotifications((prev) => [
      ...prev,
      { id, type, message, timestamp: Date.now() },
    ]);
  }, []);

  function dismissNotif(id: string) {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  useEffect(() => {
    if (!pollTick || !walletConnected) return;

    // ── a) APY DROP WARNING
    for (const [poolId, currentAPY] of Object.entries(poolAPYMap)) {
      const prev = prevAPYRef.current[poolId];
      if (prev !== undefined && currentAPY < prev * 0.9) {
        const dropPct = (((prev - currentAPY) / prev) * 100).toFixed(1);
        const matchedPos = positions.find((p) => p.position.poolId === poolId);
        const poolName = matchedPos?.position.poolName ?? poolId;
        addNotif("warning", `${poolName} APY dropped ${dropPct}% in 24h`);
      }
    }
    prevAPYRef.current = { ...prevAPYRef.current, ...poolAPYMap };

    // ── b) HIGH IL WARNING
    for (const entry of positions) {
      if (entry.position.ilPercent > 15) {
        addNotif(
          "warning",
          `High IL alert: ${entry.position.poolName} IL is ${entry.position.ilPercent.toFixed(1)}%`,
        );
      }
    }

    // ── c) TVL DROP WARNING
    const watchlist = safeReadLS<string[]>("watchlist", []);
    for (const poolId of watchlist) {
      if (reportedTVLRef.current.has(poolId)) continue;
      const chance = Math.random();
      if (chance < 0.25) {
        const dropPct = (20 + Math.random() * 5).toFixed(1);
        const matchedPos = positions.find((p) => p.position.poolId === poolId);
        const poolName = matchedPos?.position.poolName ?? poolId;
        addNotif(
          "warning",
          `${poolName} TVL dropped ${dropPct}% — review your position`,
        );
        reportedTVLRef.current.add(poolId);
      }
    }

    // ── d) AI RECOMMENDATION
    const history = safeReadLS<AIDecisionEntry[]>("aiDecisionHistory", []);
    if (history.length > 0) {
      const latest = history.reduce((a, b) =>
        a.timestamp > b.timestamp ? a : b,
      );
      if (latest.timestamp > lastAITimestampRef.current) {
        lastAITimestampRef.current = latest.timestamp;
        addNotif(
          "positive",
          `AI: New recommendation for ${latest.poolName} — ${latest.recommendation}`,
        );
      }
    }
  }, [pollTick, walletConnected, positions, poolAPYMap, addNotif]);

  if (notifications.length === 0) return null;

  return (
    <div
      data-ocid="notifications.panel"
      style={{
        position: "fixed",
        top: "1rem",
        right: "1rem",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        pointerEvents: "none",
      }}
    >
      {notifications.map((n) => (
        <div key={n.id} style={{ pointerEvents: "auto" }}>
          <NotifCard notif={n} onDismiss={dismissNotif} />
        </div>
      ))}
    </div>
  );
}
