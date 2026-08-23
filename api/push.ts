import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Talks to jellylab-push on the homelab, which subscribes to ntfy and forwards
 * events here as native notifications. Deliberately separate from the Jellyfin
 * and Seerr clients: it is a different service on a different port, and it
 * stays usable even when those two are unreachable.
 */

export type PushRegistration = { token: string };

function base(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Asks for permission and returns an Expo push token, or null when it cannot
 * get one. Null is an ordinary outcome, not an error: simulators have no push
 * capability, and a previous denial cannot be re-prompted from inside the app.
 */
export async function getPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    // iOS only ever shows this prompt once per install; after a denial the
    // user has to go through the Settings app.
    const asked = await Notifications.requestPermissionsAsync();
    status = asked.status;
  }
  if (status !== 'granted') return null;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as any).easConfig?.projectId;
  if (!projectId) return null;

  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return data ?? null;
}

export async function registerDevice(url: string, secret: string, token: string): Promise<void> {
  const res = await fetch(`${base(url)}/devices`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ token, platform: Platform.OS }),
  });
  if (!res.ok) {
    throw new Error(res.status === 401 ? 'Wrong registration secret' : `Server returned ${res.status}`);
  }
}

export async function unregisterDevice(url: string, secret: string, token: string): Promise<void> {
  await fetch(`${base(url)}/devices?token=${encodeURIComponent(token)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${secret}` },
  }).catch(() => {});
}

/** Fires a notification from the server, to prove the whole chain works. */
export async function sendTest(url: string, secret: string): Promise<number> {
  const res = await fetch(`${base(url)}/test`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  const body = await res.json().catch(() => ({}));
  return body?.sentTo ?? 0;
}

export async function health(url: string): Promise<{ ok: boolean; devices: number }> {
  const res = await fetch(`${base(url)}/health`);
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  return res.json();
}
