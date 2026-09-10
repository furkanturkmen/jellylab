# JellyLab brand kit v2.0

Mark **47A** — a bell on the family gradient with the play triangle knocked out
of it, and the two-tone split carried as a veil of the substrate over the lower
half. Supersedes the 38F flask in v1.x entirely.

## What changed from v1.3

| | v1.3 | v2.0 |
| --- | --- | --- |
| Mark | 38F flask + stopper | 47A bell + play knockout |
| Substrate | `#000B25` | `#000B25` normal · `#000512` dark |
| Lower-half tone | n/a | substrate veil at 18% |
| Splash | none | static first frame + animation spec, on `#000B25` |

## Files

| File | Use |
| --- | --- |
| `svg/icon-default.svg` | **Primary app icon**, normal appearance. `#000B25` — Jellyfin's plate, verbatim. |
| `svg/icon-dark.svg` | iOS dark appearance. Same mark on `#000512`. |
| `svg/icon-tinted.svg` | iOS tinted appearance (grayscale glyph, system colourises). |
| `svg/icon-paper.svg` | Light-ground tile for docs, press and print. Not an iOS appearance. |
| `svg/glyph-gradient.svg` | Backgroundless glyph for dark grounds. Play is a real hole. |
| `svg/glyph-deep.svg` | Backgroundless glyph for light grounds. |
| `svg/glyph-ink.svg` | One-colour glyph, ink. Print, complications, notifications. |
| `svg/glyph-paper.svg` | One-colour glyph, reversed. |
| `svg/favicon.svg` | 32px favicon, rounded plate. |
| `svg/android-foreground.svg` | `ic_launcher_foreground` — glyph at 72% for the adaptive safe zone. |
| `svg/android-background.svg` | `ic_launcher_background`. |
| `svg/android-monochrome.svg` | `ic_launcher_monochrome` for themed icons. |
| `svg/tvos-1-back.svg` | tvOS layer 1 — substrate + bloom, full bleed. |
| `svg/tvos-2-middle.svg` | tvOS layer 2 — oversized bell at 34%, 0.45× parallax travel. |
| `svg/tvos-3-front.svg` | tvOS layer 3 — bell with the play hole, 1.0× travel. |
| `svg/splash-still.svg` | **Launch screen**, on `#000B25`. The animation's exact resting frame. |
| `svg/splash-play-seed.svg` | The animation's frame 0 — play triangle alone. |
| `SPLASH.md` | Launch-screen handoff and the full animation spec. |
| `JellyLab Brand Kit.html` | The whole kit, offline, with the live splash. |
| `PROMPT.md` | Paste into Claude to give it the brand. |

Wordmark is Quicksand Bold 700 at −1% tracking, set live — no vector wordmark is
shipped, so the type stays selectable and localisable.

## Construction

- Bell and play paths are authored on a **1024** grid; the tile transform
  `translate(5.4 -2.9) scale(0.4894)` places them on the 512 tile at a
  **369u extent (72%)**, centred on 256,256.
- Glyph gradient is pinned in the bell's own 1024 space: **208,176 → 816,848**.
  Pinning it to the 512 tile instead clamps the whole mark to flat blue — the
  gradient span lands in one corner of the bell.
- The play triangle is a **knockout**, never a third colour: substrate-filled on
  the tiles, an even-odd hole on the backgroundless cuts.
- Veil is the substrate at 18%, clipped to the bell, over the lower half. One file
  at every size — an 18% step simply fades out below about 40px, so no separate
  small-size cut is needed. Never strengthen it to compensate.
- Clear space: 96u (18.75% of the tile) on all four sides.

## Palette

| Role | Value |
| --- | --- |
| Glyph gradient | `#AA5CC3` → `#00A4DC` (Jellyfin's, verbatim) |
| Glyph on light | `#8438A4` → `#00648C` |
| Substrate, normal | `#000B25`, flat |
| Substrate, dark appearance | `#000512`, flat |
| Paper | `#F1EDE7` |
| Ink | `#14120F` |
| Theme colour | `#000B25` |
| Text on substrate | `#F1EDE7` primary · `#8FB6D8` secondary |
| Raised surface | `#0B1428` |

### On the substrate

Two values, and which is which matters.

| | Value | Where |
| --- | --- | --- |
| **Normal** | `#000B25` | Icon tile, launch screen, app surface. Jellyfin's own plate, verbatim — a JellyLab tile sits in a row with Jellyfin and Jellyseerr and matches. |
| **Dark** | `#000512` | iOS dark appearance only. One step down, same hue, the way a sibling's dark variant deepens rather than shifts. |

The launch screen and the app surface both use **`#000B25`**, so the tile appears
to open into the splash and the splash hands off to the library with no colour
step at any boundary. Do not put the dark value on the splash — it would not
match the icon it grew out of, which is the one seam a user actually notices.

## Contrast

Measured per gradient stop, alpha-composited.

| Region | Ground | Purple stop | Mid | Blue stop |
| --- | --- | --- | --- | --- |
| Glyph | `#000B25` | 4.68:1 | 5.01:1 | 6.83:1 |
| Veiled lower half | `#000B25` | 3.46:1 | 3.72:1 | 4.88:1 |
| Glyph | `#000512` | 4.88:1 | 5.23:1 | 7.13:1 |
| Veiled lower half | `#000512` | 3.55:1 | 3.82:1 | 5.01:1 |

The purple stop always governs. Both regions clear the 3:1 floor for
headline-scale graphics; the unveiled glyph also clears 4.5:1.

## Rules

- Flat and geometric. No wet highlights, no specular shine, no soft-candy joins.
- No pink, no green. The palette is the family gradient and nothing else.
- Never place the mark on the siblings' own gradients. Jellyseerr's pair is
  `#C395FC` → `#4F65F5` — never reuse it.
- Let each platform apply its own mask and shadow; ship no baked rounding.

## Shipping the web icon

```sh
# 180 x 180, opaque, no alpha
rsvg-convert -w 180 -h 180 svg/icon-default.svg -o apple-touch-icon.png
```

```html
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<meta name="theme-color" content="#000B25">
<meta name="apple-mobile-web-app-title" content="JellyLab">
```

iOS will not accept an SVG here, composites any transparency over black, crops
corners only (do not pad), and caches per bookmark — re-add to the home screen to
see a change.
