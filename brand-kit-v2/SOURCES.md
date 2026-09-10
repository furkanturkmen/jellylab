# Where the colours come from

Every brand colour is traced to a source file, not eyedropped from a screenshot.

## Jellyfin

`jellyfin/jellyfin-ux` @ master

- `logos/SVG/jellyfin-icon--color-on-dark.svg` — glyph gradient `#AA5CC3` → `#00A4DC`,
  `gradientUnits="userSpaceOnUse"`, x1 12 y1 30 → x2 72 y2 63 on a 72 tile.
- `branding/SVG/icon-transparent.svg` — same two stops at 512 scale,
  110.25,213.3 → 496.14,436.09. This is the pair JellyLab uses.
- `branding/SVG/icon-solid-android.svg` — solid background `#2E3440`. Note this is
  the generic Nord-ish plate for the Android/desktop builds, **not** the iOS tile.

## Jellyseerr

`seerr-team/seerr` @ develop (`fallenbagel/jellyseerr` redirects there)

- `public/logo_stacked.svg` — glyph gradient `#C395FC` → `#4F65F5`
  (userSpaceOnUse 99,0 → 168.5,69.5). The dark fill behind the eye and the
  overlay detail are both `#131928`.
- `tailwind.config.js` — no custom palette; the UI runs on stock Tailwind
  grays and `indigo.500`/`indigo.400` for links. Nothing brand-specific to take.

## The iOS tile ground

`jellyfin-ux` @ master, `branding/SVG/icon-solid-black.svg` — full-bleed
`<rect width="512" height="512" fill="#000b25"/>` behind the mark. **Flat, not a
gradient.** This is JellyLab's substrate, verbatim.

Two independent confirmations that this is the real home-screen plate:

1. **Measured.** Screenshot a home screen with icon appearance set to **Normal**
   (a dark-mode or tinted screenshot re-renders every tile and gives useless
   numbers), then histogram the pixels inside each tile, ignoring a 14px inset so
   the squircle corners don't let wallpaper through:

   | App | Dominant ground | Mid-edge probes |
   | --- | --- | --- |
   | Jellyseerr | `#000820` | `#030A26` |
   | Jellyfin | `#000820` | `#010B26` |
   | Swiftfin | `#000820` | `#030A24` |

   Three independent apps landing on the same value, within JPEG noise of
   `#000b25`.

2. **iOS flattens alpha to black.** `apple-touch-icon` composites over black and
   ignores `theme-color`, so a transparent icon lands as a black tile. Jellyfin
   ships `icon-solid-black.svg` precisely to carry its own plate. Our
   `icon-dark.svg` does the same.

### iOS web-icon rules that follow from this

- iOS will not take an SVG for `apple-touch-icon` — PNG or JPEG only. Rasterize.
- **180 × 180** is the file that matters (60pt @3×); iOS downsamples it for the rest.
- Ship it **opaque, no alpha channel**, so the black composite never comes up.
- **Do not pad it.** iOS crops corners only — unlike an Android maskable icon.
- iOS caches the icon per bookmark; re-add to the home screen to see a change.

## The substrate step

v2.0 moves the substrate to `#000512`, one step darker than the `#000B25` above.
The provenance of `#000B25` is unchanged and still correct **as an icon plate** —
it is Jellyfin's own, verbatim. The change is a judgement about scope: JellyLab
uses one ground for the icon tile, the launch screen and the app surface, and a
value that reads near-black in a 60pt tile reads mid-navy across a full screen.
`#000512` holds up in both. Every contrast ratio improves; the cost is that the
tile no longer matches a sibling icon exactly.

To revert, set the substrate back to `#000B25` — nothing else in the kit depends
on it.

## JellyLab's own values

| Role | Value | Provenance |
| --- | --- | --- |
| Glyph gradient | `#AA5CC3` → `#00A4DC` | Jellyfin, verbatim |
| Glyph on light | `#8438A4` → `#00648C` | same hues, darkened for 4.5:1 on paper |
| Substrate (v2.0) | `#000512`, flat | `#000B25` darkened one step for full-screen use |
| Substrate (v1.x) | `#000B25`, flat | Jellyfin's `icon-solid-black.svg` plate, verbatim |
| Paper | `#F1EDE7` | JellyLab |
| Ink | `#14120F` | JellyLab |

## Reproducing this

```
# Jellyfin
curl -s https://raw.githubusercontent.com/jellyfin/jellyfin-ux/master/branding/SVG/icon-transparent.svg | grep stop-color

# Jellyseerr
curl -s https://raw.githubusercontent.com/fallenbagel/jellyseerr/develop/public/logo_stacked.svg | grep -o '#[0-9A-Fa-f]\{6\}' | sort -u
```

Licensing: Jellyfin's branding is CC BY-SA 4.0. We do not ship or redraw either
mark — only the two gradient stops are referenced, as an ecosystem cue.
