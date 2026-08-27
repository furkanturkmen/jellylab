import { audioLanguageKey, languageNeedles, matchesLanguage, pickSubtitle, preferredAudioIndex, subtitleRank } from '../lang';

/**
 * Track labels are written by whoever released the file, so matching them is
 * guesswork with rules. The rule that matters is the one about short codes:
 * a bare substring test picks the wrong track and the result looks plausible,
 * which is the worst kind of wrong.
 */

describe('matchesLanguage', () => {
  it('matches an ISO code against itself', () => {
    expect(matchesLanguage('jpn', 'jpn')).toBe(true);
    expect(matchesLanguage('eng', 'eng')).toBe(true);
  });

  it('matches the words a release group actually writes', () => {
    expect(matchesLanguage('Japanese - AAC 2.0 - Default', 'jpn')).toBe(true);
    expect(matchesLanguage('English SDH', 'eng')).toBe(true);
    expect(matchesLanguage('Nederlands (Forced)', 'nld')).toBe(true);
    expect(matchesLanguage('Deutsch 5.1', 'ger')).toBe(true);
  });

  it('accepts the alternative three-letter codes for the same language', () => {
    // dut/nld and ger/deu both appear in the wild, from different muxers.
    expect(matchesLanguage('dut', 'nld')).toBe(true);
    expect(matchesLanguage('deu', 'ger')).toBe(true);
    expect(matchesLanguage('fra', 'fre')).toBe(true);
  });

  it('will not let a two-letter code fire inside another word', () => {
    // The bug this rule exists for: 'en' inside "French", 'ja' inside "Jazz".
    expect(matchesLanguage('French', 'eng')).toBe(false);
    expect(matchesLanguage('Jazz commentary', 'jpn')).toBe(false);
    expect(matchesLanguage('Director', 'tur')).toBe(false);
  });

  it('still matches a short code standing as its own word', () => {
    expect(matchesLanguage('Commentary [en]', 'eng')).toBe(true);
    expect(matchesLanguage('Audio - nl', 'nld')).toBe(true);
  });

  it('ignores case and punctuation around the word', () => {
    expect(matchesLanguage('ENGLISH', 'eng')).toBe(true);
    expect(matchesLanguage('Subtitles(Dutch)', 'nld')).toBe(true);
  });

  it('says no when there is nothing to go on', () => {
    expect(matchesLanguage(undefined, 'eng')).toBe(false);
    expect(matchesLanguage('', 'eng')).toBe(false);
    expect(matchesLanguage('English', '')).toBe(false);
  });

  it('falls back to the code itself for a language with no alias list', () => {
    // Swedish, because Korean has an alias list now and this case is about
    // what happens without one.
    expect(languageNeedles('swe')).toEqual(['swe']);
    expect(matchesLanguage('swe', 'swe')).toBe(true);
    expect(matchesLanguage('Swedish', 'swe')).toBe(false);
  });
});

describe('preferredAudioIndex', () => {
  // The shape Jellyfin sends for the release this was written against.
  const streams = [
    { Index: 1, Language: 'eng', DisplayTitle: 'Golumpa@CR - English - AAC - Stereo', IsDefault: true },
    { Index: 2, Language: 'jpn', DisplayTitle: 'Japanese - AAC - Stereo' },
  ];

  it('picks the track in the language asked for', () => {
    expect(preferredAudioIndex(streams, 'jpn')).toBe(2);
    expect(preferredAudioIndex(streams, 'eng')).toBe(1);
  });

  // Saying nothing leaves the server's default alone, which is better than
  // pinning every file to a guess.
  it('says nothing when the language is not there', () => {
    expect(preferredAudioIndex(streams, 'tur')).toBeNull();
  });

  it('says nothing for original, or for a single-track file', () => {
    expect(preferredAudioIndex(streams, 'original')).toBeNull();
    expect(preferredAudioIndex(streams, undefined)).toBeNull();
    expect(preferredAudioIndex([streams[0]], 'jpn')).toBeNull();
  });

  // Some releases label the track and leave Language empty.
  it('falls back to the label when the code is missing', () => {
    const labelled = [
      { Index: 1, DisplayTitle: 'English dub' },
      { Index: 2, DisplayTitle: 'Japanese 2.0' },
    ];
    expect(preferredAudioIndex(labelled, 'jpn')).toBe(2);
  });
});

