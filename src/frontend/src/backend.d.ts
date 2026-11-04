import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface AlertHistoryEntry {
    id: bigint;
    metric: AlertMetric;
    threshold: number;
    ruleId: bigint;
    read: boolean;
    poolLabel: string;
    triggeredAt: Timestamp;
    observedValue: number;
    emailSent: boolean;
}
export interface AlertRule {
    id: bigint;
    metric: AlertMetric;
    armed: boolean;
    lastTriggeredAt?: Timestamp;
    threshold: number;
    createdAt: Timestamp;
    poolLabel: string;
    enabled: boolean;
    poolId: PoolId;
}
export interface AlertRuleInput {
    metric: AlertMetric;
    threshold: number;
    poolLabel: string;
    poolId: PoolId;
}
export type ApiError = {
    __kind__: "invalid";
    invalid: string;
} | {
    __kind__: "notFound";
    notFound: null;
} | {
    __kind__: "limitReached";
    limitReached: bigint;
};
export interface Cell {
    value: Value;
    name: string;
}
export interface Credentials {
    expiresAt: string;
    baseUrl: string;
    apiKey: string;
}
export type Error_ = {
    __kind__: "FrontendOriginsNotConfigured";
    FrontendOriginsNotConfigured: null;
} | {
    __kind__: "MixedSsoSources";
    MixedSsoSources: {
        otherKeys: Array<string>;
        ssoKeys: Array<string>;
    };
} | {
    __kind__: "Stale";
    Stale: {
        ageNs: bigint;
    };
} | {
    __kind__: "MalformedCandid";
    MalformedCandid: null;
} | {
    __kind__: "AmbiguousAttribute";
    AmbiguousAttribute: {
        field: string;
        sources: Array<string>;
    };
} | {
    __kind__: "NoAttributes";
    NoAttributes: null;
} | {
    __kind__: "UnknownNonce";
    UnknownNonce: null;
} | {
    __kind__: "UntrustedSsoSource";
    UntrustedSsoSource: {
        domain: string;
    };
} | {
    __kind__: "MissingField";
    MissingField: string;
} | {
    __kind__: "FrontendOriginMismatch";
    FrontendOriginMismatch: {
        got: string;
        expected: Array<string>;
    };
};
export interface EvaluationSummary {
    rulesEvaluated: bigint;
    failedPools: bigint;
    triggered: bigint;
}
export interface HttpHeader {
    value: string;
    name: string;
}
export interface HttpRequestResult {
    status: bigint;
    body: Uint8Array;
    headers: Array<HttpHeader>;
}
export interface ImportBatch {
    watchlist: Array<WatchlistEntry>;
    wallets: Array<TrackedWallet>;
    positions: Array<PositionInput>;
}
export interface ImportSummary {
    skipped: bigint;
    walletsAdded: bigint;
    positionsAdded: bigint;
    watchlistAdded: bigint;
}
export type PoolId = string;
export interface Position {
    id: bigint;
    entryTimestamp: Timestamp;
    displayName: string;
    notes?: string;
    amountUsd: number;
    symbol: string;
    poolId: PoolId;
}
export interface PositionInput {
    entryTimestamp: Timestamp;
    displayName: string;
    notes?: string;
    amountUsd: number;
    symbol: string;
    poolId: PoolId;
}
export type Result = {
    __kind__: "ok";
    ok: Position;
} | {
    __kind__: "err";
    err: ApiError;
};
export type Result_1 = {
    __kind__: "ok";
    ok: AlertRule;
} | {
    __kind__: "err";
    err: ApiError;
};
export type Result_2 = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: ApiError;
};
export type Result_3 = {
    __kind__: "ok";
    ok: null;
} | {
    __kind__: "err";
    err: Error_;
};
export interface Result__1 {
    hasMore: boolean;
    rows: Array<Array<Cell>>;
}
export interface Settings {
    theme: Theme;
    emailAlertsEnabled: boolean;
    autoRefreshEnabled: boolean;
}
export type Timestamp = bigint;
export interface TrackedWallet {
    chain: string;
    address: string;
}
export interface TransformationInput {
    context: Uint8Array;
    response: HttpRequestResult;
}
export interface TransformationOutput {
    status: bigint;
    body: Uint8Array;
    headers: Array<HttpHeader>;
}
export type Value = {
    __kind__: "int";
    int: bigint;
} | {
    __kind__: "nat";
    nat: bigint;
} | {
    __kind__: "float";
    float: number;
} | {
    __kind__: "bool";
    bool: boolean;
} | {
    __kind__: "null";
    null: null;
} | {
    __kind__: "text";
    text: string;
};
export interface WatchlistEntry {
    displayName: string;
    chain: string;
    symbol: string;
    project: string;
    poolId: PoolId;
}
export enum AlertMetric {
    apyBelow = "apyBelow",
    tvlDropPercent = "tvlDropPercent",
    apyAbove = "apyAbove"
}
export enum Theme {
    auto = "auto",
    dark = "dark",
    light = "light"
}
export enum UserRole {
    admin = "admin",
    user = "user",
    guest = "guest"
}
export interface backendInterface {
    addPosition(input: PositionInput): Promise<Result>;
    addToWatchlist(entry: WatchlistEntry): Promise<Result_2>;
    addWallet(wallet: TrackedWallet): Promise<Result_2>;
    assignCallerUserRole(user: Principal, role: UserRole): Promise<void>;
    clearAlertHistory(): Promise<void>;
    createAlertRule(input: AlertRuleInput): Promise<Result_1>;
    deleteAlertRule(id: bigint): Promise<boolean>;
    deleteAllMyData(): Promise<void>;
    /**
     * / Runs an evaluation of the caller's own enabled rules immediately.
     */
    evaluateMyAlertsNow(): Promise<EvaluationSummary>;
    execute(qJson: string): Promise<Result__1>;
    getApiDoc(): Promise<string>;
    getCallerUserRole(): Promise<UserRole>;
    /**
     * / Mints the caller's short-lived inference key. Signed-in callers only.
     */
    getInferenceCredentials(): Promise<Credentials>;
    getSettings(): Promise<Settings>;
    hasVerifiedEmail(): Promise<boolean>;
    importLocalData(batch: ImportBatch): Promise<ImportSummary>;
    isCallerAdmin(): Promise<boolean>;
    listAlertHistory(): Promise<Array<AlertHistoryEntry>>;
    listAlertRules(): Promise<Array<AlertRule>>;
    listPositions(): Promise<Array<Position>>;
    listWallets(): Promise<Array<TrackedWallet>>;
    listWatchlist(): Promise<Array<WatchlistEntry>>;
    markAlertRead(id: bigint): Promise<boolean>;
    markAllAlertsRead(): Promise<void>;
    removeFromWatchlist(poolId: PoolId): Promise<boolean>;
    removePosition(id: bigint): Promise<boolean>;
    removeWallet(chain: string, address: string): Promise<boolean>;
    schema(): Promise<string>;
    setAlertRuleEnabled(id: bigint, enabled: boolean): Promise<Result_1>;
    transform(input: TransformationInput): Promise<TransformationOutput>;
    unreadAlertCount(): Promise<bigint>;
    updateAlertRule(id: bigint, input: AlertRuleInput): Promise<Result_1>;
    updatePosition(id: bigint, input: PositionInput): Promise<Result>;
    updateSettings(value: Settings): Promise<void>;
}
