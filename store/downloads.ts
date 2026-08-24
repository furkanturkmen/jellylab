import { Directory, File, Paths } from 'expo-file-system';

import * as Jellyfin from '@/api/jellyfin';
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
  };
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
export async function startDownload(item: JellyfinItem, container: string): Promise<void> {
  await ensureDownloadsLoaded();

  const meta = describeItem(item, container);
  const existing = cache[item.Id];
  if (existing?.status === 'done' || existing?.status === 'downloading') return;

  set(item.Id, { meta, status: 'queued', bytesWritten: 0, totalBytes: -1 });

  const dir = itemDir(item.Id);
  try {
    if (!dir.exists) dir.create({ intermediates: true });
    metaFile(item.Id).write(JSON.stringify(meta));

    const url = await Jellyfin.downloadUrl(item.Id);
    const target = new File(dir, mediaName(container));
    const controller = new AbortController();
    controllers.set(item.Id, controller);

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
    const done: DownloadMeta = { ...meta, completedAt: Date.now() };
    metaFile(item.Id).write(JSON.stringify(done));
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
