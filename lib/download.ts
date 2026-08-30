/**
 * The numbers behind a download, worked out rather than asked for.
 *
 * qBittorrent knows the live speed and the seed count. Reading it would mean
 * putting its password somewhere else or opening its web UI to every container
 * on the docker network - and average speed, which is the more useful figure,
 * falls out of what Sonarr already reports. A torrent averaging 2MB/s over ten
 * hours is a different situation from one that briefly touched twenty.
 */

/** Bytes per second since it started, or null when that cannot be known. */
export function averageSpeed(
  size: number | undefined,
  sizeLeft: number | undefined,
  added: string | null | undefined,
  now: number = Date.now(),
): number | null {
  if (!size || sizeLeft == null || !added) return null;
  const started = Date.parse(added);
  if (Number.isNaN(started)) return null;

  const done = size - sizeLeft;
  const seconds = (now - started) / 1000;
  // A clock that disagrees with the server, or a torrent added this instant:
  // dividing by a second or less turns rounding into a headline figure.
  if (done <= 0 || seconds < 1) return null;
  return done / seconds;
}

/**
 * "2h ago", "3d ago" - how long it has been running.
 *
 * Coarse on purpose. The question a person asks is whether this started
 * recently or has been grinding for days, and minutes-and-seconds buries that.
 */
export function elapsedSince(added: string | null | undefined, now: number = Date.now()): string | null {
  if (!added) return null;
  const started = Date.parse(added);
  if (Number.isNaN(started)) return null;
  const mins = Math.floor((now - started) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
