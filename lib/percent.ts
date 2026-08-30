/**
 * A percentage that does not claim to be finished before it is.
 *
 * Rounding is the problem: 99.7% rounds to 100%, so a download with megabytes
 * still to come reads as done, and then sits there "at 100%" for another
 * minute. qBittorrent shows decimals near the end for this reason, and this
 * does the same.
 *
 * One decimal throughout, and floored rather than rounded. Whole numbers hid a
 * tenth of a percent, which on a 30GB season is 30MB - enough to make a bar
 * that is visibly moving look frozen for tens of seconds.
 */
export function formatPercent(fraction: number | null | undefined): string {
  if (fraction == null || !Number.isFinite(fraction)) return '';

  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  if (pct >= 100) return '100%';

  // Always floored, never rounded: 99.97 shows as 99.9 rather than becoming
  // 100% while bytes are still outstanding, and 43.7 does not become 44.
  //
  // One decimal throughout. Whole numbers hid a tenth of a percent, which on a
  // 30GB season is 30MB - and made a bar that was visibly moving look frozen
  // for tens of seconds at a time.
  return `${(Math.floor(pct * 10) / 10).toFixed(1)}%`;
}
