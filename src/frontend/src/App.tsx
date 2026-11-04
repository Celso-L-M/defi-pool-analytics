import { FallbackUI } from "@/components/ErrorBoundary";
import { Layout } from "@/components/Layout";
import { NotFound } from "@/components/NotFound";
import { APYTrackerPage } from "@/pages/APYTracker";
import { AlertsPage } from "@/pages/Alerts";
import { DashboardPage } from "@/pages/Dashboard";
import { DerivativesPage } from "@/pages/Derivatives";
import { ILCalculatorPage } from "@/pages/ILCalculator";
import { PoolComparisonPage } from "@/pages/PoolComparison";
import { PoolsPage } from "@/pages/Pools";
import { PortfolioPage } from "@/pages/Portfolio";
import { PositionTrackerPage } from "@/pages/PositionTracker";
import { SettingsPage } from "@/pages/Settings";
import { YieldFarmingPage } from "@/pages/YieldFarming";
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

const rootRoute = createRootRoute({
  component: () => (
    <Layout>
      <Outlet />
    </Layout>
  ),
  notFoundComponent: NotFound,
  errorComponent: ({ error, reset }) => (
    <FallbackUI error={error} onRetry={reset} />
  ),
});

function page<const P extends string>(path: P, component: () => ReactNode) {
  return createRoute({ getParentRoute: () => rootRoute, path, component });
}

const routeTree = rootRoute.addChildren([
  page("/", DashboardPage),
  page("/pools", PoolsPage),
  page("/apy-tracker", APYTrackerPage),
  page("/il-calculator", ILCalculatorPage),
  page("/pool-comparison", PoolComparisonPage),
  page("/derivatives", DerivativesPage),
  page("/position-tracker", PositionTrackerPage),
  page("/alerts", AlertsPage),
  page("/portfolio", PortfolioPage),
  page("/yield-farming", YieldFarmingPage),
  page("/settings", SettingsPage),
]);
const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export default function App() {
  return <RouterProvider router={router} />;
}
