import React from "react";

// ── Electric blue shimmer skeleton ────────────────────────────────────────────
// Replaces gray pulse with animated electric blue gradient sweep
function Skel({
  className,
  style,
}: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={className}
      style={{
        borderRadius: 6,
        background: "rgba(0,163,255,0.05)",
        position: "relative",
        overflow: "hidden",
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(90deg, transparent 0%, rgba(0,163,255,0.12) 40%, rgba(0,163,255,0.22) 50%, rgba(0,163,255,0.12) 60%, transparent 100%)",
          backgroundSize: "200% 100%",
          animation: "blueShimmer 1.6s ease-in-out infinite",
        }}
      />
    </div>
  );
}

// ── Keyframe injection (once) ─────────────────────────────────────────────────
if (
  typeof document !== "undefined" &&
  !document.getElementById("blue-shimmer-kf")
) {
  const style = document.createElement("style");
  style.id = "blue-shimmer-kf";
  style.textContent = `
    @keyframes blueShimmer {
      0%   { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `;
  document.head.appendChild(style);
}

export const SkeletonCard = React.memo(function SkeletonCard() {
  return (
    <div
      style={{
        borderRadius: 12,
        border: "1px solid rgba(0,163,255,0.08)",
        background: "rgba(0,163,255,0.02)",
        padding: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <Skel
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            animationDelay: "0s",
          }}
        />
        <div
          style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}
        >
          <Skel style={{ height: 14, width: 96, animationDelay: "0.05s" }} />
          <Skel style={{ height: 12, width: 64, animationDelay: "0.1s" }} />
        </div>
        <Skel
          style={{
            height: 20,
            width: 56,
            borderRadius: 20,
            animationDelay: "0.15s",
          }}
        />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          marginBottom: 12,
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{ display: "flex", flexDirection: "column", gap: 4 }}
          >
            <Skel
              style={{
                height: 12,
                width: 48,
                animationDelay: `${0.2 + i * 0.05}s`,
              }}
            />
            <Skel
              style={{
                height: 16,
                width: 80,
                animationDelay: `${0.25 + i * 0.05}s`,
              }}
            />
          </div>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Skel
          style={{
            height: 20,
            width: 64,
            borderRadius: 20,
            animationDelay: "0.45s",
          }}
        />
        <Skel style={{ height: 12, width: 56, animationDelay: "0.5s" }} />
      </div>
    </div>
  );
});

export const SkeletonTable = React.memo(function SkeletonTable({
  rows = 5,
}: { rows?: number }) {
  const rowKeys = Array.from({ length: rows }, (_, i) => `sk-row-${i}`);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Header row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 16,
          padding: "8px 16px",
        }}
      >
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <Skel
            key={i}
            style={{ height: 12, animationDelay: `${(i - 1) * 0.05}s` }}
          />
        ))}
      </div>
      {/* Data rows */}
      {rowKeys.map((rk, rowIndex) => (
        <div
          key={rk}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: 16,
            padding: "12px 16px",
            borderRadius: 8,
            background: "rgba(0,163,255,0.02)",
          }}
        >
          {[1, 2, 3, 4, 5, 6, 7].map((j) => (
            <Skel
              key={j}
              style={{
                height: 14,
                animationDelay: `${(rowIndex * 7 + j - 1) * 0.05}s`,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
});

export const SkeletonChart = React.memo(function SkeletonChart() {
  const bars = React.useMemo(
    () =>
      Array.from({ length: 20 }, (_, i) => ({
        id: `bar-${i}`,
        h: 30 + ((i * 37 + 11) % 60),
      })),
    [],
  );
  return (
    <div
      style={{
        width: "100%",
        height: 192,
        borderRadius: 12,
        background: "rgba(0,163,255,0.02)",
        border: "1px solid rgba(0,163,255,0.06)",
        display: "flex",
        alignItems: "flex-end",
        gap: 4,
        padding: "0 16px 16px",
      }}
    >
      {bars.map(({ id, h }, index) => (
        <Skel
          key={id}
          style={{
            flex: 1,
            height: `${h}%`,
            borderRadius: "3px 3px 0 0",
            animationDelay: `${index * 0.05}s`,
          }}
        />
      ))}
    </div>
  );
});
