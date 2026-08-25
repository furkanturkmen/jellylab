import axios, { AxiosInstance } from 'axios';
import { Platform } from 'react-native';
import { getJellyseerrUrl, requireJellyfinUrl, requireJellyseerrUrl } from '@/config';
import i18n from '@/i18n';
import { metadataLanguage } from '@/lib/text';
import { loadJellyseerrAuth, saveJellyseerrAuth, clearJellyseerrAuth } from '@/store/auth';
import { logRequestFailure } from '@/lib/errorLog';
import type { JellyseerrAuth, JellyseerrRequest, JellyseerrSearchResult } from '@/types';

/** Whatever the app is showing right now, as a TMDB language code. */
export function currentLanguage(): string {
  return metadataLanguage(i18n.language);
}

async function makeClient(cookie?: string): Promise<AxiosInstance> {
  const client = axios.create({
    // awaited, not read synchronously: the store may still be hydrating
    baseURL: `${await requireJellyseerrUrl()}/api/v1`,
    timeout: 15000,
    // Cookie is a forbidden header name in a browser: the fetch spec has XHR
    // drop it, so the header set below never leaves the page and every call
    // arrives unauthenticated. withCredentials is how a browser is asked to
    // attach its own connect.sid instead.
    //
    // Set only on web, and deliberately absent otherwise rather than false.
    // Axios assigns the flag to the request only when it is defined, and React
    // Native's XMLHttpRequest defaults it to true - which is what lets
    // CFNetwork's cookie jar carry the session on iOS. Passing false there
    // turns the jar off: sign-in succeeds, and every call after it comes back
    // 401 with no cookie sent.
    ...(Platform.OS === 'web' ? { withCredentials: true } : {}),
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });

  // Seerr failures are non-fatal by design - useAuth treats a failed Seerr
  // login as something to carry on past - so without this they are invisible.
  client.interceptors.response.use(
    r => r,
    (e: any) => {
      logRequestFailure('jellyseerr', e);
      throw e;
    }
  );
  return client;
}

/**
 * Seerr's answer when a connect.sid is present but it does not know it.
 *
 * Distinct from 401, which is what a *missing* cookie gets ("cookie
 * 'connect.sid' required"). 403 therefore means a stale session is being sent
 * from somewhere - and on iOS that somewhere can be the native cookie jar
 * rather than anything this app stored, since CFNetwork keeps cookies per
 * bundle id and they survive a reinstall.
 */
function isStaleSession(e: any): boolean {
  return e?.response?.status === 403;
}

/**
 * No Jellyseerr session. Its own class so a screen can tell "you are not signed
 * in" apart from "Jellyseerr did not answer" - the two look identical to a
 * caller otherwise, and they want opposite things said to the user.
 *
 * Signing in is allowed to leave this state behind: useAuth treats a failed
 * Jellyseerr login as non-fatal, so that Jellyfin still works when only Seerr
 * is down. Being signed into Jellyfin is therefore no guarantee of a Seerr
 * session, and callers have to cope with that rather than assume.
 */
export class NotAuthenticatedError extends Error {
  constructor() {
    super('Not signed in to Jellyseerr');
    this.name = 'NotAuthenticatedError';
  }
}

export async function authClient(): Promise<AxiosInstance> {
  const auth = await loadJellyseerrAuth();
  if (!auth) throw new NotAuthenticatedError();
  const client = await makeClient(auth.cookie);

  /**
   * Recover from a stale session rather than sending it forever.
   *
   * A 403 means the connect.sid we sent is one Seerr does not know. If that
   * came from our own stored copy, dropping it is the fix: the next request
   * sends no Cookie header, so iOS attaches whatever the last successful login
   * actually set - which is the session Seerr is expecting. userId and email
   * are kept, so this stays signed in rather than bouncing to the login screen
   * for something a refresh can repair.
   */
  client.interceptors.response.use(
    r => r,
    async (e: any) => {
      if (isStaleSession(e) && auth.cookie) {
        await saveJellyseerrAuth({ ...auth, cookie: '' });
      }
      // 401 is Seerr saying there is no session here at all - the request
      // carried no usable cookie, from our store or from the native jar. That
      // is the state a half-finished sign-in leaves behind: signing in is
      // allowed to fail on the Seerr side without failing the whole login, so
      // the app can sit signed into Jellyfin with a Seerr record that no longer
      // opens anything.
      //
      // Dropping the record turns every later call into NotAuthenticatedError,
      // which the Requests screen already knows how to say out loud - "sign in
      // again" rather than a generic failure the user cannot act on. Nothing is
      // lost: the record was already useless.
      if (e?.response?.status === 401) {
        await clearJellyseerrAuth();
        throw new NotAuthenticatedError();
      }
      throw e;
    }
  );
  return client;
}

