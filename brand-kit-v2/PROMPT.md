# JellyLab — brand + splash integration

Paste this whole file into Claude Code at the repo root (or save it as `CLAUDE.md`).
Assumes Expo SDK 57 / RN 0.86 / expo-router, per this repo's package.json.

---

## Context

JellyLab is an iOS client for self-hosted Jellyfin + Jellyseerr. The brand kit is
in `brand-kit-v2/`. Everything below is decided — implement it, do not redesign it.

**One dependency is missing:** `react-native-svg`. The mark is vector and the
splash morphs its outline, so install it before starting:
`npx expo install react-native-svg`.

## The mark

**47A** — a bell on a purple→blue gradient with a play triangle knocked out of it.
Bell and play paths are authored on a **1024** grid. To place on a 512 tile:
`translate(5.4 -2.9) scale(0.4894)` → 369u extent, centred on 256,256.

Non-negotiables:

- The play triangle is **always a knockout** — substrate-filled on a tile, an
  even-odd hole on a transparent cut. Never a third colour, never a filled shape
  on top.
- The two-tone lower half is the **substrate at 18%**, clipped to the bell. Never
  a second hue, never strengthened at small sizes — it fades out on its own.
- The glyph gradient is pinned in the bell's **own 1024 space**: `208,176 → 816,848`.
  Pinning it to the 512 tile clamps the whole mark to flat blue. In
  `react-native-svg` that means `<LinearGradient gradientUnits="userSpaceOnUse"
  x1="208" y1="176" x2="816" y2="848">` **inside** the transformed `<G>`.

## Colour constants

Create `constants/brand.ts` and use it everywhere. No literal hexes elsewhere.

```ts
export const Brand = {
  glyphFrom: '#AA5CC3',   // Jellyfin's gradient, verbatim
  glyphTo:   '#00A4DC',
  deepFrom:  '#8438A4',   // on light grounds
  deepTo:    '#00648C',
  substrate: '#000B25',   // icon tile, launch screen, app surface — flat
  substrateDark: '#000512', // iOS DARK APPEARANCE ICON ONLY
  raised:    '#0B1428',   // cards, rows, sheets
  hairline:  'rgba(241,237,231,0.12)',
  text:      '#F1EDE7',
  text2:     '#8FB6D8',
  paper:     '#F1EDE7',
  ink:       '#14120F',
} as const;
```

`substrate` is one ground for the icon tile, the launch screen **and** the app's
base surface — no colour step at any boundary. `substrateDark` is the iOS dark
*appearance icon* only; it never goes on the splash or on a screen background.
Set the root view, `expo-router` stack `contentStyle`, and any `@expo/ui` /
`expo-glass-effect` container background to `Brand.substrate`.

## Task 1 — app icons

Extend the existing `@resvg/resvg-js` pipeline to rasterise from `brand-kit-v2/svg/`:

| Source | Output | Size |
| --- | --- | --- |
| `icon-default.svg` | `assets/icon.png` | 1024 |
| `icon-dark.svg` | `assets/icon-dark.png` | 1024 |
| `icon-tinted.svg` | `assets/icon-tinted.png` | 1024 |
| `android-foreground.svg` | `assets/adaptive-foreground.png` | 1024 |
| `android-monochrome.svg` | `assets/adaptive-monochrome.png` | 1024 |
| `favicon.svg` | `assets/favicon.png` | 48 |

All **opaque, no alpha channel** — iOS composites transparency over black.
Do not pad; iOS crops corners only.

Then wire `app.json`:

```json
{
  "expo": {
    "backgroundColor": "#000B25",
    "ios": {
      "icon": {
        "light": "./assets/icon.png",
        "dark": "./assets/icon-dark.png",
        "tinted": "./assets/icon-tinted.png"
      }
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-foreground.png",
        "monochromeImage": "./assets/adaptive-monochrome.png",
        "backgroundColor": "#000B25"
      }
    }
  }
}
```

Verify the object form of `ios.icon` against the installed Expo version before
committing; fall back to a single `icon` string if it is not supported. Run
`npx expo prebuild --clean` after.

## Task 2 — the launch screen

An animated splash is **two things**, and conflating them is the usual bug:

1. The static native launch screen, drawn by the OS **before any JS runs**.
2. Your own animated React view, mounted on top of it.

Users read it as one continuous animation because the two are pixel-identical at
the handoff.

Configure the static half with the `expo-splash-screen` plugin, from
`brand-kit-v2/svg/splash-still.svg` rasterised to `assets/splash.png` at 1024:

