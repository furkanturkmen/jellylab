const fs = require('fs');
const p = 'player/vtt.ts';
let s = fs.readFileSync(p, 'utf8');
function must(find, repl, label) {
  if (!s.includes(find)) throw new Error('anchor missing: ' + label);
  s = s.replace(find, repl);
}

must(`export type VttCue = { start: number; end: number; text: string };`,
`export type VttCue = { start: number; end: number; text: string };

/**
 * Strip the styling an ASS subtitle carries into its text.
 *
 * Jellyfin converts SSA/ASS to WebVTT by rewriting the timings and leaving the
 * dialogue alone, so the override blocks survive the trip and get drawn as if
 * they were words: a line reading
 * \`{\fad(984,1)\blur9\t(25,984,1 \blur0.75)}Episode 3:\` on screen.
 *
 * Only a brace immediately followed by a backslash is taken as an override,
 * which is what the format actually specifies - so dialogue that genuinely
 * contains {braces} keeps them.
 */
function stripAssTags(text: string): string {
  return text
    .replace(/\{\\[^}]*\}/g, '')
    // ASS writes its own line breaks: \N is a hard break, \n a soft one, and
    // \h a non-breaking space.
    .replace(/\\N/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\h/g, ' ');
}`, 'helper');

must(`    const body = bodyLines.join('\n').replace(/<[^>]+>/g, '').trim();`,
`    const body = stripAssTags(bodyLines.join('\n').replace(/<[^>]+>/g, ''))
      // A cue that was nothing but styling leaves blank lines behind.
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n')
      .trim();`, 'body');

fs.writeFileSync(p, s);
console.log('parser updated');
