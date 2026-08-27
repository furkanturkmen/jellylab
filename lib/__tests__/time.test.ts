import { formatTime } from '@/components/Scrubber';

/**
 * The clock either side of the scrubber. It had no tests while it lived inside
 * the item screen, because nothing there could be reached without mounting a
 * player.
 */
describe('formatTime', () => {
  it('writes minutes and seconds under an hour', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(9)).toBe('0:09');
    expect(formatTime(61)).toBe('1:01');
    expect(formatTime(599)).toBe('9:59');
    expect(formatTime(600)).toBe('10:00');
  });

  it('pads the minutes only once there is an hour in front of them', () => {
    // 9:59 stays 9:59, but 1:09:59 pads to two digits so the columns line up.
    expect(formatTime(3599)).toBe('59:59');
    expect(formatTime(3600)).toBe('1:00:00');
    expect(formatTime(3959)).toBe('1:05:59');
    expect(formatTime(36000)).toBe('10:00:00');
  });

  it('drops the fraction rather than rounding up', () => {
    // Rounding up would show 1:00 while the player still says 59 seconds.
    expect(formatTime(59.9)).toBe('0:59');
    expect(formatTime(3599.9)).toBe('59:59');
  });

  it('answers 0:00 for nothing, rather than NaN', () => {
    // A player reports no duration until it has loaded, and "NaN:NaN" on
    // screen is worse than a zero that is about to be replaced.
    expect(formatTime(NaN)).toBe('0:00');
    expect(formatTime(Infinity)).toBe('0:00');
    expect(formatTime(undefined as unknown as number)).toBe('0:00');
  });
});
