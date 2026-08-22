import axios, { AxiosInstance } from 'axios';
import { CONFIG } from '@/config';
import { loadJellyseerrAuth, saveJellyseerrAuth, clearJellyseerrAuth } from '@/store/auth';
import type { JellyseerrAuth, JellyseerrRequest, JellyseerrSearchResult } from '@/types';

function makeClient(cookie?: string): AxiosInstance {
  return axios.create({
    baseURL: `${CONFIG.JELLYSEERR_URL}/api/v1`,
    timeout: 15000,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
}

export async function authClient(): Promise<AxiosInstance> {
  const auth = await loadJellyseerrAuth();
  if (!auth) throw new Error('Not authenticated');
  return makeClient(auth.cookie);
}

export async function loginJellyfin(username: string, password: string): Promise<JellyseerrAuth> {
  // Jellyseerr supports Jellyfin auth passthrough via /auth/jellyfin
  const client = makeClient();
  const res = await client.post('/auth/jellyfin', { username, password }, {
    withCredentials: true,
  });
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

export async function listRequests(filter: 'all' | 'pending' | 'approved' | 'available' = 'all'): Promise<JellyseerrRequest[]> {
  const client = await authClient();
  const res = await client.get('/request', { params: { filter, take: 50 } });
  return res.data.results ?? [];
}

export type MediaDetails = {
  title: string;
  posterPath?: string;
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
      year: (d.releaseDate ?? d.firstAirDate ?? '').slice(0, 4) || undefined,
      overview: d.overview,
    };
  } catch {
    return null;
  }
}

export function posterUrl(path?: string, size: 'w300' | 'w500' = 'w300'): string | null {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}
