import Result "mo:core/Result";
import Runtime "mo:core/Runtime";
import OutCall "mo:caffeineai-http-outcalls/outcall";
import Common "../types/common";
import Types "../types/alerts";
import AlertsLib "../lib/alerts";

mixin (
  state : Types.EvalState,
  transform : OutCall.Transform,
) {
  func requireAlertUser(caller : Principal) {
    if (caller.isAnonymous()) {
      Runtime.trap("Anonymous callers are not allowed");
    };
  };

  public shared ({ caller }) func createAlertRule(input : Types.AlertRuleInput) : async Result.Result<Types.AlertRule, Common.ApiError> {
    requireAlertUser(caller);
    AlertsLib.createRule(state.rules, state.counters, caller, input);
  };

  public shared ({ caller }) func updateAlertRule(id : Nat, input : Types.AlertRuleInput) : async Result.Result<Types.AlertRule, Common.ApiError> {
    requireAlertUser(caller);
    AlertsLib.updateRule(state.rules, caller, id, input);
  };

  public shared ({ caller }) func setAlertRuleEnabled(id : Nat, enabled : Bool) : async Result.Result<Types.AlertRule, Common.ApiError> {
    requireAlertUser(caller);
    AlertsLib.setRuleEnabled(state.rules, caller, id, enabled);
  };

  public shared ({ caller }) func deleteAlertRule(id : Nat) : async Bool {
    requireAlertUser(caller);
    AlertsLib.deleteRule(state.rules, caller, id);
  };

  public query ({ caller }) func listAlertRules() : async [Types.AlertRule] {
    requireAlertUser(caller);
    AlertsLib.listRules(state.rules, caller);
  };

  public query ({ caller }) func listAlertHistory() : async [Types.AlertHistoryEntry] {
    requireAlertUser(caller);
    AlertsLib.listHistory(state.history, caller);
  };

  public shared ({ caller }) func markAlertRead(id : Nat) : async Bool {
    requireAlertUser(caller);
    AlertsLib.markRead(state.history, caller, id);
  };

  public shared ({ caller }) func markAllAlertsRead() : async () {
    requireAlertUser(caller);
    AlertsLib.markAllRead(state.history, caller);
  };

  public shared ({ caller }) func clearAlertHistory() : async () {
    requireAlertUser(caller);
    AlertsLib.clearHistory(state.history, caller);
  };

  public query ({ caller }) func unreadAlertCount() : async Nat {
    requireAlertUser(caller);
    AlertsLib.unreadCount(state.history, caller);
  };

  /// Runs an evaluation of the caller's own enabled rules immediately.
  public shared ({ caller }) func evaluateMyAlertsNow() : async Types.EvaluationSummary {
    requireAlertUser(caller);
    await* AlertsLib.evaluateUser(state, caller, transform);
  };
};
