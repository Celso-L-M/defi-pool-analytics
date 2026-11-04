import List "mo:core/List";
import Map "mo:core/Map";
import Iter "mo:core/Iter";
import Principal "mo:core/Principal";
import AccessControl "mo:caffeineai-authorization/access-control";
import MixinAuthorization "mo:caffeineai-authorization/MixinAuthorization";
import OutCall "mo:caffeineai-http-outcalls/outcall";
import OQL "mo:caffeineai-oql";
import Expose "mo:caffeineai-oql/Expose";
import Entity "mo:caffeineai-oql/Entity";
import RecordValue "mo:caffeineai-oql/RecordValue";
import NatValue "mo:caffeineai-oql/NatValue";
import IntValue "mo:caffeineai-oql/IntValue";
import FloatValue "mo:caffeineai-oql/FloatValue";
import BoolValue "mo:caffeineai-oql/BoolValue";
import TextValue "mo:caffeineai-oql/TextValue";
import PrincipalValue "mo:caffeineai-oql/PrincipalValue";
import UserDataTypes "types/userdata";
import AlertTypes "types/alerts";
import UserDataLib "lib/userdata";
import AlertsLib "lib/alerts";
import UserDataApi "mixins/userdata-api";
import AlertsApi "mixins/alerts-api";
import InferenceApi "mixins/inference-api";
import ApiDocMixin "mixins/api-doc";

