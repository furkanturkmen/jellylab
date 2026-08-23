import axios, { AxiosInstance } from 'axios';
import { getJellyseerrUrl, requireJellyfinUrl, requireJellyseerrUrl } from '@/config';
import { loadJellyseerrAuth, saveJellyseerrAuth, clearJellyseerrAuth } from '@/store/auth';
import type { JellyseerrAuth, JellyseerrRequest, JellyseerrSearchResult } from '@/types';

async function makeClient(cookie?: string): Promise<AxiosInstance> {
  return axios.create({
    // awaited, not read synchronously: the store may still be hydrating
    baseURL: `${await requireJellyseerrUrl()}/api/v1`,
    timeout: 15000,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
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
  return makeClient(auth.cookie);
}

export async function loginJellyfin(username: string, password: string): Promise<JellyseerrAuth> {
  // Seerr/Jellyseerr auth passthrough. Seerr v3+ requires the Jellyfin hostname
  // in the body so it can bind the session to the right media server.
  const client = await makeClient();
  // awaited, not the sync getter: this runs during sign-in, which is exactly
  // when the server store may still be hydrating. An empty hostname here makes
  // Seerr reject the login for a reason that looks nothing like the cause.
  const hostname = await requireJellyfinUrl();
  const res = await client.post(
    '/auth/jellyfin',
    { username, password, hostname },
    { withCredentials: true },
  );
  const setCookie = res.headers['set-cookie'];
  const cookie = Array.isArray(setCookie) ? setCookie.map(c => c.split(';')[0]).join('; ') : '';
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
  const res = await client.get('/search', { params: { query, page } });
  return res.data.results ?? [];
}

export async function discoverTrending(page = 1): Promise<JellyseerrSearchResult[]> {
  const client = await authClient();
  const res = await client.get('/discover/trending', { params: { page } });
  return (res.data.results ?? []).filter((r: any) => r.mediaType !== 'person');
}

export async function discoverMovies(page = 1): Promise<JellyseerrSearchResult[]> {
  const client = await authClient();
  const res = await client.get('/discover/movies', { params: { page } });
  return res.data.results ?? [];
}

export async function discoverTv(page = 1): Promise<JellyseerrSearchResult[]> {
  const client = await authClient();
  const res = await client.get('/discover/tv', { params: { page } });
  return res.data.results ?? [];
}

// Anime keyword id on TMDB = 210024
export async function discoverAnime(page = 1): Promise<JellyseerrSearchResult[]> {
  const client = await authClient();
  const res = await client.get('/discover/tv', { params: { page, keywords: 210024 } });
  return res.data.results ?? [];
}

export async function discoverUpcomingMovies(page = 1): Promise<JellyseerrSearchResult[]> {
  const client = await authClient();
  const res = await client.get('/discover/movies/upcoming', { params: { page } });
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

export async function getMediaDetails(mediaType: 'movie' | 'tv', tmdbId: number): Promise<MediaDetails | null> {
  try {
    const client = await authClient();
    const res = await client.get(`/${mediaType}/${tmdbId}`);
    const d = res.data;
    return {
      title: d.title ?? d.name ?? '',
      posterPath: d.posterPath ?? d.poster_path,
      backdropPath: d.backdropPath ?? d.backdrop_path,
      year: (d.releaseDate ?? d.firstAirDate ?? '').slice(0, 4) || undefined,
      overview: d.overview,
    };
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
