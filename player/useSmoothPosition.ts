import { useEffect, useRef, useState } from 'react';

/**
 * Where the playhead is now, given where it was and when that was measured.
 *
 * Split out from the hook because this is the whole idea and the rest is
 * wiring - and because every test in this repo is a pure function, which is
 * worth more than a testing library for four lines of arithmetic.
 */
export function interpolate(position: number, at: number, now: number, rate: number): number {
  // A clock that ran backwards would drag subtitles backwards with it; a
  // system time change is the likeliest cause and is not worth honouring.
  const elapsed = Math.max(0, now - at);
  return position + (elapsed / 1000) * rate;
}

/**
 * The playhead between ticks.
 *
 * Both engines learn the position about four times a second - one polls
 * `currentTime` on a 250ms interval, the other waits for VLC's `onProgress` -
 * and the subtitle overlay only moved when that arrived. So a cue could sit up
 * to a quarter-second behind the audio, and always behind: a sample can only
 * say where the playhead was.
 *
 * Between two samples the clock is not a mystery. It advances at the playback
 * rate, so the position now is the last one plus however long ago it was
 * taken, refreshed often enough to be under the threshold where a person
 * notices.
 *
 * Cheap on purpose: nothing extra is asked of the player, which is the busy
 * part. This is arithmetic on a number it already gave us.
 */
export function useSmoothPosition(
  /** The last position the player reported, in seconds. */
  reported: number,
  /** Interpolate only while it is actually moving. */
  playing: boolean,
  /** Playback rate, so 1.5x subtitles do not drift behind by half again. */
  rate: number = 1,
  /** How often to recompute. 50ms is comfortably under what anyone perceives. */
  everyMs: number = 50,
): number {
  const [smooth, setSmooth] = useState(reported);

  /*
   * When the reported position was taken.
   *
   * Written during render rather than in an effect: a sample that arrives and
   * is timestamped one tick later has already lost the thing being measured.
   */
  // The clock is read during render deliberately: a sample timestamped one
  // tick later has already lost the interval being measured.
  // eslint-disable-next-line react-hooks/purity
  const base = useRef({ at: Date.now(), position: reported });
  // Timestamped during render on purpose - see the comment above.
  // eslint-disable-next-line react-hooks/refs
  if (base.current.position !== reported) {
    // Same clock read, same reason, and the same ref write as above.
    // eslint-disable-next-line react-hooks/purity, react-hooks/refs
    base.current = { at: Date.now(), position: reported };
  }

  useEffect(() => {
    // Paused, or scrubbing: the reported position is the truth and guessing
    // past it would run the overlay ahead of a picture that is not moving.
    if (!playing) {
      // Snaps to the reported position when playback stops. The player is the
      // external system this hook exists to follow.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSmooth(reported);
      return;
    }
    setSmooth(reported);
    const id = setInterval(() => {
      const { at, position } = base.current;
      setSmooth(interpolate(position, at, Date.now(), rate));
    }, everyMs);
    return () => clearInterval(id);
  }, [reported, playing, rate, everyMs]);

  return smooth;
}
