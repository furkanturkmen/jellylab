import {
  ageForRating, kijkwijzerLabel, passesAge, usCertificationFor,
} from '../ratings';

describe('ageForRating', () => {
  it('reads US film ratings as ages', () => {
    expect(ageForRating('G')).toBe(0);
    expect(ageForRating('PG')).toBe(9);
    expect(ageForRating('PG-13')).toBe(13);
    expect(ageForRating('R')).toBe(17);
    expect(ageForRating('NC-17')).toBe(18);
  });

  it('reads US TV ratings as the same ages Jellyfin uses', () => {
    // R and TV-MA both score 17 on Jellyfin's scale, which is what lets one
    // number cover films and television at once.
    expect(ageForRating('TV-14')).toBe(14);
    expect(ageForRating('TV-MA')).toBe(17);
    expect(ageForRating('TV-Y7')).toBe(7);
  });

  it('ignores the content-warning suffixes', () => {
    // TV-14-DLSV says which warnings apply, not a different age. There are
    // about thirty of these and listing them all would be a maintenance trap.
    expect(ageForRating('TV-14-DLSV')).toBe(14);
    expect(ageForRating('TV-MA-LV')).toBe(17);
    expect(ageForRating('TV-PG-V')).toBe(9);
  });

  it('reads Kijkwijzer labels', () => {
    expect(ageForRating('AL')).toBe(0);
    expect(ageForRating('12')).toBe(12);
    expect(ageForRating('16')).toBe(16);
  });

  it('is case and whitespace insensitive', () => {
    expect(ageForRating(' pg-13 ')).toBe(13);
  });

  it('says nothing rather than guessing', () => {
    // Null is "unknown", not "suitable for everyone" - the difference is the
    // whole reason blocking unrated items is its own switch.
    expect(ageForRating('NR')).toBeNull();
    expect(ageForRating('')).toBeNull();
    expect(ageForRating(undefined)).toBeNull();
  });
});

describe('kijkwijzerLabel', () => {
  it('names the categories', () => {
    expect(kijkwijzerLabel(0)).toBe('AL');
    expect(kijkwijzerLabel(12)).toBe('12');
    expect(kijkwijzerLabel(18)).toBe('18');
  });

  it('rounds down to the category an age actually admits', () => {
    // 13 admits everything rated 12 and nothing rated 14.
    expect(kijkwijzerLabel(13)).toBe('12');
    expect(kijkwijzerLabel(17)).toBe('16');
  });

  it('has nothing to say about no cap', () => {
    expect(kijkwijzerLabel(null)).toBeNull();
    expect(kijkwijzerLabel(undefined)).toBeNull();
  });
});

describe('usCertificationFor', () => {
  it('picks the highest certification within the cap', () => {
    expect(usCertificationFor(0)).toBe('G');
    expect(usCertificationFor(9)).toBe('PG');
    expect(usCertificationFor(14)).toBe('PG-13');
    expect(usCertificationFor(18)).toBe('NC-17');
  });

  it('reads a cap conservatively', () => {
    // A cap of 12 must not admit PG-13, because PG-13 means thirteen.
    expect(usCertificationFor(12)).toBe('PG');
    // 16 must not admit R, which means seventeen.
    expect(usCertificationFor(16)).toBe('PG-13');
  });

  it('asks for nothing when there is no cap', () => {
    expect(usCertificationFor(null)).toBeNull();
  });
});

describe('passesAge', () => {
  it('lets everything through with no cap', () => {
    expect(passesAge('R', null)).toBe(true);
  });

  it('compares the rating against the cap', () => {
    expect(passesAge('PG-13', 14)).toBe(true);
    expect(passesAge('TV-14', 14)).toBe(true);
    expect(passesAge('R', 14)).toBe(false);
    expect(passesAge('TV-MA', 16)).toBe(false);
  });

  it('lets an unrated item through unless asked not to', () => {
    expect(passesAge('NR', 12)).toBe(true);
    expect(passesAge('NR', 12, true)).toBe(false);
    expect(passesAge(undefined, 12, true)).toBe(false);
  });
});
