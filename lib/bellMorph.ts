import { Mark } from '@/constants/brand';

/**
 * The bell's outline, as numbers, and the three variants the swim interpolates
 * between.
 *
 * The mark is one move plus eight cubics - 25 points, 50 numbers - and every
 * variant keeps that command structure exactly. That is the whole reason a
 * path-morph library is not needed: two paths with the same commands can be
 * interpolated component-wise and re-serialised. A library exists to match
 * commands between outlines that *don't* agree, which is a problem this shape
 * does not have.
 *
 * Kept here rather than in the component so it can be tested without mounting
 * anything: these are the numbers that decide whether the swim reads as a body
 * squeezing or as a sticker being scaled.
 */

export const BELL_NUMBERS = (Mark.bell.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

/** Extents in the 1024 authoring grid, read off the path itself. */
export const BELL = { top: 152, bottom: 906, cx: 512 };

/**
 * Warp the rim inward (negative `amount`) or outward (positive), leaving the
 * apex where it is.
 *
 * The weight rises with vertical position, so the crown barely moves and the
 * rim moves most - which is what a bell does when it squeezes. `lift` shortens
 * the bell as it contracts: narrowing without shortening reads as a logo being
 * scaled rather than a body being squeezed.
 */
export function warp(amount: number, lift: number): number[] {
  const out = BELL_NUMBERS.slice();
  for (let i = 0; i < out.length; i += 2) {
    const x = out[i];
    const y = out[i + 1];
    const w = Math.min(1, Math.max(0, (y - BELL.top) / (BELL.bottom - BELL.top)));
    out[i] = BELL.cx + (x - BELL.cx) * (1 + amount * w);
    out[i + 1] = y - (y - BELL.top) * lift * w;
  }
  return out;
}

export const RELAXED = BELL_NUMBERS;
export const CONTRACTED = warp(-0.2, 0.06);   // rim 20% in, bell 6% shorter
export const FLARED = warp(0.12, -0.03);      // the recoil's over-flare

/**
 * Rebuild the path string from a flat number list.
 *
 * Worklet: this runs on the UI thread, once per frame of the swim.
 */
export function toPath(n: number[]): string {
  'worklet';
  return (
    `M${n[0]} ${n[1]}` +
    `C${n[2]} ${n[3]} ${n[4]} ${n[5]} ${n[6]} ${n[7]}` +
    `C${n[8]} ${n[9]} ${n[10]} ${n[11]} ${n[12]} ${n[13]}` +
    `C${n[14]} ${n[15]} ${n[16]} ${n[17]} ${n[18]} ${n[19]}` +
    `C${n[20]} ${n[21]} ${n[22]} ${n[23]} ${n[24]} ${n[25]}` +
    `C${n[26]} ${n[27]} ${n[28]} ${n[29]} ${n[30]} ${n[31]}` +
    `C${n[32]} ${n[33]} ${n[34]} ${n[35]} ${n[36]} ${n[37]}` +
    `C${n[38]} ${n[39]} ${n[40]} ${n[41]} ${n[42]} ${n[43]}` +
    `C${n[44]} ${n[45]} ${n[46]} ${n[47]} ${n[48]} ${n[49]}` +
    'Z'
  );
}

/** Component-wise blend of two same-structure point lists. */
export function blend(a: number[], b: number[], t: number): number[] {
  'worklet';
  const out: number[] = [];
  for (let i = 0; i < a.length; i++) out.push(a[i] + (b[i] - a[i]) * t);
  return out;
}

/**
 * One pulse: contract, then thrust, then coast.
 *
 * The order is the point. The contraction completes before the body starts
 * moving, and the thrust eases *out of* the squeeze. Reversing that is what
 * makes an animated logo look like a sticker sliding across the screen.
 *
 * `push` is how much of this pulse's travel has been spent, so displacement is
 * a consequence of the squeeze rather than a curve running beside it.
 */
/** How much of a pulse's travel the thrust itself spends; the rest is glide. */
const THRUST_SHARE = 0.55;

export function pulse(phase: number): { shape: number[]; push: number } {
  'worklet';
  if (phase < 0.32) {
    // Contract. Nothing moves yet - the squeeze completes first.
    const k = phase / 0.32;
    return { shape: blend(RELAXED, CONTRACTED, k), push: 0 };
  }
  if (phase < 0.62) {
    // Thrust: the fast part, easing out of the squeeze. It spends a little
    // over half the pulse's travel.
    const k = (phase - 0.32) / 0.3;
    const eased = 1 - Math.pow(1 - k, 3);
    return { shape: blend(CONTRACTED, FLARED, eased), push: THRUST_SHARE * eased };
  }
  /*
   * Coast: still moving, and slowing.
   *
   * This is what separates swimming from teleporting. Ending the travel with
   * the thrust makes the body lurch and then stand perfectly still for the
   * rest of the pulse - four jumps and four dead stops - which reads as the
   * mark being teleported four times. A real jelly keeps gliding on the water
   * it already pushed, decelerating against drag, and the next contraction
   * starts before it has fully stopped.
   */
  const k = (phase - 0.62) / 0.38;
  const glide = 1 - Math.pow(1 - k, 2);
  return { shape: blend(FLARED, RELAXED, k), push: THRUST_SHARE + (1 - THRUST_SHARE) * glide };
}



/**
 * The pulse, precomputed.
 *
 * Interpolating the outline and re-serialising it on every frame means two
 * 50-number arrays and a path string allocated 60 times a second on the UI
 * thread, and it shows: the swim stutters because the frame is spent in the
 * allocator rather than in the renderer. The shapes never depend on anything
 * but `phase`, so they can all be built once at module load and indexed.
 *
 * 48 samples is a shade over one per frame for a 1.5 Hz pulse at 60fps, so
 * nothing is quantised that the eye could catch.
 */
export const SWIM_SAMPLES = 48;

export const PULSE_PATHS: string[] = [];
export const PULSE_PUSH: number[] = [];
for (let i = 0; i < SWIM_SAMPLES; i++) {
  const { shape, push } = pulse(i / SWIM_SAMPLES);
  PULSE_PATHS.push(toPath(shape));
  PULSE_PUSH.push(push);
}

/** The resting outline, serialised once - the frame the sequence holds on. */
export const RESTING_PATH = toPath(RELAXED);
