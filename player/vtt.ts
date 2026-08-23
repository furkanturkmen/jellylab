export type VttCue = { start: number; end: number; text: string };

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
    const body = bodyLines.join('\n').replace(/<[^>]+>/g, '').trim();
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
