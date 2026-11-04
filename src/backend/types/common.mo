module {
  /// Nanoseconds since the Unix epoch, as returned by Time.now().
  public type Timestamp = Int;

  /// Public DefiLlama pool identifier (the {poolId} in yields.llama.fi/chart/{poolId}).
  public type PoolId = Text;

  /// Caller-fixable failures. Anonymous callers are rejected with a trap.
  public type ApiError = {
    #notFound;
    #invalid : Text;
    #limitReached : Nat;
  };
};
