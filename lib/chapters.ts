/**
 * Chapter marks, and the two questions the player asks about them.
 *
 * Jellyfin hands back whatever chapter marks the file was encoded with, which
 * on this library is 47% of episodes - 186 of a 400-episode sample. A mark is
 * only a start time and a name, so everything here is derived: a chapter runs
 * until the next one starts, and the last one until the end of the episode.
 *
 * The names are the interesting part. Across that sample the common ones are
 * Intro (59), Prologue (57), Preview (55), ED (45), Opening (44), OP (44),
 * Part A/B (85), Credits (28), Ending (26) - and the single most common *first*
 * chapter is Prologue, not Intro.
 *
 * That is the trap this module exists to avoid. In anime a Prologue is the cold
 * open before the theme: story, the exact thing a viewer does not want skipped.
 * So a "skip the first chapter" button would eat plot on 57 of 186 episodes.
 * INTRO matches the theme song and nothing else; Prologue and Recap are content
 * and are deliberately absent from it.
 *
 * The end of an episode is the same idea with one extra case. 99 of those 186
 * episodes have a credits chapter; 69 are followed by something - Preview (49),
 * a post-credits scene (18) - and on the other 30 the credits are the last
 * chapter, with nothing to seek to. Those 30 are not a dead button: the episode
 * is over, so skipping asks the player to end it and let Up Next take over.
 */

/** A chapter mark, in seconds, after the ticks have been divided out. */
export type Chapter = {
  /** Where the chapter begins. Seconds from the start of the episode. */
  start: number;
  /** As the encoder wrote it: 'Intro', 'Part A', 'Chapter 16', sometimes ''. */
  name: string;
};

/**
 * The theme song, under the names encoders actually use.
 *
 * Anchored, because 'Part A' must not match on a stray 'op' and 'Preview' must
 * not match on 'view'. Trailing digits are allowed for the shows that number
 * their themes (OP1, OP 2) when the song changes mid-season.
 */
const INTRO = /^(intro|opening(\s*credits)?|op|theme(\s*song)?)\s*\d*$/i;

/**
 * A theme belongs to the first half of an episode, not to a fixed clock.
 *
 * This was ten minutes of absolute time until Steins;Gate S01E01, whose cold
 * open runs to 10:34 - so the one episode with the longest prologue in the
 * library was the one episode where the button never appeared. Half the
 * runtime is the same distrust expressed in the file's own terms, and it
 * mirrors MIN_CREDITS_RATIO at the other end.
 */
const MAX_INTRO_RATIO = 0.5;

/** The same guard for a file whose duration is not known yet. */
const MAX_INTRO_START = 600;

/**
 * How far into a chapter the back control stops meaning "the one before".
 *
 * Same behaviour every music player has: press back early and you go to the
 * previous chapter, press it later and you return to the start of this one.
 */
const RESTART_WINDOW = 3;

/**
 * The closing theme, the credits, and the silent versions of both.
 *
 * Deliberately not Preview or PV: a next-episode teaser is something people
 * choose to watch, and it is what usually *follows* the credits here.
 */
const CREDITS = /^(ed|ending(\s*credits)?|credits|outro|nced)\s*\d*$/i;

/**
 * Credits do not run in the first half of an episode.
 *
 * Same distrust as MAX_INTRO_START, from the other end: a mark called 'ED'
 * early on is a mislabelled file, not an ending, and skipping from it would
 * throw away most of the story.
 */
const MIN_CREDITS_RATIO = 0.5;

/** Start times ascending, with unusable marks dropped. */
function ordered(chapters: Chapter[]): Chapter[] {
  return chapters
    .filter(c => Number.isFinite(c.start) && c.start >= 0)
    .slice()
    .sort((a, b) => a.start - b.start);
}

/**
 * The start of the chapter after the one playing, or null at the last chapter.
 */
