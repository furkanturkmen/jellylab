import Constants from 'expo-constants';

import { ensureServersLoaded, getCurrentServerSync } from '@/store/servers';

/**
 * The version is read, not written.
 *
 * It used to be a third copy of the string in app.json and package.json, kept
 * in sync by hand and therefore not: the app told Jellyfin it was 1.0.0 for two
 * hundred commits, and every install showed up identically in the server's
 * device list. app.json is the source now.
 */
const VERSION = Constants.expoConfig?.version ?? '0.0.0';
const BUILD = Constants.expoConfig?.ios?.buildNumber ?? '';

export const APP_VERSION = VERSION;
/** "0.10.0 (1)" - what to show a person, and what to quote in a bug report. */
export const APP_BUILD_LABEL = BUILD ? `${VERSION} (${BUILD})` : VERSION;

export const CONFIG = {
  CLIENT_NAME: 'jellylab',
  // Sent in X-Emby-Authorization, so this is the string Jellyfin lists under
  // Devices. Worth being true.
  CLIENT_VERSION: VERSION,
  DEVICE_NAME: 'iPhone',
};

export function getJellyfinUrl(): string {
  const s = getCurrentServerSync();
  return s?.jellyfinUrl ?? '';
}

export function getJellyseerrUrl(): string {
  const s = getCurrentServerSync();
  return s?.jellyseerrUrl ?? '';
}

/**
 * Await these when building a request, rather than reading the sync getters.
 * They wait for the store to hydrate, and say so plainly when no server is
 * configured instead of letting axios fail against an empty baseURL.
 *
 * The sync getters stay for URL builders like imageUrl and streamUrl, which
 * only run once data has already loaded.
 */
export async function requireJellyfinUrl(): Promise<string> {
  await ensureServersLoaded();
  const url = getCurrentServerSync()?.jellyfinUrl;
  if (!url) throw new Error('No Jellyfin server configured');
  return url;
}

export async function requireJellyseerrUrl(): Promise<string> {
  await ensureServersLoaded();
  const url = getCurrentServerSync()?.jellyseerrUrl;
  if (!url) throw new Error('No Jellyseerr server configured');
  return url;
}
