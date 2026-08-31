import {
  attention, deleteCancelsDownload, onDiskComplete, requestProgress, requestState, statePercent,
  STALLED_AFTER_DAYS,
} from '../requests';

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

describe('deleteCancelsDownload', () => {
  it('cancels downstream while the title is still being fetched', () => {
    // Processing is the state Bio-Broly was in: Radarr had accepted it and was
    // 24 seconds from grabbing when the request was deleted.
    expect(deleteCancelsDownload(3)).toBe(true);
  });

  it('cancels downstream for a request nobody has approved yet', () => {
    expect(deleteCancelsDownload(2)).toBe(true);
  });

  it('leaves an available title alone', () => {
    // Removing downstream deletes the library file, which is not what deleting
    // a request means once the file has arrived.
    expect(deleteCancelsDownload(5)).toBe(false);
  });

  it('leaves a partly available series alone', () => {
    // Seasons already on disk sit under the same media entry as the pending
    // one, so removing downstream would take them with it.
    expect(deleteCancelsDownload(4)).toBe(false);
  });

  it('cancels downstream when the status is unknown', () => {
    // Nothing says a file exists, and the failure that matters is the silent
    // download, not a removal that finds nothing to remove.
    expect(deleteCancelsDownload(undefined)).toBe(true);
    expect(deleteCancelsDownload(1)).toBe(true);
  });
});

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

/**
 * One state per card, and the most specific one that is true.
 *
 * The two-pill scheme it replaced read "Approved · Processing" on nearly every
 * card: approval is automatic, and Processing covered everything from "no
 * release exists" to "downloading fast" to "downloaded, and stuck".
 */
describe('requestState', () => {
  const push = (over: any = {}) => ({ tv: {}, movies: {}, ...over }) as any;
  const dl = (over: any = {}) => ({ size: 100, sizeLeft: 50, percent: 0.5, status: 'downloading', stalled: false, ...over });

  it('puts what needs a person before anything about the media', () => {
    // Pending outranks whatever the media is doing: it is the only state that
    // will not resolve itself.
    expect(requestState(request({ status: 1, media: { status: 3 } })).kind).toBe('pending');
    expect(requestState(request({ status: 3 })).kind).toBe('declined');
    expect(requestState(request({ status: 4 })).kind).toBe('failed');
  });

  it('says finishing up when the files are there and Jellyseerr is behind', () => {
    // The six minutes No Game No Life spent claiming to be looking for twelve
    // episodes it already had.
    const state = requestState(
      request({ media: { tmdbId: 60808, mediaType: 'tv', status: 3 }, seasons: [{ seasonNumber: 1 }] }),
      undefined,
      push({ onDisk: { 60808: { seasons: { 1: { files: 12, episodes: 12 } } } } }));
    expect(state.kind).toBe('importing');
  });

  it('still says looking for it when the disk is short', () => {
    const state = requestState(
      request({ media: { tmdbId: 60808, mediaType: 'tv', status: 3 }, seasons: [{ seasonNumber: 1 }] }),
      undefined,
      push({ onDisk: { 60808: { seasons: { 1: { files: 3, episodes: 12 } } } } }));
    expect(state.kind).toBe('searching');
  });

  it('does not let on-disk override a live download', () => {
    // Sonarr can hold season one while season two is still coming down. What
    // is moving now is the more useful thing to show.
    const state = requestState(
      request({ media: { tmdbId: 60808, mediaType: 'tv', status: 3 }, seasons: [{ seasonNumber: 1 }] }),
      undefined,
      push({
        tv: { 60808: dl() },
        onDisk: { 60808: { seasons: { 1: { files: 12, episodes: 12 } } } },
      }));
    expect(state.kind).toBe('downloading');
  });

  it('says available and stops there', () => {
    expect(requestState(request({ status: 2, media: { status: 5 } })).kind).toBe('available');
  });

  it('tells a stalled download from a moving one', () => {
    const moving = requestState(request({ media: { tmdbId: 1, mediaType: 'tv', status: 3 } }), NOW,
      push({ tv: { 1: dl() } }));
    const stuck = requestState(request({ media: { tmdbId: 1, mediaType: 'tv', status: 3 } }), NOW,
      push({ tv: { 1: dl({ stalled: true }) } }));
    expect(moving).toEqual({ kind: 'downloading', percent: 0.5 });
    expect(stuck).toEqual({ kind: 'stalled', percent: 0.5 });
  });

  it('calls out a download that finished but did not import', () => {
    // Reacher sat at 100% in qBittorrent while Sonarr refused it. From a
    // percentage that is indistinguishable from done.
    const p = requestState(request({ media: { tmdbId: 2, mediaType: 'tv', status: 3 } }), NOW,
      push({ tv: { 2: dl({ percent: 1, sizeLeft: 0, status: 'importBlocked' }) } }));
    expect(p.kind).toBe('importing');
  });

  it('counts the days a search has been running', () => {
    const p = requestState(request({
      status: 2,
      createdAt: new Date(NOW - 5 * DAY).toISOString(),
      media: { status: 3, downloadStatus: [] },
    }), NOW);
    expect(p).toEqual({ kind: 'searching', days: 5, overdue: true });
  });

  it('is not overdue on the first day', () => {
    const p = requestState(request({
      status: 2,
      createdAt: new Date(NOW - DAY).toISOString(),
      media: { status: 3, downloadStatus: [] },
    }), NOW);
    expect(p).toMatchObject({ kind: 'searching', overdue: false });
  });

  it('falls back to jellyseerr when the service is not there', () => {
    const p = requestState(request({
      status: 2,
      media: { status: 3, downloadStatus: [{ size: 1000, sizeLeft: 250 }] },
    }), NOW, null);
    expect(p).toEqual({ kind: 'downloading', percent: 0.75 });
  });

  it('only offers a percentage for the states that have one', () => {
    expect(statePercent({ kind: 'downloading', percent: 0.4 })).toBe(0.4);
    expect(statePercent({ kind: 'stalled', percent: 0.1 })).toBe(0.1);
    expect(statePercent({ kind: 'available' })).toBeNull();
    expect(statePercent({ kind: 'searching', days: 2, overdue: false })).toBeNull();
  });
});

