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

    cues.push({ start, end, text: body });
  }

  return cues.sort((a, b) => a.start - b.start);
}

export function findActiveCue(cues: VttCue[], t: number): VttCue | null {
  // Binary search since cues are sorted by start.
  let lo = 0, hi = cues.length - 1, ans: VttCue | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = cues[mid];
    if (c.start <= t && t < c.end) return c;
    if (c.start > t) hi = mid - 1;
    else lo = mid + 1;
  }
  return ans;
}
