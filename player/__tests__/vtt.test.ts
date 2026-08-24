import { findActiveCue, parseVtt } from '../vtt';

/**
 * Subtitles arrive from release groups, not from a spec author: SRT with comma
 * decimals, VTT with styling tags, files with a BOM or CRLF, cues out of order.
 * The parser is deliberately forgiving, and these are the shapes it forgives.
 */

const VTT = `WEBVTT

1
00:00:01.000 --> 00:00:03.500
Hello there

2
00:00:04.000 --> 00:00:06.000 line:90%
<i>General</i> Kenobi
`;

describe('parseVtt', () => {
  it('reads a plain VTT file', () => {
    expect(parseVtt(VTT)).toEqual([
      { start: 1, end: 3.5, text: 'Hello there' },
      { start: 4, end: 6, text: 'General Kenobi' },
    ]);
  });

  it('strips styling tags but keeps the words', () => {
    expect(parseVtt(VTT)[1].text).toBe('General Kenobi');
  });

  it('ignores cue settings after the end timestamp', () => {
    // "line:90%" sits on the timing line and is not part of the time.
    expect(parseVtt(VTT)[1].end).toBe(6);
  });

  it('takes SRT with comma decimals', () => {
    const srt = '1\n00:00:02,250 --> 00:00:04,750\nSubtitle line\n';
    expect(parseVtt(srt)).toEqual([{ start: 2.25, end: 4.75, text: 'Subtitle line' }]);
  });

  it('takes MM:SS timestamps as well as HH:MM:SS', () => {
    expect(parseVtt('00:05.000 --> 00:07.000\nShort form\n')[0]).toEqual({
      start: 5,
      end: 7,
      text: 'Short form',
    });
  });

  it('survives CRLF line endings', () => {
    const crlf = '1\r\n00:00:01.000 --> 00:00:02.000\r\nWindows\r\n';
    expect(parseVtt(crlf)).toEqual([{ start: 1, end: 2, text: 'Windows' }]);
  });

  it('keeps a multi-line cue as one cue', () => {
    const two = '00:00:01.000 --> 00:00:02.000\nfirst line\nsecond line\n';
    expect(parseVtt(two)[0].text).toBe('first line\nsecond line');
  });

  it('drops blocks that cannot be believed', () => {
    // No timing, an empty body, and an end at or before the start - each of
    // which would otherwise become a cue that never clears or never shows.
    const junk = [
      'NOTE just a comment',
      '00:00:05.000 --> 00:00:05.000\nzero length',
      '00:00:09.000 --> 00:00:07.000\nbackwards',
      '00:00:10.000 --> 00:00:11.000\n',
    ].join('\n\n');
    expect(parseVtt(junk)).toEqual([]);
  });

  it('sorts cues by start, because findActiveCue binary searches them', () => {
    const shuffled = '00:00:09.000 --> 00:00:10.000\nlater\n\n00:00:01.000 --> 00:00:02.000\nearlier\n';
    expect(parseVtt(shuffled).map(c => c.text)).toEqual(['earlier', 'later']);
  });

  it('returns nothing for an empty file', () => {
    expect(parseVtt('')).toEqual([]);
    expect(parseVtt('WEBVTT\n')).toEqual([]);
  });
});

describe('findActiveCue', () => {
  const cues = parseVtt(VTT);

  it('finds the cue covering the moment', () => {
    expect(findActiveCue(cues, 2)?.text).toBe('Hello there');
    expect(findActiveCue(cues, 5)?.text).toBe('General Kenobi');
  });

  it('includes the start instant and excludes the end', () => {
    // Half-open, so two adjacent cues can never both be active.
    expect(findActiveCue(cues, 1)?.text).toBe('Hello there');
    expect(findActiveCue(cues, 3.5)).toBeNull();
  });

  it('returns nothing in the gaps and outside the file', () => {
    expect(findActiveCue(cues, 0)).toBeNull();
    expect(findActiveCue(cues, 3.75)).toBeNull();
    expect(findActiveCue(cues, 99)).toBeNull();
    expect(findActiveCue([], 1)).toBeNull();
  });
});
