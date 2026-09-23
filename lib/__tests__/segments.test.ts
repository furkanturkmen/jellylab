import { serverSkipAt, type Segment } from '../segments';

/**
 * An episode as a provider describes it: a theme early on, credits that run to
 * within a couple of seconds of the last frame.
 */
const DURATION = 1440;
const SEGMENTS: Segment[] = [
  { type: 'intro', start: 60, end: 150 },
  { type: 'credits', start: 1380, end: 1438 },
];

describe('serverSkipAt', () => {
  it('offers the end of the theme while the theme plays', () => {
    expect(serverSkipAt(70, SEGMENTS, DURATION)).toEqual({ segment: 'intro', to: 150 });
  });

  it('says nothing before it starts or after it ends', () => {
    expect(serverSkipAt(59, SEGMENTS, DURATION)).toBeNull();
    expect(serverSkipAt(150, SEGMENTS, DURATION)).toBeNull();
  });

  it('ends the episode when the credits run to the last frame', () => {
    expect(serverSkipAt(1400, SEGMENTS, DURATION)).toEqual({ segment: 'credits', to: 'end' });
  });

  it('seeks instead when something follows the credits', () => {
    const mid: Segment[] = [{ type: 'credits', start: 1200, end: 1300 }];
    expect(serverSkipAt(1250, mid, DURATION)).toEqual({ segment: 'credits', to: 1300 });
  });

  it('is null when the server has nothing for this episode', () => {
    expect(serverSkipAt(70, [], DURATION)).toBeNull();
    expect(serverSkipAt(70, null, DURATION)).toBeNull();
  });

  it('ignores a segment with no length', () => {
    expect(serverSkipAt(60, [{ type: 'intro', start: 60, end: 60 }], DURATION)).toBeNull();
  });

  it('still answers without a duration, by seeking rather than ending', () => {
    expect(serverSkipAt(1400, SEGMENTS, 0)).toEqual({ segment: 'credits', to: 1438 });
  });
});

describe('serverSkipAt distrusts a segment in the wrong half', () => {
  /*
   * Exactly what SkipMe.db returned for No Game No Life S01E01: an Intro at
   * 21:44 of a 24 minute episode, which is the ending theme mislabelled. The
   * app offered to skip it, on the phone, before this guard existed.
   */
  it('ignores an intro sitting in the back half of the episode', () => {
    const bad: Segment[] = [{ type: 'intro', start: 1304, end: 1368 }];
    expect(serverSkipAt(1310, bad, 1440)).toBeNull();
  });

  it('ignores credits sitting in the front half', () => {
    const bad: Segment[] = [{ type: 'credits', start: 100, end: 190 }];
    expect(serverSkipAt(120, bad, 1440)).toBeNull();
  });

  it('still trusts both when they sit where they belong', () => {
    expect(serverSkipAt(70, SEGMENTS, DURATION)).toEqual({ segment: 'intro', to: 150 });
    expect(serverSkipAt(1400, SEGMENTS, DURATION)).toEqual({ segment: 'credits', to: 'end' });
  });

  it('takes the provider at its word when the duration is unknown', () => {
    const bad: Segment[] = [{ type: 'intro', start: 1304, end: 1368 }];
    expect(serverSkipAt(1310, bad, 0)).toEqual({ segment: 'intro', to: 1368 });
  });
});
