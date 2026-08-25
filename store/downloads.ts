import { Directory, File, Paths } from 'expo-file-system';

import * as Jellyfin from '@/api/jellyfin';
import { logRequestFailure } from '@/lib/errorLog';
import { parseStored } from './json';
import type { JellyfinItem } from '@/types';

/**
 * What is stored on this device, and what is on its way.
 *
 * Same shape as the other stores here - a module-level cache with a listener
 * list - because a download belongs to the app rather than to a screen: the
 * Downloads tab lists them, the item screen needs to know whether this episode
 * is already on the phone, and the player needs the local path instead of a
 * URL.
 *
 * On disk, one directory per item under the document directory:
 *
 *     downloads/<itemId>/media.<container>
 *     downloads/<itemId>/meta.json
 *
 * The metadata file is what makes the tab work with no server. Filenames alone
 * cannot say "Dororo, season 1, episode 3" - that lives on Jellyfin, and the
 * whole point of a download is to not need Jellyfin.
 */

export type DownloadStatus = 'queued' | 'downloading' | 'done' | 'failed';

export type DownloadMeta = {
  itemId: string;
  title: string;
  /** "S1 · E3" for an episode; empty for a film. */
  subtitle: string;
  seriesName?: string;
  container: string;
  runtimeTicks?: number;
  /** When the download finished, so the tab can sort by recency. */
  completedAt?: number;
  /** 'Episode' or 'Movie' - the item screen branches on it when the server is gone. */
  type?: string;
  seriesId?: string;
  /** Stored artwork, so the screen can draw with no network. */
  poster?: string;
  /**
   * Subtitle tracks fetched as VTT alongside the media.
   *
   * Embedded tracks travel inside the container and need nothing here; a
   * sidecar file lives on the server and would be missing exactly when it is
   * needed, which is the whole point of a download.
   */
  subs?: { index: number; label: string; file: string }[];
  /**
   * Where this was left off, in ticks.
   *
   * Jellyfin owns this normally. Offline there is nobody to ask and nobody to
   * tell, so it is kept here as well and reconciled by the outbox.
   */
  positionTicks?: number;
};

export type DownloadEntry = {
  meta: DownloadMeta;
  status: DownloadStatus;
  bytesWritten: number;
  /** -1 when the server sent no Content-Length. */
  totalBytes: number;
  /** file:// path to the media, once there is one. */
  uri?: string;
  error?: string;
};

type Listener = () => void;

const listeners = new Set<Listener>();
let cache: Record<string, DownloadEntry> = {};
let hydrated = false;

/** Cancellation handles, kept out of the cache: they are not state to render. */
const controllers = new Map<string, AbortController>();

