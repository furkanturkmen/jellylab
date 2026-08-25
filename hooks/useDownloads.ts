import { useEffect, useState } from 'react';

import {
  ensureDownloadsLoaded,
  getDownloadSync,
  getDownloadsSync,
  storedBytesSync,
  subscribeDownloads,
  type DownloadEntry,
} from '@/store/downloads';

/**
 * What is on the device, as React sees it.
 *
 * The store is a module with a listener list rather than context, because a
 * download outlives the screen that started it - you can queue an episode and
 * walk away to another tab. These hooks are the thin part: subscribe, re-read,
 * render.
 */
export function useDownloads(): { entries: DownloadEntry[]; bytes: number; ready: boolean } {
  const [, bump] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    ensureDownloadsLoaded().then(() => {
      if (alive) setReady(true);
    });
    const unsubscribe = subscribeDownloads(() => bump(n => n + 1));
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  return { entries: getDownloadsSync(), bytes: storedBytesSync(), ready };
}

/** One item, for the button on the item screen. */
export function useDownload(itemId: string | undefined): DownloadEntry | undefined {
  const [, bump] = useState(0);

  useEffect(() => {
    ensureDownloadsLoaded().then(() => bump(n => n + 1));
    return subscribeDownloads(() => bump(n => n + 1));
  }, []);

  return itemId ? getDownloadSync(itemId) : undefined;
}
