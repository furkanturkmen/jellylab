import { creditsSkipAt, introSkipAt, nextChapterAt, previousChapterAt, segmentSkipAt, type Chapter } from '../chapters';

/**
 * Tokyo Ghoul: Jack (OVA), as the server actually returns it, with the ticks
 * divided out: a theme at the top, two body chapters, an ending at 1733s of a
 * 1802s episode.
 */
const ANIME: Chapter[] = [
  { start: 0, name: 'Intro' },
  { start: 90.4, name: 'Part A' },
  { start: 700, name: 'Part B' },
  { start: 1733.1, name: 'ED' },
];

/** The shape that would lose plot if the first chapter were skipped blindly. */
const COLD_OPEN: Chapter[] = [
  { start: 0, name: 'Prologue' },
  { start: 145, name: 'OP' },
  { start: 235, name: 'Part A' },
];

/** Bluray rips name chapters after nothing at all. */
const UNNAMED: Chapter[] = [
  { start: 0, name: 'Chapter 16' },
  { start: 420, name: 'Chapter 17' },
];

describe('nextChapterAt', () => {
  it('finds the start of the following chapter', () => {
    expect(nextChapterAt(30, ANIME)).toBe(90.4);
    expect(nextChapterAt(120, ANIME)).toBe(700);
  });

  it('is null in the last chapter, where there is nowhere to go', () => {
    expect(nextChapterAt(1750, ANIME)).toBeNull();
  });

  it('is null without chapters', () => {
    expect(nextChapterAt(10, [])).toBeNull();
  });

  it('does not offer the mark the player is already sitting on', () => {
    expect(nextChapterAt(90.4, ANIME)).toBe(700);
  });
});

describe('previousChapterAt', () => {
  it('restarts the current chapter once past the window', () => {
    expect(previousChapterAt(200, ANIME)).toBe(90.4);
  });

  it('steps back a chapter when pressed just after one begins', () => {
    expect(previousChapterAt(92, ANIME)).toBe(0);
  });

  it('is null at the very start, with nothing behind it', () => {
    expect(previousChapterAt(1, ANIME)).toBeNull();
  });

  it('is null without chapters', () => {
    expect(previousChapterAt(10, [])).toBeNull();
  });
});

describe('introSkipAt', () => {
  it('offers the end of the theme while the theme plays', () => {
    expect(introSkipAt(0, ANIME)).toBe(90.4);
    expect(introSkipAt(89, ANIME)).toBe(90.4);
  });

  it('goes quiet the moment the theme ends', () => {
    expect(introSkipAt(90.4, ANIME)).toBeNull();
    expect(introSkipAt(400, ANIME)).toBeNull();
  });

  it('never skips a cold open, whatever it is called', () => {
    expect(introSkipAt(10, COLD_OPEN)).toBeNull();
    expect(introSkipAt(10, [{ start: 0, name: 'Recap' }, { start: 60, name: 'Part A' }])).toBeNull();
  });

  it('still finds the theme that follows a cold open', () => {
    expect(introSkipAt(150, COLD_OPEN)).toBe(235);
  });

  it('accepts the numbered themes of shows that change song mid-season', () => {
    const marks = [{ start: 0, name: 'OP2' }, { start: 88, name: 'Part A' }];
    expect(introSkipAt(5, marks)).toBe(88);
  });

  it('ignores names that merely contain a keyword', () => {
    const marks = [{ start: 0, name: 'Preview' }, { start: 30, name: 'Part A' }];
    expect(introSkipAt(5, marks)).toBeNull();
  });

  it('says nothing about chapters no one named usefully', () => {
    expect(introSkipAt(5, UNNAMED)).toBeNull();
  });

  it('distrusts an intro mark past the middle of the episode', () => {
    const marks = [{ start: 0, name: 'Part A' }, { start: 900, name: 'OP' }, { start: 990, name: 'Part B' }];
    expect(introSkipAt(910, marks, 1440)).toBeNull();
  });

  /*
   * Steins;Gate S01E01: the cold open runs to 10:34, which a fixed ten-minute
   * guard rejected - on the one episode in the library that needed it most.
   */
  it('accepts a theme after a very long cold open', () => {
    const marks = [
      { start: 0, name: 'Prologue' },
      { start: 634, name: 'Opening' },
      { start: 723, name: 'Part 2' },
    ];
    expect(introSkipAt(650, marks, 1440)).toBe(723);
  });

  it('falls back to a fixed guard when the duration is not known yet', () => {
    const marks = [{ start: 634, name: 'Opening' }, { start: 723, name: 'Part 2' }];
    expect(introSkipAt(650, marks)).toBeNull();
  });

  it('has nowhere to land when the theme is the last chapter', () => {
    expect(introSkipAt(5, [{ start: 0, name: 'Intro' }])).toBeNull();
  });
});

/** Runtime of the OVA above, in seconds: the ED starts at 96% of it. */
const ANIME_DURATION = 1802.7;

/** The common anime shape: credits, then a teaser for next week. */
const WITH_PREVIEW: Chapter[] = [
  { start: 0, name: 'Intro' },
  { start: 90, name: 'Part A' },
  { start: 1300, name: 'ED' },
  { start: 1390, name: 'Preview' },
];

describe('creditsSkipAt', () => {
  it('seeks past the credits to whatever follows them', () => {
    expect(creditsSkipAt(1310, WITH_PREVIEW, 1440)).toBe(1390);
  });

  it('ends the episode when the credits are the last chapter', () => {
    expect(creditsSkipAt(1740, ANIME, ANIME_DURATION)).toBe('end');
  });

  it('is null before the credits start', () => {
    expect(creditsSkipAt(1200, WITH_PREVIEW, 1440)).toBeNull();
  });

  it('is null inside the preview that follows them', () => {
    expect(creditsSkipAt(1400, WITH_PREVIEW, 1440)).toBeNull();
  });

  it('distrusts a credits mark in the first half', () => {
    const marks = [{ start: 0, name: 'Part A' }, { start: 100, name: 'ED' }, { start: 200, name: 'Part B' }];
    expect(creditsSkipAt(120, marks, 1400)).toBeNull();
  });

  it('leaves the next-episode teaser alone', () => {
    const marks = [{ start: 0, name: 'Part A' }, { start: 1300, name: 'Preview' }];
    expect(creditsSkipAt(1350, marks, 1400)).toBeNull();
  });

  it('is null without a duration to measure against', () => {
    expect(creditsSkipAt(1740, ANIME, 0)).toBeNull();
  });
});

describe('segmentSkipAt', () => {
  it('offers the theme at the top of the episode', () => {
    expect(segmentSkipAt(10, ANIME, ANIME_DURATION)).toEqual({ segment: 'intro', to: 90.4 });
  });

  it('offers the credits at the bottom of it', () => {
    expect(segmentSkipAt(1740, ANIME, ANIME_DURATION)).toEqual({ segment: 'credits', to: 'end' });
  });

  it('offers nothing in between', () => {
    expect(segmentSkipAt(600, ANIME, ANIME_DURATION)).toBeNull();
  });

  it('offers nothing when the file has no chapters', () => {
    expect(segmentSkipAt(600, [], ANIME_DURATION)).toBeNull();
    expect(segmentSkipAt(600, null, ANIME_DURATION)).toBeNull();
  });
});
