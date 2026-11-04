import type { Position, PositionInput } from "@/backend";
import { EmptyState, ErrorState, LoadingState } from "@/components/DataStates";
import { DemoBadge } from "@/components/DemoBadge";
import { SignInPrompt } from "@/components/SignInPrompt";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { usePoolHistory, usePools, useTokenPrices } from "@/hooks/useLiveData";
import {
  useAddPosition,
  usePositions,
  useRemovePosition,
  useUpdatePosition,
} from "@/hooks/useQueries";
import { cn } from "@/lib/utils";
import type { PoolHistoryPoint } from "@/types/defi";
import { toast } from "@/utils/toast";
import {
  AlertTriangle,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Wallet,
} from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

// ─── Value history maths ─────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const RANGES = [7, 30, 90] as const;
type RangeDays = (typeof RANGES)[number];

const COIN_IDS: Record<string, string> = {
  ETH: "ethereum",
  WETH: "ethereum",
  BTC: "bitcoin",
  WBTC: "bitcoin",
  SOL: "solana",
  BNB: "binancecoin",
  WBNB: "binancecoin",
  UNI: "uniswap",
  ICP: "internet-computer",
  AVAX: "avalanche-2",
  LINK: "chainlink",
};

interface HistoryReport {
  data: PoolHistoryPoint[];
  isLoading: boolean;
  isError: boolean;
  isDemo: boolean;
  retry: () => void;
}

const utcDay = (ms: number) => Math.floor(ms / DAY_MS) * DAY_MS;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Backend nanosecond timestamp to epoch milliseconds (null when invalid). */
function timestampToMs(timestamp: bigint): number | null {
  const ms = Number(timestamp / 1_000_000n);
  return Number.isFinite(ms) ? ms : null;
}

function assetOf(symbol: string): string | undefined {
  return symbol
    .toUpperCase()
    .split(/[-/\s]+/)
    .find((token) => COIN_IDS[token]);
}

/**
 * Daily estimated value of one position from `fromDay` to `toDay` (UTC ms).
 * Each day the position earns its share of the pool's daily yield:
 * (value / pool TVL) x (pool TVL x APY / 365), using the latest known
 * DefiLlama point on or before that day.
 */
function accrue(
  amount: number,
  history: PoolHistoryPoint[],
  fromDay: number,
  toDay: number,
): number[] {
  const points = [...history].sort((a, b) => a.timestamp - b.timestamp);
  const values: number[] = [];
  let value = amount;
  let cursor = -1;
  for (let day = fromDay; day <= toDay; day += DAY_MS) {
    if (day > fromDay) {
      while (
        cursor + 1 < points.length &&
        utcDay(points[cursor + 1].timestamp) <= day
      ) {
        cursor += 1;
      }
      const point = cursor >= 0 ? points[cursor] : undefined;
      if (point && point.tvlUsd > 0 && point.apy > 0) {
        const share = Math.min(1, value / point.tvlUsd);
        value += share * ((point.tvlUsd * point.apy) / 100 / 365);
      }
    }
    values.push(value);
  }
  return values;
}

interface PositionRow {
  position: Position;
  entryMs: number | null;
  current: number;
  gain: number;
  hasHistory: boolean;
}

interface PortfolioModel {
  rows: PositionRow[];
  chart: { label: string; day: number; value: number }[];
  endValue: number;
  rangeGain: number;
  rangeBase: number;
  totalGain: number;
}

function buildModel(
  positions: Position[],
  histories: Record<string, HistoryReport | undefined>,
  range: RangeDays,
  todayMs: number,
): PortfolioModel {
  const today = utcDay(todayMs);
  const rangeStart = today - (range - 1) * DAY_MS;
  const totals = new Map<number, number>();
  let rangeGain = 0;
  let rangeBase = 0;
  const rows = positions.map((position) => {
    const history = histories[position.poolId]?.data ?? [];
    const entryMs = timestampToMs(position.entryTimestamp);
    const entryDay = entryMs === null ? today : utcDay(entryMs);
    const sinceEntry =
      entryDay <= today
        ? accrue(position.amountUsd, history, entryDay, today)
        : [position.amountUsd];
    const current = sinceEntry[sinceEntry.length - 1];
    if (entryDay <= today) {
      const start = Math.max(entryDay, rangeStart);
      const series = accrue(position.amountUsd, history, start, today);
      series.forEach((value, index) => {
        const day = start + index * DAY_MS;
        totals.set(day, (totals.get(day) ?? 0) + value);
      });
      rangeBase += position.amountUsd;
      rangeGain += series[series.length - 1] - position.amountUsd;
    }
    return {
      position,
      entryMs,
      current,
      gain: current - position.amountUsd,
      hasHistory: history.length > 0,
    };
  });
  const chart = Array.from({ length: range }, (_, index) => {
    const day = rangeStart + index * DAY_MS;
    return {
      day,
      label: new Date(day).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
      value: totals.get(day) ?? 0,
    };
  });
  return {
    rows,
    chart,
    endValue: chart[chart.length - 1].value,
    rangeGain,
    rangeBase,
    totalGain: rows.reduce((sum, row) => sum + row.gain, 0),
  };
}

