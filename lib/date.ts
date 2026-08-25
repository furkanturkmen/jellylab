/**
 * One date format across the app: dd-mm-yyyy, and hh:mm when a time is needed.
 *
 * Not the device locale. Dates were reaching the screen three different ways -
 * an ISO string straight from Jellyfin ("2020-09-18"), a long form from TMDB
 * ("7 January 2019"), and whatever toLocaleDateString() decided, which on this
 * phone meant American month-first ("8/24/2026"). Three formats, one of them
 * ambiguous: 8/9 reads as August ninth or the ninth of August depending on who
 * is holding the phone.
 *
 * A fixed format is the one thing that cannot be misread by the person this app
 * was built for.
 */

function parse(input: string | number | Date | undefined | null): Date | null {
  if (input == null || input === '') return null;
  const date = input instanceof Date ? input : new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "18-09-2020", or an empty string when there is no usable date. */
export function formatDate(input: string | number | Date | undefined | null): string {
  const date = parse(input);
  if (!date) return '';
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
}

/** "21:45", 24-hour, because that is how the rest of this app reads times. */
export function formatTime(input: string | number | Date | undefined | null): string {
  const date = parse(input);
  if (!date) return '';
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "18-09-2020 · 21:45", for the rare place that wants both. */
export function formatDateTime(input: string | number | Date | undefined | null): string {
  const date = parse(input);
  if (!date) return '';
  return `${formatDate(date)} · ${formatTime(date)}`;
}

/** Just the year, for pills and rows that only have room for one. */
export function formatYear(input: string | number | Date | undefined | null): string {
  const date = parse(input);
  return date ? String(date.getFullYear()) : '';
}
