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

describe('dates without a time in them', () => {
  // TMDB release dates. These are calendar dates, not instants: parsing them
  // as midnight UTC and rendering in local time is a day wrong for everyone
  // west of Greenwich, which is most of the world.
  it('renders the day it was given, whatever the timezone', () => {
    expect(formatDate('2019-01-07')).toBe('07-01-2019');
    expect(formatDate('2020-12-31')).toBe('31-12-2020');
    expect(formatYear('2019-01-07')).toBe('2019');
  });

  // A timestamp is a moment, and a moment belongs to the reader's clock. The
  // suite pins Europe/Amsterdam so this states a fact rather than a location.
  it('still moves a timestamp into local time', () => {
    expect(formatDate('2019-01-06T23:00:00.0000000Z')).toBe('07-01-2019');
  });
});
