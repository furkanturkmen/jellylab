import { asText, clear, lines, record } from '../logStore';

describe('logStore', () => {
  beforeEach(() => clear());

  it('keeps lines oldest first', () => {
    record('log', ['first']);
    record('warn', ['second']);
    expect(lines().map(l => l.text)).toEqual(['first', 'second']);
    expect(lines().map(l => l.level)).toEqual(['log', 'warn']);
  });

  it('joins arguments the way the console would', () => {
    record('log', ['[jellylab]', 'hidden keywords:', 6]);
    expect(lines()[0].text).toBe('[jellylab] hidden keywords: 6');
  });

  it('renders an Error as its stack rather than {}', () => {
    const e = new Error('boom');
    record('error', [e]);
    expect(lines()[0].text).toContain('boom');
    expect(lines()[0].text).not.toBe('{}');
  });

  it('survives a value JSON cannot take', () => {
    const circular: any = {};
    circular.self = circular;
    expect(() => record('log', [circular])).not.toThrow();
    expect(lines()).toHaveLength(1);
  });

  /*
   * The cap is the whole reason this is a ring buffer: a player logs a line a
   * second, and an unbounded array on a phone is a leak with a countdown.
   */
  it('keeps only the most recent lines once the cap is passed', () => {
    for (let i = 0; i < 2500; i++) record('log', [`line ${i}`]);
    const out = lines();
    expect(out).toHaveLength(1000);
    expect(out[out.length - 1].text).toBe('line 2499');
    // The oldest survivor is 1000 from the end, never line 0.
    expect(out[0].text).toBe('line 1500');
  });

  it('truncates one very long line instead of letting it evict everything', () => {
    record('log', ['x'.repeat(5000)]);
    expect(lines()[0].text.length).toBeLessThanOrEqual(2001);
    expect(lines()[0].text.endsWith('…')).toBe(true);
  });

  it('puts the build and server above the lines, and drops empty fields', () => {
    record('log', ['something happened']);
    const text = asText({ app: '0.18.1', server: undefined, address: 'http://jellyfin' });
    expect(text).toContain('app: 0.18.1');
    expect(text).toContain('address: http://jellyfin');
    expect(text).not.toContain('server:');
    expect(text).toContain('something happened');
    // Header first, then a blank line, then the log.
    expect(text.indexOf('app: 0.18.1')).toBeLessThan(text.indexOf('something happened'));
  });

  it('says nothing at all when nothing was recorded', () => {
    expect(lines()).toEqual([]);
    expect(asText()).toBe('');
  });
});