actor {
  let accessControlState : AccessControl.AccessControlState;
  let settings : UserDataTypes.SettingsMap;
  let watchlists : UserDataTypes.WatchlistMap;
  let positions : UserDataTypes.PositionsMap;
  let wallets : UserDataTypes.WalletsMap;
  let emails : UserDataTypes.EmailsMap;
  let alertRules : AlertTypes.RulesMap;
  let alertHistory : AlertTypes.HistoryMap;
  let userCounters : UserDataTypes.UserCounters;
  let alertCounters : AlertTypes.AlertCounters;

  // Transform callback required by non-replicated HTTP outcalls.
  public query func transform(input : OutCall.TransformationInput) : async OutCall.TransformationOutput {
    OutCall.transform(input);
  };

  include MixinAuthorization(
    accessControlState,
    ?(func(caller : Principal, attrs : { name : ?Text; email : ?Text; sso : ?Text }) {
      UserDataLib.recordVerifiedEmail(emails, caller, attrs.email);
    }),
  );

  // Shared alert evaluation state; fields reference the same persisted collections.
  transient let evalState : AlertTypes.EvalState = {
    settings;
    emails;
    rules = alertRules;
    history = alertHistory;
    counters = alertCounters;
  };

  include UserDataApi(settings, watchlists, positions, wallets, emails, alertRules, alertHistory, userCounters);

  include AlertsApi(evalState, transform);

  include InferenceApi();

  include ApiDocMixin();

  // Recurring alert evaluation (every 30 minutes).
  AlertsLib.startScheduler<system>(evalState, transform);

  // ---------------------------------------------------------------- OQL

  // Flat, owner-tagged row shapes for the per-user tables.
  type SettingsRow = {
    owner : Principal;
    emailAlertsEnabled : Bool;
    autoRefreshEnabled : Bool;
    theme : Text;
  };

  type WatchlistRow = {
    owner : Principal;
    poolId : Text;
    displayName : Text;
    symbol : Text;
    project : Text;
    chain : Text;
  };

  type PositionRow = {
    owner : Principal;
    id : Nat;
    poolId : Text;
    displayName : Text;
    symbol : Text;
    amountUsd : Float;
    entryTimestamp : Int;
    notes : ?Text;
  };

  type WalletRow = {
    owner : Principal;
    key : Text;
    address : Text;
    chain : Text;
  };

  type AlertRuleRow = {
    owner : Principal;
    id : Nat;
    poolId : Text;
    poolLabel : Text;
    metric : Text;
    threshold : Float;
    enabled : Bool;
    armed : Bool;
    createdAt : Int;
    lastTriggeredAt : ?Int;
  };

  type AlertHistoryRow = {
    owner : Principal;
    id : Nat;
    ruleId : Nat;
    poolLabel : Text;
    metric : Text;
    observedValue : Float;
    threshold : Float;
    triggeredAt : Int;
    read : Bool;
    emailSent : Bool;
  };

  transient let anyPrincipal = Principal.fromText("aaaaa-aa");

  func themeText(t : UserDataTypes.Theme) : Text {
    switch (t) {
      case (#dark) { "dark" };
      case (#light) { "light" };
      case (#auto) { "auto" };
    };
  };

  func metricText(m : AlertTypes.AlertMetric) : Text {
    switch (m) {
      case (#apyBelow) { "apyBelow" };
      case (#apyAbove) { "apyAbove" };
      case (#tvlDropPercent) { "tvlDropPercent" };
    };
  };

  // Rows of a Map<Principal, Map<K, V>>: only the subject's rows for ?p, all rows for null.
  func nestedRows<K, V, R>(outer : Map.Map<Principal, Map.Map<K, V>>, subject : ?Principal, mk : (Principal, V) -> R) : Iter.Iter<R> {
    let out = List.empty<R>();
    switch (subject) {
      case (?p) {
        switch (outer.get(p)) {
          case (?inner) {
            for (v in inner.values()) { out.add(mk(p, v)) };
          };
          case null {};
        };
      };
      case null {
        for ((p, inner) in outer.entries()) {
          for (v in inner.values()) { out.add(mk(p, v)) };
        };
      };
    };
    out.values();
  };

  func settingsRow(p : Principal, s : UserDataTypes.Settings) : SettingsRow {
    {
      owner = p;
      emailAlertsEnabled = s.emailAlertsEnabled;
      autoRefreshEnabled = s.autoRefreshEnabled;
      theme = themeText(s.theme);
    };
  };

  func settingsRows(subject : ?Principal) : Iter.Iter<SettingsRow> {
    let out = List.empty<SettingsRow>();
    switch (subject) {
      case (?p) {
        switch (settings.get(p)) {
          case (?s) { out.add(settingsRow(p, s)) };
          case null {};
        };
      };
      case null {
        for ((p, s) in settings.entries()) { out.add(settingsRow(p, s)) };
      };
    };
    out.values();
  };

  func watchlistRows(subject : ?Principal) : Iter.Iter<WatchlistRow> {
    nestedRows(
      watchlists,
      subject,
      func(p, e) = {
        owner = p;
        poolId = e.poolId;
        displayName = e.displayName;
        symbol = e.symbol;
        project = e.project;
        chain = e.chain;
      },
    );
  };

  func positionRows(subject : ?Principal) : Iter.Iter<PositionRow> {
    nestedRows(
      positions,
      subject,
      func(p, e) = {
        owner = p;
        id = e.id;
        poolId = e.poolId;
        displayName = e.displayName;
        symbol = e.symbol;
        amountUsd = e.amountUsd;
        entryTimestamp = e.entryTimestamp;
        notes = e.notes;
      },
    );
  };

  func walletRows(subject : ?Principal) : Iter.Iter<WalletRow> {
    nestedRows(
      wallets,
      subject,
      func(p, e) = {
        owner = p;
        key = e.chain # ":" # e.address;
        address = e.address;
        chain = e.chain;
      },
    );
  };

  func alertRuleRows(subject : ?Principal) : Iter.Iter<AlertRuleRow> {
    nestedRows(
      alertRules,
      subject,
      func(p, e) = {
        owner = p;
        id = e.id;
        poolId = e.poolId;
        poolLabel = e.poolLabel;
        metric = metricText(e.metric);
        threshold = e.threshold;
        enabled = e.enabled;
        armed = e.armed;
        createdAt = e.createdAt;
        lastTriggeredAt = e.lastTriggeredAt;
      },
    );
  };

  func alertHistoryRows(subject : ?Principal) : Iter.Iter<AlertHistoryRow> {
    nestedRows(
      alertHistory,
      subject,
      func(p, e) = {
        owner = p;
        id = e.id;
        ruleId = e.ruleId;
        poolLabel = e.poolLabel;
        metric = metricText(e.metric);
        observedValue = e.observedValue;
        threshold = e.threshold;
        triggeredAt = e.triggeredAt;
        read = e.read;
        emailSent = e.emailSent;
      },
    );
  };

  // Every table is owner-scoped: a signed-in caller can query only their own rows.
  include Expose({
    entities = [
      OQL.Entity.newScoped<SettingsRow>("settings", settingsRows, "Settings", "owner")
        .sample({ owner = anyPrincipal; emailAlertsEnabled = true; autoRefreshEnabled = true; theme = "" })
        .ownedBy("owner")
        .scopedPerUser()
        .build(),
      OQL.Entity.newScoped<WatchlistRow>("watchlist", watchlistRows, "WatchlistEntry", "poolId")
        .sample({ owner = anyPrincipal; poolId = ""; displayName = ""; symbol = ""; project = ""; chain = "" })
        .ownedBy("owner")
        .scopedPerUser()
        .build(),
      OQL.Entity.newScoped<PositionRow>("position", positionRows, "Position", "id")
        .sample({ owner = anyPrincipal; id = 0; poolId = ""; displayName = ""; symbol = ""; amountUsd = 0.0; entryTimestamp = 0; notes = ?"" })
        .ownedBy("owner")
        .scopedPerUser()
        .build(),
      OQL.Entity.newScoped<WalletRow>("wallet", walletRows, "TrackedWallet", "key")
        .sample({ owner = anyPrincipal; key = ""; address = ""; chain = "" })
        .ownedBy("owner")
        .scopedPerUser()
        .build(),
      OQL.Entity.newScoped<AlertRuleRow>("alertRule", alertRuleRows, "AlertRule", "id")
        .sample({ owner = anyPrincipal; id = 0; poolId = ""; poolLabel = ""; metric = ""; threshold = 0.0; enabled = true; armed = true; createdAt = 0; lastTriggeredAt = ?0 })
        .ownedBy("owner")
        .scopedPerUser()
        .build(),
      OQL.Entity.newScoped<AlertHistoryRow>("alertHistory", alertHistoryRows, "AlertHistoryEntry", "id")
        .sample({ owner = anyPrincipal; id = 0; ruleId = 0; poolLabel = ""; metric = ""; observedValue = 0.0; threshold = 0.0; triggeredAt = 0; read = false; emailSent = false })
        .ownedBy("owner")
        .scopedPerUser()
        .build(),
    ];
  });
};
