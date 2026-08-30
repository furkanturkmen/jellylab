import { averageSpeed, elapsedSince, formatEta } from '../download';

const NOW = Date.parse('2026-08-30T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const HOUR = 3_600_000;

describe('averageSpeed', () => {
  it('is bytes done over time elapsed', () => {
    // 3.6GB in an hour is 1MB/s.
    expect(averageSpeed(10_000_000_000, 6_400_000_000, ago(HOUR), NOW)).toBe(1_000_000);
  });

  it('measures from when it started, not from now', () => {
    // The same bytes over twice the time is half the speed - which is the
    // whole point of an average rather than a spot reading.
    const a = averageSpeed(1000, 400, ago(HOUR), NOW);
    const b = averageSpeed(1000, 400, ago(2 * HOUR), NOW);
    expect(a).toBeCloseTo((b ?? 0) * 2);
  });

  it('says nothing rather than something wrong', () => {
    // Added this instant: dividing by a fraction of a second turns rounding
    // into a headline figure of gigabytes per second.
    expect(averageSpeed(1000, 400, ago(500), NOW)).toBeNull();
    // Nothing done yet.
    expect(averageSpeed(1000, 1000, ago(HOUR), NOW)).toBeNull();
    // A clock that disagrees with the server.
    expect(averageSpeed(1000, 400, new Date(NOW + HOUR).toISOString(), NOW)).toBeNull();
  });

  it('needs all three to answer', () => {
    expect(averageSpeed(undefined, 400, ago(HOUR), NOW)).toBeNull();
    expect(averageSpeed(1000, undefined, ago(HOUR), NOW)).toBeNull();
    expect(averageSpeed(1000, 400, null, NOW)).toBeNull();
    expect(averageSpeed(1000, 400, 'not a date', NOW)).toBeNull();
  });
});

describe('elapsedSince', () => {
  it('answers at the scale a person is asking about', () => {
    expect(elapsedSince(ago(30_000), NOW)).toBe('just now');
    expect(elapsedSince(ago(5 * 60_000), NOW)).toBe('5m');
    expect(elapsedSince(ago(3 * HOUR), NOW)).toBe('3h');
    // Past two days, hours stop meaning anything.
    expect(elapsedSince(ago(72 * HOUR), NOW)).toBe('3d');
  });

  it('says nothing when it cannot tell', () => {
    expect(elapsedSince(null, NOW)).toBeNull();
    expect(elapsedSince('not a date', NOW)).toBeNull();
  });
});

describe('formatEta', () => {
  it('gets coarser as it gets further away', () => {
    // At three hours out, minutes are noise; a figure that moves every second
    // reads as instability rather than precision.
    expect(formatEta(45)).toBe('45s');
    expect(formatEta(1169)).toBe('19m');       // real: 33MB/s, 9 seeds
    expect(formatEta(81520)).toBe('22h 39m');  // real: 215KB/s, 1 seed
    expect(formatEta(3600)).toBe('1h');
    expect(formatEta(180000)).toBe('2d 2h');
  });

  it('says nothing rather than something absurd', () => {
    // qBittorrent reports 8640000 - a hundred days - as "no idea", which a
    // stalled torrent emits constantly. "100d left" is worse than silence.
    expect(formatEta(8_640_000)).toBeNull();
    expect(formatEta(null)).toBeNull();
    expect(formatEta(undefined)).toBeNull();
    expect(formatEta(0)).toBeNull();
    expect(formatEta(-5)).toBeNull();
    expect(formatEta(NaN)).toBeNull();
  });
});
