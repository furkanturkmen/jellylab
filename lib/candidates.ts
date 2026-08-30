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
  | { kind: 'deadEnd'; found: number; reason: string | null }
  | { kind: 'grabbable'; found: number; accepted: number; best: Release };

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
    return { kind: 'deadEnd', found: c.found, reason: topReason(c.rejections) };
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
