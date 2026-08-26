/**
 * What language a track is in, when the file forgot to say.
 *
 * Containers frequently carry no language tag - Jellyfin reports "und", and
 * the picker shows "AAC - Stereo" with no clue what you are listening to. The
 * servers do know: TMDB says what language the title was made in, which
 * Radarr and Jellyseerr both display.
 *
 * So an untagged track can borrow that answer, but only when it is the only
 * track. With two untagged tracks, one of them is a dub and guessing would
 * put the wrong name on it.
 */
const UNKNOWN = new Set(['', 'und', 'unknown', 'undefined', 'zxx', 'mis', 'mul']);

export function resolvedTrackLanguage(
  language: string | undefined | null,
  originalLanguage: string | undefined | null,
  trackCount: number,
): string | null {
  const tagged = (language ?? '').trim().toLowerCase();
  if (tagged && !UNKNOWN.has(tagged)) return tagged;
  if (trackCount === 1 && originalLanguage) return originalLanguage;
  return null;
}

/**
 * The label with the language in front of it, when that adds something.
 *
 * A label that already names the language - "Japanese - AAC - Stereo" - is
 * left alone; repeating it would read as a stutter.
 */
/**
 * What a player says when it has nothing to say.
 *
 * AVPlayer labels an untagged track "Unknown language", and prefixing that
 * produced "Turkish · Unknown language" - which manages to be both right and
 * useless in the same breath.
 */
const PLACEHOLDER = /^(unknown|und|undefined|unknown language|track \d+)$/i;

export function withLanguage(label: string, languageName: string | null): string {
  const text = (label ?? '').trim();
  if (!languageName) return text;
  if (PLACEHOLDER.test(text)) return languageName;
  if (text.toLowerCase().includes(languageName.toLowerCase())) return text;
  return text ? `${languageName} · ${text}` : languageName;
}
