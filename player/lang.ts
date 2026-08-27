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

/**
 * How much a subtitle track wants to be the default, lowest first.
 *
 * A language match alone is not a choice. A release routinely carries two or
 * three English tracks, and the picker took whichever the server happened to
 * list first - which on a Jellyfin library is often the hearing-impaired one,
 * so a film opened with `[door creaks]` written across it and no indication
 * that a plain track existed.
 *
 * The order is by how much of the dialogue a track carries, not by taste:
 *
 * 0. plain - the whole dialogue, nothing else
 * 1. hearing impaired / SDH / CC - the whole dialogue plus sound description
 * 2. forced - only the lines a viewer of the dubbed audio cannot follow, so
 *    mostly empty for someone who asked for subtitles in this language
 * 3. commentary - not the dialogue at all
 *
 * Anyone who wants one of the others can still pick it, and that choice is
 * remembered by label. This only decides what happens when nobody has said.
 */
const SUB_PHRASES: [string, number][] = [
  ['hearing impaired', 1],
  ['closed caption', 1],
];
const SUB_TOKENS: [string, number][] = [
  ['sdh', 1],
  ['hi', 1],
  ['cc', 1],
  ['forced', 2],
  ['commentary', 3],
];

export function subtitleRank(label: string | undefined): number {
  if (!label) return 0;
  const hay = label.toLowerCase();
  // Same word-boundary rule as matchesLanguage, and for the same reason: 'hi'
  // and 'cc' are short enough to appear inside unrelated words, and 'Higurashi'
  // is not a hearing-impaired track.
  const tokens = hay.split(/[^\p{L}]+/u).filter(Boolean);
  let rank = 0;
  for (const [phrase, r] of SUB_PHRASES) if (hay.includes(phrase)) rank = Math.max(rank, r);
  for (const [token, r] of SUB_TOKENS) if (tokens.includes(token)) rank = Math.max(rank, r);
  return rank;
}

/**
 * The best subtitle track in a language, or null if none is in it.
 *
 * Ties keep the order the server gave, so a library with one English track
 * behaves exactly as it did before this existed.
 */
export function pickSubtitle<T extends { label: string }>(subs: T[], code: string): T | null {
  if (!code || code === 'off') return null;
  let best: T | null = null;
  let bestRank = Infinity;
  for (const s of subs) {
    if (!matchesLanguage(s.label, code)) continue;
    const rank = subtitleRank(s.label);
    if (rank < bestRank) {
      best = s;
      bestRank = rank;
    }
  }
  return best;
}
