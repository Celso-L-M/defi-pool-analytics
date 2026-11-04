// ─── Toast Notification System ───────────────────────────────────────────────
// Pure vanilla TS — no external dependencies. Injects a fixed container into
// the DOM the first time a toast is shown, then self-cleans each toast after
// the display duration. Compatible with the app's dark theme.

export type ToastType = "success" | "error" | "info";

const DURATION_MS = 3000;
const FADE_MS = 300;

const BORDER_COLOR: Record<ToastType, string> = {
  success: "#22c55e",
  error: "#ef4444",
  info: "#3b82f6",
};

const ICON: Record<ToastType, string> = {
  success: "✓",
  error: "✕",
  info: "ℹ",
};

/** Returns (and lazily creates) the fixed toast container element. */
function getContainer(): HTMLElement {
  const existing = document.getElementById("toast-container");
  if (existing) return existing;

  const container = document.createElement("div");
  container.id = "toast-container";
  Object.assign(container.style, {
    position: "fixed",
    bottom: "24px",
    right: "24px",
    zIndex: "9999",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    pointerEvents: "none",
  } satisfies Partial<CSSStyleDeclaration>);

  document.body.appendChild(container);
  return container;
}

/**
 * Shows a toast notification in the bottom-right corner.
 *
 * @param message - Text to display.
 * @param type    - Visual style: 'success' | 'error' | 'info'.
 */
function showToast(message: string, type: ToastType): void {
  const container = getContainer();

  const el = document.createElement("div");
  Object.assign(el.style, {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    background: "oklch(var(--popover))",
    color: "oklch(var(--foreground))",
    border: "1px solid oklch(var(--border))",
    borderLeft: `4px solid ${BORDER_COLOR[type]}`,
    borderRadius: "8px",
    padding: "12px 16px",
    fontSize: "14px",
    lineHeight: "1.4",
    maxWidth: "340px",
    boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
    pointerEvents: "auto",
    opacity: "0",
    transform: "translateX(20px)",
    transition: `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease`,
    fontFamily: `'Space Grotesk', 'Segoe UI', Arial, sans-serif`,
    cursor: "pointer",
  } satisfies Partial<CSSStyleDeclaration>);

  // Icon badge
  const iconEl = document.createElement("span");
  iconEl.textContent = ICON[type];
  Object.assign(iconEl.style, {
    width: "20px",
    height: "20px",
    borderRadius: "50%",
    background: BORDER_COLOR[type],
    color: "#fff",
    fontSize: "11px",
    fontWeight: "700",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: "0",
  } satisfies Partial<CSSStyleDeclaration>);

  // Message text
  const textEl = document.createElement("span");
  textEl.textContent = message;

  el.appendChild(iconEl);
  el.appendChild(textEl);
  container.appendChild(el);

  // Dismiss on click
  el.addEventListener("click", () => dismiss(el, container));

  // Fade in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.style.opacity = "1";
      el.style.transform = "translateX(0)";
    });
  });

  // Auto-dismiss after DURATION_MS
  setTimeout(() => dismiss(el, container), DURATION_MS);
}

function dismiss(el: HTMLElement, container: HTMLElement): void {
  el.style.opacity = "0";
  el.style.transform = "translateX(20px)";
  setTimeout(() => {
    if (el.parentElement === container) {
      container.removeChild(el);
    }
  }, FADE_MS);
}

/** Toast helper — call toast.success(), toast.error(), or toast.info(). */
export const toast = {
  success: (message: string) => showToast(message, "success"),
  error: (message: string) => showToast(message, "error"),
  info: (message: string) => showToast(message, "info"),
};
