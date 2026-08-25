import type { SeerrSeason } from '@/api/jellyseerr';

/**
 * What a sheet route was opened with.
 *
 * The sheets are routes now, so the screen that opens one cannot hand it
 * props - a route takes URL parameters, and those are strings. A list of
 * seasons and the function that files the request are neither, so the screen
 * leaves them here on its way to `router.push` and the sheet collects them on
 * mount. The same shape it used to receive as props, one indirection later.
 *
 * Deliberately not a hook and not state: nothing re-renders when this changes,
 * because the only reader mounts after the only writer has finished.
 */
export type SeasonSheetRequest = {
  /** Every season, including the ones that cannot be requested - they are shown greyed out. */
  seasons: SeerrSeason[];
  /** Season numbers ticked when the sheet opens. */
  initial: number[];
  /** Called with what was ticked, in ascending order. The sheet closes itself first. */
  onConfirm: (seasons: number[]) => void;
};

let pending: SeasonSheetRequest | null = null;

export function openSeasonSheet(request: SeasonSheetRequest): void {
  pending = request;
}

export function pendingSeasonSheet(): SeasonSheetRequest | null {
  return pending;
}

/**
 * Called by the sheet once it has what it needs. Holding the callback after
 * that would keep the screen that made it alive for as long as the app runs.
 */
export function clearSeasonSheet(): void {
  pending = null;
}
