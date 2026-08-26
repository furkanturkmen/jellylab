import { resolvedTrackLanguage, withLanguage } from '../tracks';

describe('resolvedTrackLanguage', () => {
  it('trusts the file when the file says something', () => {
    expect(resolvedTrackLanguage('jpn', 'tur', 2)).toBe('jpn');
  });

  // The case this exists for: a YTS mp4 whose single audio track is tagged
  // "und", for a film TMDB knows is Turkish.
  it('borrows the title language for the only untagged track', () => {
    expect(resolvedTrackLanguage('und', 'tur', 1)).toBe('tur');
    expect(resolvedTrackLanguage('', 'tur', 1)).toBe('tur');
    expect(resolvedTrackLanguage(undefined, 'tur', 1)).toBe('tur');
  });

  // Two untagged tracks means one is a dub, and naming both after the
  // original would be a confident lie.
  it('will not guess when there is more than one track', () => {
    expect(resolvedTrackLanguage('und', 'tur', 2)).toBeNull();
  });

  it('says nothing when nothing is known', () => {
    expect(resolvedTrackLanguage('und', null, 1)).toBeNull();
    expect(resolvedTrackLanguage('zxx', undefined, 1)).toBeNull();
  });
});

describe('withLanguage', () => {
  it('puts the language in front of a bare label', () => {
    expect(withLanguage('AAC - Stereo', 'Turkish')).toBe('Turkish · AAC - Stereo');
  });

  it('leaves a label that already names it alone', () => {
    expect(withLanguage('Japanese - AAC - Stereo', 'Japanese')).toBe('Japanese - AAC - Stereo');
  });

  it('copes with nothing on either side', () => {
    expect(withLanguage('AAC', null)).toBe('AAC');
    expect(withLanguage('', 'Turkish')).toBe('Turkish');
  });
});

describe('withLanguage on placeholder labels', () => {
  // AVPlayer's own words for a track the file never labelled.
  it('replaces a placeholder rather than decorating it', () => {
    expect(withLanguage('Unknown language', 'Turkish')).toBe('Turkish');
    expect(withLanguage('und', 'Turkish')).toBe('Turkish');
    expect(withLanguage('Track 1', 'Turkish')).toBe('Turkish');
  });

  it('still keeps a label that says something', () => {
    expect(withLanguage('AAC - Stereo', 'Turkish')).toBe('Turkish · AAC - Stereo');
  });
});
