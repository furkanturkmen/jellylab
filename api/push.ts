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
};

export type Downloads = {
  /** keyed by TMDB id, which is what Jellyseerr keys a request on */
  tv: Record<string, DownloadProgress>;
  movies: Record<string, DownloadProgress>;
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
