# Changelog

Versions are tagged in git. The app reads its own number from `app.json`, shows
it under Profile → About, and sends it to Jellyfin, so an install can be
identified from the server's device list.

Pre-1.0 on purpose: Downloads works per item but has no eviction and no way to
take a whole season (`docs/downloads.md`), and 1.0 should mean the tabs all do
what they say.

## 0.16.0 — drawn by iOS, not imitated

Settings, Profile, the Downloads list and every empty state are real SwiftUI
now, through `@expo/ui`. They were hand-built imitations before: rounded cards,
rows with a tick, separators inserted between children, a progress bar drawn as
two Views, spacing chosen by eye. What replaced them is the control iOS already
has.

- **Settings** - Playback, Subtitles and Content are `Form`s with `Section`s,
  `Picker`s and a `Toggle`. Dynamic Type and VoiceOver come with them.
- **Profile** - one Form: `Label`s carrying SF Symbols, a value where a value
  belongs, storage as a real `ProgressView`, sign out as a destructive button.
- **Downloads** - a `List`: swipe a row to delete it, full-swipe to skip the
  aiming, and a `ProgressView` for what is still arriving.
- **Empty states** - `ContentUnavailableView` in Downloads, search and history.
- The rows read as Settings rows rather than as links, and the list draws on
  the app's own black instead of over it.

Alongside, on the way here:

- **Watch history** under Profile: what was finished, by day.
- **"Original" audio** resolves per title from what TMDB says it was made in -
  Japanese for anime, French for a French film - on both engines.
- Choosing the audio track works while transcoding, where the stream carries
  one track and the choice has to go back to the server.
- The download button fills as the file arrives, and stops it when pressed.
- The library offers what is on the phone when it cannot reach the server.
- CI runs types, lint and 120 tests on every push, and checks that a tag
  matches the version the app reports.

## 0.15.1 — picture in picture, found

- Leaving the app during an AVPlayer film now keeps it playing in a corner,
  which is what people mean by picture in picture. The button was only ever the
  explicit version of it.
- VLC has none, so the VLC overlay had no such button - which reads as broken
  rather than absent on a library that is mostly mkv. There is a dimmed one
  now, and it says what it needs: AVPlayer, which Settings can force.

## 0.15.0 — a season at a time, and a build that builds

- **Download a whole season.** One button above the episode list: it counts
  what is not already stored, adds up the size, and queues them one at a time -
  so the first episode is watchable while the rest are still arriving, instead
  of twenty transfers crawling together.
- **Fullscreen works.** The button locked an orientation the player's own
  screen did not allow, so iOS ignored it silently - no error, nothing in the
  log. Needs no rebuild.
- **`npx expo prebuild` works.** It was generating an Android project nobody
  has ever built, where the VLC plugin's Gradle hook fails against React Native
  0.86 - and taking `ios/` down with it, which made it look like an iOS
  problem. This app is iOS and web now, as far as prebuild is concerned.
- **Release dates were a day early** for anyone west of Greenwich: TMDB sends a
  bare date, and reading it as midnight UTC moves it. Found by the new CI on
  its first run, on a test that had passed here for weeks.
- **CI**: types, lint and tests on every push, and a check that a tag matches
  the version the app reports.

## 0.14.0 — watch it on a plane

The version where Downloads stopped being a placeholder. Pick an episode, put
it on the phone, turn everything off, and watch it - subtitles, artwork and
resume point included.

- **Downloads that work with nothing behind them.** A button on any film or
  episode that says how much room it needs before it starts, a tab that shows
  what is arriving and what has landed, and playback that quietly prefers the
  copy on the device - and now says so.
- **Subtitles and artwork stored beside the media**, so a downloaded episode
  keeps its subtitle picker with no server to ask.
- **The item screen works without a server**, drawn from what the download
  wrote down rather than after a fifteen second timeout.
- **The resume point survives the flight.** Kept on the device and handed to
  Jellyfin the moment it can be reached.
- **The library offers what is on the phone** when it cannot reach the server,
  instead of only saying it is unavailable.

## 0.13.1 — the offline path, actually walked

- A stored item is drawn from disk before the server is asked rather than after
  it times out, so opening a downloaded episode with no network is immediate
  instead of a fifteen second spinner.
- The item screen says when the copy on the device is the one that will play.
  It always preferred it; nothing said so.

## 0.13.0 — a download you can actually watch

- Subtitles and artwork are stored beside the media, so a downloaded episode
  keeps its subtitle picker with no server to ask. Files downloaded before this
  fall back to the server's list rather than showing an empty picker.
- The item screen falls back to what the download wrote down when the server
  cannot be reached, which is the first time a stored file has been reachable
  without one.
- Where you left off is written beside the media too, and anything the server
  missed waits in an outbox that drains the moment a request succeeds. Landing
  after a flight no longer rewinds the resume point.
- The audio picker ticked nothing when the file played its own default track -
  which is every one of these releases and their English dub.

## 0.12.0 — downloads, and a player that does what its settings say

- The Downloads tab holds files now: a button on any film or episode that
  asks before it starts and says how much room it needs, a list of what is
  arriving with a progress bar and a cancel, and what is stored with its size
  and a delete. Playback prefers the stored copy. Not offline playback yet -
  `docs/downloads.md` is honest about what is left.
- Press and hold a poster anywhere in the library for a peek at the item screen
  and a menu: play or resume, and mark watched. Watched posters carry a tick.
- "Always use AVPlayer" changed the engine but not the mode, so AVPlayer was
  handed an mkv it cannot open, failed, and the screen fell back to VLC without
  saying so. It asks the server for a transcode instead, which is the stream
  AVPlayer exists to play.
- Picture in picture called a method the player does not have; it is on the
  video view. The fullscreen button locked an orientation the binary never
  declared. Both need the rebuild this release implies.
- The player's subtitle, audio, track and speed pickers are native sheets, as
  the seasons and cast pickers already were - and all of them are now the one
  shape a form sheet can lay out, after several that it could not.
- Searching for a title with a comma, a colon or a plus in it returned nothing:
  axios leaves those unencoded and Jellyseerr rejects them. Encoded here now.
- A subtitle track that produced no text was silent about why. The log says
  what was fetched and how many cues came out of it, and the picker shows one
  tick instead of two.

## 0.11.0 — the platform's own furniture, in your own language

- iOS draws the tab bar now, not us: a SwiftUI TabView with the system's
  material and selection animation, and a search tab that hands its field to
  the bottom bar the way the App Store does.
- Lock the phone mid-episode and the lock screen shows the poster, the title
  and working controls, with the audio still playing. AVPlayer only; the VLC
  engine has no equivalent.
- The seasons and cast pickers are native sheets - grabber, drag-to-dismiss,
  and a height that fits what is in them.
- Metadata arrives in the app's language: titles, overviews and episode names
  come from TMDB in Dutch, Turkish or German where they exist, falling back to
  English rather than to nothing. Overviews render as text, not as the markup
  some of them are stored in.
- Every word the app writes itself is translated in all four languages -
  pills, buttons, alerts, player menus, settings - with dates as dd-mm-yyyy and
  times as hh:mm throughout. A test fails the build on a key that exists in one
  language and not the others.
- A show is called what it is: Series, Film or Anime, rather than everything
  with episodes being a series.
- Specials no longer count as a season, so Tokyo Ghoul says three.
- The request screen's hero stretches on a pull like the show page's, and its
  shade stays on the artwork instead of sliding off.
- Groundwork for Downloads: the store and the file handling, with no screen on
  top of it yet.

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
