/**
 * Expo app config — extends app.json with runtime environment variables.
 *
 * The Paystack public key (pk_test_… or pk_live_…) is safe to embed in
 * the client bundle — it is NOT a secret. Only the secret key lives on
 * the backend.
 *
 * Usage in code:
 *   import Constants from "expo-constants";
 *   const pk = Constants.expoConfig?.extra?.paystackPublicKey ?? "";
 */

module.exports = ({ config }) => ({
  ...config,
  android: {
    ...(config.android ?? {}),
    package: process.env.EXPO_PUBLIC_ANDROID_PACKAGE ?? "com.didaskey.app",
  },
  extra: {
    /**
     * Set EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY in your .env or shell before
     * running `expo start`.  Falls back to an empty string so the app
     * boots without crashing — payments will simply not work until the
     * key is provided.
     */
    paystackPublicKey: process.env.EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY ?? "",
    expoProjectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? "ae5dc747-e356-4bc0-b4e7-98e51df1e2dd",
    eas: {
      ...(config.extra?.eas ?? {}),
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? "ae5dc747-e356-4bc0-b4e7-98e51df1e2dd",
    },
  },
});