describe('audioLanguageKey', () => {
  // TMDB says "ja" for Jujutsu Kaisen; the container says "jpn".
  it('turns TMDB two-letter codes into what tracks are labelled with', () => {
    expect(audioLanguageKey('ja')).toBe('jpn');
    expect(audioLanguageKey('fr')).toBe('fre');
    expect(audioLanguageKey('EN')).toBe('eng');
  });

  it('passes a three-letter code through untouched', () => {
    expect(audioLanguageKey('jpn')).toBe('jpn');
  });

  it('has nothing to say about nothing', () => {
    expect(audioLanguageKey(undefined)).toBeNull();
    expect(audioLanguageKey('')).toBeNull();
  });
});

/**
 * A language match alone is not a choice: a release carries several English
 * tracks and the first one listed is often the hearing-impaired one.
 */
describe('subtitleRank', () => {
  it('puts a plain dialogue track first', () => {
    expect(subtitleRank('English')).toBe(0);
    expect(subtitleRank('Dialogue@CR - English - ASS')).toBe(0);
    expect(subtitleRank('English - SUBRIP - External')).toBe(0);
  });

  it('ranks hearing impaired below plain, however it is written', () => {
    expect(subtitleRank('English - Hearing Impaired - SUBRIP - External')).toBe(1);
    expect(subtitleRank('English SDH')).toBe(1);
    expect(subtitleRank('English [CC]')).toBe(1);
    expect(subtitleRank('English (Closed Caption)')).toBe(1);
  });

  it('ranks forced below hearing impaired', () => {
    // Forced carries only what a viewer of the dubbed audio cannot follow, so
    // for someone who asked for subtitles in this language it is nearly empty.
    expect(subtitleRank('Nederlands (Forced)')).toBe(2);
  });

  it('ranks commentary last', () => {
    expect(subtitleRank('Commentary [en]')).toBe(3);
  });

  it('will not let a short marker fire inside another word', () => {
    // The same rule matchesLanguage needs: 'hi' is inside "Higurashi", 'cc'
    // is inside "Occitan", and neither names a hearing-impaired track.
    expect(subtitleRank('Higurashi - English')).toBe(0);
    expect(subtitleRank('Occitan')).toBe(0);
  });

  it('takes the worst marker when a label carries more than one', () => {
    expect(subtitleRank('English SDH (Forced)')).toBe(2);
  });
});

describe('pickSubtitle', () => {
  const subs = [
    { index: 0, label: 'English - Hearing Impaired - SUBRIP - External' },
    { index: 1, label: 'English - SUBRIP - External' },
    { index: 2, label: 'Nederlands' },
  ];

  it('prefers plain dialogue over the hearing-impaired track listed first', () => {
    // The reported case: the server listed HI first and it was taken on sight.
    expect(pickSubtitle(subs, 'eng')?.index).toBe(1);
  });

  it('still returns the hearing-impaired track when it is the only English one', () => {
    expect(pickSubtitle([subs[0], subs[2]], 'eng')?.index).toBe(0);
  });

  it('keeps the order given when nothing separates two tracks', () => {
    const two = [
      { index: 4, label: 'English - SUBRIP' },
      { index: 5, label: 'English - ASS' },
    ];
    expect(pickSubtitle(two, 'eng')?.index).toBe(4);
  });

  it('returns null when no track is in the language', () => {
    expect(pickSubtitle(subs, 'jpn')).toBeNull();
    expect(pickSubtitle([], 'eng')).toBeNull();
  });

  it('never picks for "off" or an empty preference', () => {
    expect(pickSubtitle(subs, 'off')).toBeNull();
    expect(pickSubtitle(subs, '')).toBeNull();
  });

  it('does not cross languages to find a better-ranked track', () => {
    // A plain Dutch track must not win when English was asked for.
    expect(pickSubtitle(subs, 'nld')?.index).toBe(2);
  });
});

/**
 * The real labels from an episode that opened with sign captions instead of
 * dialogue, and had to be corrected by hand every time.
 */
describe('signs and songs tracks', () => {
  const eps = [
    { index: 3, label: 'Signs & Songs@EMBER - English - Default - ASS' },
    { index: 4, label: 'Dialogue@CR - English - ASS' },
  ];

  it('ranks a signs track below plain dialogue', () => {
    expect(subtitleRank('Signs & Songs@EMBER - English - Default - ASS')).toBe(2);
    expect(subtitleRank('Dialogue@CR - English - ASS')).toBe(0);
  });

  it('picks the dialogue even when the signs track is listed first', () => {
    // Both are English and both were plain before, so the tie went to the
    // server's order - which put the signs track first.
    expect(pickSubtitle(eps, 'eng')?.index).toBe(4);
  });

  it('still offers a signs track when it is the only one', () => {
    expect(pickSubtitle([eps[0]], 'eng')?.index).toBe(3);
  });

  it('does not mistake a word containing signs or songs', () => {
    expect(subtitleRank('English - Designs of Fate')).toBe(0);
  });
});
