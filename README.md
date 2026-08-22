# jellylab

iOS client for a personal homelab. Combines a Jellyfin media browser and player with Jellyseerr request search, so you can browse your library, play something, or ask for what you don't have — all from one app.

Built with Expo Router (SDK 57), React Native 0.86, and TypeScript. Targets iOS first; Android should work but is not the focus.

## What it does

- **Library** — lists your Jellyfin movies and TV libraries as horizontal poster rows.
- **Item detail** — poster, backdrop, overview, Play button.
- **Playback** — uses `expo-video` (AVPlayer) for MP4/H.264/HEVC, automatically falls back to `react-native-vlc-media-player` for MKV, DTS, VP9, AV1, and other containers/codecs AVPlayer refuses. If native playback errors mid-stream, it live-swaps to VLC.
- **Search** — Jellyseerr TMDB search with per-result Request buttons. Shows Available/Requested badges when Jellyseerr already tracks the media.
- **Requests** — pull-to-refresh list of your requests with human-readable status.

## Requirements

- Node.js 20+ and npm 10+.
- macOS with Xcode 15+ if you want to build for iOS locally. If you're on Windows, use [EAS Build](https://docs.expo.dev/build/introduction/) for cloud iOS builds.
- An Apple Developer account ($99/yr) for TestFlight distribution or on-device installs beyond the free 7-day sideload window.
- A running Jellyfin server and a running Jellyseerr server that has your Jellyfin account imported (Jellyseerr → Settings → Users → Import from Jellyfin).
- The device you install the app on must be able to resolve and reach your Jellyfin/Jellyseerr hostnames — either on the LAN, or through a mesh VPN like NetBird/Tailscale with DNS routing configured to point `homelab.internal` at your local DNS (Pi-hole in my case).

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

If your servers live at different hostnames, edit those two URLs. If they run over HTTPS with a valid certificate, you can also remove the iOS ATS exception block in `app.json` — it's only there because my setup uses plain HTTP behind an NPM reverse proxy on the LAN.

## Setup

```bash
git clone git@github.com:furkanturkmen/jellylab.git
cd jellylab
npm install
```

Then edit `config.ts` with your server hostnames.

## Running

The app uses native modules (`expo-secure-store`, `expo-video`, `expo-image`, `react-native-vlc-media-player`) that are **not compatible with Expo Go**. You need a development build.

### Option A — Local iOS build (macOS)

```bash
npx expo prebuild --platform ios --clean
npx expo run:ios
```

First prebuild takes ~5 minutes because VLCKit is large (~50 MB). Subsequent runs are fast.

### Option B — Cloud build (Windows or macOS)

```bash
npm install -g eas-cli
eas login
eas build --profile development --platform ios
```

Install the resulting `.ipa` on your device via TestFlight or by dragging into Xcode's Devices window.

### Development server

Once the dev build is on your device, start the Metro bundler from your dev machine:

```bash
npm start
```

Open the app on your phone — it will connect to Metro over the same wifi network.

## Project structure

```
app/                    Expo Router routes (file-based)
  (tabs)/               Bottom tab screens (library, search, requests)
  item/[id].tsx         Item detail + player
  login.tsx             Auth screen (Jellyfin credentials)
  _layout.tsx           Root layout with auth guard
api/                    Jellyfin + Jellyseerr HTTP clients (axios)
components/             Themed UI primitives from the Expo template
config.ts               Server URLs and client identity
constants/              Color scheme
hooks/                  useAuth (sign in / out state)
player/                 Codec-based engine selection (native vs VLC)
store/                  Persistent auth storage (expo-secure-store)
types/                  Shared TypeScript types
```

## Known limitations

- **Direct-play only.** The homelab this was built for runs Jellyfin on hardware with no working transcoder (Intel HD 4000). Everything plays as raw file bytes; nothing is re-encoded server-side. The VLC fallback handles most codec-unsupported cases, but if a file is corrupt or its container is exotic, playback will fail with no automatic recovery.
- **No downloads / no offline mode.** Every play is a live stream from the server. Losing the connection drops playback.
- **Plain HTTP.** By default the app talks to `http://*.homelab.internal` over the LAN or through NetBird. iOS ATS is configured to allow that specific domain. If you expose your homelab publicly, put it behind HTTPS and remove the ATS exception.
- **No Chromecast / AirPlay integration** beyond what iOS Picture-in-Picture provides.
- **Watch position** is not synced back to Jellyfin yet.

## Roadmap

- Continue Watching row on the Library screen (Jellyfin `/Users/{id}/Items/Resume` already wired in the API layer, just not surfaced).
- Season/episode picker for TV shows.
- Progress sync back to Jellyfin.
- Downloads / offline playback.
- iPad-friendly layout.

## License

MIT, from the Expo template baseline. See [LICENSE](./LICENSE).
