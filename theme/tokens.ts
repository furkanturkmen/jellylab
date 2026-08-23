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
  // state never renders two different ways
  successTint: 'rgba(52, 199, 89, 0.24)',
  successBorder: 'rgba(52, 199, 89, 0.5)',
  overlay: 'rgba(0, 0, 0, 0.55)',
  scrimTop: 'rgba(10, 10, 10, 0)',
  scrimBottom: 'rgba(10, 10, 10, 0.95)',
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
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
