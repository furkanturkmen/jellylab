/**
 * Overviews as text, not markup.
 *
 * Descriptions reach the app from whoever wrote them - AniDB, TVDB, TMDB, a
 * release group's NFO - and arrive with `<br>` between paragraphs, the odd
 * `<i>`, and HTML entities for anything the writer could not type. 174 of the
 * first 400 items in one real library carry at least one of those.
 *
 * React Native renders none of it: `<br>` shows up as the literal four
 * characters, and `&amp;` as five. So the markup is turned into the thing it
 * stood for, once, here.
 */

/** The entities that actually turn up in scraped descriptions. */
const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
};

function decodeEntities(s: string): string {
  return s
    // Numeric, decimal and hex: &#8212; and &#x2014;
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => codePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => codePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (whole, name) => ENTITIES[name.toLowerCase()] ?? whole);
}

function codePoint(n: number): string {
  // A malformed entity should stay as whatever it was rather than throw.
  return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
}

/**
 * Markup out, paragraphs kept.
 *
 * `<br>` and `<p>` become line breaks because that is what they meant; every
 * other tag is dropped and its contents kept. Runs of blank lines collapse, so
 * a description written with `<br><br><br>` does not open with a hole.
 */
export function plainText(input: string | undefined | null): string {
  if (!input) return '';
  return decodeEntities(
    input
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p\s*>/gi, '\n\n')
      .replace(/<\/?[^>]+>/g, '')
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * The same text on one line, for a row that shows two lines of description.
 *
 * A line break inside `numberOfLines={2}` spends one of the two lines on
 * nothing, so lists want the paragraphs flattened rather than honoured.
 */
export function oneLine(input: string | undefined | null): string {
  return plainText(input).replace(/\s*\n+\s*/g, ' ');
}
