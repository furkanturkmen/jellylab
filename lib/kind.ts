import type { JellyfinItem, JellyseerrSearchResult } from '@/types';

/**
 * What a thing is, in the words this app uses.
 *
 * Neither service has a type for anime. Jellyfin calls Dororo and Better Call
 * Saul both "Series"; TMDB calls them both "tv". True, and useless in a library
 * where most of the shelf is anime - and inconsistent besides, since the same
 * title was reading ANIME on its detail screen and TV in search results.
 *
 * So it is inferred, from whichever evidence the source happens to carry.
 */

export type MediaKind = 'anime' | 'movie' | 'series' | 'episode';

/** TMDB's Animation genre. */
const ANIMATION = 16;

/** The i18n key for a kind, so callers do not build the string themselves. */
export function kindKey(kind: MediaKind): string {
  return `detail.kind.${kind}`;
}

/**
 * A library item. Jellyfin carries the genre list its scrapers wrote, and an
 * anime scraper is the only thing that writes AniList or AniDB ids - either is
 * enough on its own.
 */
export function jellyfinKind(item: JellyfinItem): MediaKind {
  const anime =
    (item.Genres ?? []).some(g => g.toLowerCase() === 'anime') ||
    !!(item.ProviderIds?.AniList || item.ProviderIds?.AniDB);
  if (anime) return 'anime';
  if (item.Type === 'Movie') return 'movie';
  if (item.Type === 'Episode') return 'episode';
  return 'series';
}

/**
 * A search or discovery result. TMDB has no anime flag, so the test is the one
 * every client ends up using: animated, and Japanese in the original.
 *
 * That misses anime dubbed into an English original, and catches Japanese
 * animation nobody would call anime. Both are rare enough that the alternative
 * - a keyword lookup per result - costs more than it fixes.
 */
export function tmdbKind(result: Pick<JellyseerrSearchResult, 'mediaType' | 'genreIds' | 'originalLanguage'>): MediaKind {
  const animated = (result.genreIds ?? []).includes(ANIMATION);
  if (animated && result.originalLanguage === 'ja') return 'anime';
  return result.mediaType === 'movie' ? 'movie' : 'series';
}