/**
 * A film still in cinemas is not a search going wrong. Radarr will not look
 * for it until it reaches minimumAvailability, and saying "Looking for it"
 * claims work that nobody is doing.
 */
describe('requestState, not out yet', () => {
  const withUnreleased = (over: any = {}) =>
    ({ tv: {}, movies: {}, unreleased: { 1444466: { status: 'inCinemas', inCinemas: '2026-08-14T00:00:00Z', digitalRelease: null, physicalRelease: null, ...over } } }) as any;

  const awarapan = () => request({
    status: 2,
    media: { tmdbId: 1444466, mediaType: 'movie', status: 3, downloadStatus: [] },
  });

  it('says it is not out rather than that it is looking', () => {
    expect(requestState(awarapan(), NOW, withUnreleased())).toEqual({
      kind: 'unreleased', status: 'inCinemas', date: '2026-08-14T00:00:00Z',
    });
  });

  it('prefers the digital date, which is the one that matters', () => {
    const p = requestState(awarapan(), NOW, withUnreleased({ digitalRelease: '2026-11-01T00:00:00Z' }));
    expect(p).toMatchObject({ date: '2026-11-01T00:00:00Z' });
  });

  it('lets a download outrank it', () => {
    // If it is being fetched, whatever Radarr last thought about availability
    // is out of date.
    const push = { ...withUnreleased(), movies: { 1444466: { size: 100, sizeLeft: 40, percent: 0.6, status: 'downloading', stalled: false } } } as any;
    expect(requestState(awarapan(), NOW, push).kind).toBe('downloading');
  });

  it('does not apply to series', () => {
    // The map is Radarr's, and TMDB ids overlap between films and series.
    const tv = request({ status: 2, media: { tmdbId: 1444466, mediaType: 'tv', status: 3, downloadStatus: [] } });
    expect(requestState(tv, NOW, withUnreleased()).kind).toBe('searching');
  });
});

/**
 * A season still being broadcast is not a search going wrong either.
 *
 * The Rookie season nine has none of its eighteen episodes and is not due
 * until 2027; nothing is looking for it and nothing should be.
 */
