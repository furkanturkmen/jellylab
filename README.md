# jellylab

iOS client for a personal homelab. Combines a Jellyfin media browser and player with Jellyseerr request search, so you can browse your library, play something, or ask for what you don't have — all from one app.

Built with Expo Router (SDK 57), React Native 0.86, and TypeScript. iOS-first; Android builds but isn't polished.

## What it does

- **Library** — Apple TV-style layout: featured hero, Continue Watching row, one row per Jellyfin library. Header (page title + avatar) fades on scroll, status bar overlays the hero.
- **Item detail** — poster, backdrop, overview, cast, download-progress bars for in-flight Jellyseerr requests. Series show a season/episode picker.
- **Player** — custom overlay in the Abyss style. AVPlayer for compatible files, VLC fallback for MKV/DTS/anime/whatever AVPlayer refuses. Engine picker in settings if you want to force VLC.
  - Scrubbing, ±10s skip, speed control, PiP, fullscreen with rotation lock
  - Embedded + external subtitle picker with size and language preferences
  - Watch progress reported to Jellyfin (start/progress/stopped)
  - AirPlay button (native) + Chromecast (Google Cast SDK, receiver `A3C83748`)
- **Search** — Jellyseerr TMDB search + Discover categories (Trending / Popular Movies / Popular TV / Anime / Upcoming). Tap a card for TMDB detail. Admins can delete requests or remove media from Jellyfin (Radarr/Sonarr file wipe).
- **Requests** — pull-to-refresh with human-readable status + admin actions.
- **Profile** — Apple TV-style grouped list. Change display name, password, avatar (camera / library / remove). Preferences: subtitles, playback, content (adult toggle), language. Admin shortcuts to Jellyfin/Jellyseerr dashboards when signed in as admin.
- **i18n** — English, Dutch, Turkish, German. Auto-detects device language; override in Profile → Language.

## Requirements

- Node.js 20+ and npm 10+
- macOS with Xcode 15+ for local iOS builds. Windows can use [EAS Build](https://docs.expo.dev/build/introduction/).
- Apple Developer account ($99/yr) for TestFlight distribution or long-lived on-device installs.
- Running Jellyfin server and running Jellyseerr server with your Jellyfin account imported (Jellyseerr → Settings → Users → Import from Jellyfin).
- Device must resolve and reach the Jellyfin/Jellyseerr hostnames — LAN or mesh VPN (NetBird / Tailscale) with DNS routing pointing `homelab.internal` at your local resolver (Pi-hole here).
- Chromecast: Google Cast SDK receiver app ID must be registered in the [Cast Developer Console](https://cast.google.com/publish/) and your TV serial added for testing. The current registered ID is `A3C83748`.

## Configuration

Server URLs live in [`config.ts`](./config.ts):

```ts
export const CONFIG = {
  JELLYFIN_URL: 'http://jellyfin.homelab.internal',
  JELLYSEERR_URL: 'http://jellyseerr.homelab.internal',
  CLIENT_NAME: 'jellylab',
  CLIENT_VERSION: '1.0.0',
  DEVICE_NAME: 'iPhone',
};
```

If your servers use HTTPS with valid certificates, remove the iOS ATS exception in `app.json`.

## Setup

```bash
git clone git@github.com:furkanturkmen/jellylab.git
cd jellylab
npm install
```

Edit `config.ts` with your server hostnames.

## Running

Native modules (`expo-secure-store`, `expo-video`, `react-native-vlc-media-player`, `react-native-google-cast`, `expo-image-picker`, `expo-screen-orientation`) are **not compatible with Expo Go**. You need a development build.

### Local iOS build (macOS)

```bash
npx expo prebuild --platform ios --clean
npx expo run:ios --device
```

First prebuild is slow (~5 min) because VLCKit is ~50 MB. Rebuilds are fast unless you change native config.

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
  settings/             Subtitles, playback, content, language screens
  login.tsx             Auth (Jellyfin credentials, via Jellyseerr for session)
  _layout.tsx           Root layout with auth guard
api/                    Jellyfin + Jellyseerr HTTP clients
components/             Themed UI primitives
config.ts               Server URLs + client identity
hooks/useAuth.ts        Sign in / out state with cross-screen refresh (pub/sub)
i18n/                   4 languages (en, nl, tr, de) + init
player/                 Codec-based engine selection + VTT parser
store/                  Persistent auth + prefs (expo-secure-store)
theme/                  Abyss design tokens (colors, spacing, type)
types/                  Shared TypeScript types
```

## Known limitations

- **Direct-play only.** The homelab this was built for has no working transcoder (Intel HD 4000). Everything plays as raw file bytes. VLC fallback covers most codec issues, but corrupt/exotic files can still fail with no auto-recovery.
- **No downloads / no offline mode.** Every play is a live stream. Losing the connection stops playback.
- **Plain HTTP.** App talks to `http://*.homelab.internal` over LAN or via NetBird. iOS ATS is configured to allow that domain only. Public exposure needs HTTPS.
- **iPhone-only layout.** iPad renders as a stretched iPhone; no split-view or larger-target layout yet.
- **No live TV / no music library** (Jellyfin has them, jellylab doesn't surface them).

## Roadmap

- Downloads / offline playback
- iPad-friendly split layout
- Music library browsing
- Live TV (guide + tuner)
- Watch history screen (finished items, not just resume)
- Home Screen Widget (Continue Watching)

## License

MIT, from the Expo template baseline. See [LICENSE](./LICENSE).
