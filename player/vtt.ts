export type VttCue = { start: number; end: number; text: string };

/**
 * Strip the styling an ASS subtitle carries inside its text.
 *
 * Jellyfin converts SSA/ASS to WebVTT by rewriting the timings and leaving the
 * dialogue alone, so the override blocks survive the trip and are drawn as if
 * they were words - a line arriving on screen as
 * `{\fad(984,1)\blur9\t(25,984,1 \blur0.75)}Episode 3:`.
 *
 * Only a brace immediately followed by a backslash counts as an override,
 * which is what the format specifies, so dialogue that genuinely contains
 * {braces} keeps them.
 */
function stripAssTags(text: string): string {
  return text
    .replace(/\{\\[^}]*\}/g, '')
    // ASS carries its own line breaks: \N is a hard break, \n a soft one and
    // \h a non-breaking space. Each is a literal backslash in the text, not
    // an escape - which is exactly the mistake that made this replace every
    // letter "h" with a space the first time round.
    .replace(/\\N/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\h/g, ' ');
}

/**
 * Whether a cue is a drawing rather than a line of dialogue.
 *
 * ASS can carry vector shapes in the text: `{\p1}` switches the renderer into
 * drawing mode and what follows is a path - `m 0 0 l 100 0 l 100 -1 l 0 -1` -
 * until `{\p0}` switches back. Typesetters use them for the boxes and masks
 * behind signs, and a heavily typeset episode opens with several.
 *
 * Stripping the override tags leaves the coordinates standing, so they were
 * drawn as if they were words: an episode began with two lines of
 * `m 0 0 l 100 0 l 100 -1 l 0 -1 m 0 22 ...` across the middle of the picture.
 *
 * The tag is the real signal; the token test is there for a converter that
 * dropped it. A token that is neither a drawing command nor a number means
 * words, and words are never a drawing - which is what keeps a line of
 * dialogue that happens to be numbers, or a one-letter answer, out of this.
 */
// `{\p1}`, and `{\fad(200,200)\p1}` where it rides along with other overrides:
// an opening brace, a backslash, anything ending in another backslash, then p
// and a scale of 1 or more. `\p0` is the switch back to text and must not match.
const DRAWING_TAG = /\{\\(?:[^}]*\\)?p\s*[1-9]/;

export function isAssDrawing(raw: string, stripped: string): boolean {
  if (DRAWING_TAG.test(raw)) return true;
  const tokens = stripped.split(/\s+/).filter(Boolean);
  if (tokens.length < 4) return false;
  let commands = 0;
  let numbers = 0;
  for (const token of tokens) {
    if (/^[mnlbspc]$/i.test(token)) { commands++; continue; }
    if (/^-?\d+(?:\.\d+)?$/.test(token)) { numbers++; continue; }
    return false;
  }
  return commands > 0 && numbers >= 2;
}

function parseTs(s: string): number {
  // Accept HH:MM:SS.mmm or MM:SS.mmm (WebVTT allows both; SRT sometimes uses ',')
  const clean = s.trim().replace(',', '.');
  const parts = clean.split(':').map(Number);
  if (parts.length === 3) {
    const [h, m, sec] = parts;
    return h * 3600 + m * 60 + sec;
  }
  if (parts.length === 2) {
    const [m, sec] = parts;
    return m * 60 + sec;
  }
  return 0;
}

// Very small VTT/SRT parser. Handles both formats defensively.
export function parseVtt(source: string): VttCue[] {
  const text = source.replace(/\r/g, '');
  const blocks = text.split(/\n\n+/);
  const cues: VttCue[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').filter(l => l.length > 0);
    if (lines.length === 0) continue;

    // Find timing line "HH:MM:SS.mmm --> HH:MM:SS.mmm ..."
    const timingIdx = lines.findIndex(l => l.includes('-->'));
    if (timingIdx < 0) continue;

    const timing = lines[timingIdx].split('-->').map(s => s.trim());
    if (timing.length < 2) continue;
    const start = parseTs(timing[0]);
    const endToken = timing[1].split(' ')[0];
    const end = parseTs(endToken);
    if (!isFinite(start) || !isFinite(end) || end <= start) continue;

    const bodyLines = lines.slice(timingIdx + 1);
    const body = stripAssTags(bodyLines.join('\n').replace(/<[^>]+>/g, ''))
      // A cue that was nothing but styling leaves empty lines behind.
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n')
      .trim();
    if (!body) continue;
    // A shape is not something to read out over the picture.
    if (isAssDrawing(bodyLines.join('\n'), body)) continue;

    cues.push({ start, end, text: body });
  }

  return cues.sort((a, b) => a.start - b.start);
}

/**
 * How far back to look for a cue that is still on screen.
 *
 * Bounds the walk below. A sign that has been up for longer than this is not
 * worth finding; two minutes is far past any line of dialogue.
 */
const LONGEST_CUE_SECONDS = 120;

/**
 * The cue showing at time `t`, or null.
 *
 * A plain subtitle file never overlaps itself, and a binary search for the one
 * cue containing `t` is enough. An ASS track is not that: signs, karaoke and
 * dialogue are separate events that run at the same time, and a converted
 * episode arrives with three and a half thousand cues for twenty minutes, many
 * of them overlapping. Searching such a list for "the cue containing t" lands
 * on whichever one the halving happens to reach and reports nothing when that
 * one has already ended - which is why subtitles worked on the plainer
 * episodes and vanished on the heavily typeset ones.
 *
 * So the search finds the last cue that has started, then walks back through
 * everything still open. The one returned is the latest to have started, which
 * is the line just spoken rather than the sign that has been on screen for the
 * past minute.
 */
export function findActiveCue(cues: VttCue[], t: number): VttCue | null {
  // The last cue that has started by now.
  let lo = 0, hi = cues.length - 1, idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= t) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  for (let i = idx; i >= 0 && t - cues[i].start <= LONGEST_CUE_SECONDS; i--) {
    if (cues[i].end > t) return cues[i];
  }
  return null;
}
