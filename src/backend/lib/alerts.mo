import Result "mo:core/Result";
import Map "mo:core/Map";
import Set "mo:core/Set";
import List "mo:core/List";
import Principal "mo:core/Principal";
import Nat "mo:core/Nat";
import Nat32 "mo:core/Nat32";
import Int "mo:core/Int";
import Char "mo:core/Char";
import Float "mo:core/Float";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Timer "mo:core/Timer";
import OutCall "mo:caffeineai-http-outcalls/outcall";
import EmailClient "mo:caffeineai-email/emailClient";
import Common "../types/common";
import Types "../types/alerts";

module {
  /// Newest history entries kept per user.
  let maxHistoryPerUser : Nat = 200;
  /// How many trailing chart points are parsed from a DefiLlama chart.
  let maxPoints : Nat = 120;
  let secondsPerDay : Int = 86_400;

  type Point = { ts : Int; tvl : ?Float; apy : ?Float };
  type PoolSnapshot = { apy : ?Float; tvl : ?Float; tvlPrev : ?Float };
  type RuleOutcome = { #skipped; #noData; #evaluated; #triggered };

  // ---------------------------------------------------------------- rules

  func validate(input : Types.AlertRuleInput) : ?Text {
    let id = input.poolId;
    if (id.size() == 0 or id.size() > 100) {
      return ?"Invalid pool id";
    };
    for (c in id.toIter()) {
      let ok = (c >= 'a' and c <= 'z') or (c >= 'A' and c <= 'Z') or (c >= '0' and c <= '9') or c == '-' or c == '_';
      if (not ok) {
        return ?"Invalid pool id";
      };
    };
    let name = input.poolLabel.trim(#char ' ');
    if (name.size() == 0 or name.size() > 120) {
      return ?"Pool label must be 1 to 120 characters";
    };
    let t = input.threshold;
    if (t.isNaN() or Float.abs(t) > 1.0e12) {
      return ?"Threshold must be a finite number";
    };
    switch (input.metric) {
      case (#apyBelow) {
        if (t < 0.0) { return ?"APY threshold cannot be negative" };
      };
      case (#apyAbove) {
        if (t < 0.0) { return ?"APY threshold cannot be negative" };
      };
      case (#tvlDropPercent) {
        if (t <= 0.0 or t > 100.0) {
          return ?"TVL drop threshold must be between 0 and 100 percent";
        };
      };
    };
    null;
  };

  public func createRule(rules : Types.RulesMap, counters : Types.AlertCounters, caller : Principal, input : Types.AlertRuleInput) : Result.Result<Types.AlertRule, Common.ApiError> {
    switch (validate(input)) {
      case (?msg) { return #err(#invalid(msg)) };
      case null {};
    };
    let inner = switch (rules.get(caller)) {
      case (?m) m;
      case null {
        let m = Map.empty<Nat, Types.AlertRule>();
        rules.add(caller, m);
        m;
      };
    };
    if (inner.size() >= Types.maxRulesPerUser) {
      return #err(#limitReached(Types.maxRulesPerUser));
    };
    let id = counters.nextRuleId;
    counters.nextRuleId += 1;
    let rule : Types.AlertRule = {
      id;
      poolId = input.poolId;
      poolLabel = input.poolLabel.trim(#char ' ');
      metric = input.metric;
      threshold = input.threshold;
      enabled = true;
      armed = true;
      createdAt = Time.now();
      lastTriggeredAt = null;
    };
    inner.add(id, rule);
    #ok(rule);
  };

  public func updateRule(rules : Types.RulesMap, caller : Principal, id : Nat, input : Types.AlertRuleInput) : Result.Result<Types.AlertRule, Common.ApiError> {
    switch (validate(input)) {
      case (?msg) { return #err(#invalid(msg)) };
      case null {};
    };
    let inner = switch (rules.get(caller)) {
      case (?m) m;
      case null { return #err(#notFound) };
    };
    switch (inner.get(id)) {
      case null { #err(#notFound) };
      case (?rule) {
        let updated : Types.AlertRule = {
          rule with
          poolId = input.poolId;
          poolLabel = input.poolLabel.trim(#char ' ');
          metric = input.metric;
          threshold = input.threshold;
          armed = true;
        };
        inner.add(id, updated);
        #ok(updated);
      };
    };
  };

  public func setRuleEnabled(rules : Types.RulesMap, caller : Principal, id : Nat, enabled : Bool) : Result.Result<Types.AlertRule, Common.ApiError> {
    let inner = switch (rules.get(caller)) {
      case (?m) m;
      case null { return #err(#notFound) };
    };
    switch (inner.get(id)) {
      case null { #err(#notFound) };
      case (?rule) {
        let updated : Types.AlertRule = if (enabled and not rule.enabled) {
          { rule with enabled = true; armed = true };
        } else {
          { rule with enabled };
        };
        inner.add(id, updated);
        #ok(updated);
      };
    };
  };

  public func deleteRule(rules : Types.RulesMap, caller : Principal, id : Nat) : Bool {
    switch (rules.get(caller)) {
      case null { false };
      case (?inner) {
        let existed = inner.containsKey(id);
        if (existed) { inner.remove(id) };
        existed;
      };
    };
  };

  public func listRules(rules : Types.RulesMap, caller : Principal) : [Types.AlertRule] {
    switch (rules.get(caller)) {
      case null { [] };
      case (?inner) { inner.values().toArray() };
    };
  };

  // -------------------------------------------------------------- history

  /// Newest first.
  public func listHistory(history : Types.HistoryMap, caller : Principal) : [Types.AlertHistoryEntry] {
    switch (history.get(caller)) {
      case null { [] };
      case (?inner) {
        let out = List.empty<Types.AlertHistoryEntry>();
        for ((_, entry) in inner.reverseEntries()) {
          out.add(entry);
        };
        out.toArray();
      };
    };
  };

  public func markRead(history : Types.HistoryMap, caller : Principal, id : Nat) : Bool {
    switch (history.get(caller)) {
      case null { false };
      case (?inner) {
        switch (inner.get(id)) {
          case null { false };
          case (?entry) {
            inner.add(id, { entry with read = true });
            true;
          };
        };
      };
    };
  };

  public func markAllRead(history : Types.HistoryMap, caller : Principal) {
    switch (history.get(caller)) {
      case null {};
      case (?inner) {
        for (entry in inner.values().toArray().values()) {
          if (not entry.read) {
            inner.add(entry.id, { entry with read = true });
          };
        };
      };
    };
  };

  public func clearHistory(history : Types.HistoryMap, caller : Principal) {
    switch (history.get(caller)) {
      case null {};
      case (?inner) { inner.clear() };
    };
  };

  public func unreadCount(history : Types.HistoryMap, caller : Principal) : Nat {
    switch (history.get(caller)) {
      case null { 0 };
      case (?inner) {
        inner.foldLeft(0, func(acc, _id, entry) = if (entry.read) acc else acc + 1);
      };
    };
  };

  func addHistory(history : Types.HistoryMap, user : Principal, entry : Types.AlertHistoryEntry) {
    let inner = switch (history.get(user)) {
      case (?m) m;
      case null {
        let m = Map.empty<Nat, Types.AlertHistoryEntry>();
        history.add(user, m);
        m;
      };
    };
    inner.add(entry.id, entry);
    while (inner.size() > maxHistoryPerUser) {
      switch (inner.minEntry()) {
        case (?(oldest, _)) { inner.remove(oldest) };
        case null { return };
      };
    };
  };

  // ------------------------------------------------------- JSON scanning

  func digitValue(c : Char) : ?Nat {
    if (c >= '0' and c <= '9') {
      ?((c.toNat32().toNat().toInt() - 48).toNat());
    } else { null };
  };

  /// Parses a JSON number such as 3.6, 11074372760 or -1.2e-7. Returns null for `null`.
  func parseNumber(t : Text) : ?Float {
    var neg = false;
    var mode = 0; // 0 integer, 1 fraction, 2 exponent
    var value : Float = 0.0;
    var scale : Float = 1.0;
    var exponent : Int = 0;
    var expNeg = false;
    var sawDigit = false;
    for (c in t.toIter()) {
      if (c == '-') {
        if (mode == 2) { expNeg := true } else { neg := true };
      } else if (c == '+') {} else if (c == '.') {
        mode := 1;
      } else if (c == 'e' or c == 'E') {
        mode := 2;
      } else {
        switch (digitValue(c)) {
          case null { return null };
          case (?d) {
            if (mode == 0) {
              value := value * 10.0 + d.toFloat();
              sawDigit := true;
            } else if (mode == 1) {
              scale := scale / 10.0;
              value := value + d.toFloat() * scale;
              sawDigit := true;
            } else {
              exponent := exponent * 10 + d.toInt();
            };
          };
        };
      };
    };
    if (not sawDigit) { return null };
    let mantissa = if (neg) { -value } else { value };
    if (exponent == 0) { ?mantissa } else {
      let e : Int = if (expNeg) { -exponent } else { exponent };
      ?(mantissa * Float.pow(10.0, e.toFloat()));
    };
  };

  /// Days since 1970-01-01 for a proleptic Gregorian date (year >= 1970).
  func daysFromCivil(year : Int, month : Int, day : Int) : Int {
    let y = if (month <= 2) { year - 1 } else { year };
    let era = y / 400;
    let yoe = y - era * 400;
    let mp = (month + 9) % 12;
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468;
  };

  /// "2022-05-03T00:00:00.000Z" -> epoch seconds.
  func parseTimestamp(t : Text) : ?Int {
    let parts = t.split(#predicate(func c = c == '-' or c == 'T' or c == ':' or c == '.' or c == 'Z')).toArray();
    if (parts.size() < 6) { return null };
    switch (parts[0].toNat(), parts[1].toNat(), parts[2].toNat(), parts[3].toNat(), parts[4].toNat(), parts[5].toNat()) {
      case (?y, ?mo, ?d, ?h, ?mi, ?s) {
        ?(daysFromCivil(y.toInt(), mo.toInt(), d.toInt()) * secondsPerDay + h.toInt() * 3600 + mi.toInt() * 60 + s.toInt());
      };
      case _ { null };
    };
  };

  func fieldValue(chunk : Text, key : Text) : ?Text {
    let parts = chunk.split(#text("\"" # key # "\":"));
    ignore parts.next();
    switch (parts.next()) {
      case null { null };
      case (?rest) { rest.split(#predicate(func c = c == ',' or c == '}')).next() };
    };
  };

  func numberField(chunk : Text, key : Text) : ?Float {
    switch (fieldValue(chunk, key)) {
      case (?v) { parseNumber(v) };
      case null { null };
    };
  };

  func parsePoint(chunk : Text) : ?Point {
    switch (chunk.split(#text("\"")).next()) {
      case null { null };
      case (?stamp) {
        switch (parseTimestamp(stamp)) {
          case null { null };
          case (?ts) {
            ?{ ts; tvl = numberField(chunk, "tvlUsd"); apy = numberField(chunk, "apy") };
          };
        };
      };
    };
  };

  /// Reads the latest APY/TVL and the TVL about 24 hours earlier from a chart body.
  func parseSnapshot(body : Text) : ?PoolSnapshot {
    let chunks = body.split(#text("{\"timestamp\":\"")).toArray();
    let n = chunks.size();
    let points = List.empty<Point>();
    var i = 1;
    while (i < n) {
      if (i + maxPoints >= n) {
        switch (parsePoint(chunks[i])) {
          case (?p) { points.add(p) };
          case null {};
        };
      };
      i += 1;
    };
    let pts = points.toArray();
    if (pts.size() == 0) { return null };
    let latest = pts[pts.size() - 1];
    if (latest.apy == null and latest.tvl == null) { return null };
    let cutoff = latest.ts - secondsPerDay;
    var tvlPrev : ?Float = null;
    var j = pts.size();
    while (j > 0 and tvlPrev == null) {
      j -= 1;
      let p = pts[j];
      if (p.ts <= cutoff) { tvlPrev := p.tvl };
    };
    ?{ apy = latest.apy; tvl = latest.tvl; tvlPrev };
  };

  func fetchSnapshot(poolId : Text, transform : OutCall.Transform) : async* ?PoolSnapshot {
    try {
      let res = await OutCall.httpRequest({
        url = "https://yields.llama.fi/chart/" # poolId;
        method = #get;
        headers = [];
        body = null;
        maxResponseBytes = 1_000_000;
        transform;
      });
      if (res.status != 200) { return null };
      switch (res.body.decodeUtf8()) {
        case null { null };
        case (?text) { parseSnapshot(text) };
      };
    } catch _ { null };
  };

  func fetchAll(cache : Map.Map<Text, PoolSnapshot>, poolIds : Set.Set<Text>, transform : OutCall.Transform) : async* () {
    for (poolId in poolIds.toArray().values()) {
      switch (await* fetchSnapshot(poolId, transform)) {
        case (?snap) { cache.add(poolId, snap) };
        case null {};
      };
    };
  };

  // ----------------------------------------------------------- evaluation

  func observedValue(metric : Types.AlertMetric, snap : PoolSnapshot) : ?Float {
    switch (metric) {
      case (#apyBelow) { snap.apy };
      case (#apyAbove) { snap.apy };
      case (#tvlDropPercent) {
        switch (snap.tvl, snap.tvlPrev) {
          case (?cur, ?prev) {
            if (prev > 0.0) { ?((prev - cur) / prev * 100.0) } else { null };
          };
          case _ { null };
        };
      };
    };
  };

  func conditionMet(metric : Types.AlertMetric, threshold : Float, value : Float) : Bool {
    switch (metric) {
      case (#apyBelow) { value < threshold };
      case (#apyAbove) { value > threshold };
      case (#tvlDropPercent) { value >= threshold };
    };
  };

  func escapeHtml(t : Text) : Text {
    t.replace(#char '&', "&amp;").replace(#char '<', "&lt;").replace(#char '>', "&gt;").replace(#text("\""), "&quot;");
  };

  func sendAlertEmail(address : Text, entry : Types.AlertHistoryEntry) : async* Bool {
    let (what, unit) = switch (entry.metric) {
      case (#apyBelow) { ("APY fell below", "%") };
      case (#apyAbove) { ("APY rose above", "%") };
      case (#tvlDropPercent) { ("TVL dropped by at least", "% over 24 hours") };
    };
    let observed = entry.observedValue.format(#fix 2);
    let threshold = entry.threshold.format(#fix 2);
    let poolName = escapeHtml(entry.poolLabel);
    let subject = "DeFi alert: " # entry.poolLabel # " - " # what # " " # threshold # unit;
    let html = "<p>Your alert for <strong>" # poolName # "</strong> was triggered.</p>"
    # "<ul><li>Condition: " # what # " " # threshold # unit # "</li>"
    # "<li>Observed value: " # observed # unit # "</li>"
    # "<li>Threshold: " # threshold # unit # "</li></ul>"
    # "<p>This alert is now paused and re-arms once the condition clears.</p>";
    try {
      switch (await EmailClient.sendServiceEmail("no-reply", [address], subject, html)) {
        case (#ok) { true };
        case (#err(_)) { false };
      };
    } catch _ { false };
  };

  func evalRule(state : Types.EvalState, user : Principal, ruleId : Nat, cache : Map.Map<Text, PoolSnapshot>) : async* RuleOutcome {
    let inner = switch (state.rules.get(user)) {
      case (?m) m;
      case null { return #skipped };
    };
    let rule = switch (inner.get(ruleId)) {
      case (?r) r;
      case null { return #skipped };
    };
    if (not rule.enabled) { return #skipped };
    let snap = switch (cache.get(rule.poolId)) {
      case (?s) s;
      case null { return #noData };
    };
    let value = switch (observedValue(rule.metric, snap)) {
      case (?v) v;
      case null { return #noData };
    };
    if (not conditionMet(rule.metric, rule.threshold, value)) {
      if (not rule.armed) { inner.add(ruleId, { rule with armed = true }) };
      return #evaluated;
    };
    if (not rule.armed) { return #evaluated };

    // Breach: disarm, record history, then optionally email the owner.
    let now = Time.now();
    inner.add(ruleId, { rule with armed = false; lastTriggeredAt = ?now });
    let historyId = state.counters.nextHistoryId;
    state.counters.nextHistoryId += 1;
    // A user without a saved settings row gets the defaults (email alerts on).
    let emailEnabled = switch (state.settings.get(user)) {
      case (?s) { s.emailAlertsEnabled };
      case null { true };
    };
    let address : ?Text = if (emailEnabled) { state.emails.get(user) } else { null };
    let entry : Types.AlertHistoryEntry = {
      id = historyId;
      ruleId;
      poolLabel = rule.poolLabel;
      metric = rule.metric;
      observedValue = value;
      threshold = rule.threshold;
      triggeredAt = now;
      read = false;
      emailSent = false;
    };
    addHistory(state.history, user, entry);
    switch (address) {
      case null {};
      case (?to) {
        if (await* sendAlertEmail(to, entry)) {
          switch (state.history.get(user)) {
            case null {};
            case (?h) {
              switch (h.get(historyId)) {
                case (?e) { h.add(historyId, { e with emailSent = true }) };
                case null {};
              };
            };
          };
        };
      };
    };
    #triggered;
  };

  /// Distinct pool ids of the user's enabled rules.
  func enabledPoolIds(state : Types.EvalState, user : Principal, into : Set.Set<Text>) {
    switch (state.rules.get(user)) {
      case null {};
      case (?inner) {
        for (rule in inner.values()) {
          if (rule.enabled) { into.add(rule.poolId) };
        };
      };
    };
  };

  func applyUser(state : Types.EvalState, user : Principal, cache : Map.Map<Text, PoolSnapshot>) : async* Types.EvaluationSummary {
    let ruleIds : [Nat] = switch (state.rules.get(user)) {
      case null { [] };
      case (?inner) { inner.keys().toArray() };
    };
    let missing = Set.empty<Text>();
    for (id in ruleIds.values()) {
      switch (state.rules.get(user)) {
        case null {};
        case (?inner) {
          switch (inner.get(id)) {
            case (?rule) {
              if (rule.enabled and not cache.containsKey(rule.poolId)) {
                missing.add(rule.poolId);
              };
            };
            case null {};
          };
        };
      };
    };
    var evaluated = 0;
    var triggered = 0;
    for (id in ruleIds.values()) {
      switch (await* evalRule(state, user, id, cache)) {
        case (#evaluated) { evaluated += 1 };
        case (#triggered) {
          evaluated += 1;
          triggered += 1;
        };
        case _ {};
      };
    };
    { rulesEvaluated = evaluated; triggered; failedPools = missing.size() };
  };

  /// Evaluates one user's enabled rules against DefiLlama chart history.
  public func evaluateUser(state : Types.EvalState, user : Principal, transform : OutCall.Transform) : async* Types.EvaluationSummary {
    let poolIds = Set.empty<Text>();
    enabledPoolIds(state, user, poolIds);
    let cache = Map.empty<Text, PoolSnapshot>();
    await* fetchAll(cache, poolIds, transform);
    await* applyUser(state, user, cache);
  };

  /// Evaluates every user's enabled rules, deduplicating pools per run.
  public func evaluateAll(state : Types.EvalState, transform : OutCall.Transform) : async* () {
    let users = state.rules.keys().toArray();
    let poolIds = Set.empty<Text>();
    for (user in users.values()) {
      enabledPoolIds(state, user, poolIds);
    };
    if (poolIds.size() == 0) { return };
    let cache = Map.empty<Text, PoolSnapshot>();
    await* fetchAll(cache, poolIds, transform);
    for (user in users.values()) {
      ignore await* applyUser(state, user, cache);
    };
  };

  /// Starts the recurring evaluation timer; call once from the actor body.
  public func startScheduler<system>(state : Types.EvalState, transform : OutCall.Transform) {
    ignore Timer.recurringTimer<system>(
      #minutes 30,
      func() : async () {
        await* evaluateAll(state, transform);
      },
    );
  };
};
