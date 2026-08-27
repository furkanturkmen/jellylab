import { resumeSecondsFor, secondsToTicks, ticksToSeconds } from '../progress';

describe('tick conversion', () => {
  it('converts both ways', () => {
    expect(ticksToSeconds(10_000_000)).toBe(1);
    expect(ticksToSeconds(9_700_000_000)).toBe(970);
    expect(secondsToTicks(1)).toBe(10_000_000);
    expect(secondsToTicks(970)).toBe(9_700_000_000);
  });

  it('answers zero for nothing rather than NaN', () => {
    // A player reports no position until it has loaded, and NaN ticks sent to
    // the server is a resume point nobody can come back from.
    expect(ticksToSeconds(undefined)).toBe(0);
    expect(ticksToSeconds(null)).toBe(0);
    expect(ticksToSeconds(NaN)).toBe(0);
    expect(secondsToTicks(undefined)).toBe(0);
    expect(secondsToTicks(Infinity)).toBe(0);
  });

  it('refuses a negative position', () => {
    expect(ticksToSeconds(-5)).toBe(0);
    expect(secondsToTicks(-5)).toBe(0);
  });

  it('rounds to a whole tick', () => {
    // The server takes an integer; a fractional tick is rejected outright.
    expect(Number.isInteger(secondsToTicks(1.2345678))).toBe(true);
  });
});

describe('resumeSecondsFor', () => {
  it('takes the server position when the app has no answer', () => {
    expect(resumeSecondsFor(undefined, 9_700_000_000)).toBe(970);
    expect(resumeSecondsFor(null, 9_700_000_000)).toBe(970);
  });

  it('prefers the app position over the server one', () => {
    // A transcode restarted at the position the last stream reached: the
    // server's saved point is stale by then.
    expect(resumeSecondsFor(300, 9_700_000_000)).toBe(300);
  });

  it('treats a startAt of 0 as a deliberate restart', () => {
    // The distinction that matters. Falling through to the server's position
    // here would undo a film someone restarted from the top.
    expect(resumeSecondsFor(0, 9_700_000_000)).toBe(0);
  });

  it('starts at the beginning when neither has an answer', () => {
    expect(resumeSecondsFor(undefined, undefined)).toBe(0);
    expect(resumeSecondsFor(undefined, 0)).toBe(0);
  });

  it('never returns a negative or a NaN', () => {
    expect(resumeSecondsFor(-10, undefined)).toBe(0);
    expect(resumeSecondsFor(NaN, 9_700_000_000)).toBe(970);
  });
});
