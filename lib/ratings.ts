/**
 * Age ratings, in Kijkwijzer terms.
 *
 * One integer age carries all of it. Jellyfin's own parental scale is already
 * ages rather than labels - PG scores 9, PG-13 scores 13, TV-14 scores 14, and
 * R, NC-17 and TV-MA all score 17 - so a US film rating, a US TV rating and a
 * Dutch one compare directly. Only the wording differs, and the wording here is
 * Dutch because that is what the household reads.
 *
 * Nothing in this file translates ratings. It maps between the age and the two
 * vocabularies that have to be spoken to: Kijkwijzer for people, and a US
 * certification for TMDB, whose data outside the US is patchy enough that
 * asking in US terms finds more.
 */

/** Kijkwijzer's categories, lowest first. 14 was added in 2019. */
export const KIJKWIJZER: { age: number; label: string }[] = [
  { age: 0, label: 'AL' },
  { age: 6, label: '6' },
  { age: 9, label: '9' },
  { age: 12, label: '12' },
  { age: 14, label: '14' },
  { age: 16, label: '16' },
  { age: 18, label: '18' },
];

/**
 * The Kijkwijzer category an age belongs to.
 *
 * Rounds *down* to the nearest category, so an age between two of them lands on
 * the more permissive label it actually admits rather than one it does not.
 */
export function kijkwijzerLabel(age: number | null | undefined): string | null {
  if (age == null) return null;
  let found: string | null = null;
  for (const k of KIJKWIJZER) {
    if (k.age <= age) found = k.label;
  }
  return found ?? KIJKWIJZER[0].label;
}

/**
 * What common rating strings mean in years.
 *
 * The same numbers Jellyfin uses, so a check done here and a check done by the
 * server agree. Suffixed US TV ratings (TV-14-DLV and friends) are handled by
 * the prefix match in `ageForRating` rather than by listing all thirty of them.
 */
const RATING_AGES: Record<string, number> = {
  // US film
  G: 0, PG: 9, 'PG-13': 13, R: 17, 'NC-17': 18,
  // US TV
  'TV-Y': 0, 'TV-G': 0, 'TV-Y7': 7, 'TV-PG': 9, 'TV-14': 14, 'TV-MA': 17,
  'TV-AO': 18,
  // Kijkwijzer, as Jellyfin writes it for a Dutch metadata country
  AL: 0, '6': 6, '9': 9, '12': 12, '14': 14, '16': 16, '18': 18,
};

/**
 * The age a rating string implies, or null when it says nothing.
 *
 * Null is not "suitable for everyone" - it is "unknown", and the caller has to
 * decide. Blocking unrated items is a separate switch for exactly that reason:
 * an age cap on its own lets everything unrated straight through.
 */
export function ageForRating(rating: string | null | undefined): number | null {
  if (!rating) return null;
  const key = rating.trim().toUpperCase();
  if (key in RATING_AGES) return RATING_AGES[key];
  // TV-14-DLSV and the rest: the suffix says which content warnings apply, not
  // a different age.
  const base = key.match(/^(TV-(?:Y7|MA|PG|14|G|Y|AO))\b/)?.[1];
  if (base && base in RATING_AGES) return RATING_AGES[base];
  return null;
}

/** US film certifications, lowest age first, for TMDB's certification filter. */
const US_CERTIFICATIONS: { age: number; certification: string }[] = [
  { age: 0, certification: 'G' },
  { age: 9, certification: 'PG' },
  { age: 13, certification: 'PG-13' },
  { age: 17, certification: 'R' },
  { age: 18, certification: 'NC-17' },
];

/**
 * The US certification to pass as `certificationLte` for a given age cap.
 *
 * The highest certification whose own age is within the cap, which is the
 * conservative reading: a cap of 12 admits PG and not PG-13, because PG-13
 * means thirteen. Returns null for a cap below the lowest certification, where
 * there is nothing to ask for.
 */
export function usCertificationFor(maxAge: number | null | undefined): string | null {
  if (maxAge == null) return null;
  let found: string | null = null;
  for (const c of US_CERTIFICATIONS) {
    if (c.age <= maxAge) found = c.certification;
  }
  return found;
}

/**
 * Whether an item passes an age cap.
 *
 * `unrated` decides what happens to something carrying no rating at all, and
 * defaults to letting it through - the caller that cares says so, matching how
 * Jellyfin treats BlockUnratedItems as its own setting.
 */
export function passesAge(
  rating: string | null | undefined,
  maxAge: number | null | undefined,
  blockUnrated = false,
): boolean {
  if (maxAge == null) return true;
  const age = ageForRating(rating);
  if (age == null) return !blockUnrated;
  return age <= maxAge;
}
