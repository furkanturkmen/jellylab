import axios, { AxiosInstance } from 'axios';
import { CONFIG, getJellyfinUrl, requireJellyfinUrl } from '@/config';
import { getDeviceId, loadJellyfinAuth, saveJellyfinAuth, clearJellyfinAuth } from '@/store/auth';
import { logRequestFailure } from '@/lib/errorLog';
import type { JellyfinAuth, JellyfinItem, JellyfinView } from '@/types';

async function authHeader(token?: string): Promise<string> {
  const deviceId = await getDeviceId();
  const parts = [
    `MediaBrowser Client="${CONFIG.CLIENT_NAME}"`,
    `Device="${CONFIG.DEVICE_NAME}"`,
    `DeviceId="${deviceId}"`,
    `Version="${CONFIG.CLIENT_VERSION}"`,
  ];
  if (token) parts.push(`Token="${token}"`);
  return parts.join(', ');
}

async function makeClient(token?: string): Promise<AxiosInstance> {
  const baseURL = await requireJellyfinUrl();
  const client = axios.create({
    // awaited, not read synchronously: the store may still be hydrating
    baseURL,
    timeout: 15000,
    headers: {
      'X-Emby-Authorization': await authHeader(token),
      'Content-Type': 'application/json',
    },
  });

  /**
   * Say which address failed.
   *
   * A request that never reaches a server surfaces as the bare string "Network
   * Error", with no indication of what it tried to reach - which is useless
   * when the likely causes are a wrong server URL, DNS, and the server being
   * down, and they are told apart entirely by the address.
   */
  client.interceptors.response.use(
    r => r,
    (e: any) => {
      if (!e?.response) {
        const path = e?.config?.url ?? '';
        e.message = `${e.message || 'Request failed'} — could not reach ${baseURL}${path}`;
      }
      // Logged here rather than at the call sites: most callers catch and fall
      // back to an empty list, so this is the last point at which the failure
      // still exists.
      logRequestFailure('jellyfin', e);
      throw e;
    }
  );
  return client;
}

export async function authClient(): Promise<AxiosInstance> {
  const auth = await loadJellyfinAuth();
  if (!auth) throw new Error('Not authenticated');
  return makeClient(auth.accessToken);
}

export async function login(username: string, password: string): Promise<JellyfinAuth> {
  const client = await makeClient();
  const res = await client.post('/Users/AuthenticateByName', {
    Username: username,
    Pw: password,
  });
  const auth: JellyfinAuth = {
    serverId: res.data.ServerId,
    userId: res.data.User.Id,
    accessToken: res.data.AccessToken,
    userName: res.data.User.Name,
    isAdmin: !!res.data.User?.Policy?.IsAdministrator,
    primaryImageTag: res.data.User?.PrimaryImageTag,
  };
  await saveJellyfinAuth(auth);
  return auth;
}

export async function getCurrentUser(userId: string): Promise<any> {
  const client = await authClient();
  const res = await client.get(`/Users/${userId}`);
  return res.data;
}

export async function updateUserName(userId: string, name: string): Promise<void> {
  const client = await authClient();
  const current = await client.get(`/Users/${userId}`);
  const body = { ...current.data, Name: name };
  await client.post(`/Users/${userId}`, body);
}

export async function updatePassword(userId: string, currentPw: string, newPw: string): Promise<void> {
  const client = await authClient();
  await client.post(`/Users/${userId}/Password`, {
    CurrentPw: currentPw,
    NewPw: newPw,
  });
}

