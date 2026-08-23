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
  - AirPlay button (native) + Chromecast (Google Cast SDK — uses the public default media receiver; register your own for custom branding)
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
- Chromecast (optional): the app ships with Google's public default media receiver so casting works out of the box. If you want a branded receiver or Cast-side custom features, register one in the [Cast Developer Console](https://cast.google.com/publish/) and set `iosReceiverAppId` in `app.json` locally (do not commit your ID).

## Configuration

Nothing server-specific is compiled into the app. On first launch you're prompted to add a server (name + Jellyfin URL + Jellyseerr URL). All server data is user-provided at runtime.

`config.ts` only holds client identity (name, version, device name string used in Jellyfin's session list).

## Security & storage

- **Server URLs** — entered by the user, stored in `expo-secure-store` (`servers_list`, `current_server_id`). Not embedded in the app or committed to the repo.
- **Passwords** — never stored. Sent once to Jellyfin's `/Users/AuthenticateByName` in exchange for an access token.
- **Access token** (Jellyfin) and **session cookie** (Jellyseerr) — stored in `expo-secure-store`. Cleared on sign-out, server switch, or server delete.
- **No API keys, secrets, or tokens are committed** anywhere in this repo. Grep it if you like.
- **Cast receiver** — `app.json` ships with Google's public default media receiver. Register your own in the [Cast Developer Console](https://cast.google.com/publish/) and override `iosReceiverAppId` locally if you want a branded receiver; don't commit your ID.
- **iOS ATS** — `NSAllowsArbitraryLoads` is on so the app works with plain-HTTP homelab servers. If you only ever connect to HTTPS servers with valid certs, tighten it in `app.json` before shipping.

## Setup

```bash
git clone <this-repo-url>
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

**Recently shipped**
- Runtime server management (add / edit / delete / switch, no baked-in URLs)
- Custom player overlay in Abyss style with per-engine glass controls
- Watch progress sync to Jellyfin
- Season / episode picker for TV
- Chromecast + AirPlay
- 4-language i18n (en / nl / tr / de)
- Apple TV-style Library header with scroll-fade + status-bar overlay

**Next up (small, ships soon)**
1. Watch history screen (finished items, separate from Continue Watching)
2. Friendlier error surfaces when a server URL is unreachable (currently mostly axios raw)
3. Per-server saved credentials (skip re-login on switch — currently signs out)
4. Search inside your own Jellyfin library (currently search only hits Jellyseerr/TMDB)

**Mid-term (medium effort, high value)**
5. Downloads / offline playback (needs codec-aware file cache + player fallback for local file:// URLs)
6. iPad-friendly split layout (sidebar + detail pane; adaptive from 768pt)
7. Home Screen Widget (Continue Watching)
8. Push notifications for request approval / media available (needs APNS + Jellyseerr webhook bridge)

**Platform expansion (larger scope)**
9. Music library browsing + playback
10. Live TV (guide + tuner)
11. Android polish pass (tabs, navigation, Cast native integration, VLC parity)
12. tvOS build (Apple TV target — same Jellyfin API, different UI conventions)

## License

MIT, from the Expo template baseline. See [LICENSE](./LICENSE).
