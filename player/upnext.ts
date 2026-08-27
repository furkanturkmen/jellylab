/**
 * Which episode follows the one that just ended.
 *
 * The choice is a pure one - a list and a position in it - but it lived inside
 * the request that fetches the list, so the only way to exercise it was to
 * play an episode to the end and watch what the card offered. The bug that
 * cost the most was of exactly this shape: two handovers in a row offering the
 * *third* episode, because the second lookup was still asking from the one the
 * route was opened with rather than the one actually playing.
 */

/** The pieces of a Jellyfin item this needs; anything else is the caller's. */
type Episode = { Id: string };

/**
 * The episode after `episodeId`, or null when there is none.
 *
 * Null covers three different endings, and they are deliberately the same
 * answer: the list is empty, the episode is not in it, or it is the last one.
 * All three mean "nothing to hand over to", and the card is not shown.
 *
 * The episode is found by identity rather than trusted to be at a known index.
 * Jellyfin's `adjacentTo` returns the neighbours *around* an episode, so the
 * one asked for is usually in the middle - but a first or last episode has no
 * neighbour on one side, and the list shifts under a fixed index.
 */
export function episodeAfter<T extends Episode>(items: T[], episodeId: string): T | null {
  if (!episodeId) return null;
  const at = items.findIndex(i => i?.Id === episodeId);
  if (at < 0) return null;
  return items[at + 1] ?? null;
}
