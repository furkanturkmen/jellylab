/**
 * What the player hands to its speed picker.
 *
 * Same idea as the season sheet next door: a route is addressed by URL, so
 * live player handles and the callbacks that apply a choice cannot travel as
 * parameters. The player leaves them here on its way to
 * `router.push('/sheet/player')`.
 *
 * Audio and subtitles used to come through here too. They are drawn over the
 * film now (see components/TrackPicker) rather than pushed as a route, because
 * pushing one took the player off screen to answer a question about the film
 * that was playing. Speed stays: it is five rows, it is asked for rarely, and
 * a small card is the right shape for it.
 */
export type PlayerSheetRequest = {
  kind: 'speed';
  current: number;
  rates: number[];
  onPick: (rate: number) => void;
};

let pending: PlayerSheetRequest | null = null;

export function openPlayerSheet(request: PlayerSheetRequest): void {
  pending = request;
}

export function pendingPlayerSheet(): PlayerSheetRequest | null {
  return pending;
}

/** The callbacks close over a mounted player; holding them past the sheet keeps it alive. */
export function clearPlayerSheet(): void {
  pending = null;
}
