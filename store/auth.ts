import * as SecureStore from 'expo-secure-store';
import type { JellyfinAuth, JellyseerrAuth } from '@/types';

const KEY_JELLYFIN = 'jellyfin_auth';
const KEY_JELLYSEERR = 'jellyseerr_auth';
const KEY_DEVICE_ID = 'device_id';

export async function saveJellyfinAuth(auth: JellyfinAuth): Promise<void> {
  await SecureStore.setItemAsync(KEY_JELLYFIN, JSON.stringify(auth));
}

export async function loadJellyfinAuth(): Promise<JellyfinAuth | null> {
  const raw = await SecureStore.getItemAsync(KEY_JELLYFIN);
  return raw ? (JSON.parse(raw) as JellyfinAuth) : null;
}

export async function clearJellyfinAuth(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_JELLYFIN);
}

export async function saveJellyseerrAuth(auth: JellyseerrAuth): Promise<void> {
  await SecureStore.setItemAsync(KEY_JELLYSEERR, JSON.stringify(auth));
}

export async function loadJellyseerrAuth(): Promise<JellyseerrAuth | null> {
  const raw = await SecureStore.getItemAsync(KEY_JELLYSEERR);
  return raw ? (JSON.parse(raw) as JellyseerrAuth) : null;
}

export async function clearJellyseerrAuth(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_JELLYSEERR);
}

export async function getDeviceId(): Promise<string> {
  let id = await SecureStore.getItemAsync(KEY_DEVICE_ID);
  if (!id) {
    id = `jellylab-${Math.random().toString(36).slice(2, 12)}`;
    await SecureStore.setItemAsync(KEY_DEVICE_ID, id);
  }
  return id;
}
