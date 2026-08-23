# jellylab

iOS client for self-hosted Jellyfin + Jellyseerr. Browse your Jellyfin library, play something, or ask for what you don't have — all from one app.

Built with Expo Router (SDK 57), React Native 0.86, and TypeScript. iOS-first; Android builds but isn't polished.

## What it does

- **Library** — Apple TV-style layout: featured hero, Continue Watching row, one row per Jellyfin library. Header (page title + avatar) fades on scroll, status bar overlays the hero.
- **Item detail** — poster, backdrop, overview, cast, download-progress bars for in-flight Jellyseerr requests. Series show a season/episode picker.
- **Player** — custom overlay. AVPlayer for compatible files, VLC fallback for MKV/DTS/anime/whatever AVPlayer refuses. Engine picker in settings.
  - Scrubbing, ±10s skip, speed control, PiP, fullscreen with rotation lock
  - Embedded + external subtitle picker with size and language preferences
  - Watch progress reported to Jellyfin (start/progress/stopped)
  - AirPlay button (native) + Chromecast (Google Cast SDK — default receiver `CC1AD845`; register your own if you want a branded/custom-features receiver)
- **Search** — Jellyseerr TMDB search + Discover categories (Trending / Popular Movies / Popular TV / Anime / Upcoming). Tap a card for TMDB detail. Admins can delete requests or remove media from Jellyfin (Radarr/Sonarr file wipe).
- **Requests** — pull-to-refresh with human-readable status + admin actions.
- **Profile** — Apple TV-style grouped list. Change display name, password, avatar (camera / library / remove). Preferences: subtitles, playback, content (adult toggle), language. Admin shortcuts to Jellyfin/Jellyseerr dashboards when signed in as admin.
- **Servers** — add/edit/delete/switch multiple Jellyfin+Jellyseerr pairs from Profile → Servers. Switching signs you out and re-prompts login for the new server. No server URLs baked in the app.
- **i18n** — English, Dutch, Turkish, German. Auto-detects device language; override in Profile → Language.

## Requirements

- Node.js 20+ and npm 10+
- macOS with Xcode 15+ for local iOS builds. Windows can use [EAS Build](https://docs.expo.dev/build/introduction/).
- Apple Developer account ($99/yr) for TestFlight distribution or long-lived on-device installs.
- A running Jellyfin server and a running Jellyseerr server with your Jellyfin account imported (Jellyseerr → Settings → Users → Import from Jellyfin).
- The device must resolve and reach the Jellyfin/Jellyseerr hostnames — LAN or mesh VPN (NetBird / Tailscale) with DNS routing pointing your internal domain at a local resolver.
- Chromecast (optional): register your own receiver in the [Cast Developer Console](https://cast.google.com/publish/) and swap `iosReceiverAppId` in `app.json` if you want per-app receiver features. The default `CC1AD845` is Google's public media receiver and works out of the box.

## Configuration

No server URLs are compiled in. On first launch the app prompts you to add a server (name + Jellyfin URL + Jellyseerr URL). Server data lives in `expo-secure-store`; you can manage multiple servers and switch between them from Profile → Servers.

`config.ts` only holds client identity (name, version, device name string used in Jellyfin's session list).

## Setup

```bash
git clone git@github.com:furkanturkmen/jellylab.git
cd jellylab
npm install
```

## Running

Native modules (`expo-secure-store`, `expo-video`, `react-native-vlc-media-player`, `react-native-google-cast`, `expo-image-picker`, `expo-screen-orientation`) are **not compatible with Expo Go**. You need a development build.

### Local iOS build (macOS)

```bash
npx expo prebuild --platform ios --clean
npx expo run:ios --device
```

First prebuild is slow (~5 min) because VLCKit is ~50 MB. Rebuilds are fast unless native config changes.

### Cloud build (Windows)

```bash
npm install -g eas-cli
eas login
eas build --profile development --platform ios
```

Install the `.ipa` via TestFlight or Xcode → Devices.

### Development server

```bash
npm start
```

Open the app on the phone — it connects to Metro over the same wifi.

## Project structure

```
app/                    Expo Router routes (file-based)
  (tabs)/               Bottom tab screens (library, search, requests)
  item/[id].tsx         Item detail + custom player (~1500 lines)
  tmdb/[id].tsx         Jellyseerr/TMDB detail (search results)
  profile.tsx           Profile + preferences + admin
  servers.tsx           Server list + switch/edit/delete
  server-edit.tsx       Add/edit server form
  settings/             Subtitles, playback, content, language, password
  login.tsx             Auth (Jellyfin credentials, via Jellyseerr for session)
  _layout.tsx           Root layout with auth + server guard
api/                    Jellyfin + Jellyseerr HTTP clients (read base URL from server store)
components/             Themed UI primitives
config.ts               Client identity only — server URLs come from the store
hooks/                  useAuth, useServer (both pub/sub for cross-screen refresh)
i18n/                   4 languages (en, nl, tr, de) + init
player/                 Codec-based engine selection + VTT parser
store/                  auth.ts, servers.ts, prefs.ts (expo-secure-store)
theme/                  Abyss design tokens (colors, spacing, type)
types/                  Shared TypeScript types
```

## Known limitations

- **Direct-play depends on your server.** If your Jellyfin host can't transcode, VLC fallback handles most codec issues but corrupt/exotic files can still fail with no auto-recovery.
- **No downloads / no offline mode.** Every play is a live stream.
- **Plain HTTP allowed by default.** `NSAllowsArbitraryLoads` is enabled in `app.json` because most homelabs run HTTP behind a reverse proxy on the LAN. If you only connect to HTTPS servers, tighten it.
- **iPhone-only layout.** iPad renders as a stretched iPhone.
- **No live TV / no music library** (Jellyfin has them, jellylab doesn't surface them).

## Roadmap

Ordered by realistic priority — small wins first, bigger platform work later.

**Next up (small, ships soon)**
1. Watch history screen (finished items, separate from Continue Watching)
2. In-app "Sign out from all servers" quick action
3. Better error surfaces when a server URL is unreachable (currently opaque)

**Mid-term (medium effort, high value)**
4. Downloads / offline playback (needs codec-aware file cache + player fallback for local file:// URLs)
5. iPad-friendly split layout (sidebar + detail pane; adaptive from 768pt)
6. Home Screen Widget (Continue Watching)
7. Push notifications for request approval / media available (needs APNS + Jellyseerr webhook bridge)

**Platform expansion (larger scope)**
8. Music library browsing + playback
9. Live TV (guide + tuner)
10. Android polish pass (tabs, navigation, Cast native integration)
11. tvOS build (Apple TV target — same Jellyfin API, different UI conventions)

## License

MIT, from the Expo template baseline. See [LICENSE](./LICENSE).
