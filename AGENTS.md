# Project Guidance

## User Preferences

- Use only free public data sources without API keys
- Keep the existing dark terminal look with electric blue and neon green accents
- Label any demo or fallback data visibly as Demo data

## Accepted Requirements

- Fix the Position Tracker route, mobile menu gaps, missing 404 page, unused error boundary and unused heavy libraries
- Real data from free public DeFi sources with clear demo fallback
- Saved watchlists, positions and alert rules per signed-in user
- Real AI insights replacing the fake assistant
- Real email alerts
- Consistent loading and error states
- Portfolio history charts
- Risk score per pool
- Shareable comparison links
- Settings page
- Add yield farming

## Verified Commands

- **typecheck**: `cd src/frontend && pnpm typecheck`
- **fix**: `cd src/frontend && pnpm fix`
- **build**: `cd src/frontend && pnpm build`

## Learnings

- Frontend routes live in src/frontend/src/App.tsx using TanStack Router; the shell is components/Layout.tsx with components/Sidebar.tsx.
- Pages previously read MOCK_POOLS and MOCK_POSITIONS from src/frontend/src/data/mockData.ts; state lives in store/useDefiStore.ts.
- Derivatives page calls Binance public futures from the browser; Binance blocks server-side requests.
- Frontend commands run from src/frontend: pnpm typecheck, pnpm fix, pnpm build. Backend commands run from src/backend: mops install, mops check --fix, mops build; pnpm bindgen runs from the root.
- Biome rejects div with role=group or role=status; use fieldset or output instead.
- Design tokens in index.css are space-separated oklch triplets; use oklch(var(--token)) in inline styles so light and dark themes both work.
- The alerts evaluator in lib/alerts.mo must treat a missing settings row the same as userdata.mo defaultSettings (email alerts on).
- Binance futures endpoints are blocked from servers, so Derivatives data is fetched in the browser with labeled demo fallback.
- Pages read the comparison selection from the pools URL search parameter with useSearch({ strict: false }) and useNavigate.
- Frontend-direct AI uses hooks/useAiChat.ts with a short-lived key minted by the backend; the assistant requires sign-in.
- Yield Farming lives at /yield-farming (pages/YieldFarming.tsx, hooks/useYieldFarms.ts, utils/yieldEstimate.ts, components/FarmRow.tsx, components/FarmEstimator.tsx); filters are URL search params q, chain, minTvl, stable and sort, with defaults omitted.
- MOCK_POOLS carry no apyReward, apyBase or stablecoin; useYieldFarms synthesizes a reward split for demo pools only, always shown under the Demo data badge.
- The floating AI Assistant button can overlap bottom page content on desktop and mobile; pages may need bottom padding.
