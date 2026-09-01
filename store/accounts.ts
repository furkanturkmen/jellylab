import * as SecureStore from 'expo-secure-store';

import { parseStored } from './json';

const KEY = 'known_accounts';

/**
 * Who has signed in on this device.
 *
 * Deliberately no secret in here - a name, a server, and the tag that draws an
 * avatar. Jellyseerr authenticates by doing its own Jellyfin login with a
 * username and password, so switching accounts cannot avoid asking for one;
 * remembering who exists is what makes that a single field rather than two.
 *
 * Stored through SecureStore because that is the only store this app has, not
 * because any of it is sensitive - prefs and sessions live there too.
 */
export type KnownAccount = {
  userId: string;
  userName: string;
  serverId: string;
  /** Jellyfin's avatar tag, for drawing the face next to the name. */
  primaryImageTag?: string;
  /** Epoch millis, so the list can lead with whoever uses the app most. */
  lastSignedInAt: number;
};

export async function loadAccounts(): Promise<KnownAccount[]> {
  const raw = await SecureStore.getItemAsync(KEY);
  const list = parseStored<KnownAccount[]>(raw, [], 'known accounts');
  return [...list].sort((a, b) => b.lastSignedInAt - a.lastSignedInAt);
}

/**
 * Record a successful sign-in.
 *
 * Keyed on the Jellyfin user id rather than the name, so renaming an account
 * updates the row instead of adding a second one for the same person.
 */
export async function rememberAccount(account: Omit<KnownAccount, 'lastSignedInAt'>): Promise<void> {
  const list = await loadAccounts();
  const next = [
    { ...account, lastSignedInAt: Date.now() },
    ...list.filter(a => a.userId !== account.userId),
  ];
  await SecureStore.setItemAsync(KEY, JSON.stringify(next));
}

export async function forgetAccount(userId: string): Promise<void> {
  const list = await loadAccounts();
  await SecureStore.setItemAsync(KEY, JSON.stringify(list.filter(a => a.userId !== userId)));
}
