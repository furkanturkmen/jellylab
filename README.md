<p align="center">
  <img src="brand/png/social/wide-banner-1920x720.png" width="100%" alt="JellyLab — browse, play, request">
</p>

Built with Expo Router (SDK 57), React Native 0.86, and TypeScript. iOS-first; Android builds but isn't polished.

## What it does

- **Library** — Apple TV-style layout: featured hero, Continue Watching row, one row per Jellyfin library. Header (page title + avatar) fades on scroll, status bar overlays the hero.
- **Item detail** — poster, backdrop, overview, cast, download-progress bars for in-flight Jellyseerr/Seerr requests. Series show a season/episode picker.
- **Player** — custom overlay. AVPlayer for compatible files, VLC for MKV/DTS/anime/whatever AVPlayer refuses. Engine picker in settings; forcing AVPlayer on a file it can't open asks the server to transcode rather than failing.
  - Scrubbing, ±10s skip, speed control, PiP, fullscreen with rotation lock
  - Subtitle, audio, track and speed pickers as native sheets
  - Embedded + external subtitle picker with size, language and timing preferences
  - Lock-screen Now Playing with artwork, and audio that keeps going when the screen does not (AVPlayer path)
  - Watch progress reported to Jellyfin (start/progress/stopped), queued and re-sent when watched offline
  - AirPlay button (native) + Chromecast (Google Cast SDK — uses the public default media receiver; register your own for custom branding)
- **Search** — Seerr (Jellyseerr fork) TMDB search + Discover categories (Trending / Popular Movies / Popular TV / Anime / Upcoming). Tap a card for TMDB detail. Admins can delete requests or remove media from Jellyfin (Radarr/Sonarr file wipe).
- **Requests** — pull-to-refresh with human-readable status + admin actions.
- **Downloads** — put a film or episode on the phone and watch it with nothing behind it. The button says how much room it needs before it starts; the tab shows what is arriving with progress and a cancel, what has landed with its size and a delete. Subtitles and artwork are stored beside the media, the item screen draws from disk when the server cannot be reached, and the resume point is kept locally and handed to Jellyfin the moment it can be.
- **Profile** — Apple TV-style grouped list. Change display name, password, avatar (camera / library / remove). Preferences: subtitles, playback, language. Admin shortcuts to Jellyfin/Seerr dashboards when signed in as admin. Servers section for managing multiple homelab pairs.
- **The platform's own furniture** — iOS draws the tab bar (SwiftUI TabView) and puts the search field in the bottom bar on iOS 26. Press and hold any poster for a peek at the item screen and a menu: play or resume, mark watched. Pickers and season lists are native sheets.
- **Servers** — add/edit/delete/switch multiple Jellyfin+Jellyseerr pairs from Profile → App → Servers. Switching signs you out and re-prompts login for the new server. Server-edit screen has a "Test connection" button that pings both endpoints before you save. No server URLs baked in the app.
- **i18n** — English, Dutch, Turkish, German. Auto-detects device language; override in Profile → Language.

## Requirements

