import { ensureServersLoaded, getCurrentServerSync } from '@/store/servers';

export const CONFIG = {
  CLIENT_NAME: 'jellylab',
  CLIENT_VERSION: '1.0.0',
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
