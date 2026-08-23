import { getCurrentServerSync } from '@/store/servers';

export const CONFIG = {
  CLIENT_NAME: 'jellylab',
  CLIENT_VERSION: '1.0.0',
  DEVICE_NAME: 'iPhone',
};

export function getJellyfinUrl(): string {
  const s = getCurrentServerSync();
  return s?.jellyfinUrl ?? '';
}

export function getJellyseerrUrl(): string {
  const s = getCurrentServerSync();
  return s?.jellyseerrUrl ?? '';
}
