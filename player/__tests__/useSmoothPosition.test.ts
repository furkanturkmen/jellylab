import { interpolate } from '../useSmoothPosition';

const AT = Date.parse('2026-08-31T00:00:00.000Z');

describe('interpolate', () => {
  // The bug this exists for: both engines learn the position about four times
  // a second, so a cue drawn on the last reported one sat up to a quarter
  // second behind the audio - and only ever behind, because a sample can say
  // where the playhead was and never where it is.
  it('advances by the time since the reading was taken', () => {
    expect(interpolate(10, AT, AT + 200, 1)).toBeCloseTo(10.2, 3);
    expect(interpolate(10, AT, AT + 250, 1)).toBeCloseTo(10.25, 3);
  });

  it('follows the playback rate', () => {
    // At 1.5x, guessing at 1x would leave subtitles drifting behind by half
    // again as much as they already were.
    expect(interpolate(10, AT, AT + 200, 1.5)).toBeCloseTo(10.3, 3);
    expect(interpolate(10, AT, AT + 200, 0.5)).toBeCloseTo(10.1, 3);
  });

  it('is the reading itself at the moment it was taken', () => {
    expect(interpolate(10, AT, AT, 1)).toBe(10);
  });

  it('never runs backwards', () => {
    // A system clock that jumps back would otherwise drag the overlay with
    // it, pulling subtitles behind a picture that has not moved.
    expect(interpolate(10, AT, AT - 5000, 1)).toBe(10);
  });
});
