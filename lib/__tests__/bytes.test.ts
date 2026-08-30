import { formatBytes } from '../bytes';

const MB = 1024 ** 2;
const GB = 1024 ** 3;

describe('formatBytes', () => {
  it('keeps an episode in megabytes rather than rounding it to 0 GB', () => {
    expect(formatBytes(340 * MB)).toBe('340 MB');
  });

  // A live speed reading is the case this exists for: rounding 2.6 to 3 is a
  // 15% overstatement of the number people judge a download by.
  it('keeps a decimal where a tenth of a megabyte is the whole point', () => {
    expect(formatBytes(2.6 * MB)).toBe('2.6 MB');
    expect(formatBytes(12.4 * MB)).toBe('12.4 MB');
    // Past a hundred the decimal is noise again.
    expect(formatBytes(340 * MB)).toBe('340 MB');
  });

  it('gains a decimal where one gigabyte of difference matters', () => {
    expect(formatBytes(2.4 * GB)).toBe('2.4 GB');
  });

  it('drops the decimal once the number is large enough not to need it', () => {
    expect(formatBytes(48 * GB)).toBe('48 GB');
  });

  it('goes to terabytes for a drive', () => {
    expect(formatBytes(3.5 * 1024 * GB)).toBe('3.50 TB');
  });

  it('says something sane for nothing at all', () => {
    expect(formatBytes(0)).toBe('0 MB');
    expect(formatBytes(-1)).toBe('0 MB');
    expect(formatBytes(NaN)).toBe('0 MB');
    // A file the server reported a size for, but a tiny one.
    expect(formatBytes(900)).toBe('< 1 MB');
  });
});