describe('requestState, still airing', () => {
  const airing = (seasons: any) => ({
    tv: {}, movies: {},
    airing: { 79744: { status: 'continuing', seasons } },
  }) as any;

  const rookie = (seasons?: any[]) => request({
    status: 2,
    seasons,
    media: { tmdbId: 79744, mediaType: 'tv', status: 3, downloadStatus: [] },
  });

  it('reports a season that has not started', () => {
    const p = requestState(rookie([{ seasonNumber: 9 }]), NOW,
      airing({ 9: { aired: 0, total: 18, nextAiring: '2027-01-06T00:00:00Z' } }));
    expect(p).toEqual({ kind: 'airing', aired: 0, total: 18, next: '2027-01-06T00:00:00Z' });
  });

  it('reports one part way through', () => {
    const p = requestState(rookie([{ seasonNumber: 4 }]), NOW,
      airing({ 4: { aired: 5, total: 8, nextAiring: '2026-09-02T07:00:00Z' } }));
    expect(p).toMatchObject({ kind: 'airing', aired: 5, total: 8 });
  });

  it('only looks at the seasons the request covers', () => {
    // A request for season one says nothing about season nine still airing.
    const p = requestState(rookie([{ seasonNumber: 1 }]), NOW,
      airing({ 9: { aired: 0, total: 18, nextAiring: '2027-01-06T00:00:00Z' } }));
    expect(p.kind).toBe('searching');
  });

  it('lets a download outrank it', () => {
    const push = { ...airing({ 4: { aired: 5, total: 8, nextAiring: '2026-09-02T07:00:00Z' } }),
      tv: { 79744: { size: 100, sizeLeft: 40, percent: 0.6, status: 'downloading', stalled: false } } } as any;
    expect(requestState(rookie([{ seasonNumber: 4 }]), NOW, push).kind).toBe('downloading');
  });

  it('does not apply to films', () => {
    const film = request({ status: 2, media: { tmdbId: 79744, mediaType: 'movie', status: 3, downloadStatus: [] } });
    expect(requestState(film, NOW, airing({ 1: { aired: 0, total: 8, nextAiring: 'x' } })).kind).toBe('searching');
  });
});

describe('requestState, on the evidence rather than the clock', () => {
  const push = (over: any = {}) => ({ tv: {}, movies: {}, ...over }) as any;
  const fresh = request({ createdAt: new Date(NOW).toISOString() });

  it('gives up at once when a sweep found nothing at all', () => {
    // Khatron Ke Khiladi S15: requested today, every episode already aired,
    // and not one release anywhere. Waiting three days to say so is three days
    // of the card claiming it is looking.
    const state: any = requestState(fresh, NOW, push({
      verdicts: { '1': { found: 0, accepted: 0, rejections: {}, at: NOW } },
    }));
    expect(state.kind).toBe('searching');
    expect(state.days).toBe(0);
    expect(state.overdue).toBe(true);
  });

  it('gives up at once on a dead end', () => {
    const state: any = requestState(fresh, NOW, push({
      verdicts: {
        '1': { found: 7, accepted: 0, rejections: { 'DVD is not wanted in profile': 5 }, at: NOW },
      },
    }));
    expect(state.overdue).toBe(true);
  });

  it('keeps waiting when the sweep says something is acceptable', () => {
    const state: any = requestState(fresh, NOW, push({
      verdicts: { '1': { found: 318, accepted: 14, rejections: {}, at: NOW } },
    }));
    expect(state.overdue).toBe(false);
  });

  it('keeps waiting when the only rejections are because it is already coming', () => {
    // Counting rejections alone would call this dead; it is 37% downloaded.
    const state: any = requestState(fresh, NOW, push({
      verdicts: {
        '1': {
          found: 176,
          accepted: 0,
          rejections: {
            'Unknown Series': 70,
            'Release in queue already meets cutoff: Bluray-1080p v1': 51,
          },
          at: NOW,
        },
      },
    }));
    expect(state.overdue).toBe(false);
  });

  it('falls back to the clock when nothing has been swept', () => {
    // A title the sweep has not reached yet is absent, which is not the same
    // as one it swept and found nothing for.
    const old = request({ createdAt: new Date(NOW - STALLED_AFTER_DAYS * DAY).toISOString() });
    expect((requestState(old, NOW, push()) as any).overdue).toBe(true);
    expect((requestState(fresh, NOW, push()) as any).overdue).toBe(false);
  });
});

describe('requestState, a season part-way through', () => {
  const push = (over: any = {}) => ({ tv: {}, movies: {}, ...over }) as any;
  const airing = (aired: number, total: number) => push({
    airing: {
      '9': { status: 'continuing', seasons: { '4': { aired, total, nextAiring: '2026-09-02T07:00:00Z' } } },
    },
  });

  it('leads with what you can watch, not with what is broadcasting', () => {
    // Reacher season four: five of eight aired, all five on disk, next on
    // 2 Sep. "Airing 5/8" never said you could watch anything.
    const r = request({
      status: 2,
      seasons: [{ seasonNumber: 4 }],
      media: { tmdbId: 9, mediaType: 'tv', status: 4 },
    });
    const state: any = requestState(r, NOW, airing(5, 8));
    expect(state.kind).toBe('partial');
    // The broadcast half survives, for the line underneath.
    expect(state.airing).toMatchObject({ aired: 5, total: 8 });
  });

  it('still says airing when nothing has arrived yet', () => {
    const r = request({
      status: 2,
      seasons: [{ seasonNumber: 4 }],
      media: { tmdbId: 9, mediaType: 'tv', status: 3 },
    });
    expect(requestState(r, NOW, airing(5, 8)).kind).toBe('airing');
  });
});

