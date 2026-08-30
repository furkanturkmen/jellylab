import { formatPercent } from '../percent';

describe('formatPercent', () => {
  // The case that started this: qBittorrent said 99.7%, the app said 100%.
  it('does not round an unfinished download up to 100', () => {
    expect(formatPercent(0.997)).toBe('99.7%');
    expect(formatPercent(0.9997)).toBe('99.9%');
  });

  it('says 100% only when it is', () => {
    expect(formatPercent(1)).toBe('100%');
    expect(formatPercent(1.2)).toBe('100%');
  });

  // Whole numbers used to hide a tenth of a percent, which on a 30GB season is
  // 30MB - enough to make a bar that is visibly moving look frozen.
  it('keeps one decimal the whole way', () => {
    expect(formatPercent(0.432)).toBe('43.2%');
    expect(formatPercent(0.5)).toBe('50.0%');
    expect(formatPercent(0.99)).toBe('99.0%');
  });

  it('floors rather than rounds, so it never runs ahead', () => {
    expect(formatPercent(0.789)).toBe('78.9%');
    // 43.79 must not become 43.8, let alone 44.
    expect(formatPercent(0.4379)).toBe('43.7%');
  });

  it('has nothing to show for nothing', () => {
    expect(formatPercent(null)).toBe('');
    expect(formatPercent(undefined)).toBe('');
    expect(formatPercent(NaN)).toBe('');
    expect(formatPercent(-0.5)).toBe('0.0%');
  });
});
