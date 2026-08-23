const { withEntitlementsPlist } = require('@expo/config-plugins');

/**
 * Strips `aps-environment` from the iOS entitlements.
 *
 * Apple only issues that entitlement to a paid Developer Program account. On a
 * free personal team xcodebuild refuses outright:
 *
 *   Personal development teams do not support the Push Notifications capability
 *   Entitlements file defines "aps-environment" which is not registered
 *
 * Removing `expo-notifications` from app.json's plugins is not enough — the
 * package applies its own config plugin automatically whenever it is
 * installed, so the entitlement reappears on every prebuild. Uninstalling the
 * package is not an option either: Metro resolves `require('expo-notifications')`
 * statically, so the bundle would fail to build.
 *
 * So the package stays, the module keeps autolinking, and this runs last to
 * take the entitlement back out. Push registration then fails at runtime with a
 * clear message instead of blocking the build, and everything else in the app
 * works.
 *
 * TO ENABLE PUSH: join the Apple Developer Program, then delete this plugin
 * from app.json and run `npx expo prebuild --clean`. Nothing else changes —
 * the app code and the jellylab-push service are already done.
 */
module.exports = function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, cfg => {
    delete cfg.modResults['aps-environment'];
    return cfg;
  });
};
