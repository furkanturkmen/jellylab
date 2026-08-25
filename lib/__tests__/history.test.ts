import { groupByDay, historyTitle, playedDay } from '../history';

const at = (stamp?: string, extra: any = {}) => ({
  Id: Math.random().toString(36).slice(2),
  Name: 'Thing',
  Type: 'Movie',
  UserData: stamp ? { PlaybackPositionTicks: 0, Played: true, LastPlayedDate: stamp } : undefined,
  ...extra,
}) as any;

describe('playedDay', () => {
  it('reads the local day, not the UTC one', () => {
    // 23:00 UTC on the 6th is the 7th here - the suite pins Europe/Amsterdam.
    expect(playedDay(at('2026-01-06T23:00:00.000Z'))).toBe('2026-01-07');
  });

  it('says nothing when the server said nothing', () => {
    expect(playedDay(at())).toBeNull();
    expect(playedDay(at('not a date'))).toBeNull();
  });
});

describe('groupByDay', () => {
  it('keeps the order the server gave and starts a section per day', () => {
    const sections = groupByDay([
      at('2026-08-25T20:00:00.000Z'),
      at('2026-08-25T21:30:00.000Z'),
      at('2026-08-24T19:00:00.000Z'),
    ]);
    expect(sections.map(s => s.day)).toEqual(['2026-08-25', '2026-08-24']);
    expect(sections[0].items).toHaveLength(2);
  });

  // Dropping it would make the count wrong and the absence invisible.
  it('keeps an item the server gave no date for', () => {
    const sections = groupByDay([at('2026-08-25T20:00:00.000Z'), at()]);
    expect(sections).toHaveLength(1);
    expect(sections[0].items).toHaveLength(2);
  });

  it('has nothing to say about nothing', () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe('historyTitle', () => {
  it('names the series, the number and the episode', () => {
    expect(historyTitle(at(undefined, {
      Type: 'Episode',
      Name: 'Ryoumen Sukuna',
      SeriesName: 'Jujutsu Kaisen',
      ParentIndexNumber: 1,
      IndexNumber: 1,
    // The episode's own name stays: a history row that says only "S1 · E1" is
    // a worse answer to "what did I watch" than one that names the episode.
    }))).toBe('Jujutsu Kaisen · S1 · E1 · Ryoumen Sukuna');
  });

  it('leaves a film alone', () => {
    expect(historyTitle(at(undefined, { Name: 'Blade Runner' }))).toBe('Blade Runner');
  });
});
