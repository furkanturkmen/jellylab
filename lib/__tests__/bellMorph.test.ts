import {
  BELL,
  BELL_NUMBERS,
  CONTRACTED,
  FLARED,
  PULSE_PATHS,
  PULSE_PUSH,
  RELAXED,
  RESTING_PATH,
  SWIM_SAMPLES,
  blend,
  pulse,
  toPath,
  warp,
} from '../bellMorph';

/*
 * The morph is interpolated numerically rather than by a path-morph library,
 * which only works while every variant keeps the same command structure. These
 * are the invariants that make that safe - break one and the swim tears.
 */
describe('bell morph', () => {
  it('is one move plus eight cubics, so 25 points', () => {
    expect(BELL_NUMBERS).toHaveLength(50);
  });

  it('keeps the command structure identical across all three variants', () => {
    const shape = (d: string) => d.replace(/-?\d+(\.\d+)?/g, '#');
    expect(shape(toPath(CONTRACTED))).toBe(shape(toPath(RELAXED)));
    expect(shape(toPath(FLARED))).toBe(shape(toPath(RELAXED)));
  });

  it('moves the body and leaves the apex', () => {
    const apex = (n: number[]) => ({ x: n[0], y: n[1] });
    // The path starts at the apex, which is the point that must not move.
    expect(apex(CONTRACTED).x).toBeCloseTo(apex(RELAXED).x, 6);
    expect(apex(CONTRACTED).y).toBeCloseTo(apex(RELAXED).y, 6);

    /*
     * The rim contracts by close to the full 20%, and the crown barely does.
     * Measured at the rim rather than at the widest point of the outline: the
     * widest control point sits high on the crown, where the weight is small
     * on purpose, so measuring there would report a contraction of 4% and say
     * nothing about the squeeze.
     */
    const inset = (i: number) => 1 - (CONTRACTED[i] - BELL.cx) / (RELAXED[i] - BELL.cx);
    const at = (x: number, y: number) =>
      BELL_NUMBERS.findIndex((v, i) => i % 2 === 0 && v === x && BELL_NUMBERS[i + 1] === y);

    /*
     * The widest band is the one that has to move, because that band is what
     * the silhouette is. An earlier weighting put full strength at the bottom
     * rim instead, which squeezed the outline hardest where it is narrow
     * anyway - 28% of inset produced 11% of visible change, and the mark read
     * as a rigid shape sliding rather than a body contracting.
     */
    const widest = at(872, 468);
    const rim = at(660, 796);
    expect(widest).toBeGreaterThan(-1);
    expect(rim).toBeGreaterThan(-1);
    expect(inset(widest)).toBeGreaterThan(0.2);
    expect(inset(rim)).toBeGreaterThan(0.2);
  });

  it('flares past the resting outline rather than back to it', () => {
    const width = (n: number[]) => {
      let max = 0;
      for (let i = 0; i < n.length; i += 2) max = Math.max(max, Math.abs(n[i] - BELL.cx));
      return max;
    };
    expect(width(FLARED)).toBeGreaterThan(width(RELAXED));
  });

  it('completes the contraction before anything moves', () => {
    // Nothing has been spent while the bell is still squeezing.
    expect(pulse(0).push).toBe(0);
    expect(pulse(0.31).push).toBe(0);
    // ...and displacement only begins once it has.
    expect(pulse(0.33).push).toBeGreaterThan(0);
  });

  it('spends a full pulse of travel by the end of the pulse', () => {
    expect(pulse(0.999).push).toBeCloseTo(1, 2);
  });

  it('keeps gliding through the coast rather than stopping dead', () => {
    /*
     * The failure this guards against is the mark lurching on each thrust and
     * then standing perfectly still until the next one - four jumps and four
     * dead stops, which reads as teleporting rather than swimming. Travel must
     * still be accumulating after the thrust has finished.
     */
    const afterThrust = pulse(0.63).push;
    const midCoast = pulse(0.8).push;
    const endCoast = pulse(0.99).push;
    expect(midCoast).toBeGreaterThan(afterThrust);
    expect(endCoast).toBeGreaterThan(midCoast);

    // ...and decelerating while it does, rather than gliding at a constant rate.
    expect(midCoast - afterThrust).toBeGreaterThan(endCoast - midCoast);
  });

  it('blends component-wise and hits both ends exactly', () => {
    expect(blend(RELAXED, CONTRACTED, 0)).toEqual(RELAXED);
    expect(blend(RELAXED, CONTRACTED, 1)).toEqual(CONTRACTED);
    const mid = blend(RELAXED, CONTRACTED, 0.5);
    expect(mid[2]).toBeCloseTo((RELAXED[2] + CONTRACTED[2]) / 2, 6);
  });

  it('warps nothing when asked for nothing', () => {
    expect(warp(0, 0)).toEqual(RELAXED);
  });
});

describe('precomputed pulse', () => {
  it('samples the same outlines the live pulse would produce', () => {
    for (let i = 0; i < SWIM_SAMPLES; i += 7) {
      const live = pulse(i / SWIM_SAMPLES);
      expect(PULSE_PATHS[i]).toBe(toPath(live.shape));
      expect(PULSE_PUSH[i]).toBeCloseTo(live.push, 10);
    }
  });

  it('starts each pulse relaxed and ends it having spent its travel', () => {
    expect(PULSE_PATHS[0]).toBe(RESTING_PATH);
    expect(PULSE_PUSH[SWIM_SAMPLES - 1]).toBeCloseTo(1, 2);
  });
});
