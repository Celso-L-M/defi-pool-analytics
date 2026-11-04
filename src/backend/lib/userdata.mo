import Iter "mo:core/Iter";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Runtime "mo:core/Runtime";
import Text "mo:core/Text";
import Common "../types/common";
import Types "../types/userdata";
import AlertTypes "../types/alerts";

module {
  /// Per-user caps.
  public let maxWatchlistPerUser : Nat = 100;
  public let maxPositionsPerUser : Nat = 200;
  public let maxWalletsPerUser : Nat = 20;

  let maxTextLength : Nat = 200;
  let maxNotesLength : Nat = 1000;
  let maxAmountUsd : Float = 1.0e15;

  let defaultSettings : Types.Settings = {
    emailAlertsEnabled = true;
    autoRefreshEnabled = true;
    theme = #dark;
  };

  // ---------- internal helpers ----------

  func innerFor<K, V>(outer : Map.Map<Principal, Map.Map<K, V>>, caller : Principal) : Map.Map<K, V> {
    switch (outer.get(caller)) {
      case (?m) { m };
      case null {
        let m = Map.empty<K, V>();
        outer.add(caller, m);
        m;
      };
    };
  };

  func textOk(value : Text, allowEmpty : Bool) : Bool {
    let n = value.size();
    n <= maxTextLength and (allowEmpty or n > 0);
  };

  func validWatchlistEntry(entry : Types.WatchlistEntry) : Bool {
    textOk(entry.poolId, false) and textOk(entry.displayName, true) and textOk(entry.symbol, true) and textOk(entry.project, true) and textOk(entry.chain, true);
  };

  func validPositionInput(input : Types.PositionInput) : Bool {
    let notesOk = switch (input.notes) {
      case (?n) { n.size() <= maxNotesLength };
      case null { true };
    };
    textOk(input.poolId, false) and textOk(input.displayName, true) and textOk(input.symbol, true) and input.amountUsd > 0.0 and input.amountUsd < maxAmountUsd and notesOk;
  };

  func validWallet(wallet : Types.TrackedWallet) : Bool {
    textOk(wallet.chain, false) and textOk(wallet.address, false);
  };

  func walletKey(chain : Text, address : Text) : Text {
    let normalizedAddress = if (address.startsWith(#text "0x") or address.startsWith(#text "0X")) {
      address.toLower();
    } else { address };
    chain.toLower() # ":" # normalizedAddress;
  };

  func positionFrom(id : Nat, input : Types.PositionInput) : Types.Position {
    {
      id;
      poolId = input.poolId;
      displayName = input.displayName;
      symbol = input.symbol;
      amountUsd = input.amountUsd;
      entryTimestamp = input.entryTimestamp;
      notes = input.notes;
    };
  };

  // ---------- public API ----------

  /// Traps when the caller is anonymous.
  public func requireSignedIn(caller : Principal) {
    if (caller.isAnonymous()) {
      Runtime.trap("Anonymous callers are not allowed. Please sign in.");
    };
  };

  /// Stores the verified email captured at sign-in (no-op when null).
  public func recordVerifiedEmail(emails : Types.EmailsMap, caller : Principal, email : ?Text) {
    if (caller.isAnonymous()) { return };
    switch (email) {
      case (?e) {
        if (e.size() > 0 and e.size() <= 320) { emails.add(caller, e) };
      };
      case null {};
    };
  };

  public func hasVerifiedEmail(emails : Types.EmailsMap, caller : Principal) : Bool {
    requireSignedIn(caller);
    emails.containsKey(caller);
  };

  public func getSettings(settings : Types.SettingsMap, caller : Principal) : Types.Settings {
    requireSignedIn(caller);
    settings.get(caller) ?? defaultSettings;
  };

  public func updateSettings(settings : Types.SettingsMap, caller : Principal, value : Types.Settings) {
    requireSignedIn(caller);
    settings.add(caller, value);
  };

  public func listWatchlist(watchlists : Types.WatchlistMap, caller : Principal) : [Types.WatchlistEntry] {
    requireSignedIn(caller);
    switch (watchlists.get(caller)) {
      case (?m) { m.values().toArray() };
      case null { [] };
    };
  };

  public func addToWatchlist(watchlists : Types.WatchlistMap, caller : Principal, entry : Types.WatchlistEntry) : Result.Result<(), Common.ApiError> {
    requireSignedIn(caller);
    if (not validWatchlistEntry(entry)) { return #err(#invalid("Invalid watchlist entry")) };
    let mine = innerFor(watchlists, caller);
    if (mine.containsKey(entry.poolId)) {
      // Already saved: refresh the stored details.
      mine.add(entry.poolId, entry);
      return #ok(());
    };
    if (mine.size() >= maxWatchlistPerUser) { return #err(#limitReached(maxWatchlistPerUser)) };
    mine.add(entry.poolId, entry);
    #ok(());
  };

  public func removeFromWatchlist(watchlists : Types.WatchlistMap, caller : Principal, poolId : Common.PoolId) : Bool {
    requireSignedIn(caller);
    switch (watchlists.get(caller)) {
      case (?m) {
        let existed = m.containsKey(poolId);
        if (existed) { m.remove(poolId) };
        existed;
      };
      case null { false };
    };
  };

  public func listPositions(positions : Types.PositionsMap, caller : Principal) : [Types.Position] {
    requireSignedIn(caller);
    switch (positions.get(caller)) {
      case (?m) { m.values().toArray() };
      case null { [] };
    };
  };

  public func addPosition(positions : Types.PositionsMap, counters : Types.UserCounters, caller : Principal, input : Types.PositionInput) : Result.Result<Types.Position, Common.ApiError> {
    requireSignedIn(caller);
    if (not validPositionInput(input)) { return #err(#invalid("Invalid position")) };
    let mine = innerFor(positions, caller);
    if (mine.size() >= maxPositionsPerUser) { return #err(#limitReached(maxPositionsPerUser)) };
    let id = counters.nextPositionId;
    counters.nextPositionId := id + 1;
    let position = positionFrom(id, input);
    mine.add(id, position);
    #ok(position);
  };

  public func updatePosition(positions : Types.PositionsMap, caller : Principal, id : Nat, input : Types.PositionInput) : Result.Result<Types.Position, Common.ApiError> {
    requireSignedIn(caller);
    if (not validPositionInput(input)) { return #err(#invalid("Invalid position")) };
    switch (positions.get(caller)) {
      case (?m) {
        if (not m.containsKey(id)) { return #err(#notFound) };
        let position = positionFrom(id, input);
        m.add(id, position);
        #ok(position);
      };
      case null { #err(#notFound) };
    };
  };

  public func removePosition(positions : Types.PositionsMap, caller : Principal, id : Nat) : Bool {
    requireSignedIn(caller);
    switch (positions.get(caller)) {
      case (?m) {
        let existed = m.containsKey(id);
        if (existed) { m.remove(id) };
        existed;
      };
      case null { false };
    };
  };

  public func listWallets(wallets : Types.WalletsMap, caller : Principal) : [Types.TrackedWallet] {
    requireSignedIn(caller);
    switch (wallets.get(caller)) {
      case (?m) { m.values().toArray() };
      case null { [] };
    };
  };

  public func addWallet(wallets : Types.WalletsMap, caller : Principal, wallet : Types.TrackedWallet) : Result.Result<(), Common.ApiError> {
    requireSignedIn(caller);
    if (not validWallet(wallet)) { return #err(#invalid("Invalid wallet")) };
    let mine = innerFor(wallets, caller);
    let key = walletKey(wallet.chain, wallet.address);
    if (mine.containsKey(key)) { return #ok(()) };
    if (mine.size() >= maxWalletsPerUser) { return #err(#limitReached(maxWalletsPerUser)) };
    mine.add(key, wallet);
    #ok(());
  };

  public func removeWallet(wallets : Types.WalletsMap, caller : Principal, chain : Text, address : Text) : Bool {
    requireSignedIn(caller);
    switch (wallets.get(caller)) {
      case (?m) {
        let key = walletKey(chain, address);
        let existed = m.containsKey(key);
        if (existed) { m.remove(key) };
        existed;
      };
      case null { false };
    };
  };

  /// Idempotent merge of a browser batch into the caller's saved data.
  public func importLocalData(
    watchlists : Types.WatchlistMap,
    positions : Types.PositionsMap,
    wallets : Types.WalletsMap,
    counters : Types.UserCounters,
    caller : Principal,
    batch : Types.ImportBatch,
  ) : Types.ImportSummary {
    requireSignedIn(caller);
    var watchlistAdded = 0;
    var positionsAdded = 0;
    var walletsAdded = 0;
    var skipped = 0;

    let myWatchlist = innerFor(watchlists, caller);
    for (entry in batch.watchlist.values()) {
      if (not validWatchlistEntry(entry) or myWatchlist.containsKey(entry.poolId) or myWatchlist.size() >= maxWatchlistPerUser) {
        skipped += 1;
      } else {
        myWatchlist.add(entry.poolId, entry);
        watchlistAdded += 1;
      };
    };

    let myPositions = innerFor(positions, caller);
    for (input in batch.positions.values()) {
      if (not validPositionInput(input) or myPositions.size() >= maxPositionsPerUser) {
        skipped += 1;
      } else {
        let duplicate = myPositions.values().any(func p = p.poolId == input.poolId and p.entryTimestamp == input.entryTimestamp);
        if (duplicate) {
          skipped += 1;
        } else {
          let id = counters.nextPositionId;
          counters.nextPositionId := id + 1;
          myPositions.add(id, positionFrom(id, input));
          positionsAdded += 1;
        };
      };
    };

    let myWallets = innerFor(wallets, caller);
    for (wallet in batch.wallets.values()) {
      let key = walletKey(wallet.chain, wallet.address);
      if (not validWallet(wallet) or myWallets.containsKey(key) or myWallets.size() >= maxWalletsPerUser) {
        skipped += 1;
      } else {
        myWallets.add(key, wallet);
        walletsAdded += 1;
      };
    };

    { watchlistAdded; positionsAdded; walletsAdded; skipped };
  };

  /// Clears every saved item of the caller, including alert rules and history.
  public func deleteAllMyData(
    settings : Types.SettingsMap,
    watchlists : Types.WatchlistMap,
    positions : Types.PositionsMap,
    wallets : Types.WalletsMap,
    rules : AlertTypes.RulesMap,
    history : AlertTypes.HistoryMap,
    caller : Principal,
  ) {
    requireSignedIn(caller);
    settings.remove(caller);
    watchlists.remove(caller);
    positions.remove(caller);
    wallets.remove(caller);
    rules.remove(caller);
    history.remove(caller);
  };
};
