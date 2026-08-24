# JellyLab — brand kit

iOS client for self-hosted **Jellyfin + Jellyseerr**. Browse the library, play something, or request what isn't there.

Mark version: **19c** (round boiling flask, pale upper glass, lavender cap, play-button pupil).

## The mark
A round-bottom boiling flask. The glass above the waterline is pale, the liquid below is saturated, so it
reads half full. A lavender cap with a highlight rib sits on a thick neck. Inside the liquid: a white eye
with a lavender iris and a **play button as the pupil**, with a crescent bite out of its top-left corner.
Three bubbles rise on the lower left, one soft highlight sits upper-left, and a light rim traces the top-left
of the glass. Nothing else — no 3D shading, no drop shadows.

## Colour
| token | hex | use |
|---|---|---|
| Glass (dark bg) | `#C45BEA` → `#0FB6F2` | body + neck gradient on dark |
| Glass (light bg) | `#A63FD6` → `#0094C8` | body + neck gradient on light |
| Cap | `#9B7BE8` | stopper |
| Iris | `#B79CF2` | eye iris |
| Pupil / ink | `#0B1B33` | play pupil, wordmark |
| Sclera | `#FFFFFF` | eye white |
| Night | `#14121C` → `#05070C` | icon substrate, dark UI |
| Mist | `#F4F1FB` | light surfaces |

Empty glass = white at 26% over the gradient. Waterline crest = white at 55%, 5px. Highlight = radial white 55%→0.

## Type
**Quicksand Bold (700)**, tracking −1%. "Jelly" in `#0B1B33`, "Lab" in the gradient (`#5FC4EC` on dark).
Meta/labels: JetBrains Mono 600, uppercase, tracking +0.12em.
Mark height = 1.8× cap height. Gap between mark and wordmark = ½ mark width.

## Rules
- Artwork fills ~84% of an icon tile's height; never smaller.
- Clear space = the width of the cap (⅓ of the mark's width) on all sides.
- Minimum mark 24px. Minimum lockup 96px wide.
- Detail tiers: ≥128px full · 64px drops bubbles, highlight and rim · ≤32px flat waterline, whole play pupil.
- Never stretch, rotate, recolour, add shadows or 3D bevels, or place the mark on brand blue.

## Files

```
brand/
├── BRAND.md · USAGE.md · site.webmanifest
├── svg/
│   ├── jellylab-mark.svg            primary, light backgrounds
│   ├── jellylab-mark-dark.svg       primary, dark backgrounds
│   ├── jellylab-mark-small.svg      pre-simplified ≤64px
│   ├── favicon.svg                  32px tier
│   ├── jellylab-mono.svg            one colour, inherits currentColor
│   ├── app-icon-1024.svg            dark-substrate app icon
│   ├── app-icon-1024-light.svg      light appearance
│   └── app-icon-1024-tinted.svg     greyscale for tinted mode
└── png/
    ├── icon/         icon-16 … icon-1024, maskable-512   (dark substrate)
    ├── icon-light/   icon-light-180 · 192 · 512 · 1024
    ├── icon-tinted/  icon-tinted-1024
    ├── macos/        icon_16x16 … icon_512x512 (rounded)
    ├── mark/         transparent mark, light + dark, 16 … 1024
    ├── lockup/       light / dark, @1x + @2x (920×240)
    └── social/       github-social-preview-1280x640
                      readme-hero-1200x400
                      wide-banner-1920x720
```

## Wiring it up

### iOS 26 (Icon Composer)
iOS 26 icons are layered glass with four appearances. Feed Icon Composer:
- **Default / Dark** → `png/icon/icon-1024.png` (or `svg/app-icon-1024.svg`)
- **Light** → `png/icon-light/icon-light-1024.png`
- **Tinted** → `png/icon-tinted/icon-tinted-1024.png` (greyscale; the system applies the tint)
- **Clear** → use the tinted artwork; let the system supply the glass material

Keep the substrate as a separate layer from the flask so the system's specular pass lands on top —
the flat SVGs make that easy to split (cap, neck, body, liquid, eye are separate nodes).

Legacy `AppIcon.appiconset`: `icon-1024.png` for App Store, `icon-180.png` for @3x home screen.

### In-app (SwiftUI)
```swift
Image("JellyLabMark")            // svg exported to PDF/asset catalog
Image("JellyLabMono")            // one-colour glyph for toolbars
    .foregroundStyle(Color.accentColor)
```
Accent colour: `#A63FD6` in light mode, `#C45BEA` in dark.

### Web
```html
<link rel="icon" href="/svg/favicon.svg">
<link rel="apple-touch-icon" sizes="180x180" href="/png/icon/icon-180.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#05070C">
<picture>
  <source srcset="/svg/jellylab-mark-dark.svg" media="(prefers-color-scheme: dark)">
  <img src="/svg/jellylab-mark.svg" alt="JellyLab" height="40">
</picture>
```

### macOS
```bash
mkdir JellyLab.iconset && cp png/macos/*.png JellyLab.iconset/
iconutil -c icns JellyLab.iconset
```

### GitHub / Docker
- Repo → Settings → Social preview: `png/social/github-social-preview-1280x640.png`
- README: `<p align="center"><img src="brand/png/social/readme-hero-1200x400.png" width="640" alt="JellyLab"></p>`
- Org avatar: `png/icon/icon-1024.png` · Docker Hub repo logo: `png/icon/icon-256.png`
