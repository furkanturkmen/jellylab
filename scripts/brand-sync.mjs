#!/usr/bin/env node
/**
 * Regenerate the app's image assets from the brand kit.
 *
 * `brand-kit-v2/` is the source of truth and is never written to. Everything
 * this writes is generated, so changing the logo means dropping a new kit in
 * and running `npm run brand` - not hand-exporting eight sizes and hoping they
 * stay in step.
 *
 * The kit ships SVG only, on purpose: the mark is flat and geometric, so every
 * size is a fresh render rather than a resample, and the platform layers stay
 * separate files instead of being composited here. Rendering is resvg, which
 * honours the user-space gradient the kit pins in the bell's own 1024 space.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { PNG } from 'pngjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const p = (...s) => resolve(ROOT, ...s);
const KIT = 'brand-kit-v2/svg';

const render = (name, size) =>
  PNG.sync.read(
    new Resvg(readFileSync(p(KIT, `${name}.svg`), 'utf8'), {
      fitTo: { mode: 'width', value: size },
    })
      .render()
      .asPng(),
  );

function write(png, dst, opts = {}) {
  mkdirSync(dirname(p(dst)), { recursive: true });
  writeFileSync(p(dst), PNG.sync.write(png, opts));
  const kb = Math.round(readFileSync(p(dst)).length / 1024);
  const alpha = opts.colorType === 2 ? 'opaque' : 'alpha ';
  console.log(`  ${dst.padEnd(38)} ${String(png.width).padStart(4)}px  ${alpha} ${kb}KB`);
}

const hexToRgb = hex => [0, 2, 4].map(i => parseInt(hex.replace('#', '').slice(i, i + 2), 16));
const rgbToHex = rgb => '#' + rgb.map(v => v.toString(16).padStart(2, '0').toUpperCase()).join('');

/**
 * Composite onto a solid ground and drop the alpha channel entirely.
 *
 * Two reasons, both hard requirements rather than optimisations: App Store
 * Connect rejects an icon that merely *has* an alpha channel even when it is
 * opaque everywhere, and iOS composites any transparency in a home-screen icon
 * over black - which would put a black corner on a navy tile.
 */
function opaque(name, size, dst, bgHex) {
  const img = render(name, size);
  const [br, bg, bb] = hexToRgb(bgHex);
  const out = new PNG({ width: img.width, height: img.height });
  for (let i = 0; i < img.data.length; i += 4) {
    const a = img.data[i + 3] / 255;
    out.data[i] = Math.round(img.data[i] * a + br * (1 - a));
    out.data[i + 1] = Math.round(img.data[i + 1] * a + bg * (1 - a));
    out.data[i + 2] = Math.round(img.data[i + 2] * a + bb * (1 - a));
    out.data[i + 3] = 255;
  }
  write(out, dst, { colorType: 2 });
}

/**
 * Read a colour back out of the rendered artwork and check constants/brand.ts
 * still agrees with it.
 *
 * The palette is written down in exactly one place for the app to use, which
 * means it can silently fall out of step with the kit it was copied from. This
 * is the check that it has not: a corner pixel, where a flat plate and a
 * gradient plate would differ.
 */
function assertSubstrate(name, key) {
  const img = render(name, 512);
  const i = (512 * 4 + 4) << 2;
  const found = rgbToHex([img.data[i], img.data[i + 1], img.data[i + 2]]);
  const ts = readFileSync(p('constants/brand.ts'), 'utf8');
  const declared = new RegExp(`${key}: '(#[0-9A-Fa-f]{6})'`).exec(ts)?.[1];
  if (declared?.toUpperCase() !== found) {
    throw new Error(
      `${KIT}/${name}.svg renders ${key} as ${found}, but constants/brand.ts declares ${declared}. ` +
        `Update constants/brand.ts - the artwork is the source of truth.`,
    );
  }
  console.log(`  ${key.padEnd(38)} ${found}  matches constants/brand.ts`);
  return found;
}

console.log('brand-kit-v2/ -> assets/');

const SUBSTRATE = assertSubstrate('icon-default', 'substrate');
const SUBSTRATE_DARK = assertSubstrate('icon-dark', 'substrateDark');

// The three iOS appearances. Opaque, unpadded - iOS crops corners itself.
opaque('icon-default', 1024, 'assets/icon.png', SUBSTRATE);
opaque('icon-dark', 1024, 'assets/icon-dark.png', SUBSTRATE_DARK);
opaque('icon-tinted', 1024, 'assets/icon-tinted.png', SUBSTRATE);

