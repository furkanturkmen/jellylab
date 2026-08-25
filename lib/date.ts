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

/**
 * "2019-01-07" - a date with no time in it.
 *
 * TMDB sends release dates this way, and they are calendar dates rather than
 * instants: the 7th of January is the 7th of January in Auckland and in
 * Vancouver. `new Date("2019-01-07")` reads it as midnight UTC, which then
 * displays as the 6th anywhere west of Greenwich - a day wrong, quietly, for
 * every release date in the app.
 */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function calendarParts(input: unknown): { year: string; month: string; day: string } | null {
  if (typeof input !== 'string') return null;
  const match = DATE_ONLY.exec(input.trim());
  return match ? { year: match[1], month: match[2], day: match[3] } : null;
}

function parse(input: string | number | Date | undefined | null): Date | null {
  if (input == null || input === '') return null;
  const date = input instanceof Date ? input : new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "18-09-2020", or an empty string when there is no usable date. */
export function formatDate(input: string | number | Date | undefined | null): string {
  const parts = calendarParts(input);
  if (parts) return `${parts.day}-${parts.month}-${parts.year}`;

  const date = parse(input);
  if (!date) return '';
  // A timestamp is an instant, and an instant belongs in the timezone of
  // whoever is reading it.
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
  const parts = calendarParts(input);
  if (parts) return parts.year;

  const date = parse(input);
  return date ? String(date.getFullYear()) : '';
}
