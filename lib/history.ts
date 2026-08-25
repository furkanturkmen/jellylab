import type { JellyfinItem } from '@/types';

/**
 * A history reads by day, not by item.
 *
 * "Tuesday, four episodes" is the shape of the answer people want from it, so
 * the list is grouped before it is drawn. Jellyfin sorts by DatePlayed and the
 * grouping trusts that order rather than re-sorting: an item the server put
 * first belongs first, whatever its stamp says.
 */
export type HistorySection = {
  /** ISO day, "2026-08-25" - the screen formats it. */
  day: string;
  items: JellyfinItem[];
};

/** The local calendar day of a stamp, as the key a section is built on. */
export function playedDay(item: JellyfinItem): string | null {
  const stamp = item.UserData?.LastPlayedDate;
  if (!stamp) return null;
  const date = new Date(stamp);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  // Local, not UTC: something watched at one in the morning belongs to that
  // night, in the timezone of whoever is looking at the list.
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function groupByDay(items: JellyfinItem[]): HistorySection[] {
  const sections: HistorySection[] = [];
  for (const item of items) {
    const day = playedDay(item);
    // No stamp means the server did not say when. It still belongs in the
    // list - it was watched - so it joins whatever section is open rather
    // than being dropped.
    const key = day ?? sections[sections.length - 1]?.day ?? 'unknown';
    const current = sections[sections.length - 1];
    if (current && current.day === key) current.items.push(item);
    else sections.push({ day: key, items: [item] });
  }
  return sections;
}

/** "Jujutsu Kaisen · S1 · E3", or just the film's name. */
export function historyTitle(item: JellyfinItem): string {
  if (item.Type !== 'Episode') return item.Name;
  const episode = item.ParentIndexNumber != null && item.IndexNumber != null
    ? `S${item.ParentIndexNumber} · E${item.IndexNumber}`
    : null;
  return [item.SeriesName ?? item.Name, episode, item.SeriesName ? item.Name : null]
    .filter(Boolean)
    .join(' · ');
}
