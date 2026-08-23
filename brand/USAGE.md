# JellyLab brand kit

Colours: **#AA5CC3** Jelly Purple · **#00A4DC** Jelly Blue · **#C9B8F0** Iris Lavender · **#0B2545** Deep Ink · **#F4F1FB** Sclera
Type: **Quicksand Bold (700)**, tracking -1%. "Jelly" in Deep Ink, "Lab" in the gradient (or #5FC4EC on dark).
Clear space: one flask-neck width (1/4 of mark width) on all sides. Minimum mark 24px; minimum lockup 96px wide.

## svg/ — use these wherever SVG is allowed
| file | use |
|---|---|
| jellylab-mark.svg | primary mark, light backgrounds |
| jellylab-mark-dark.svg | primary mark, dark backgrounds (brightened gradient) |
| jellylab-icon-64.svg / -32.svg | pre-simplified small sizes |
| favicon.svg | `<link rel="icon" href="/favicon.svg">` |
| jellylab-mono.svg | single colour, inherits `currentColor` — toolbar glyphs, stamps, embroidery |
| jellylab-lockup.svg | mark + wordmark (needs Quicksand; use the PNG lockups if the font isn't available) |
| app-icon-1024.svg | square app icon artwork |

## png/
- **icon/** `icon-{16..1024}.png` square dark-tile icons + `maskable-512.png` (Android adaptive, 58% safe zone).
  - Web: `icon-192`, `icon-512`, `maskable-512`, `icon-180` (`apple-touch-icon`), `icon-32`/`icon-16` (`.ico` fallback).
  - iOS App Store: `icon-1024.png` (1024x1024, no alpha, no rounding — Xcode applies the mask).
- **macos/** `icon_16x16 … icon_512x512` — drop into `JellyLab.iconset` (add @2x copies of the next size up), then `iconutil -c icns`.
- **mark/** transparent mark PNGs, light and dark, 16–1024.
- **lockup/** `jellylab-lockup-light/dark.png` (+@2x) — docs headers, slides, email signatures.
- **social/** `github-social-preview-1280x640.png` (repo Settings → Social preview) · `readme-hero-1200x400.png` (top of README) · `wide-banner-1920x720.png` (landing page / App Store marketing hero).

## Docker Hub / GHCR
Repository logo: `png/icon/icon-256.png`. Org avatar: `png/icon/icon-1024.png`.

## Web snippet
```html
<link rel="icon" href="/svg/favicon.svg">
<link rel="apple-touch-icon" sizes="180x180" href="/png/icon/icon-180.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#0B1220">
```

## Don't
Stretch, rotate, recolour, add effects, or place the mark on brand blue.
