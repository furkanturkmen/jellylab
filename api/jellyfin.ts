import axios, { AxiosInstance } from 'axios';
import { CONFIG, getJellyfinUrl, requireJellyfinUrl } from '@/config';
import { episodeAfter } from '@/player/upnext';
import { getDeviceId, loadJellyfinAuth, saveJellyfinAuth, clearJellyfinAuth } from '@/store/auth';
import { logRequestFailure } from '@/lib/errorLog';
import { pickTrickplay, type TrickplayInfo } from '@/lib/trickplay';

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
  // The default export is axios itself; create() on it is the documented
  // entry point, not the named-export shadowing this rule guards against.
  // eslint-disable-next-line import/no-named-as-default-member
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

/**
 * The server's own name and version.
 *
 * The one endpoint that answers without a token, which is why the About screen
 * uses it: it still says something useful when authentication is the thing that
 * is broken. Built by hand rather than through authClient for the same reason.
 */
export async function getPublicSystemInfo(): Promise<{ ServerName?: string; Version?: string } | null> {
  const baseURL = await requireJellyfinUrl();
  const res = await axios.get(`${baseURL}/System/Info/Public`, { timeout: 8000 });
  return res.data ?? null;
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

/**
 * A page of a library, and how much of it there is.
 *
 * `total` is what the server holds, not what came back - the caller asks for a
 * screenful, and needs the real size to say so honestly.
 */
export type ItemPage = { items: JellyfinItem[]; total: number };

export type ItemSort = 'name' | 'recent';

export async function getItems(
  userId: string,
  parentId?: string,
  limit = 100,
  sort: ItemSort = 'name',
  startIndex = 0
): Promise<ItemPage> {
  const client = await authClient();
  const res = await client.get(`/Users/${userId}/Items`, {
    params: {
      ParentId: parentId,
      Limit: limit,
      // Omitted rather than sent as 0, so the query string of a first page is
      // identical to what it was before paging existed and stays cacheable.
      StartIndex: startIndex || undefined,
      Recursive: parentId ? true : undefined,
      // 'recent' is DateCreated, which is when the file arrived on the server -
      // not the release date, and not when it was last played.
      SortBy: sort === 'recent' ? 'DateCreated' : 'SortName',
      SortOrder: sort === 'recent' ? 'Descending' : 'Ascending',
      Fields: 'Overview,PrimaryImageAspectRatio,ProviderIds',
      IncludeItemTypes: parentId ? 'Movie,Series' : undefined,
    },
  });
  return {
    items: res.data.Items ?? [],
    total: res.data.TotalRecordCount ?? (res.data.Items ?? []).length,
  };
}

export async function getItem(userId: string, itemId: string): Promise<JellyfinItem> {
  const client = await authClient();
  // MediaSources so the screen can say "Full HD" without a second request for
  // playback info it does not otherwise need.
  const res = await client.get(`/Users/${userId}/Items/${itemId}`, {
    params: { Fields: 'MediaSources,Overview,ProviderIds,Trickplay' },
  });
  return res.data;
}

/**
 * Mark an item watched or unwatched.
 *
 * The legacy path rather than 10.9's `/UserPlayedItems/{id}`: it is still
 * routed by every server this app talks to, and it carries the user id in the
 * URL instead of a query parameter, which is one less thing to get wrong.
 */
export async function setPlayed(userId: string, itemId: string, played: boolean): Promise<void> {
  const client = await authClient();
  const path = `/Users/${userId}/PlayedItems/${itemId}`;
  if (played) await client.post(path);
  else await client.delete(path);
}

/**
 * What has been watched, most recent first.
 *
 * Films and episodes only: a series counts as played when its last episode
 * does, and a history that says "Jujutsu Kaisen" between two of its own
 * episodes reads as a duplicate rather than a fact.
 */
export async function getPlayedItems(userId: string, limit = 60, startIndex = 0): Promise<ItemPage> {
  const client = await authClient();
  const res = await client.get(`/Users/${userId}/Items`, {
    params: {
      Recursive: true,
      Filters: 'IsPlayed',
      IncludeItemTypes: 'Movie,Episode',
      SortBy: 'DatePlayed',
      SortOrder: 'Descending',
      Limit: limit,
      StartIndex: startIndex || undefined,
      // UserData carries LastPlayedDate, which is the only thing that makes
      // this a history rather than a list.
      Fields: 'UserData,PrimaryImageAspectRatio,ProviderIds',
    },
  });
  return {
    items: res.data.Items ?? [],
    total: res.data.TotalRecordCount ?? (res.data.Items ?? []).length,
  };
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
  /** bytes on the server's disk - what a download will occupy here */
  Size?: number;
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

/**
 * What you were part-way through, one card per series.
 *
 * Jellyfin resumes per episode, so leaving three episodes of the same show
 * unfinished puts three of them in the row - the same artwork three times,
 * pushing everything else off the end. Only the most recent per series earns a
 * card; the rest are reachable from the series itself.
 *
 * Films have no SeriesId and key on their own id, so they are untouched. The
 * server is asked for more than the caller wants, because the collapse happens
 * after its limit has already been applied.
 */
/**
 * The next episode to watch in each series that has been started.
 *
 * Distinct from Resume, which is what was left half-watched: this is what
 * comes after something finished. The two overlap by design on the server -
 * a series you are mid-episode on appears in both - so the caller is expected
 * to drop what Resume already shows rather than have the same series twice.
 */
export async function getNextUp(userId: string, limit = 12): Promise<JellyfinItem[]> {
  const client = await authClient();
  const res = await client.get('/Shows/NextUp', {
    params: {
      userId,
      Limit: limit,
      Fields: 'PrimaryImageAspectRatio,Overview,BackdropImageTags',
      // Asked for, and ignored by the server - see the filter below.
      DisableFirstEpisode: true,
    },
  });
  const items: JellyfinItem[] = res.data.Items ?? [];
  // The server sends DisableFirstEpisode back unread: with it set either way
  // it offers the first episode of every series in the library, started or
  // not. That is a list of things to begin, not of what comes next, and the
  // library rows already show it. So the flag is applied here instead.
  return items.filter(item => !isSeriesOpener(item));
}

/**
 * The very first episode of a series, which is only "next up" if you have
 * already begun - and a series you have begun is in Resume instead.
 */
function isSeriesOpener(item: JellyfinItem): boolean {
  return item.IndexNumber === 1 && item.ParentIndexNumber === 1;
}

/**
 * The episode after this one, within its series.
 *
 * Deliberately not NextUp: NextUp answers "what should I watch", which is
 * empty once a series is finished and is affected by what has been marked
 * played. At the end of an episode the question is the simpler one - what
 * comes after this - and the answer should be the same whether or not the
 * credits counted as watched.
 *
 * `adjacentTo` returns the previous, current and next episode in order, so
 * the next one is whatever follows the current id. A last episode has nothing
 * after it, and returns null.
 */
export async function getNextEpisode(
  userId: string,
  seriesId: string,
  episodeId: string,
): Promise<JellyfinItem | null> {
  const client = await authClient();
  const res = await client.get(`/Shows/${seriesId}/Episodes`, {
    params: { userId, adjacentTo: episodeId, Fields: 'PrimaryImageAspectRatio,Overview' },
  });
  const items: JellyfinItem[] = res.data.Items ?? [];
  // The choosing is in player/upnext, where it can be tested without playing
  // an episode to the end to find out what the card would have offered.
  return episodeAfter(items, episodeId);
}

export async function getResumeItems(userId: string, limit = 12): Promise<JellyfinItem[]> {
  const client = await authClient();
  const res = await client.get(`/Users/${userId}/Items/Resume`, {
    params: {
      Limit: limit * 3,
      MediaTypes: 'Video',
      Fields: 'PrimaryImageAspectRatio,Overview,BackdropImageTags',
    },
  });
  const items: JellyfinItem[] = res.data.Items ?? [];
  const seen = new Set<string>();
  const collapsed: JellyfinItem[] = [];
  // Most recently played first, so the one kept for a series is the episode you
  // actually left off on.
  for (const item of items) {
    const key = item.SeriesId ?? item.Id;
    if (seen.has(key)) continue;
    seen.add(key);
    collapsed.push(item);
  }
  return collapsed.slice(0, limit);
}

export async function getLatestItems(userId: string, parentId: string, limit = 12): Promise<JellyfinItem[]> {
  const client = await authClient();
  const res = await client.get(`/Users/${userId}/Items/Latest`, {
    params: {
      ParentId: parentId,
      Limit: limit,
      Fields: 'Overview,BackdropImageTags,ProviderIds',
    },
  });
  return res.data ?? [];
}

export function imageUrl(itemId: string, tag?: string, type: 'Primary' | 'Backdrop' = 'Primary', maxWidth = 400): string {
  const tagParam = tag ? `&tag=${tag}` : '';
  // Jellyfin re-encodes on the way out and defaults to a conservative quality.
  // At hero size that shows, and the bytes are cheap on a LAN.
  return `${getJellyfinUrl()}/Items/${itemId}/Images/${type}?maxWidth=${maxWidth}&quality=90${tagParam}`;
}

/**
 * The artwork TMDB holds for an item, which is usually better than what the
 * server kept.
 *
 * Jellyfin stores whatever its scraper downloaded - often a 1280px JPEG, then
 * re-encoded again on request. TMDB's own file is up to 3840px and untouched.
 * The id comes from the item's ProviderIds, so this only works for things that
 * were matched against TMDB in the first place.
 */
export function tmdbId(item: { ProviderIds?: Record<string, string> }): number | null {
  const raw = item.ProviderIds?.Tmdb ?? item.ProviderIds?.tmdb;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
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

/**
 * The scrub previews for an item, at a width worth showing on a phone.
 *
 * Jellyfin keys these by media source first, so a title with two files does
 * not mix their thumbnails. When the caller does not know which source is
 * playing - the download path, mostly - the only one present is used, which
 * is right for every item in practice and wrong only for multi-version rips.
 */
export function trickplayFor(
  item: Pick<JellyfinItem, 'Trickplay'>,
  mediaSourceId?: string,
  maxWidth = 320,
): TrickplayInfo | null {
  const bySource = item.Trickplay ?? {};
  const chosen = (mediaSourceId ? bySource[mediaSourceId] : undefined) ?? Object.values(bySource)[0];
  if (!chosen) return null;

  const normalised: Record<string, TrickplayInfo> = {};
  for (const [width, r] of Object.entries(chosen)) {
    normalised[width] = {
      width: r.Width,
      height: r.Height,
      tileWidth: r.TileWidth,
      tileHeight: r.TileHeight,
      thumbnailCount: r.ThumbnailCount,
      interval: r.Interval,
    };
  }
  return pickTrickplay(normalised, maxWidth);
}

/**
 * One sheet of scrub thumbnails.
 *
 * Sheets are the unit the server serves, so a scrub across a whole tile costs
 * a single request and everything after it is a crop of what is already
 * cached.
 */
export function trickplayTileUrl(
  itemId: string,
  width: number,
  tileIndex: number,
  token: string,
): string {
  return `${getJellyfinUrl()}/Videos/${itemId}/Trickplay/${width}/${tileIndex}.jpg?api_key=${token}`;
}

export async function fetchSubtitleVtt(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Subtitle fetch failed: ${res.status}`);
  return res.text();
}

/**
 * The original file, addressed for storing rather than streaming.
 *
 * Same URL the player uses for direct play - `static=true`, so the server reads
 * the file off disk untouched - but this one loads the token and device id
 * itself, because a download starts from a list row rather than from the player
 * where both are already in hand.
 */
export async function downloadUrl(itemId: string): Promise<string> {
  const auth = await loadJellyfinAuth();
  if (!auth) throw new Error('Not authenticated');
  const deviceId = await getDeviceId();
  return streamUrl(itemId, auth.accessToken, deviceId);
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
/** What the audio track gets when the server re-encodes it. */
const TRANSCODE_AUDIO_BITRATE = 192_000;

/**
 * The query a transcode needs, as its own function so it can be tested.
 *
 * `MaxStreamingBitrate` is not enough on this endpoint: Jellyfin does not
 * derive a video bitrate from it, and hands ffmpeg `-b:v 0 -maxrate 0` with
 * CBR rate control, which cannot encode and exits 234. The server then offers
 * a 256 kbps, 416x234 rendition whose segments all fail - the player sees a
 * stream that will not start and falls back, which is what made "Always use
 * AVPlayer" look broken.
 *
 * So the video bitrate is stated, and the audio's share is taken out of it
 * rather than added on top of the ceiling the user asked for.
 */
export function transcodeParams(
  mediaSourceId: string,
  token: string,
  deviceId: string,
  maxBitrate: number,
  /**
   * Which audio stream to encode.
   *
   * A transcode carries one audio track and the player cannot switch to
   * another, so if it is not chosen here it cannot be chosen at all - the
   * server sends the container's default, which on an anime release is the
   * English dub.
   */
  audioStreamIndex?: number | null,
): URLSearchParams {
  const video = Math.max(400_000, maxBitrate - TRANSCODE_AUDIO_BITRATE);
  const params = new URLSearchParams({
    api_key: token,
    DeviceId: deviceId,
    MediaSourceId: mediaSourceId,
    VideoCodec: 'h264',
    AudioCodec: 'aac',
    VideoBitrate: String(video),
    AudioBitrate: String(TRANSCODE_AUDIO_BITRATE),
    MaxStreamingBitrate: String(maxBitrate),
    TranscodingContainer: 'ts',
    TranscodingProtocol: 'hls',
    SegmentContainer: 'ts',
  });
  if (audioStreamIndex != null) params.set('AudioStreamIndex', String(audioStreamIndex));
  return params;
}

export function transcodeUrl(
  itemId: string,
  mediaSourceId: string,
  token: string,
  deviceId: string,
  maxBitrate: number,
  audioStreamIndex?: number | null,
): string {
  const params = transcodeParams(mediaSourceId, token, deviceId, maxBitrate, audioStreamIndex);
  return `${getJellyfinUrl()}/Videos/${itemId}/master.m3u8?${params.toString()}`;
}

/** One Jellyfin account, as far as assigning content filters cares. */
export type JellyfinUser = {
  Id: string;
  Name: string;
  Policy?: { IsAdministrator?: boolean };
};

/**
 * Everyone on the server.
 *
 * Administrator-only on Jellyfin's side, which is the point: the screen that
 * uses it is for deciding what other people see, and a non-admin token gets a
 * 403 rather than a list.
 */
export async function getUsers(): Promise<JellyfinUser[]> {
  const client = await authClient();
  const res = await client.get('/Users');
  return res.data ?? [];
}
