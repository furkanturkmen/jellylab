/**
 * Everything that goes wrong, in the Metro log.
 *
 * Metro's output is the one place a failure can be read without the phone in
 * hand - it is piped off the machine running the bundler and into a file. But
 * only what reaches `console.*` gets there, and the app is deliberately quiet:
 * screens catch their own network failures so a dead row cannot take the tab
 * down with it, which also means those failures leave no trace anywhere.
 *
 * Two kinds of noise, logged at two levels on purpose:
 *
 * - Uncaught errors and unhandled rejections go to `console.error`. They are
 *   already loud in dev - LogBox shows them - so nothing is made worse.
 * - Handled request failures go to `console.log`. They are expected during
 *   normal use (a server asleep, a VPN off) and would otherwise put a red
 *   overlay over the app every time a row failed to load.
 *
 * Everything carries the `[jellylab]` prefix so it can be grepped out of a log
 * that is mostly bundler chatter:
 *
 *     ssh furkan@homelab "grep '\[jellylab\]' ~/jellylab-metro.log"
 */
import { Platform } from 'react-native';

/** Cap on echoed response bodies. Seerr's error pages are otherwise pages long. */
const MAX_BODY = 200;

function describeBody(data: unknown): string {
  if (data == null || data === '') return '';
  const text = typeof data === 'string' ? data : safeStringify(data);
  return text.length > MAX_BODY ? `${text.slice(0, MAX_BODY)}…` : text;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * One line that says what failed and where.
 *
 * Axios errors get taken apart rather than printed: their `message` is often
 * just "Request failed with status code 401", and the method, address and
 * response body are the parts that identify which call it was.
 */
export function describeError(e: any): string {
  if (e == null) return String(e);

  const config = e?.config;
  if (e?.isAxiosError || config?.url != null) {
    const method = String(config?.method ?? 'get').toUpperCase();
    const url = `${config?.baseURL ?? ''}${config?.url ?? ''}`;
    const status = e?.response?.status;
    const body = describeBody(e?.response?.data);
    return [
      e?.message ?? 'Request failed',
      `${method} ${url}`,
      status ? `HTTP ${status}` : 'no response',
      body,
    ].filter(Boolean).join(' — ');
  }

  if (e instanceof Error) {
    return e.stack ? `${e.name}: ${e.message}\n${e.stack}` : `${e.name}: ${e.message}`;
  }
  return typeof e === 'string' ? e : safeStringify(e);
}

/**
 * A request that failed and was handled. `where` is the caller's own name for
 * itself - "library:getViews", "profile:storage" - since the stack is useless
 * once the failure has been caught and turned into an empty array.
 */
export function logRequestFailure(where: string, e: any): void {
  console.log(`[jellylab] ${where} failed — ${describeError(e)}`);
}

let installed = false;

/**
 * Call once, at module scope in the root layout. Idempotent: Fast Refresh
 * re-evaluates the module, and stacking handlers would log each error as many
 * times as the file has been saved.
 */
export function installErrorLogging(): void {
  if (installed) return;
  installed = true;

  const globals = globalThis as any;
  const previous = globals.ErrorUtils?.getGlobalHandler?.();
  globals.ErrorUtils?.setGlobalHandler?.((e: any, isFatal?: boolean) => {
    console.error(`[jellylab] ${isFatal ? 'fatal' : 'uncaught'} — ${describeError(e)}`);
    // Hand back to React Native's own handler, which is what shows the red
    // screen and, when fatal, stops the app rather than leaving it half-dead.
    previous?.(e, isFatal);
  });

  // A rejected promise nobody caught. RN wires this up itself in dev, but only
  // for its own console format and not on every platform - and the interesting
  // case here is a rejection that dev tooling would swallow.
  try {
    const tracking = require('promise/setimmediate/rejection-tracking');
    tracking.enable({
      allRejections: true,
      onUnhandled: (id: number, e: any) =>
        console.error(`[jellylab] unhandled rejection #${id} — ${describeError(e)}`),
      // Late-handled means the catch arrived after the tracker gave up. Worth a
      // line, because it is usually an await that was forgotten and then added.
      onHandled: (id: number) =>
        console.log(`[jellylab] rejection #${id} was handled late`),
    });
  } catch {
    // Not fatal: the platform simply has no rejection tracker to enable.
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    // The browser has its own pair, and neither goes through ErrorUtils.
    window.addEventListener('error', event => {
      console.error(`[jellylab] uncaught — ${describeError((event as ErrorEvent).error ?? event)}`);
    });
    window.addEventListener('unhandledrejection', event => {
      console.error(`[jellylab] unhandled rejection — ${describeError((event as PromiseRejectionEvent).reason)}`);
    });
  }
}
