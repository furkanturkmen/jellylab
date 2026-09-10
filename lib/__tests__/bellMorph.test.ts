import { BELL, BELL_NUMBERS, CONTRACTED, FLARED, RELAXED, blend, pulse, toPath, warp } from '../bellMorph';

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

  it('moves the rim and leaves the apex', () => {
    const apex = (n: number[]) => ({ x: n[0], y: n[1] });
    // The path starts at the crown, which is the point that must barely move.
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
    const rim = BELL_NUMBERS.findIndex((v, i) => i % 2 === 0 && v === 660 && BELL_NUMBERS[i + 1] === 796);
    expect(rim).toBeGreaterThan(-1);
    expect(inset(rim)).toBeGreaterThan(0.15);
    expect(inset(rim)).toBeLessThan(0.2);

    const crown = BELL_NUMBERS.findIndex((v, i) => i % 2 === 0 && v === 872 && BELL_NUMBERS[i + 1] === 292);
    expect(inset(crown)).toBeLessThan(0.05);
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

  it('spends exactly one pulse of travel per pulse', () => {
    expect(pulse(0.99).push).toBe(1);
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
