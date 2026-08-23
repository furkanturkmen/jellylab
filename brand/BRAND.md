# JellyLab — brand kit handoff

iOS client for self-hosted **Jellyfin + Jellyseerr**.

## Mark
A conical lab flask built from the Jellyfin rounded triangle. Inside: a part-full gradient liquid with
a wavy surface and rising bubbles, and one eye — white sclera, lavender iris, and a **play button as the
pupil** with a crescent bite taken out of its top-left corner. Neck and lip sit on top of the triangle.

## Colour
| token | hex | use |
|---|---|---|
| Jelly Purple | `#AA5CC3` | gradient start |
| Jelly Blue | `#00A4DC` | gradient end |
| Iris Lavender | `#C9B8F0` | iris |
| Deep Ink | `#0B2545` | pupil, wordmark |
| Sclera | `#F4F1FB` | eye white, light surfaces |
| Night | `#0B1220` | dark UI / icon tile |

Gradient runs top-left → bottom-right. On dark backgrounds brighten to `#C77BDE → #3AB7E8`.

## Type
**Quicksand Bold (700)**, tracking −1%. "Jelly" in Deep Ink, "Lab" in the gradient (or `#5FC4EC` on dark).
Secondary/meta: JetBrains Mono 600, uppercase, tracking +0.12em.
Mark height = 2× cap height. Gap between mark and wordmark = ½ mark width.

## Rules
- Clear space = one flask-neck width (¼ of the mark's width) on all sides.
- Minimum mark 24px. Minimum lockup 96px wide.
- Detail tiers: ≥128px full · 64px drops bubbles + catchlight · ≤32px flat waterline, whole play pupil.
- Never stretch, rotate, recolour, add effects, or place the mark on brand blue.

## Files

```
assets/
├── BRAND.md                 this file
├── USAGE.md                 per-file usage + web snippets
├── site.webmanifest         PWA manifest (icons wired up)
├── svg/
│   ├── jellylab-mark.svg          primary, light backgrounds
│   ├── jellylab-mark-dark.svg     primary, dark backgrounds
│   ├── jellylab-icon-64.svg       pre-simplified 64px tier
│   ├── jellylab-icon-32.svg       pre-simplified ≤32px tier
│   ├── favicon.svg                <link rel="icon">
│   ├── jellylab-mono.svg          one colour, inherits currentColor
│   ├── jellylab-lockup.svg        mark + wordmark (needs Quicksand)
│   └── app-icon-1024.svg          square app icon artwork
└── png/
    ├── icon/     icon-16 … icon-1024, maskable-512
    ├── macos/    icon_16x16 … icon_512x512  (→ .iconset → iconutil -c icns)
    ├── mark/     transparent mark, light + dark, 16 … 1024
    ├── lockup/   light / dark, @1x + @2x  (920×240)
    └── social/   github-social-preview-1280x640
                  readme-hero-1200x400
                  wide-banner-1920x720
```

## Wiring it up

**Xcode (iOS)** — `png/icon/icon-1024.png` into the AppIcon slot (no alpha, no rounding; Xcode masks it).
In-app glyphs: `svg/jellylab-mono.svg` tinted with your accent colour, or the mark PNGs from `png/mark/`.

**Web / docs**
```html
<link rel="icon" href="/svg/favicon.svg">
<link rel="apple-touch-icon" sizes="180x180" href="/png/icon/icon-180.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#0B1220">
```

**README**
```markdown
<p align="center"><img src="assets/png/social/readme-hero-1200x400.png" width="640" alt="JellyLab"></p>
```

**GitHub** — Settings → Social preview: `png/social/github-social-preview-1280x640.png`.
Org avatar: `png/icon/icon-1024.png`. **Docker Hub** repo logo: `png/icon/icon-256.png`.
