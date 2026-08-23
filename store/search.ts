import { useEffect, useState } from 'react';

let _query = '';
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach(fn => fn());
}

export function getSearchQuery(): string {
  return _query;
}

export function setSearchQuery(q: string): void {
  if (_query === q) return;
  _query = q;
  notify();
}

export function subscribeSearchQuery(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function useSearchQuery(): [string, (q: string) => void] {
  const [q, setQ] = useState(_query);
  useEffect(() => {
    const unsub = subscribeSearchQuery(() => setQ(_query));
    return unsub;
  }, []);
  return [q, setSearchQuery];
}
