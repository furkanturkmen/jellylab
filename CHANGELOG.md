# Changelog

Versions are tagged in git. The app reads its own number from `app.json`, shows
it under Profile → About, and sends it to Jellyfin, so an install can be
identified from the server's device list.

Pre-1.0 on purpose: Downloads is planned but unbuilt (`docs/downloads.md`), and
1.0 should mean the tabs all do what they say.

## 0.10.0 — diagnostics, and a library worth browsing

- Every failure says what it was: `[jellylab]` error logging into the Metro
  console, an error state on the Library instead of a blank shelf, and a lost
  Jellyseerr session told apart from an unreachable server.
- Library rows are newest-first with the real library total beside them; each
  one opens a paged screen of everything in it.
- One Continue Watching card per series, not one per unfinished episode.
- Heroes and detail artwork come from TMDB's originals, with the server's own
  images as fallback.
- The VLC engine reported position 0 on exit and almost never reported
  progress; both fixed, so mkv playback keeps its resume point.
- Tooling: eslint with the hooks rule that would have caught two crashes,
  forty tests over the pure logic, a pinned Metro port, and this changelog.

## 0.9.0 — the brand

The JellyLab mark and palette through every surface: icon, splash, login,
empty states.

## 0.8.0 — requests that show their state

Live download percentage, which seasons a request covers, and season artwork
behind each card.

## 0.7.0 — notifications

Native notifications when something finishes, without a second app to install.

## 0.6.0 — the player, properly

Custom overlay on both engines, subtitle and audio pickers, drag scrubbing,
speed, fullscreen, resume, and VLC brought to parity with the native path.

## 0.5.0 — four languages

English, Dutch, Turkish and German, from the device language and overridable in
settings.

## 0.4.0 — profile, settings and Cast

Account screen, settings groups, and Chromecast beside the play button.

## 0.3.0 — discovery and requests

TMDB detail screens, request cards, download progress and admin actions,
through Jellyseerr.

## 0.2.0 — playback

Item detail with expo-video, and the VLC fallback for what AVPlayer cannot
open — which is most of the anime library.

## 0.1.0 — tabs and auth

Sign in to Jellyfin, with Library, Search and Requests behind that gate.
Nothing played yet.
