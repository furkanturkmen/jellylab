import {
  isFiltered, matchesDate, matchesStatus, matchesUser, statusBucket,
} from '../requestFilters';
import { type RequestState } from '../requests';

const NOW = Date.parse('2026-09-01T12:00:00.000Z');
const DAY = 86_400_000;
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('statusBucket', () => {
  it('puts the things somebody must act on together', () => {
    expect(statusBucket({ kind: 'pending' } as RequestState)).toBe('attention');
    expect(statusBucket({ kind: 'failed' } as RequestState)).toBe('attention');
    expect(statusBucket({ kind: 'stalled', percent: 12 } as RequestState)).toBe('attention');
  });

  it('splits searching on whether it has been too long', () => {
    // The same split the list ordering makes, so the filter and the sort never
    // disagree about which requests look wrong.
    expect(statusBucket({ kind: 'searching', days: 9, overdue: true } as RequestState)).toBe('attention');
    expect(statusBucket({ kind: 'searching', days: 0, overdue: false } as RequestState)).toBe('waiting');
  });

  it('treats everything still coming as waiting', () => {
    expect(statusBucket({ kind: 'importing' } as RequestState)).toBe('waiting');
    expect(statusBucket({ kind: 'airing' } as RequestState)).toBe('waiting');
    expect(statusBucket({ kind: 'unreleased' } as RequestState)).toBe('waiting');
  });

  it('counts a partly available series as available', () => {
    // It is watchable, which is the question the filter answers.
    expect(statusBucket({ kind: 'partial' } as RequestState)).toBe('available');
    expect(statusBucket({ kind: 'available' } as RequestState)).toBe('available');
  });

  it('keeps a declined request out of the states that are still working', () => {
    expect(statusBucket({ kind: 'declined' } as RequestState)).toBe('rejected');
  });

  it('falls back to waiting for a state it does not know', () => {
    expect(statusBucket({ kind: 'other' } as RequestState)).toBe('waiting');
  });
});

describe('matchesStatus', () => {
  it('lets everything through when nothing is chosen', () => {
    expect(matchesStatus({ kind: 'declined' } as RequestState, 'all')).toBe(true);
  });

  it('matches on the bucket, not the state name', () => {
    const state = { kind: 'unreleased' } as RequestState;
    expect(matchesStatus(state, 'waiting')).toBe(true);
    expect(matchesStatus(state, 'available')).toBe(false);
  });
});

describe('matchesDate', () => {
  it('lets everything through when nothing is chosen', () => {
    expect(matchesDate(undefined, 'all', NOW)).toBe(true);
  });

  it('counts today as the last 24 hours, not since midnight', () => {
    // Read at 02:00, a request made three hours earlier is still "today" to
    // whoever made it.
    expect(matchesDate(ago(3 * 3600_000), 'today', NOW)).toBe(true);
    expect(matchesDate(ago(23 * 3600_000), 'today', NOW)).toBe(true);
    expect(matchesDate(ago(25 * 3600_000), 'today', NOW)).toBe(false);
  });

  it('honours the week and month windows', () => {
    expect(matchesDate(ago(6 * DAY), 'week', NOW)).toBe(true);
    expect(matchesDate(ago(8 * DAY), 'week', NOW)).toBe(false);
    expect(matchesDate(ago(8 * DAY), 'month', NOW)).toBe(true);
    expect(matchesDate(ago(31 * DAY), 'month', NOW)).toBe(false);
  });

  it('hides a request with no date rather than guessing', () => {
    expect(matchesDate(undefined, 'week', NOW)).toBe(false);
    expect(matchesDate('not a date', 'week', NOW)).toBe(false);
  });

  it('shows a request from the future rather than hiding it', () => {
    // A device clock behind the server should not make requests vanish.
    expect(matchesDate(new Date(NOW + DAY).toISOString(), 'today', NOW)).toBe(true);
  });
});

describe('matchesUser', () => {
  it('lets everyone through when nothing is chosen', () => {
    expect(matchesUser(3, 'all')).toBe(true);
  });

  it('matches on the requester id', () => {
    expect(matchesUser(3, 3)).toBe(true);
    expect(matchesUser(4, 3)).toBe(false);
  });

  it('does not match a request with no requester against a chosen one', () => {
    expect(matchesUser(undefined, 3)).toBe(false);
  });
});

describe('isFiltered', () => {
  it('is false only when nothing is narrowing the list', () => {
    expect(isFiltered('all', 'all', 'all')).toBe(false);
    expect(isFiltered('attention', 'all', 'all')).toBe(true);
    expect(isFiltered('all', 'week', 'all')).toBe(true);
    expect(isFiltered('all', 'all', 2)).toBe(true);
  });
});
