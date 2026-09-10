/**
 * The brand kit's palette, in one place.
 *
 * Every brand hex in the app comes from here - `theme/tokens.ts` re-exports
 * these rather than repeating them, and `scripts/brand-sync.mjs` reads the
 * substrate back out of the rendered icon to check this file has not drifted
 * from the artwork. A second copy of a hex is how a tile and a launch screen
 * end up one step apart.
 *
 * Source: brand-kit-v2/README.md, mark 47A.
 */
export const Brand = {
  glyphFrom: '#AA5CC3',   // Jellyfin's gradient, verbatim
  glyphTo: '#00A4DC',
  deepFrom: '#8438A4',    // on light grounds
  deepTo: '#00648C',
  /*
   * One ground for the icon tile, the launch screen and the app's base
   * surface, so there is no colour step at any boundary: the tile appears to
   * open into the splash, and the splash hands off to the library.
   */
  substrate: '#000B25',
  /*
   * There is no dark-appearance ground here on purpose.
   *
   * iOS composites the dark and tinted icons over a backdrop it supplies, so
   * those two variants ship as backgroundless cuts and inherit the same ground
   * every other app's dark icon has. Painting our own plate in there is what
   * made switching appearance look like it did nothing.
   */
  raised: '#0B1428',      // cards, rows, sheets
  hairline: 'rgba(241,237,231,0.12)',
  text: '#F1EDE7',
  text2: '#8FB6D8',
  paper: '#F1EDE7',
  ink: '#14120F',
} as const;

/**
 * The mark, as geometry.
 *
 * Bell and play are authored on a 1024 grid; `TILE_TRANSFORM` places them on
 * the 512 tile at a 369u extent centred on 256,256. The gradient is pinned in
 * the bell's own 1024 space - pinning it to the 512 tile instead lands the
 * whole gradient span in one corner and clamps the mark to flat blue.
 */
export const Mark = {
  /** 25 points: one move plus eight cubics. The morph variants warp these. */
  bell:
    'M512 152C712 152 872 292 872 468C872 560 830 612 830 676C830 744 762 796 660 796' +
    'C640 872 592 906 512 906C432 906 384 872 364 796C262 796 194 744 194 676' +
    'C194 612 152 560 152 468C152 292 312 152 512 152Z',
  /** Always a knockout - substrate-filled on a tile, an even-odd hole on a cut. */
  play:
    'M428 342C428 312 454 297 478 312L664 436C686 451 686 483 664 498L478 622' +
    'C454 637 428 622 428 592Z',
  /** The substrate veil over the lower half, clipped to the bell, at 18%. */
  veil: 'M152 500C256 500 314 528 434 528C554 528 674 492 890 492L890 990L152 990Z',
  veilOpacity: 0.18,
  /** The play triangle's own centre. The bell irises out from here. */
  playCentre: { x: 546, y: 467 },
  gradient: { x1: 208, y1: 176, x2: 816, y2: 848 },
  tileTransform: 'translate(5.4 -2.9) scale(0.4894)',
  /** The splash sits the tile-space mark at 62%, centred. */
  splashTransform: 'translate(256 256) scale(0.62) translate(-256 -256)',
  /** The level line the splash draws, in 512 tile space. */
  levelLine: { y: 253.5, height: 1, color: Brand.text2, opacity: 0.42 },
} as const;

export const Type = {
  display: 'Quicksand_700Bold',
  mono: 'JetBrainsMono_600SemiBold',
  /** −1% of the size, per the kit. */
  displayTracking: (size: number) => size * -0.01,
  /** +0.12em, uppercase. */
  monoTracking: (size: number) => size * 0.12,
} as const;
