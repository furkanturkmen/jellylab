# JellyLab brand kit v1.0

Mark **38F "Stoppered"** — a laboratory flask with a stopper bar, drawn on the
512-unit tile and the shoulder curvature shared with Jellyfin and Jellyseerr.

## Files

| File | Use |
| --- | --- |
| `svg/icon-dark.svg` | Primary app icon. iOS/iPadOS/macOS/watchOS source at 1024. |
| `svg/icon-light.svg` | iOS light appearance. |
| `svg/icon-tinted.svg` | iOS tinted appearance (grayscale glyph, system colourises). |
| `svg/glyph-gradient.svg` | Backgroundless glyph for dark grounds. |
| `svg/glyph-deep.svg` | Backgroundless glyph for light grounds. |
| `svg/glyph-ink.svg` | One-colour glyph, ink. Print, complications, notification. |
| `svg/glyph-paper.svg` | One-colour glyph, reversed. |
| `svg/solid-cut-icon.svg` | Small-size cut, ≤20px. Substrate included. |
| `svg/solid-cut-glyph.svg` | Small-size cut, transparent. |
| `svg/favicon.svg` | 32px favicon (solid cut, rounded). |
| `svg/android-foreground.svg` | `ic_launcher_foreground` — glyph at 90%. |
| `svg/android-background.svg` | `ic_launcher_background`. |
| `svg/android-monochrome.svg` | `ic_launcher_monochrome` for themed icons. |
| `svg/tvos-1-back.svg` | tvOS layer 1 — substrate + bloom, full bleed. |
| `svg/tvos-2-middle.svg` | tvOS layer 2 — liquid, 0.45× parallax travel. |
| `svg/tvos-3-front.svg` | tvOS layer 3 — glass + stopper, 1.0× travel. |
| `JellyLab Brand Kit.html` | The full kit, offline, with live tvOS parallax. |
| `PROMPT.md` | Paste into Claude to give it the brand. |

Wordmark is Quicksand Bold 700 at −1% tracking, set live — no vector wordmark
is shipped, so the type stays selectable and localisable.

## Construction

- Tile 512 × 512u; iOS squircle radius 22.4%.
- Stroke- and stopper-inclusive bbox 322 × 385u, centred on 256,256.
- Outline cut: `translate(10.6 14) scale(0.9584)` → 369u extent (72% of tile).
- Solid cut: `translate(-0.7 11.3) scale(1.0027)`.
- Wall 34u, round joins. Neck 60u wide, y 92→186. Liquid fills y 318→base.
- Stopper 120 × 40u, r16, 32u of air above the neck.
- Clear space: one stopper width (120u) on all four sides.

## Palette

| Role | Value |
| --- | --- |
| Glyph gradient | `#AA5CC3` → `#00A4DC` (Jellyfin's, sampled) |
| Glyph on light | `#8438A4` → `#00648C` |
| Substrate | `#002766` → `#00132F` (Jellyseerr's navy, sampled) |
| Paper | `#F1EDE7` |
| Ink | `#14120F` |
| Theme colour | `#002766` |

Gradients are pinned in user space (104,88 → 408,424 for the glyph; 0,0 → 512,512
for the substrate), never to the glyph bounding box — that is what keeps a row of
icons consistent.

## Rules

- Flat and geometric. No wet highlights, no specular shine, no soft-candy joins.
- No pink, no green. The palette is the sampled family gradient, nothing else.
- Never redraw the wall weight to fix a size problem — swap to the solid cut at ≤20px.
- Let each platform apply its own mask and shadow; ship no baked rounding or shadow.
- Never place the mark on the siblings' own gradients.
