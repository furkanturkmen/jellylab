import { audioLanguageKey, languageNeedles, matchesLanguage, preferredAudioIndex } from '../lang';

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
