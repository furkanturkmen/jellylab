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
