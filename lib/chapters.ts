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
 * An intro that starts more than ten minutes in is not an intro.
 *
 * Cheap guard against a file whose chapters were named by something other than
 * a human - a mid-episode mark called 'OP' would otherwise offer to skip the
 * viewer past the middle of the story.
 */
const MAX_INTRO_START = 600;

/**
 * How far into a chapter the back control stops meaning "the one before".
 *
 * Same behaviour every music player has: press back early and you go to the
 * previous chapter, press it later and you return to the start of this one.
 */
const RESTART_WINDOW = 3;

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
 */
export function introSkipAt(seconds: number, chapters: Chapter[]): number | null {
  const marks = ordered(chapters);
  for (let i = 0; i < marks.length; i += 1) {
    const c = marks[i];
    if (!INTRO.test(c.name.trim())) continue;
    if (c.start > MAX_INTRO_START) continue;

    const end = marks[i + 1]?.start;
    if (end == null || end <= c.start) continue;
    if (seconds >= c.start && seconds < end) return end;
  }
  return null;
}
