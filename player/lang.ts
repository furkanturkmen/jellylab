/**
 * Language matching for audio and subtitle track selection.
 *
 * The same language reaches us named three different ways: Jellyfin reports an
 * ISO code ('jpn'), VLC reports whatever the container says, and a release
 * group writes a DisplayTitle like 'Japanese - AAC 2.0 - Default'. Pickers
 * therefore match against a set of aliases rather than one exact code.
 */
const ALIASES: Record<string, string[]> = {
  eng: ['eng', 'english', 'en'],
  nld: ['nld', 'nl', 'dut', 'dutch', 'nederlands'],
  tur: ['tur', 'tr', 'turkish', 'türk'],
  ger: ['ger', 'deu', 'de', 'german', 'deutsch'],
  fre: ['fre', 'fra', 'fr', 'french', 'français'],
  spa: ['spa', 'es', 'spanish', 'español'],
  jpn: ['jpn', 'ja', 'jp', 'japanese'],
};

export function languageNeedles(code: string): string[] {
  const c = code.toLowerCase();
  return ALIASES[c] ?? [c];
}

/**
 * Whether a track's label or language code names the given language.
 *
 * Short needles have to match a whole word. A plain substring test lets the
 * two-letter codes fire on unrelated text - 'en' is inside 'French', 'ja' is
 * inside 'Jazz' - which silently selects the wrong track and is very hard to
 * spot afterwards, because the track that got picked looks plausible.
 */
export function matchesLanguage(text: string | undefined, code: string): boolean {
  if (!text || !code) return false;
  const hay = text.toLowerCase();
  const tokens = hay.split(/[^\p{L}]+/u).filter(Boolean);
  return languageNeedles(code).some(n => (n.length <= 3 ? tokens.includes(n) : hay.includes(n)));
}