export function nextChapterAt(seconds: number, chapters: Chapter[]): number | null {
  const marks = ordered(chapters);
  for (const c of marks) {
    if (c.start > seconds + 0.5) return c.start;
  }
  return null;
}

/**
 * The start of this chapter, or of the one before it when barely into this one.
 *
 * Returns null only when there is nothing to go back to: before the first mark,
 * or already sitting at the start of the first chapter.
 */
export function previousChapterAt(seconds: number, chapters: Chapter[]): number | null {
  const marks = ordered(chapters);
  if (marks.length === 0) return null;

  let index = -1;
  for (let i = 0; i < marks.length; i += 1) {
    if (marks[i].start <= seconds + 0.001) index = i;
  }
  if (index < 0) return null;

  const current = marks[index];
  if (seconds - current.start > RESTART_WINDOW) return current.start;
  return index > 0 ? marks[index - 1].start : null;
}

/**
 * Where to seek to skip the theme, or null when the theme is not playing.
 *
 * Non-null only while the position sits inside a chapter the INTRO pattern
 * matches, so the button appears when the song starts and leaves when it ends -
 * no timer, no dismissal state, just a question asked of the current position.
 *
 * An intro with nothing after it is not skippable: there is nowhere to land.
 *
 * Duration is optional because it is not always known at the moment the first
 * frames play - the engines learn it from the file - and a missing one falls
 * back to the fixed ten minutes.
 */
export function introSkipAt(seconds: number, chapters: Chapter[], duration = 0): number | null {
  const marks = ordered(chapters);
  const latest = duration > 0 ? duration * MAX_INTRO_RATIO : MAX_INTRO_START;
  for (let i = 0; i < marks.length; i += 1) {
    const c = marks[i];
    if (!INTRO.test(c.name.trim())) continue;
    if (c.start > latest) continue;

    const end = marks[i + 1]?.start;
    if (end == null || end <= c.start) continue;
    if (seconds >= c.start && seconds < end) return end;
  }
  return null;
}

/**
 * What the player is currently sitting in, when it is something skippable.
 *
 * `to` is a position to seek to, except for the last-chapter credits case,
 * where there is no later mark and the honest answer is "this episode is
 * finished" - which the player already knows how to handle, because that is
 * what it does when the file runs out.
 */
export type SegmentSkip = {
  segment: 'intro' | 'credits';
  to: number | 'end';
};

/**
 * Where to seek to skip the closing credits, or null when they are not playing.
 *
 * Needs the duration for two reasons: to reject a credits mark that sits too
 * early to be real, and because when the credits are the last chapter their end
 * is the end of the file rather than another mark.
 */
export function creditsSkipAt(
  seconds: number,
  chapters: Chapter[],
  duration: number,
): number | 'end' | null {
  if (!Number.isFinite(duration) || duration <= 0) return null;
  const marks = ordered(chapters);

  for (let i = 0; i < marks.length; i += 1) {
    const c = marks[i];
    if (!CREDITS.test(c.name.trim())) continue;
    if (c.start < duration * MIN_CREDITS_RATIO) continue;

    const end = marks[i + 1]?.start ?? duration;
    if (end <= c.start) continue;
    if (seconds < c.start || seconds >= end) continue;

    return marks[i + 1] ? end : 'end';
  }
  return null;
}

/**
 * The one question each engine asks, every render.
 *
 * Both ends of an episode collapse to a single button, because they can never
 * be skippable at the same moment - one is a theme at the top, the other is
 * credits at the bottom.
 */
export function segmentSkipAt(
  seconds: number,
  chapters: Chapter[] | null | undefined,
  duration: number,
): SegmentSkip | null {
  if (!chapters || chapters.length === 0) return null;

  const intro = introSkipAt(seconds, chapters, duration);
  if (intro != null) return { segment: 'intro', to: intro };

  const credits = creditsSkipAt(seconds, chapters, duration);
  if (credits != null) return { segment: 'credits', to: credits };

  return null;
}