export function subscribeDownloads(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function notify() {
  listeners.forEach(fn => fn());
}

function set(itemId: string, entry: DownloadEntry) {
  cache = { ...cache, [itemId]: entry };
  notify();
}

export function getDownloadsSync(): DownloadEntry[] {
  return Object.values(cache).sort(
    (a, b) => (b.meta.completedAt ?? Infinity) - (a.meta.completedAt ?? Infinity)
  );
}

export function getDownloadSync(itemId: string): DownloadEntry | undefined {
  return cache[itemId];
}

/** The local file for an item, when it is fully downloaded and still present. */
export function localUriSync(itemId: string): string | undefined {
  const entry = cache[itemId];
  return entry?.status === 'done' ? entry.uri : undefined;
}

// ---------------------------------------------------------------- disk layout

function root(): Directory {
  return new Directory(Paths.document, 'downloads');
}

function itemDir(itemId: string): Directory {
  return new Directory(root(), itemId);
}

function metaFile(itemId: string): File {
  return new File(itemDir(itemId), 'meta.json');
}

/**
 * Write the sidecar, creating it first.
 *
 * `write` on a File that does not exist is not documented either way, and this
 * runs before the download starts - so a throw here would take the download
 * with it, for a file that is only there to name the episode offline.
 */
function writeMeta(itemId: string, meta: DownloadMeta): void {
  const file = metaFile(itemId);
  try {
    if (!file.exists) file.create({ intermediates: true, overwrite: true });
  } catch {
    // Already there, or the directory is not writable - write will say so.
  }
  file.write(JSON.stringify(meta));
}

/** Containers arrive as "mkv" or occasionally "mp4,m4v" - keep the first. */
export function mediaName(container: string | undefined): string {
  const ext = (container ?? '').toLowerCase().split(',')[0].trim() || 'bin';
  return `media.${ext}`;
}

export function describeItem(item: JellyfinItem, container: string): DownloadMeta {
  const isEpisode = item.Type === 'Episode';
  return {
    itemId: item.Id,
    title: isEpisode ? (item.SeriesName ?? item.Name) : item.Name,
    subtitle: isEpisode
      ? `S${item.ParentIndexNumber ?? '?'} · E${item.IndexNumber ?? '?'}${item.Name ? ` · ${item.Name}` : ''}`
      : String(item.ProductionYear ?? ''),
    seriesName: item.SeriesName,
    container,
    runtimeTicks: item.RunTimeTicks,
    type: item.Type,
    seriesId: item.SeriesId,
    positionTicks: item.UserData?.PlaybackPositionTicks,
  };
}

/**
 * The stored item, shaped like one from the server.
 *
 * The item screen is the only way into the player, and it starts with a
 * getItem - so with no server there is no screen and no way to reach a file
 * that is sitting on the phone. This is what it falls back to: enough of a
 * JellyfinItem to draw a title, a runtime and a play button.
 */
export function offlineItemSync(itemId: string): JellyfinItem | null {
  const meta = cache[itemId]?.meta;
  if (!meta) return null;
  const [, episodePart] = meta.subtitle.split('·').map(part => part.trim());
  return {
    Id: meta.itemId,
    Name: meta.type === 'Episode' ? (episodePart || meta.subtitle || meta.title) : meta.title,
    Type: (meta.type as JellyfinItem['Type']) ?? 'Movie',
    SeriesName: meta.seriesName,
    SeriesId: meta.seriesId,
    RunTimeTicks: meta.runtimeTicks,
    UserData: { PlaybackPositionTicks: meta.positionTicks ?? 0, Played: false },
  } as JellyfinItem;
}

/**
 * Remember where playback got to.
 *
 * Written straight to meta.json rather than held in memory: the reason this
 * exists at all is a device that may be closed and reopened with no server in
 * between.
 */
export function saveLocalPosition(itemId: string, positionTicks: number): void {
  const entry = cache[itemId];
  if (!entry) return;
  const meta = { ...entry.meta, positionTicks };
  try {
    writeMeta(itemId, meta);
  } catch {
    // Not worth failing playback over.
  }
  set(itemId, { ...entry, meta });
}

/** The stored VTT for a track, if this download has one. */
export function localSubtitleSync(itemId: string, index: number): string | null {
  const meta = cache[itemId]?.meta;
  const track = meta?.subs?.find(s => s.index === index);
  if (!track) return null;
  const file = new File(itemDir(itemId), track.file);
  return file.exists ? safeRead(file) : null;
}

/** Stored external tracks, in the shape the player already passes around. */
export function localSubtitlesSync(itemId: string): { index: number; label: string }[] {
  return (cache[itemId]?.meta.subs ?? []).map(({ index, label }) => ({ index, label }));
}

// ------------------------------------------------------------------- hydrate

/**
 * Read what is already on disk.
 *
 * A directory with a meta.json but no media file is a download that died
 * mid-flight - the app was killed, most likely. It is reported as failed rather
 * than silently swept away, because a half-download still occupies the space
 * and the person should get to decide.
 */
export async function ensureDownloadsLoaded(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    const dir = root();
    if (!dir.exists) return;
    const next: Record<string, DownloadEntry> = {};
    for (const child of dir.list()) {
      if (!(child instanceof Directory)) continue;
      const itemId = child.name;
      const meta = parseStored<DownloadMeta | null>(safeRead(metaFile(itemId)), null, 'download metadata');
      if (!meta) continue;
      const media = new File(child, mediaName(meta.container));
      next[itemId] = media.exists
        ? { meta, status: 'done', bytesWritten: media.size ?? 0, totalBytes: media.size ?? 0, uri: media.uri }
        : { meta, status: 'failed', bytesWritten: 0, totalBytes: -1, error: 'incomplete' };
    }
    cache = next;
    notify();
  } catch {
    // A store that cannot read its own directory should not stop the app from
    // starting; the tab will simply show nothing.
  }
}