/**
 * Sign in to Jellyseerr with Jellyfin credentials.
 *
 * The `hostname` field is the awkward part. Seerr only accepts one while its
 * Jellyfin server is still unconfigured, to bind itself to a media server
 * during first-run setup. Once configured - which is every install after the
 * first login - sending one is an error:
 *
 *   hostname: "http://jellyfin.homelab.internal"  -> 500 Jellyfin hostname already configured
 *   hostname omitted                              -> authenticates normally
 *
 * So it is tried without first, and only retried with a hostname if that fails
 * for a reason other than the credentials being wrong. A 401 means Seerr got as
 * far as checking them, and no hostname would change that.
 */
export async function loginJellyfin(username: string, password: string): Promise<JellyseerrAuth> {
  const client = await makeClient();
  const post = (body: Record<string, unknown>) =>
    client.post('/auth/jellyfin', body, { withCredentials: true });

  let res;
  try {
    res = await post({ username, password });
  } catch (e: any) {
    if (e?.response?.status === 401) throw e;
    // Unconfigured Seerr: it wants to be told which server to bind to.
    res = await post({ username, password, hostname: await requireJellyfinUrl() });
  }
  // iOS does not always expose set-cookie to JS: CFNetwork consumes it into
  // the native jar first. An empty string here is therefore normal, not a
  // failure - but it does mean this app cannot pin the session itself, and has
  // to trust the jar to send the right one.
  const setCookie = res.headers['set-cookie'];
  const cookie = Array.isArray(setCookie)
    ? setCookie.map(c => c.split(';')[0]).join('; ')
    : typeof setCookie === 'string'
      ? (setCookie as string).split(';')[0]
      : '';
  const auth: JellyseerrAuth = {
    cookie,
    userId: res.data.id,
    email: res.data.email,
  };
  await saveJellyseerrAuth(auth);
  return auth;
}

export async function logout(): Promise<void> {
  try {
    const client = await authClient();
    await client.post('/auth/logout');
  } catch {}
  await clearJellyseerrAuth();
}

export async function search(query: string, page = 1): Promise<JellyseerrSearchResult[]> {
  const client = await authClient();
  // Search text follows the app; the matching does not care - TMDB looks at
  // every title it holds in every language either way.
  const res = await client.get('/search', { params: { query, page, language: currentLanguage() } });
  return res.data.results ?? [];
}

/**
 * Language is stated per call rather than defaulted on the client, because the
 * three kinds of request want three different things: text you read follows
 * the app, browse rows ask in English, and the anime row asks for nothing.
 *
 * Browse rows ask in English, deliberately.
 *
 * TMDB does not merely translate a discovery list - it weights popularity by
 * language, so asking in Dutch returns Dutch television: Goede Tijden, De
 * Fabeltjeskrant, RTL Tonight, in place of Reacher and Silo. These rows exist
 * to show what is worth requesting, which is a global question.
 *
 * Search is unaffected either way: TMDB matches a query against every title it
 * holds in every language, so an English name is found whatever the app is set
 * to. Only these unprompted lists change.
 */
const DISCOVER_PARAMS = { language: 'en' };

export async function discoverTrending(page = 1): Promise<JellyseerrSearchResult[]> {
  const client = await authClient();
  const res = await client.get('/discover/trending', { params: { page, ...DISCOVER_PARAMS } });
  return (res.data.results ?? []).filter((r: any) => r.mediaType !== 'person');
}

export async function discoverMovies(page = 1): Promise<JellyseerrSearchResult[]> {
  const client = await authClient();
  const res = await client.get('/discover/movies', { params: { page, ...DISCOVER_PARAMS } });
  return res.data.results ?? [];
}

export async function discoverTv(page = 1): Promise<JellyseerrSearchResult[]> {
  const client = await authClient();
  const res = await client.get('/discover/tv', { params: { page, ...DISCOVER_PARAMS } });
  return res.data.results ?? [];
}

