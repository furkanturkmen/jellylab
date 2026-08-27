import { episodeAfter } from '../upnext';

/**
 * The card at the end of an episode gets one chance to offer the right thing,
 * and every way of getting it wrong looks the same from the outside: a card
 * naming an episode you have already seen, or no card at all.
 */
describe('episodeAfter', () => {
  const eps = [{ Id: 'e1' }, { Id: 'e2' }, { Id: 'e3' }];

  it('offers the next one', () => {
    expect(episodeAfter(eps, 'e1')?.Id).toBe('e2');
    expect(episodeAfter(eps, 'e2')?.Id).toBe('e3');
  });

  it('offers nothing after the last', () => {
    expect(episodeAfter(eps, 'e3')).toBeNull();
  });

  it('finds the episode by identity, not by position', () => {
    // Jellyfin's adjacentTo returns the neighbours *around* an episode, so the
    // one asked for is usually in the middle - but a first episode has no
    // neighbour before it and the list shifts. A fixed index would read e3.
    expect(episodeAfter([{ Id: 'e1' }, { Id: 'e2' }], 'e1')?.Id).toBe('e2');
    expect(episodeAfter([{ Id: 'e4' }, { Id: 'e5' }, { Id: 'e6' }], 'e5')?.Id).toBe('e6');
  });

  it('offers nothing when the episode is not in the list', () => {
    // The handover asking from the wrong episode is what once offered the
    // third: better to show no card than to skip one.
    expect(episodeAfter(eps, 'e9')).toBeNull();
  });

  it('offers nothing when there is no list, or no episode', () => {
    expect(episodeAfter([], 'e1')).toBeNull();
    expect(episodeAfter(eps, '')).toBeNull();
  });

  it('survives a gap in the list', () => {
    const holes = [{ Id: 'e1' }, null as any, { Id: 'e3' }];
    expect(episodeAfter(holes, 'e1')).toBeNull();
    expect(episodeAfter(holes, 'e3')).toBeNull();
  });
});
