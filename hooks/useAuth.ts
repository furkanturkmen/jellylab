import { useCallback, useEffect, useState } from 'react';
import * as Jellyfin from '@/api/jellyfin';
import * as Jellyseerr from '@/api/jellyseerr';
import { loadJellyfinAuth } from '@/store/auth';
import type { JellyfinAuth } from '@/types';

export type AuthState =
  | { status: 'loading'; auth: null }
  | { status: 'signed-out'; auth: null }
  | { status: 'signed-in'; auth: JellyfinAuth };

export function useAuth() {
  const [state, setState] = useState<AuthState>({ status: 'loading', auth: null });

  useEffect(() => {
    loadJellyfinAuth().then(auth => {
      setState(auth ? { status: 'signed-in', auth } : { status: 'signed-out', auth: null });
    });
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    console.log('[auth] signIn start', username);
    try {
      const auth = await Jellyfin.login(username, password);
      console.log('[auth] jellyfin ok', auth.userName);
      try {
        await Jellyseerr.loginJellyfin(username, password);
        console.log('[auth] jellyseerr ok');
      } catch (e: any) {
        console.log('[auth] jellyseerr failed', e?.message);
      }
      setState({ status: 'signed-in', auth });
      return auth;
    } catch (e: any) {
      console.log('[auth] jellyfin failed', e?.message, e?.response?.status, e?.response?.data);
      throw e;
    }
  }, []);

  const signOut = useCallback(async () => {
    await Promise.allSettled([Jellyfin.logout(), Jellyseerr.logout()]);
    setState({ status: 'signed-out', auth: null });
  }, []);

  return { state, signIn, signOut };
}
