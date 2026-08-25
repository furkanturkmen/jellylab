# Changelog

Versions are tagged in git. The app reads its own number from `app.json`, shows
it under Profile → About, and sends it to Jellyfin, so an install can be
identified from the server's device list.

Pre-1.0 on purpose: Downloads works per item but has no eviction and no way to
take a whole season (`docs/downloads.md`), and 1.0 should mean the tabs all do
what they say.

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
