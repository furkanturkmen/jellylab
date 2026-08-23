import { useCallback, useEffect, useState } from 'react';
import * as Jellyfin from '@/api/jellyfin';
import * as Jellyseerr from '@/api/jellyseerr';
import { loadJellyfinAuth, subscribeJellyfinAuth } from '@/store/auth';
import type { JellyfinAuth } from '@/types';

export type AuthState =
  | { status: 'loading'; auth: null }
  | { status: 'signed-out'; auth: null }
  | { status: 'signed-in'; auth: JellyfinAuth };

export function useAuth() {
  const [state, setState] = useState<AuthState>({ status: 'loading', auth: null });

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      loadJellyfinAuth().then(auth => {
        if (cancelled) return;
        setState(auth ? { status: 'signed-in', auth } : { status: 'signed-out', auth: null });
      });
    };
    refresh();
    const unsub = subscribeJellyfinAuth(refresh);
    return () => { cancelled = true; unsub(); };
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    const auth = await Jellyfin.login(username, password);
    try {
      await Jellyseerr.loginJellyfin(username, password);
    } catch {}
    setState({ status: 'signed-in', auth });
    return auth;
  }, []);

  const signOut = useCallback(async () => {
    await Promise.allSettled([Jellyfin.logout(), Jellyseerr.logout()]);
    setState({ status: 'signed-out', auth: null });
  }, []);

  return { state, signIn, signOut };
}
