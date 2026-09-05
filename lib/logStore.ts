/**
 * What the app said, kept where the app can read it back.
 *
 * Everything diagnostic in this codebase goes to `console.*` with a
 * `[jellylab]` prefix, and that was enough for as long as every build loaded
 * its JavaScript from Metro: the bundler's output is piped off the machine and
 * into a file, so a failure on the phone could be read from a terminal.
 *
 * A release build has no bundler. The JavaScript is inside the app, the phone
 * is on a train, and every one of those lines goes nowhere at all - which is
 * how a subtitle that silently stopped being fetched became undiagnosable
 * without attaching the device to Xcode.
 *
 * So the lines are kept here too: a ring buffer in memory, filled by wrapping
 * the console rather than by changing four hundred call sites. The About
 * screen can then show them, and send them to the homelab.
 *
 * In memory only, and deliberately. Writing every line to disk would mean a
 * write on a hot path for a feature used twice a month, and the failures worth
 * catching - a request that quietly returned nothing, a track that was never
 * picked - all happen while the app is running and someone is looking at it.
 * A crash loses the buffer; the crash itself is reported by other means.
 */

/** Enough to cover a session's worth of browsing and a film starting. */
const MAX_LINES = 1000;

/** One pathological line must not push everything useful out of the buffer. */
const MAX_LINE = 2000;

export type LogLevel = 'log' | 'warn' | 'error';

export type LogLine = {
  /** ms since epoch, so the viewer can format it and the server can sort. */
  at: number;
  level: LogLevel;
  text: string;
};

let buffer: LogLine[] = [];
let installed = false;

/** Turn console arguments into one line, the way the console itself would. */
function render(args: unknown[]): string {
  const text = args
    .map(a => {
      if (typeof a === 'string') return a;
      if (a instanceof Error) return a.stack ?? `${a.name}: ${a.message}`;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
  return text.length > MAX_LINE ? `${text.slice(0, MAX_LINE)}…` : text;
}

export function record(level: LogLevel, args: unknown[]): void {
  buffer.push({ at: Date.now(), level, text: render(args) });
  // Trimmed in one go rather than shifting per push: shift on a 1000-element
  // array runs on every log line, and logging must never be the expensive part
  // of anything.
  if (buffer.length > MAX_LINES * 1.2) {
    buffer = buffer.slice(-MAX_LINES);
  }
}

/** Oldest first, which is the order anybody reads a log in. */
export function lines(): LogLine[] {
  return buffer.length > MAX_LINES ? buffer.slice(-MAX_LINES) : buffer.slice();
}

export function clear(): void {
  buffer = [];
}

/**
 * Capture the console without silencing it.
 *
 * The original is still called, so Metro keeps showing everything during
 * development and nothing about the debug experience changes. Idempotent,
 * because Fast Refresh re-evaluates this module and a second wrap would record
 * every line twice.
 */
export function installLogCapture(): void {
  if (installed) return;
  installed = true;

  (['log', 'warn', 'error'] as const).forEach(level => {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      try {
        record(level, args);
      } catch {
        // A logger that can throw is worse than no logger.
      }
      original(...args);
    };
  });
}

/**
 * The buffer as text, newest last, with a header saying what produced it.
 *
 * One string rather than a structure: it is read by a person, in a terminal or
 * a text field, and the first question is always which build and which server.
 */
export function asText(header: Record<string, string | undefined> = {}): string {
  const head = Object.entries(header)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  const body = lines()
    .map(l => `${new Date(l.at).toISOString()} ${l.level.padEnd(5)} ${l.text}`)
    .join('\n');
  return head ? `${head}\n\n${body}` : body;
}
