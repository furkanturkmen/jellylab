/**
 * How much room downloads may take, and what could be given back.
 *
 * `docs/downloads.md` left this until there was real use to measure, and the
 * measurement is now in: films on this server run to a median of 2.25GB and a
 * 90th percentile of 6.05GB, episodes to 0.32GB and 2.51GB, so a
 * twelve-episode season is about 3.9GB. Twenty gigabytes therefore holds
 * roughly eight films or five seasons, and still holds three films at the
 * ninety-ninth-percentile end. It is a preference rather than a constant
 * because the right number belongs to the phone, not to the app.
 *
 * Nothing here deletes anything. The same document says what this feature is:
 * "You pick a thing, it is stored, you delete it" - so the app's job at the
 * cap is to say what is in the way and offer to clear it, not to decide. A
 * download made deliberately the night before a flight is exactly the file an
 * automatic policy would throw away first, because nobody has watched it yet.
 */

/** Bytes in a gigabyte, as the tab and the settings screen both mean it. */
export const GB = 1024 ** 3;

/** Twenty gigabytes: eight films or five seasons at this library's medians. */
export const DEFAULT_CAP_GB = 20;

/**
 * Watched enough to be finished with.
 *
 * Jellyfin stops counting a title as in-progress near the end rather than at
 * the very last tick, because credits, and a file abandoned at 99% is not one
 * anybody intends to return to. The same threshold is used here so "watched"
 * means on the phone what it means on the server.
 */
export const WATCHED_FRACTION = 0.9;

export function isWatched(positionTicks?: number, runtimeTicks?: number): boolean {
  if (!runtimeTicks || runtimeTicks <= 0) return false;
  if (!positionTicks || positionTicks <= 0) return false;
  return positionTicks / runtimeTicks >= WATCHED_FRACTION;
}

/** One stored download, reduced to what the cap arithmetic needs. */
export type Stored = {
  itemId: string;
  title: string;
  bytes: number;
  watched: boolean;
  /** when the download finished; absent sorts oldest, having no better claim */
  completedAt?: number;
};

export type CapVerdict = {
  /** true when the new download fits without anything being removed */
  fits: boolean;
  used: number;
  cap: number;
  needed: number;
  /** the watched items, oldest first - exactly what "remove watched" removes */
  reclaimable: Stored[];
  reclaimableBytes: number;
  /**
   * true when removing every watched item still would not make room.
   *
   * Worth separating from a plain "does not fit": offering to free 6GB for a
   * download needing 12 is a button that cannot work, and saying so is the
   * more useful answer.
   */
  hopeless: boolean;
};

/**
 * Whether one more download fits, and what could be freed if not.
 *
 * `needed` is the size the server reported. A server that reported nothing
 * gives 0 or a negative, which is treated as "unknown" and allowed through:
 * refusing a download because its size could not be read would block the
 * feature on a missing Content-Length.
 */
export function checkCap(stored: Stored[], needed: number, capGb: number): CapVerdict {
  const cap = Math.max(0, capGb) * GB;
  const used = stored.reduce((sum, s) => sum + Math.max(0, s.bytes), 0);
  const want = needed > 0 ? needed : 0;

  const reclaimable = stored
    .filter(s => s.watched)
    // Oldest first: of two watched files, the one finished longer ago is the
    // one less likely to be wanted again.
    .sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0));
  const reclaimableBytes = reclaimable.reduce((sum, s) => sum + Math.max(0, s.bytes), 0);

  const fits = used + want <= cap;
  return {
    fits,
    used,
    cap,
    needed: want,
    reclaimable,
    reclaimableBytes,
    hopeless: !fits && used - reclaimableBytes + want > cap,
  };
}

/**
 * The watched items to remove, oldest first, to fit `needed`.
 *
 * Stops as soon as there is room. Removing every watched file when one would
 * do is the automatic behaviour this feature deliberately avoids - the person
 * asked for room for one thing, not for a clear-out.
 */
export function toEvict(verdict: CapVerdict): Stored[] {
  if (verdict.fits) return [];
  const out: Stored[] = [];
  let used = verdict.used;
  for (const s of verdict.reclaimable) {
    if (used + verdict.needed <= verdict.cap) break;
    out.push(s);
    used -= Math.max(0, s.bytes);
  }
  return out;
}
