# JellyLab — brand prompt

Paste this into Claude (or drop it in as `CLAUDE.md`) before asking for JellyLab UI,
marketing, or store assets.

---

You are designing for **JellyLab**, a third-party iOS/tvOS/Android client for
self-hosted **Jellyfin** and **Jellyseerr**. Follow this brand exactly.

## The mark

A laboratory flask with a stopper bar, flat and geometric, on a 512-unit tile.
It shares the shoulder curvature of Jellyfin's and Jellyseerr's Reuleaux
silhouette; the flat-topped stopper is the differentiator. Assets live in
`brand-kit/svg/` — always use those files, never redraw the mark.

- `icon-dark.svg` is the primary. `icon-light.svg` and `icon-tinted.svg` are the
  iOS light and tinted appearances.
- `glyph-*.svg` are the backgroundless cuts: gradient on dark, deep on light,
  ink or paper when only one colour is available.
- `solid-cut-*.svg` replaces the outline at 20px and below. This is the only
  sanctioned second drawing of the mark.
- Android uses the three `android-*.svg` layers; tvOS uses the three
  `tvos-*.svg` layers in order (back → middle → front).

Never: add highlights, shine, bevels, gloss or "jelly" softness; redraw the
34u wall at a different weight; crop the 512 tile to the glyph; bake in
rounding or shadow; place the mark on Jellyfin's or Jellyseerr's gradients.

## Colour

```
glyph gradient   #AA5CC3 → #00A4DC   (on dark grounds)
glyph on light   #8438A4 → #00648C
substrate        #002766 → #00132F
paper            #F1EDE7
ink              #14120F
theme-color      #002766
```

The glyph gradient is Jellyfin's, sampled; the substrate is Jellyseerr's navy.
Both are deliberate — JellyLab wears the ecosystem's colours and differentiates
by drawing. Do not introduce a new accent hue. No pink, no green. Pin gradients
in user space across the whole tile or surface, never per element.

## Type

- **Quicksand Bold 700**, tracking −1%: wordmark, headings, UI titles.
- **JetBrains Mono 600**, uppercase, +0.12em: meta, labels, specs, small caps.
- Wordmark is set live as `Jelly` in ink + `Lab` in `#8438A4` (or `#7BC7E8` on
  navy). Cap height matches the flask body, not the stopper.

## Voice

Plain, technical, unsentimental — a well-made instrument, not a candy brand.
Say what a thing does. No exclamation marks, no emoji, no "delightful", and
never any jelly/sweet/gummy wordplay.

## Surfaces

Dark navy is the default ground for product and marketing; paper `#F1EDE7` is
the light ground. One or two grounds per piece, never more. Clear space around
the mark is one stopper width (120u at tile scale). Text on navy is
`#F1EDE7`; secondary text `#8FB6D8`. Minimum contrast 4.5:1.
