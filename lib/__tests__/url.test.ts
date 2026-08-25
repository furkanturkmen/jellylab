import { queryString } from '../url';

describe('queryString', () => {
  it('encodes what axios would have left alone', () => {
    // The characters that made Jellyseerr answer 400.
    expect(queryString({ query: 'a,b:c+d' })).toBe('query=a%2Cb%3Ac%2Bd');
  });

  it('encodes spaces as %20, not as +', () => {
    expect(queryString({ query: 'blade runner' })).toBe('query=blade%20runner');
  });

  it('keeps the order it was given', () => {
    expect(queryString({ query: 'x', page: 2, language: 'nl' })).toBe('query=x&page=2&language=nl');
  });

  it('drops empty and missing values instead of sending bare keys', () => {
    expect(queryString({ query: 'x', page: undefined, language: '' })).toBe('query=x');
  });

  it('survives the punctuation a title actually contains', () => {
    expect(queryString({ query: "Howl's Moving Castle & Co." }))
      .toBe('query=Howl\'s%20Moving%20Castle%20%26%20Co.');
  });
});
