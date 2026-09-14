import { resolveUrl } from '@/api/push';

/**
 * jellylab-push runs beside Jellyfin on the same host, so its address is the
 * Jellyfin one with the port swapped - always. A `pushUrl` preference used to
 * win when set, and a value typed into a screen that no longer exists kept push
 * on the NetBird address after the servers had moved to the LAN.
 */
describe('resolveUrl', () => {
  it('swaps the port on whatever address Jellyfin is at', () => {
    expect(resolveUrl('http://192.168.68.59:8096')).toBe('http://192.168.68.59:8099');
    expect(resolveUrl('http://100.71.232.136:8096')).toBe('http://100.71.232.136:8099');
  });

  it('works for a hostname too', () => {
    // The name resolves to the same host, and 8099 is published there.
    expect(resolveUrl('http://jellyfin.homelab.internal')).toBe('http://jellyfin.homelab.internal:8099');
  });

  it('trims a trailing slash', () => {
    expect(resolveUrl('http://192.168.68.59:8096/')).toBe('http://192.168.68.59:8099');
  });

  it('answers with nothing rather than guessing', () => {
    // No server configured yet, or something unparseable: the callers treat an
    // empty string as "do not ask", which is the honest outcome.
    expect(resolveUrl('')).toBe('');
    expect(resolveUrl('   ')).toBe('');
    expect(resolveUrl('not a url')).toBe('');
  });
});
