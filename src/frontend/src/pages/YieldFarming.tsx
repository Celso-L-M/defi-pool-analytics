import { EmptyState, ErrorState, LoadingState } from "@/components/DataStates";
import { DemoBadge } from "@/components/DemoBadge";
import { FarmEstimator } from "@/components/FarmEstimator";
import { FARM_GRID, FarmRow } from "@/components/FarmRow";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type Farm, useYieldFarms } from "@/hooks/useYieldFarms";
import { cn } from "@/lib/utils";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Search, SearchX, Sprout } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

type SortKey = "apy" | "reward" | "tvl";

const SORT_LABELS: Record<SortKey, string> = {
  apy: "Total APY (high to low)",
  reward: "Reward APY (high to low)",
  tvl: "TVL (high to low)",
};

const TVL_PRESETS = [
  { value: 0, label: "Any TVL" },
  { value: 1_000_000, label: "TVL ≥ $1M" },
  { value: 10_000_000, label: "TVL ≥ $10M" },
  { value: 100_000_000, label: "TVL ≥ $100M" },
  { value: 1_000_000_000, label: "TVL ≥ $1B" },
];

const PAGE_SIZE = 25;
const HEADERS: { label: string; right: boolean }[] = [
  { label: "Farm", right: false },
  { label: "TVL", right: true },
  { label: "Base APY", right: true },
  { label: "Reward APY", right: true },
  { label: "Reward share", right: false },
  { label: "Total APY", right: true },
  { label: "Risk", right: false },
];

interface Filters {
  q: string;
  chain: string;
  minTvl: number;
  stable: boolean;
  sort: SortKey;
}

function parseFilters(search: Record<string, unknown>): Filters {
  const text = (v: unknown) => (v == null ? "" : String(v));
  const minTvl = Number(search.minTvl);
  const sort = text(search.sort);
  const stable = text(search.stable);
  return {
    q: text(search.q),
    chain: text(search.chain) || "all",
    minTvl: Number.isFinite(minTvl) && minTvl > 0 ? minTvl : 0,
    stable: stable === "true" || stable === "1",
    sort: sort === "reward" || sort === "tvl" ? sort : "apy",
  };
}

function toSearch(f: Filters) {
  return {
    q: f.q.trim() === "" ? undefined : f.q,
    chain: f.chain === "all" ? undefined : f.chain,
    minTvl: f.minTvl > 0 ? f.minTvl : undefined,
    stable: f.stable ? true : undefined,
    sort: f.sort === "apy" ? undefined : f.sort,
  };
}

function sortFarms(farms: Farm[], sort: SortKey): Farm[] {
  const key = {
    apy: (f: Farm) => f.totalApy,
    reward: (f: Farm) => f.rewardApy,
    tvl: (f: Farm) => f.tvl,
  }[sort];
  return [...farms].sort((a, b) => key(b) - key(a) || b.tvl - a.tvl);
}

