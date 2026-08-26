import type { JellyseerrRequest } from '@/types';

/** Jellyseerr's own numbers, named. */
export const REQUEST_APPROVED = 2;
export const MEDIA_PROCESSING = 3;

/**
 * After this long with nothing downloading, "waiting for a match" stops being
 * a description and starts being a euphemism. Three days is long enough that a
 * popular title has certainly been grabbed, and short enough to be useful.
 */
export const STALLED_AFTER_DAYS = 3;

export type RequestProgress =
  | { state: 'downloading'; percent: number | null }
  | { state: 'waiting'; days: number; stalled: boolean }
  | { state: 'other' };

/**
 * What is actually happening to a request.
 *
 * The Requests tab showed "Processing" from the minute a request was approved
 * until the file arrived, whether the server was downloading at 40 MB/s or had
 * found nothing at all - and those look identical to anyone waiting. Jellyseerr
 * knows the difference: an empty `downloadStatus` means Radarr or Sonarr has
 * nothing queued, and `createdAt` says how long that has been true.
 */
export function requestProgress(request: JellyseerrRequest, now: number = Date.now()): RequestProgress {
  const media = request.media;
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
