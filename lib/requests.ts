import type { DownloadProgress, Downloads, OnDisk } from '@/api/push';
import { sweptOutcome } from './candidates';
import type { JellyseerrRequest } from '@/types';

/** Jellyseerr's own numbers, named. */
export const REQUEST_PENDING = 1;
export const REQUEST_APPROVED = 2;
export const REQUEST_DECLINED = 3;
export const REQUEST_FAILED = 4;

export const MEDIA_PROCESSING = 3;
export const MEDIA_PARTIAL = 4;
export const MEDIA_AVAILABLE = 5;

/**
 * Is everything this request asked for already imported?
 *
 * Asked only of requests Jellyseerr still calls "Processing", to tell the two
 * halves of that word apart: still looking, or found and waiting on a library
 * scan. Sonarr had No Game No Life complete at 00:09 and Jellyseerr said
 * Processing until 00:15, during which the card claimed to be looking for it.
 *
 * All or nothing on purpose. A part-finished season is not "finishing up", and
 * Jellyseerr reports that case as Partial anyway - handled well before this.
 */
export function onDiskComplete(
  disk: OnDisk | undefined,
  seasons?: { seasonNumber: number }[],
): boolean {
  if (!disk) return false;
  // A film has no seasons to count: Radarr either holds the file or does not.
  if (disk.file) return true;
  const present = disk.seasons;
  if (!present) return false;

  /*
   * The seasons this request covers, not the ones the series has. A request
   * for series two says nothing about series three, and Sonarr will report a
   * season nobody asked for as having no files at all.
   */
  const wanted = (seasons ?? []).map(x => String(x.seasonNumber));
  const keys = wanted.length > 0 ? wanted : Object.keys(present);
  if (keys.length === 0) return false;

  return keys.every(k => {
    const season = present[k];
    // A requested season Sonarr has never heard of is not on disk.
    if (!season || season.episodes <= 0) return false;
    return season.files >= season.episodes;
  });
}

/**
 * After this long with nothing downloading, "waiting for a match" stops being
 * a description and starts being a euphemism. Three days is long enough that a
 * popular title has certainly been grabbed, and short enough to be useful.
 */
/**
 * Whether deleting a request also has to pull the title out of Radarr/Sonarr.
 *
 * Jellyseerr's DELETE /request only forgets the request. The *arr never hears
 * about it, finishes the download and imports it - so the title lands in the
 * library with nothing anywhere explaining why it was fetched. Deleting a
 * request that has not arrived yet therefore has to remove it downstream too,
 * or it cancels nothing at all.
 *
 * Not once something is available. A series can carry a pending season request
 * next to seasons already on disk, and removing downstream there deletes those
 * files. Forgetting the request is then the whole of what was asked for.
 */
export function deleteCancelsDownload(status?: number): boolean {
  return status !== MEDIA_AVAILABLE && status !== MEDIA_PARTIAL;
}

export const STALLED_AFTER_DAYS = 3;

export type RequestProgress =
  | { state: 'downloading'; percent: number | null; stalled?: boolean; status?: string | null }
  | { state: 'waiting'; days: number; stalled: boolean }
  | { state: 'other' };

/**
 * The download jellylab-push knows about for this request, if any.
 *
 * Matched on TMDB id, which both sides key on. Movies and series are kept in
 * separate maps because the two id spaces overlap - TMDB 1399 is a film and
 * also a series, and they are not the same thing.
 */
function fromPush(request: JellyseerrRequest, push?: Downloads | null): DownloadProgress | null {
  if (!push) return null;
  const table = request.media.mediaType === 'movie' ? push.movies : push.tv;
  return table?.[String(request.media.tmdbId)] ?? null;
}

/**
 * What is actually happening to a request.
 *
 * The Requests tab showed "Processing" from the minute a request was approved
 * until the file arrived, whether the server was downloading at 40 MB/s or had
 * found nothing at all - and those look identical to anyone waiting. Jellyseerr
 * knows the difference: an empty `downloadStatus` means Radarr or Sonarr has
 * nothing queued, and `createdAt` says how long that has been true.
 */
export function requestProgress(
  request: JellyseerrRequest,
  now: number = Date.now(),
  /**
   * jellylab-push's view of the *arr queues, when it could be reached.
   *
   * Preferred over Jellyseerr's because it reads the whole queue rather than
   * the first page of it. Absent - the service is down, or its URL was never
   * configured - and everything falls back to what Jellyseerr says, which is
   * right more often than not and was the only source before this existed.
   */
  push?: Downloads | null,
): RequestProgress {
  const media = request.media;

  const live = fromPush(request, push);
  if (live) {
    return {
      state: 'downloading',
      percent: live.percent,
      stalled: live.stalled,
      status: live.status,
    };
  }

  const queue = media.downloadStatus ?? [];

  if (queue.length > 0) {
    const size = queue.reduce((sum, d) => sum + (d.size ?? 0), 0);
    const left = queue.reduce((sum, d) => sum + (d.sizeLeft ?? 0), 0);
    // No size means the client has not started reporting; a bar would be a
    // guess, so there is none.
    const percent = size > 0 ? Math.max(0, Math.min(1, (size - left) / size)) : null;
    return { state: 'downloading', percent };
  }

  if (media.status === MEDIA_PROCESSING) {
    const started = Date.parse(request.createdAt);
    const days = Number.isNaN(started) ? 0 : Math.floor((now - started) / 86_400_000);
    return { state: 'waiting', days, stalled: days >= STALLED_AFTER_DAYS };
  }

  return { state: 'other' };
}

