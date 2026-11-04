import Runtime "mo:core/Runtime";
import Ephemeral "mo:caffeineai-inference-client/Ephemeral";

mixin () {
  // Transient: a deploy revokes every minted key.
  transient let inferenceKeys = Ephemeral.Broker(Ephemeral.defaultLimits);

  /// Mints the caller's short-lived inference key. Signed-in callers only.
  public shared ({ caller }) func getInferenceCredentials() : async Ephemeral.Credentials {
    if (caller.isAnonymous()) {
      Runtime.trap("Sign in to use AI features");
    };
    await* inferenceKeys.grant<system>(caller);
  };
};