/*
 * Android's two adaptive layers keep their alpha, which is the one place this
 * departs from "all outputs opaque".
 *
 * The launcher composites the foreground over the background layer and then
 * masks the pair to whatever shape the device uses. A foreground with no alpha
 * is an opaque square: it hides the background layer completely and defeats
 * the mask. The monochrome layer is worse - flattened, the themed icon becomes
 * a solid block of tint. Both have to stay transparent to work at all.
 */
write(render('android-foreground', 1024), 'assets/adaptive-foreground.png');
write(render('android-monochrome', 1024), 'assets/adaptive-monochrome.png');

// Web favicon, at the size the kit draws its rounded plate for.
opaque('favicon', 48, 'assets/favicon.png', SUBSTRATE);

/*
 * The launch screen, composed rather than taken whole.
 *
 * The kit's `splash-still.svg` carries the substrate plate, which is right when
 * the app behind it is also the substrate. This app's surface is black, so the
 * splash uses the *backgroundless* cut on the app's own ground instead - the
 * mark, no plate - and the step that would otherwise land at the splash-to-app
 * boundary disappears. What is given up is the tile-opens-into-the-splash
 * continuity, which iOS covers with its own zoom anyway; what is kept is the
 * boundary you actually watch.
 *
 * Composed from `glyph-gradient.svg`, which is the kit's own cut with the play
 * as a real even-odd hole, wrapped in the splash's 62% transform and given the
 * level line. It deliberately carries no veil: the veil is the substrate at
 * 18%, so on any other ground it is a navy smudge rather than a two-tone.
 */
function composeSplash(dst, { markOnly = false } = {}) {
  const cut = readFileSync(p(KIT, 'glyph-gradient.svg'), 'utf8');
  const grad = /<linearGradient[\s\S]*?<\/linearGradient>/.exec(cut)?.[0];
  const glyph = /<g transform="translate\(5\.4[\s\S]*?<\/g>/.exec(cut)?.[0];
  if (!grad || !glyph) throw new Error('glyph-gradient.svg is not the shape this expects');

  /*
   * The seed is the play triangle on its own - the animation's frame 0, before
   * the bell has irised out of it. The kit draws bell and play as two subpaths
   * of one even-odd path, so the triangle is the part after the second `M`.
   */
  let body = glyph;
  if (markOnly) {
    const d = /d="([^"]+)"/.exec(glyph)?.[1] ?? '';
    const play = d.slice(d.indexOf('M', 1)).trim();
    if (!play) throw new Error('could not find the play subpath in glyph-gradient.svg');
    body = `<g transform="translate(5.4 -2.9) scale(0.4894)"><path d="${play}" fill="url(#g)"/></g>`;
  }

  const line = markOnly
    ? ''
    : '<rect x="0" y="253.5" width="512" height="1" fill="#8FB6D8" opacity="0.42"/>';
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1024" height="1024">' +
    `<defs>${grad}</defs>` +
    `<g transform="translate(256 256) scale(0.62) translate(-256 -256)">${body}</g>` +
    line +
    '</svg>';

  const img = PNG.sync.read(
    new Resvg(svg, { fitTo: { mode: 'width', value: 1024 } }).render().asPng(),
  );
  write(img, dst);
}

// Alpha kept: the plugin draws this over its own backgroundColor, and the
// play hole has to show that ground through rather than a colour of its own.
composeSplash('assets/splash.png');
composeSplash('assets/splash-seed.png', { markOnly: true });

// The mark as drawn inside the app: the login header, and the About screen.
write(render('glyph-gradient', 512), 'assets/images/mark.png');
opaque('icon-default', 180, 'assets/images/icon-180.png', SUBSTRATE);

/*
 * apple-touch-icon, for a page saved to the home screen. iOS refuses an SVG
 * here, composites transparency over black, and crops the corners itself - so
 * 180 square, opaque, unpadded. It lands in public/ because it needs a fixed
 * path for the <link> in app/+html.tsx; a bundled asset would be hashed.
 */
opaque('icon-default', 180, 'public/apple-touch-icon.png', SUBSTRATE);

/*
 * The v1 flask's outputs, which nothing references any more. Removed here
 * rather than by hand so that a checkout which still has them ends up clean
 * after one `npm run brand`.
 */
for (const stale of [
  'assets/images/icon.png',
  'assets/images/favicon.png',
  'assets/images/splash-icon.png',
  'assets/images/android-icon-foreground.png',
  'assets/images/android-icon-background.png',
  'assets/images/android-icon-monochrome.png',
]) {
  if (existsSync(p(stale))) {
    rmSync(p(stale));
    console.log(`  removed ${stale}`);
  }
}

console.log('done');
