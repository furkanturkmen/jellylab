import { requestProgress, STALLED_AFTER_DAYS } from '../requests';

const DAY = 86_400_000;
const NOW = Date.parse('2026-08-26T12:00:00.000Z');

const request = (over: any = {}) => ({
  id: 1,
  status: 2,
  createdAt: new Date(NOW - DAY).toISOString(),
  requestedBy: { id: 1, displayName: 'furkan' },
  ...over,
  media: { id: 1, tmdbId: 1, mediaType: 'movie', status: 3, downloadStatus: [], ...(over.media ?? {}) },
}) as any;

describe('requestProgress', () => {
  it('reports how far a download has got', () => {
    const p = requestProgress(request({
      media: { downloadStatus: [{ size: 1000, sizeLeft: 250 }] },
    }), NOW);
    expect(p).toEqual({ state: 'downloading', percent: 0.75 });
  });

  // A client that has not started reporting sizes would otherwise draw a bar
  // at zero, which reads as stuck rather than as starting.
  it('has no percentage when the size is unknown', () => {
    const p = requestProgress(request({ media: { downloadStatus: [{}] } }), NOW);
    expect(p).toEqual({ state: 'downloading', percent: null });
  });

  it('counts the days a processing request has been waiting', () => {
    const p = requestProgress(request({ createdAt: new Date(NOW - 2 * DAY).toISOString() }), NOW);
    expect(p).toEqual({ state: 'waiting', days: 2, stalled: false });
  });

  // The case this exists for: approved, nothing queued, and no longer new.
  it('calls it stalled once nothing has happened for long enough', () => {
    const p = requestProgress(
      request({ createdAt: new Date(NOW - STALLED_AFTER_DAYS * DAY).toISOString() }),
      NOW,
    );
    expect(p).toEqual({ state: 'waiting', days: STALLED_AFTER_DAYS, stalled: true });
  });

  it('says nothing about a request that is available or declined', () => {
    expect(requestProgress(request({ media: { status: 5 } }), NOW)).toEqual({ state: 'other' });
  });

  it('survives a date the server wrote badly', () => {
    const p = requestProgress(request({ createdAt: 'not a date' }), NOW);
    expect(p).toEqual({ state: 'waiting', days: 0, stalled: false });
  });
});

/**
 * The whole-queue view from jellylab-push.
 *
 * Jellyseerr asks Sonarr for one page of its queue, and Sonarr queues a row per
 * episode - so a 23-episode season pack fills that page and everything behind
 * it reports nothing. Observed live: a stalled download held the only progress
 * bar while the one actually moving showed none.
 */
describe('requestProgress with jellylab-push', () => {
  const push = (over: any = {}) => ({ tv: {}, movies: {}, ...over }) as any;

  it('uses the service in preference to jellyseerr', () => {
    // Jellyseerr says nothing is downloading; the service says 55%. The
    // service is right - it read the whole queue.
    const p = requestProgress(
      request({ media: { tmdbId: 5920, mediaType: 'tv', downloadStatus: [] } }),
      NOW,
      push({ tv: { 5920: { size: 100, sizeLeft: 45, percent: 0.55, status: 'downloading', stalled: false } } }),
    );
    expect(p).toEqual({ state: 'downloading', percent: 0.55, stalled: false, status: 'downloading' });
  });

  it('carries the stalled flag, which a percentage cannot say', () => {
    // 7% and stopped looks identical to 7% and moving without this.
    const p = requestProgress(
      request({ media: { tmdbId: 60808, mediaType: 'tv', downloadStatus: [] } }),
      NOW,
      push({ tv: { 60808: { size: 100, sizeLeft: 93, percent: 0.07, status: 'downloading', stalled: true } } }),
    );
    expect(p).toMatchObject({ state: 'downloading', stalled: true });
  });

  it('keeps films and series apart', () => {
    // The same TMDB id can be a film and a series, and they are not the same
    // thing - so a film must not read a series entry.
    const p = requestProgress(
      request({ media: { tmdbId: 42, mediaType: 'movie', downloadStatus: [] } }),
      NOW,
      push({ tv: { 42: { size: 100, sizeLeft: 0, percent: 1, status: 'downloading', stalled: false } } }),
    );
    expect(p.state).not.toBe('downloading');
  });

  it('falls back to jellyseerr when the service knows nothing about this one', () => {
    const p = requestProgress(
      request({ media: { tmdbId: 7, mediaType: 'movie', downloadStatus: [{ size: 1000, sizeLeft: 100 }] } }),
      NOW,
      push({ movies: { 999: { size: 1, sizeLeft: 0, percent: 1, status: 'downloading', stalled: false } } }),
    );
    expect(p).toEqual({ state: 'downloading', percent: 0.9 });
  });

  it('behaves exactly as before when the service is unreachable', () => {
    // The URL may never have been set, or the homelab may be off. Passing
    // null, undefined or nothing at all must all read as "ask jellyseerr".
    const r = request({ media: { downloadStatus: [{ size: 1000, sizeLeft: 250 }] } });
    const expected = { state: 'downloading', percent: 0.75 };
    expect(requestProgress(r, NOW, null)).toEqual(expected);
    expect(requestProgress(r, NOW, undefined)).toEqual(expected);
    expect(requestProgress(r, NOW)).toEqual(expected);
  });

  it('does not invent a bar when the service reports no size yet', () => {
    const p = requestProgress(
      request({ media: { tmdbId: 5920, mediaType: 'tv', downloadStatus: [] } }),
      NOW,
      push({ tv: { 5920: { size: 0, sizeLeft: 0, percent: null, status: 'queued', stalled: false } } }),
    );
    expect(p).toMatchObject({ state: 'downloading', percent: null });
  });
});