const TOGGLE =
  "min-h-[36px] rounded-md border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function YieldFarmingPage() {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate();
  const { farms, chains, isDemo, isLoading, isError, refetch } =
    useYieldFarms();

  const filters = useMemo(() => parseFilters(search), [search]);
  const [queryDraft, setQueryDraft] = useState(filters.q);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [amount, setAmount] = useState("1000");
  const [visible, setVisible] = useState(PAGE_SIZE);

  const update = useCallback(
    (patch: Partial<Filters>) => {
      setVisible(PAGE_SIZE);
      void navigate({
        to: "/yield-farming",
        search: toSearch({ ...filters, ...patch }),
        replace: true,
      });
    },
    [filters, navigate],
  );

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const rows = farms.filter((f) => {
      if (filters.chain !== "all" && f.chain !== filters.chain) return false;
      if (f.tvl < filters.minTvl) return false;
      if (filters.stable && !f.stablecoin) return false;
      return (
        !q ||
        f.project.toLowerCase().includes(q) ||
        f.name.toLowerCase().includes(q)
      );
    });
    return sortFarms(rows, filters.sort);
  }, [farms, filters]);

  const sortedAll = useMemo(() => sortFarms(farms, "apy"), [farms]);
  const activeFarm =
    farms.find((f) => f.id === selectedId) ?? filtered[0] ?? sortedAll[0];

  const hasFilters =
    filters.q !== "" ||
    filters.chain !== "all" ||
    filters.minTvl > 0 ||
    filters.stable;

  const clearFilters = () => {
    setQueryDraft("");
    update({ q: "", chain: "all", minTvl: 0, stable: false });
  };

  const estimateFarm = (id: string) => {
    setSelectedId(id);
    document
      .getElementById("yield-estimator")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const tvlOptions = TVL_PRESETS.some((p) => p.value === filters.minTvl)
    ? TVL_PRESETS
    : [
        ...TVL_PRESETS,
        { value: filters.minTvl, label: `TVL ≥ $${filters.minTvl}` },
      ];
  const chainOptions =
    filters.chain === "all" || chains.includes(filters.chain)
      ? chains
      : [...chains, filters.chain];

  return (
    <div data-ocid="yield.page" className="space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-accent/30 bg-accent/10">
            <Sprout className="h-5 w-5 text-accent" aria-hidden />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-foreground">
              Yield Farming
            </h1>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {isLoading
                ? "Loading farms"
                : `${farms.length} pools with reward incentives`}
            </p>
          </div>
        </div>
        {isDemo && <DemoBadge />}
      </header>

      {isDemo && isError && (
        <ErrorState
          title="Live pool data is unavailable"
          message="DefiLlama could not be reached, so demo farms are shown below. Reward splits on demo farms are illustrative. Retry to load live data."
          onRetry={refetch}
        />
      )}

      {isLoading ? (
        <div data-ocid="yield.loading_state">
          <LoadingState label="Loading reward farms…" />
        </div>
      ) : isError && !isDemo && farms.length === 0 ? (
        <ErrorState
          title="Could not load farms"
          message="Pool data could not be fetched. Check your connection and try again."
          onRetry={refetch}
        />
      ) : (
        <>
          <FarmEstimator
            farms={sortedAll}
            farm={activeFarm}
            amount={amount}
            onFarmChange={setSelectedId}
            onAmountChange={setAmount}
          />

          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                data-ocid="yield.search_input"
                type="search"
                aria-label="Search by project name"
                placeholder="Search by project name…"
                value={queryDraft}
                onChange={(e) => {
                  setQueryDraft(e.target.value);
                  update({ q: e.target.value });
                }}
                className="w-full rounded-lg border border-input bg-card py-2.5 pl-9 pr-4 font-mono text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <Select
              value={filters.chain}
              onValueChange={(v) => update({ chain: v })}
            >
              <SelectTrigger
                data-ocid="yield.chain_select"
                aria-label="Filter by chain"
                className="w-full bg-card lg:w-44"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All chains</SelectItem>
                {chainOptions.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={String(filters.minTvl)}
              onValueChange={(v) => update({ minTvl: Number(v) })}
            >
              <SelectTrigger
                data-ocid="yield.min_tvl_select"
                aria-label="Minimum TVL"
                className="w-full bg-card lg:w-44"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tvlOptions.map((p) => (
                  <SelectItem key={p.value} value={String(p.value)}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.sort}
              onValueChange={(v) => update({ sort: v as SortKey })}
            >
              <SelectTrigger
                data-ocid="yield.sort_select"
                aria-label="Sort farms"
                className="w-full bg-card lg:w-56"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {SORT_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              type="button"
              data-ocid="yield.stable_toggle"
              aria-pressed={filters.stable}
              onClick={() => update({ stable: !filters.stable })}
              className={cn(
                TOGGLE,
                filters.stable
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              Stablecoins only
            </button>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<SearchX className="h-5 w-5" aria-hidden />}
              title="No farms match the filters"
              description={
                hasFilters
                  ? "Try a different project, chain or a lower minimum TVL."
                  : "No pools with reward APY are available right now."
              }
              action={
                hasFilters ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-ocid="yield.clear_filters_button"
                    onClick={clearFilters}
                  >
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <section aria-label="Reward farms" data-ocid="yield.list">
              <p
                data-ocid="yield.result_count"
                className="mb-2 text-xs uppercase tracking-wider text-muted-foreground"
              >
                Showing{" "}
                <span className="text-foreground">
                  {Math.min(visible, filtered.length)}
                </span>{" "}
                of {filtered.length} farm{filtered.length === 1 ? "" : "s"}
              </p>
              <div className="lg:overflow-hidden lg:rounded-lg lg:border lg:border-border lg:bg-card">
                <div
                  aria-hidden
                  className={cn(
                    "hidden gap-x-4 border-b border-border bg-muted/40 px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground lg:grid",
                    FARM_GRID,
                  )}
                >
                  {HEADERS.map((h) => (
                    <span key={h.label} className={h.right ? "text-right" : ""}>
                      {h.label}
                    </span>
                  ))}
                  <span />
                </div>
                <ul className="space-y-3 lg:space-y-0">
                  {filtered.slice(0, visible).map((farm, i) => (
                    <FarmRow
                      key={farm.id}
                      farm={farm}
                      index={i + 1}
                      selected={farm.id === activeFarm?.id}
                      onEstimate={estimateFarm}
                    />
                  ))}
                </ul>
              </div>
              {visible < filtered.length && (
                <div className="mt-4 flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-ocid="yield.show_more_button"
                    onClick={() => setVisible((v) => v + PAGE_SIZE)}
                  >
                    Show more farms
                  </Button>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
