/**
 * What the player hands to its pickers.
 *
 * Same idea as the season sheet next door: the pickers are routes now, and a
 * route is addressed by URL, so track lists, live player handles and the
 * callbacks that apply a choice cannot travel as parameters. The player leaves
 * them here on its way to `router.push('/sheet/player')`.
 *
 * One entry rather than one per picker: only one sheet can be open at a time,
 * and `kind` is what the sheet switches on.
 */
export type PlayerSheetRequest =
  | {
      kind: 'vlcSubtitles';
      externalSubs: { index: number; label: string }[];
      internalTracks: { id: number; name?: string }[];
      activeExternalIndex: number | null;
      activeInternalId: number;
      subDelayMs: number;
      delayEnabled: boolean;
      onDelayChange: (ms: number) => void;
      onPickExternal: (index: number) => void;
      onPickInternal: (id: number) => void;
      onOff: () => void;
    }
  | {
      kind: 'vlcAudio';
      tracks: { id: number; label: string }[];
      activeId: number;
      /** How many tracks Jellyfin said the file has - more than VLC sees means transcoding. */
      declaredCount: number;
      onPick: (id: number) => void;
    }
  | {
      kind: 'tracks';
      /** The live expo-video player: its track lists are read off it directly. */
      player: any;
      externalSubs: { index: number; label: string }[];
      activeExternalSubIndex: number | null;
      onPickExternal: (index: number | null) => void;
      /**
       * What the title was made in.
       *
       * On direct play the list comes from AVPlayer, which reports what the
       * file says - and a file that says nothing gives a row reading "Track
       * 1". The servers know better; see lib/tracks.
       */
      originalLanguage?: string;
      /**
       * The server's audio tracks, when the server is the one deciding.
       *
       * A transcode carries a single audio track, so AVPlayer has nothing to
       * switch between - the choice has to go back to the server as a new
       * stream. Absent on direct play, where the player's own list is real.
       */
      serverAudio?: {
        tracks: { index: number; label: string; language?: string }[];
        activeIndex: number | null;
        onPick: (streamIndex: number) => void;
      };
    }
  | {
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
