import type { DownloadProgress, Downloads } from '@/api/push';
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
 * After this long with nothing downloading, "waiting for a match" stops being
 * a description and starts being a euphemism. Three days is long enough that a
 * popular title has certainly been grabbed, and short enough to be useful.
 */
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
  | { kind: 'partial' }
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
    if (live.stalled) return { kind: 'stalled', percent };
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
        if (season) return { kind: 'airing', aired: season.aired, total: season.total, next: season.nextAiring };
      }
    }
  }

  const pending = push?.unreleased?.[String(media.tmdbId)];
  if (pending && media.mediaType === 'movie') {
    return {
      kind: 'unreleased',
      status: pending.status,
      date: pending.digitalRelease ?? pending.physicalRelease ?? pending.inCinemas,
    };
  }

  if (media.status === MEDIA_PARTIAL) return { kind: 'partial' };

  if (media.status === MEDIA_PROCESSING) {
    const started = Date.parse(request.createdAt);
    const days = Number.isNaN(started) ? 0 : Math.floor((now - started) / 86_400_000);
    return { kind: 'searching', days, overdue: days >= STALLED_AFTER_DAYS };
  }

  return { kind: 'other' };
}

/** The percentage to draw, for the states that have one. */
export function statePercent(state: RequestState): number | null {
  return state.kind === 'downloading' || state.kind === 'stalled' ? state.percent : null;
}
