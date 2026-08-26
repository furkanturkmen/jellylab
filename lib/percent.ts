/**
 * A percentage that does not claim to be finished before it is.
 *
 * Rounding is the problem: 99.7% rounds to 100%, so a download with megabytes
 * still to come reads as done, and then sits there "at 100%" for another
 * minute. qBittorrent shows decimals near the end for this reason, and this
 * does the same.
 *
 * Whole numbers for most of the way - nobody needs 43.2% - and one decimal
 * once it is close enough that the difference is the whole story.
 */
export function formatPercent(fraction: number | null | undefined): string {
  if (fraction == null || !Number.isFinite(fraction)) return '';

  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  if (pct >= 100) return '100%';

  // Anything above 99 gets a decimal, and it is floored, so 99.97 shows as
  // 99.9 rather than becoming 100 while bytes are outstanding.
  if (pct > 99) return `${(Math.floor(pct * 10) / 10).toFixed(1)}%`;

  return `${Math.floor(pct)}%`;
}
