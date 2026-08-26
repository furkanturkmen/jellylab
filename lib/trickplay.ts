/**
 * Where a given moment lives inside a trickplay sprite sheet.
 *
 * Jellyfin does not serve one image per thumbnail - it bakes them into tiled
 * sheets, `TileWidth` across by `TileHeight` down, and serves the sheets by
 * index. So a preview for time t is a crop out of a sheet, and finding it is
 * two divisions that are very easy to get wrong by one and impossible to spot
 * on a phone: an off-by-one reads as "the preview lags slightly", which looks
 * like a slow network rather than a bug. Hence a pure module with tests.
 */

export type TrickplayInfo = {
  /** One thumbnail, in pixels. */
  width: number;
  height: number;
  /** Thumbnails per sheet, across and down. */
  tileWidth: number;
  tileHeight: number;
  /** How many thumbnails exist in total. */
  thumbnailCount: number;
  /** Milliseconds of video between thumbnails. */
  interval: number;
};

export type TrickplayTile = {
  /** Which sheet to request. */
  tileIndex: number;
  /** Column and row of the thumbnail within that sheet. */
  x: number;
  y: number;
};

/**
 * The tile and cell holding the thumbnail for `seconds`.
 *
 * Returns null when the item has no usable trickplay - a zero interval or an
 * empty sheet would otherwise divide by zero and paint a corner of nothing.
 * Times past the end clamp to the last thumbnail rather than returning null,
 * because a scrub to the very end should still show the final frame.
 */
export function trickplayTileAt(seconds: number, info: TrickplayInfo): TrickplayTile | null {
  const perTile = info.tileWidth * info.tileHeight;
  if (info.interval <= 0 || info.thumbnailCount <= 0 || perTile <= 0) return null;

  const wanted = Math.floor((Math.max(0, seconds) * 1000) / info.interval);
  const index = Math.min(wanted, info.thumbnailCount - 1);

  const within = index % perTile;
  return {
    tileIndex: Math.floor(index / perTile),
    x: within % info.tileWidth,
    y: Math.floor(within / info.tileWidth),
  };
}

/**
 * The widest trickplay the server has that is still no wider than `maxWidth`.
 *
 * A library can hold several resolutions; ours is generated at 320 only. The
 * keys are widths as strings because they arrive as JSON object keys. If every
 * resolution is larger than asked for, the narrowest is returned rather than
 * nothing - a too-large preview scales down fine, no preview does not.
 */
export function pickTrickplay(
  resolutions: Record<string, TrickplayInfo> | null | undefined,
  maxWidth = 320,
): TrickplayInfo | null {
  const all = Object.values(resolutions ?? {}).filter(r => r && r.width > 0);
  if (all.length === 0) return null;

  const fitting = all.filter(r => r.width <= maxWidth);
  if (fitting.length > 0) return fitting.reduce((a, b) => (a.width >= b.width ? a : b));
  return all.reduce((a, b) => (a.width <= b.width ? a : b));
}
