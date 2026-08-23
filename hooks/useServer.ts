import { useEffect, useState } from 'react';
import {
  loadServers,
  subscribeServers,
  getCurrentServerSync,
  getServersSync,
  isLoaded,
} from '@/store/servers';
import type { Server } from '@/types';

export function useCurrentServer(): {
  server: Server | null;
  servers: Server[];
  ready: boolean;
} {
  const [state, setState] = useState<{ server: Server | null; servers: Server[]; ready: boolean }>({
    server: getCurrentServerSync(),
    servers: getServersSync(),
    ready: isLoaded(),
  });

  useEffect(() => {
    let cancelled = false;

    const refresh = () => {
      if (cancelled) return;
      setState({
        server: getCurrentServerSync(),
        servers: getServersSync(),
        ready: isLoaded(),
      });
    };

    if (!isLoaded()) {
      loadServers().then(refresh);
    } else {
      refresh();
    }

    const unsub = subscribeServers(refresh);
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  return state;
}
