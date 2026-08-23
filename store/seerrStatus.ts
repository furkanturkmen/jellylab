/**
 * Why the Jellyseerr half of sign-in failed, if it did.
 *
 * Signing in is deliberately allowed to half-succeed: Jellyfin is what the app
 * is for, so a Jellyseerr that is down or misconfigured must not stop you
 * watching anything. The cost of that choice used to be paid silently - the
 * error was caught and dropped, and the only evidence was a Requests tab that
 * said "no requests" and a search that returned nothing, with no way to find
 * out why from inside the app.
 *
 * Module level rather than inside useAuth on purpose. Each useAuth() call has
 * its own state, so an error recorded by the login screen's instance would be
 * invisible to the Requests tab's instance, which is exactly where it needs to
 * be read.
 */
let lastError: string | null = null;
const listeners = new Set<() => void>();

export function setSeerrError(message: string | null): void {
  lastError = message;
  listeners.forEach(fn => fn());
}

export function getSeerrError(): string | null {
  return lastError;
}

export function subscribeSeerrError(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * The most specific thing we can say about a failed request.
 *
 * axios reports a request that never reached anyone as the bare string
 * "Network Error", which tells the user nothing. When there is no response at
 * all the useful fact is the address we tried, since a wrong or unreachable
 * Jellyseerr URL is by far the likeliest cause.
 */
export function describeSeerrError(e: any, url?: string): string {
  const status = e?.response?.status;
  if (status === 401 || status === 403) return 'Jellyseerr rejected those credentials';
  if (status) {
    // Seerr uses `message` for auth failures and `error` for setup ones, and
    // the latter is where the useful text lives - "Jellyfin hostname already
    // configured" says far more than "returned 500".
    const body = e?.response?.data?.message ?? e?.response?.data?.error;
    return body ? `Jellyseerr: ${body}` : `Jellyseerr returned ${status}`;
  }
  if (e?.message === 'Network Error' || e?.code === 'ECONNABORTED') {
    return url ? `Could not reach Jellyseerr at ${url}` : 'Could not reach Jellyseerr';
  }
  return e?.message ?? 'Jellyseerr sign-in failed';
}
