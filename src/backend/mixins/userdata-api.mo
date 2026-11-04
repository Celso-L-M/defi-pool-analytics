import Result "mo:core/Result";
import Common "../types/common";
import Types "../types/userdata";
import AlertTypes "../types/alerts";
import UserDataLib "../lib/userdata";

mixin (
  settings : Types.SettingsMap,
  watchlists : Types.WatchlistMap,
  positions : Types.PositionsMap,
  wallets : Types.WalletsMap,
  emails : Types.EmailsMap,
  rules : AlertTypes.RulesMap,
  history : AlertTypes.HistoryMap,
  counters : Types.UserCounters,
) {
  public query ({ caller }) func hasVerifiedEmail() : async Bool {
    UserDataLib.hasVerifiedEmail(emails, caller);
  };

  public query ({ caller }) func getSettings() : async Types.Settings {
    UserDataLib.getSettings(settings, caller);
  };

  public shared ({ caller }) func updateSettings(value : Types.Settings) : async () {
    UserDataLib.updateSettings(settings, caller, value);
  };

  public query ({ caller }) func listWatchlist() : async [Types.WatchlistEntry] {
    UserDataLib.listWatchlist(watchlists, caller);
  };

  public shared ({ caller }) func addToWatchlist(entry : Types.WatchlistEntry) : async Result.Result<(), Common.ApiError> {
    UserDataLib.addToWatchlist(watchlists, caller, entry);
  };

  public shared ({ caller }) func removeFromWatchlist(poolId : Common.PoolId) : async Bool {
    UserDataLib.removeFromWatchlist(watchlists, caller, poolId);
  };

  public query ({ caller }) func listPositions() : async [Types.Position] {
    UserDataLib.listPositions(positions, caller);
  };

  public shared ({ caller }) func addPosition(input : Types.PositionInput) : async Result.Result<Types.Position, Common.ApiError> {
    UserDataLib.addPosition(positions, counters, caller, input);
  };

  public shared ({ caller }) func updatePosition(id : Nat, input : Types.PositionInput) : async Result.Result<Types.Position, Common.ApiError> {
    UserDataLib.updatePosition(positions, caller, id, input);
  };

  public shared ({ caller }) func removePosition(id : Nat) : async Bool {
    UserDataLib.removePosition(positions, caller, id);
  };

  public query ({ caller }) func listWallets() : async [Types.TrackedWallet] {
    UserDataLib.listWallets(wallets, caller);
  };

  public shared ({ caller }) func addWallet(wallet : Types.TrackedWallet) : async Result.Result<(), Common.ApiError> {
    UserDataLib.addWallet(wallets, caller, wallet);
  };

  public shared ({ caller }) func removeWallet(chain : Text, address : Text) : async Bool {
    UserDataLib.removeWallet(wallets, caller, chain, address);
  };

  public shared ({ caller }) func importLocalData(batch : Types.ImportBatch) : async Types.ImportSummary {
    UserDataLib.importLocalData(watchlists, positions, wallets, counters, caller, batch);
  };

  public shared ({ caller }) func deleteAllMyData() : async () {
    UserDataLib.deleteAllMyData(settings, watchlists, positions, wallets, rules, history, caller);
  };
};
