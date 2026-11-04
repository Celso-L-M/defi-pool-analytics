import Map "mo:core/Map";
import Common "common";

module {
  public type Theme = { #dark; #light; #auto };

  public type Settings = {
    emailAlertsEnabled : Bool;
    autoRefreshEnabled : Bool;
    theme : Theme;
  };

  public type WatchlistEntry = {
    poolId : Common.PoolId;
    displayName : Text;
    symbol : Text;
    project : Text;
    chain : Text;
  };

  public type Position = {
    id : Nat;
    poolId : Common.PoolId;
    displayName : Text;
    symbol : Text;
    amountUsd : Float;
    entryTimestamp : Common.Timestamp;
    notes : ?Text;
  };

  public type PositionInput = {
    poolId : Common.PoolId;
    displayName : Text;
    symbol : Text;
    amountUsd : Float;
    entryTimestamp : Common.Timestamp;
    notes : ?Text;
  };

  public type TrackedWallet = {
    address : Text;
    chain : Text;
  };

  public type ImportBatch = {
    watchlist : [WatchlistEntry];
    positions : [PositionInput];
    wallets : [TrackedWallet];
  };

  public type ImportSummary = {
    watchlistAdded : Nat;
    positionsAdded : Nat;
    walletsAdded : Nat;
    skipped : Nat;
  };

  /// Internal id counter for positions.
  public type UserCounters = { var nextPositionId : Nat };

  /// Per-user containers, keyed by caller principal (and an inner key per item).
  public type SettingsMap = Map.Map<Principal, Settings>;
  /// Inner key: poolId.
  public type WatchlistMap = Map.Map<Principal, Map.Map<Common.PoolId, WatchlistEntry>>;
  /// Inner key: position id.
  public type PositionsMap = Map.Map<Principal, Map.Map<Nat, Position>>;
  /// Inner key: chain # ":" # address.
  public type WalletsMap = Map.Map<Principal, Map.Map<Text, TrackedWallet>>;
  /// Verified email captured at sign-in; never returned to callers.
  public type EmailsMap = Map.Map<Principal, Text>;
};
