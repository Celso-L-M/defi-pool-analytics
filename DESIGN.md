# Design Brief: Premium Financial Dashboard — Bloomberg Terminal Meets Modern DeFi

## Direction

Premium financial dashboard with Bloomberg Terminal sophistication — dark (#0D0D0D), electric blue (#00A3FF) and neon green (#00FF88) accents, glassmorphism, and financial metric glows.

## Tone

Refined, precision-driven, data-forward. Dark surfaces with vibrant accent colors convey institutional fintech credibility while neon glows and smooth animations add modern energy without sacrificing professionalism.

## Differentiation

Glasmorphic cards with electric blue borders and neon green glows on critical financial metrics (APY, USD value, fees) create a signature visual identity that merges Bloomberg's data precision with DeFi's bold energy.

## Color Palette

| Token | OKLCH | Role |
|-------|-------|------|
| Background | `0.05 0 0` | Deep black, premium foundation |
| Foreground | `0.95 0 0` | Off-white text for contrast |
| Card | `0.08 0.02 260` | Slightly elevated dark surface |
| Primary | `0.7 0.2 210` | Electric blue — active states, charts, glows |
| Accent | `0.75 0.25 150` | Neon green — positive metrics, highlights |
| Muted | `0.15 0.01 260` | Subtle backgrounds, disabled states |
| Border | `0.15 0.02 210` | Subtle blue-tinted borders |
| Destructive | `0.6 0.22 25` | Red for losses and alerts |

## Typography

- Display: Space Grotesk, 600–700 wt — geometric sans for headers, pool names, key financial metrics
- Body: Space Grotesk, 400 wt — clean sans for labels, descriptions, secondary data
- Mono: JetBrains Mono, 400 wt — precision numbers, addresses, code values

Type scale: `48/44 / 32/28 / 24/20 / 16/14 / 14/12 / 12/10px`.

## Elevation & Depth

Surfaces layered via transparency and subtle shadows. Glassmorphic cards with backdrop blur (8px) and 0.85 opacity create depth without traditional shadows. Elevated surfaces (charts, modals) use blue-tinted glows for cohesion.

## Structural Zones

| Zone | Background | Border | Notes |
|------|-----------|--------|-------|
| Header | `bg-card` | `border-b border-blue/20` | Dark nav with blue underline |
| Sidebar | `bg-sidebar` | `border-r border-blue/15` | Active link: blue underline, white text |
| Content | `bg-background` | — | Deep black, highest contrast |
| Card | Glass blur, 0.85 opacity | Electric blue 1px @ 0.2 opacity | Hover: opacity to 0.95, stronger border |
| Chart | Glass blur, 0.6 opacity | Electric blue 1px @ 0.15 opacity | Grid in blue @ 0.1 opacity |

## Component Patterns

- Buttons: Primary (blue solid), Secondary (muted bg), Destructive (red). No outlines, smooth 0.3s transitions.
- Cards: `.glass-card` — backdrop blur 8px, semi-transparent, electric blue border, lift +2px on hover.
- Metrics: `.accent-glow` for APY/fees (neon green), `.primary-glow` for TVL/volume (electric blue).
- Charts: Lines 2px weight, accent series in blue and green, tooltips glassmorphic.
- Tables: Header with muted bg, rows with subtle hover lift, sortable columns with blue chevrons.

## Spacing & Rhythm

Base unit 4px. Cards: 16–24px padding. Sections: 24–32px vertical gap. Data-dense tables: 8px row height. Compact form inputs: 8–12px padding.

## Motion

- Entrance: fade-in 300ms (load), slide-in 300ms (panels)
- Hover: card-lift 300ms cubic-bezier, scale 1.02, shadow depth +4px
- Metric glow: pulse 2s infinite (optional on key values)
- Transitions: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) on interactive elements

## Constraints

- Background always #0D0D0D; no lighter variants.
- Glassmorphic cards mandatory on panels, modals, charts. Always blur ≥ 4px.
- All glows via text-shadow and box-shadow using oklch tokens; no hex or rgb literals.
- Electric blue (#00A3FF) for data viz lines, borders, primary glows. Neon green (#00FF88) for positive metrics only.
- Smooth transitions on all interactive elements; no bouncy or overshoot easing.
- Dark mode enforced.

## Signature Detail

Metrics (APY, USD value, fees) render with neon green text-shadow glows (0 0 12px oklch(var(--accent) / 0.8)) creating a subtle Bloomberg Terminal feel. Cards lift and glow brighter on hover, building intuitive feedback for financial interactions.
