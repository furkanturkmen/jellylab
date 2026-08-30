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

/**
 * How long until it is done, in words rather than a clock face.
 *
 * qBittorrent's own estimate, which is live where Sonarr's is a minute stale.
 * Coarse on purpose: at three hours out, minutes are noise, and a figure that
 * changes every second reads as instability rather than precision.
 *
 * Returns nothing when it cannot know. qBittorrent uses 8640000 - a hundred
 * days - as its "no idea" value, which a stalled torrent reports constantly,
 * and "100d left" is worse than saying nothing at all.
 */
export function formatEta(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null;
  // A week is beyond useful, and well short of the sentinel.
  if (seconds >= 604_800) return null;

  if (seconds < 60) return `${Math.round(seconds)}s`;

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours < 24) return restMinutes ? `${hours}h ${restMinutes}m` : `${hours}h`;

  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days}d ${restHours}h` : `${days}d`;
}