```json
["expo-splash-screen", {
  "image": "./assets/splash.png",
  "backgroundColor": "#000B25",
  "imageWidth": 200,
  "resizeMode": "contain",
  "dark": { "image": "./assets/splash.png", "backgroundColor": "#000B25" }
}]
```

Note the dark variant uses the **same** background. That is deliberate — the
splash must match the icon it grew out of.

## Task 3 — the animated splash

`components/SplashSequence.tsx`, rendered from `app/_layout.tsx`. Call
`SplashScreen.preventAutoHideAsync()` at module scope, then
`SplashScreen.hideAsync()` once your own view has laid out — so the native still
and the animated view swap with nothing in between.

Build it with `react-native-svg` + `react-native-reanimated`. Timeline:

| At | For | What |
| --- | --- | --- |
| 0.00s | 420ms | Play triangle fades in from 0.86× |
| 0.46s | 720ms | Bell irises out from **the triangle's own centre, 546,467** |
| 0.54s | 200ms | Triangle flips to a knockout |
| 0.78s | 680ms | Veil rises 300u to the level line |
| 0.96s | 660ms | Level line draws outward from centre |
| 1.06s | 540ms | Wordmark up 9px |
| 1.24s | 580ms | Subtitle to 72% opacity |
| **1.50s** | — | **Resting frame — identical to `splash.png`. Hold here.** |
| 1.62s | 260ms | Press: dips 3.8%, ring expands out of the play hole |
| 1.92s | 2.6s | Swim: four pulses, then it exits |

**Hold at 1.50s until the app is actually ready** (auth restored, first library
request resolved), then run the press and swim as the transition out. The
animation must never gate startup — a slow launch just holds a still, correct
frame for longer.

Full spec, including the exact easings, is in `brand-kit-v2/SPLASH.md`.

### The swim

Four cycles of **contract → thrust → coast**, ~1.5 Hz.

- The bell's **outline morphs**; it is not a scaled copy sliding upward. Three
  warped variants of the same 25-point path — relaxed, contracted, flared — with
  identical command structure, so you can interpolate them numerically. Parse
  each into a `number[]`, `interpolate` component-wise inside a worklet, and
  rebuild the `d` string in `useAnimatedProps` on an `Animated.Path`. Do **not**
  reach for a path-morph library; the shared command structure makes this ~30
  lines.
- **Contract completes before displacement.** The thrust eases out of the squeeze.
  Reversing that order is what makes an animated logo look like a sliding sticker.
- The recoil **over-flares past** the resting outline before returning.
- Sway is **perpendicular to the heading**, ~20% of travel distance. Below ~10%
  the eye reads a straight line.
- **Bank is derived from lateral velocity**, so the tilt leads each turn.
- Direction reverses only *between* pulses.

Generate the trajectory from five parameters — `heading, sway, cycles, duration,
distance` — rather than hardcoding keyframes, so the exit direction stays a
runtime value.

### Reduced motion

Honour `AccessibilityInfo.isReduceMotionEnabled()`: render the 1.50s resting
frame immediately and cross-fade to the app. Skip the press and the swim entirely.

## Type

- Display and UI: **Quicksand**, Bold 700, tracking −1% (`letterSpacing: -0.01em`
  equivalent in px at your size).
- Meta, labels, numerics: **JetBrains Mono**, 600, uppercase, +0.12em.

Load via `expo-font`; do not fall back to system for the wordmark.

## Hard rules

- **Never gummify the mark.** Flat and geometric: no wet highlights, no specular
  shine, no soft-candy round joins, no jelly-sweet copy.
- No pink, no green.
- Never reuse Jellyseerr's own gradient (`#C395FC` → `#4F65F5`).
- Contrast floor: 3:1 for the mark, 4.5:1 for body text. **The purple stop always
  governs** — check against `#AA5CC3`, never the blue.
- Motion: one ease per sequence, ends static, never loops.
- Voice: plain and specific. Subtitle is "Watch and request, in one place" — no
  sibling product names in user-facing copy.

## Definition of done

- `npx tsc --noEmit` clean, ESLint clean, existing 364 tests still pass.
- Cold launch on a device shows **no visible seam** between the native still and
  the animated view — if you can see the handoff, the resting frame does not match.
- Icon appearance switching (Settings → Home Screen → Icons: Dark) shows the
  `#000512` tile; everything else stays `#000B25`.
- No literal brand hex outside `constants/brand.ts`.
