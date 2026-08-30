import type { Candidates, Release } from '@/api/push';

/**
 * What a release check actually found.
 *
 * "Searching" covers four different situations, and only one of them is worth
 * waiting out:
 *
 *   untracked  nobody is looking, because it was never added to Sonarr/Radarr
 *   nothing    the indexers returned no release at all - wait, or it is old
 *   deadEnd    releases exist and none may be grabbed. This never resolves on
 *              its own: the profile has to change, or nothing ever will
 *   grabbable  a release is acceptable right now, so the wait is real
 *
 * The distinction that matters is deadEnd. Bin Roye (2015) returns seven
 * releases - five DVDRip, one CAM, one unparseable - against a profile that
 * starts at 720p. It will search forever and report progress forever. Saying
 * so is the entire point of asking.
 */
export type Verdict =
  | { kind: 'untracked' }
  | { kind: 'nothing' }
  | { kind: 'satisfied'; found: number; reason: string | null }
  | { kind: 'deadEnd'; found: number; reason: string | null }
  | { kind: 'grabbable'; found: number; accepted: number; best: Release };

/**
 * Rejections that mean "we already have this", not "this cannot be had".
 *
 * Both arrive as zero acceptable releases and they are opposite situations.
 * Pinocchio: Unstrung finished downloading, imported as a 1.52GB Bluray-1080p,
 * and then reported "48 found, none can be used - this will not resolve on its
 * own" - because every remaining release was refused for the entirely correct
 * reason that the file on disk already meets the cutoff.
 *
 * Matched on Radarr's own words. They are shown to the user untranslated for
 * the same reason they are matched here: keeping a table of every string the
 * *arrs can emit in step with them is a losing game, but recognising the shape
 * of the satisfied ones is cheap and fails safe - an unmatched reason falls
 * through to deadEnd, which is the louder answer.
 */
const SATISFIED = /existing file|in queue|already meets cutoff|equal or higher/i;

/**
 * The commonest reason releases were refused.
 *
 * Counted rather than listed: seven rejections all reading "DVD is not wanted
 * in profile" are one fact, not seven. Ties break toward the reason that reads
 * first, so the answer is stable between calls rather than depending on key
 * order.
 */
export function topReason(rejections: Record<string, number>): string | null {
  let best: string | null = null;
  let bestCount = 0;
  for (const [reason, count] of Object.entries(rejections)) {
    if (count > bestCount) {
      best = reason;
      bestCount = count;
    }
  }
  return best;
}

export function verdict(c: Candidates): Verdict {
  if (!c.tracked) return { kind: 'untracked' };
  if (c.found === 0) return { kind: 'nothing' };

  // `accepted` is the server's count and `releases` is capped at ten, so trust
  // the count for the verdict and the list for what to show. They disagree
  // whenever more than ten are acceptable, which is the ordinary case.
  const best = c.releases[0];
  if (c.accepted === 0 || !best) {
    const reason = topReason(c.rejections);
    // Nothing acceptable *because we already have it* is success, and saying
    // "this will not resolve on its own" about a finished download is worse
    // than saying nothing at all.
    const kind = reason && SATISFIED.test(reason) ? 'satisfied' : 'deadEnd';
    return { kind, found: c.found, reason };
  }
  return { kind: 'grabbable', found: c.found, accepted: c.accepted, best };
}

/**
 * Whether a release looks like the shape that keeps poisoning this library.
 *
 * Not a safety check - the only real one opens the torrent and looks at what
 * is inside, which happens on the server (see docs/release-rules.md, R5). This
 * is a flag on a row so a person choosing by hand can see what the ranking saw:
 * a PROPER that the quality profile scores negative is precisely the
 * combination that beat 1813 seeders with 24 and turned out to be an .exe.
 */
export function suspicious(r: Release): boolean {
  return r.proper && r.score < 0;
}
