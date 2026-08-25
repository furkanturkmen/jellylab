/**
 * Sizes people can read.
 *
 * The profile screen rounds to whole gigabytes, which suits a media drive and
 * says "0 GB" for a 340 MB episode. Downloads are that size, so the unit
 * follows the number: MB below a gigabyte, one decimal below ten gigabytes,
 * whole numbers above.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';

  const mb = bytes / 1024 ** 2;
  if (mb < 1) return '< 1 MB';
  if (mb < 1024) return `${Math.round(mb)} MB`;

  const gb = mb / 1024;
  if (gb < 10) return `${gb.toFixed(1)} GB`;
  if (gb < 1024) return `${Math.round(gb)} GB`;
  return `${(gb / 1024).toFixed(2)} TB`;
}
