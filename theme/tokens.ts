/**
 * The JellyLab palette, from brand/BRAND.md.
 *
 * Held separately from `colors` on purpose. The UI is deliberately monochrome
 * - Apple TV's grammar, where artwork supplies all the colour - so the brand
 * hues belong on the things that are the brand itself (the mark, the splash,
 * the icon) rather than sprayed across chrome that is meant to recede.
 */
export const brand = {
  // the flask body runs as a gradient; which pair depends on what is behind it
  glassDark: ['#C45BEA', '#0FB6F2'] as const,   // on dark
  glassLight: ['#A63FD6', '#0094C8'] as const,  // on light
  cap: '#9B7BE8',
  iris: '#B79CF2',
  ink: '#0B1B33',      // play pupil, wordmark
  sclera: '#FFFFFF',
  mist: '#F4F1FB',     // light surfaces
  // The kit gives Night as a gradient because the icon tile is one. 'night' is
  // its midpoint, for anything that can only take a single colour.
  nightTop: '#14121C',
  nightBottom: '#05070C',
  night: '#0D0D14',
} as const;

export const colors = {
  bg: '#0A0A0A',
  bgElevated: '#141414',
  surface: '#1C1C1C',
  surfaceRaised: '#212121',
  border: 'rgba(245, 245, 247, 0.12)',
  borderStrong: 'rgba(245, 245, 247, 0.24)',
  text: '#F5F5F7',
  textMuted: 'rgba(245, 245, 247, 0.60)',
  textDim: 'rgba(245, 245, 247, 0.35)',
  accent: '#F5F5F7',
  accentContrast: '#0A0A0A',
  pink: '#F92672',
  glassTint: 'rgba(42, 42, 42, 0.72)',
  glassBorder: 'rgba(245, 245, 247, 0.16)',
  // tvOS-style glass: lift the material with a white wash rather than darkening
  // it, and give the edge a brighter specular line so it reads as a surface.
  glassLift: 'rgba(255, 255, 255, 0.08)',
  glassEdge: 'rgba(255, 255, 255, 0.30)',
  // 'available' green, shared by the search and requests badges so the same
  // state never renders two different ways.
  //
  // Opaque on purpose: these sit on top of poster artwork, which can be white
  // (Toy Story) or near-black (Mutiny) in the same row. A translucent tint
  // reads on one and disappears on the other, so the badge carries its own
  // background rather than borrowing whatever is behind it.
  successTint: 'rgba(26, 112, 52, 0.92)',
  successBorder: 'rgba(52, 199, 89, 0.75)',
  /*
   * The status scale, in the order a request goes wrong.
   *
   * Blue-grey is the resting state - ordinary, working, nothing to look at.
   * Yellow waits on time or a person, orange is wrong but recoverable, red is
   * over. Green is reserved for arrived, so it never appears on something
   * still in flight.
   *
   * All opaque, like the availability badge and for the same reason: these sit
   * over poster artwork that can be white or near-black in the same list, and
   * a translucent tint reads on one and vanishes on the other.
   */
  pillNeutralTint: 'rgba(48, 62, 82, 0.92)',
  pillNeutralBorder: 'rgba(150, 180, 215, 0.55)',
  pillWaitTint: 'rgba(122, 104, 22, 0.92)',
  pillWaitBorder: 'rgba(235, 205, 80, 0.70)',
  pillWarnTint: 'rgba(146, 80, 20, 0.92)',
  pillWarnBorder: 'rgba(240, 152, 58, 0.78)',
  pillBadTint: 'rgba(140, 26, 42, 0.92)',
  pillBadBorder: 'rgba(248, 96, 122, 0.78)',

  overlay: 'rgba(0, 0, 0, 0.55)',
  scrimTop: 'rgba(10, 10, 10, 0)',
  scrimBottom: 'rgba(10, 10, 10, 0.95)',
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  // Apple TV's primary action corner. Not a capsule on purpose: pill reads
  // as a chip or filter, which is the wrong signal on the main button.
  button: 14,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const type = {
  display: { fontSize: 34, fontWeight: '700' as const, letterSpacing: -0.5 },
  h1: { fontSize: 24, fontWeight: '700' as const, letterSpacing: -0.3 },
  h2: { fontSize: 18, fontWeight: '600' as const, letterSpacing: -0.2 },
  body: { fontSize: 15, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, fontWeight: '600' as const },
  small: { fontSize: 13, fontWeight: '400' as const },
  caption: { fontSize: 11, fontWeight: '500' as const, letterSpacing: 0.4 },
};

export const blur = {
  glass: 20,
  backdrop: 40,
};

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
};
