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

  // Decimals in the middle of a download are noise.
  it('keeps whole numbers for the long stretch', () => {
    expect(formatPercent(0.432)).toBe('43%');
    expect(formatPercent(0.5)).toBe('50%');
    expect(formatPercent(0.99)).toBe('99%');
  });

  it('floors rather than rounds, so it never runs ahead', () => {
    expect(formatPercent(0.789)).toBe('78%');
  });

  it('has nothing to show for nothing', () => {
    expect(formatPercent(null)).toBe('');
    expect(formatPercent(undefined)).toBe('');
    expect(formatPercent(NaN)).toBe('');
    expect(formatPercent(-0.5)).toBe('0%');
  });
});