// Anime keyword id on TMDB = 210024
/**
 * The anime row asks for no language at all, unlike the rows above it.
 *
 * Asking in English reranks this keyword toward internationally known titles -
 * Lazarus, Devil May Cry, Star Wars: Visions - which is a narrower and more
 * western list than the row is meant to be. Asking in Dutch returns nothing:
 * TMDB has no Dutch-language titles carrying the keyword.
 *
 * Raw popularity brings ecchi with it, since that is genuinely what is popular
 * by this measure. Hiding it belongs in an explicit 18+ filter rather than in
 * a language parameter that removes it as a side effect - see docs/downloads.md
 * for how the last "we will filter this later" went, which is to say: this is
 * the honest list until the filter exists.
 */
export async function discoverAnime(page = 1): Promise<JellyseerrSearchResult[]> {
  const client = await authClient();
  const res = await client.get('/discover/tv', { params: { page, keywords: 210024 } });
  return res.data.results ?? [];
}

export async function discoverUpcomingMovies(page = 1): Promise<JellyseerrSearchResult[]> {
  const client = await authClient();
  const res = await client.get('/discover/movies/upcoming', { params: { page, ...DISCOVER_PARAMS } });
  return res.data.results ?? [];
}

export async function createRequest(
  mediaType: 'movie' | 'tv',
  mediaId: number,
  seasons?: number[] | 'all'
): Promise<void> {
  const client = await authClient();
  await client.post('/request', {
    mediaType,
    mediaId,
    ...(mediaType === 'tv' ? { seasons: seasons ?? 'all' } : {}),
  });
}

/** Seerr's media status values, as returned per season and per title. */
export const SEERR_STATUS = {
  UNKNOWN: 1,
  PENDING: 2,
  PROCESSING: 3,
  PARTIALLY_AVAILABLE: 4,
  AVAILABLE: 5,
} as const;

export type SeerrSeason = {
  seasonNumber: number;
  name?: string;
  episodeCount: number;
  /** UNKNOWN when Seerr is not tracking the season at all */
  status: number;
};

/**
 * Seasons with the status Seerr currently holds for each.
 *
 * Specials (season 0) are dropped: they are rarely what anyone means by "the
 * next season", and requesting them alongside real seasons muddies the picker.
 */
export async function getTvSeasons(tmdbId: number): Promise<SeerrSeason[]> {
  const client = await authClient();
  const res = await client.get(`/tv/${tmdbId}`);
  const statuses = new Map<number, number>(
    ((res.data?.mediaInfo?.seasons ?? []) as any[]).map(s => [s.seasonNumber, s.status])
  );
  return ((res.data?.seasons ?? []) as any[])
    .filter(s => (s?.seasonNumber ?? 0) > 0)
    .map(s => ({
      seasonNumber: s.seasonNumber,
      name: s.name,
      episodeCount: s.episodeCount ?? 0,
      status: statuses.get(s.seasonNumber) ?? SEERR_STATUS.UNKNOWN,
    }));
}

/**
 * A season can be asked for when Seerr is not already handling it and it has
 * episodes. Zero episodes means announced but unaired — Seerr accepts the
 * request and then has nothing to search for.
 */
export function isSeasonRequestable(s: SeerrSeason): boolean {
  return s.episodeCount > 0 && (s.status === SEERR_STATUS.UNKNOWN || s.status === SEERR_STATUS.PARTIALLY_AVAILABLE);
}

/**
 * Earliest digital release across all countries, or null if TMDB has none.
 *
 * This is the date Radarr waits for when Minimum Availability is "Released" —
 * a film can be months into its cinema run with nothing to find, which looks
 * from the app like an approved request that silently does nothing.
 */
export function digitalReleaseDate(d: TmdbFullDetails): Date | null {
  const dates = (d.releases?.results ?? [])
    .flatMap(r => r.release_dates ?? [])
    .filter(r => r.type === 4 && r.release_date)
    .map(r => new Date(r.release_date as string))
    .filter(dt => !Number.isNaN(dt.getTime()));
  if (dates.length === 0) return null;
  return new Date(Math.min(...dates.map(dt => dt.getTime())));
}