- Node.js 20+ and npm 10+
- macOS with Xcode 15+ for local iOS builds. Windows can use [EAS Build](https://docs.expo.dev/build/introduction/).
- Apple Developer account ($99/yr) for TestFlight distribution or long-lived on-device installs.
- A running Jellyfin server and a running [Seerr](https://github.com/seerr-team/seerr) (Jellyseerr fork, ships as `ghcr.io/seerr-team/seerr:latest`) or Jellyseerr instance with your Jellyfin account imported (Users → Import from Jellyfin).
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

`scripts/metro-dev.sh` runs it under tmux instead, ships the output to another
machine and relays keystrokes back, so the console can be read and driven over
ssh from anywhere:

```bash
scripts/metro-dev.sh start     # or status | stop
```

It pins the port. Expo takes 8081 when free and quietly moves to 8082 when not,
so a stray bundler — or the one `expo run:ios` starts for itself — can end up
owning the port the dev client was built against, and then `r` reloads a Metro
nobody is watching. The script refuses to start beside a stray rather than
moving out of its way, and `status` says how many bundler ports are in use.

Settings come from `~/.metro-dev.env`, which is not in the repo:

```bash
REPO=$HOME/path/to/jellylab
HOMELAB=192.168.1.10
SSH_USER=you
PORT=8081
```

### Browser preview

The app can also be bundled for a desktop browser, which is enough to look at
screens and states without a Mac or a phone in the loop. It needs three
gitignored files, because none of it should shape what ships:

| File | Why |
|------|-----|
| `metro.config.js` | Resolves the native-only modules to stand-ins on web: `expo-secure-store`, VLC, Cast |
| `web-shims/` | Those stand-ins. SecureStore becomes `localStorage`; the player and Cast render nothing |
| `app.config.js` | Sets `web.output` to `single`. The shipped `static` prerenders every route in node, which dies reading SecureStore before a screen exists |

```bash
npx expo start --web
```

Two things behave differently from the phone:

- **Jellyfin** is fine — it sends `Access-Control-Allow-Origin: *`.
- **Jellyseerr** sends no CORS headers and answers preflights with `405`, so a
  browser refuses every response even though the same URL loads in a tab. The
  headers have to be added at the reverse proxy; the setup this was built
  against does it in nginx-proxy-manager. Signing in also relies on
  `withCredentials` (`api/jellyseerr.ts`), since browsers drop the `Cookie`
  header the native path sets by hand.

## Project structure

```
app/                    Expo Router routes (file-based)
  (tabs)/               Bottom tab screens (library, search, requests, downloads)
  (tabs)/_layout.tsx    Custom floating pill tab bar (Reanimated transitions)
  item/[id].tsx         Item detail + custom player (~1500 lines)
  tmdb/[id].tsx         Seerr/TMDB detail (search results)
  profile.tsx           Profile + preferences + admin + servers link
  servers.tsx           Server list + switch/edit/delete
  server-edit.tsx       Add/edit server form + connection test
  settings/             Subtitles, playback, content, language, password
  login.tsx             Auth (Jellyfin credentials, via Seerr for session)
  _layout.tsx           Root layout with auth + server guard (dismisses modals on nav)
api/                    Jellyfin + Seerr/Jellyseerr HTTP clients (read base URL from server store)
                        push.ts talks to the jellylab-push bridge on the homelab
components/             Themed UI primitives (TabHeader for scroll-fade page titles)
config.ts               Client identity only — server URLs come from the store
hooks/                  useAuth, useServer (both pub/sub for cross-screen refresh)
i18n/                   4 languages (en, nl, tr, de) + init
player/                 Codec-based engine selection + VTT parser
plugins/                Local Expo config plugins (strips the push entitlement)
store/                  auth.ts, servers.ts, prefs.ts, search.ts (expo-secure-store + in-memory pub/sub)
theme/                  Abyss design tokens (colors, spacing, type)
types/                  Shared TypeScript types
```

## Rebuilding the native project

```bash
npm run prebuild      # expo prebuild -p ios - only when native config changes
npm run ios           # simulator
npm run ios:device    # a connected iPhone, from anywhere
```

`prebuild` is only needed when something native moves: a new native dependency,
an `app.json` plugin or Info.plist key, or a missing `ios/`. JavaScript changes
need a reload, and a version bump is synced into Info.plist by the build itself.

`ios:device` exists because code signing needs the login keychain, and that
belongs to the graphical session: run `expo run:ios` over ssh and it builds for
several minutes before dying at the signing step with
`errSecInternalComponent` and exit 65, which says nothing about keychains.

The script asks the keychain whether this session can sign - the environment
lies, a shell can arrive through a relay without `SSH_CONNECTION`. When it
cannot, the Mac's own Terminal starts the build inside a tmux session and this
side attaches to it, so the build runs where it can sign while staying
interactive: prompts are answerable, ctrl-c reaches it, `ctrl-b d` detaches and
leaves it building. Run it again from anywhere to reattach.

iOS only, and deliberately. `expo.platforms` is `["ios", "web"]`, so prebuild
does not generate an Android project — which matters because
`react-native-vlc-media-player`'s Android config plugin patches
`app/build.gradle` by matching `applyNativeModulesAppBuildGradle(project)`, a
line React Native 0.86 no longer generates: autolinking moved to
`autolinkLibrariesWithApp()`. Prebuild clears both native directories before it
runs the mods, so that failure used to take `ios/` down with it and read as an
iOS problem. Android needs the plugin fixed upstream, or dropping VLC.

## Known limitations

- **Direct-play depends on your server.** If your Jellyfin host can't transcode, VLC fallback handles most codec issues but corrupt/exotic files can still fail with no auto-recovery.
- **Downloads are per item.** No whole-season download and no eviction policy yet: what you store stays until you delete it.
- **Plain HTTP allowed by default.** `NSAllowsArbitraryLoads` is enabled in `app.json` because most homelabs run HTTP behind a reverse proxy on the LAN. If you only connect to HTTPS servers, tighten it.
- **iPhone-only layout.** iPad renders as a stretched iPhone.
- **Android cannot be prebuilt** while the VLC plugin's Gradle mod targets a
  React Native version this project has moved past — see above.
- **No live TV / no music library** (Jellyfin has them, jellylab doesn't surface them).
- **Push notifications need a paid Apple Developer account.** Apple only issues
  the `aps-environment` entitlement to Developer Program members, and all iOS
  background push goes through APNS. On a free personal team `xcodebuild`
  refuses to build with it at all, so `plugins/withoutPushEntitlement.js`
  strips it. The app and its server-side bridge are finished — see below.

## Roadmap

Ordered by realistic priority — small wins first, bigger platform work later.

**Recently shipped**
- Downloads that work offline: stored media, subtitles and artwork, an item screen that draws with no server, and a resume point that survives the flight
- iOS draws the tab bar and the search field; posters answer a long press with a peek and a menu; the player's pickers and the season list are native sheets
- Metadata in the language the app is set to, with every string the app writes itself translated in four languages and a test that keeps the files in step
- Library hero is a 5-item carousel drawn from what you're part-way through and what arrived recently, cross-fading, with a pinned backdrop that stretches on pull instead of leaving a gap
- Notifications screen wired to a self-hosted push bridge — complete but gated on the Apple entitlement above; the same events reach you through the ntfy app meanwhile
- Search your own Jellyfin library alongside Seerr/TMDB — owned titles surface first with Play, everything else falls under Request
- Max streaming quality setting: above the chosen ceiling the server transcodes to HLS, below it the file is direct played untouched
- Runtime server management (add / edit / delete / switch, no baked-in URLs, connection test)
- Shared TabHeader (scroll-fade page titles) on every tab
- Custom player overlay in Abyss style with per-engine glass controls
- Watch progress sync to Jellyfin
- Season / episode picker for TV
- Chromecast + AirPlay
- 4-language i18n (en / nl / tr / de)

**Next up (small, ships soon)**
1. Watch history screen (finished items, separate from Continue Watching)
2. Friendlier error surfaces when a server URL is unreachable (currently mostly axios raw)
3. Per-server saved credentials (skip re-login on switch — currently signs out)
4. Auto-select the quality ceiling on cellular (needs `expo-network`; today it's a manual setting)
5. Turn on push once there's a paid Apple account — delete `plugins/withoutPushEntitlement.js` from `app.json`, `prebuild --clean`, rebuild. No code changes

**Mid-term (medium effort, high value)**
5. Downloads: a whole season in one go, and an eviction policy once there is a real number to base one on
6. iPad-friendly split layout (sidebar + detail pane; adaptive from 768pt)
7. Home Screen Widget (Continue Watching)
8. Push notifications for request approval / media available (needs APNS + Seerr webhook bridge)

**Platform expansion (larger scope)**
9. Music library browsing + playback
10. Live TV (guide + tuner)
11. Android polish pass (tabs, navigation, Cast native integration, VLC parity)
12. tvOS build (Apple TV target — same Jellyfin API, different UI conventions)

## License

MIT, from the Expo template baseline. See [LICENSE](./LICENSE).
