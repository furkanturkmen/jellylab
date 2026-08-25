import { formatDate, formatDateTime, formatTime, formatYear } from '../date';

describe('formatDate', () => {
  it('writes dd-mm-yyyy, padded', () => {
    expect(formatDate('2020-09-18T00:00:00Z')).toBe('18-09-2020');
    expect(formatDate('2026-01-05T12:00:00Z')).toBe('05-01-2026');
  });

  it('takes what the two servers actually send', () => {
    // Jellyfin sends a full ISO stamp with ticks-derived precision; TMDB sends
    // a bare date.
    expect(formatDate('2019-01-06T23:00:00.0000000Z')).toBe('07-01-2019');
    expect(formatDate('2019-01-07')).toBe('07-01-2019');
  });

  it('takes a Date and an epoch', () => {
    expect(formatDate(new Date(2024, 11, 25))).toBe('25-12-2024');
    expect(formatDate(new Date(2024, 11, 25).getTime())).toBe('25-12-2024');
  });

  it('says nothing rather than "Invalid Date"', () => {
    expect(formatDate(undefined)).toBe('');
    expect(formatDate(null)).toBe('');
    expect(formatDate('')).toBe('');
    expect(formatDate('not a date')).toBe('');
  });
});

describe('formatTime', () => {
  it('writes hh:mm on a 24 hour clock', () => {
    expect(formatTime(new Date(2024, 0, 1, 21, 45))).toBe('21:45');
    expect(formatTime(new Date(2024, 0, 1, 9, 5))).toBe('09:05');
    expect(formatTime(new Date(2024, 0, 1, 0, 0))).toBe('00:00');
  });

  it('says nothing for nothing', () => {
    expect(formatTime(undefined)).toBe('');
    expect(formatTime('rubbish')).toBe('');
  });
});

describe('formatDateTime', () => {
  it('joins them the way the app separates things', () => {
    expect(formatDateTime(new Date(2024, 8, 18, 21, 45))).toBe('18-09-2024 · 21:45');
  });
});

describe('formatYear', () => {
  it('keeps only the year', () => {
    expect(formatYear('2019-01-07')).toBe('2019');
    expect(formatYear(undefined)).toBe('');
  });
});
