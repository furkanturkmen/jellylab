import { useCallback, useEffect, useState } from 'react';
import * as Jellyfin from '@/api/jellyfin';
import * as Jellyseerr from '@/api/jellyseerr';
import { rememberAccount } from '@/store/accounts';
import { loadJellyfinAuth, subscribeJellyfinAuth } from '@/store/auth';
import { describeSeerrError, setSeerrError } from '@/store/seerrStatus';
import { getJellyseerrUrl } from '@/config';
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
      setSeerrError(null);
    } catch (e) {
      // Still non-fatal - Jellyfin is what the app is for, and it must keep
      // working when only Seerr is down. But the reason is kept now instead of
      // dropped, so the screens that go empty because of it can say why.
      setSeerrError(describeSeerrError(e, getJellyseerrUrl()));
    }
    // Remembered so the switcher can offer this person by name next time.
    // Nothing secret: a name, a server and an avatar tag.
    await rememberAccount({
      userId: auth.userId,
      userName: auth.userName,
      serverId: auth.serverId,
      primaryImageTag: auth.primaryImageTag,
    }).catch(() => {});
    setState({ status: 'signed-in', auth });
    return auth;
  }, []);

  const signOut = useCallback(async () => {
    setSeerrError(null);
    await Promise.allSettled([Jellyfin.logout(), Jellyseerr.logout()]);
    setState({ status: 'signed-out', auth: null });
  }, []);

  return { state, signIn, signOut };
}