export async function uploadProfileImage(userId: string, base64: string, mimeType: string): Promise<void> {
  const auth = await loadJellyfinAuth();
  if (!auth) throw new Error('Not authenticated');
  const authHeader = await (async () => {
    const deviceId = await getDeviceId();
    return [
      `MediaBrowser Client="${CONFIG.CLIENT_NAME}"`,
      `Device="${CONFIG.DEVICE_NAME}"`,
      `DeviceId="${deviceId}"`,
      `Version="${CONFIG.CLIENT_VERSION}"`,
      `Token="${auth.accessToken}"`,
    ].join(', ');
  })();

  const url = `${getJellyfinUrl()}/Users/${userId}/Images/Primary`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': mimeType,
      'X-Emby-Authorization': authHeader,
    },
    body: base64,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Upload failed: ${res.status} ${text || res.statusText}`);
  }
}

export async function deleteProfileImage(userId: string): Promise<void> {
  const client = await authClient();
  await client.delete(`/Users/${userId}/Images/Primary`);
}

export function userImageUrl(userId: string, tag?: string, size = 96): string {
  const tagParam = tag ? `&tag=${tag}` : '';
  return `${getJellyfinUrl()}/Users/${userId}/Images/Primary?maxWidth=${size}&maxHeight=${size}${tagParam}`;
}

export async function logout(): Promise<void> {
  try {
    const client = await authClient();
    await client.post('/Sessions/Logout');
  } catch {}
  await clearJellyfinAuth();
}

export async function getViews(userId: string): Promise<JellyfinView[]> {
  const client = await authClient();
  const res = await client.get(`/Users/${userId}/Views`);
  return res.data.Items ?? [];
}

export async function getItems(userId: string, parentId?: string, limit = 100): Promise<JellyfinItem[]> {
  const client = await authClient();
  const res = await client.get(`/Users/${userId}/Items`, {
    params: {
      ParentId: parentId,
      Limit: limit,
      Recursive: parentId ? true : undefined,
      SortBy: 'SortName',
      SortOrder: 'Ascending',
      Fields: 'Overview,PrimaryImageAspectRatio',
      IncludeItemTypes: parentId ? 'Movie,Series' : undefined,
    },
  });
  return res.data.Items ?? [];
}

export async function getItem(userId: string, itemId: string): Promise<JellyfinItem> {
  const client = await authClient();
  const res = await client.get(`/Users/${userId}/Items/${itemId}`);
  return res.data;
}

/** Full-text search across the user's own libraries. */
export async function searchLibrary(userId: string, term: string, limit = 24): Promise<JellyfinItem[]> {
  const client = await authClient();
  const res = await client.get(`/Users/${userId}/Items`, {
    params: {
      SearchTerm: term,
      Recursive: true,
      IncludeItemTypes: 'Movie,Series',
      Limit: limit,
      SortBy: 'SortName',
      SortOrder: 'Ascending',
      Fields: 'Overview,PrimaryImageAspectRatio,ProductionYear',
    },
  });
  return res.data.Items ?? [];
}

export type MediaStream = {
  Type: 'Video' | 'Audio' | 'Subtitle';
  Codec?: string;
  Profile?: string;
  Index?: number;
  Language?: string;
  DisplayTitle?: string;
  IsExternal?: boolean;
  IsDefault?: boolean;
  IsForced?: boolean;
};

export type MediaSource = {
  Id: string;
  Container?: string;
  MediaStreams?: MediaStream[];
  /** total bits per second, as reported by Jellyfin */
  Bitrate?: number;
};

export async function getPlaybackInfo(userId: string, itemId: string): Promise<MediaSource[]> {
  const client = await authClient();
  const res = await client.get(`/Items/${itemId}/PlaybackInfo`, { params: { UserId: userId } });
  return res.data.MediaSources ?? [];
}

export async function getSeasons(userId: string, seriesId: string): Promise<JellyfinItem[]> {
  const client = await authClient();
  const res = await client.get(`/Shows/${seriesId}/Seasons`, {
    params: { userId, Fields: 'PrimaryImageAspectRatio' },
  });
  return res.data.Items ?? [];
}

export async function getEpisodes(userId: string, seriesId: string, seasonId: string): Promise<JellyfinItem[]> {
  const client = await authClient();
  const res = await client.get(`/Shows/${seriesId}/Episodes`, {
    params: {
      userId,
      seasonId,
      Fields: 'Overview,PrimaryImageAspectRatio,MediaSources',
    },
  });
  return res.data.Items ?? [];
}

export async function getResumeItems(userId: string, limit = 12): Promise<JellyfinItem[]> {
  const client = await authClient();
  const res = await client.get(`/Users/${userId}/Items/Resume`, {
    params: {
      Limit: limit,
      MediaTypes: 'Video',
      Fields: 'PrimaryImageAspectRatio,Overview,BackdropImageTags',
    },
  });
  return res.data.Items ?? [];
}

export async function getLatestItems(userId: string, parentId: string, limit = 12): Promise<JellyfinItem[]> {
  const client = await authClient();
  const res = await client.get(`/Users/${userId}/Items/Latest`, {
    params: {
      ParentId: parentId,
      Limit: limit,
      Fields: 'Overview,BackdropImageTags',
    },
  });
  return res.data ?? [];
}

export function imageUrl(itemId: string, tag?: string, type: 'Primary' | 'Backdrop' = 'Primary', maxWidth = 400): string {
  const tagParam = tag ? `&tag=${tag}` : '';
  return `${getJellyfinUrl()}/Items/${itemId}/Images/${type}?maxWidth=${maxWidth}${tagParam}`;
}

export type PlayMethod = 'DirectPlay' | 'Transcode';

export async function reportPlaybackStart(
  itemId: string,
  positionTicks = 0,
  playMethod: PlayMethod = 'DirectPlay',
): Promise<void> {
  const client = await authClient();
  await client.post('/Sessions/Playing', {
    ItemId: itemId,
    PositionTicks: positionTicks,
    PlayMethod: playMethod,
    CanSeek: true,
  });
}

export async function reportPlaybackProgress(
  itemId: string,
  positionTicks: number,
  isPaused: boolean,
  playMethod: PlayMethod = 'DirectPlay',
): Promise<void> {
  const client = await authClient();
  await client.post('/Sessions/Playing/Progress', {
    ItemId: itemId,
    PositionTicks: positionTicks,
    IsPaused: isPaused,
    PlayMethod: playMethod,
    CanSeek: true,
    EventName: 'timeupdate',
  });
}

export async function reportPlaybackStopped(
  itemId: string,
  positionTicks: number,
  playMethod: PlayMethod = 'DirectPlay',
): Promise<void> {
  const client = await authClient();
  await client.post('/Sessions/Playing/Stopped', {
    ItemId: itemId,
    PositionTicks: positionTicks,
    PlayMethod: playMethod,
  });
}

export function secondsToTicks(seconds: number): number {
  return Math.round(seconds * 10_000_000);
}

export function ticksToSeconds(ticks: number): number {
  return ticks / 10_000_000;
}

export function subtitleUrl(
  itemId: string,
  mediaSourceId: string,
  streamIndex: number,
  token: string,
  format: 'vtt' | 'srt' = 'vtt',
): string {
  return `${getJellyfinUrl()}/Videos/${itemId}/${mediaSourceId}/Subtitles/${streamIndex}/0/Stream.${format}?api_key=${token}`;
}

export async function fetchSubtitleVtt(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Subtitle fetch failed: ${res.status}`);
  return res.text();
}

export function streamUrl(itemId: string, token: string, deviceId: string): string {
  const params = new URLSearchParams({
    static: 'true',
    api_key: token,
    DeviceId: deviceId,
  });
  return `${getJellyfinUrl()}/Videos/${itemId}/stream?${params.toString()}`;
}

/**
 * HLS stream the server transcodes down to `maxBitrate`. Unlike streamUrl this
 * makes the server do real work, so only reach for it when the source is too
 * fat for the connection — see decidePlayback().
 */
export function transcodeUrl(
  itemId: string,
  mediaSourceId: string,
  token: string,
  deviceId: string,
  maxBitrate: number,
): string {
  const params = new URLSearchParams({
    api_key: token,
    DeviceId: deviceId,
    MediaSourceId: mediaSourceId,
    VideoCodec: 'h264',
    AudioCodec: 'aac',
    MaxStreamingBitrate: String(maxBitrate),
    TranscodingContainer: 'ts',
    TranscodingProtocol: 'hls',
    SegmentContainer: 'ts',
  });
  return `${getJellyfinUrl()}/Videos/${itemId}/master.m3u8?${params.toString()}`;
}
