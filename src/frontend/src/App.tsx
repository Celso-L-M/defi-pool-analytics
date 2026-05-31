import { Layout } from "@/components/Layout";
import { APYTrackerPage } from "@/pages/APYTracker";
import { DashboardPage } from "@/pages/Dashboard";
import { DerivativesPage } from "@/pages/Derivatives";
import { ILCalculatorPage } from "@/pages/ILCalculator";
import { PoolComparisonPage } from "@/pages/PoolComparison";
import { PoolsPage } from "@/pages/Pools";
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

const rootRoute = createRootRoute({
  component: () => (
    <Layout>
      <Outlet />
    </Layout>
  ),
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DashboardPage,
});
const poolsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/pools",
  component: PoolsPage,
});
const apyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/apy-tracker",
  component: APYTrackerPage,
});
const ilRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/il-calculator",
  component: ILCalculatorPage,
});
const comparisonRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/pool-comparison",
  component: PoolComparisonPage,
});
const derivativesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/derivatives",
  component: DerivativesPage,
});

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  poolsRoute,
  apyRoute,
  ilRoute,
  comparisonRoute,
  derivativesRoute,
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
