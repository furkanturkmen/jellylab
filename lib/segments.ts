import type { SegmentSkip } from '@/lib/chapters';

/**
 * Media segments, the server's own answer to the same question chapters
 * answer by accident.
 *
 * Jellyfin 10.10 added a Media Segments API and 12.x keeps it: a provider
 * plugin analyses episodes and stores where the intro and the credits are,
 * and every client reads the result from one endpoint. It is the mechanism
 * behind the Skip Intro button in Jellyfin's own clients.
 *
 * Chapters are still the better source where they exist, because they come
 * from the file itself and are exact. Segments cover the episodes nobody
 * chaptered - on this server, after one SkipMe.db sync, 229 of 1250 episodes.
 * So this is a fallback, not a replacement, and the player asks for it second.
 *
 * Recap, Preview and Commercial are deliberately dropped. A recap is content
 * some people want, a preview is next week's teaser, and neither has a button
 * to press yet - mapping them onto "skip intro" would skip the wrong thing.
 */
export type Segment = {
  /** Only the two kinds that map to a button the player already draws. */
  type: 'intro' | 'credits';
  start: number;
  end: number;
};

/**
 * How close to the end of the file a credits segment has to end before the
 * episode counts as over.
 *
 * Providers rarely put the outro's end exactly on the last frame, and seeking
 * into the final seconds of a file to watch them tick away is not what the
 * button is for.
 */
const END_SLACK = 5;

/**
 * Where to seek to leave the segment playing now, or null when none is.
 *
 * Mirrors segmentSkipAt in lib/chapters: same answer shape, same stateless
 * question, so the engines can try one and fall back to the other without
 * either knowing where the answer came from.
 */
export function serverSkipAt(
  seconds: number,
  segments: Segment[] | null | undefined,
  duration: number,
): SegmentSkip | null {
  if (!segments || segments.length === 0) return null;

  for (const s of segments) {
    if (!Number.isFinite(s.start) || !Number.isFinite(s.end)) continue;
    if (s.end <= s.start) continue;
    if (seconds < s.start || seconds >= s.end) continue;

    if (s.type === 'credits' && duration > 0 && s.end >= duration - END_SLACK) {
      return { segment: 'credits', to: 'end' };
    }
    return { segment: s.type, to: s.end };
  }
  return null;
}