// ─── Formatting ──────────────────────────────────────────────────────────────

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const usdCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});
const fmtUsd = (value: number) => usd.format(value);
const fmtSigned = (value: number) =>
  `${value >= 0 ? "+" : "−"}${usd.format(Math.abs(value))}`;
const fmtPct = (value: number) =>
  `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}%`;
const tone = (value: number) =>
  value >= 0 ? "text-success" : "text-destructive";

// ─── History loader (one hook call per saved pool) ───────────────────────────

function HistoryProbe({
  poolId,
  onReport,
}: {
  poolId: string;
  onReport: (poolId: string, report: HistoryReport) => void;
}) {
  const history = usePoolHistory(poolId);
  const refetchRef = useRef(history.refetch);
  refetchRef.current = history.refetch;
  const retry = useCallback(() => refetchRef.current(), []);
  const { data, isLoading, isError, isDemo } = history;
  useEffect(() => {
    onReport(poolId, { data, isLoading, isError, isDemo, retry });
  }, [poolId, data, isLoading, isError, isDemo, retry, onReport]);
  return null;
}

// ─── Add / edit form ─────────────────────────────────────────────────────────

interface PoolOption {
  id: string;
  name: string;
  symbol: string;
  label: string;
}

function PositionForm({
  editing,
  options,
  poolsLoading,
  poolsDemo,
  onDone,
}: {
  editing: Position | null;
  options: PoolOption[];
  poolsLoading: boolean;
  poolsDemo: boolean;
  onDone: () => void;
}) {
  const add = useAddPosition();
  const update = useUpdatePosition();
  const editMs = editing ? timestampToMs(editing.entryTimestamp) : null;
  const [poolId, setPoolId] = useState(editing?.poolId ?? "");
  const [amount, setAmount] = useState(
    editing ? String(editing.amountUsd) : "",
  );
  const [date, setDate] = useState(
    editMs === null ? isoDay(Date.now()) : isoDay(editMs),
  );
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const pending = add.isPending || update.isPending;

  const choices = useMemo(() => {
    if (editing && !options.some((o) => o.id === editing.poolId)) {
      return [
        {
          id: editing.poolId,
          name: editing.displayName,
          symbol: editing.symbol,
          label: editing.displayName,
        },
        ...options,
      ];
    }
    return options;
  }, [editing, options]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = Number(amount);
    const entryMs = Date.parse(`${date}T00:00:00Z`);
    const choice = choices.find((o) => o.id === poolId);
    if (!choice) return setError("Choose a pool for this position.");
    if (!Number.isFinite(value) || value <= 0 || value >= 1e15) {
      return setError("Enter an amount in USD greater than 0.");
    }
    if (Number.isNaN(entryMs) || entryMs > Date.now()) {
      return setError(
        "Entry date must be a valid date that is not in the future.",
      );
    }
    setError(null);
    const input: PositionInput = {
      poolId: choice.id,
      displayName: choice.name.slice(0, 200),
      symbol: choice.symbol.slice(0, 200),
      amountUsd: value,
      entryTimestamp: BigInt(entryMs) * 1_000_000n,
      notes: notes.trim() ? notes.trim().slice(0, 1000) : undefined,
    };
    const callbacks = {
      onSuccess: () => {
        toast.success(editing ? "Position updated" : "Position added");
        onDone();
      },
      onError: (err: Error) => setError(err.message),
    };
    if (editing) update.mutate({ id: editing.id, input }, callbacks);
    else add.mutate(input, callbacks);
  };

  return (
    <form onSubmit={submit} className="space-y-4" data-ocid="portfolio.form">
      <div className="space-y-1.5">
        <Label htmlFor="pf-pool">Pool</Label>
        <Select
          value={poolId}
          onValueChange={setPoolId}
          disabled={poolsLoading}
        >
          <SelectTrigger id="pf-pool" data-ocid="portfolio.pool_select">
            <SelectValue
              placeholder={poolsLoading ? "Loading pools…" : "Choose a pool"}
            />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {choices.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {poolsDemo && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <DemoBadge /> Live pools could not be loaded; these are sample
            pools.
          </p>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pf-amount">Amount (USD)</Label>
          <Input
            id="pf-amount"
            data-ocid="portfolio.amount_input"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="2500"
            className="font-numeric"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pf-date">Entry date</Label>
          <Input
            id="pf-date"
            data-ocid="portfolio.date_input"
            type="date"
            max={isoDay(Date.now())}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="font-numeric"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pf-notes">Notes (optional)</Label>
        <Textarea
          id="pf-notes"
          data-ocid="portfolio.notes_textarea"
          rows={2}
          maxLength={1000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Strategy, wallet or reminder"
        />
      </div>
      {error && (
        <p
          role="alert"
          data-ocid="portfolio.form_error"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          data-ocid="portfolio.cancel_button"
          onClick={onDone}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={pending}
          data-ocid="portfolio.submit_button"
        >
          {pending && (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
          )}
          {editing ? "Save changes" : "Add position"}
        </Button>
      </div>
    </form>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

const chartConfig = {
  value: { label: "Estimated value", color: "oklch(var(--chart-2))" },
} satisfies ChartConfig;

function Stat({
  label,
  value,
  sub,
  valueClass,
  ocid,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
  ocid: string;
}) {
  return (
    <Card className="gap-1 rounded-lg p-4 shadow-none" data-ocid={ocid}>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={cn("font-numeric text-xl font-semibold", valueClass)}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}

function PortfolioContent() {
  const positions = usePositions();
  const pools = usePools();
  const remove = useRemovePosition();
  const [range, setRange] = useState<RangeDays>(30);
  const [histories, setHistories] = useState<
    Record<string, HistoryReport | undefined>
  >({});
  const [dialog, setDialog] = useState<{
    open: boolean;
    editing: Position | null;
  }>({ open: false, editing: null });
  const [toDelete, setToDelete] = useState<Position | null>(null);

  const list = positions.data;
  const poolIds = useMemo(
    () => [...new Set((list ?? []).map((p) => p.poolId))],
    [list],
  );
  const coinIds = useMemo(
    () => [
      ...new Set(
        (list ?? [])
          .map((p) => assetOf(p.symbol))
          .filter((t): t is string => !!t)
          .map((t) => COIN_IDS[t]),
      ),
    ],
    [list],
  );
  const prices = useTokenPrices(coinIds);

  const report = useCallback((poolId: string, value: HistoryReport) => {
    setHistories((prev) => ({ ...prev, [poolId]: value }));
  }, []);

  const options = useMemo<PoolOption[]>(
    () =>
      pools.data.map((p) => ({
        id: p.id,
        name: p.name,
        symbol: p.token1 ? `${p.token0}-${p.token1}` : p.token0,
        label: `${p.name} · ${p.chain}${p.project ? ` · ${p.project}` : ""}`,
      })),
    [pools.data],
  );

  const model = useMemo(
    () => (list ? buildModel(list, histories, range, Date.now()) : null),
    [list, histories, range],
  );

  const reports = poolIds.map((id) => histories[id]);
  const historyLoading = reports.some((r) => !r || r.isLoading);
  const failed = reports.filter(
    (r): r is HistoryReport => !!r && !r.isLoading && r.data.length === 0,
  );
  const anyDemo =
    pools.isDemo ||
    prices.isDemo ||
    reports.some((r) => !!r && r.isDemo && r.data.length > 0);

  const closeDialog = () => setDialog({ open: false, editing: null });
  const openAdd = () => setDialog({ open: true, editing: null });

  const confirmDelete = () => {
    if (!toDelete) return;
    remove.mutate(toDelete.id, {
      onSuccess: () => toast.success("Position removed"),
      onError: (err) => toast.error(err.message),
    });
    setToDelete(null);
  };

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-semibold">Portfolio</h1>
        {anyDemo && <DemoBadge />}
      </div>
      <Button type="button" onClick={openAdd} data-ocid="portfolio.add_button">
        <Plus className="mr-1.5 h-4 w-4" aria-hidden />
        Add position
      </Button>
    </div>
  );

  let body: ReactNode;
  if (!list || !model) {
    body = positions.isError ? (
      <ErrorState
        title="Could not load your positions"
        message={positions.error?.message}
        onRetry={() => void positions.refetch()}
      />
    ) : (
      <LoadingState label="Loading your positions…" />
    );
  } else if (list.length === 0) {
    body = (
      <EmptyState
        title="No positions yet"
        description="Add a pool position to chart its estimated value over time."
        icon={<Wallet className="h-5 w-5" aria-hidden />}
        action={
          <Button
            type="button"
            size="sm"
            onClick={openAdd}
            data-ocid="portfolio.empty_add_button"
          >
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            Add your first position
          </Button>
        }
      />
    );
  } else {
    const pct =
      model.rangeBase > 0 ? (model.rangeGain / model.rangeBase) * 100 : 0;
    body = (
      <>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            ocid="portfolio.total_card"
            label="Estimated value today"
            value={fmtUsd(model.endValue)}
            sub={`${list.length} position${list.length === 1 ? "" : "s"}`}
          />
          <Stat
            ocid="portfolio.change_card"
            label={`Change · ${range}D`}
            value={`${fmtSigned(model.rangeGain)} (${fmtPct(pct)})`}
            valueClass={tone(model.rangeGain)}
            sub="Yield accrued, excluding new deposits"
          />
          <Stat
            ocid="portfolio.gain_card"
            label="Gain since entry"
            value={fmtSigned(model.totalGain)}
            valueClass={tone(model.totalGain)}
            sub="Across all positions"
          />
        </div>

        <Card
          className="gap-4 rounded-lg p-4 shadow-none"
          data-ocid="portfolio.chart_panel"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold">
                Estimated value over time
              </h2>
              <p className="text-xs text-muted-foreground">
                Estimate based on pool yield history; not a wallet balance.
              </p>
            </div>
            <fieldset className="flex gap-1" aria-label="Chart range">
              {RANGES.map((days) => (
                <Button
                  key={days}
                  type="button"
                  size="sm"
                  variant={range === days ? "default" : "outline"}
                  aria-pressed={range === days}
                  data-ocid={`portfolio.range_${days}_button`}
                  onClick={() => setRange(days)}
                >
                  {days}D
                </Button>
              ))}
            </fieldset>
          </div>
          {failed.length > 0 && (
            <div
              role="alert"
              data-ocid="portfolio.history_error"
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs"
            >
              <span className="flex items-center gap-2">
                <AlertTriangle
                  className="h-4 w-4 text-destructive"
                  aria-hidden
                />
                Yield history is unavailable for {failed.length} pool
                {failed.length === 1 ? "" : "s"}; those positions are shown flat
                at their deposit amount.
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-ocid="portfolio.history_retry_button"
                onClick={() => {
                  for (const r of failed) r.retry();
                }}
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Retry
              </Button>
            </div>
          )}
          {historyLoading ? (
            <LoadingState
              label="Loading pool yield history…"
              className="h-64"
            />
          ) : (
            <ChartContainer
              config={chartConfig}
              className="aspect-auto h-64 w-full"
              data-ocid="portfolio.chart"
            >
              <AreaChart
                data={model.chart}
                margin={{ left: 4, right: 8, top: 8 }}
              >
                <defs>
                  <linearGradient
                    id="portfolioFill"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="var(--color-value)"
                      stopOpacity={0.4}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-value)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                />
                <YAxis
                  width={64}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => usdCompact.format(v)}
                  domain={[
                    (min: number) => min * 0.995,
                    (max: number) => max * 1.005,
                  ]}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => (
                        <span className="font-numeric">
                          {fmtUsd(Number(value))}
                        </span>
                      )}
                    />
                  }
                />
                <Area
                  dataKey="value"
                  type="monotone"
                  stroke="var(--color-value)"
                  strokeWidth={2}
                  fill="url(#portfolioFill)"
                />
              </AreaChart>
            </ChartContainer>
          )}
          <p
            className="text-xs leading-relaxed text-muted-foreground"
            data-ocid="portfolio.method_note"
          >
            How this is estimated: each position starts at its USD amount on its
            entry date (or on the first day of the range if it is older). Every
            following day it earns its share of the pool's daily yield, using
            DefiLlama's real historical APY and TVL (share of TVL × TVL × APY ÷
            365), then positions are summed per day. Token price moves and
            impermanent loss are not included. The table accrues from each entry
            date, so it can differ from the chart for older positions.
          </p>
        </Card>

        <Card
          className="rounded-lg p-0 shadow-none"
          data-ocid="portfolio.table_panel"
        >
          <Table data-ocid="portfolio.table">
            <TableHeader>
              <TableRow>
                <TableHead>Pool</TableHead>
                <TableHead>Entry</TableHead>
                <TableHead className="text-right">Deposited</TableHead>
                <TableHead className="text-right">Est. value</TableHead>
                <TableHead className="text-right">Gain</TableHead>
                <TableHead className="text-right">Asset 24h</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {model.rows.map((row, index) => {
                const { position } = row;
                const asset = assetOf(position.symbol);
                const change = asset
                  ? prices.data[COIN_IDS[asset]]?.change24h
                  : undefined;
                const pctGain =
                  position.amountUsd > 0
                    ? (row.gain / position.amountUsd) * 100
                    : 0;
                const n = index + 1;
                return (
                  <TableRow
                    key={position.id.toString()}
                    data-ocid={`portfolio.row.${n}`}
                  >
                    <TableCell className="max-w-56">
                      <p className="truncate font-medium">
                        {position.displayName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {position.symbol}
                        {position.notes ? ` · ${position.notes}` : ""}
                      </p>
                      {!row.hasHistory && (
                        <p className="text-xs text-warning">No yield history</p>
                      )}
                    </TableCell>
                    <TableCell className="font-numeric text-xs">
                      {row.entryMs === null ? "—" : isoDay(row.entryMs)}
                    </TableCell>
                    <TableCell className="text-right font-numeric">
                      {fmtUsd(position.amountUsd)}
                    </TableCell>
                    <TableCell className="text-right font-numeric">
                      {fmtUsd(row.current)}
                    </TableCell>
                    <TableCell
                      className={cn("text-right font-numeric", tone(row.gain))}
                    >
                      {fmtSigned(row.gain)}
                      <span className="block text-xs">{fmtPct(pctGain)}</span>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-numeric text-xs",
                        change === undefined
                          ? "text-muted-foreground"
                          : tone(change),
                      )}
                    >
                      {asset && change !== undefined
                        ? `${asset} ${fmtPct(change)}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={`Edit ${position.displayName}`}
                          data-ocid={`portfolio.edit_button.${n}`}
                          onClick={() =>
                            setDialog({ open: true, editing: position })
                          }
                        >
                          <Pencil className="h-4 w-4" aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={`Delete ${position.displayName}`}
                          data-ocid={`portfolio.delete_button.${n}`}
                          onClick={() => setToDelete(position)}
                        >
                          <Trash2
                            className="h-4 w-4 text-destructive"
                            aria-hidden
                          />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </>
    );
  }

  return (
    <div
      className="mx-auto max-w-6xl space-y-4 p-4 md:p-6"
      data-ocid="portfolio.page"
    >
      {poolIds.map((id) => (
        <HistoryProbe key={id} poolId={id} onReport={report} />
      ))}
      {header}
      {body}

      <Dialog
        open={dialog.open}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <DialogContent data-ocid="portfolio.dialog">
          <DialogHeader>
            <DialogTitle>
              {dialog.editing ? "Edit position" : "Add position"}
            </DialogTitle>
            <DialogDescription>
              Pick a pool, the USD amount you put in and when you entered.
            </DialogDescription>
          </DialogHeader>
          <PositionForm
            key={dialog.editing?.id.toString() ?? "new"}
            editing={dialog.editing}
            options={options}
            poolsLoading={pools.isLoading}
            poolsDemo={pools.isDemo}
            onDone={closeDialog}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
      >
        <AlertDialogContent data-ocid="portfolio.delete_dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this position?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete?.displayName} will be removed from your portfolio
              history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-ocid="portfolio.delete_cancel_button">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              data-ocid="portfolio.delete_confirm_button"
              onClick={confirmDelete}
            >
              Delete position
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function PortfolioPage() {
  const { isAuthenticated, isInitializing } = useAuth();
  if (isInitializing) {
    return (
      <div className="mx-auto max-w-6xl p-4 md:p-6">
        <LoadingState label="Checking your session…" />
      </div>
    );
  }
  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
        <h1 className="font-display text-2xl font-semibold">Portfolio</h1>
        <SignInPrompt feature="your portfolio" />
      </div>
    );
  }
  return <PortfolioContent />;
}

export default PortfolioPage;
