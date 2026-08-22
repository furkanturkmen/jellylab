import axios, { AxiosInstance } from 'axios';
import { CONFIG } from '@/config';
import { getDeviceId, loadJellyfinAuth, saveJellyfinAuth, clearJellyfinAuth } from '@/store/auth';
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
  return axios.create({
    baseURL: CONFIG.JELLYFIN_URL,
    timeout: 15000,
    headers: {
      'X-Emby-Authorization': await authHeader(token),
      'Content-Type': 'application/json',
    },
  });
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
  };
  await saveJellyfinAuth(auth);
  return auth;
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

export type MediaSource = {
  Id: string;
  Container?: string;
  MediaStreams?: {
    Type: 'Video' | 'Audio' | 'Subtitle';
    Codec?: string;
    Profile?: string;
  }[];
};

export async function getPlaybackInfo(userId: string, itemId: string): Promise<MediaSource[]> {
  const client = await authClient();
  const res = await client.get(`/Items/${itemId}/PlaybackInfo`, { params: { UserId: userId } });
  return res.data.MediaSources ?? [];
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
  return `${CONFIG.JELLYFIN_URL}/Items/${itemId}/Images/${type}?maxWidth=${maxWidth}${tagParam}`;
}

export function streamUrl(itemId: string, token: string, deviceId: string): string {
  const params = new URLSearchParams({
    static: 'true',
    api_key: token,
    DeviceId: deviceId,
  });
  return `${CONFIG.JELLYFIN_URL}/Videos/${itemId}/stream?${params.toString()}`;
}