export function seasonStatusLabel(s: SeerrSeason): string {
  if (s.episodeCount === 0) return 'Not aired';
  switch (s.status) {
    case SEERR_STATUS.AVAILABLE: return 'Available';
    case SEERR_STATUS.PARTIALLY_AVAILABLE: return 'Partly available';
    case SEERR_STATUS.PROCESSING: return 'Downloading';
    case SEERR_STATUS.PENDING: return 'Requested';
    default: return `${s.episodeCount} episodes`;
  }
}

/**
 * Cached for the life of the process: season artwork does not change, and the
 * requests screen re-polls every few seconds while a download is running.
 * Only successful lookups are stored, so a dropped connection retries rather
 * than leaving a card permanently art-less.
 */
const seasonArtCache = new Map<string, string | null>();

/**
 * A still from one season, used to tell one season's request card apart from
 * another's when the same series is requested more than once.
 *
 * Seasons have no artwork of their own anywhere in the chain: Seerr returns an
 * empty posterPath on /tv/{id}, omits the field entirely on the season
 * endpoint, and Sonarr carries images at series level only. Episode stills are
 * the only per-season art that exists — and being 16:9 they suit a card
 * background better than a poster would anyway.
 */
export type LocalisedEpisode = { name?: string; overview?: string };

const seasonEpisodeCache = new Map<string, Map<number, LocalisedEpisode>>();

/**
 * Episode titles and descriptions in one language, keyed by episode number.
 *
 * The server holds whatever its library was scraped in - an anime library set
 * to Japanese hands back 両面宿儺 and a Japanese synopsis - and that is a
 * server-wide setting, not something a client can ask to vary. TMDB will vary
 * it per request, and Jellyseerr passes the parameter through.
 *
 * Empty strings are dropped rather than stored: TMDB answers a missing
 * translation with an empty overview, and an empty string would otherwise
 * replace text the server did have.
 */
export async function getSeasonEpisodes(
  tmdbId: number,
  seasonNumber: number,
  language: string = currentLanguage(),
): Promise<Map<number, LocalisedEpisode>> {
  const key = `${tmdbId}:${seasonNumber}:${language}`;
  const cached = seasonEpisodeCache.get(key);
  if (cached) return cached;

  const byNumber = new Map<number, LocalisedEpisode>();
  try {
    const client = await authClient();
    const res = await client.get(`/tv/${tmdbId}/season/${seasonNumber}`, { params: { language } });
    for (const e of (res.data?.episodes ?? []) as any[]) {
      const number = e?.episodeNumber ?? e?.episode_number;
      if (typeof number !== 'number') continue;
      const name = typeof e?.name === 'string' && e.name.trim() ? e.name : undefined;
      const overview = typeof e?.overview === 'string' && e.overview.trim() ? e.overview : undefined;
      if (name || overview) byNumber.set(number, { name, overview });
    }
  } catch {
    // No Seerr session, no TMDB id, no network: the screen keeps the server's
    // own text, which is what it showed before this existed.
  }
  seasonEpisodeCache.set(key, byNumber);
  return byNumber;
}

export async function getSeasonArt(tmdbId: number, seasonNumber: number): Promise<string | null> {
  const key = `${tmdbId}:${seasonNumber}`;
  const cached = seasonArtCache.get(key);
  if (cached !== undefined) return cached;

  try {
    const client = await authClient();
    const res = await client.get(`/tv/${tmdbId}/season/${seasonNumber}`);
    const still = ((res.data?.episodes ?? []) as any[])
      .map(e => e?.stillPath ?? e?.still_path)
      .find(p => typeof p === 'string' && p.length > 0);
    // Seerr hands back an absolute URL when the metadata came from TVDB, and a
    // bare TMDB path when it came from TMDB.
    const art = still ? (still.startsWith('http') ? still : `https://image.tmdb.org/t/p/w780${still}`) : null;
    seasonArtCache.set(key, art);
    return art;
  } catch {
    return null;
  }
}

export async function listRequests(filter: 'all' | 'pending' | 'approved' | 'available' = 'all'): Promise<JellyseerrRequest[]> {
  const client = await authClient();
  const res = await client.get('/request', { params: { filter, take: 50 } });
  return res.data.results ?? [];
}

export async function deleteRequest(requestId: number): Promise<void> {
  const client = await authClient();
  await client.delete(`/request/${requestId}`);
}

export async function deleteMedia(mediaId: number): Promise<void> {
  const client = await authClient();
  await client.delete(`/media/${mediaId}`);
}

export async function removeMediaFile(mediaId: number): Promise<void> {
  const client = await authClient();
  await client.delete(`/media/${mediaId}/file`);
}