function safeRead(file: File): string | null {
  try {
    // textSync, not text(): hydration runs once at start and the files are a
    // few hundred bytes each, so the async version buys nothing and would make
    // every caller of this helper async.
    return file.exists ? file.textSync() : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ download

/**
 * Fetch the original file, not a transcode.
 *
 * `streamUrl` asks for `static=true`, so the server hands over the file as it
 * is on disk. Anything else arrives as HLS - a playlist and hundreds of
 * segments - which is not something to reassemble on a phone.
 */
/**
 * Fetch the artwork and any sidecar subtitle tracks beside the media.
 *
 * Both are on the server, which is the thing that will be missing. Failures
 * here are not failures of the download: an episode without its poster is
 * still an episode, and one without its external track still has whatever the
 * container carries.
 */
async function storeCompanions(
  item: JellyfinItem,
  dir: Directory,
  subs: { index: number; label: string }[],
): Promise<Partial<DownloadMeta>> {
  const extra: Partial<DownloadMeta> = {};

  const tag = item.ImageTags?.Primary;
  if (tag) {
    try {
      const target = new File(dir, 'poster.jpg');
      const file = await File.downloadFileAsync(
        Jellyfin.imageUrl(item.Id, tag, 'Primary', 600),
        target,
        { idempotent: true },
      );
      extra.poster = file.uri;
    } catch (e) {
      logRequestFailure(`downloads:poster ${item.Id}`, e);
    }
  }

  const stored: DownloadMeta['subs'] = [];
  for (const track of subs) {
    try {
      const auth = await import('./auth').then(m => m.loadJellyfinAuth());
      if (!auth) continue;
      // Jellyfin's media source id is the item id for anything with a single
      // file, which is everything this app downloads - but the caller passes
      // the real one when it has it.
      const sourceId = mediaSourceIds.get(item.Id) ?? item.Id;
      const url = Jellyfin.subtitleUrl(item.Id, sourceId, track.index, auth.accessToken, 'vtt');
      const vtt = await Jellyfin.fetchSubtitleVtt(url);
      const name = `sub-${track.index}.vtt`;
      const file = new File(dir, name);
      try {
        if (!file.exists) file.create({ intermediates: true, overwrite: true });
      } catch {}
      file.write(vtt);
      stored.push({ index: track.index, label: track.label, file: name });
    } catch (e) {
      logRequestFailure(`downloads:subtitle ${item.Id}/${track.index}`, e);
    }
  }
  if (stored.length > 0) extra.subs = stored;
  return extra;
}

/** Media source ids, needed to build subtitle URLs after the fact. */
const mediaSourceIds = new Map<string, string>();

/**
 * The queue.
 *
 * A season is ten to twenty files, and starting them all at once means twenty
 * transfers fighting for the same connection, twenty progress bars moving
 * imperceptibly, and nothing watchable for an hour. One at a time means the
 * first episode is ready while the rest are still coming - which is the order
 * anyone actually watches them in.
 */
const queue: { item: JellyfinItem; container: string; companions?: Companions }[] = [];
let draining = false;

type Companions = { mediaSourceId?: string; subs: { index: number; label: string }[] };

export async function enqueueDownload(
  item: JellyfinItem,
  container: string,
  companions?: Companions,
): Promise<void> {
  await ensureDownloadsLoaded();

  const existing = cache[item.Id];
  if (existing && existing.status !== 'failed') return;

  set(item.Id, { meta: describeItem(item, container), status: 'queued', bytesWritten: 0, totalBytes: -1 });
  queue.push({ item, container, companions });
  void drainQueue();
}

async function drainQueue(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) break;
      // Cancelled while it waited: removeDownload dropped the entry, and that
      // is the signal, since the queue itself holds no state worth reading.
      if (!cache[next.item.Id]) continue;
      await startDownload(next.item, next.container, next.companions);
    }
  } finally {
    draining = false;
  }
}

