import { Directory, File, Paths } from 'expo-file-system';

import * as Jellyfin from '@/api/jellyfin';
import { logRequestFailure } from '@/lib/errorLog';
import { parseStored } from './json';

/**
 * Progress the server has not heard about yet.
 *
 * Watching an episode offline moves the resume point, and Jellyfin only learns
 * about it later. Without somewhere to put that, landing after a flight means
 * the resume point silently rewinds to wherever the server last saw you - the
 * same class of bug as the VLC reporting one, and just as invisible.
 *
 * A file rather than memory, because the app being killed between the flight
 * and the wifi is the ordinary case. One entry per item: only the latest
 * position matters, and a queue of forty pings from one episode is forty
 * chances to fail.
 */
export type ProgressEntry = {
  itemId: string;
  positionTicks: number;
  /** Epoch millis, so a newer entry can win. */
  at: number;
};

function file(): File {
  return new File(new Directory(Paths.document), 'progress-outbox.json');
}

function read(): ProgressEntry[] {
  try {
    const f = file();
    if (!f.exists) return [];
    return parseStored<ProgressEntry[]>(f.textSync(), [], 'progress outbox');
  } catch {
    return [];
  }
}

function write(entries: ProgressEntry[]): void {
  try {
    const f = file();
    if (!f.exists) f.create({ intermediates: true, overwrite: true });
    f.write(JSON.stringify(entries));
  } catch (e) {
    logRequestFailure('outbox:write', e);
  }
}

/** Record where an item was left, replacing anything older for that item. */
export function queueProgress(itemId: string, positionTicks: number): void {
  const entries = read().filter(entry => entry.itemId !== itemId);
  entries.push({ itemId, positionTicks, at: Date.now() });
  write(entries);
  console.log(`[jellylab] outbox:queued ${itemId} ticks=${positionTicks} pending=${entries.length}`);
}

export function pendingProgress(): ProgressEntry[] {
  return read();
}

/**
 * Hand everything to the server, dropping whatever it accepts.
 *
 * Called when a request has just succeeded, so the server is known to be
 * there. An entry the server rejects is dropped as well: a resume point for an
 * item that no longer exists has nowhere to go, and keeping it means retrying
 * forever.
 */
export async function drainProgressOutbox(): Promise<void> {
  const entries = read();
  if (entries.length === 0) return;

  const stuck: ProgressEntry[] = [];
  for (const entry of entries) {
    try {
      await Jellyfin.reportPlaybackStopped(entry.itemId, entry.positionTicks, 'DirectPlay');
      console.log(`[jellylab] outbox:sent ${entry.itemId} ticks=${entry.positionTicks}`);
    } catch (e: any) {
      const status = e?.response?.status;
      // 4xx is the server saying no, not the network being absent: retrying it
      // on every launch would never stop.
      if (status && status >= 400 && status < 500) {
        logRequestFailure(`outbox:rejected ${entry.itemId}`, e);
        continue;
      }
      stuck.push(entry);
    }
  }
  write(stuck);
}