export type MediaDetails = {
  title: string;
  posterPath?: string;
  backdropPath?: string;
  year?: string;
  overview?: string;
};

/**
 * Details are immutable enough for a session: artwork and overviews do not
 * change while the app is open, and the library hero asks for the same handful
 * of titles on every refresh.
 */
const detailsCache = new Map<string, MediaDetails | null>();

export async function getMediaDetails(
  mediaType: 'movie' | 'tv',
  tmdbId: number,
  language: string = currentLanguage(),
): Promise<MediaDetails | null> {
  // Language is part of the key: without it, switching the app to Dutch would
  // be served the English copy that was cached on the previous screen.
  const cacheKey = `${mediaType}:${tmdbId}:${language}`;
  const cached = detailsCache.get(cacheKey);
  if (cached !== undefined) return cached;
  try {
    const client = await authClient();
    const res = await client.get(`/${mediaType}/${tmdbId}`, { params: { language } });
    const d = res.data;
    const details: MediaDetails = {
      title: d.title ?? d.name ?? '',
      posterPath: d.posterPath ?? d.poster_path,
      backdropPath: d.backdropPath ?? d.backdrop_path,
      year: (d.releaseDate ?? d.firstAirDate ?? '').slice(0, 4) || undefined,
      overview: d.overview,
    };
    detailsCache.set(cacheKey, details);
    return details;
  } catch {
    return null;
  }
}

export function backdropUrl(path?: string, size: 'w780' | 'w1280' = 'w780'): string | null {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

export type TmdbFullDetails = {
  id: number;
  title: string;
  tagline?: string;
  overview?: string;
  posterPath?: string;
  backdropPath?: string;
  releaseDate?: string;
  runtime?: number;
  genres?: { id: number; name: string }[];
  voteAverage?: number;
  status?: string;
  originalLanguage?: string;
  productionCountries?: { iso_3166_1: string; name: string }[];
  numberOfSeasons?: number;
  numberOfEpisodes?: number;
  seasons?: { seasonNumber: number; episodeCount: number; name?: string }[];
  /** TMDB per-country release dates; type 4 is the digital release */
  releases?: {
    results?: {
      iso_3166_1?: string;
      release_dates?: { release_date?: string; type?: number }[];
    }[];
  };
  mediaInfo?: {
    id?: number;
    status?: number;
    jellyfinMediaId?: string;
    jellyfinMediaId4k?: string;
    requests?: { id: number; status: number }[];
    downloadStatus?: DownloadStatus[];
    downloadStatus4k?: DownloadStatus[];
  };
  credits?: {
    cast?: { id: number; name: string; character: string; profilePath?: string }[];
    crew?: { id: number; name: string; job: string; department: string }[];
  };
};

export type DownloadStatus = {
  externalId?: string;
  mediaType?: string;
  downloadId?: string;
  title?: string;
  status?: string;
  size?: number;
  sizeLeft?: number;
  timeLeft?: string;
  estimatedCompletionTime?: string;
  episode?: { seasonNumber: number; episodeNumber: number };
};

export async function getTmdbDetails(mediaType: 'movie' | 'tv', tmdbId: number): Promise<TmdbFullDetails | null> {
  try {
    const client = await authClient();
    const res = await client.get(`/${mediaType}/${tmdbId}`);
    const d = res.data;
    return {
      id: d.id,
      title: d.title ?? d.name ?? '',
      tagline: d.tagline,
      overview: d.overview,
      posterPath: d.posterPath ?? d.poster_path,
      backdropPath: d.backdropPath ?? d.backdrop_path,
      releaseDate: d.releaseDate ?? d.firstAirDate,
      runtime: d.runtime ?? (Array.isArray(d.episodeRunTime) ? d.episodeRunTime[0] : undefined),
      genres: d.genres,
      voteAverage: d.voteAverage,
      status: d.status,
      originalLanguage: d.originalLanguage,
      productionCountries: d.productionCountries,
      numberOfSeasons: d.numberOfSeasons,
      numberOfEpisodes: d.numberOfEpisodes,
      seasons: d.seasons,
      mediaInfo: d.mediaInfo,
      credits: d.credits,
    };
  } catch {
    return null;
  }
}

export function posterUrl(path?: string, size: 'w300' | 'w500' = 'w300'): string | null {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}
