import { parseStored } from '../json';

/**
 * This helper exists because a damaged value in storage took the app down at
 * launch and kept it down - the only repair was deleting the app. Every case
 * here is "storage lied to us"; none of them may throw.
 */

describe('parseStored', () => {
  // The helper logs what it could not read, which is the point of it - but a
  // suite that prints on the way past hides the run that actually failed.
  let log: jest.SpyInstance;
  beforeEach(() => { log = jest.spyOn(console, 'log').mockImplementation(() => {}); });
  afterEach(() => { log.mockRestore(); });

  it('reads a value that is there', () => {
    expect(parseStored('{"a":1}', null, 'thing')).toEqual({ a: 1 });
    expect(parseStored('[1,2]', [], 'list')).toEqual([1, 2]);
  });

  it('treats absence as the fallback', () => {
    expect(parseStored(null, [], 'list')).toEqual([]);
    expect(parseStored(undefined, null, 'thing')).toBeNull();
    expect(parseStored('', [], 'list')).toEqual([]);
  });

  it('treats the literal string "undefined" as absence', () => {
    // Exactly what broke it: setItem(key, String(undefined)).
    expect(parseStored('undefined', [], 'server list')).toEqual([]);
  });

  it('survives a truncated blob', () => {
    expect(parseStored('{"servers":[{"id"', [], 'server list')).toEqual([]);
  });

  it('says which value it could not read', () => {
    parseStored('not json', [], 'server list');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('server list'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('[jellylab]'));
  });

  it('does not log when there was simply nothing stored', () => {
    parseStored(null, [], 'server list');
    expect(log).not.toHaveBeenCalled();
  });
});
