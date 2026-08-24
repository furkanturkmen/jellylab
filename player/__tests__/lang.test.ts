import { languageNeedles, matchesLanguage } from '../lang';

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
    expect(languageNeedles('kor')).toEqual(['kor']);
    expect(matchesLanguage('kor', 'kor')).toBe(true);
    expect(matchesLanguage('Korean', 'kor')).toBe(false);
  });
});
