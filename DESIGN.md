# Design Brief: DeFi Pool Analytics — Bloomberg Terminal Meets Modern DeFi

## Direction

Dark institutional terminal: near-black surfaces, glass cards, electric blue (#00A3FF) data accents, neon green (#00FF88) positive metrics. Extends the original system; nothing removed.

## Tone

Precise, dense, data-forward. Productivity tool: restrained decoration, glow reserved for key metrics only.

## Differentiation

Neon-green metric glows plus a risk language (low/medium/high) and a dashed amber "Demo data" badge that makes data provenance always visible.

## Color Palette

| Token | OKLCH | Role |
|-------|-------|------|
| background | `0.05 0 0` | App canvas |
| card / popover | `0.08 0.02 260` / `0.1 0.02 260` | Glass surfaces, dropdowns |
| primary / info | `0.7 0.2 210` | Electric blue: active, charts, links |
| accent / success | `0.75 0.25 150` | Neon green: positive, live, enabled |
| warning | `0.82 0.17 85` | Amber: caution, medium risk |
| destructive | `0.6 0.22 25` | Losses, errors |
| risk-low / medium / high | `0.78 0.22 150` / `0.82 0.17 85` / `0.66 0.23 25` | Risk score levels |
| demo | `0.82 0.15 70` | Demo data badge (amber, dashed) |
| alert-triggered / enabled / disabled | `0.72 0.21 40` / `0.75 0.25 150` / `0.5 0.01 260` | Alert rule states |

Tailwind keys: `text-risk-high`, `bg-demo/10`, `text-alert-triggered`, `text-success`, `text-warning`, `text-info`.

## Typography

- Display + body: Space Grotesk 400–700 (headings, labels, prose)
- Mono: JetBrains Mono (`font-mono`, `.font-numeric`) for numbers, scores, addresses, badges
- Scale: 32/28, 24/20, 16/14, 14/12, 12/10px; tabular numerals for all tables

## Elevation & Depth

Glass layers (blur 8px, 0.85 alpha) with blue-tinted borders; popovers (`.notif-list`, `.ai-panel`) use blur 12–16px, deeper shadow `shadow-popover`.

## Structural Zones

| Zone | Background | Border | Notes |
|------|-----------|--------|-------|
| Header | `bg-card` | `border-b` | Holds Demo/Live badge, bell, user menu |
| Sidebar | `bg-sidebar` | `border-r` | Active item: blue left bar. Items add Alerts, Portfolio, Settings |
| Content | `bg-background` | — | Cards on `.glass-card` |
| Popovers | `.notif-list` | blue @ 0.25 | Bell list, user menu |
| Assistant | `.ai-panel` | blue @ 0.3 | Floating, bottom-right; full-width sheet on mobile |

## Component Patterns

- Risk: `.risk-badge .risk-badge-{low|medium|high}` shows "score/10 LABEL"; `.risk-meter .risk-meter-{level}` with child `<span style="width:score*10%">`. Add one-line explanation in muted text.
- Demo data: `.demo-badge` beside any section using fallback data; `.live-badge` when live. Never mix silently.
- Alert states: `.alert-state-{triggered|enabled|disabled}` pills; `.alert-rule-row[data-state]` colored left bar; disabled rows 65% opacity.
- Loading: `.skeleton` blocks matching content shape. Empty: `.state-panel .state-panel-empty` (dashed, icon, CTA). Error: `.state-panel .state-panel-error` with message + Retry button.
- Bell: relative button + `.bell-dot` count; `.notif-list` with `.notif-item[data-unread="true"]` (orange left bar); "Mark all read" footer.
- Settings: `.settings-layout` (14rem nav + content), `.settings-nav-item[data-active]`, `.settings-section` with `.settings-section-header` and `.settings-row` (label left, control right).
- AI panel: `.ai-panel` > `.ai-panel-header`; `.ai-msg.ai-msg-user` (blue) / `.ai-msg-assistant` (muted); `.ai-chip` suggestions; `.ai-typing` three `<span>` dots.
- Share link: mono input in `.glass-card` with copy button; success toast in green.
- Existing: `.glass-card`, `.transition-smooth`, `.accent-glow`, `.primary-glow`, `.chart-container` unchanged.

## Spacing & Rhythm

4px base. Cards 16–24px padding; sections 24–32px gap; table rows compact (8px); settings rows 14px/20px.

## Motion

- Entrance: `animate-fade-in`, `animate-slide-in` (300ms)
- Skeleton: `animate-shimmer`; live dot pulse; `animate-bell-ring` when new alert arrives
- Transitions 0.3s cubic-bezier(0.4,0,0.2,1); no bounce

## Constraints

- Dark only. Semantic tokens only; no hex/rgb in components.
- Color never the sole risk/alert signal: always pair with text label (LOW/MEDIUM/HIGH, Triggered).
- Neon green = positive/enabled/low risk only; red/orange = high risk, triggered, errors.
- Demo data must always carry `.demo-badge`.

## Signature Detail

Mono risk score badges with 10-step meters and dashed amber Demo badges sit beside glowing green APY figures, giving every row terminal-grade provenance and risk clarity.
