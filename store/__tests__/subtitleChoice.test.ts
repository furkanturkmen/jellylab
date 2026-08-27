import { DEFAULT_PREFS, withSubtitleChoice } from '../prefs';

/**
 * English by default everywhere; a choice made about one title wins for that
 * title only. The old behaviour was one label for everything, so picking a
 * Dutch track on one film made Dutch the default on every title that carried
 * one - quietly beating the language preference across the whole library.
 */
describe('withSubtitleChoice', () => {
  it('files a choice under the title it was made about', () => {
    const prefs = withSubtitleChoice(DEFAULT_PREFS, 'series-1', 'Dutch - SUBRIP');
    expect(prefs.subtitleChoices).toEqual({ 'series-1': 'Dutch - SUBRIP' });
  });

  it('leaves every other title alone', () => {
    let prefs = withSubtitleChoice(DEFAULT_PREFS, 'film-a', 'Dutch - SUBRIP');
    prefs = withSubtitleChoice(prefs, 'film-b', 'English - SUBRIP');
    expect(prefs.subtitleChoices['film-a']).toBe('Dutch - SUBRIP');
    expect(prefs.subtitleChoices['film-b']).toBe('English - SUBRIP');
    // The one nobody chose for still has no choice, so English wins there.
    expect(prefs.subtitleChoices['film-c']).toBeUndefined();
  });

  it('replaces a choice rather than stacking them', () => {
    let prefs = withSubtitleChoice(DEFAULT_PREFS, 'film-a', 'Dutch - SUBRIP');
    prefs = withSubtitleChoice(prefs, 'film-a', 'English - SUBRIP');
    expect(prefs.subtitleChoices).toEqual({ 'film-a': 'English - SUBRIP' });
  });

  it('stores off like any other choice', () => {
    // Off is a decision about this title, not a global switch - which is what
    // it used to be, and why subtitles once stopped appearing everywhere.
    const prefs = withSubtitleChoice(DEFAULT_PREFS, 'film-a', 'off');
    expect(prefs.subtitleChoices['film-a']).toBe('off');
  });

  it('an empty label clears the choice, handing the title back to the preference', () => {
    let prefs = withSubtitleChoice(DEFAULT_PREFS, 'film-a', 'Dutch - SUBRIP');
    prefs = withSubtitleChoice(prefs, 'film-a', '');
    expect(prefs.subtitleChoices['film-a']).toBeUndefined();
  });

  it('drops the oldest once it is holding fifty', () => {
    let prefs = DEFAULT_PREFS;
    for (let i = 0; i < 55; i++) prefs = withSubtitleChoice(prefs, `t-${i}`, 'English');
    const keys = Object.keys(prefs.subtitleChoices);
    expect(keys).toHaveLength(50);
    expect(keys[0]).toBe('t-5');
    expect(keys[49]).toBe('t-54');
  });

  it('does not mutate the prefs it was given', () => {
    const before = withSubtitleChoice(DEFAULT_PREFS, 'film-a', 'Dutch');
    const after = withSubtitleChoice(before, 'film-b', 'English');
    expect(before.subtitleChoices['film-b']).toBeUndefined();
    expect(after.subtitleChoices['film-b']).toBe('English');
  });
});
