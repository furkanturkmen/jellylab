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
  kor: ['kor', 'ko', 'korean'],
  chi: ['chi', 'zho', 'zh', 'chinese', 'mandarin', 'cantonese'],
  ita: ['ita', 'it', 'italian', 'italiano'],
  por: ['por', 'pt', 'portuguese'],
  rus: ['rus', 'ru', 'russian'],
};

/**
 * TMDB names a language with two letters, containers and Jellyfin with three.
 *
 * This is the bridge, and it is deliberately short: the languages an audio
 * track is likely to be in, not every code that exists. An unknown code is
 * passed through, since a three-letter code is already what the matcher wants
 * and a wrong guess is worse than none.
 */
const ISO_639_1: Record<string, string> = {
  ja: 'jpn', en: 'eng', nl: 'nld', tr: 'tur', de: 'ger', fr: 'fre', es: 'spa',
  ko: 'kor', zh: 'chi', it: 'ita', pt: 'por', ru: 'rus',
};

export function audioLanguageKey(code: string | undefined | null): string | null {
  if (!code) return null;
  const c = code.toLowerCase().trim();
  if (!c) return null;
  return ISO_639_1[c] ?? c;
}

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

/** The pieces of a MediaStream this needs; anything else is the caller's. */
type AudioStream = { Index?: number; Language?: string; DisplayTitle?: string; IsDefault?: boolean };

/**
 * Which audio stream the server should send when it transcodes.
 *
 * Direct play hands every track to the player and the picker sorts it out.
 * A transcode does not: Jellyfin re-encodes one stream and the player sees a
 * file with a single audio track, so the choice has to be made in the request.
 * Without one the server sends the container's default - on these anime
 * releases, the English dub, with no way to change it from inside the player.
 *
 * Returns null when there is nothing to say, which leaves the server's own
 * default alone rather than pinning it to a guess.
 */
export function preferredAudioIndex(streams: AudioStream[], code: string | undefined): number | null {
  if (!code || code === 'original') return null;

  const audio = streams.filter(s => typeof s.Index === 'number');
  if (audio.length < 2) return null;

  const match = audio.find(s => matchesLanguage(s.Language, code))
    ?? audio.find(s => matchesLanguage(s.DisplayTitle, code));
  return match?.Index ?? null;
}
