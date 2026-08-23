import * as SecureStore from 'expo-secure-store';
import type { Server } from '@/types';

const KEY_SERVERS = 'servers_list';
const KEY_CURRENT = 'current_server_id';

let _cache: { servers: Server[]; current: Server | null } = { servers: [], current: null };
let _loaded = false;

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeServers(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function notify() {
  listeners.forEach(fn => fn());
}

async function persist(servers: Server[], currentId: string | null): Promise<void> {
  await SecureStore.setItemAsync(KEY_SERVERS, JSON.stringify(servers));
  if (currentId) {
    await SecureStore.setItemAsync(KEY_CURRENT, currentId);
  } else {
    await SecureStore.deleteItemAsync(KEY_CURRENT);
  }
  _cache = {
    servers,
    current: currentId ? servers.find(s => s.id === currentId) ?? null : null,
  };
  notify();
}

export async function loadServers(): Promise<{ servers: Server[]; current: Server | null }> {
  const raw = await SecureStore.getItemAsync(KEY_SERVERS);
  const currentId = await SecureStore.getItemAsync(KEY_CURRENT);
  const servers: Server[] = raw ? JSON.parse(raw) : [];
  const current = currentId ? servers.find(s => s.id === currentId) ?? null : null;
  _cache = { servers, current };
  _loaded = true;
  return _cache;
}

let _loading: Promise<{ servers: Server[]; current: Server | null }> | null = null;

/**
 * Resolves once the store has been read from SecureStore, loading it if that
 * has not happened yet. Concurrent callers share one read rather than racing
 * several.
 *
 * Anything building a request URL must await this. The sync getters return an
 * empty cache until hydration completes, and an empty baseURL surfaces from
 * axios as a bare "Network Error" — which looks like the server is down rather
 * than like the app asking too early.
 */
export function ensureServersLoaded(): Promise<{ servers: Server[]; current: Server | null }> {
  if (_loaded) return Promise.resolve(_cache);
  if (!_loading) {
    _loading = loadServers().finally(() => {
      _loading = null;
    });
  }
  return _loading;
}

export function getCurrentServerSync(): Server | null {
  return _cache.current;
}

export function getServersSync(): Server[] {
  return _cache.servers;
}

export function isLoaded(): boolean {
  return _loaded;
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function makeId(): string {
  return `srv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function upsertServer(input: Omit<Server, 'id'> & { id?: string }): Promise<Server> {
  const server: Server = {
    id: input.id ?? makeId(),
    name: input.name.trim(),
    jellyfinUrl: normalizeUrl(input.jellyfinUrl),
    jellyseerrUrl: normalizeUrl(input.jellyseerrUrl),
  };
  const idx = _cache.servers.findIndex(s => s.id === server.id);
  const next = idx >= 0
    ? _cache.servers.map(s => (s.id === server.id ? server : s))
    : [..._cache.servers, server];
  const currentId = _cache.current?.id ?? server.id;
  await persist(next, currentId);
  return server;
}

export async function deleteServer(id: string): Promise<void> {
  const next = _cache.servers.filter(s => s.id !== id);
  const currentId = _cache.current?.id === id ? next[0]?.id ?? null : _cache.current?.id ?? null;
  await persist(next, currentId);
}

export async function setCurrentServer(id: string): Promise<void> {
  if (!_cache.servers.find(s => s.id === id)) return;
  await persist(_cache.servers, id);
}