/**
 * The one thing worth saying about a request.
 *
 * The card used to show two pills - the request's state and the media's - and
 * deduplicate them. That mostly meant "Approved · Processing", which says
 * almost nothing: approval is automatic for the owner and near-automatic for
 * everyone else, so the word was on nearly every card and carried no
 * information. Worse, "Processing" covered everything from "no release exists"
 * to "downloading at 40MB/s" to "downloaded, but Sonarr will not import it".
 *
 * One state instead, and the most specific one that is true. Ordered by what a
 * person actually wants to know: something that needs them first, then what is
 * happening now, then what has settled.
 */
export type RequestState =
  /** Waiting for someone to approve it. The only state that needs a person. */
  | { kind: 'pending' }
  | { kind: 'declined' }
  | { kind: 'failed' }
  /** Downloading, and moving. */
  | { kind: 'downloading'; percent: number | null }
  /** Downloading, and not moving - which a percentage alone cannot say. */
  | { kind: 'stalled'; percent: number | null }
  /** Fetched in full, but not yet in the library. Usually Sonarr refusing an import. */
  | { kind: 'importing' }
  /**
   * Not out yet, so nothing is looking - and nothing should be.
   *
   * Distinct from 'searching' on purpose: one is the world not having released
   * the thing, the other is a search that may be going wrong. They looked
   * identical, and only one of them is worth worrying about.
   */
  | { kind: 'unreleased'; status: string | null; date: string | null }
  /** A season still being broadcast. `next` is when the following episode is due. */
  | { kind: 'airing'; aired: number; total: number; next: string }
  /** Approved, nothing found yet. `days` is how long that has been true. */
  | { kind: 'searching'; days: number; overdue: boolean }
  /**
   * Some episodes are in the library.
   *
   * `airing` rides along when the season is still being broadcast, because
   * both are true at once and only one of them is a pill: Reacher season four
   * has five of eight aired, all five watchable, and the next due on 2 Sep.
   * "Airing 5/8" never said you could watch anything.
   */
  | { kind: 'partial'; airing?: { aired: number; total: number; next: string } }
  | { kind: 'available' }
  | { kind: 'other' };

/**
 * What is actually going on with a request.
 *
 * Reads jellylab-push first for anything to do with downloading, because it
 * sees the whole *arr queue rather than its first page, and because it is the
 * only source that knows a torrent has stalled or that an import is stuck.
 * Falls back to Jellyseerr, which is what existed before and is right often
 * enough.
 */
