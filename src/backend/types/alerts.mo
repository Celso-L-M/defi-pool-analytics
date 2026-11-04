import Map "mo:core/Map";
import Common "common";
import UserData "userdata";

module {
  public type AlertMetric = { #apyBelow; #apyAbove; #tvlDropPercent };

  public type AlertRule = {
    id : Nat;
    poolId : Common.PoolId;
    poolLabel : Text;
    metric : AlertMetric;
    threshold : Float;
    enabled : Bool;
    armed : Bool;
    createdAt : Common.Timestamp;
    lastTriggeredAt : ?Common.Timestamp;
  };

  public type AlertRuleInput = {
    poolId : Common.PoolId;
    poolLabel : Text;
    metric : AlertMetric;
    threshold : Float;
  };

  public type AlertHistoryEntry = {
    id : Nat;
    ruleId : Nat;
    poolLabel : Text;
    metric : AlertMetric;
    observedValue : Float;
    threshold : Float;
    triggeredAt : Common.Timestamp;
    read : Bool;
    emailSent : Bool;
  };

  public type EvaluationSummary = {
    rulesEvaluated : Nat;
    triggered : Nat;
    failedPools : Nat;
  };

  public type AlertCounters = { var nextRuleId : Nat; var nextHistoryId : Nat };

  /// Maximum alert rules per user.
  public let maxRulesPerUser : Nat = 25;

  /// Inner key: rule id.
  public type RulesMap = Map.Map<Principal, Map.Map<Nat, AlertRule>>;
  /// Inner key: history entry id.
  public type HistoryMap = Map.Map<Principal, Map.Map<Nat, AlertHistoryEntry>>;

  /// State the evaluator reads and writes.
  public type EvalState = {
    settings : UserData.SettingsMap;
    emails : UserData.EmailsMap;
    rules : RulesMap;
    history : HistoryMap;
    counters : AlertCounters;
  };
};
