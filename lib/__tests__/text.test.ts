import { oneLine, plainText } from '../text';

/**
 * The cases here are taken from what a real library actually contains: AniDB
 * descriptions separated by <br>, TVDB text with entities, and the occasional
 * italic from a release NFO.
 */

describe('plainText', () => {
  it('turns <br> into a line break', () => {
    expect(plainText('First line.<br>Second line.')).toBe('First line.\nSecond line.');
    expect(plainText('a<br/>b<BR />c')).toBe('a\nb\nc');
  });

  it('drops other tags but keeps what they wrapped', () => {
    expect(plainText('An <i>italic</i> word')).toBe('An italic word');
    expect(plainText('<p>Wrapped</p>')).toBe('Wrapped');
  });

  it('decodes the entities that turn up in scraped text', () => {
    expect(plainText('Tom &amp; Jerry')).toBe('Tom & Jerry');
    expect(plainText('&quot;quoted&quot;')).toBe('"quoted"');
    expect(plainText('caf&#233;')).toBe('café');
    expect(plainText('em&#x2014;dash')).toBe('em—dash');
    expect(plainText('a&nbsp;b')).toBe('a b');
  });

  it('leaves an entity it does not know alone', () => {
    expect(plainText('&weird; thing')).toBe('&weird; thing');
  });

  it('collapses the run of breaks these descriptions love', () => {
    expect(plainText('One<br><br><br>Two')).toBe('One\n\nTwo');
  });

  it('trims, and does not leave trailing spaces before a break', () => {
    expect(plainText('  padded  ')).toBe('padded');
    expect(plainText('line   <br>next')).toBe('line\nnext');
  });

  it('says nothing about nothing', () => {
    expect(plainText(undefined)).toBe('');
    expect(plainText(null)).toBe('');
    expect(plainText('')).toBe('');
  });

  it('handles a real one', () => {
    const anidb =
      'Eren Jaeger lives in Shiganshina.<br><br>One day, the Colossal Titan appears &amp; the wall falls.<br>Humanity retreats.';
    expect(plainText(anidb)).toBe(
      'Eren Jaeger lives in Shiganshina.\n\nOne day, the Colossal Titan appears & the wall falls.\nHumanity retreats.'
    );
  });
});

describe('oneLine', () => {
  it('flattens paragraphs for a two-line row', () => {
    expect(oneLine('One<br><br>Two')).toBe('One Two');
  });

  it('is still plain text underneath', () => {
    expect(oneLine('Tom &amp; <i>Jerry</i>')).toBe('Tom & Jerry');
  });
});