export function requestState(
  request: JellyseerrRequest,
  now: number = Date.now(),
  push?: Downloads | null,
): RequestState {
  const media = request.media;

  // Needs a person: worth saying before anything about the media.
  if (request.status === REQUEST_PENDING) return { kind: 'pending' };
  if (request.status === REQUEST_DECLINED) return { kind: 'declined' };
  if (request.status === REQUEST_FAILED) return { kind: 'failed' };

  // Settled, and nothing else to say about it.
  if (media.status === MEDIA_AVAILABLE) return { kind: 'available' };

  const live = fromPush(request, push);
  if (live) {
    // Sonarr says importBlocked or importPending when the file arrived and
    // something is stopping it reaching the library - a state that looks
    // identical to "downloading" from a percentage, and needs attention.
    if (/import/i.test(live.status ?? '')) return { kind: 'importing' };
    // qBittorrent's own figure when we have it: the *arr one is a snapshot
    // taken up to a minute ago, which at speed is more than a gigabyte out.
    const percent = live.livePercent ?? live.percent;

    /*
     * And its own opinion on whether anything is moving.
     *
     * `stalled` is derived from Sonarr's errorMessage, which persists after
     * the download recovers - a torrent that found peers again still carried
     * "stalled with no connections" and showed a STALLED pill while the bar
     * climbed from 11% to 20%. qBittorrent's state is what is true now.
     */
    const stalled = live.clientState
      ? /stalled|missingfiles|error/i.test(live.clientState)
      : live.stalled;

    if (stalled) return { kind: 'stalled', percent };
    return { kind: 'downloading', percent };
  }

  const queue = media.downloadStatus ?? [];
  if (queue.length > 0) {
    const size = queue.reduce((sum, d) => sum + (d.size ?? 0), 0);
    const left = queue.reduce((sum, d) => sum + (d.sizeLeft ?? 0), 0);
    const percent = size > 0 ? Math.max(0, Math.min(1, (size - left) / size)) : null;
    return { kind: 'downloading', percent };
  }

  /*
   * Checked after the queue, before the search: something being downloaded is
   * more current than what Radarr thought of its availability, and a film that
   * is not out cannot be "searching" in any meaningful sense.
   *
   * The date shown is the first one that exists, in the order a person would
   * care: digital, then physical, then the cinema date - which is at least a
   * marker of how long the wait has already been.
   */
  /*
   * A season still going out. Checked alongside the film case and for the same
   * reason - and against the seasons this request actually covers, since a
   * request for series one says nothing about series two still airing.
   */
  if (media.mediaType === 'tv') {
    const show = push?.airing?.[String(media.tmdbId)];
    if (show) {
      const wanted = (request.seasons ?? []).map(x => String(x.seasonNumber));
      const keys = wanted.length > 0 ? wanted : Object.keys(show.seasons);
      for (const k of keys) {
        const season = show.seasons[k];
        if (!season) continue;
        /*
         * Being able to watch it outranks being told it is still airing.
         *
         * Both are true of a season part-way through, and the pill can only
         * carry one. "Partly available" is the one that says what you can do
         * now; when the rest arrives goes in the line underneath, which has
         * room for it.
         */
        if (media.status === MEDIA_PARTIAL) {
          return {
            kind: 'partial',
            airing: { aired: season.aired, total: season.total, next: season.nextAiring },
          };
        }
        return { kind: 'airing', aired: season.aired, total: season.total, next: season.nextAiring };
      }
    }
  }

  const pending = push?.unreleased?.[String(media.tmdbId)];
  if (pending && media.mediaType === 'movie') {
    return {
      kind: 'unreleased',
      status: pending.status,
      /*
       * Only a digital or physical date says anything about when a film can
       * arrive. The cinema date is not a third-best guess at that - it is a
       * different fact, and by the time anyone is waiting it has usually
       * passed. The Dog Stars reached cinemas on 26-08 with no digital date
       * announced, and the card read "Expected - 26-08-2026" six days later:
       * a promise the film had already broken. `status` carries the reason
       * instead, so the pill can say it is in cinemas and name no date.
       */
      date: pending.digitalRelease ?? pending.physicalRelease,
    };
  }

  if (media.status === MEDIA_PARTIAL) return { kind: 'partial' };

  if (media.status === MEDIA_PROCESSING) {
    /*
     * Already downloaded, just not noticed yet.
     *
     * Checked before the search story, because it settles the question that
     * story is guessing at. Jellyseerr trails Sonarr by up to two scan cycles
     * and says "Processing" throughout; the app used to render that as
     * "Looking for it" and be plainly wrong for minutes at a time.
     *
     * "Finishing up" is the existing importing pill and is exactly what this
     * is: the file is there, the library has yet to catch up.
     */
    if (onDiskComplete(push?.onDisk?.[String(media.tmdbId)], request.seasons)) {
      return { kind: 'importing' };
    }

    const started = Date.parse(request.createdAt);
    const days = Number.isNaN(started) ? 0 : Math.floor((now - started) / 86_400_000);

    /*
     * Evidence first, the clock only as a fallback.
     *
     * Elapsed time is a guess: it says a search has been running a while, not
     * that it has failed. A background sweep runs the real acceptance check
     * and knows - Khatron Ke Khiladi S15 had every episode aired and zero
     * releases anywhere, which the clock could only have inferred after three
     * days of saying "looking for it".
     *
     * Only a genuine absence counts. A swept `satisfied` means something is
     * already on its way, and `grabbable` means it should arrive, so neither
     * makes the card give up.
     */
    const swept = push?.verdicts?.[String(media.tmdbId)];
    const outcome = swept ? sweptOutcome(swept) : null;
    const foundNothing = outcome === 'nothing' || outcome === 'deadEnd';

    return {
      kind: 'searching',
      days,
      overdue: foundNothing || days >= STALLED_AFTER_DAYS,
    };
  }

  return { kind: 'other' };
}

/** The percentage to draw, for the states that have one. */
export function statePercent(state: RequestState): number | null {
  return state.kind === 'downloading' || state.kind === 'stalled' ? state.percent : null;
}

/**
 * How much attention a state wants, lowest first.
 *
 * Two thirds of this library's requests are available, so the list was mostly
 * the one state nobody acts on, with the handful that need something scattered
 * among them. Sorting by this puts the answer to "is anything wrong" at the
 * top, where it is visible without scrolling.
 *
 * Available last rather than hidden: it is still the record of what was asked
 * for, and a request that arrived is the happy end of the same list.
 */
export function attention(state: RequestState): number {
  switch (state.kind) {
    case 'pending': return 0;      // someone must act
    case 'failed': return 1;
    case 'stalled': return 2;      // going wrong on its own
    case 'searching': return state.overdue ? 3 : 6;
    case 'importing': return 4;    // nearly there, occasionally stuck
    case 'downloading': return 5;
    case 'airing': return 7;
    case 'unreleased': return 8;   // waiting on the world
    case 'partial': return 9;
    case 'declined': return 10;    // settled, by choice
    case 'available': return 11;   // settled, happily
    default: return 6;
  }
}
