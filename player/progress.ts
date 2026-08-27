/**
 * Where a title should start, and how far through it is.
 *
 * Jellyfin counts in ticks - ten million to the second - and the app counts in
 * seconds, so every one of these is a conversion with a fallback attached. The
 * conversions lived inline at each call site, which is how two of them came to
 * disagree about what an absent resume point means.
 */

/** Jellyfin's tick, ten-millionths of a second. */
const TICKS_PER_SECOND = 10_000_000;

export function ticksToSeconds(ticks: number | undefined | null): number {
  if (!ticks || !isFinite(ticks) || ticks < 0) return 0;
  return ticks / TICKS_PER_SECOND;
}

export function secondsToTicks(seconds: number | undefined | null): number {
  if (!seconds || !isFinite(seconds) || seconds < 0) return 0;
  return Math.round(seconds * TICKS_PER_SECOND);
}

/**
 * Where playback should begin.
 *
 * `startAt` is the app's own answer and wins when it has one: it is set when a
 * transcode is restarted at the position the last stream reached, and the
 * server's saved point is stale by then. Otherwise it is whatever Jellyfin
 * last recorded for this user.
 *
 * Zero is the honest answer for "no idea", and it means the beginning. The
 * distinction that matters is between `startAt` being absent and being 0 - a
 * film restarted deliberately from the top has a startAt of 0, and falling
 * through to the server's position there would undo the restart.
 */
export function resumeSecondsFor(
  startAt: number | undefined | null,
  positionTicks: number | undefined | null,
): number {
  if (startAt != null && isFinite(startAt)) return Math.max(0, startAt);
  return ticksToSeconds(positionTicks);
}
