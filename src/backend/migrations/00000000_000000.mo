import Map "mo:core/Map";
import AccessControl "mo:caffeineai-authorization/access-control";

module {
  type Theme = { #dark; #light; #auto };

  type Settings = {
    emailAlertsEnabled : Bool;
    autoRefreshEnabled : Bool;
    theme : Theme;
  };

  type WatchlistEntry = {
    poolId : Text;
    displayName : Text;
    symbol : Text;
    project : Text;
    chain : Text;
  };

  type Position = {
    id : Nat;
    poolId : Text;
    displayName : Text;
    symbol : Text;
    amountUsd : Float;
    entryTimestamp : Int;
    notes : ?Text;
  };

  type TrackedWallet = {
    address : Text;
    chain : Text;
  };

  type AlertMetric = { #apyBelow; #apyAbove; #tvlDropPercent };

  type AlertRule = {
    id : Nat;
    poolId : Text;
    poolLabel : Text;
    metric : AlertMetric;
    threshold : Float;
    enabled : Bool;
    armed : Bool;
    createdAt : Int;
    lastTriggeredAt : ?Int;
  };

  type AlertHistoryEntry = {
    id : Nat;
    ruleId : Nat;
    poolLabel : Text;
    metric : AlertMetric;
    observedValue : Float;
    threshold : Float;
    triggeredAt : Int;
    read : Bool;
    emailSent : Bool;
  };

  type OldActor = {};

  type NewActor = {
    accessControlState : AccessControl.AccessControlState;
    settings : Map.Map<Principal, Settings>;
    watchlists : Map.Map<Principal, Map.Map<Text, WatchlistEntry>>;
    positions : Map.Map<Principal, Map.Map<Nat, Position>>;
    wallets : Map.Map<Principal, Map.Map<Text, TrackedWallet>>;
    emails : Map.Map<Principal, Text>;
    alertRules : Map.Map<Principal, Map.Map<Nat, AlertRule>>;
    alertHistory : Map.Map<Principal, Map.Map<Nat, AlertHistoryEntry>>;
    userCounters : { var nextPositionId : Nat };
    alertCounters : { var nextRuleId : Nat; var nextHistoryId : Nat };
  };

  public func migration(_old : OldActor) : NewActor {
    {
      accessControlState = AccessControl.initState();
      settings = Map.empty();
      watchlists = Map.empty();
      positions = Map.empty();
      wallets = Map.empty();
      emails = Map.empty();
      alertRules = Map.empty();
      alertHistory = Map.empty();
      userCounters = { var nextPositionId = 1 };
      alertCounters = { var nextRuleId = 1; var nextHistoryId = 1 };
    };
  };
};