describe('attention', () => {
  it('puts what needs a person above what is merely going wrong', () => {
    expect(attention({ kind: 'pending' }))
      .toBeLessThan(attention({ kind: 'stalled', percent: 0.5 }));
  });

  it('puts anything unresolved above anything settled', () => {
    // Two thirds of this library is available. If it did not sink, the list
    // would be mostly the state nobody acts on.
    const settled = attention({ kind: 'available' });
    for (const s of [
      { kind: 'pending' },
      { kind: 'failed' },
      { kind: 'stalled', percent: 0.5 },
      { kind: 'downloading', percent: 0.5 },
      { kind: 'importing' },
      { kind: 'searching', days: 0, overdue: false },
    ] as any[]) {
      expect(attention(s)).toBeLessThan(settled);
    }
  });

  it('raises a search that has found nothing above one still running', () => {
    expect(attention({ kind: 'searching', days: 9, overdue: true } as any))
      .toBeLessThan(attention({ kind: 'searching', days: 9, overdue: false } as any));
  });

  it('keeps a rejected request above nothing but success', () => {
    // Settled by choice, so it belongs with the quiet end - but it is still a
    // decision someone made, and sits above the ones that simply worked.
    expect(attention({ kind: 'declined' }))
      .toBeLessThan(attention({ kind: 'available' }));
  });
});

/*
 * Downloaded, but not yet noticed.
 *
 * Jellyseerr finds new files on a five-minute cycle running behind Jellyfin's
 * own, so a finished import stays "Processing" for a few minutes afterwards.
 * No Game No Life missed a sweep by thirty-nine seconds - Sonarr had all
 * twelve episodes at 00:09:07, Jellyfin wrote the series item at 00:10:07,
 * seven seconds after the sweep had already passed the Anime library - and the
 * card said "Looking for it" about a season sitting complete on disk.
 */
describe('onDiskComplete', () => {
  const season = (files: number, episodes: number) => ({ files, episodes });

  it('is true for a film Radarr holds', () => {
    expect(onDiskComplete({ file: true })).toBe(true);
  });

  it('is false when there is nothing to go on', () => {
    // Absent is not the same as empty: a title the sweep has not reached yet
    // must not read as downloaded.
    expect(onDiskComplete(undefined)).toBe(false);
    expect(onDiskComplete({})).toBe(false);
    expect(onDiskComplete({ seasons: {} })).toBe(false);
  });

  it('is true when every requested season is complete', () => {
    expect(onDiskComplete({ seasons: { 1: season(12, 12) } }, [{ seasonNumber: 1 }])).toBe(true);
  });

  it('is false while a requested season is still short', () => {
    // Attack on Titan sat at 24 of 25 for weeks. That is not "finishing up".
    expect(onDiskComplete({ seasons: { 1: season(24, 25) } }, [{ seasonNumber: 1 }])).toBe(false);
  });

  it('judges only the seasons the request covers', () => {
    // Series two complete, series three barely started. A request for two is
    // finished; a request for both is not.
    const disk = { seasons: { 2: season(12, 12), 3: season(1, 12) } };
    expect(onDiskComplete(disk, [{ seasonNumber: 2 }])).toBe(true);
    expect(onDiskComplete(disk, [{ seasonNumber: 2 }, { seasonNumber: 3 }])).toBe(false);
  });

  it('is false for a requested season Sonarr has nothing for', () => {
    expect(onDiskComplete({ seasons: { 1: season(12, 12) } }, [{ seasonNumber: 2 }])).toBe(false);
  });

  it('falls back to every season it knows when the request names none', () => {
    // Jellyseerr requests carry seasons, but the field is optional in the type
    // and a movie-shaped request has none at all.
    expect(onDiskComplete({ seasons: { 1: season(12, 12) } })).toBe(true);
    expect(onDiskComplete({ seasons: { 1: season(12, 12), 2: season(0, 10) } })).toBe(false);
  });

  it('does not count a season with no monitored episodes as complete', () => {
    // 0 >= 0 is true and would have made an unmonitored season read as done.
    expect(onDiskComplete({ seasons: { 1: season(0, 0) } }, [{ seasonNumber: 1 }])).toBe(false);
  });
});

