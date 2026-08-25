import de from '../locales/de.json';
import en from '../locales/en.json';
import nl from '../locales/nl.json';
import tr from '../locales/tr.json';

/** Every leaf key, flattened: "player.subtitles", "settings.labels.engine". */
function paths(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    paths(child, prefix ? `${prefix}.${key}` : key),
  );
}

const LOCALES = { nl, tr, de };
const english = paths(en).sort();

describe('locales', () => {
  // A key added to one file and forgotten in the others shows up in the app as
  // an English word in a Dutch sentence, which is exactly what these files
  // exist to prevent.
  it.each(Object.keys(LOCALES))('%s has the same keys as English', name => {
    const theirs = paths(LOCALES[name as keyof typeof LOCALES]).sort();
    expect(theirs.filter(k => !english.includes(k))).toEqual([]);
    expect(english.filter(k => !theirs.includes(k))).toEqual([]);
  });

  it.each(Object.entries({ en, ...LOCALES }))('%s has no empty copy', (_name, dict) => {
    const empties = paths(dict).filter(path => {
      const value = path.split('.').reduce<any>((node, key) => node?.[key], dict);
      return typeof value === 'string' && value.trim() === '';
    });
    expect(empties).toEqual([]);
  });

  // Placeholders are part of the string, so a translation that drops one prints
  // a sentence with a hole in it.
  it.each(Object.keys(LOCALES))('%s keeps every placeholder', name => {
    const dict = LOCALES[name as keyof typeof LOCALES];
    const wrong: string[] = [];
    for (const path of english) {
      const value = path.split('.').reduce<any>((node, key) => node?.[key], en);
      const theirs = path.split('.').reduce<any>((node, key) => node?.[key], dict);
      if (typeof value !== 'string' || typeof theirs !== 'string') continue;
      const expected = (value.match(/{{\w+}}/g) ?? []).sort().join(',');
      const actual = (theirs.match(/{{\w+}}/g) ?? []).sort().join(',');
      if (expected !== actual) wrong.push(`${path}: expected ${expected || 'none'}, got ${actual || 'none'}`);
    }
    expect(wrong).toEqual([]);
  });
});
