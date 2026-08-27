import { isAssDrawing, findActiveCue, parseVtt } from '../vtt';

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

  /**
   * An ASS track overlaps itself constantly - a sign stays up while several
   * lines are spoken over it - and a converted episode arrives with thousands
   * of such cues. A search that assumes cues never overlap finds nothing on
   * exactly those files.
   */
  describe('overlapping cues, as an ASS track has', () => {
    // A sign spanning the whole scene, with dialogue on top of it.
    const overlapping = [
      { start: 0, end: 60, text: 'sign: JUJUTSU HIGH' },
      { start: 5, end: 8, text: 'first line' },
      { start: 9, end: 12, text: 'second line' },
    ];

    it('finds a line spoken over a running sign', () => {
      expect(findActiveCue(overlapping, 6)?.text).toBe('first line');
      expect(findActiveCue(overlapping, 10)?.text).toBe('second line');
    });

    it('falls back to the sign between the lines', () => {
      expect(findActiveCue(overlapping, 3)?.text).toBe('sign: JUJUTSU HIGH');
      expect(findActiveCue(overlapping, 8.5)?.text).toBe('sign: JUJUTSU HIGH');
    });

    it('still reports nothing once everything has ended', () => {
      expect(findActiveCue(overlapping, 61)).toBeNull();
    });

    it('finds a cue buried under many later, shorter ones', () => {
      // The failure in the wild: the binary search landed on one of the short
      // cues, saw it had ended, and gave up while a long one was still open.
      const dense = [{ start: 0, end: 30, text: 'long sign' }];
      for (let i = 0; i < 200; i++) {
        dense.push({ start: 1 + i * 0.1, end: 1 + i * 0.1 + 0.05, text: `flash ${i}` });
      }
      dense.sort((a, b) => a.start - b.start);
      expect(findActiveCue(dense, 25)?.text).toBe('long sign');
    });
  });
});

describe('ASS styling that survives Jellyfin conversion', () => {
  it('drops an override block and keeps the line', () => {
    // Exactly what turned up on screen: the tags were being drawn as words.
    const vtt = [
      'WEBVTT',
      '',
      '00:00:12.000 --> 00:00:15.000',
      '{\\fad(984,1)\\blur9\\t(25,984,1 \\blur0.75)}Episode 3:',
    ].join('\n');
    expect(parseVtt(vtt)[0].text).toBe('Episode 3:');
  });

  it('drops several blocks in one line', () => {
    const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n{\\an8}{\\i1}Shibuya{\\i0}';
    expect(parseVtt(vtt)[0].text).toBe('Shibuya');
  });

  it('turns ASS line breaks into real ones', () => {
    const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nfirst\\Nsecond';
    expect(parseVtt(vtt)[0].text).toBe('first\nsecond');
  });

  it('keeps braces that are part of the dialogue', () => {
    // Only a brace followed by a backslash is an override.
    const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nthe set {a, b}';
    expect(parseVtt(vtt)[0].text).toBe('the set {a, b}');
  });

  it('drops a cue that was nothing but styling', () => {
    const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n{\\pos(960,540)}';
    expect(parseVtt(vtt)).toHaveLength(0);
  });
});

/**
 * ASS can carry vector shapes in the text, and a heavily typeset episode opens
 * with several. They are not words and must never reach the screen.
 */
describe('ASS drawing commands', () => {
  const drawn = (raw: string) => parseVtt(`WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n${raw}\n`);

  it('drops a cue that is a drawing', () => {
    // The exact shape that opened an episode with coordinates across the
    // middle of the picture.
    expect(drawn('{\\p1}m 0 0 l 100 0 l 100 -1 l 0 -1{\\p0}')).toEqual([]);
  });

  it('drops one whose tag rides along with other overrides', () => {
    expect(drawn('{\\fad(200,200)\\p1}m 0 0 l 50 0 l 50 -1{\\p0}')).toEqual([]);
  });

  it('drops one whose converter dropped the tag', () => {
    expect(drawn('m 0 22 l 100 22 l 100 23 l 0 23')).toEqual([]);
  });

  it('keeps the dialogue around it', () => {
    const cues = parseVtt(
      'WEBVTT\n\n' +
      '00:00:01.000 --> 00:00:04.000\n{\\p1}m 0 0 l 100 0 l 100 -1 l 0 -1{\\p0}\n\n' +
      '00:00:05.000 --> 00:00:08.000\nWhat was that?\n',
    );
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('What was that?');
  });

  it('does not mistake words for a path', () => {
    // \p0 is the switch back to text, not a drawing.
    expect(isAssDrawing('{\\p0}Run.', 'Run.')).toBe(false);
    expect(isAssDrawing('', 'I said no')).toBe(false);
    expect(isAssDrawing('', 'b')).toBe(false);
    // Numbers alone are a line someone might actually say.
    expect(isAssDrawing('', '100 200 300 400')).toBe(false);
    // A single command with too little behind it is not worth the risk.
    expect(isAssDrawing('', 'm 0 0')).toBe(false);
  });
});
