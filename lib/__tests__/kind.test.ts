import { jellyfinKind, kindKey, tmdbKind } from '../kind';

describe('jellyfinKind', () => {
  it('reads anime off the genre list', () => {
    expect(jellyfinKind({ Id: '1', Name: 'Dororo', Type: 'Series', Genres: ['Action', 'Anime'] } as any)).toBe('anime');
  });

  it('reads anime off the scraper ids when the genres do not say so', () => {
    // Only an anime scraper writes these, so either one is enough on its own.
    expect(jellyfinKind({ Id: '1', Name: 'x', Type: 'Series', ProviderIds: { AniList: '101347' } } as any)).toBe('anime');
    expect(jellyfinKind({ Id: '1', Name: 'x', Type: 'Series', ProviderIds: { AniDB: '13946' } } as any)).toBe('anime');
  });

  it('leaves ordinary series and films alone', () => {
    expect(jellyfinKind({ Id: '1', Name: 'Better Call Saul', Type: 'Series', Genres: ['Drama'] } as any)).toBe('series');
    expect(jellyfinKind({ Id: '1', Name: 'Drive', Type: 'Movie' } as any)).toBe('movie');
    expect(jellyfinKind({ Id: '1', Name: 'E1', Type: 'Episode' } as any)).toBe('episode');
  });

  it('is not fooled by a Tmdb id, which everything has', () => {
    expect(jellyfinKind({ Id: '1', Name: 'x', Type: 'Series', ProviderIds: { Tmdb: '1396' } } as any)).toBe('series');
  });
});

describe('tmdbKind', () => {
  it('calls animated Japanese television anime', () => {
    expect(tmdbKind({ mediaType: 'tv', genreIds: [16, 10759], originalLanguage: 'ja' })).toBe('anime');
  });

  it('calls animated Japanese film anime too', () => {
    expect(tmdbKind({ mediaType: 'movie', genreIds: [16], originalLanguage: 'ja' })).toBe('anime');
  });

  it('does not call western animation anime', () => {
    expect(tmdbKind({ mediaType: 'tv', genreIds: [16], originalLanguage: 'en' })).toBe('series');
    expect(tmdbKind({ mediaType: 'movie', genreIds: [16], originalLanguage: 'en' })).toBe('movie');
  });

  it('does not call live-action Japanese drama anime', () => {
    expect(tmdbKind({ mediaType: 'tv', genreIds: [18], originalLanguage: 'ja' })).toBe('series');
  });

  it('copes with the fields missing', () => {
    expect(tmdbKind({ mediaType: 'tv' })).toBe('series');
    expect(tmdbKind({ mediaType: 'movie' })).toBe('movie');
  });
});

describe('kindKey', () => {
  it('builds the translation key so callers do not', () => {
    expect(kindKey('anime')).toBe('detail.kind.anime');
    expect(kindKey('movie')).toBe('detail.kind.movie');
  });
});
