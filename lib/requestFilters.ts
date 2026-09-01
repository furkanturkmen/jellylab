import { type RequestState } from './requests';

/**
 * Filtering for the Requests tab.
 *
 * Kept separate from `requests.ts` because that module answers "what is
 * happening to this request" and this one answers "does the reader want to see
 * it" - and only the second changes when someone touches a menu.
 *
 * The status buckets are deliberately coarser than `RequestState`. The cards
 * show eleven states; eleven menu entries would be a worse control than five,
 * and nobody looks for "unreleased" separately from "airing" - they look for
 * "not here yet".
 */
export type StatusFilter =
  | 'all'
  | 'attention'
  | 'downloading'
  | 'waiting'
  | 'available'
  | 'rejected';

export type DateFilter = 'all' | 'today' | 'week' | 'month';

export const STATUS_FILTERS: StatusFilter[] =
  ['all', 'attention', 'downloading', 'waiting', 'available', 'rejected'];

export const DATE_FILTERS: DateFilter[] = ['all', 'today', 'week', 'month'];

/**
 * Which bucket a state belongs to.
 *
 * `searching` splits: one that has been looking for days is something to act
 * on, one that started this morning is just waiting. That is the same
 * distinction `attention()` makes when ordering the list, so the filter and the
 * sort agree about what is wrong.
 */
export function statusBucket(state: RequestState): Exclude<StatusFilter, 'all'> {
  switch (state.kind) {
    case 'pending':
    case 'failed':
    case 'stalled':
      return 'attention';
    case 'searching':
      return state.overdue ? 'attention' : 'waiting';
    case 'downloading':
      return 'downloading';
    case 'importing':
    case 'airing':
    case 'unreleased':
      return 'waiting';
    case 'available':
    case 'partial':
      return 'available';
    case 'declined':
      return 'rejected';
    default:
      return 'waiting';
  }
}

export function matchesStatus(state: RequestState, filter: StatusFilter): boolean {
  return filter === 'all' || statusBucket(state) === filter;
}

const DAY = 86_400_000;

/**
 * Whether a request was made recently enough.
 *
 * "Today" is the last 24 hours rather than since midnight: the list is read at
 * two in the morning as often as at noon, and a request made an hour ago
 * disappearing because the date rolled over would be a bug to whoever made it.
 */
export function matchesDate(createdAt: string | undefined, filter: DateFilter, now: number): boolean {
  if (filter === 'all') return true;
  if (!createdAt) return false;
  const at = Date.parse(createdAt);
  if (Number.isNaN(at)) return false;
  const age = now - at;
  // A clock that disagrees with the server can make a request look like it
  // arrives from the future. Show it rather than hiding it.
  if (age < 0) return true;
  const window = filter === 'today' ? DAY : filter === 'week' ? 7 * DAY : 30 * DAY;
  return age <= window;
}

export function matchesUser(requestedById: number | undefined, filter: number | 'all'): boolean {
  return filter === 'all' || requestedById === filter;
}

/** Whether anything is narrowing the list, which decides what "empty" means. */
export function isFiltered(status: StatusFilter, date: DateFilter, user: number | 'all'): boolean {
  return status !== 'all' || date !== 'all' || user !== 'all';
}
