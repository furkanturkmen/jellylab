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
