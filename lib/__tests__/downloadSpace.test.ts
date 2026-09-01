import { checkCap, GB, isWatched, toEvict, WATCHED_FRACTION } from '../downloadSpace';

const stored = (over: Partial<Parameters<typeof checkCap>[0][number]> = {}) => ({
  itemId: 'a', title: 'A', bytes: GB, watched: false, ...over,
});

describe('isWatched', () => {
  it('counts a title watched near the end rather than at the last tick', () => {
    expect(isWatched(90, 100)).toBe(true);
    expect(isWatched(WATCHED_FRACTION * 100, 100)).toBe(true);
  });

  it('leaves one part way through alone', () => {
    expect(isWatched(50, 100)).toBe(false);
  });

  /*
   * A film downloaded and never opened is the one an automatic policy would
   * throw away first, because nothing has moved its position. It must never
   * count as reclaimable.
   */
  it('does not count an untouched download as watched', () => {
    expect(isWatched(undefined, 100)).toBe(false);
    expect(isWatched(0, 100)).toBe(false);
  });

  it('says no when the runtime is unknown, rather than dividing by it', () => {
    expect(isWatched(500, undefined)).toBe(false);
    expect(isWatched(500, 0)).toBe(false);
  });
});

describe('checkCap', () => {
  it('fits when there is room', () => {
    const v = checkCap([stored({ bytes: 5 * GB })], 2 * GB, 20);
    expect(v.fits).toBe(true);
    expect(v.used).toBe(5 * GB);
    expect(v.cap).toBe(20 * GB);
  });

  it('does not fit when the download would cross the cap', () => {
    const v = checkCap([stored({ bytes: 19 * GB })], 2 * GB, 20);
    expect(v.fits).toBe(false);
  });

  it('fits exactly at the cap', () => {
    expect(checkCap([stored({ bytes: 18 * GB })], 2 * GB, 20).fits).toBe(true);
  });

  /*
   * A missing Content-Length must not block a download. Refusing because the
   * size could not be read would break the feature on a server quirk.
   */
  it('lets an unknown size through', () => {
    expect(checkCap([stored({ bytes: 19 * GB })], 0, 20).fits).toBe(true);
    expect(checkCap([stored({ bytes: 19 * GB })], -1, 20).fits).toBe(true);
  });

  it('offers only the watched items, oldest first', () => {
    const v = checkCap([
      stored({ itemId: 'new', bytes: GB, watched: true, completedAt: 200 }),
      stored({ itemId: 'unwatched', bytes: 8 * GB, watched: false, completedAt: 1 }),
      stored({ itemId: 'old', bytes: 2 * GB, watched: true, completedAt: 100 }),
    ], 15 * GB, 20);
    expect(v.reclaimable.map(s => s.itemId)).toEqual(['old', 'new']);
    expect(v.reclaimableBytes).toBe(3 * GB);
  });

  it('calls it hopeless when clearing everything watched still would not do', () => {
    const v = checkCap([
      stored({ itemId: 'w', bytes: 2 * GB, watched: true }),
      stored({ itemId: 'u', bytes: 17 * GB, watched: false }),
    ], 10 * GB, 20);
    expect(v.fits).toBe(false);
    expect(v.hopeless).toBe(true);
  });

  it('is not hopeless when the watched items would make room', () => {
    const v = checkCap([
      stored({ itemId: 'w', bytes: 8 * GB, watched: true }),
      stored({ itemId: 'u', bytes: 11 * GB, watched: false }),
    ], 5 * GB, 20);
    expect(v.hopeless).toBe(false);
  });
});

describe('toEvict', () => {
  it('removes nothing when it already fits', () => {
    expect(toEvict(checkCap([stored({ bytes: GB })], GB, 20))).toEqual([]);
  });

  /*
   * The person asked for room for one thing, not for a clear-out. Taking every
   * watched file when the oldest alone would do is the automatic behaviour
   * this feature exists to avoid.
   */
  it('stops as soon as there is room', () => {
    const v = checkCap([
      stored({ itemId: 'old', bytes: 3 * GB, watched: true, completedAt: 1 }),
      stored({ itemId: 'newer', bytes: 3 * GB, watched: true, completedAt: 2 }),
      stored({ itemId: 'keep', bytes: 13 * GB, watched: false }),
    ], 2 * GB, 20);
    expect(toEvict(v).map(s => s.itemId)).toEqual(['old']);
  });

  it('takes more than one when one is not enough', () => {
    const v = checkCap([
      stored({ itemId: 'old', bytes: GB, watched: true, completedAt: 1 }),
      stored({ itemId: 'newer', bytes: GB, watched: true, completedAt: 2 }),
      stored({ itemId: 'keep', bytes: 17 * GB, watched: false }),
    ], 3 * GB, 20);
    expect(toEvict(v).map(s => s.itemId)).toEqual(['old', 'newer']);
  });

  it('never offers an unwatched file, even when that leaves it short', () => {
    const v = checkCap([stored({ itemId: 'u', bytes: 19 * GB, watched: false })], 5 * GB, 20);
    expect(toEvict(v)).toEqual([]);
    expect(v.hopeless).toBe(true);
  });
});