/** How many are waiting behind the one being fetched. */
export function queuedCountSync(): number {
  return queue.length;
}

export async function startDownload(
  item: JellyfinItem,
  container: string,
  /** The subtitle streams the item screen already looked up, and the source they belong to. */
  companions?: { mediaSourceId?: string; subs: { index: number; label: string }[] },
): Promise<void> {
  await ensureDownloadsLoaded();

  const meta = describeItem(item, container);
  const existing = cache[item.Id];
  if (existing?.status === 'done' || existing?.status === 'downloading') return;

  set(item.Id, { meta, status: 'queued', bytesWritten: 0, totalBytes: -1 });

  if (companions?.mediaSourceId) mediaSourceIds.set(item.Id, companions.mediaSourceId);

  const dir = itemDir(item.Id);
  try {
    if (!dir.exists) dir.create({ intermediates: true });
    writeMeta(item.Id, meta);

    const url = await Jellyfin.downloadUrl(item.Id);
    const target = new File(dir, mediaName(container));
    const controller = new AbortController();
    controllers.set(item.Id, controller);

    console.log(`[jellylab] downloads:start ${item.Id} container=${container}`);
    set(item.Id, { meta, status: 'downloading', bytesWritten: 0, totalBytes: -1 });

    const file = await File.downloadFileAsync(url, target, {
      idempotent: true,
      signal: controller.signal,
      onProgress: ({ bytesWritten, totalBytes }) => {
        const entry = cache[item.Id];
        if (!entry || entry.status !== 'downloading') return;
        set(item.Id, { ...entry, bytesWritten, totalBytes });
      },
    });

    controllers.delete(item.Id);

    // The media is here; the companions are best effort on top of it.
    const extra = await storeCompanions(item, dir, companions?.subs ?? []);
    const done: DownloadMeta = { ...meta, ...extra, completedAt: Date.now() };
    writeMeta(item.Id, done);
    console.log(`[jellylab] downloads:done ${item.Id} bytes=${file.size ?? 0}`);
    set(item.Id, {
      meta: done,
      status: 'done',
      bytesWritten: file.size ?? 0,
      totalBytes: file.size ?? 0,
      uri: file.uri,
    });
  } catch (e: any) {
    controllers.delete(item.Id);
    // A cancel lands here too; remove() has already cleared the entry in that
    // case, so only report when it is still ours to report on.
    if (cache[item.Id]) {
      logRequestFailure(`downloads:${item.Id}`, e);
      set(item.Id, {
        meta,
        status: 'failed',
        bytesWritten: 0,
        totalBytes: -1,
        error: e?.message ?? String(e),
      });
    }
  }
}

/** Stop an in-flight download and delete what it has written so far. */
export async function cancelDownload(itemId: string): Promise<void> {
  controllers.get(itemId)?.abort();
  controllers.delete(itemId);
  await removeDownload(itemId);
}

/** Delete a stored item, whatever state it is in. */
export async function removeDownload(itemId: string): Promise<void> {
  try {
    const dir = itemDir(itemId);
    if (dir.exists) dir.delete();
  } catch {
    // Already gone, or never created.
  }
  const { [itemId]: _dropped, ...rest } = cache;
  cache = rest;
  notify();
}

/** Bytes held by finished downloads, for the tab's header. */
export function storedBytesSync(): number {
  return Object.values(cache)
    .filter(e => e.status === 'done')
    .reduce((sum, e) => sum + (e.totalBytes > 0 ? e.totalBytes : 0), 0);
}
