import { describeError } from '@/lib/errorLog';

/**
 * Read a JSON blob out of storage, treating corruption as absence.
 *
 * Every store here keeps its state as a JSON string, and `JSON.parse` on a
 * damaged one throws inside the load path - which runs while the app is
 * starting, before any screen exists to catch it. The result is an app that
 * cannot open at all, and cannot be repaired from inside itself: the only fix
 * is deleting the app or clearing site data.
 *
 * Nothing here is precious enough to justify that. Servers can be re-added and
 * a session can be signed in again, so a value that cannot be read is treated
 * the same as one that was never written, and the reason goes to the log.
 */
export function parseStored<T>(raw: string | null | undefined, fallback: T, what: string): T {
  if (raw == null || raw === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    console.log(`[jellylab] stored ${what} was not valid JSON, ignoring it — ${describeError(e)}`);
    return fallback;
  }
}
