/**
 * Talks to jellylab-push on the homelab.
 *
 * Deliberately separate from the Jellyfin and Seerr clients: it is a different
 * service on a different port, and it stays usable when those two are
 * unreachable.
 *
 * It used to also register this device for native push. That is gone -
 * `aps-environment` is only issued to a paid Apple Developer account and this
 * build strips it (see plugins/withoutPushEntitlement.js), so notifications
 * are delivered by the ntfy app instead. What remains is the one thing the
 * service answers that Jellyfin cannot.
 */

function base(url: string): string {
  return url.replace(/\/+$/, '');
}

/** The port jellylab-push listens on, alongside Jellyfin on the same host. */
const PUSH_PORT = 8099;

/**
 * Where to find jellylab-push, without anyone having to say.
 *
 * It runs on the same machine as Jellyfin and publishes its own port, so the
 * address is the Jellyfin one with the port swapped - true whether that is an
 * IP on the LAN, a NetBird address, or a hostname, since the hostname resolves
 * to the same host either way.
 *
 * There is a `pushUrl` preference and it still wins, for the case where the
 * service lives somewhere else. But it had no way of being set: nothing in the
 * app ever wrote it, so it stayed empty and every feature behind it - the
 * storage readout included - quietly did nothing. Deriving it means the
 * default case needs no configuring at all.
 */
export function resolveUrl(configured: string, jellyfinUrl: string): string {
  if (configured.trim()) return base(configured.trim());
  if (!jellyfinUrl.trim()) return '';
  try {
    const u = new URL(jellyfinUrl);
    u.port = String(PUSH_PORT);
    u.pathname = '';
    return base(u.toString());
  } catch {
    return '';
  }
}

export async function health(url: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${base(url)}/health`);
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  return res.json();
}

export type StorageInfo = {
  /** bytes */
  total: number;
  free: number;
  used: number;
  /** the path measured, as the server sees it */
  path: string;
};

/**
 * Free space on the drive holding the library.
 *
 * Served by jellylab-push rather than Jellyfin, because Jellyfin has no API
 * for it - it reports what is in the library, never what is left to put there.
 * That service already runs on the host with the media mount visible, so one
 * statfs there answers it.
 */
export async function storage(url: string): Promise<StorageInfo> {
  const res = await fetch(`${base(url)}/storage`);
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  return res.json();
}

/** One title being fetched, as the *arr queues describe it. */
export type DownloadProgress = {
  /** bytes */
  size: number;
  sizeLeft: number;
  /** 0..1, or null when the client has not reported a size yet */
  percent: number | null;
  /** Sonarr's tracked state: downloading, importBlocked, and so on */
  status: string | null;
  /** Sonarr knows this; a percentage cannot say it */
  stalled: boolean;
  title: string | null;
  /** when it was added to the queue, ISO */
  added?: string | null;
  /** Sonarr's own ETA, "HH:MM:SS" */
  timeLeft?: string | null;
  indexer?: string | null;
  client?: string | null;
};

/** A film Radarr is deliberately not searching for yet. */
export type Unreleased = {
  /** announced | inCinemas | released | deleted */
  status: string | null;
  inCinemas: string | null;
  digitalRelease: string | null;
  physicalRelease: string | null;
};

export type Downloads = {
  /** keyed by TMDB id, which is what Jellyseerr keys a request on */
  tv: Record<string, DownloadProgress>;
  movies: Record<string, DownloadProgress>;
  /**
   * Films that have not reached their minimum availability.
   *
   * Radarr will not search for these and is right not to - a film still in
   * cinemas has nothing to find. Without this the app says it is looking for
   * something nothing is looking for.
   */
  unreleased?: Record<string, Unreleased>;
  /** named failures, when one of the two services could not be read */
  errors?: Record<string, string>;
};

/**
 * What is actually downloading.
 *
 * Jellyseerr reports this too, and gets it wrong: it asks Sonarr for its queue
 * without raising the page size, so it sees the first twenty rows. Sonarr
 * queues one row per *episode*, so a 23-episode season pack fills that page by
 * itself and everything behind it looks idle - including whichever download is
 * actually moving, while a stalled one sits at the top holding the bar.
 *
 * jellylab-push pages through the whole queue instead. The API keys stay on
 * the server: this app asks a service rather than holding a credential that
 * could rewrite the library.
 */
export async function downloads(url: string): Promise<Downloads> {
  const res = await fetch(`${base(url)}/downloads`);
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  return res.json();
}
