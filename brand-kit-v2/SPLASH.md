# Launch screen and splash animation

## The two-part pattern

An animated splash on iOS is always two things:

1. **`UILaunchScreen`** — a static storyboard the system renders *before your
   code runs*. It cannot animate. Ship `splash-still.svg` here.
2. **Your own animated view**, presented immediately on top of it.

Users read this as one continuous animated splash because the static frame and
the animation's resting frame are pixel-identical. That is the whole trick, and
it only works if the ground matches: **`#000B25`** on the launch screen, the
animated view, and the app surface behind it — the same value as the icon tile,
so the tile appears to open into the splash. Never use the `#000512` dark-
appearance value here: it would not match the icon the splash grew out of.

## Timeline

| At | For | What |
| --- | --- | --- |
| 0.00s | 420ms | Play triangle fades in from 0.86×, gradient-filled |
| 0.46s | 720ms | Bell irises out from **the triangle's own centre**, 546,467 |
| 0.54s | 200ms | Triangle flips to a knockout |
| 0.78s | 680ms | Veil rises 300u to the level line |
| 0.96s | 660ms | Level line draws outward from centre |
| 1.06s | 540ms | Wordmark up 9px |
| 1.24s | 580ms | Subtitle to 72% opacity |
| 1.50s | — | **Resting frame.** Identical to `splash-still.svg`. Hold here. |
| 1.62s | 260ms | Press — dips 3.8%, ring pushes out of the play hole |
| 1.92s | 2.6s | Swim — four pulses, then it exits |

Hold at 1.50s until the app is ready, then run the press and swim as the
transition out. That way the animation never gates startup: a slow launch just
holds a still, correct frame for longer.

## The swim

Four cycles of **contract → thrust → coast**, ~1.5 Hz, which is a real jellyfish
cadence.

- The bell's **outline morphs**; it is not a scaled copy sliding. Three warped
  variants of the same 25-point path — relaxed, contracted, flared — with
  identical command structure, so any renderer can interpolate them directly.
  Rim points move up to 20% inward; the apex barely moves.
- **Contract completes before displacement.** The thrust eases out of the
  squeeze. Reversing that order is what makes an animated logo look like a
  sliding sticker.
- The recoil **over-flares past** the resting outline before returning.
- Sway is **perpendicular to the heading**, ~20% of the travel distance. Below
  about 10% the eye reads a straight line.
- **Bank is derived from lateral velocity**, so the tilt leads each turn.
- Direction reverses only *between* pulses — a jelly can only steer by aiming
  the next squeeze.

## Porting notes

The three morph outlines share one command structure, so this ports natively —
a SwiftUI `Shape` with `animatableData` interpolating the point list, driven by
a `KeyframeAnimator`. The trajectory is generated from five numbers
(heading, sway, cycles, duration, distance) rather than authored keyframes, so
the heading stays a runtime parameter.

Lottie also works and is designer-editable, but it bakes in one heading. Avoid a
`WKWebView`: it puts web-view startup on your launch path, which is the one
thing a splash screen must not do.

## Reduced motion

Respect `UIAccessibility.isReduceMotionEnabled`: show the 1.50s resting frame
immediately and cross-fade to the app. Skip the press and the swim.
